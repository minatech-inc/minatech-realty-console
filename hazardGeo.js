/**
 * 物件ピンポイント ハザード評価（reinfolib 11空間API統合）
 *
 * 緯度経度から以下のハザードAPIを呼び出し、減点/加点を集計：
 *   XKT026 洪水浸水想定（想定最大規模）
 *   XKT027 高潮浸水想定
 *   XKT028 津波浸水想定
 *   XKT029 土砂災害警戒区域
 *   XKT020 大規模盛土造成地
 *   XKT021 地すべり防止地区
 *   XKT022 急傾斜地崩壊危険区域
 *   XKT025 液状化発生傾向
 *   XKT016 災害危険区域
 *   XST001 災害履歴
 *   XGT001 指定緊急避難場所（加点）
 */
var HazardGeo = (function() {
    'use strict';

    var Z = 14; // 国交省空間APIはz=14必須（z=13以下は400エラー）

    // 浸水深カテゴリから減点を決定
    // reinfolib XKT026/027/028 の properties.A31a_101 等で浸水深ランクが返る
    function floodDepthPenalty(depthRank) {
        // ランクは「0.5m未満」「0.5-3m」「3-5m」「5-10m」「10m以上」等
        if (!depthRank) return { delta: 0, label: '' };
        var r = String(depthRank);
        if (r.indexOf('10m') >= 0 || r.indexOf('20m') >= 0) return { delta: -3, label: '浸水深10m以上' };
        if (r.indexOf('5m') >= 0 && r.indexOf('5m未満') < 0) return { delta: -2, label: '浸水深5m以上' };
        if (r.indexOf('3m') >= 0) return { delta: -2, label: '浸水深3-5m' };
        if (r.indexOf('0.5m') >= 0 || r.indexOf('未満') >= 0) return { delta: -1, label: '浸水深0.5-3m' };
        return { delta: -1, label: '浸水想定区域内' };
    }

    // ハザードFeatureから深度プロパティを取得
    function extractDepth(props) {
        if (!props) return null;
        return props.A31a_101 || props.A40_003 || props.A40_004 ||
               props.flood_depth_rank || props.depth_rank ||
               props.hazard_rank || null;
    }

    // 1物件についての全ハザード評価
    function evaluate(lat, lng) {
        var tile = Geocoder.lngLatToTile(lng, lat, Z);
        var results = {
            lat: lat, lng: lng, z: Z,
            hits: [],     // [{ type, delta, label, source, depth? }]
            totalDelta: 0,
            shelterNearest: null  // 最寄り避難場所までの距離(m)
        };

        var tasks = [];

        // === 減点系（浸水・土砂・液状化等） ===
        var penaltyDefs = [
            { code: 'XKT026', type: '洪水浸水', hasDepth: true },
            { code: 'XKT027', type: '高潮浸水', hasDepth: true },
            { code: 'XKT028', type: '津波浸水', hasDepth: true },
            { code: 'XKT029', type: '土砂災害警戒区域', hasDepth: false },
            { code: 'XKT020', type: '大規模盛土造成地', hasDepth: false },
            { code: 'XKT021', type: '地すべり防止地区', hasDepth: false },
            { code: 'XKT022', type: '急傾斜地崩壊危険区域', hasDepth: false },
            { code: 'XKT025', type: '液状化発生傾向', hasDepth: false },
            { code: 'XKT016', type: '災害危険区域', hasDepth: false }
        ];

        penaltyDefs.forEach(function(def) {
            tasks.push(
                ReinfolibClient.fetchByTile(def.code, tile.z, tile.x, tile.y)
                    .then(function(geo) {
                        var hits = ReinfolibClient.featuresContaining(geo, lat, lng);
                        if (hits.length === 0) return;
                        if (def.hasDepth) {
                            var depth = extractDepth(hits[0].properties);
                            var p = floodDepthPenalty(depth);
                            results.hits.push({
                                type: def.type, delta: p.delta,
                                label: def.type + '（' + (p.label || '区域内') + '）',
                                source: def.code, depth: depth
                            });
                            results.totalDelta += p.delta;
                        } else {
                            // 土砂災害は特別警戒区域の判定
                            var label = def.type + '区域内';
                            var delta = -2;
                            // XKT029は警戒/特別警戒が properties.A33_001 などで区別される場合あり
                            if (def.code === 'XKT029') {
                                var cat = hits[0].properties &&
                                    (hits[0].properties.A33_001 || hits[0].properties.category);
                                if (cat && String(cat).indexOf('特別') >= 0) {
                                    label = '土砂災害特別警戒区域内'; delta = -3;
                                }
                            }
                            results.hits.push({
                                type: def.type, delta: delta, label: label, source: def.code
                            });
                            results.totalDelta += delta;
                        }
                    })
                    .catch(function(e) {
                        // 個別APIエラーは握りつぶす（全APIが落ちない限り継続）
                        console.warn('reinfolib ' + def.code + ' 失敗: ', e.message);
                    })
            );
        });

        // === 災害履歴 ===
        tasks.push(
            ReinfolibClient.fetchByTile('XST001', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var nearby = ReinfolibClient.featuresWithDistance(geo, lat, lng, 500);
                    if (nearby.length > 0) {
                        results.hits.push({
                            type: '災害履歴', delta: -1,
                            label: '過去の災害履歴が近隣500m以内に' + nearby.length + '件',
                            source: 'XST001'
                        });
                        results.totalDelta -= 1;
                    }
                })
                .catch(function(e) { console.warn('XST001 失敗: ', e.message); })
        );

        // === 加点: 指定緊急避難場所 ===
        tasks.push(
            ReinfolibClient.fetchByTile('XGT001', tile.z, tile.x, tile.y)
                .then(function(geo) {
                    var nearby = ReinfolibClient.featuresWithDistance(geo, lat, lng, 500);
                    if (nearby.length > 0) {
                        results.shelterNearest = Math.round(nearby[0].distance);
                        results.hits.push({
                            type: '避難場所', delta: 1,
                            label: '指定緊急避難場所が500m以内（最寄' +
                                results.shelterNearest + 'm）',
                            source: 'XGT001'
                        });
                        results.totalDelta += 1;
                    }
                })
                .catch(function(e) { console.warn('XGT001 失敗: ', e.message); })
        );

        return Promise.all(tasks).then(function() {
            // ハザード総減点に下限設定: 最大-6（10点満点で複数重複時の暴走防止）
            if (results.totalDelta < -6) results.totalDelta = -6;
            return results;
        });
    }

    return { evaluate: evaluate };
})();
