import { chromium } from 'playwright';
import fs from 'fs';

const auditPassword = process.env.CAMPUSONE_AUDIT_PASSWORD;
if (!auditPassword) throw new Error('Set CAMPUSONE_AUDIT_PASSWORD before running the browser audit.');

async function audit() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleLogs = [];
  const networkErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleLogs.push({ type: msg.type(), text: msg.text(), url: page.url() });
    }
  });

  page.on('response', async res => {
    if (res.status() >= 400) {
      let body = '';
      try { body = await res.text(); } catch {}
      networkErrors.push({
        status: res.status(),
        url: res.url(),
        page: page.url(),
        body: body.slice(0, 150)
      });
    }
  });

  console.log('Logging in...');
  await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"], input[name="email"]', 'admin@campusone-test.local');
  await page.fill('input[type="password"]', auditPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('Logged in successfully!');

  // We will collect all admin links from the sidebar / navigation
  const routesToTest = [
    '/dashboard',
    '/branches',
    '/academics/structure',
    '/setup/rooms-facilities',
    '/setup/holidays-calendar',
    '/settings/institute-details',
    '/settings/profile',
    '/roles',
    '/roles/assignments',
    '/settings/governance',
    '/staff',
    '/students',
    '/parents',
    '/admissions/enquiries',
    '/admissions',
    '/admissions/forms',
    '/attendance',
    '/attendance/mark',
    '/attendance/student-leave',
    '/attendance/staff-leave',
    '/attendance/reports',
    '/attendance/settings',
    '/academics',
    '/academics/teaching-learning',
    '/academics/assessment-results',
    '/communication/circulars',
    '/communication/templates',
    '/finance',
    '/template-studio',
    '/timetable',
    '/timetable/generate',
    '/recognition/points',
    '/recognition/badges',
    '/recognition/leaderboard',
    '/recognition/award-approvals',
    '/recognition/partnerships',
    '/audit-log',
    '/settings/privacy',
    '/settings/billing',
    '/addons/transport',
    '/addons/library',
    '/addons/hostel',
    '/notifications',
    '/account',
    '/help'
  ];

  const results = [];

  for (const path of routesToTest) {
    const url = `http://127.0.0.1:5173${path}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 8000 });
      await page.waitForTimeout(500);

      // Check for error boundaries or blank pages or 404
      const bodyText = await page.innerText('body');
      const title = await page.title();
      
      const isErrorBoundary = bodyText.includes('Something went wrong') || bodyText.includes('Application Error') || bodyText.includes('Crash');
      const isUnavailable = bodyText.includes('Coming Soon') || bodyText.includes('not yet implemented') || bodyText.includes('Page not found') || bodyText.includes('Under Construction');
      const hasContent = bodyText.trim().length > 100;

      // Accessibility basic scan: buttons/inputs without labels, contrast, headings
      const buttonsWithoutLabel = await page.locator('button:not([aria-label]):empty').count();
      const imagesWithoutAlt = await page.locator('img:not([alt])').count();

      results.push({
        path,
        title,
        status: 'OK',
        isErrorBoundary,
        isUnavailable,
        textLength: bodyText.length,
        buttonsWithoutLabel,
        imagesWithoutAlt,
        firstHeading: (await page.locator('h1, h2, h3').allInnerTexts()).slice(0, 3)
      });
    } catch (e) {
      results.push({
        path,
        status: 'FAILED',
        error: e.message
      });
    }
  }

  fs.writeFileSync('audit_results.json', JSON.stringify({ results, consoleLogs, networkErrors }, null, 2));
  console.log('Audit complete! Saved to audit_results.json');
  await browser.close();
}

audit().catch(console.error);
