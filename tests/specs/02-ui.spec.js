/**
 * 層2: UI E2Eテスト
 * 実ブラウザでボタン操作・画面遷移・ダウンロード発生まで検証する。
 * localhost はオーナーバイパスによりライセンスモーダルが自動スキップされる。
 */
const { test, expect } = require('@playwright/test');
const { saveDownload, saveHTML } = require('../lib/artifacts');

/** サンプル投入 → 解析実行 → 結果表示 までの共通フロー */
async function analyzeSample(page) {
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof ReinsParser !== 'undefined');
    await page.click('#btn-sample');
    await page.click('#btn-parse');
    await expect(page.locator('#results-section')).toBeVisible();
}

test.describe('UI基盤', () => {
    test('ライセンスモーダル: localhostでオーナーバイパスが機能する', async ({ page }) => {
        await page.goto('/index.html');
        await expect(page.locator('#license-modal')).toHaveClass(/hidden/);
    });

    test('サイドバー: 4グループすべてのメニューが表示される', async ({ page }) => {
        await page.goto('/index.html');
        const sidebar = page.locator('#rc-sidebar');
        await expect(sidebar.getByText('メイン機能')).toBeVisible();
        await expect(sidebar.getByText('契約書類')).toBeVisible();
        await expect(sidebar.getByText('業務支援')).toBeVisible();
        await expect(sidebar.getByText('物件評価分析')).toBeVisible();
    });

    test('テーマ切替: ダークモードに切り替わり再読込後も維持される', async ({ page }) => {
        await page.goto('/index.html');
        await page.click('#theme-dark');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.reload();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.click('#theme-light');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    test('入力タブ: 貼り付け/手動入力/PDFの3タブが切り替わる', async ({ page }) => {
        await page.goto('/index.html');
        await page.click('.tab[data-tab="manual"]');
        await expect(page.locator('#tab-manual')).toHaveClass(/active/);
        await page.click('.tab[data-tab="pdf"]');
        await expect(page.locator('#tab-pdf')).toHaveClass(/active/);
        await page.click('.tab[data-tab="paste"]');
        await expect(page.locator('#tab-paste')).toHaveClass(/active/);
    });
});

test.describe('物件評価分析フロー', () => {
    test('サンプル投入→解析→スコア付き結果が表示される', async ({ page }) => {
        await analyzeSample(page);
        const text = await page.locator('#results-section').innerText();
        expect(text).toContain('藤沢');
        expect(text).toMatch(/スコア|点|優先度|[SABC]/);
    });

    test('クリア: 結果セクションが非表示に戻る', async ({ page }) => {
        await analyzeSample(page);
        await page.click('#btn-clear');
        await expect(page.locator('#results-section')).toBeHidden();
        await expect(page.locator('#paste-area')).toHaveValue('');
    });

    test('手動入力: フォームから物件を追加すると解析結果に反映される', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof ReinsParser !== 'undefined');
        await page.click('.tab[data-tab="manual"]');
        const form = page.locator('#manual-form');
        await form.locator('input[name="物件名"]').fill('テスト戸建 手動入力');
        await form.locator('input[name="所在地"]').fill('神奈川県藤沢市辻堂1丁目');
        await form.locator('input[name="価格(万円)"]').fill('3500');
        await form.locator('button[type="submit"]').click();
        await expect(page.locator('#results-section')).toBeVisible();
        await expect(page.locator('#results-section')).toContainText('辻堂');
    });
});

test.describe('出力機能', () => {
    test('CSV/Excel/JSON出力: ダウンロードが発生する', async ({ page }) => {
        await analyzeSample(page);
        for (const btn of ['#btn-export-csv', '#btn-export-excel', '#btn-export-json']) {
            const dl = page.waitForEvent('download', { timeout: 15000 });
            await page.click(btn);
            const download = await dl;
            expect(download.suggestedFilename().length, `${btn} のファイル名が空`).toBeGreaterThan(0);
            await saveDownload(download);
        }
    });

    test('PDFレポート: ダウンロードが発生する', async ({ page }) => {
        test.setTimeout(240 * 1000);
        await analyzeSample(page);
        // html2canvas + jsPDF の描画が重く、フルスイート実行時の高負荷では90秒を超えるため余裕を持たせる
        const dl = page.waitForEvent('download', { timeout: 200000 });
        await page.click('#btn-export-pdf');
        const download = await dl;
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
        await saveDownload(download, 'PDFレポート');
    });

    test('銀行担保評価書: ダウンロードが発生する', async ({ page }) => {
        await analyzeSample(page);
        // サンプルは2物件のため物件選択プロンプトが出る → 1番を選択
        page.once('dialog', (d) => d.accept('1'));
        const dl = page.waitForEvent('download', { timeout: 30000 });
        await page.click('#btn-export-bank');
        const download = await dl;
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
        await saveDownload(download, '銀行担保評価書');
    });

    test('SUUMO入稿シート: モーダルが開き入稿シートが生成される', async ({ page }) => {
        await analyzeSample(page);
        // 業者情報マスタが必須のためテスト用データを事前投入
        await page.evaluate(() => {
            localStorage.setItem('suumo_broker_master', JSON.stringify({
                social_name: 'MinaTech株式会社',
                license_number: '神奈川県知事(1)第32624号'
            }));
        });
        await page.click('#btn-suumo-export');
        await expect(page.locator('#suumo-export-modal')).toBeVisible();
        await expect(page.locator('#suumo-sheet-body')).not.toBeEmpty();
        const sheetHTML = await page.locator('#suumo-sheet-body').innerHTML();
        saveHTML('SUUMO入稿シート.html', sheetHTML, 'SUUMO入稿シート（自動生成）');
        await page.click('#suumo-export-close');
        await expect(page.locator('#suumo-export-modal')).toHaveCount(0);
    });

    test('SUUMO業者情報マスタ: 設定モーダルが開き保存できる', async ({ page }) => {
        await analyzeSample(page);
        await page.click('#btn-suumo-broker');
        await expect(page.locator('#suumo-broker-modal')).toBeVisible();
        await page.click('#suumo-broker-save');
        await expect(page.locator('#suumo-broker-modal')).toHaveCount(0);
    });
});

