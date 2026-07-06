/**
 * 層3: 重い機能テスト（@heavy — 週次実行）
 * PDF/マイソク解析（pdf.js + OCR）と画像処理（リサイズ・マスキング）。
 * 外部CDNからのモデル取得を含むため実行時間が長い。
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const TEMPLATE_PDF = path.resolve(
    __dirname, '..', '..', 'templates', '重要事項説明書（区分所有建物の売買・交換用）.pdf'
);
const FIXTURE_DIR = path.resolve(__dirname, '..', 'fixtures');
const SAMPLE_IMAGE = path.join(FIXTURE_DIR, 'sample-room.png');

test.describe('重い機能 @heavy', () => {
    test('PDF解析: 実PDFを投入して解析パイプラインが完走する @heavy', async ({ page }) => {
        test.setTimeout(180 * 1000);
        expect(fs.existsSync(TEMPLATE_PDF), 'テンプレートPDFが存在しない').toBe(true);

        await page.goto('/index.html');
        await page.waitForFunction(() => typeof ReinsParser !== 'undefined');
        await page.click('.tab[data-tab="pdf"]');
        await page.setInputFiles('#pdf-file', TEMPLATE_PDF);

        // 進捗バーが出現し「完了」またはエラー無しで消えるまで待つ
        await expect(page.locator('#pdf-progress')).toBeVisible({ timeout: 30000 });
        await page.waitForFunction(() => {
            const t = document.getElementById('pdf-progress-text');
            const p = document.getElementById('pdf-progress');
            return (t && /完了|エラー/.test(t.textContent)) || (p && p.style.display === 'none');
        }, { timeout: 150 * 1000 });

        const statusText = await page.locator('#pdf-progress-text').textContent().catch(() => '');
        expect(statusText, `PDF解析がエラー終了: ${statusText}`).not.toContain('エラー');
    });

    test('画像処理: SUUMO規格リサイズ+マスキングパイプラインが完走する @heavy', async ({ page }) => {
        test.setTimeout(180 * 1000);

        // フィクスチャ画像が無ければ実ページのスクリーンショットから生成（実画像として有効）
        if (!fs.existsSync(SAMPLE_IMAGE)) {
            fs.mkdirSync(FIXTURE_DIR, { recursive: true });
            await page.goto('/landing.html');
            await page.screenshot({ path: SAMPLE_IMAGE, fullPage: false });
        }

        await page.goto('/index.html');
        await page.waitForFunction(() => typeof ImageProcessorUI !== 'undefined');
        await page.click('#btn-image-processor-header');
        await expect(page.locator('#ip-modal')).toBeVisible();

        await page.setInputFiles('#ip-file-input', SAMPLE_IMAGE);

        // 処理完了（結果カードが出る or 進捗が消える）まで待機
        await page.waitForFunction(() => {
            const results = document.getElementById('ip-results');
            const progress = document.getElementById('ip-progress');
            return (results && results.children.length > 0) ||
                   (progress && progress.style.display === 'none');
        }, { timeout: 150 * 1000 });

        const resultCount = await page.locator('#ip-results > *').count();
        expect(resultCount, '画像処理の結果が生成されなかった').toBeGreaterThan(0);
    });
});
