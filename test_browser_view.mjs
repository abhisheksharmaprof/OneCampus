import { chromium } from 'playwright';

const auditPassword = process.env.CAMPUSONE_AUDIT_PASSWORD;
if (!auditPassword) throw new Error('Set CAMPUSONE_AUDIT_PASSWORD before running the browser check.');

async function run() {
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('response', async res => {
    if (res.status() >= 400) {
      console.log('API ERROR:', res.status(), res.url());
      try {
        console.log('BODY:', (await res.text()).slice(0, 200));
      } catch {}
    }
  });

  await page.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[name="identifier"]', 'admin@campusone-test.local');
  await page.fill('input[name="password"]', auditPassword);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('Logged in to dashboard!');

  await page.goto('http://127.0.0.1:5173/setup/holidays-calendar', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Take screenshot of Calendar page
  await page.screenshot({ path: '/home/abhi/.hermes/cache/scratch/calendar_fixed_table.png' });

  // Open Sync modal
  await page.click('button:has-text("Sync Holidays")');
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/home/abhi/.hermes/cache/scratch/calendar_modal_current.png' });

  await browser.close();
}

run().catch(console.error);
