/**
 * 協会Word様式 自動差し込みエンジンのテスト
 * 実様式（templates/重要事項説明書）に差し込み、値が正しい欄に入ったかを
 * ラベル文脈で検証する。記入済みdocxは成果物として保存。
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { ARTIFACTS_DIR, ensureDir } = require('../lib/artifacts');

const TEMPLATE = 'templates/重要事項説明書/重要事項説明書（区分所有建物の売買・交換用）.docx';

const SAMPLE = {
    prop: { '物件名': 'シーサイド湘南 505号室', '所在地': '神奈川県藤沢市南藤沢3丁目', '専有面積(㎡)': '42.5' },
    broker: {
        social_name: 'MinaTech株式会社',
        license_number: '神奈川県知事(1)第32624号',
        address: '神奈川県藤沢市南藤沢3-12 クリオ藤沢駅前 7階',
        phone: '0466-96-0313'
    },
    agent: { ceoName: '磯谷 肇', agentName: '湘南 花子', agentReg: '（神奈川県）第123456号', office: 'MinaTech株式会社' },
    parties: { sellerAddr: '東京都世田谷区1-2-3', sellerName: '山田 太郎' }
};

test.describe('協会Word様式差し込み', () => {
    test('区分所有売買様式: 19項目が正しい欄に差し込まれる', async ({ page }) => {
        test.setTimeout(90 * 1000);
        const templatePath = path.resolve(__dirname, '..', '..', TEMPLATE);
        expect(fs.existsSync(templatePath), '様式docxが存在しない').toBe(true);

        await page.goto('/index.html');
        await page.waitForFunction(() => typeof DisclosureDocx !== 'undefined');

        const result = await page.evaluate(async ({ url, sample }) => {
            const res = await fetch(url);
            if (!res.ok) return { error: '様式取得失敗 ' + res.status };
            const buf = await res.arrayBuffer();
            const values = DisclosureDocx.buildValues(sample.prop, sample.broker, sample.agent, sample.parties);
            const out = await DisclosureDocx.fill(buf, values);

            // 生成物を解凍してプレーンテキスト化し、値の前後文脈を採取
            const zip = await JSZip.loadAsync(out.blob);
            const xml = await zip.file('word/document.xml').async('string');
            const plain = xml.replace(/<[^>]+>/g, '');

            function contextOf(value) {
                const i = plain.indexOf(value);
                if (i < 0) return null;
                return plain.slice(Math.max(0, i - 30), i);
            }
            const b64 = await zip.generateAsync({ type: 'base64' });
            return {
                filled: out.filled,
                mappable: out.mappable,
                warnings: out.warnings,
                values: values,
                contexts: {
                    brokerName: contextOf(values.brokerName),
                    licNo: contextOf(values.licNo),
                    agentName: contextOf(values.agentName),
                    sellerName: contextOf(values.sellerName),
                    bldgName: contextOf(values.bldgName),
                    roomNo: contextOf('505'),
                    siteAddr: contextOf(values.siteAddr),
                    areaWallCore: contextOf(values.areaWallCore)
                },
                b64: b64
            };
        }, { url: '/' + TEMPLATE.split('/').map(encodeURIComponent).join('/'), sample: SAMPLE });

        expect(result.error, result.error).toBeUndefined();
        expect(result.filled, '差し込み件数が想定より少ない').toBe(result.mappable);
        expect(result.warnings).toHaveLength(0);

        // 値の分解確認（免許番号パース）
        expect(result.values.licPref).toBe('神奈川県');
        expect(result.values.licCount).toBe('1');
        expect(result.values.licNo).toBe('32624');
        expect(result.values.bldgName).toBe('シーサイド湘南');
        expect(result.values.roomNo).toBe('505');

        // 着地位置の検証（値の直前テキストに期待ラベルが含まれること）
        expect(result.contexts.brokerName, '商号欄').toContain('商号又は名称');
        expect(result.contexts.agentName, '宅建士氏名欄').toContain('宅地建物取引士');
        expect(result.contexts.sellerName, '売主氏名欄').toContain('氏名');
        expect(result.contexts.bldgName, '名称欄').toContain('名称');
        expect(result.contexts.areaWallCore, '壁芯面積欄').toContain('床面積');

        // 成果物保存
        ensureDir();
        fs.writeFileSync(
            path.join(ARTIFACTS_DIR, '記入済_重要事項説明書（区分所有売買）.docx'),
            Buffer.from(result.b64, 'base64')
        );
    });

    test('土地建物売買様式: 差し込みが完走し土地面積が正着する', async ({ page }) => {
        test.setTimeout(90 * 1000);
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof DisclosureDocx !== 'undefined');
        const result = await page.evaluate(async (sample) => {
            const url = '/' + ['templates', '重要事項説明書', '重要事項説明書（土地建物の売買・交換用）.docx'].map(encodeURIComponent).join('/');
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            const prop = { '物件名': '藤沢市鵠沼海岸 戸建', '所在地': '神奈川県藤沢市鵠沼海岸2丁目', '土地面積(㎡)': '120.5', '建物面積(㎡)': '95.2' };
            const values = DisclosureDocx.buildValues(prop, sample.broker, sample.agent, sample.parties);
            const out = await DisclosureDocx.fill(buf, values);
            const zip = await JSZip.loadAsync(out.blob);
            const plain = (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');
            const i = plain.indexOf('120.5');
            return {
                formatKey: out.formatKey, filled: out.filled, mappable: out.mappable,
                warnings: out.warnings,
                landAreaCtx: i >= 0 ? plain.slice(i, i + 20).replace(/\s+/g, '') : null,
                b64: await zip.generateAsync({ type: 'base64' })
            };
        }, SAMPLE);
        expect(result.formatKey).toBe('sale_landhouse');
        expect(result.filled).toBe(result.mappable);
        expect(result.warnings).toHaveLength(0);
        expect(result.landAreaCtx, '土地面積がm2欄に正着').toContain('m2');
        ensureDir();
        fs.writeFileSync(path.join(ARTIFACTS_DIR, '記入済_重要事項説明書（土地建物売買）.docx'), Buffer.from(result.b64, 'base64'));
    });

    test('住宅用賃借様式: 貸主・間取り・床面積が正着する', async ({ page }) => {
        test.setTimeout(90 * 1000);
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof DisclosureDocx !== 'undefined');
        const result = await page.evaluate(async (sample) => {
            const url = '/' + ['templates', '重要事項説明書', '重要事項説明書（住宅用建物賃借）.docx'].map(encodeURIComponent).join('/');
            const res = await fetch(url);
            const buf = await res.arrayBuffer();
            const prop = { '物件名': 'グランメール藤沢 203号室', '所在地': '神奈川県藤沢市南藤沢3丁目', '専有面積(㎡)': '25.8', '間取り': '1K' };
            const values = DisclosureDocx.buildValues(prop, sample.broker, sample.agent, sample.parties);
            const out = await DisclosureDocx.fill(buf, values);
            const zip = await JSZip.loadAsync(out.blob);
            const plain = (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');
            function ctxBefore(v) {
                const i = plain.indexOf(v);
                return i >= 0 ? plain.slice(Math.max(0, i - 30), i) : null;
            }
            return {
                formatKey: out.formatKey, filled: out.filled, mappable: out.mappable,
                warnings: out.warnings,
                lessorCtx: ctxBefore(values.lessorName),
                madoriCtx: ctxBefore('1K'),
                areaCtx: ctxBefore('25.8'),
                b64: await zip.generateAsync({ type: 'base64' })
            };
        }, SAMPLE);
        expect(result.formatKey).toBe('rent_residential');
        expect(result.filled).toBe(result.mappable);
        expect(result.warnings).toHaveLength(0);
        expect(result.lessorCtx, '貸主氏名欄').toContain('氏名');
        expect(result.madoriCtx, '間取り欄').toContain('間取り');
        expect(result.areaCtx, '床面積欄').toContain('床面積');
        ensureDir();
        fs.writeFileSync(path.join(ARTIFACTS_DIR, '記入済_重要事項説明書（住宅用賃借）.docx'), Buffer.from(result.b64, 'base64'));
    });

    test('免許番号パース: 各表記ゆれに対応する', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof DisclosureDocx !== 'undefined');
        const r = await page.evaluate(() => ({
            a: DisclosureDocx.parseLicense('神奈川県知事(1)第32624号'),
            b: DisclosureDocx.parseLicense('国土交通大臣（2）第9999号'),
            c: DisclosureDocx.parseLicense('東京都知事（11）第100200号'),
            d: DisclosureDocx.parseAgentReg('（神奈川県）第123456号')
        }));
        expect(r.a).toEqual({ pref: '神奈川県', count: '1', no: '32624' });
        expect(r.b).toEqual({ pref: '国土交通', count: '2', no: '9999' });
        expect(r.c).toEqual({ pref: '東京都', count: '11', no: '100200' });
        expect(r.d).toEqual({ pref: '神奈川県', no: '123456' });
    });

    test('全9様式: 差し込みが完走し様式判別（一般/業者用のフィールド数判別含む）が正しい', async ({ page }) => {
        test.setTimeout(180 * 1000);
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof DisclosureDocx !== 'undefined');

        const FORMS = [
            ['重要事項説明書（土地の売買・交換用）.docx', 'sale_land'],
            ['重要事項説明書（土地の売買・交換用）（宅建業者用）.docx', 'sale_land_biz'],
            ['重要事項説明書（土地建物の売買・交換用）.docx', 'sale_landhouse'],
            ['重要事項説明書（土地建物の売買・交換用）（宅建業者用）.docx', 'sale_landhouse_biz'],
            ['重要事項説明書（区分所有建物の売買・交換用）.docx', 'sale_condo'],
            ['重要事項説明書（区分所有建物の売買・交換用）（宅建業者用）.docx', 'sale_condo_biz'],
            ['重要事項説明書（住宅用建物賃借）.docx', 'rent_residential'],
            ['重要事項説明書（事業用建物賃借）.docx', 'rent_commercial'],
            ['重要事項説明書（土地賃借用）.docx', 'rent_land']
        ];

        const prop = {
            '物件名': 'シーサイド湘南 505号室', '所在地': '神奈川県藤沢市南藤沢3丁目',
            '専有面積(㎡)': '42.5', '土地面積(㎡)': '120.5', '間取り': '1LDK'
        };

        ensureDir();
        for (const [file, expectedKey] of FORMS) {
            const result = await page.evaluate(async ({ file, sample, prop }) => {
                const url = '/' + ['templates', '重要事項説明書', file].map(encodeURIComponent).join('/');
                const res = await fetch(url);
                if (!res.ok) return { error: file + ' 取得失敗 ' + res.status };
                const buf = await res.arrayBuffer();
                const values = DisclosureDocx.buildValues(prop, sample.broker, sample.agent, sample.parties);
                const out = await DisclosureDocx.fill(buf, values);
                const zip = await JSZip.loadAsync(out.blob);
                return {
                    formatKey: out.formatKey, filled: out.filled, mappable: out.mappable,
                    warnings: out.warnings, b64: await zip.generateAsync({ type: 'base64' })
                };
            }, { file, sample: SAMPLE, prop });

            expect(result.error, result.error).toBeUndefined();
            expect(result.formatKey, `${file} の様式判別`).toBe(expectedKey);
            expect(result.filled, `${file} の差し込み件数`).toBe(result.mappable);
            expect(result.warnings, `${file} の警告`).toHaveLength(0);
            fs.writeFileSync(
                path.join(ARTIFACTS_DIR, '記入済_' + file),
                Buffer.from(result.b64, 'base64')
            );
        }
    });
});
