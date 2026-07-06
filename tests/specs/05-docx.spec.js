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

    test('非対応様式: 明確なエラーメッセージを返す', async ({ page }) => {
        await page.goto('/index.html');
        await page.waitForFunction(() => typeof DisclosureDocx !== 'undefined');
        const msg = await page.evaluate(async () => {
            // 土地売買様式（未対応）を投入
            const res = await fetch('/' + ['templates', '重要事項説明書', '重要事項説明書（土地の売買・交換用）.docx'].map(encodeURIComponent).join('/'));
            const buf = await res.arrayBuffer();
            try {
                await DisclosureDocx.fill(buf, {});
                return 'エラーが発生しなかった';
            } catch (e) { return e.message; }
        });
        expect(msg).toContain('対応していない様式');
    });
});
