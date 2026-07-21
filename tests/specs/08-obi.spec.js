/**
 * マイソク帯替えのテスト
 * 帯画像登録 → PDF/画像取込 → 合成（下部が帯で置換される） → PNG/PDF出力
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { ARTIFACTS_DIR, ensureDir } = require('../lib/artifacts');

const TEMPLATE_PDF = path.resolve(__dirname, '..', '..', 'templates', '重要事項説明書（区分所有建物の売買・交換用）.pdf');

/** テスト用の帯画像（緑一色の横長PNG）をcanvasで生成して登録 */
async function registerBand(page) {
    await page.evaluate(() => {
        const c = document.createElement('canvas');
        c.width = 1600; c.height = 260;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#0b7a4b';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 80px sans-serif';
        ctx.fillText('TEST OBI BAND', 60, 160);
        localStorage.setItem('rc_obi_image', c.toDataURL('image/png'));
    });
}

test.describe('マイソク帯替え', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof ObiUI !== 'undefined');
    });

    test('モーダル表示: 帯未登録時は同梱の標準帯（自社フッター）が自動適用される', async ({ page }) => {
        await page.evaluate(() => localStorage.removeItem('rc_obi_image'));
        await page.click('#btn-obi-header');
        await expect(page.locator('#obi-modal')).toBeVisible();
        await expect(page.locator('#obi-status')).toContainText('標準帯を適用中', { timeout: 15000 });
        // localStorage に保存され、内容に正しい免許番号入りの帯が入る（サイズで概認）
        const stored = await page.evaluate(() => (localStorage.getItem('rc_obi_image') || '').length);
        expect(stored).toBeGreaterThan(10000);
    });

    test('PDF取込→帯合成→下部の色が帯色に置き換わる→出力保存 @heavy', async ({ page }) => {
        test.setTimeout(120 * 1000);
        await registerBand(page);
        await page.click('#btn-obi-header');
        await expect(page.locator('#obi-status')).toContainText('登録済み');

        await page.setInputFiles('#obi-src-file', TEMPLATE_PDF);
        await page.waitForSelector('#obi-work', { state: 'visible', timeout: 60000 });
        // 合成完了を待つ（帯描画は画像onload後）
        await page.waitForTimeout(1500);

        const pixels = await page.evaluate(() => {
            const c = document.getElementById('obi-canvas');
            const ctx = c.getContext('2d');
            const topPx = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height * 0.3), 1, 1).data;
            const bandPx = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height - c.height * 0.04), 1, 1).data;
            return {
                w: c.width, h: c.height,
                top: [topPx[0], topPx[1], topPx[2]],
                band: [bandPx[0], bandPx[1], bandPx[2]],
                png: c.toDataURL('image/png').slice(0, 50)
            };
        });
        expect(pixels.w).toBeGreaterThan(1000);
        // 下端5%位置のピクセルが帯の緑（#0b7a4b近傍）である
        expect(Math.abs(pixels.band[0] - 11)).toBeLessThan(40);
        expect(Math.abs(pixels.band[1] - 122)).toBeLessThan(40);
        expect(Math.abs(pixels.band[2] - 75)).toBeLessThan(40);
        // 上部は帯色ではない
        expect(pixels.top[1] === 122 && pixels.top[0] === 11).toBe(false);

        // PNG出力がダウンロードされる
        const dl = page.waitForEvent('download', { timeout: 30000 });
        await page.click('#obi-dl-png');
        const download = await dl;
        expect(download.suggestedFilename()).toMatch(/^帯替え_.*\.png$/);
        ensureDir();
        await download.saveAs(path.join(ARTIFACTS_DIR, download.suggestedFilename()));

        // PDF出力
        const dl2 = page.waitForEvent('download', { timeout: 30000 });
        await page.click('#obi-dl-pdf');
        const download2 = await dl2;
        expect(download2.suggestedFilename()).toMatch(/\.pdf$/);
    });

    test('帯高さスライダーで覆う範囲が変わり設定が保存される', async ({ page }) => {
        await registerBand(page);
        await page.click('#btn-obi-header');
        await page.setInputFiles('#obi-src-file', TEMPLATE_PDF);
        await page.waitForSelector('#obi-work', { state: 'visible', timeout: 60000 });
        await page.locator('#obi-height').fill('20');
        await page.locator('#obi-height').dispatchEvent('input');
        await expect(page.locator('#obi-height-val')).toHaveText('20%');
        const saved = await page.evaluate(() => localStorage.getItem('rc_obi_height'));
        expect(saved).toBe('20');
    });
});
