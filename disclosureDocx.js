/**
 * 協会公式Word様式（重要事項説明書）自動差し込みエンジン
 *
 * 全日本不動産協会ラビーネット提供の重説Word様式（FORMTEXTフィールド付き）に、
 * 解析済み物件データ・業者情報・宅建士情報を自動入力し、記入済みdocxを生成する。
 *
 * 方式:
 *   - docx(zip)内の word/document.xml を文字列走査し、FORMTEXTフィールドを文書順に採番
 *   - 様式ごとに検証済みの「序数→データ項目」マッピングで結果ランを置換
 *   - フィールド構造は保持するため、生成後もWord上でフォーム入力を継続できる
 *
 * 法的位置づけ: 協会原本様式を正とし、本エンジンは転記の自動化のみを行う。
 * 法令制限・専門判断項目（チェックボックス等）は宅建士の手入力に残す。
 *
 * 依存: JSZip（CDNから遅延読込）
 */
var DisclosureDocx = (function() {
    'use strict';

    var JSZIP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

    // ===== 様式レジストリ =====
    // fingerprint: 様式バージョン検知用（総フィールド数/FORMTEXT数が一致しない場合は警告）
    // map: FORMTEXT序数 → 値キー
    var FORMATS = [
        {
            key: 'sale_condo',
            title: '重要事項説明書［区分所有建物の売買・交換用］',
            fingerprint: { texts: 371 },
            map: {
                5: 'brokerAddrTel', 7: 'brokerName', 9: 'brokerCeo',
                13: 'licPref', 14: 'licCount', 15: 'licNo',
                19: 'agentName', 21: 'agentRegPref', 22: 'agentRegNo',
                25: 'agentOffice', 27: 'agentOfficeAddrTel',
                33: 'sellerAddr', 34: 'sellerName',
                38: 'bldgName', 41: 'roomNo', 42: 'jukyoHyoji',
                43: 'siteAddr', 51: 'bldgName', 54: 'areaWallCore'
            }
        },
        {
            key: 'sale_landhouse',
            title: '重要事項説明書［土地建物の売買・交換用］',
            fingerprint: { texts: 328 },
            map: {
                5: 'brokerAddrTel', 7: 'brokerName', 9: 'brokerCeo',
                13: 'licPref', 14: 'licCount', 15: 'licNo',
                19: 'agentName', 21: 'agentRegPref', 22: 'agentRegNo',
                25: 'agentOffice', 27: 'agentOfficeAddrTel',
                33: 'sellerAddr', 34: 'sellerName',
                38: 'siteAddr', 41: 'landArea',
                84: 'siteAddr', 86: 'jukyoHyoji'
            }
        },
        {
            key: 'rent_residential',
            title: '重要事項説明書［住宅用建物貸借］',
            fingerprint: { texts: 210 },
            map: {
                4: 'brokerAddrTel', 6: 'brokerName', 8: 'brokerCeo',
                12: 'licPref', 13: 'licCount', 14: 'licNo',
                18: 'agentName', 20: 'agentRegPref', 21: 'agentRegNo',
                24: 'agentOffice', 26: 'agentOfficeAddrTel',
                32: 'lessorAddr', 33: 'lessorName',
                35: 'bldgName', 37: 'roomNo', 38: 'jukyoHyoji',
                44: 'madori', 45: 'floorArea'
            }
        },
        {
            key: 'sale_land',
            title: '重要事項説明書［土地の売買・交換用］',
            fingerprint: { texts: 278 },
            map: {
                5: 'brokerAddrTel', 7: 'brokerName', 9: 'brokerCeo',
                13: 'licPref', 14: 'licCount', 15: 'licNo',
                19: 'agentName', 21: 'agentRegPref', 22: 'agentRegNo',
                25: 'agentOffice', 27: 'agentOfficeAddrTel',
                33: 'sellerAddr', 34: 'sellerName',
                38: 'siteAddr', 41: 'landArea'
            }
        },
        // ---- 宅建業者売主用（自社が売主のとき: 冒頭に自社+宅建士ブロック） ----
        {
            key: 'sale_land_biz',
            title: '重要事項説明書［土地の売買・交換用］',
            fingerprint: { texts: 292 },
            map: {
                4: 'licPref', 5: 'licCount', 6: 'licNo',
                7: 'agentRegPref', 8: 'agentRegNo',
                9: 'brokerAddr', 10: 'agentName', 11: 'agentOfficeAddrTel',
                12: 'brokerName', 13: 'brokerCeo', 14: 'brokerTel',
                47: 'sellerAddrBiz', 48: 'sellerNameBiz',
                52: 'siteAddr', 55: 'landArea'
            }
        },
        {
            key: 'sale_landhouse_biz',
            title: '重要事項説明書［土地建物の売買・交換用］',
            fingerprint: { texts: 343 },
            map: {
                4: 'licPref', 5: 'licCount', 6: 'licNo',
                7: 'agentRegPref', 8: 'agentRegNo',
                9: 'brokerAddr', 10: 'agentName', 11: 'agentOfficeAddrTel',
                12: 'brokerName', 13: 'brokerCeo', 14: 'brokerTel',
                47: 'sellerAddrBiz', 48: 'sellerNameBiz',
                52: 'siteAddr', 55: 'landArea',
                98: 'siteAddr', 100: 'jukyoHyoji'
            }
        },
        {
            key: 'sale_condo_biz',
            title: '重要事項説明書［区分所有建物の売買・交換用］',
            fingerprint: { texts: 385 },
            map: {
                4: 'licPref', 5: 'licCount', 6: 'licNo',
                7: 'agentRegPref', 8: 'agentRegNo',
                9: 'brokerAddr', 10: 'agentName', 11: 'agentOfficeAddrTel',
                12: 'brokerName', 13: 'brokerCeo', 14: 'brokerTel',
                47: 'sellerAddrBiz', 48: 'sellerNameBiz',
                52: 'bldgName', 55: 'roomNo', 56: 'jukyoHyoji',
                57: 'siteAddr', 65: 'bldgName', 68: 'areaWallCore'
            }
        },
        {
            key: 'rent_commercial',
            title: '重要事項説明書［事業用建物貸借］',
            fingerprint: { texts: 204 },
            map: {
                4: 'brokerAddrTel', 6: 'brokerName', 8: 'brokerCeo',
                12: 'licPref', 13: 'licCount', 14: 'licNo',
                18: 'agentName', 20: 'agentRegPref', 21: 'agentRegNo',
                24: 'agentOffice', 26: 'agentOfficeAddrTel',
                32: 'lessorAddr', 33: 'lessorName',
                35: 'bldgName', 37: 'roomNo', 39: 'jukyoHyoji',
                46: 'floorArea'
            }
        },
        {
            key: 'rent_land',
            title: '重要事項説明書［土地貸借用］',
            fingerprint: { texts: 210 },
            map: {
                5: 'brokerAddrTel', 7: 'brokerName', 9: 'brokerCeo',
                13: 'licPref', 14: 'licCount', 15: 'licNo',
                19: 'agentName', 21: 'agentRegPref', 22: 'agentRegNo',
                25: 'agentOffice', 27: 'agentOfficeAddrTel',
                33: 'siteAddr', 36: 'landArea'
            }
        },
        // ---- 売買契約書（協会様式・一般売主） ----
        {
            key: 'ctr_condo_shikichiken',
            title: '区分所有建物売買契約書（敷地権）',
            fingerprint: { texts: 127 },
            map: {
                0: 'sellerName', 1: 'buyerName',
                2: 'bldgName', 3: 'siteAddr', 8: 'roomNo',
                13: 'areaWallCore', 27: 'landArea', 45: 'priceYen'
            }
        },
        {
            key: 'ctr_landhouse_kobo',
            title: '不動産売買契約書',
            fingerprint: { texts: 118 },
            map: {
                0: 'sellerName', 1: 'buyerName',
                2: 'siteAddr', 22: 'landArea', 24: 'siteAddr',
                35: 'bldgArea', 37: 'priceYen'
            }
        }
    ];

    // ===== JSZip 遅延読込 =====
    var jszipPromise = null;
    function ensureJSZip() {
        if (typeof JSZip !== 'undefined') return Promise.resolve();
        if (jszipPromise) return jszipPromise;
        jszipPromise = new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = JSZIP_CDN;
            s.onload = function() { resolve(); };
            s.onerror = function() { reject(new Error('JSZipの読込に失敗しました（ネットワーク接続を確認してください）')); };
            document.head.appendChild(s);
        });
        return jszipPromise;
    }

    // ===== 免許番号パース =====
    // '神奈川県知事(1)第32624号' / '国土交通大臣（2）第9999号' → {pref, count, no}
    function parseLicense(str) {
        if (!str) return { pref: '', count: '', no: '' };
        var m = String(str).match(/^(.*?)(?:知事|大臣)?\s*[（(]\s*(\d+)\s*[）)]\s*第\s*(\d+)\s*号?/);
        if (m) return { pref: m[1].replace(/知事|大臣/g, '').trim(), count: m[2], no: m[3] };
        return { pref: '', count: '', no: String(str) };
    }

    // 宅建士登録番号 '（神奈川県）第123456号' / '神奈川県 第123456号' → {pref, no}
    function parseAgentReg(str) {
        if (!str) return { pref: '', no: '' };
        var m = String(str).match(/[（(]?\s*([^（()）第]*?)\s*[）)]?\s*第\s*(\d+)\s*号?/);
        if (m) return { pref: m[1].trim(), no: m[2] };
        return { pref: '', no: String(str) };
    }

    // ===== 物件データ → 値セット構築 =====
    // prop: 解析済み物件 / broker: 業者マスタ / agent: 宅建士・代表者情報 / parties: 売主買主
    function buildValues(prop, broker, agent, parties) {
        prop = prop || {}; broker = broker || {}; agent = agent || {}; parties = parties || {};
        var lic = parseLicense(broker.license_number);
        var reg = parseAgentReg(agent.agentReg);

        // 物件名から「棟・号室」を分離推定（例: ○○マンション 505号室)
        var name = prop['物件名'] || '';
        var roomMatch = name.match(/(\d{1,4})\s*号?室?\s*$/);

        return {
            brokerAddrTel: joinNonEmpty([broker.address, broker.phone ? 'TEL:' + broker.phone : ''], '　'),
            brokerName: broker.social_name || '',
            brokerCeo: agent.ceoName || '',
            licPref: lic.pref,
            licCount: lic.count,
            licNo: lic.no,
            agentName: agent.agentName || '',
            agentRegPref: reg.pref,
            agentRegNo: reg.no,
            agentOffice: agent.office || broker.social_name || '',
            agentOfficeAddrTel: joinNonEmpty([broker.address, broker.phone ? 'TEL:' + broker.phone : ''], '　'),
            sellerAddr: parties.sellerAddr || '',
            sellerName: parties.sellerName || '',
            // 宅建業者売主用様式: 売主表示は未入力時に自社情報で補完
            sellerAddrBiz: parties.sellerAddr || broker.address || '',
            sellerNameBiz: parties.sellerName || broker.social_name || '',
            brokerAddr: broker.address || '',
            brokerTel: broker.phone || '',
            lessorAddr: parties.sellerAddr || '',
            lessorName: parties.sellerName || '',
            bldgName: name.replace(/\s*\d{1,4}\s*号?室?\s*$/, '') || name,
            roomNo: roomMatch ? roomMatch[1] : '',
            jukyoHyoji: prop['所在地'] || '',
            siteAddr: prop['所在地'] || '',
            areaWallCore: prop['専有面積(㎡)'] || prop['面積(㎡)'] || '',
            landArea: prop['土地面積(㎡)'] || '',
            bldgArea: prop['建物面積(㎡)'] || '',
            madori: prop['間取り'] || '',
            floorArea: prop['専有面積(㎡)'] || prop['面積(㎡)'] || '',
            buyerName: parties.buyerName || '',
            priceYen: (function() {
                var man = parseFloat(String(prop['価格(万円)'] || '').replace(/[^\d.]/g, ''));
                return isNaN(man) ? '' : (man * 10000).toLocaleString('ja-JP');
            })()
        };
    }

    function joinNonEmpty(arr, sep) {
        return arr.filter(function(x) { return x && String(x).trim(); }).join(sep);
    }

    // ===== docx 差し込み本体 =====
    // タイトル一致で候補を絞り、フィールド数が一致するものを優先
    // （宅建業者用様式は一般用とタイトルが同一のため、数で判別する）
    function detectFormat(xml, textFieldCount) {
        var plain = xml.replace(/<[^>]+>/g, '').slice(0, 2000);
        var candidates = FORMATS.filter(function(f) { return plain.indexOf(f.title) >= 0; });
        if (!candidates.length) return null;
        var exact = candidates.filter(function(f) { return f.fingerprint.texts === textFieldCount; });
        return exact[0] || candidates[0];
    }

    /** document.xml から FORMTEXT フィールド位置を文書順に抽出 */
    function scanTextFields(xml) {
        var events = [];
        var re = /<w:fldChar w:fldCharType="(begin|separate|end)"[^>]*\/?>/g;
        var m;
        while ((m = re.exec(xml)) !== null) {
            events.push({ start: m.index, end: m.index + m[0].length, kind: m[1] });
        }
        var instrs = [];
        var reI = /<w:instrText[^>]*>([^<]*)<\/w:instrText>/g;
        while ((m = reI.exec(xml)) !== null) {
            instrs.push({ pos: m.index, text: m[1] });
        }
        var fields = [], stack = [];
        events.forEach(function(ev) {
            if (ev.kind === 'begin') {
                stack.push({ begin: ev.start, sep: null, sepEnd: null });
            } else if (ev.kind === 'separate' && stack.length) {
                stack[stack.length - 1].sep = ev.start;
                stack[stack.length - 1].sepEnd = ev.end;
            } else if (ev.kind === 'end' && stack.length) {
                var f = stack.pop();
                f.end = ev.start;
                var isText = instrs.some(function(it) {
                    return f.begin < it.pos && it.pos < (f.sep || f.end) && it.text.indexOf('FORMTEXT') >= 0;
                });
                if (!stack.length && isText) fields.push(f);
            }
        });
        return fields;
    }

    function escapeXml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    }

    /**
     * 差し込み実行
     * @param arrayBuffer 様式docxのバイト列
     * @param values buildValues() の出力
     * @returns Promise<{blob, formatKey, filled, skipped, warnings}>
     */
    async function fill(arrayBuffer, values) {
        await ensureJSZip();
        var zip = await JSZip.loadAsync(arrayBuffer);
        var docFile = zip.file('word/document.xml');
        if (!docFile) throw new Error('Word文書として読み込めませんでした（document.xmlなし）');
        var xml = await docFile.async('string');

        var fields = scanTextFields(xml);
        var fmt = detectFormat(xml, fields.length);
        if (!fmt) throw new Error('対応していない様式です。現在対応: ' + FORMATS.map(function(f) { return f.title; }).join(' / '));

        var warnings = [];
        if (fmt.fingerprint.texts && fields.length !== fmt.fingerprint.texts) {
            warnings.push('様式のフィールド数が想定(' + fmt.fingerprint.texts + ')と異なります(' + fields.length + ')。様式が改訂された可能性があるため、出力内容を必ず確認してください。');
        }

        // 置換対象（後ろから置換して位置ズレを防ぐ）
        var repls = [];
        Object.keys(fmt.map).forEach(function(ordinal) {
            var idx = parseInt(ordinal, 10);
            var key = fmt.map[ordinal];
            var val = values[key];
            if (val === undefined || val === null || String(val).trim() === '') return;
            var f = fields[idx];
            if (!f || f.sep === null) return;
            var seg = xml.slice(f.sepEnd, f.end);
            var m = seg.match(/(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/);
            if (!m) return;
            var segOffset = seg.indexOf(m[0]);
            repls.push({
                start: f.sepEnd + segOffset + m[1].length,
                end: f.sepEnd + segOffset + m[1].length + m[2].length,
                value: escapeXml(String(val))
            });
        });
        repls.sort(function(a, b) { return b.start - a.start; });
        repls.forEach(function(r) {
            xml = xml.slice(0, r.start) + r.value + xml.slice(r.end);
        });

        zip.file('word/document.xml', xml);
        var blob = await zip.generateAsync({
            type: 'blob',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
        return {
            blob: blob,
            formatKey: fmt.key,
            formatTitle: fmt.title,
            filled: repls.length,
            mappable: Object.keys(fmt.map).length,
            warnings: warnings
        };
    }

    return {
        fill: fill,
        buildValues: buildValues,
        parseLicense: parseLicense,
        parseAgentReg: parseAgentReg,
        FORMATS: FORMATS
    };
})();
