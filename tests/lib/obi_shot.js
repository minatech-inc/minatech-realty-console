// 標準帯PNG生成: obi-footer-source.html → obi-footer.png (3368x568 @2x)
const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1740, height: 400 }, deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:4173/obi-footer-source.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600); // Webフォント安定待ち
  await page.locator('#band').screenshot({ path: __dirname + '/../../obi-footer.png' });
  await b.close();
  console.log('generated obi-footer.png');
})();
