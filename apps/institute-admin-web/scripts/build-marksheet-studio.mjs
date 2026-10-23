import { readFile, writeFile, mkdir } from 'node:fs/promises'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const folder = path.join(root, 'src/features/academics/results/studio')
async function writeChanged(file, contents) {
  if ((await readFile(file, 'utf8').catch(() => null)) !== contents) await writeFile(file, contents)
}
const reference = await readFile(path.join(folder, 'reference.html'), 'utf8')
const css = path.join(folder, 'tailwind.generated.css')
const generated = await postcss([
  tailwindcss({ content: [path.join(folder, 'reference.html')] }),
]).process(await readFile(path.join(folder, 'tailwind.input.css'), 'utf8'), {
  from: path.join(folder, 'tailwind.input.css'),
})
await writeChanged(css, generated.css)
const bundled = await build({
  entryPoints: [path.join(folder, 'runtime.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'inline',
  loader: { '.css': 'text', '.woff2': 'dataurl' },
})
let html = reference
  .replace(/\s*<script src="https:[^"]+"><\/script>/g, '')
  .replace(/\s*<link[^>]+(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>/g, '')
const formulaStart = html.indexOf('    function evaluateSafeCustomFormula(')
const formulaEnd = html.indexOf(
  '    // -----------------------------------------------------------------------',
  formulaStart,
)
if (formulaStart < 0 || formulaEnd < 0) throw Error('Reference formula boundary not found.')
html =
  html.slice(0, formulaStart) +
  `    function evaluateSafeCustomFormula(expr, vars) {\n      try { return window.campusoneArithmetic(expr, vars); }\n      catch (error) { window.campusoneFormulaError = error.message; return 0; }\n    }\n\n` +
  html.slice(formulaEnd)
// Explicit zero practical maxima remain zero for school subjects without a practical component.
html = html.replace('Math.max(0, Number(cfg.prMax) || 30)', 'Math.max(0, Number(cfg.prMax ?? 30))')
// Missing school attendance must never inherit the demo student's 95%.
html = html
  .replace("state.identityMap.attendance) || '95%'", "state.identityMap.attendance) || 'N/A'")
  .replace("String(attendance).replace(/[^0-9.]/g, '')) || 95", "String(attendance).replace(/[^0-9.]/g, '')) || 0")
// The supplied US scale already contains 0–4 grade points.
html = html.replace(
  'Math.min(4.0, (s.gp / 10) * 4.0)',
  'Math.min(4.0, state.gradeScale.every(g => Number(g.gp) <= 4) ? s.gp : (s.gp / 10) * 4.0)',
)
// Exported HTML uses the same compiled styles and embedded fonts, without CDN scripts.
html = html
  .replace(
    /<script src="https:\/\/cdn\.tailwindcss\.com\/3\.4\.17"><\\\/script>/g,
    '<style>\${window.campusoneExportStyles}</style>',
  )
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/g, '')
const inline = bundled.outputFiles[0].text
  .replace(/<\/script/gi, '<\\/script')
  // Keep HTML's legacy script-comment state from swallowing part of bundled DOMPurify.
  .replace(/<!--/g, '\\x3C!--')
new Function(inline)
html = html.replace(
  '  <style>',
  () =>
    `  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; font-src data:; img-src data: blob: https: http:; connect-src 'none'; frame-src about: blob:; base-uri 'none'; form-action 'none'">\n  <script>${inline}</script>\n  <style>`,
)
await mkdir(path.join(root, 'public/marksheet-studio'), { recursive: true })
await writeChanged(path.join(root, 'public/marksheet-studio/v5.html'), html)
const notices = []
for (const pkg of [
  'xlsx', 'chart.js', 'lucide', 'html2canvas', 'jspdf', 'jszip',
  '@fontsource-variable/inter', '@fontsource-variable/merriweather',
  '@fontsource-variable/jetbrains-mono', '@fontsource-variable/noto-sans-devanagari',
]) {
  let directory = path.dirname(fileURLToPath(import.meta.resolve(pkg)))
  let license = null
  while (directory !== path.dirname(directory) && !license) {
    for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.markdown']) {
      license = await readFile(path.join(directory, filename), 'utf8').catch(() => null)
      if (license) break
    }
    directory = path.dirname(directory)
  }
  if (!license) throw Error(`License notice not found for ${pkg}.`)
  notices.push(`${pkg}\n${license}`)
}
await writeChanged(path.join(root, 'public/marksheet-studio/THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'))
console.log(
  'Built original Marksheet Studio v5 with local libraries, embedded fonts and CampusOne bridge.',
)
