/**
 * ハザード評価モジュール（Phase B）
 *
 * 市区町村レベルでの洪水・津波・土砂災害リスクを静的データで判定。
 * 国交省ハザードマップ・気象庁・各自治体ハザードマップからの要約。
 * 点ベースの正確な判定は別途ジオコーディング+ベクトルタイル参照が必要。
 */
var HazardCheck = (function() {
    'use strict';

    // flood/tsunami/landslide: 0=低 1=注意 2=高
    // 主要エリア + 湘南重点
    var CITY_HAZARD = {
        // 湘南（ユーザー重点）
        '鎌倉市': { tsunami: 2, flood: 1, landslide: 2, note: '沿岸部津波・山際土砂' },
        '逗子市': { tsunami: 2, flood: 1, landslide: 2, note: '沿岸部津波・山際土砂' },
        '葉山町': { tsunami: 2, flood: 0, landslide: 1, note: '沿岸部津波' },
        '藤沢市': { tsunami: 2, flood: 1, landslide: 1, note: '沿岸部津波・引地川流域' },
        '茅ヶ崎市': { tsunami: 2, flood: 1, landslide: 0, note: '沿岸部津波・相模川東岸' },
        '平塚市': { tsunami: 2, flood: 2, landslide: 0, note: '相模川浸水想定' },
        '大磯町': { tsunami: 2, flood: 0, landslide: 1, note: '沿岸部津波' },
        '二宮町': { tsunami: 2, flood: 0, landslide: 1, note: '沿岸部津波' },
        '小田原市': { tsunami: 2, flood: 1, landslide: 1, note: '沿岸部・酒匂川' },
        '横須賀市': { tsunami: 2, flood: 0, landslide: 2, note: '津波・急傾斜地' },
        // 横浜川崎（沿岸）
        '横浜市中区': { tsunami: 2, flood: 1, landslide: 0, note: '沿岸部津波' },
        '横浜市西区': { tsunami: 2, flood: 1, landslide: 0, note: '沿岸部津波' },
        '横浜市神奈川区': { tsunami: 2, flood: 1, landslide: 0, note: '沿岸部津波' },
        '横浜市鶴見区': { tsunami: 2, flood: 2, landslide: 0, note: '鶴見川浸水' },
        '横浜市金沢区': { tsunami: 2, flood: 1, landslide: 1, note: '沿岸部津波' },
        '横浜市磯子区': { tsunami: 1, flood: 1, landslide: 1, note: '' },
        '川崎市川崎区': { tsunami: 2, flood: 2, landslide: 0, note: '沿岸部・多摩川' },
        '川崎市幸区': { tsunami: 1, flood: 2, landslide: 0, note: '多摩川浸水' },
        // 東京湾岸
        '江東区': { tsunami: 1, flood: 2, landslide: 0, note: '海抜ゼロメートル' },
        '墨田区': { tsunami: 1, flood: 2, landslide: 0, note: '海抜ゼロメートル' },
        '江戸川区': { tsunami: 1, flood: 2, landslide: 0, note: '海抜ゼロメートル' },
        '葛飾区': { tsunami: 0, flood: 2, landslide: 0, note: '海抜ゼロメートル' },
        '足立区': { tsunami: 0, flood: 2, landslide: 0, note: '荒川浸水想定' },
        '港区': { tsunami: 1, flood: 1, landslide: 0, note: '沿岸部一部' },
        '中央区': { tsunami: 1, flood: 1, landslide: 0, note: '沿岸部一部' },
        '品川区': { tsunami: 1, flood: 1, landslide: 0, note: '沿岸部一部' },
        '大田区': { tsunami: 1, flood: 1, landslide: 0, note: '沿岸部一部' },
        // 千葉沿岸
        '浦安市': { tsunami: 2, flood: 2, landslide: 0, note: '沿岸埋立・液状化' },
        '市川市': { tsunami: 1, flood: 2, landslide: 0, note: '江戸川・沿岸' },
        '船橋市': { tsunami: 1, flood: 1, landslide: 0, note: '沿岸部一部' }
    };

    function evaluate(prop) {
        var loc = prop['所在地'] || '';
        if (!loc) return null;
        var hit = null;
        var hitKey = null;
        for (var key in CITY_HAZARD) {
            if (loc.indexOf(key) >= 0) { hit = CITY_HAZARD[key]; hitKey = key; break; }
        }
        if (!hit) return null;
        var maxRisk = Math.max(hit.tsunami, hit.flood, hit.landslide);
        var delta = 0;
        var label = '';
        if (maxRisk === 2) { delta = -2; label = hitKey + 'ハザード高(' + hit.note + ')'; }
        else if (maxRisk === 1) { delta = -1; label = hitKey + 'ハザード中(' + hit.note + ')'; }
        else { delta = 0; label = hitKey + 'ハザード低'; }
        return {
            tsunami: hit.tsunami,
            flood: hit.flood,
            landslide: hit.landslide,
            note: hit.note,
            delta: delta,
            reason: label
        };
    }

    return { evaluate: evaluate };
})();
