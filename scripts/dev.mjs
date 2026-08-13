import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const migrationCommand = process.platform === 'win32' ? 'cmd.exe' : 'uv'
const migrationArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'uv run python manage.py migrate --noinput']
  : ['run', 'python', 'manage.py', 'migrate', '--noinput']

const migration = spawnSync(migrationCommand, migrationArgs, {
  cwd: 'services/api',
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
  stdio: 'inherit',
  windowsHide: false,
})

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
    args: ['run', 'dev:admin'],
  },
  {
    name: 'platform-admin',
    command: npmCommand,
    args: ['run', 'dev:platform-admin'],
  },
  {
    name: 'api',
    command: 'uv',
    args: ['run', 'python', 'manage.py', 'runserver', '0.0.0.0:8000'],
    cwd: 'services/api',
  },
]

const children = commands.map(({ name, command, args, cwd }) => {
  const spawnCommand = process.platform === 'win32' ? 'cmd.exe' : command
  const spawnArgs = process.platform === 'win32'
    ? ['/d', '/s', '/c', [command, ...args].join(' ')]
    : args

  const child = spawn(spawnCommand, spawnArgs, {
    cwd,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: false,
  })

  const write = (stream, chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line) stream.write(`[${name}] ${line}\n`)
    }
  }

  child.stdout.on('data', (chunk) => write(process.stdout, chunk))
  child.stderr.on('data', (chunk) => write(process.stderr, chunk))
  child.on('error', (error) => {
    console.error(`[${name}] ${error.message}`)
  })
  child.on('exit', (code, signal) => {
    if (code !== 0 && signal === null) {
      console.error(`[${name}] exited with code ${code}`)
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

process.on('SIGINT', () => {
  stopAll()
  process.exit(0)
})
process.on('SIGTERM', () => {
  stopAll()
  process.exit(0)
})

console.log('CampusOne development services started. Press Ctrl+C to stop all services.')
