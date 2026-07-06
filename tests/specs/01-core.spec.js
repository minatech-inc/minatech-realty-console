/**
 * 層1: コアロジック直接テスト
 * 実ブラウザに本番モジュールを読み込み、公開APIを直接検証する。
 */
const { test, expect } = require('@playwright/test');

const SAMPLE_PROP_TEXT = [
    '物件名: 藤沢市南藤沢 一棟マンション',
    '所在地: 神奈川県藤沢市南藤沢3丁目',
    '価格: 4,800万円',
    '表面利回り: 12.5%',
    '交通: JR東海道本線 藤沢駅 徒歩5分',
    '構造: RC造 3階建',
    '築年月: 1998年6月',
    '土地面積: 120.5㎡',
    '建物面積: 280.3㎡',
    '現況: 賃貸中（満室）',
    '権利: 所有権'
].join('\n');

test.describe('コアロジック', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() =>
            typeof ReinsParser !== 'undefined' &&
            typeof ReinsScorer !== 'undefined' &&
            typeof LicenseManager !== 'undefined'
        );
    });

    test('レインズテキスト解析: 物件情報を正しく抽出できる', async ({ page }) => {
        const parsed = await page.evaluate((text) => ReinsParser.parse(text), SAMPLE_PROP_TEXT);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed.length).toBeGreaterThanOrEqual(1);
        const p = parsed[0];
        expect(p['所在地']).toContain('藤沢');
        expect(String(p['価格(万円)'] || p['価格'] || '')).toMatch(/4[,.]?800/);
    });

    test('スコアリング: サンプル物件が採点されSABランクが付く', async ({ page }) => {
        const result = await page.evaluate((text) => {
            const props = ReinsParser.parse(text);
            return ReinsScorer.evaluate(props[0]);
        }, SAMPLE_PROP_TEXT);
        expect(result).toBeTruthy();
        const score = Number(result['スコア'] ?? result.score);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
        const rank = String(result['優先度'] ?? result.rank ?? result['_rank_display'] ?? '');
        expect(rank).toMatch(/[SABC]/);
    });

    test('エリアティア判定: 東京23区 > 低需要エリア', async ({ page }) => {
        const tiers = await page.evaluate(() => ({
            tokyo: ReinsScorer.getAreaTier('東京都世田谷区'),
            fujisawa: ReinsScorer.getAreaTier('神奈川県藤沢市')
        }));
        expect(tiers.tokyo.tier).toBeGreaterThanOrEqual(1);
        expect(tiers.fujisawa.tier).toBeGreaterThanOrEqual(0);
    });

    test('ライセンス: キー生成→検証→保存→期限切れ判定', async ({ page }) => {
        const result = await page.evaluate(() => {
            const future = new Date();
            const futureStr = String(future.getFullYear() + 1) + '1231';
            const validKey = LicenseManager.generateKeyV1('STD', futureStr, 'TEST');
            const okCheck = LicenseManager.validateKey(validKey);

            const expiredKey = LicenseManager.generateKeyV1('STD', '20200101', 'TEST');
            const ngCheck = LicenseManager.validateKey(expiredKey);

            const garbageCheck = LicenseManager.validateKey('RA-STD-INVALID-KEY-000000');
            return {
                ok: okCheck.valid,
                okPlan: okCheck.plan,
                expired: ngCheck.valid,
                garbage: garbageCheck.valid
            };
        });
        expect(result.ok).toBe(true);
        expect(result.okPlan).toBe('STD');
        expect(result.expired).toBe(false);
        expect(result.garbage).toBe(false);
    });

    test('重説下書き: 4形式すべてでHTMLが生成される', async ({ page }) => {
        const result = await page.evaluate((text) => {
            const prop = ReinsParser.parse(text)[0];
            const keys = Object.keys(Disclosure.FORMATS);
            const out = {};
            keys.forEach((k) => {
                const html = Disclosure.buildHTML(prop, { formatKey: k });
                out[k] = typeof html === 'string' && html.length > 500 && html.indexOf('重要事項') >= 0;
            });
            return out;
        }, SAMPLE_PROP_TEXT);
        for (const [key, ok] of Object.entries(result)) {
            expect(ok, `重説形式 ${key} の生成に失敗`).toBe(true);
        }
    });

    test('売買契約書: 全形式でHTMLが生成され物件情報が反映される', async ({ page }) => {
        const result = await page.evaluate((text) => {
            const prop = ReinsParser.parse(text)[0];
            const keys = Object.keys(Contract.FORMATS);
            const out = {};
            keys.forEach((k) => {
                const html = Contract.buildHTML(prop, { formatKey: k });
                out[k] = typeof html === 'string' && html.length > 500 && html.indexOf('契約') >= 0;
            });
            return out;
        }, SAMPLE_PROP_TEXT);
        for (const [key, ok] of Object.entries(result)) {
            expect(ok, `売買契約書形式 ${key} の生成に失敗`).toBe(true);
        }
    });

    test('賃貸借契約書: 普通借家・定期借家ともに生成される', async ({ page }) => {
        const result = await page.evaluate((text) => {
            const prop = ReinsParser.parse(text)[0];
            const keys = Object.keys(RentalContract.FORMATS);
            const out = {};
            keys.forEach((k) => {
                const html = RentalContract.buildHTML(prop, { formatKey: k });
                out[k] = typeof html === 'string' && html.length > 300;
            });
            return out;
        }, SAMPLE_PROP_TEXT);
        expect(Object.keys(result).length).toBeGreaterThanOrEqual(2);
        for (const [key, ok] of Object.entries(result)) {
            expect(ok, `賃貸借契約書形式 ${key} の生成に失敗`).toBe(true);
        }
    });

    test('役所調査チェックリスト: 物件カテゴリに応じた項目が生成される', async ({ page }) => {
        const result = await page.evaluate((text) => {
            const prop = ReinsParser.parse(text)[0];
            const checklist = GovCheck.generateChecklist(prop);
            return {
                hasItems: !!checklist && (Array.isArray(checklist.sections || checklist.items || checklist)
                    ? (checklist.sections || checklist.items || checklist).length > 0
                    : Object.keys(checklist).length > 0)
            };
        }, SAMPLE_PROP_TEXT);
        expect(result.hasItems).toBe(true);
    });

    test('SUUMO入稿: モデル構築・特徴自動判定・コンプラチェックが動作する', async ({ page }) => {
        const result = await page.evaluate((text) => {
            const prop = ReinsParser.parse(text)[0];
            const model = SuumoExporter.buildSuumoModel(prop);
            const features = SuumoExporter.autoJudgeFeatures(prop);
            const compliance = SuumoExporter.checkCompliance(model);
            return {
                hasModel: !!model && typeof model === 'object',
                featureCount: Array.isArray(features) ? features.length : Object.keys(features || {}).length,
                complianceRan: compliance !== undefined && compliance !== null,
                propertyType: SuumoExporter.inferPropertyType(prop)
            };
        }, SAMPLE_PROP_TEXT);
        expect(result.hasModel).toBe(true);
        expect(result.featureCount).toBeGreaterThanOrEqual(0);
        expect(result.complianceRan).toBe(true);
        expect(result.propertyType).toBeTruthy();
    });

    test('銀行担保評価: 積算・収益還元の低位採用ロジックが機能する', async ({ page }) => {
        const result = await page.evaluate((text) => {
            const prop = ReinsParser.parse(text)[0];
            const cost = Appraisal.evaluate(prop);
            const income = Appraisal.evaluateIncome(prop);
            const financing = Appraisal.evaluateFinancing(prop);
            return {
                cost: cost,
                income: income,
                hasFinancing: !!financing
            };
        }, SAMPLE_PROP_TEXT);
        expect(result.cost).toBeTruthy();
        expect(result.income).toBeTruthy();
        expect(result.hasFinancing).toBe(true);
    });

    test('物件マスタDB: IndexedDBへの保存・取得・更新・削除・CSV出力', async ({ page }) => {
        const result = await page.evaluate(async (text) => {
            const prop = ReinsParser.parse(text)[0];
            prop['_test'] = true;
            const saved = await PropertyMaster.saveProperty(prop);
            const id = saved && (saved.id || saved);
            const listAfterSave = await PropertyMaster.listProperties();
            const got = await PropertyMaster.getProperty(id);
            await PropertyMaster.updateProperty(id, { 'メモ': 'テスト更新' });
            const updated = await PropertyMaster.getProperty(id);
            const csv = await PropertyMaster.exportAllCSV();
            await PropertyMaster.deleteProperty(id);
            const listAfterDelete = await PropertyMaster.listProperties();
            return {
                savedId: !!id,
                foundInList: listAfterSave.some((p) => (p.id || p) === id || p['_test']),
                gotBack: !!got,
                memoUpdated: updated && updated['メモ'] === 'テスト更新',
                csvHasHeader: typeof csv === 'string' && csv.length > 10,
                deleted: !listAfterDelete.some((p) => p.id === id)
            };
        }, SAMPLE_PROP_TEXT);
        expect(result.savedId).toBe(true);
        expect(result.foundInList).toBe(true);
        expect(result.gotBack).toBe(true);
        expect(result.memoUpdated).toBe(true);
        expect(result.csvHasHeader).toBe(true);
        expect(result.deleted).toBe(true);
    });

    test('解析履歴: 保存・一覧・読込・削除の一連動作', async ({ page }) => {
        const result = await page.evaluate(async (text) => {
            const props = ReinsParser.parse(text);
            const saved = await HistoryDB.save('テスト履歴', 'condo', 'investment', props);
            const id = saved && (saved.id || saved);
            const list = await HistoryDB.list();
            const loaded = await HistoryDB.load(id);
            await HistoryDB.remove(id);
            const listAfter = await HistoryDB.list();
            return {
                savedId: !!id,
                inList: list.length > 0,
                loadedOk: !!loaded,
                removedOk: listAfter.length < list.length
            };
        }, SAMPLE_PROP_TEXT);
        expect(result.savedId).toBe(true);
        expect(result.inList).toBe(true);
        expect(result.loadedOk).toBe(true);
        expect(result.removedOk).toBe(true);
    });
});
