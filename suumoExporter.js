/**
 * SUUMO 入稿モデル変換 + 特徴項目自動判定 + コンプライアンスチェッカー
 *
 * 物件分析データ（reins-analyzer の Property オブジェクト）から
 *   1) SUUMO 入稿フォーマットに沿った構造化データを生成
 *   2) 特徴項目（特ピク）を自動判定
 *   3) キャッチコメント等のコンプライアンスをチェック
 */
var SuumoExporter = (function() {
    'use strict';

    // ======== 物件種別の自動推定 ========
    function inferPropertyType(prop) {
        var cat = (prop['カテゴリ'] || prop['__cat'] || '').toLowerCase();
        var name = String(prop['物件名'] || '');
        var bldg = parseFloat(prop['建物面積(㎡)']) || 0;
        var land = parseFloat(prop['土地面積(㎡)']) || 0;
        var area = parseFloat(prop['面積(㎡)'] || prop['専有面積(㎡)']) || 0;
        var typ = prop['物件種別'] || prop['物件種類'] || '';

        if (cat === 'land' || /土地/.test(typ)) return 'land';
        if (cat === 'condo' || cat === 'mansion' || /マンション/.test(typ) || /マンション/.test(name)) return 'mansion';
        if (/タウンハウス/.test(typ)) return 'townhouse';
        if (/テラスハウス/.test(typ)) return 'terrace';
        if (cat === 'house' || /戸建/.test(typ)) return 'house';
        // 推定: 土地面積はあるが建物なし → 土地、専有面積あり → マンション、それ以外 → 戸建
        if (land > 0 && bldg === 0 && area === 0) return 'land';
        if (area > 0 && land === 0) return 'mansion';
        return 'house';
    }

    function inferBuildingStatus(prop, propType) {
        if (propType === 'land') return null;
        var age = parseFloat(prop['築年数']);
        if (isNaN(age)) {
            var built = parseChikunengetsu(prop['築年月']);
            if (built) {
                age = (new Date().getFullYear() - built.year) +
                      (new Date().getMonth() + 1 - built.month) / 12;
            }
        }
        var occupancy = String(prop['現況'] || '');
        if (age >= 1 && /(空室|未入居)/.test(occupancy)) return 'unlived';
        if (age < 1 && !/(賃貸|入居)/.test(occupancy)) return 'new';
        return 'used';
    }

    function parseChikunengetsu(str) {
        if (!str) return null;
        var m = String(str).match(/(\d{4})年(\d{1,2})月?/);
        if (m) return { year: parseInt(m[1]), month: parseInt(m[2]) };
        var era = String(str).match(/(昭和|平成|令和)(\d+)年(\d{1,2})?月?/);
        if (era) {
            var base = era[1] === '令和' ? 2018 : era[1] === '平成' ? 1988 : 1925;
            return { year: base + parseInt(era[2]), month: parseInt(era[3] || 1) };
        }
        return null;
    }

    // ======== Property → SUUMO入稿モデル変換 ========
    function buildSuumoModel(prop, brokerInfo) {
        var propType = inferPropertyType(prop);
        var buildStatus = inferBuildingStatus(prop, propType);
        var broker = Object.assign({}, SuumoSpec.DEFAULT_BROKER, brokerInfo || {});
        var model = {
            // メタ情報
            meta: {
                propertyType: propType,
                propertyTypeLabel: SuumoSpec.PROPERTY_TYPES[propType] ? SuumoSpec.PROPERTY_TYPES[propType].label : '戸建',
                buildingStatus: buildStatus,
                buildingStatusLabel: buildStatus && SuumoSpec.BUILDING_STATUS[buildStatus] ? SuumoSpec.BUILDING_STATUS[buildStatus].label : '',
                createdAt: new Date().toISOString(),
                source: 'reins-analyzer'
            },
            // 物件情報
            property: {
                name:        prop['物件名'] || '',
                address:     prop['所在地'] || '',
                addressLat:  prop['緯度'],
                addressLng:  prop['経度'],
                price:       toInt(prop['価格(万円)']),
                yieldRate:   toFloat(prop['表面利回り(%)']),
                station:     prop['駅徒歩(分)'] || '',
                useZone:     prop['用途地域'] || '',
                landArea:    toFloat(prop['土地面積(㎡)']),
                buildingArea:toFloat(prop['建物面積(㎡)']),
                exclusiveArea:toFloat(prop['面積(㎡)'] || prop['専有面積(㎡)']),
                balconyArea: toFloat(prop['バルコニー面積(㎡)']),
                rooms:       prop['間取り'] || '',
                floor:       toInt(prop['所在階']),
                totalFloors: toInt(prop['総階数']),
                direction:   prop['向き'] || '',
                structure:   prop['構造'] || '',
                builtDate:   prop['築年月'] || '',
                buildingAge: toFloat(prop['築年数']),
                tenureRight: prop['権利'] || '所有権',
                buildingCoverage: prop['建ぺい率'] || '',
                floorAreaRatio: prop['容積率'] || '',
                roadAccess:  prop['接道'] || '',
                management:  prop['管理形態'] || '',
                managementFee: toInt(prop['管理費(円/月)']),
                repairFee:   toInt(prop['修繕積立金(円/月)']),
                repairFund:  toInt(prop['修繕積立金基金(円)']),
                totalUnits:  toInt(prop['総戸数']),
                parking:     prop['駐車場'] || '',
                currentStatus: prop['現況'] || '',
                cityPlanning: prop['都市計画'] || '',
                landCategory: prop['地目'] || '',
                remarks:     prop['備考'] || '',
                buildingConfNo: prop['建築確認番号'] || ''
            },
            // 業者情報
            broker: broker,
            // 取引態様（仲介前提でデフォルト）
            tradeParty: {
                code:  'mediation_general',
                label: '仲介(一般媒介)'
            },
            // 売主情報（任意・仲介物件で必要時）
            seller: {
                socialName:    '',
                licenseNumber: '',
                hasOwnerInfo:  false
            },
            // 価格詳細
            pricing: {
                price:           toInt(prop['価格(万円)']),
                priceUnit:       '万円',
                feeNote:         broker.commission_note || '仲介手数料法定上限額',
                otherCosts:      []  // 後述で項目追加
            },
            // 解析結果由来の評価データ（特徴自動判定で参照）
            analysis: {
                score:          prop['スコア'],
                rank:           prop['評価ランク'],
                hazardGeo:      prop['__hazardGeo'] || null,
                cityPlan:       prop['__cityPlan']  || null,
                amenity:        prop['__amenity']   || null,
                population:     prop['__population']|| null,
                geo:            prop['__geo']       || null
            },
            // 特徴項目（自動判定結果）
            features: [],
            // キャッチコメント・コメント類
            copy: {
                mainCatch:   '',
                subCatch:    '',
                sellerComment: '',
                staffPR:     ''
            },
            // 画像（カテゴリ別）
            images: [],
            // その他制限事項
            specialDisclosures: []
        };
        // 特殊ケース表示
        var disc = collectSpecialDisclosures(prop);
        model.specialDisclosures = disc;
        // 特徴項目自動判定
        model.features = autoJudgeFeatures(prop, propType, buildStatus === 'used');
        // 取引にかかる費用候補（手数料は項目欄に表記推奨）
        if (model.tradeParty.code.indexOf('mediation') === 0) {
            model.pricing.otherCosts.push({
                label: '仲介手数料',
                amount: '物件本体価格の3.3% + 6.6万円',
                note:   '消費税込'
            });
        }
        return model;
    }

    function collectSpecialDisclosures(prop) {
        var out = [];
        var loc = String(prop['所在地'] || '');
        var note = String(prop['備考'] || '');
        var road = String(prop['接道'] || '');
        var buf = loc + ' ' + note + ' ' + road;
        SuumoSpec.SPECIAL_DISCLOSURES.forEach(function(s) {
            if (buf.indexOf(s.trigger) >= 0) {
                out.push(s.text);
            }
        });
        // ハザードGeo由来
        var hz = prop['__hazardGeo'];
        if (hz && hz.hits) {
            hz.hits.forEach(function(h) {
                if (h.type === '土砂災害特別警戒区域' || /特別警戒/.test(h.label)) {
                    out.push('土砂災害特別警戒区域内');
                }
            });
        }
        // 用途地域: 工業専用地域は住居建築不可
        if (/工業専用/.test(prop['用途地域'] || '')) {
            out.push('工業専用地域（住居建築不可）');
        }
        // 接道2m未満
        var rm = road.match(/接道\s*([\d.]+)\s*m/) || road.match(/間口\s*([\d.]+)\s*m/);
        if (rm && parseFloat(rm[1]) < 2) {
            out.push('接道2m未満（再建築困難）');
        }
        return Array.from(new Set(out));
    }

    // ======== 特徴項目の自動判定 ========
    function autoJudgeFeatures(prop, propType, isUsed) {
        var typeMap = { 'house':'h', 'terrace':'t', 'land':'l', 'mansion':'m', 'townhouse':'tw' };
        var typeCode = typeMap[propType] || 'h';
        var hits = [];

        function on(id, evidence) {
            var f = SuumoFeatures.findById(id);
            if (!f) return;
            if (f.applies.indexOf(typeCode) < 0) return;
            if (f.usedOnly && !isUsed) return;
            hits.push({ id: id, label: f.label, category: f.category, evidence: evidence });
        }

        // 用途地域系
        var zone = String(prop['用途地域'] || '');
        if (/低層住居専用/.test(zone)) {
            on('quiet_area', '用途地域が低層住居専用地域');
            on('green_area', '用途地域が低層住居専用地域');
        }

        // 駅徒歩
        var stationStr = String(prop['駅徒歩(分)'] || '');
        var sm = stationStr.match(/徒歩\s*(\d+)/);
        if (sm) {
            var minutes = parseInt(sm[1]);
            if (minutes <= 5) on('station_flat', '駅徒歩' + minutes + '分（5分以内）');
        }

        // 接道
        var road = String(prop['接道'] || '');
        var rw = road.match(/幅員\s*([\d.]+)/);
        if (rw && parseFloat(rw[1]) >= 6) on('road_6m', '前面道路幅員' + rw[1] + 'm');
        if (/南/.test(road)) on('south_road', '南側道路接面');

        // 土地面積
        var land = parseFloat(prop['土地面積(㎡)']) || 0;
        if (land >= 165.29) on('land_50tsubo', '土地面積' + land + '㎡（50坪以上）');
        if (land >= 330.58) on('land_100tsubo', '土地面積' + land + '㎡（100坪以上）');

        // 建物面積・LDK広さ
        var rooms = String(prop['間取り'] || '');
        var bldg = parseFloat(prop['建物面積(㎡)']) || 0;
        if (bldg > 100) on('ldk_18', '建物面積' + bldg + '㎡');

        // 構造・階数
        var structure = String(prop['構造'] || '');
        if (/2階建/.test(structure) && propType === 'house') on('two_story', '構造記載「2階建」');
        if (/3階建/.test(structure) && propType === 'house') on('three_story', '構造記載「3階建以上」');

        // 駐車場
        var parking = String(prop['駐車場'] || '');
        var pmatch = parking.match(/(\d+)\s*台/);
        if (pmatch) {
            var n = parseInt(pmatch[1]);
            if (n >= 2 && propType !== 'land') on('parking_2', '駐車場' + n + '台');
            if (n >= 3 && (propType === 'house' || propType === 'terrace')) on('parking_3', '駐車場' + n + '台');
        }
        if (/(ビルトイン|ガレージ)/.test(parking)) on('builtin_garage', '駐車場記載「ビルトイン」');

        // 都市ガス
        var setsubi = String(prop['設備'] || '') + ' ' + String(prop['備考'] || '');
        if (/都市ガス/.test(setsubi)) on('urban_gas', '設備記載「都市ガス」');
        if (/オール電化/.test(setsubi)) on('all_electric', '設備記載「オール電化」');

        // === 空間API由来 ===
        var amenity = prop['__amenity'];
        if (amenity && amenity.nearbyAmenities) {
            // 学校徒歩10分以内（XKT006で800m=徒歩10分）
            if (amenity.nearbyAmenities['学校'] && amenity.nearbyAmenities['学校'].nearest <= 800) {
                on('near_school', '空間API: 学校が' + amenity.nearbyAmenities['学校'].nearest + 'm（800m=徒歩10分以内）');
            }
            // 医療機関1km以内
            if (amenity.nearbyAmenities['医療機関'] && amenity.nearbyAmenities['医療機関'].nearest <= 800) {
                on('near_hospital', '空間API: 医療機関が' + amenity.nearbyAmenities['医療機関'].nearest + 'm');
            }
        }
        if (amenity && amenity.stationDaily >= 50000) {
            // 主要駅・始発駅相当
            on('multi_lines', '駅乗降客数 ' + amenity.stationDaily + '人/日（主要駅級）');
        }

        // ハザード由来：水害なし→リバーサイドは却下、平坦地は採用
        var hazardGeo = prop['__hazardGeo'];
        if (hazardGeo && hazardGeo.hits) {
            var hasFlood = hazardGeo.hits.some(function(h) { return /(洪水|高潮|津波)/.test(h.type); });
            var hasLandslide = hazardGeo.hits.some(function(h) { return /(土砂|急傾斜|地すべり)/.test(h.type); });
            if (!hasFlood && !hasLandslide) on('flat_land', '空間API: 浸水・土砂災害区域に該当なし');
        }

        // 都市計画区域
        var cp = prop['__cityPlan'];
        if (cp) {
            if (/市街化区域/.test(cp.cityPlanArea || '')) on('developed', '都市計画: 市街化区域内');
            if (cp.useZone && /商業/.test(cp.useZone)) on('near_city', '都市計画: 商業地域に近接');
            if (cp.useZone && /低層住居専用/.test(cp.useZone)) {
                on('quiet_area', '都市計画: 低層住居専用地域');
                on('green_area', '都市計画: 低層住居専用地域');
            }
        }

        // 角地（接道に「角」記載）
        if (/角/.test(road)) on('corner', '接道記載「角」');

        // 中古特化
        if (isUsed) {
            // リフォーム履歴があれば
            if (/リフォーム/.test(prop['備考'] || '')) on('refurb_full', '備考にリフォーム記載');
            if (/リノベ/.test(prop['備考'] || '')) on('renovation', '備考にリノベ記載');
        }

        // 即引渡可
        if (/(空家|空室|引渡可|相談)/.test(prop['現況'] || '')) on('immediate', '現況: 即引渡可');

        return hits;
    }

    // ======== コンプライアンスチェッカー ========
    function checkCompliance(model, copyText) {
        var issues = [];
        // 必須項目
        var propType = model.meta.propertyType;
        var formCode = SuumoSpec.PROPERTY_TYPES[propType] ? SuumoSpec.PROPERTY_TYPES[propType].form : 'house';
        var commonReq = SuumoSpec.REQUIRED_FIELDS.common;
        var typeReq   = SuumoSpec.REQUIRED_FIELDS[formCode] || [];
        var allReq    = commonReq.concat(typeReq);

        allReq.forEach(function(req) {
            var v = lookupField(model, req.key);
            if (req.condition === 'used' && model.meta.buildingStatus !== 'used') return;
            if (req.condition === 'incomplete') return; // TODO: 完成時期と比較
            if (v === undefined || v === null || v === '' || v === 0) {
                issues.push({
                    severity: 'error',
                    field:    req.key,
                    message:  '必須項目「' + req.label + '」が未入力です'
                });
            }
        });

        // キャッチコメント禁止用語チェック
        var copy = copyText || (model.copy.mainCatch + ' ' + model.copy.subCatch + ' ' + model.copy.staffPR);
        SuumoSpec.FORBIDDEN_TERMS.forEach(function(f) {
            if (copy.indexOf(f.term) >= 0) {
                issues.push({
                    severity: 'error',
                    field:    'キャッチコメント',
                    message:  '禁止用語「' + f.term + '」: ' + f.reason
                });
            }
        });
        SuumoSpec.EVIDENCE_REQUIRED_TERMS.forEach(function(f) {
            if (copy.indexOf(f.term) >= 0) {
                issues.push({
                    severity: 'warning',
                    field:    'キャッチコメント',
                    message:  '要注意「' + f.term + '」: ' + f.advice
                });
            }
        });

        // 価格規約
        if (model.property.price < 100 && model.property.price > 0) {
            issues.push({
                severity: 'warning',
                field:    '価格',
                message:  '100万円未満の物件は確認推奨（価格表記単位は万円）'
            });
        }

        // 工業専用地域は住居建築不可（土地・新築の場合は警告）
        if (/工業専用/.test(model.property.useZone || '')) {
            issues.push({
                severity: 'error',
                field:    '用途地域',
                message:  '工業専用地域は住居建築不可のためSUUMO掲載不可（規約）'
            });
        }

        // 売主物件で売主情報未設定
        if (model.tradeParty.code === 'seller' && !model.seller.socialName) {
            issues.push({
                severity: 'warning',
                field:    '売主情報',
                message:  '売主物件の場合は売主社名と免許番号の表示を推奨'
            });
        }
        // 仲介物件で売主情報未設定（販売10戸以上で必要）
        if (model.tradeParty.code.indexOf('mediation') === 0 && !model.seller.socialName) {
            issues.push({
                severity: 'info',
                field:    '売主情報',
                message:  '仲介物件: 販売10戸以上の場合は売主社名+免許番号の併記が必須'
            });
        }

        // 中古マンションで管理費未入力
        if (propType === 'mansion' && model.meta.buildingStatus === 'used' && !model.property.managementFee) {
            issues.push({
                severity: 'error',
                field:    '管理費',
                message:  '中古マンションは管理費の記載が必須'
            });
        }

        return issues;
    }

    function lookupField(model, key) {
        // 入稿項目キーをモデルパスにマッピング
        var map = {
            '所在地':         model.property.address,
            '価格':           model.property.price,
            '取引態様':       model.tradeParty.label,
            '広告主社名':     model.broker.social_name,
            '広告主免許番号': model.broker.license_number,
            '取引条件有効期限': model.broker.term_expiry || '',
            '土地面積':       model.property.landArea,
            '建物面積':       model.property.buildingArea,
            '専有面積':       model.property.exclusiveArea,
            '間取り':         model.property.rooms,
            '築年月':         model.property.builtDate,
            '構造':           model.property.structure,
            '完成時期':       model.property.builtDate || model.property.completionDate,
            '引渡可能時期':   model.property.handoverDate,
            '前面道路':       model.property.roadAccess,
            '私道負担':       model.property.privateRoad || '',
            '用途地域':       model.property.useZone,
            '建ぺい率':       model.property.buildingCoverage,
            '容積率':         model.property.floorAreaRatio,
            '地目':           model.property.landCategory,
            '敷地権利':       model.property.tenureRight,
            '上水道':         model.property.water,
            '下水道':         model.property.sewer,
            'ガス':           model.property.gas,
            '建築確認番号':   model.property.buildingConfNo,
            '土地状況':       model.property.landStatus || '',
            '造成完了予定':   model.property.developmentDate || '',
            '建築条件':       model.property.constructionCondition || '',
            '階数':           model.property.totalFloors,
            '所在階':         model.property.floor,
            '向き':           model.property.direction,
            'バルコニー面積': model.property.balconyArea,
            '管理費':         model.property.managementFee,
            '修繕積立金':     model.property.repairFee,
            '修繕積立基金':   model.property.repairFund,
            '管理形態':       model.property.management,
            '管理員':         model.property.managementStaff || '',
            '総戸数':         model.property.totalUnits
        };
        return map[key];
    }

    // ======== 出力フォーマット ========
    // SUUMO入稿シート用 HTML（プリンタブル + コピペボタン）
    function renderInsertSheet(model) {
        var sections = [];
        var p = model.property;
        var br = model.broker;
        var pt = model.meta.propertyTypeLabel;
        var bs = model.meta.buildingStatusLabel;

        var sheet = '';
        sheet += '<div class="suumo-sheet" style="font-family:sans-serif;max-width:880px;margin:auto;padding:20px;background:#fff;color:#222;">';
        sheet += '<h1 style="border-bottom:3px solid #4caf50;padding-bottom:8px;">SUUMO入稿シート — ' + escapeHtml(p.name || p.address || '無題') + '</h1>';
        sheet += '<p style="color:#666;font-size:13px;">物件種別: <b>' + pt + '</b> / 建物状況: <b>' + bs + '</b> / 生成: ' + new Date().toLocaleString('ja-JP') + '</p>';

        sheet += renderSection('物件基本情報', [
            ['物件名',       p.name],
            ['所在地',       p.address],
            ['販売価格',     p.price ? (p.price + '万円') : ''],
            ['交通',         p.station],
            ['用途地域',     p.useZone],
            ['取引態様',     model.tradeParty.label],
            ['取引条件有効期限', getDefaultExpiry()]
        ]);

        if (model.meta.propertyType === 'land') {
            sheet += renderSection('土地情報', [
                ['土地面積',     p.landArea + ' ㎡'],
                ['土地状況',     p.landStatus || '更地'],
                ['地目',         p.landCategory || '宅地'],
                ['建ぺい率',     p.buildingCoverage],
                ['容積率',       p.floorAreaRatio],
                ['前面道路',     p.roadAccess],
                ['私道負担',     p.privateRoad || '無'],
                ['建築条件',     p.constructionCondition || 'なし'],
                ['敷地権利',     p.tenureRight]
            ]);
        } else if (model.meta.propertyType === 'mansion' || model.meta.propertyType === 'townhouse') {
            sheet += renderSection('マンション情報', [
                ['専有面積',     p.exclusiveArea + ' ㎡'],
                ['バルコニー面積', p.balconyArea ? (p.balconyArea + ' ㎡') : ''],
                ['間取り',       p.rooms],
                ['構造',         p.structure],
                ['階建',         p.totalFloors ? (p.totalFloors + '階建') : ''],
                ['所在階',       p.floor ? (p.floor + '階') : ''],
                ['向き',         p.direction],
                ['築年月',       p.builtDate],
                ['総戸数',       p.totalUnits],
                ['管理費',       p.managementFee ? (formatNum(p.managementFee) + '円/月') : ''],
                ['修繕積立金',   p.repairFee ? (formatNum(p.repairFee) + '円/月') : ''],
                ['修繕積立基金', p.repairFund ? (formatNum(p.repairFund) + '円') : ''],
                ['管理形態',     p.management]
            ]);
        } else {
            sheet += renderSection('戸建情報', [
                ['土地面積',     p.landArea + ' ㎡'],
                ['建物面積',     p.buildingArea + ' ㎡'],
                ['間取り',       p.rooms],
                ['構造',         p.structure],
                ['築年月',       p.builtDate],
                ['駐車場',       p.parking],
                ['前面道路',     p.roadAccess],
                ['用途地域',     p.useZone],
                ['建ぺい率',     p.buildingCoverage],
                ['容積率',       p.floorAreaRatio],
                ['地目',         p.landCategory],
                ['敷地権利',     p.tenureRight],
                ['現況',         p.currentStatus],
                ['建築確認番号', p.buildingConfNo]
            ]);
        }

        // 特徴項目
        if (model.features.length > 0) {
            var featRows = [];
            var byCat = {};
            model.features.forEach(function(f) {
                byCat[f.category] = byCat[f.category] || [];
                byCat[f.category].push(f.label);
            });
            Object.keys(byCat).forEach(function(c) {
                featRows.push([c, byCat[c].join(' / ')]);
            });
            sheet += renderSection('特徴項目（自動判定 ' + model.features.length + '件）', featRows);
        }

        // その他制限事項
        if (model.specialDisclosures.length > 0) {
            sheet += renderSection('その他制限事項', model.specialDisclosures.map(function(t, i) {
                return ['#' + (i + 1), t];
            }));
        }

        // 業者情報
        sheet += renderSection('広告主情報', [
            ['社名',         br.social_name],
            ['免許番号',     br.license_number],
            ['所属団体',     br.association],
            ['電話',         br.phone],
            ['住所',         br.address],
            ['公取協',       br.association_council]
        ]);

        // コピー（ある場合）
        if (model.copy.mainCatch) {
            sheet += renderSection('キャッチコメント', [
                ['メインキャッチ', model.copy.mainCatch],
                ['サブキャッチ',   model.copy.subCatch],
                ['担当者PR',       model.copy.staffPR]
            ]);
        }

        sheet += '<div style="margin-top:20px;padding:12px;background:#fffde7;border-left:4px solid #fbc02d;font-size:12px;">';
        sheet += '※このシートは SUUMO入稿時のチェックリストです。SUUMO管理画面に手動で入力する際の補助としてお使いください。各項目の「コピー」ボタンでクリップボードへ転送できます。';
        sheet += '</div>';
        sheet += '</div>';
        return sheet;
    }

    function renderSection(title, rows) {
        var html = '<h2 style="margin-top:24px;background:#e8f5e9;padding:6px 10px;font-size:16px;border-left:4px solid #4caf50;">' + title + '</h2>';
        html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
        rows.forEach(function(r) {
            var label = r[0], value = r[1];
            if (value === undefined || value === null || value === '') value = '<span style="color:#aaa;">未設定</span>';
            html += '<tr style="border-bottom:1px solid #eee;">';
            html += '<th style="text-align:left;padding:6px 10px;width:30%;background:#f5f5f5;font-weight:normal;color:#555;">' + escapeHtml(label) + '</th>';
            html += '<td style="padding:6px 10px;">';
            html += '<span data-copy-text="' + escapeAttr(value === '<span style="color:#aaa;">未設定</span>' ? '' : String(value).replace(/<[^>]*>/g,'')) + '">' + value + '</span>';
            if (value && value !== '<span style="color:#aaa;">未設定</span>') {
                html += ' <button class="suumo-copy-btn" type="button" style="margin-left:8px;font-size:11px;padding:2px 8px;background:#4caf50;color:#fff;border:none;border-radius:3px;cursor:pointer;">コピー</button>';
            }
            html += '</td></tr>';
        });
        html += '</table>';
        return html;
    }

    function escapeHtml(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    function escapeAttr(s) {
        return escapeHtml(s).replace(/"/g, '&quot;');
    }
    function formatNum(n) {
        return Number(n).toLocaleString('ja-JP');
    }
    function toInt(v) {
        if (v === undefined || v === null || v === '') return null;
        var n = parseInt(String(v).replace(/[^\d.-]/g, ''));
        return isNaN(n) ? null : n;
    }
    function toFloat(v) {
        if (v === undefined || v === null || v === '') return null;
        var n = parseFloat(String(v).replace(/[^\d.-]/g, ''));
        return isNaN(n) ? null : n;
    }
    function getDefaultExpiry() {
        var d = new Date();
        d.setDate(d.getDate() + 8); // 規定: 情報提供から8日以内
        return d.getFullYear() + '/' +
            String(d.getMonth() + 1).padStart(2, '0') + '/' +
            String(d.getDate()).padStart(2, '0');
    }

    // ======== JSON / CSV 出力 ========
    function exportJSON(model) {
        return JSON.stringify(model, null, 2);
    }

    // SUUMO入稿仕様に近い列名でCSV化（汎用フォーマット・SaaS連携想定）
    function exportCSV(models) {
        if (!Array.isArray(models)) models = [models];
        var headers = [
            'meta.propertyType','meta.buildingStatus',
            'property.name','property.address',
            'property.price','property.station','property.useZone',
            'property.landArea','property.buildingArea','property.exclusiveArea','property.balconyArea',
            'property.rooms','property.floor','property.totalFloors','property.direction',
            'property.structure','property.builtDate','property.tenureRight',
            'property.buildingCoverage','property.floorAreaRatio',
            'property.roadAccess','property.management','property.managementFee',
            'property.repairFee','property.repairFund','property.totalUnits',
            'property.parking','property.currentStatus','property.landCategory',
            'property.buildingConfNo','property.remarks',
            'broker.social_name','broker.license_number',
            'tradeParty.label',
            'features.ids','specialDisclosures','copy.mainCatch'
        ];
        var rows = [headers.join(',')];
        models.forEach(function(m) {
            var row = headers.map(function(h) {
                var v = h.split('.').reduce(function(o, k) { return (o == null) ? '' : o[k]; }, m);
                if (h === 'features.ids') v = (m.features || []).map(function(f) { return f.id; }).join('|');
                if (h === 'specialDisclosures') v = (m.specialDisclosures || []).join('|');
                if (v === undefined || v === null) v = '';
                v = String(v).replace(/"/g, '""');
                return /[,"\n]/.test(v) ? '"' + v + '"' : v;
            });
            rows.push(row.join(','));
        });
        return rows.join('\n');
    }

    return {
        buildSuumoModel: buildSuumoModel,
        autoJudgeFeatures: autoJudgeFeatures,
        checkCompliance: checkCompliance,
        renderInsertSheet: renderInsertSheet,
        exportJSON: exportJSON,
        exportCSV: exportCSV,
        inferPropertyType: inferPropertyType,
        inferBuildingStatus: inferBuildingStatus
    };
})();
