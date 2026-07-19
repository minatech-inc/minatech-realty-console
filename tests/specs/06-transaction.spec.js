/**
 * 取引進行管理のテスト
 * - フロー定義が市場標準（申込→事前審査→重説契約→本審査→金消→決済準備→決済引渡）に一致
 * - 作成→チェック→永続化→再読込
 * - 印刷2種（社内チェックリスト/顧客向け流れ）の内容
 * - 買付証明書の自動差し込み
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { ARTIFACTS_DIR, ensureDir } = require('../lib/artifacts');

test.describe('取引進行管理', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof Transaction !== 'undefined' && typeof TransactionUI !== 'undefined');
    });

    test('フロー定義: 売買7ステップ・賃貸5ステップが市場標準の構成', async ({ page }) => {
        const flows = await page.evaluate(() => ({
            sale: Transaction.FLOWS.sale.steps.map(s => s.title),
            rental: Transaction.FLOWS.rental.steps.map(s => s.title)
        }));
        expect(flows.sale).toEqual([
            '購入申込',
            '住宅ローン事前審査',
            '重要事項説明・売買契約締結',
            '住宅ローン本審査',
            '金銭消費貸借契約（金消契約）',
            '決済準備',
            '残代金決済・引渡し'
        ]);
        expect(flows.rental).toEqual([
            '内見・入居申込', '入居審査', '重要事項説明・賃貸借契約', '初期費用入金', '鍵渡し・入居'
        ]);
    });

    test('CRUD+進捗: 作成→チェック→保存→再取得で状態が維持される', async ({ page }) => {
        const result = await page.evaluate(async () => {
            const id = await Transaction.create('sale', { '物件名': 'テスト取引物件' }, {});
            const rec = await Transaction.get(id);
            const initialPct = Transaction.progressOf(rec);
            // ステップ1を全部チェック
            rec.steps[0].checks = rec.steps[0].checks.map(() => true);
            rec.steps[0].done = true;
            rec.steps[0].doneDate = '2026/7/19';
            await Transaction.update(rec);
            const re = await Transaction.get(id);
            const out = {
                initialPct,
                afterPct: Transaction.progressOf(re),
                curIdx: Transaction.currentStepIndex(re),
                step0Done: re.steps[0].checks.every(c => c),
                listHas: (await Transaction.list()).some(r => r.id === id)
            };
            await Transaction.remove(id);
            return out;
        });
        expect(result.initialPct).toBe(0);
        expect(result.afterPct).toBeGreaterThan(0);
        expect(result.curIdx).toBe(1); // ステップ1完了→現在は2番目
        expect(result.step0Done).toBe(true);
        expect(result.listHas).toBe(true);
    });

    test('UI: モーダルから取引作成→タイムライン表示→チェック永続化', async ({ page }) => {
        // 物件マスタに1件保存してから新規取引
        await page.evaluate(async () => {
            await PropertyMaster.saveProperty({ '物件名': 'UI取引テスト物件', '所在地': '藤沢市テスト1丁目' });
        });
        await page.click('#btn-transaction-header');
        await expect(page.locator('#tx-modal')).toBeVisible();
        await page.click('#tx-new-sale');
        // 物件マスタ選択モーダル → 読込ボタンで選択
        await expect(page.locator('#pm-modal')).toBeVisible();
        await page.locator('#pm-modal').getByText('読込').first().click();
        // 一覧に新取引が表示される
        await expect(page.locator('#tx-modal')).toContainText('UI取引テスト物件');
        // 開いてタイムライン表示
        await page.locator('.tx-open').first().click();
        await expect(page.locator('#tx-modal')).toContainText('購入申込');
        await expect(page.locator('#tx-modal')).toContainText('残代金決済・引渡し');
        // 最初の項目をチェック → 再描画後もチェック済み
        await page.locator('.tx-check').first().check();
        await expect(page.locator('.tx-check').first()).toBeChecked();
        // 進捗が0%より大きい
        await expect(page.locator('#tx-modal')).not.toContainText('進捗 0%');
    });

    test('印刷: 社内チェックリストと顧客向け流れがポップアップ生成される', async ({ page }) => {
        await page.evaluate(async () => {
            const id = await Transaction.create('sale', { '物件名': '印刷テスト邸' }, {});
            window.__txid = id;
        });
        await page.click('#btn-transaction-header');
        await page.locator('.tx-open').first().click();

        const [popup1] = await Promise.all([
            page.waitForEvent('popup'),
            page.click('#tx-print-check')
        ]);
        await popup1.waitForLoadState('domcontentloaded');
        const checkText = await popup1.locator('body').innerText();
        expect(checkText).toContain('取引進行チェックリスト');
        expect(checkText).toContain('金銭消費貸借契約');
        await popup1.close();

        const [popup2] = await Promise.all([
            page.waitForEvent('popup'),
            page.click('#tx-print-guide')
        ]);
        await popup2.waitForLoadState('domcontentloaded');
        const guideText = await popup2.locator('body').innerText();
        expect(guideText).toContain('お引渡しまでの流れ');
        expect(guideText).toContain('残代金のお支払い');
        expect(guideText).toContain('0466-96-0313');
        await popup2.close();
    });

    test('買付証明書: 物件情報と購入希望金額が自動差し込みされる', async ({ page }) => {
        test.setTimeout(90 * 1000);
        const result = await page.evaluate(async () => {
            const url = '/templates/' + ['付随書式', '申込・契約関係', '買付証明書（区分所有建物）.docx'].map(encodeURIComponent).join('/');
            const res = await fetch(url);
            if (!res.ok) return { error: '様式取得失敗 ' + res.status };
            const buf = await res.arrayBuffer();
            const prop = { '物件名': 'シーサイド湘南 505号室', '所在地': '神奈川県藤沢市南藤沢3丁目', '専有面積(㎡)': '42.5', '価格(万円)': '4800' };
            const values = DisclosureDocx.buildValues(prop, {}, {}, {});
            const out = await DisclosureDocx.fill(buf, values);
            const zip = await JSZip.loadAsync(out.blob);
            const plain = (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');
            const i = plain.indexOf('48,000,000');
            return {
                formatKey: out.formatKey, filled: out.filled, mappable: out.mappable, warnings: out.warnings,
                priceCtx: i >= 0 ? plain.slice(Math.max(0, i - 30), i) : null,
                b64: await zip.generateAsync({ type: 'base64' })
            };
        });
        expect(result.error, result.error).toBeUndefined();
        expect(result.formatKey).toBe('app_kaitsuke_condo');
        expect(result.filled).toBe(result.mappable);
        expect(result.warnings).toHaveLength(0);
        expect(result.priceCtx, '購入希望金額欄').toContain('購入希望金額');
        ensureDir();
        fs.writeFileSync(path.join(ARTIFACTS_DIR, '記入済_買付証明書（区分所有建物）.docx'), Buffer.from(result.b64, 'base64'));
    });
});
