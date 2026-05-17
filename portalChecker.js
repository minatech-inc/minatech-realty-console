/**
 * ポータル横断チェッカー
 * - 住所から SUUMO / atホーム / LIFULL HOME'S の市区町村別検索URLを生成
 * - 検索URLジャンプ + ユーザーが手動コピペしたHTMLのローカル解析
 *
 * URLパターン（実証済 2026-05-17）:
 *   SUUMO:
 *     中古マンション   /ms/chuko/{pref}/sc_{city}/
 *     新築マンション   /ms/shinchiku/{pref}/sc_{city}/
 *     中古戸建         /chukoikkodate/{pref}/sc_{city}/
 *     新築戸建         /ikkodate/{pref}/sc_{city}/
 *     売土地           /tochi/{pref}/sc_{city}/
 *     賃貸             /chintai/{pref}/sc_{city}/
 *     横浜区スラッグ: yokohamashi+区名(「区」抜き、「ヶ/ケ」抜き)
 *
 *   atホーム:
 *     中古マンション   /mansion/chuko/{pref}/{city}-city/list/
 *     新築マンション   /mansion/shinchiku/{pref}/{city}/list/   ← 「-city」なし
 *     中古戸建         /kodate/chuko/{pref}/{city}-city/list/
 *     新築戸建         /kodate/shinchiku/{pref}/{city}-city/list/
 *     売土地           /tochi/{pref}/{city}-city/list/
 *     賃貸             /chintai/{pref}/{city}-city/list/
 *     横浜区スラッグ: yokohama_hodogaya （アンダースコア結合）
 *
 *   HOMES:
 *     中古マンション   /mansion/chuko/{pref}/{city}-city/list/
 *     他種別も全て     /{種別}/{pref}/{city}-city/list/  形式
 *     横浜区スラッグ: yokohama_hodogaya （アンダースコア結合）
 *
 *   辞書外の市区町村は Google site: 検索で確実にカバー。
 */
