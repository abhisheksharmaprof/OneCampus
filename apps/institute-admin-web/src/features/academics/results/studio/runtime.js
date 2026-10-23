import * as XLSX from 'xlsx'
import Chart from 'chart.js/auto'
import { createIcons, icons } from 'lucide'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import JSZip from 'jszip'
import { create as createQrCode } from 'qrcode/lib/browser.js'
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'
import serif from '@fontsource-variable/merriweather/files/merriweather-latin-wght-normal.woff2'
import serifItalic from '@fontsource-variable/merriweather/files/merriweather-latin-wght-italic.woff2'
import mono from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'
import hindi from '@fontsource-variable/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-wght-normal.woff2'
import tailwind from './tailwind.generated.css'
import { evaluateExpression } from './expression.js'
Object.assign(window, {
  XLSX,
  Chart,
  html2canvas,
  jspdf: { jsPDF },
  JSZip,
  qrcode: (_version, errorLevel) => {
    let matrix
    let payload = ''
    return {
      addData: (value) => {
        payload += value
      },
      make: () => {
        matrix = createQrCode(payload, { errorCorrectionLevel: errorLevel })
      },
      getModuleCount: () => matrix.modules.size,
      isDark: (row, column) => Boolean(matrix.modules.get(row, column)),
    }
  },
  lucide: { createIcons: () => createIcons({ icons }) },
  campusoneArithmetic: evaluateExpression,
})
const faces =
  [
    ['Inter', inter, 'normal'],
    ['Merriweather', serif, 'normal'],
    ['Merriweather', serifItalic, 'italic'],
    ['JetBrains Mono', mono, 'normal'],
  ]
    .map(
      ([family, url, style]) =>
        `@font-face{font-family:'${family}';src:url('${url}') format('woff2');font-weight:100 900;font-style:${style};font-display:block}`,
    )
    .join('') +
  ['Inter', 'Merriweather', 'JetBrains Mono']
    .map(
      (family) =>
        `@font-face{font-family:'${family}';src:url('${hindi}') format('woff2');font-weight:100 900;unicode-range:U+0900-097F,U+A8E0-A8FF}`,
    )
    .join('')
const theme = document.createElement('style')
theme.textContent = tailwind + faces
document.head.appendChild(theme)
const channel = new URLSearchParams(location.hash.slice(1)).get('channel') || ''
const parentOrigin =
  new URLSearchParams(location.hash.slice(1)).get('parentOrigin') || location.origin
const keys = [
  'headers',
  'rows',
  'identityMap',
  'subjectConfigs',
  'subjectOrder',
  'totalRule',
  'formulas',
  'gradeScale',
  'template',
  'selectedStudentIdx',
  'activeTab',
  'previewSubview',
  'batchViewMode',
  'searchQuery',
  'statusFilter',
  'lastSortKey',
]
let applying = false
let defaults
let branding = {}
const renders = new Map()
const send = (type, payload = {}) => {
  if (window.parent !== window)
    window.parent.postMessage({ type, channel, ...payload }, parentOrigin)
}
const clone = (value) =>
  JSON.parse(
    JSON.stringify(value, (key, value) =>
      ['__proto__', 'constructor', 'prototype'].includes(key) ? undefined : value,
    ),
  )
