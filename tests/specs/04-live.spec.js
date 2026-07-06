/**
 * 層3b: 本番スモークテスト（@live）
 * 本番URL・Cloudflare Workers の死活を確認する。
 * ネットワーク断では失敗するため、ローカル開発時は --grep-invert @live で除外可。
 */
const { test, expect } = require('@playwright/test');

const PROD = 'https://realty.minatech1210.com';

test.describe('本番スモーク @live', () => {
    test('本番サイト: トップが200で主要モジュールが読み込まれる @live', async ({ page }) => {
        const res = await page.goto(PROD + '/index.html', { waitUntil: 'domcontentloaded' });
        expect(res.status()).toBe(200);
        await page.waitForFunction(() =>
            typeof ReinsParser !== 'undefined' &&
            typeof ReinsScorer !== 'undefined' &&
            typeof LicenseManager !== 'undefined' &&
            typeof Disclosure !== 'undefined', null, { timeout: 20000 });
        // ライセンスゲート整合性: モーダルの表示状態が loadLicense() の判定と一致すること
        // （現仕様: minatech1210.com ドメインはオーナーバイパスでモーダル非表示）
        const gate = await page.evaluate(() => {
            const lic = LicenseManager.loadLicense();
            const hidden = document.getElementById('license-modal').classList.contains('hidden');
            return { valid: !!(lic && lic.valid), hidden };
        });
        expect(gate.hidden, 'モーダル表示状態がライセンス判定と不整合').toBe(gate.valid);
    });

    test('本番サイト: landing / scoring / terms が配信されている @live', async ({ request }) => {
        for (const p of ['/landing.html', '/scoring.html', '/terms.html']) {
            const res = await request.get(PROD + p);
            expect(res.status(), `${p} が ${res.status()}`).toBe(200);
        }
    });

    test('チャットWorker: quota エンドポイントが応答する @live', async ({ request }) => {
        const res = await request.get('https://chat.minatech1210.com/quota?tier=lite');
        expect(res.status()).toBe(200);
    });

    test('ライセンスWorker: verify エンドポイントが応答する @live', async ({ request }) => {
        const res = await request.post('https://license.minatech1210.com/verify', {
            data: { key: 'RA-STD-20991231-TEST-000000', deviceId: 'test-device' },
            failOnStatusCode: false
        });
        // 無効キーでも「Workerが生きて応答する」ことを確認（5xxでなければ良い）
        expect(res.status(), `license-server が ${res.status()}`).toBeLessThan(500);
    });

    test('国交省APIプロキシWorker: 応答する @live', async ({ request }) => {
        const res = await request.get('https://reinfolib-proxy.isoya-h.workers.dev/', {
            failOnStatusCode: false
        });
        // パラメータ無しは400が正常（= Worker生存確認）
        expect(res.status(), `reinfolib-proxy が ${res.status()}`).toBeLessThan(500);
    });
});