test.describe('契約書類', () => {
    test('重説下書き: モーダルが開きプレビューが生成される', async ({ page }) => {
        await analyzeSample(page);
        await page.click('#btn-disclosure-header');
        await expect(page.locator('#dsc-modal')).toBeVisible();
        await expect(page.locator('#dsc-modal')).toContainText('重要事項説明書');
        await page.click('#dsc-close');
        await expect(page.locator('#dsc-modal')).toHaveCount(0);
    });

    test('売買契約書: モーダルが開きプレビューが生成される', async ({ page }) => {
        await analyzeSample(page);
        await page.click('#btn-contract-header');
        await expect(page.locator('#ctr-modal')).toBeVisible();
        await expect(page.locator('#ctr-modal')).toContainText('契約');
    });

    test('賃貸借契約書: モーダルが開きプレビューが生成される', async ({ page }) => {
        await analyzeSample(page);
        await page.click('#btn-rental-contract-header');
        await expect(page.locator('#rct-modal')).toBeVisible();
        await expect(page.locator('#rct-modal')).toContainText('賃貸借');
    });
});

test.describe('業務支援', () => {
    test('役所調査チェックリスト: モーダルが開き項目が表示される', async ({ page }) => {
        await analyzeSample(page);
        await page.click('#btn-govcheck-header');
        await expect(page.locator('#gc-modal')).toBeVisible();
    });

    test('ポータル横断チェック: モーダルが開く', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof PortalCheckerUI !== 'undefined');
        await page.click('#btn-portal-checker-header');
        await expect(page.locator('#pc-modal')).toBeVisible();
    });

    test('画像処理: モーダルが開く', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof ImageProcessorUI !== 'undefined');
        await page.click('#btn-image-processor-header');
        await expect(page.locator('#ip-modal')).toBeVisible();
    });
});

test.describe('マスタ管理・履歴', () => {
    test('マスタに保存→物件マスタDBに表示される', async ({ page }) => {
        await analyzeSample(page);
        await page.click('#btn-save-master');
        await expect(page.locator('#pm-save-modal')).toBeVisible();
        await page.click('#pm-save-confirm');
        await expect(page.locator('#pm-save-modal')).toHaveCount(0);
        await page.click('#btn-property-master-header');
        await expect(page.locator('#pm-modal')).toBeVisible();
        // 保存対象はスコア最上位物件（サンプル内順位に依存しない検証）
        await expect(page.locator('#pm-modal')).toContainText('万円');
        await expect(page.locator('#pm-modal')).toContainText('読込');
    });

    test('履歴に保存→履歴一覧に表示される', async ({ page }) => {
        await analyzeSample(page);
        page.once('dialog', (d) => d.accept('E2Eテスト履歴'));
        await page.click('#btn-save-history');
        await page.click('#btn-open-history');
        await expect(page.locator('#history-modal')).toBeVisible();
        await expect(page.locator('#history-list')).not.toBeEmpty();
        await page.click('#btn-history-close');
    });
});

test.describe('静的ページ', () => {
    for (const [path, mustContain] of [
        ['/landing.html', 'Realty Console'],
        ['/scoring.html', '採点'],
        ['/terms.html', '利用規約'],
        ['/admin-licenses.html', 'ライセンス']
    ]) {
        test(`${path} が表示され主要コンテンツを含む`, async ({ page }) => {
            const res = await page.goto(path);
            expect(res.status()).toBe(200);
            await expect(page.locator('body')).toContainText(mustContain);
        });
    }
});
