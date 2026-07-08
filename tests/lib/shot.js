const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1600, height: 950 } });
  await page.goto('http://127.0.0.1:4173/index.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: __dirname + '/../reports/design-light.png' });
  await page.click('#theme-dark');
  await page.waitForTimeout(400);
  await page.screenshot({ path: __dirname + '/../reports/design-dark.png' });
  await b.close();
  console.log('done');
})();