var PortalChecker = (function() {
    'use strict';

    var PREF_SLUGS = {
        '北海道':'hokkaido','青森県':'aomori','岩手県':'iwate','宮城県':'miyagi','秋田県':'akita',
        '山形県':'yamagata','福島県':'fukushima',
        '茨城県':'ibaraki','栃木県':'tochigi','群馬県':'gunma','埼玉県':'saitama','千葉県':'chiba',
        '東京都':'tokyo','神奈川県':'kanagawa',
        '新潟県':'niigata','富山県':'toyama','石川県':'ishikawa','福井県':'fukui','山梨県':'yamanashi',
        '長野県':'nagano','岐阜県':'gifu','静岡県':'shizuoka','愛知県':'aichi','三重県':'mie',
        '滋賀県':'shiga','京都府':'kyoto','大阪府':'osaka','兵庫県':'hyogo','奈良県':'nara','和歌山県':'wakayama',
        '鳥取県':'tottori','島根県':'shimane','岡山県':'okayama','広島県':'hiroshima','山口県':'yamaguchi',
        '徳島県':'tokushima','香川県':'kagawa','愛媛県':'ehime','高知県':'kochi',
        '福岡県':'fukuoka','佐賀県':'saga','長崎県':'nagasaki','熊本県':'kumamoto','大分県':'oita',
        '宮崎県':'miyazaki','鹿児島県':'kagoshima','沖縄県':'okinawa'
    };

    // suumo: SUUMO用スラッグ（sc_の後）
    // com:   atホーム/HOMES共通の base名（-city はコード側で付与）
    var CITY_SLUGS = {
        '神奈川県': {
            '横浜市鶴見区':     { suumo:'yokohamashitsurumi',    com:'yokohama_tsurumi' },
            '横浜市神奈川区':   { suumo:'yokohamashikanagawa',   com:'yokohama_kanagawa' },
            '横浜市西区':       { suumo:'yokohamashinishi',      com:'yokohama_nishi' },
            '横浜市中区':       { suumo:'yokohamashinaka',       com:'yokohama_naka' },
            '横浜市南区':       { suumo:'yokohamashiminami',     com:'yokohama_minami' },
            '横浜市港南区':     { suumo:'yokohamashikonan',      com:'yokohama_konan' },
            '横浜市保土ケ谷区': { suumo:'yokohamashihodogaya',   com:'yokohama_hodogaya' },
            '横浜市保土ヶ谷区': { suumo:'yokohamashihodogaya',   com:'yokohama_hodogaya' },
            '横浜市旭区':       { suumo:'yokohamashiasahi',      com:'yokohama_asahi' },
            '横浜市磯子区':     { suumo:'yokohamashiisogo',      com:'yokohama_isogo' },
            '横浜市金沢区':     { suumo:'yokohamashikanazawa',   com:'yokohama_kanazawa' },
            '横浜市港北区':     { suumo:'yokohamashikohoku',     com:'yokohama_kohoku' },
            '横浜市緑区':       { suumo:'yokohamashimidori',     com:'yokohama_midori' },
            '横浜市青葉区':     { suumo:'yokohamashiaoba',       com:'yokohama_aoba' },
            '横浜市都筑区':     { suumo:'yokohamashitsuzuki',    com:'yokohama_tsuzuki' },
            '横浜市戸塚区':     { suumo:'yokohamashitotsuka',    com:'yokohama_totsuka' },
            '横浜市栄区':       { suumo:'yokohamashisakae',      com:'yokohama_sakae' },
            '横浜市泉区':       { suumo:'yokohamashiizumi',      com:'yokohama_izumi' },
            '横浜市瀬谷区':     { suumo:'yokohamashiseya',       com:'yokohama_seya' },
            '川崎市川崎区':     { suumo:'kawasakishikawasaki',   com:'kawasaki_kawasaki' },
            '川崎市幸区':       { suumo:'kawasakishisaiwai',     com:'kawasaki_saiwai' },
            '川崎市中原区':     { suumo:'kawasakishinakahara',   com:'kawasaki_nakahara' },
            '川崎市高津区':     { suumo:'kawasakishitakatsu',    com:'kawasaki_takatsu' },
            '川崎市宮前区':     { suumo:'kawasakishimiyamae',    com:'kawasaki_miyamae' },
            '川崎市多摩区':     { suumo:'kawasakishitama',       com:'kawasaki_tama' },
            '川崎市麻生区':     { suumo:'kawasakishiasao',       com:'kawasaki_asao' },
            '相模原市緑区':     { suumo:'sagamiharashimidori',   com:'sagamihara_midori' },
            '相模原市中央区':   { suumo:'sagamiharashichuo',     com:'sagamihara_chuo' },
            '相模原市南区':     { suumo:'sagamiharashiminami',   com:'sagamihara_minami' },
            '横須賀市':         { suumo:'yokosuka',              com:'yokosuka' },
            '平塚市':           { suumo:'hiratsuka',             com:'hiratsuka' },
            '鎌倉市':           { suumo:'kamakura',              com:'kamakura' },
            '藤沢市':           { suumo:'fujisawa',              com:'fujisawa' },
            '小田原市':         { suumo:'odawara',               com:'odawara' },
            '茅ヶ崎市':         { suumo:'chigasaki',             com:'chigasaki' },
            '茅ケ崎市':         { suumo:'chigasaki',             com:'chigasaki' },
            '逗子市':           { suumo:'zushi',                 com:'zushi' },
            '三浦市':           { suumo:'miura',                 com:'miura' },
            '秦野市':           { suumo:'hadano',                com:'hadano' },
            '厚木市':           { suumo:'atsugi',                com:'atsugi' },
            '大和市':           { suumo:'yamato',                com:'yamato' },
            '伊勢原市':         { suumo:'isehara',               com:'isehara' },
            '海老名市':         { suumo:'ebina',                 com:'ebina' },
            '座間市':           { suumo:'zama',                  com:'zama' },
            '南足柄市':         { suumo:'minamiashigara',        com:'minamiashigara' },
            '綾瀬市':           { suumo:'ayase',                 com:'ayase' }
        },
        '東京都': {
            '千代田区': { suumo:'chiyoda',  com:'chiyoda' },
            '中央区':   { suumo:'chuo',     com:'chuo' },
            '港区':     { suumo:'minato',   com:'minato' },
            '新宿区':   { suumo:'shinjuku', com:'shinjuku' },
            '文京区':   { suumo:'bunkyo',   com:'bunkyo' },
            '台東区':   { suumo:'taito',    com:'taito' },
            '墨田区':   { suumo:'sumida',   com:'sumida' },
            '江東区':   { suumo:'koto',     com:'koto' },
            '品川区':   { suumo:'shinagawa',com:'shinagawa' },
            '目黒区':   { suumo:'meguro',   com:'meguro' },
            '大田区':   { suumo:'ota',      com:'ota' },
            '世田谷区': { suumo:'setagaya', com:'setagaya' },
            '渋谷区':   { suumo:'shibuya',  com:'shibuya' },
            '中野区':   { suumo:'nakano',   com:'nakano' },
            '杉並区':   { suumo:'suginami', com:'suginami' },
            '豊島区':   { suumo:'toshima',  com:'toshima' },
            '北区':     { suumo:'kita',     com:'kita' },
            '荒川区':   { suumo:'arakawa',  com:'arakawa' },
            '板橋区':   { suumo:'itabashi', com:'itabashi' },
            '練馬区':   { suumo:'nerima',   com:'nerima' },
            '足立区':   { suumo:'adachi',   com:'adachi' },
            '葛飾区':   { suumo:'katsushika',com:'katsushika' },
            '江戸川区': { suumo:'edogawa',  com:'edogawa' },
            '八王子市':     { suumo:'hachioji',         com:'hachioji' },
            '立川市':       { suumo:'tachikawa',        com:'tachikawa' },
            '武蔵野市':     { suumo:'musashino',        com:'musashino' },
            '三鷹市':       { suumo:'mitaka',           com:'mitaka' },
            '青梅市':       { suumo:'ome',              com:'ome' },
            '府中市':       { suumo:'fuchutokyo',       com:'fuchu' },
            '昭島市':       { suumo:'akishima',         com:'akishima' },
            '調布市':       { suumo:'chofu',            com:'chofu' },
            '町田市':       { suumo:'machida',          com:'machida' },
            '小金井市':     { suumo:'koganei',          com:'koganei' },
            '小平市':       { suumo:'kodaira',          com:'kodaira' },
            '日野市':       { suumo:'hino',             com:'hino' },
            '東村山市':     { suumo:'higashimurayama',  com:'higashimurayama' },
            '国分寺市':     { suumo:'kokubunji',        com:'kokubunji' },
            '国立市':       { suumo:'kunitachi',        com:'kunitachi' },
            '福生市':       { suumo:'fussa',            com:'fussa' },
            '狛江市':       { suumo:'komae',            com:'komae' },
            '東大和市':     { suumo:'higashiyamato',    com:'higashiyamato' },
            '清瀬市':       { suumo:'kiyose',           com:'kiyose' },
            '東久留米市':   { suumo:'higashikurume',    com:'higashikurume' },
            '武蔵村山市':   { suumo:'musashimurayama',  com:'musashimurayama' },
            '多摩市':       { suumo:'tama',             com:'tama' },
            '稲城市':       { suumo:'inagi',            com:'inagi' },
            '羽村市':       { suumo:'hamura',           com:'hamura' },
            'あきる野市':   { suumo:'akiruno',          com:'akiruno' },
            '西東京市':     { suumo:'nishitokyo',       com:'nishitokyo' }
        }
    };

    var PATH_BY_TYPE = {
        chuko_ms:        { label:'中古マンション', suumo:'ms/chuko',         ath:'mansion/chuko',     homes:'mansion/chuko' },
        shinchiku_ms:    { label:'新築マンション', suumo:'ms/shinchiku',     ath:'mansion/shinchiku', homes:'mansion/shinchiku' },
        chuko_kodate:    { label:'中古戸建',       suumo:'chukoikkodate',    ath:'kodate/chuko',      homes:'kodate/chuko' },
        shinchiku_kodate:{ label:'新築戸建',       suumo:'ikkodate',         ath:'kodate/shinchiku',  homes:'kodate/shinchiku' },
        tochi:           { label:'売土地',         suumo:'tochi',            ath:'tochi',             homes:'tochi' },
        chintai:         { label:'賃貸',           suumo:'chintai',          ath:'chintai',           homes:'chintai' }
    };

    var TYPE_GROUPS = {
        sale_used: ['chuko_ms', 'chuko_kodate'],
        sale_new:  ['shinchiku_ms', 'shinchiku_kodate'],
        sale_land: ['tochi'],
        rent:      ['chintai']
    };

    function parseAddress(addr) {
        if (!addr) return null;
        var s = String(addr).trim()
            .replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
            .replace(/[ー−―ｰ]/g, '-')
            .replace(/\s+/g, '');
        var prefMatch = s.match(/^(.+?[都道府県])/);
        var pref = prefMatch ? prefMatch[1] : '';
        var rest = pref ? s.slice(pref.length) : s;
        var cityMatch = rest.match(/^(.+?[市区町村])/);
        var city = cityMatch ? cityMatch[1] : '';
        var afterCity = city ? rest.slice(city.length) : rest;
        var wardMatch = afterCity.match(/^(.+?区)/);
        var ward = '';
        if (wardMatch && /[市]$/.test(city)) {
            ward = wardMatch[1];
            afterCity = afterCity.slice(ward.length);
        }
        var fullCity = city + ward;
        var townMatch = afterCity.match(/^([^\d０-９0-9]+?)(?=\d|$)/);
        var town = townMatch ? townMatch[1] : afterCity;
        var banchi = afterCity.slice(town.length);
        return {
            raw: addr,
            normalized: s,
            pref: pref,
            city: fullCity,
            town: town,
            banchi: banchi,
            prefSlug: PREF_SLUGS[pref] || ''
        };
    }

    function lookupCitySlug(pref, city) {
        var byPref = CITY_SLUGS[pref];
        if (!byPref) return null;
        if (byPref[city]) return byPref[city];
        var alt = city.replace(/ヶ/g, 'ケ');
        if (byPref[alt]) return byPref[alt];
        var alt2 = city.replace(/ケ/g, 'ヶ');
        if (byPref[alt2]) return byPref[alt2];
        return null;
    }

    // 都道府県を指定せずに市区町村名だけで辞書全体から逆引き
    // 都道府県が省略された住所（例:「鎌倉市岡本1-2」）の救済用
    function lookupCityAnywhere(city) {
        if (!city) return null;
        var candidates = [city, city.replace(/ヶ/g, 'ケ'), city.replace(/ケ/g, 'ヶ')];
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            for (var pref in CITY_SLUGS) {
                if (CITY_SLUGS[pref][c]) {
                    return { pref: pref, slugs: CITY_SLUGS[pref][c] };
                }
            }
        }
        return null;
    }

    // 物件名の表記揺れ吸収（小書きカナ→大書き、長音記号バリエーション）
    function normalizePropertyName(name) {
        if (!name) return '';
        return String(name).trim()
            .replace(/[ー−―ｰ]/g, '-')
            .replace(/\s+/g, ' ');
    }

    function buildSearchUrls(addr, group, propertyName) {
        var p = parseAddress(addr) || { pref:'', city:'', town:'', banchi:'', prefSlug:'', normalized: addr || '', raw: addr || '' };
        var slugs = lookupCitySlug(p.pref, p.city);
        if (!slugs && p.city) {
            var rev = lookupCityAnywhere(p.city);
            if (rev) {
                p.pref = rev.pref;
                p.prefSlug = PREF_SLUGS[rev.pref] || '';
                p.prefInferred = true;
                slugs = rev.slugs;
            }
        }
        var typeKeys = TYPE_GROUPS[group] || [];
        var nameNorm = normalizePropertyName(propertyName);
        var urls = {
            suumo: [], athome: [], homes: [],
            google: {}, googleByName: {},
            addressInfo: p, hasCitySlug: !!slugs,
            propertyName: nameNorm, hasPropertyName: !!nameNorm
        };

        if (slugs && p.prefSlug) {
            typeKeys.forEach(function(tkey) {
                var t = PATH_BY_TYPE[tkey];
                urls.suumo.push({
                    label: t.label,
                    url: 'https://suumo.jp/' + t.suumo + '/' + p.prefSlug + '/sc_' + slugs.suumo + '/'
                });
                // atホーム: 新築マンションだけ -city なし
                var athSuffix = (tkey === 'shinchiku_ms') ? '' : '-city';
                urls.athome.push({
                    label: t.label,
                    url: 'https://www.athome.co.jp/' + t.ath + '/' + p.prefSlug + '/' + slugs.com + athSuffix + '/list/'
                });
                urls.homes.push({
                    label: t.label,
                    url: 'https://www.homes.co.jp/' + t.homes + '/' + p.prefSlug + '/' + slugs.com + '-city/list/'
                });
            });
        }

        // Google site: 検索（住所のみ。精度は低い：番地表記揺れでヒットしにくい）
        if (p.normalized) {
            urls.google = {
                suumo:  { label: 'SUUMO',   url: 'https://www.google.com/search?q=' + encodeURIComponent('site:suumo.jp '   + p.normalized) },
                athome: { label: 'atホーム', url: 'https://www.google.com/search?q=' + encodeURIComponent('site:athome.co.jp ' + p.normalized) },
                homes:  { label: 'HOMES',   url: 'https://www.google.com/search?q=' + encodeURIComponent('site:homes.co.jp ' + p.normalized) }
            };
        }

        // 物件名 site: 検索（完全一致狙い・最強の経路）
        if (nameNorm) {
            urls.googleByName = {
                suumo:  { label: 'SUUMO',   url: 'https://www.google.com/search?q=' + encodeURIComponent('site:suumo.jp '   + nameNorm) },
                athome: { label: 'atホーム', url: 'https://www.google.com/search?q=' + encodeURIComponent('site:athome.co.jp ' + nameNorm) },
                homes:  { label: 'HOMES',   url: 'https://www.google.com/search?q=' + encodeURIComponent('site:homes.co.jp ' + nameNorm) }
            };
        }

        return urls;
    }

    function detectPortal(html) {
        if (!html) return null;
        var lower = html.toLowerCase();
        if (lower.indexOf('suumo.jp') >= 0 || lower.indexOf('suumo.recruit') >= 0) return 'suumo';
        if (lower.indexOf('athome.co.jp') >= 0 || lower.indexOf('athome.jp') >= 0) return 'athome';
        if (lower.indexOf('homes.co.jp') >= 0 || lower.indexOf('lifull') >= 0) return 'homes';
        return null;
    }

    function parseHtml(html) {
        if (!html) return null;
        var portal = detectPortal(html);
        var doc;
        try {
            doc = new DOMParser().parseFromString(html, 'text/html');
        } catch (e) {
            return { portal: portal, error: 'HTMLパース失敗: ' + e.message };
        }
        if (portal === 'suumo')  return parseGeneralPortal(doc, html, 'suumo',  ['suumo.jp', 'recruit.co']);
        if (portal === 'athome') return parseGeneralPortal(doc, html, 'athome', ['athome.co', 'athome.jp']);
        if (portal === 'homes')  return parseGeneralPortal(doc, html, 'homes',  ['homes.co', 'lifull']);
        return parseGeneralPortal(doc, html, 'unknown');
    }

    function parseGeneralPortal(doc, raw, portal, imageHosts) {
        var r = { portal: portal, fields: {}, images: [], rawSize: raw.length };
        r.fields['物件名'] = text(doc.querySelector('h1, .section_h1-header-title, .property_view_main-emphasis, .bukkenName, .object-header-title'));
        collectTableTH(doc, r.fields);
        var canonical = doc.querySelector('link[rel="canonical"]');
        if (canonical) r.fields['物件URL'] = canonical.getAttribute('href');
        var company = doc.querySelector('.shop_company-name, .company-info, .companyName, .estate-company-name, .estateAgent, [class*="company"]');
        if (company) r.fields['仲介業者'] = text(company);
        collectImages(doc, r.images, imageHosts);
        var dateTexts = textsByLabel(doc, ['情報更新日', '次回更新予定日', '情報公開日', '提供日', '掲載日', '登録日']);
        Object.assign(r.fields, dateTexts);
        var phone = doc.querySelector('[class*="tel"], [class*="phone"]');
        if (phone) r.fields['問合せ先'] = text(phone);
        return r;
    }

    function text(el) {
        if (!el) return '';
        return (el.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function collectTableTH(doc, out) {
        var rows = doc.querySelectorAll('tr');
        rows.forEach(function(tr) {
            var ths = tr.querySelectorAll('th');
            var tds = tr.querySelectorAll('td');
            var maxLen = Math.min(ths.length, tds.length);
            for (var i = 0; i < maxLen; i++) {
                var k = text(ths[i]);
                var v = text(tds[i]);
                if (k && v && k.length < 20) out[k] = v;
            }
        });
        var dls = doc.querySelectorAll('dl');
        dls.forEach(function(dl) {
            var dts = dl.querySelectorAll('dt');
            var dds = dl.querySelectorAll('dd');
            var n = Math.min(dts.length, dds.length);
            for (var i = 0; i < n; i++) {
                var k = text(dts[i]);
                var v = text(dds[i]);
                if (k && v && k.length < 20) out[k] = v;
            }
        });
    }

    function textsByLabel(doc, labels) {
        var result = {};
        var nodes = doc.querySelectorAll('th, dt, .label, .heading');
        nodes.forEach(function(n) {
            var t = text(n);
            labels.forEach(function(lab) {
                if (t.indexOf(lab) >= 0) {
                    var sibling = n.nextElementSibling;
                    if (sibling) {
                        var v = text(sibling);
                        if (v) result[lab] = v;
                    }
                }
            });
        });
        return result;
    }

    function collectImages(doc, out, hostHints) {
        var imgs = doc.querySelectorAll('img');
        var seen = {};
        imgs.forEach(function(img) {
            var src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original') || '';
            if (!src) return;
            if (/^data:/.test(src)) return;
            if (/\.(svg|gif)(\?|$)/i.test(src)) return;
            var abs = src;
            if (src.startsWith('//')) abs = 'https:' + src;
            else if (src.startsWith('/')) {
                var canonical = doc.querySelector('link[rel="canonical"]');
                if (canonical) {
                    try { abs = new URL(canonical.getAttribute('href')).origin + src; } catch (e) {}
                }
            }
            if (hostHints && hostHints.length > 0) {
                if (!hostHints.some(function(h) { return abs.indexOf(h) >= 0; })) return;
            }
            if (seen[abs]) return;
            seen[abs] = true;
            out.push(abs);
        });
    }

    var LABEL_GROUPS = {
        basic: ['物件名','所在地','住所','価格','賃料','専有面積','建物面積','土地面積','面積','間取り','築年月','築年数','築年','最寄駅','交通','駅徒歩'],
        sales: ['仲介業者','取引態様','取引形態','問合せ先','物件URL','情報更新日','次回更新予定日','情報公開日','登録日','掲載日','提供日'],
        detail: ['構造','建物構造','所在階','階建','向き','バルコニー','管理費','修繕積立金','駐車場','現況','引渡','引渡し時期','土地権利','用途地域','建蔽率','容積率','接道','私道','設備','備考']
    };

    function classifyFields(fields) {
        var result = { basic: {}, sales: {}, detail: {}, other: {} };
        Object.keys(fields).forEach(function(k) {
            var v = fields[k];
            var placed = false;
            ['basic', 'sales', 'detail'].some(function(g) {
                if (LABEL_GROUPS[g].some(function(kw) { return k.indexOf(kw) >= 0; })) {
                    result[g][k] = v;
                    placed = true;
                    return true;
                }
                return false;
            });
            if (!placed) result.other[k] = v;
        });
        return result;
    }

    function toMasterProperty(parsed, sourceUrl) {
        var f = parsed.fields || {};
        return {
            '物件名': f['物件名'] || '',
            '所在地': f['所在地'] || f['住所'] || '',
            '価格': f['価格'] || f['賃料'] || '',
            '面積': f['専有面積'] || f['建物面積'] || f['土地面積'] || f['面積'] || '',
            '間取り': f['間取り'] || '',
            '築年月': f['築年月'] || f['築年'] || '',
            '交通': f['最寄駅'] || f['交通'] || '',
            '構造': f['構造'] || f['建物構造'] || '',
            '所在階': f['所在階'] || '',
            '向き': f['向き'] || '',
            '管理費': f['管理費'] || '',
            '修繕積立金': f['修繕積立金'] || '',
            '駐車場': f['駐車場'] || '',
            '現況': f['現況'] || '',
            '取引態様': f['取引態様'] || f['取引形態'] || '',
            '仲介業者': f['仲介業者'] || '',
            '問合せ先': f['問合せ先'] || '',
            '備考': f['備考'] || '',
            '物件URL': f['物件URL'] || sourceUrl || '',
            '情報源': parsed.portal,
            '取得日': new Date().toISOString().slice(0,10)
        };
    }

    return {
        parseAddress: parseAddress,
        lookupCitySlug: lookupCitySlug,
        buildSearchUrls: buildSearchUrls,
        detectPortal: detectPortal,
        parseHtml: parseHtml,
        classifyFields: classifyFields,
        toMasterProperty: toMasterProperty,
        _CITY_SLUGS: CITY_SLUGS
    };
})();
