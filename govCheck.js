/**
 * 役所調査・行政手続きチェックリスト
 *
 * 物件種別と所在地情報から、調査が必要な役所・確認項目・持ち物・調査結果メモを
 * 自動生成し、進捗管理する。新人教育とミス防止が目的。
 *
 * データソース: IndexedDB (gov_checks ストア)
 * スキーマ: { id, propertyId, propertyName, address, category, items[], createdAt, updatedAt }
 *   items: [{ section, agency, what, docs, status, memo, completedAt }]
 */
var GovCheck = (function() {
    'use strict';

    var DB_NAME = 'reins_analyzer';
    var DB_VERSION = 3; // 既存DB v2 に v3 として追加
    var STORE = 'gov_checks';

    function open() {
        return new Promise(function(resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains('analyses')) {
                    var s1 = db.createObjectStore('analyses', { keyPath: 'id', autoIncrement: true });
                    s1.createIndex('createdAt', 'createdAt');
                    s1.createIndex('title', 'title');
                }
                if (!db.objectStoreNames.contains('properties')) {
                    var s2 = db.createObjectStore('properties', { keyPath: 'id', autoIncrement: true });
                    s2.createIndex('address', 'address');
                    s2.createIndex('propertyName', 'propertyName');
                    s2.createIndex('status', 'status');
                    s2.createIndex('updatedAt', 'updatedAt');
                    s2.createIndex('score', 'score');
                }
                if (!db.objectStoreNames.contains(STORE)) {
                    var s3 = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                    s3.createIndex('propertyId', 'propertyId');
                    s3.createIndex('updatedAt', 'updatedAt');
                }
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
        });
    }

    // ===== 物件種別ごとの調査項目テンプレート =====
    function generateChecklist(prop) {
        var category = (prop['物件カテゴリ'] || prop.category || 'condo').toLowerCase();
        var addr = prop['所在地'] || '';
        var isCondo = (category === 'condo');
        var isHouse = (category === 'house');
        var isLand = (category === 'land');

        var items = [];

        // ===== 法務局（共通・必須） =====
        items.push({
            section: '法務局', agency: '法務局（最寄りの登記所）',
            what: '登記事項証明書（甲区・乙区）',
            docs: '地番（公図で確認）、申請書',
            why: '所有者・抵当権・差押・賃借権等の権利関係を確認',
            status: 'pending', memo: ''
        });
        items.push({
            section: '法務局', agency: '法務局',
            what: '公図・地積測量図',
            docs: '地番',
            why: '土地の形状・隣地境界・面積を確認',
            status: 'pending', memo: ''
        });
        if (isCondo) {
            items.push({
                section: '法務局', agency: '法務局',
                what: '建物図面・各階平面図',
                docs: '家屋番号',
                why: '区分所有建物の構造・専有部分の確認',
                status: 'pending', memo: ''
            });
        } else {
            items.push({
                section: '法務局', agency: '法務局',
                what: '建物図面（建物がある場合）',
                docs: '家屋番号',
                why: '建物の構造・床面積の登記情報',
                status: 'pending', memo: ''
            });
        }

        // ===== 役所：都市計画・建築指導 =====
        items.push({
            section: '役所', agency: '都市計画課（市区町村役場）',
            what: '都市計画図・用途地域・建蔽率・容積率',
            docs: '住所メモ・公図',
            why: '用途地域、防火地域、地区計画、高度地区、風致地区等の確認',
            status: 'pending', memo: ''
        });
        items.push({
            section: '役所', agency: '建築指導課',
            what: '建築確認・検査済証の有無',
            docs: '建物の所在地・登記簿',
            why: '違反建築・既存不適格の確認、再建築可否',
            status: 'pending', memo: ''
        });
        if (!isCondo) {
            items.push({
                section: '役所', agency: '建築指導課または道路課',
                what: '接道状況・道路種別の確認',
                docs: '公図・配置図',
                why: '建築基準法上の道路（42条1項1-5号 / 2項道路）か。位置指定道路の有無',
                status: 'pending', memo: ''
            });
            items.push({
                section: '役所', agency: '道路課（土木課）',
                what: '道路幅員・私道の有無',
                docs: '公図',
                why: '前面道路の幅員・所有者・私道負担',
                status: 'pending', memo: ''
            });
        }

        // ===== 上下水道・ガス =====
        items.push({
            section: 'インフラ', agency: '上下水道局',
            what: '給排水管の埋設状況・本管口径・引込み有無',
            docs: '住所・建物所在地',
            why: '本管口径不足、私設管利用、引込み工事の必要性',
            status: 'pending', memo: ''
        });
        items.push({
            section: 'インフラ', agency: 'ガス会社（東京ガス・地元ガス会社）',
            what: 'ガス供給状況（都市ガス/プロパン）',
            docs: '住所',
            why: 'ガスの種類、引込み工事の要否',
            status: 'pending', memo: ''
        });

        // ===== 防災・ハザード =====
        items.push({
            section: '防災', agency: '市区町村防災課',
            what: '洪水・土砂・津波・高潮ハザードマップ',
            docs: '住所',
            why: '災害警戒区域・特別警戒区域該当の確認',
            status: 'pending', memo: ''
        });

        // ===== 物件種別特有の調査 =====
        if (isLand || isHouse) {
            items.push({
                section: '土地特有', agency: '農業委員会',
                what: '農地法該当の有無',
                docs: '登記簿（地目）',
                why: '地目が田・畑の場合、転用許可・届出が必要',
                status: 'pending', memo: ''
            });
            items.push({
                section: '土地特有', agency: '都市計画課・市区町村',
                what: '宅地造成等規制法',
                docs: '住所',
                why: '造成工事規制区域、急傾斜地崩壊危険区域の該当',
                status: 'pending', memo: ''
            });
            items.push({
                section: '土地特有', agency: '教育委員会（文化財課）',
                what: '埋蔵文化財包蔵地該当',
                docs: '住所',
                why: '該当する場合、建築前に試掘調査の届出義務',
                status: 'pending', memo: ''
            });
            items.push({
                section: '土地特有', agency: '市区町村役場（土壌汚染対策課等）',
                what: '土壌汚染対策法該当',
                docs: '住所・過去用途',
                why: '工場・ガソリンスタンド跡地などは要確認',
                status: 'pending', memo: ''
            });
        }

        if (isCondo) {
            items.push({
                section: '区分特有', agency: '管理会社（マンション）',
                what: '管理規約・使用細則',
                docs: '物件名・部屋番号',
                why: 'ペット可否・楽器・SOHO・リフォーム制限等',
                status: 'pending', memo: ''
            });
            items.push({
                section: '区分特有', agency: '管理会社',
                what: '長期修繕計画書',
                docs: '物件名',
                why: '大規模修繕実施履歴・今後の予定・積立金推移',
                status: 'pending', memo: ''
            });
            items.push({
                section: '区分特有', agency: '管理会社',
                what: '理事会議事録（過去2-3年分）',
                docs: '物件名',
                why: 'トラブル・訴訟・大規模修繕議論の有無',
                status: 'pending', memo: ''
            });
            items.push({
                section: '区分特有', agency: '管理会社',
                what: '管理費・修繕積立金の滞納状況',
                docs: '物件名・部屋番号',
                why: '前所有者の滞納がある場合、買主が負担することがある',
                status: 'pending', memo: ''
            });
        }

        // ===== 税務 =====
        items.push({
            section: '税務', agency: '市区町村税務課',
            what: '固定資産評価証明書・公課証明書',
            docs: '所有者の同意書（または委任状）、物件所在地',
            why: '固定資産税・都市計画税の精算基準、評価額の確認',
            status: 'pending', memo: ''
        });

        // ===== 近隣調査 =====
        items.push({
            section: '近隣', agency: '現地調査',
            what: '近隣の音・臭気・周辺施設（嫌悪施設）',
            docs: '現地メモ',
            why: '住環境の事実確認、買主への説明義務',
            status: 'pending', memo: ''
        });
        items.push({
            section: '近隣', agency: '現地調査',
            what: '境界の現況確認（境界標の有無）',
            docs: '公図、地積測量図',
            why: '隣地との越境・境界確定の状況',
            status: 'pending', memo: ''
        });

        return items;
    }

    // ===== DB 操作 =====
    function saveChecklist(prop, items) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                var store = tx.objectStore(STORE);
                var now = new Date().toISOString();
                var record = {
                    propertyId: prop.id || null,
                    propertyName: prop['物件名'] || '',
                    address: prop['所在地'] || '',
                    category: prop['物件カテゴリ'] || prop.category || '',
                    items: items,
                    createdAt: now,
                    updatedAt: now
                };
                // 同一物件IDで既存があれば更新
                if (record.propertyId) {
                    var idxReq = store.index('propertyId').openCursor(IDBKeyRange.only(record.propertyId));
                    idxReq.onsuccess = function(e) {
                        var cursor = e.target.result;
                        if (cursor) {
                            record.id = cursor.value.id;
                            record.createdAt = cursor.value.createdAt;
                            cursor.update(record);
                            resolve(record);
                            return;
                        }
                        var addReq = store.add(record);
                        addReq.onsuccess = function() { record.id = addReq.result; resolve(record); };
                        addReq.onerror = function(e) { reject(e.target.error); };
                    };
                    idxReq.onerror = function(e) { reject(e.target.error); };
                } else {
                    var addReq = store.add(record);
                    addReq.onsuccess = function() { record.id = addReq.result; resolve(record); };
                    addReq.onerror = function(e) { reject(e.target.error); };
                }
            });
        });
    }

    function listAll() {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE, 'readonly');
                var store = tx.objectStore(STORE);
                var req = store.getAll();
                req.onsuccess = function() {
                    var items = req.result || [];
                    items.sort(function(a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });
                    resolve(items);
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function deleteChecklist(id) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                var req = tx.objectStore(STORE).delete(id);
                req.onsuccess = function() { resolve(true); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function updateItemStatus(checklistId, itemIndex, status, memo) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                var store = tx.objectStore(STORE);
                var req = store.get(checklistId);
                req.onsuccess = function() {
                    var rec = req.result;
                    if (!rec || !rec.items[itemIndex]) { reject(new Error('not found')); return; }
                    rec.items[itemIndex].status = status;
                    if (memo !== undefined) rec.items[itemIndex].memo = memo;
                    if (status === 'done') rec.items[itemIndex].completedAt = new Date().toISOString();
                    rec.updatedAt = new Date().toISOString();
                    var putReq = store.put(rec);
                    putReq.onsuccess = function() { resolve(rec); };
                    putReq.onerror = function(e) { reject(e.target.error); };
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    return {
        generateChecklist: generateChecklist,
        saveChecklist: saveChecklist,
        listAll: listAll,
        deleteChecklist: deleteChecklist,
        updateItemStatus: updateItemStatus
    };
})();
