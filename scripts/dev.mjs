import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'
import path from 'node:path'
import fs from 'node:fs'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const userUvCommand = path.join(process.env.HOME ?? '', '.local', 'bin', 'uv')
const uvCommand = process.platform === 'win32'
  ? 'uv'
  : (fs.existsSync(userUvCommand) ? userUvCommand : 'uv')
const logDirectory = path.resolve('logs')
const logPath = path.join(logDirectory, 'dev.log')
const uvEnvironment = {
  UV_CACHE_DIR: process.env.UV_CACHE_DIR ?? path.resolve('.uv-cache'),
  UV_PYTHON_INSTALL_DIR: process.env.UV_PYTHON_INSTALL_DIR ?? path.resolve('.uv-python'),
}
fs.mkdirSync(logDirectory, { recursive: true })
fs.writeFileSync(logPath, `CampusOne development log started ${new Date().toISOString()}\n`, 'utf8')

function logLine(source, line) {
  if (!line) return
  const entry = `[${new Date().toISOString()}] [${source}] ${line}`
  process.stdout.write(`${entry}\n`)
  fs.appendFileSync(logPath, `${entry}\n`, 'utf8')
}

const migrationCommand = process.platform === 'win32' ? 'cmd.exe' : uvCommand
const migrationArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'uv run python manage.py migrate --noinput']
  : ['run', 'python', 'manage.py', 'migrate', '--noinput']

const migration = spawnSync(migrationCommand, migrationArgs, {
  cwd: 'services/api',
  env: { ...process.env, ...uvEnvironment, PYTHONUNBUFFERED: '1' },
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: false,
})

for (const [stream, source] of [[migration.stdout, 'api:migrate'], [migration.stderr, 'api:migrate']]) {
  for (const line of (stream?.toString() ?? '').split(/\r?\n/)) logLine(source, line)
}

if (migration.error) {
  console.error(`[api] Unable to apply migrations: ${migration.error.message}`)
  process.exit(1)
}

if (migration.status !== 0) {
  console.error(`[api] Migration command exited with code ${migration.status}`)
  process.exit(migration.status ?? 1)
}

const commands = [
  {
    name: 'institute-admin',
    command: npmCommand,
    // Vite will select the next available port when another dev session is
    // already running, allowing the API and remaining services to start.
    args: ['run', 'dev', '--workspace', '@campusone/institute-admin-web', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
  },
  {
    name: 'platform-admin',
    command: npmCommand,
    args: ['run', 'dev', '--workspace', '@campusone/platform-admin-web', '--', '--host', '127.0.0.1', '--port', '5174', '--strictPort'],
  },
  {
    name: 'api',
    command: uvCommand,
    args: ['run', 'python', 'manage.py', 'runserver', '0.0.0.0:8000'],
    cwd: 'services/api',
    env: {
      DJANGO_ALLOWED_HOSTS: 'localhost,127.0.0.1,testserver,api.snifply.com',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://institute.snifply.com,http://platform.snifply.com,https://institute.snifply.com,https://platform.snifply.com',
      CSRF_TRUSTED_ORIGINS: 'http://localhost:5173,http://localhost:5174,http://localhost:5175,http://institute.snifply.com,http://platform.snifply.com,https://institute.snifply.com,https://platform.snifply.com',
    },
  },
]

const cloudflareConfigPath = path.resolve('cloudflared/campusone.yml')
if (fs.existsSync(cloudflareConfigPath)) {
  const cloudflareConfig = fs.readFileSync(cloudflareConfigPath, 'utf8')
  const tunnelMatch = cloudflareConfig.match(/^tunnel:\s*(.+)$/m)
  const tunnelId = tunnelMatch?.[1]?.trim()
  const credentialsMatch = cloudflareConfig.match(/^credentials-file:\s*(.+)$/m)
  const configuredCredentialsPath = credentialsMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '')
  const linuxCredentialsPath = tunnelId
    ? path.join(process.env.HOME ?? '', '.cloudflared', `${tunnelId}.json`)
    : undefined
  const credentialsPath = process.env.CLOUDFLARED_CREDENTIALS_FILE
    ?? (configuredCredentialsPath && fs.existsSync(path.resolve(configuredCredentialsPath))
      ? path.resolve(configuredCredentialsPath)
      : undefined)
    ?? (linuxCredentialsPath && fs.existsSync(linuxCredentialsPath) ? linuxCredentialsPath : undefined)
  const cloudflareArgs = ['tunnel', '--config', cloudflareConfigPath]

  if (credentialsPath) {
    cloudflareArgs.push('--credentials-file', credentialsPath)
  } else {
    logLine(
      'cloudflare',
      'Starting tunnel without an override credentials path. Set CLOUDFLARED_CREDENTIALS_FILE if the config path is not valid on this machine.',
    )
  }

  cloudflareArgs.push('run')
  commands.push({
    name: 'cloudflare',
    command: process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared',
    args: cloudflareArgs,
  })
} else {
  logLine('cloudflare', `Tunnel config not found: ${cloudflareConfigPath}`)
}

const children = commands.map(({ name, command, args, cwd, env }) => {
  const spawnCommand = process.platform === 'win32' ? 'cmd.exe' : command
  const spawnArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [command, ...args].join(' ')]
    : args

  const child = spawn(spawnCommand, spawnArgs, {
    cwd,
    env: { ...process.env, ...uvEnvironment, ...env, PYTHONUNBUFFERED: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: false,
  })

  const write = (stream, chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      logLine(name, line)
    }
  }

  child.stdout.on('data', (chunk) => write(process.stdout, chunk))
  child.stderr.on('data', (chunk) => write(process.stderr, chunk))
  child.on('error', (error) => {
    logLine(name, error.stack ?? error.message)
  })
  child.on('exit', (code, signal) => {
    if (code !== 0 && signal === null) {
      logLine(name, `exited with code ${code}`)
    }
  })

  return child
})

let shuttingDown = false

function stopAll() {
  if (shuttingDown) return
  shuttingDown = true

  for (const child of children) {
    if (child.killed) continue

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
    } else {
      child.kill('SIGTERM')
    }
  }
}

process.on('exit', stopAll)

process.on('SIGINT', () => {
  stopAll()
  process.exit(0)
})
process.on('SIGTERM', () => {
  stopAll()
  process.exit(0)
})

logLine('dev', `CampusOne development services started. Full log: ${logPath}`)
