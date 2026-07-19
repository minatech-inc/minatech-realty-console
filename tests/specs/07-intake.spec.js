/**
 * マイソク取込・登録（実業務用の分析非経由フロー）のテスト
 */
const { test, expect } = require('@playwright/test');

const SAMPLE_TEXT = [
    '物件名: グランメール藤沢 303号室',
    '所在地: 神奈川県藤沢市南藤沢2丁目',
    '価格: 2,480万円',
    '専有面積: 55.2㎡',
    '間取り: 2LDK',
    '築年月: 2010年5月'
].join('\n');

test.describe('マイソク取込・登録', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof IntakeUI !== 'undefined' && typeof ReinsParser !== 'undefined');
    });

    test('サイドバーから開き、分析(スコアリング)を経由しない説明が表示される', async ({ page }) => {
        await page.click('#btn-intake-header');
        await expect(page.locator('#ik-modal')).toBeVisible();
        await expect(page.locator('#ik-modal')).toContainText('スコアリングは行わず');
        await expect(page.locator('#ik-modal')).toContainText('マイソクPDF・画像から取込');
    });

    test('テキスト取込→編集→マスタ登録→次アクション導線', async ({ page }) => {
        await page.click('#btn-intake-header');
        await page.fill('#ik-paste', SAMPLE_TEXT);
        await page.click('#ik-parse-text');

        // プレビューに解析結果が反映される
        const nameInput = page.locator('.ik-field[data-field="物件名"]').first();
        await expect(nameInput).toHaveValue(/グランメール藤沢/);

        // 編集が反映される
        await nameInput.fill('グランメール藤沢 303号室（取込テスト）');
        await nameInput.dispatchEvent('change');

        // マスタ登録
        await page.locator('.ik-save').first().click();
        await expect(page.locator('#ik-modal')).toContainText('物件マスタに登録しました');
        await expect(page.locator('#ik-go-tx')).toBeVisible();
        await expect(page.locator('#ik-go-dsc')).toBeVisible();

        // マスタに実在する（ステータス=検討中）
        const saved = await page.evaluate(async () => {
            const list = await PropertyMaster.listProperties();
            const hit = list.find(r => (r.prop && r.prop['物件名'] || '').indexOf('取込テスト') >= 0);
            return hit ? { status: hit.prop['ステータス'] || hit.status || '', found: true } : { found: false };
        });
        expect(saved.found).toBe(true);

        // 「取引進行管理を開始」で遷移する
        await page.click('#ik-go-tx');
        await expect(page.locator('#tx-modal')).toBeVisible();
    });

    test('PdfAnalyzer.extractAll が外部APIとして公開されている', async ({ page }) => {
        const api = await page.evaluate(() => typeof PdfAnalyzer !== 'undefined' && typeof PdfAnalyzer.extractAll === 'function');
        expect(api).toBe(true);
    });

    test('PDF取込: 実PDFからテキスト抽出→プレビュー表示まで完走する @heavy', async ({ page }) => {
        test.setTimeout(180 * 1000);
        await page.click('#btn-intake-header');
        const pdfPath = require('path').resolve(__dirname, '..', '..', 'templates', '重要事項説明書（区分所有建物の売買・交換用）.pdf');
        await page.setInputFiles('#ik-file', pdfPath);
        // 抽出完了→プレビュー（編集フォーム）が出る
        await page.waitForSelector('.ik-field', { timeout: 150 * 1000 });
        const count = await page.locator('.ik-save').count();
        expect(count).toBeGreaterThan(0);
    });
});
