/**
 * 生活環境 ピンポイント評価（reinfolib 10空間API統合）
 *
 *   XKT004 小学校区     XKT005 中学校区
 *   XKT006 学校          XKT007 保育園・幼稚園
 *   XKT010 医療機関      XKT011 福祉施設
 *   XKT015 駅別乗降客数  XKT017 図書館
 *   XKT018 市区町村役場/集会施設
 *   XKT031 人口集中地区（DID）
 */
var AmenityGeo = (function() {
    'use strict';

    var Z = 14; // reinfolib空間APIはz=14必須

    // 人気学区（神奈川・東京の名門公立エリア）
    // マッチしたら +1 点（名門学区効果は家賃・価格に直結）
    var POPULAR_SCHOOLS = [
        '浜須賀', '鶴嶺', '鶴が台', '松が丘', '茅ヶ崎', '香川',   // 茅ヶ崎
        '湘南台', '鵠沼', '六会日大', '大清水', '八松',           // 藤沢
        '第二', '第一', '御成', '稲村ヶ崎', '腰越', '玉縄',       // 鎌倉
        '深沢', '久木', '小坪', '池子',                            // 逗子
        '番町', '麹町', '白金', '青南', '広尾', '誠之',           // 東京名門
        '久松', '泰明', '常盤', '城東',                            // 中央区
        '岩崎', '勝どき'
    ];

    function isPopularSchool(name) {
        if (!name) return false;
        for (var i = 0; i < POPULAR_SCHOOLS.length; i++) {
            if (name.indexOf(POPULAR_SCHOOLS[i]) >= 0) return true;
        }
        return false;
    }

    function evaluate(lat, lng) {
        var tile = Geocoder.lngLatToTile(lng, lat, Z);
        var results = {
            lat: lat, lng: lng, z: Z,
            schoolDistrict: { elementary: null, junior: null },
            nearbyAmenities: {},
            stationDaily: null,
            inDID: false,
            hits: [],
            totalDelta: 0
        };

        var tasks = [];

        // 小学校区 (XKT004)
        tasks.push(
            ReinfolibClient.fetchByTile('XKT004', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length === 0) return;
                    var p = in_[0].properties || {};
                    var name = p.A27_006 || p.school_name || p.name || '';
                    results.schoolDistrict.elementary = name;
                    if (isPopularSchool(name)) {
                        results.hits.push({
                            type: '学区', delta: 1,
                            label: '人気小学校区「' + name + '」',
                            source: 'XKT004'
                        });
                        results.totalDelta += 1;
                    }
                })
                .catch(function(e) { console.warn('XKT004 失敗: ', e.message); })
        );

        // 中学校区 (XKT005)
        tasks.push(
            ReinfolibClient.fetchByTile('XKT005', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length === 0) return;
                    var p = in_[0].properties || {};
                    var name = p.A32_006 || p.school_name || p.name || '';
                    results.schoolDistrict.junior = name;
                    if (isPopularSchool(name)) {
                        results.hits.push({
                            type: '学区', delta: 0.5,
                            label: '人気中学校区「' + name + '」',
                            source: 'XKT005'
                        });
                        results.totalDelta += 0.5;
                    }
                })
                .catch(function(e) { console.warn('XKT005 失敗: ', e.message); })
        );

        // 学校・保育・医療・福祉・図書・役場 (XKT006/007/010/011/017/018)
        // 500m以内にあれば +0.1〜0.5
        var proximityDefs = [
            { code: 'XKT006', type: '学校', bonus: 0.5, maxM: 800, label: '徒歩圏内に学校' },
            { code: 'XKT007', type: '保育/幼稚園', bonus: 0.5, maxM: 800, label: '500m以内に保育・幼稚園' },
            { code: 'XKT010', type: '医療機関', bonus: 0.5, maxM: 1000, label: '1km以内に医療機関' },
            { code: 'XKT011', type: '福祉施設', bonus: 0.3, maxM: 1000, label: '1km以内に福祉施設' },
            { code: 'XKT017', type: '図書館', bonus: 0.2, maxM: 1500, label: '1.5km以内に図書館' },
            { code: 'XKT018', type: '役場・集会施設', bonus: 0.1, maxM: 1500, label: '近隣に公共施設' }
        ];

        proximityDefs.forEach(function(def) {
            tasks.push(
                ReinfolibClient.fetchByTile(def.code, tile.z, tile.x, tile.y)
                    .then(function(geo) {
                        var near = ReinfolibClient.featuresWithDistance(geo, lat, lng, def.maxM);
                        if (near.length === 0) return;
                        var nearest = Math.round(near[0].distance);
                        results.nearbyAmenities[def.type] = {
                            count: near.length,
                            nearest: nearest,
                            name: (near[0].feature.properties &&
                                (near[0].feature.properties.name ||
                                 near[0].feature.properties.P30_003 ||
                                 near[0].feature.properties.P04_002)) || ''
                        };
                        results.hits.push({
                            type: def.type, delta: def.bonus,
                            label: def.label + '（最寄' + nearest + 'm）',
                            source: def.code
                        });
                        results.totalDelta += def.bonus;
                    })
                    .catch(function(e) { console.warn(def.code + ' 失敗: ', e.message); })
            );
        });

        // 駅別乗降客数 (XKT015)
        // 最寄り駅の乗降客数で投資魅力を判定
        tasks.push(
            ReinfolibClient.fetchByTile('XKT015', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var near = ReinfolibClient.featuresWithDistance(geo, lat, lng, 1500);
                    if (near.length === 0) return;
                    var p = near[0].feature.properties || {};
                    // S12_009は最新年の乗降客数、年ごとに列名変動あり
                    var daily = 0;
                    for (var k in p) {
                        if (/S12_\d{3}/.test(k) && typeof p[k] === 'number' && p[k] > daily) {
                            daily = p[k];
                        }
                    }
                    if (!daily) daily = p.daily_passengers || p.passengers || 0;
                    if (daily > 0) {
                        results.stationDaily = daily;
                        var delta = 0, label = '';
                        if (daily >= 100000) { delta = 1.5; label = '主要駅(' + Math.round(daily/1000) + 'k/日)'; }
                        else if (daily >= 50000) { delta = 1; label = '主要駅(' + Math.round(daily/1000) + 'k/日)'; }
                        else if (daily >= 10000) { delta = 0.5; label = '中規模駅(' + Math.round(daily/1000) + 'k/日)'; }
                        else if (daily < 3000) { delta = -0.5; label = '小規模駅(' + daily + '人/日・需要弱)'; }
                        if (delta !== 0) {
                            results.hits.push({ type: '駅乗降客数', delta: delta, label: label, source: 'XKT015' });
                            results.totalDelta += delta;
                        }
                    }
                })
                .catch(function(e) { console.warn('XKT015 失敗: ', e.message); })
        );

        // 人口集中地区 DID (XKT031)
        tasks.push(
            ReinfolibClient.fetchByTile('XKT031', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var in_ = ReinfolibClient.featuresContaining(geo, lat, lng);
                    if (in_.length > 0) {
                        results.inDID = true;
                        results.hits.push({
                            type: 'DID', delta: 1,
                            label: '人口集中地区内（市場流動性高）',
                            source: 'XKT031'
                        });
                        results.totalDelta += 1;
                    } else {
                        results.hits.push({
                            type: 'DID', delta: -0.5,
                            label: 'DID外（郊外・過疎エリア）',
                            source: 'XKT031'
                        });
                        results.totalDelta -= 0.5;
                    }
                })
                .catch(function(e) { console.warn('XKT031 失敗: ', e.message); })
        );

        return Promise.all(tasks).then(function() {
            return results;
        });
    }

    return {
        evaluate: evaluate,
        isPopularSchool: isPopularSchool
    };
})();