const safeImage = (value) => {
  if (typeof value !== 'string') return null
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z\d+/=]+$/i.test(value)) return value
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}
function guardTemplate() {
  const template = state.template
  for (const key of ['primaryColor', 'lightColor', 'borderColor'])
    if (!/^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(template[key])) template[key] = '#1e3a8a'
  template.customLogoDataUrl = safeImage(template.customLogoDataUrl)
  for (const map of [template.studentPhotos, template.sigImages])
    if (map && typeof map === 'object')
      for (const key of Object.keys(map)) map[key] = safeImage(map[key])
}
function snapshot() {
  return clone(Object.fromEntries(keys.map((key) => [key, state[key]])))
}
function syncControls() {
  const formula = {
    pctMode: 'formula-pct-mode',
    decimals: 'formula-decimals',
    gpaMode: 'formula-gpa-mode',
    gradingMethod: 'grading-method-select',
    specialCodePolicy: 'special-code-policy',
    termWeightMode: 'term-weight-mode',
    graceMax: 'formula-grace-max',
    customExpr: 'custom-pct-expr',
    passOverallPct: 'pass-overall-pct',
    minAttendancePct: 'min-attendance-pct',
    compartmentMaxSubs: 'compartment-max-subs',
    divDistinction: 'div-distinction',
    divFirst: 'div-first',
    divSecond: 'div-second',
    divThird: 'div-third',
    rankMethod: 'rank-method',
    rankBasis: 'rank-basis',
    rankEligibility: 'rank-eligibility',
    rankFormat: 'rank-display-format',
    remarkGenMode: 'remark-gen-mode',
  }
  const template = {
    docMode: 'tpl-doc-mode',
    fontFamily: 'tpl-font-family',
    borderStyle: 'tpl-border-style',
    pageSize: 'tpl-page-size',
    pageOrientation: 'tpl-page-orientation',
    pdfMarginMode: 'tpl-pdf-margin',
    paperSize: 'tpl-paper-size',
    langMode: 'tpl-lang-mode',
    qrMode: 'tpl-qr-mode',
    instName: 'tpl-inst-name',
    instSub: 'tpl-inst-sub',
    instAddr: 'tpl-inst-addr',
    examTitle: 'tpl-exam-title',
    session: 'tpl-session',
    crestStyle: 'tpl-crest-style',
    stampText: 'tpl-stamp-text',
    sig1: 'tpl-sig-1',
    sig2: 'tpl-sig-2',
    sig3: 'tpl-sig-3',
  }
  const set = (id, value) => {
    const el = document.getElementById(id)
    if (el) el.value = String(value ?? '')
  }
  for (const [key, id] of Object.entries(formula)) set(id, state.formulas[key])
  for (const [key, id] of Object.entries(template)) set(id, state.template[key])
  set('pass-require-every-sub', state.formulas.requireEverySubPass ? 'yes' : 'no')
  set('total-subjects-mode', state.totalRule.mode)
  set('best-n-count-input', state.totalRule.bestN)
  set('fixed-subject-count', state.totalRule.fixedCount)
  set('fixed-max-marks', state.totalRule.fixedMaxMarks)
  for (const [key, value] of Object.entries(state.template.cols)) {
    const el = document.getElementById('col-vis-' + key)
    if (el) el.checked = Boolean(value)
  }
  const media = {
    logoSize: 'media-logo-size',
    logoRotate: 'media-logo-rotate',
    photoScale: 'media-photo-scale',
    photoRotate: 'media-photo-rotate',
    sigScale: 'media-sig-scale',
    sigRotate: 'media-sig-rotate',
    stampScale: 'media-stamp-scale',
    stampRotate: 'media-stamp-rotate',
    watermarkSize: 'media-wm-size',
    watermarkOpacity: 'media-wm-opacity',
    qrSize: 'media-qr-size',
  }
  for (const [key, id] of Object.entries(media)) set(id, state.template.media?.[key])
  for (const [key, value] of Object.entries(state.template.sections)) {
    const el = document.getElementById('sec-vis-' + key)
    if (el) el.checked = Boolean(value)
  }
  const split = document.getElementById('split-comp-toggle')
  if (split) split.checked = state.template.cols.split
  setTemplateColor(
    state.template.primaryColor,
    state.template.lightColor,
    state.template.borderColor,
  )
}
function apply(payload) {
  const safe = clone(payload)
  if (!safe || typeof safe !== 'object' || Array.isArray(safe)) throw Error('Invalid workspace.')
  applying = true
  try {
    if ('headers' in safe && 'rows' in safe && defaults) {
      for (const key of keys) state[key] = clone(defaults[key])
      state.template = {
        ...state.template,
        ...branding,
        studentPhotos: {},
        sigImages: {},
      }
      state.subjectConfigs = {}
    }
    for (const key of keys) {
      if (!(key in safe)) continue
      if (['identityMap', 'subjectConfigs', 'totalRule', 'formulas', 'template'].includes(key)) {
        if (!safe[key] || typeof safe[key] !== 'object' || Array.isArray(safe[key]))
          throw Error('Invalid ' + key)
        if (key === 'template')
          state.template = {
            ...state.template,
            ...safe.template,
            cols: { ...state.template.cols, ...safe.template.cols },
            sections: { ...state.template.sections, ...safe.template.sections },
            sigImages: { ...state.template.sigImages, ...safe.template.sigImages },
          }
        else state[key] = { ...state[key], ...safe[key] }
      } else state[key] = safe[key]
    }
    state.workbookObj = null
    guardTemplate()
    syncControls()
    refreshAllViews()
    switchTab(
      ['import', 'mapping', 'formulas', 'template', 'preview'].includes(state.activeTab)
        ? state.activeTab
        : 'import',
    )
    if (state.activeTab === 'preview')
      setPreviewSubview(
        ['cards', 'gazette', 'analytics'].includes(state.previewSubview)
          ? state.previewSubview
          : 'cards',
      )
    const badge = document.getElementById('active-file-badge')
    if (badge && ('headers' in safe || 'rows' in safe)) badge.textContent = 'CampusOne workspace'
  } finally {
    applying = false
  }
  send('studio:status', {
    students: state.rows.length,
    subjects: orderedActiveSubjectHeaders().length,
  })
}
window.addEventListener('message', (event) => {
  if (
    event.source !== window.parent ||
    event.origin !== parentOrigin ||
    event.data?.channel !== channel
  )
    return
  const { type, payload, requestId } = event.data
  if (type === 'campusone:rendered') {
    const pending = renders.get(requestId)
    if (pending) {
      clearTimeout(pending.timer)
      renders.delete(requestId)
      if (payload.error) pending.reject(new Error(payload.error))
      else pending.resolve(payload.image)
    }
    return
  }
  try {
    if (type === 'campusone:snapshot') send('studio:snapshot', { requestId, state: snapshot() })
    if (type === 'campusone:load') {
      apply(payload)
      send('studio:loaded', { requestId })
    }
    if (type === 'campusone:branding') {
      branding = clone(payload)
      apply({ template: payload })
      send('studio:branded')
    }
  } catch (error) {
    send('studio:error', { requestId, message: error.message || 'Could not load workspace.' })
  }
})
window.addEventListener('DOMContentLoaded', () => {
  queueMicrotask(() => {
    defaults = snapshot()
    const originalStyles = [...document.querySelectorAll('style')]
      .filter((el) => el !== theme)
      .map((el) => el.textContent)
      .join('\n')
    window.campusoneExportStyles = tailwind + faces + originalStyles
    const originalRender = window.renderHtmlElementToCanvas
    window.renderHtmlElementToCanvas = async function (html, width = 820) {
      if (window.parent === window) return originalRender(html, width)
      const image = await new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID()
        const timer = setTimeout(() => {
          renders.delete(requestId)
          reject(new Error('Export took too long. Try fewer gazette rows.'))
        }, 60000)
        renders.set(requestId, { resolve, reject, timer })
        send('studio:render', { requestId, html, styles: window.campusoneExportStyles, width })
      })
      const img = new Image()
      img.src = image
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      canvas.getContext('2d').drawImage(img, 0, 0)
      return canvas
    }
    const originalRefresh = window.refreshAllViews
    window.refreshAllViews = function () {
      guardTemplate()
      const result = originalRefresh()
      if (!applying) send('studio:dirty', { students: state.rows.length })
      return result
    }
    window.importConfigJson = function (event) {
      const file = event.target.files?.[0]
      if (!file) return
      if (file.size > 2000000) {
        showToast('Choose a JSON preset smaller than 2 MB.', 'error')
        return
      }
      file
        .text()
        .then((text) => {
          const parsed = clone(JSON.parse(text))
          apply(
            Object.fromEntries(
              [
                'identityMap',
                'subjectConfigs',
                'subjectOrder',
                'totalRule',
                'formulas',
                'gradeScale',
                'template',
              ]
                .filter((key) => key in parsed)
                .map((key) => [key, parsed[key]]),
            ),
          )
          send('studio:dirty')
          showToast('Loaded saved template & formula configuration!', 'success')
        })
        .catch(() => showToast('Invalid JSON preset file.', 'error'))
      event.target.value = ''
    }
    document.addEventListener('change', () => {
      if (!applying) send('studio:dirty')
    })
    for (const name of [
      'setTemplateLayout',
      'setTemplateColor',
      'moveSectionOrder',
      'moveSubjectOrder',
      'toggleSubjectVisibilityOnCard',
    ]) {
      const original = window[name]
      window[name] = function (...args) {
        const result = original(...args)
        if (!applying) send('studio:dirty')
        return result
      }
    }
    const originalCSV = window.exportMasterResultsCSV
    window.exportMasterResultsCSV = function () {
      const originalRows = window.buildMasterExportRows
      const safe = (value) =>
        typeof value === 'string' && /^(?:[=+@\t\r-]|\s+[=+@-])/.test(value) ? "'" + value : value
      window.buildMasterExportRows = () => {
        const value = originalRows()
        return {
          exportHeaders: value.exportHeaders.map(safe),
          rows: value.rows.map((row) => row.map(safe)),
        }
      }
      try {
        return originalCSV()
      } finally {
        window.buildMasterExportRows = originalRows
      }
    }
    send('studio:ready', { students: state.rows.length })
  })
})
