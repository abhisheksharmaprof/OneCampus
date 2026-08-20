import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { JSDOM } from 'jsdom'

const reviewFile = new URL('./academic-redesign-review.html', import.meta.url)

function loadReview() {
  assert.equal(
    existsSync(reviewFile),
    true,
    'academic-redesign-review.html must exist before its review experience can run',
  )
  const html = readFileSync(reviewFile, 'utf8')
  return new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'http://localhost/academic-redesign-review.html',
  })
}

test('presents the three approved academic workspaces in the CampusOne shell', () => {
  const { window } = loadReview()
  const pages = [...window.document.querySelectorAll('[data-page]')]

  assert.deepEqual(pages.map((page) => page.dataset.page), [
    'overview',
    'teaching',
    'assessment',
  ])
  assert.equal(window.document.querySelectorAll('[data-page-target]').length, 3)
  assert.match(window.document.title, /CampusOne.*Academics/i)
  assert.equal(window.document.querySelectorAll('svg').length, 0)
  assert.equal(
    [...window.document.querySelectorAll('.nav-item')].some((item) => item.textContent.trim().includes('Add-on Modules')),
    true,
  )
})

test('keeps the signed-in user avatar circular in the shared top bar', () => {
  const { window } = loadReview()
  const avatarStyle = window.getComputedStyle(window.document.querySelector('.avatar'))

  assert.equal(avatarStyle.width, '31px')
  assert.equal(avatarStyle.minWidth, 'auto')
})

test('switches between academic workspaces without navigating away', () => {
  const { window } = loadReview()
  const teachingButton = window.document.querySelector('[data-page-target="teaching"]')

  teachingButton.click()

  assert.equal(window.document.querySelector('[data-page="overview"]').hidden, true)
  assert.equal(window.document.querySelector('[data-page="teaching"]').hidden, false)
  assert.equal(teachingButton.getAttribute('aria-current'), 'page')
  assert.equal(window.location.hash, '#teaching')
})

test('changes inner workflow tabs and filters lesson-plan records', () => {
  const { window } = loadReview()
  window.document.querySelector('[data-page-target="teaching"]').click()
  const homeworkTab = window.document.querySelector('[data-tab-target="homework"]')
  homeworkTab.click()

  assert.equal(homeworkTab.getAttribute('aria-selected'), 'true')
  assert.equal(window.document.querySelector('[data-tab-panel="lesson-plans"]').hidden, true)
  assert.equal(window.document.querySelector('[data-tab-panel="homework"]').hidden, false)

  window.document.querySelector('[data-tab-target="lesson-plans"]').click()
  const filter = window.document.querySelector('[data-filter-input="lesson-plans"]')
  filter.value = 'geometry'
  filter.dispatchEvent(new window.Event('input', { bubbles: true }))

  const visibleRows = [...window.document.querySelectorAll('[data-filter-group="lesson-plans"] [data-search]')]
    .filter((row) => !row.hidden)
  assert.equal(visibleRows.length, 1)
  assert.match(visibleRows[0].textContent, /geometry/i)
})

test('opens contextual details and closes the drawer with Escape', () => {
  const { window } = loadReview()
  const drawer = window.document.querySelector('[data-drawer]')

  window.document.querySelector('[data-details]').click()
  assert.equal(drawer.getAttribute('aria-hidden'), 'false')
  assert.match(drawer.textContent, /fractions and decimals/i)

  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
  assert.equal(drawer.getAttribute('aria-hidden'), 'true')
})

test('completes the quick-create review flow and confirms the action', () => {
  const { window } = loadReview()
  const modal = window.document.querySelector('[data-modal]')
  const form = window.document.querySelector('[data-create-form]')

  window.document.querySelector('[data-open-modal]').click()
  assert.equal(modal.getAttribute('aria-hidden'), 'false')

  form.querySelector('[name="title"]').value = 'Linear equations recap'
  form.querySelector('[data-submit-create]').click()

  assert.equal(modal.getAttribute('aria-hidden'), 'true')
  assert.equal(window.document.querySelector('[data-toast]').getAttribute('aria-hidden'), 'false')
  assert.match(window.document.querySelector('[data-toast]').textContent, /linear equations recap/i)
})
