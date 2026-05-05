/**
 * 物件マスタDB（IndexedDB永続化）
 *
 * 既存 history.js は「解析セッション単位」での保管。
 * propertyMaster は「物件単位」のマスタとして並走し、検討中/契約済/失注等の
 * ステータス管理・タグ・メモを付与可能にする。
 *
 * ストア構造:
 *   properties: { id, propertyName, address, prop, status, tags[], notes, sourceUrl, createdAt, updatedAt }
 *
 * 既存 reins_analyzer DB をそのまま利用（DB_VERSION を 2 に上げて新ストアを追加）
 */
var PropertyMaster = (function() {
    'use strict';

    var DB_NAME = 'reins_analyzer';
    var DB_VERSION = 2;
    var STORE_HISTORY = 'analyses';
    var STORE_MASTER = 'properties';
    var dbPromise = null;

    var STATUSES = [
        { code: 'lead',     label: '検討中',   color: '#fbc02d' },
        { code: 'shortlist',label: '注目',     color: '#1976d2' },
        { code: 'inquired', label: '問合せ済', color: '#7b1fa2' },
        { code: 'visiting', label: '内見予定', color: '#0097a7' },
        { code: 'visited',  label: '内見済',   color: '#00796b' },
        { code: 'offering', label: '指値中',   color: '#f57c00' },
        { code: 'contract', label: '契約済',   color: '#388e3c' },
        { code: 'lost',     label: '失注',     color: '#9e9e9e' },
        { code: 'archived', label: '保管',     color: '#616161' }
    ];

    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function(resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_HISTORY)) {
                    var s1 = db.createObjectStore(STORE_HISTORY, { keyPath: 'id', autoIncrement: true });
                    s1.createIndex('createdAt', 'createdAt');
                    s1.createIndex('title', 'title');
                }
                if (!db.objectStoreNames.contains(STORE_MASTER)) {
                    var s2 = db.createObjectStore(STORE_MASTER, { keyPath: 'id', autoIncrement: true });
                    s2.createIndex('address',   'address');
                    s2.createIndex('propertyName','propertyName');
                    s2.createIndex('status',    'status');
                    s2.createIndex('updatedAt', 'updatedAt');
                    s2.createIndex('score',     'score');
                }
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
        });
        return dbPromise;
    }

    // 物件マスタへの保存（既存の同一物件は更新、なければ新規）
    function saveProperty(prop, opts) {
        opts = opts || {};
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_MASTER, 'readwrite');
                var store = tx.objectStore(STORE_MASTER);
                // 物件名+所在地で重複検出（自動更新）
                var key = (prop['物件名'] || '') + '|' + (prop['所在地'] || '');
                var matched = null;
                var idxReq = store.index('address').openCursor(IDBKeyRange.only(prop['所在地'] || ''));
                idxReq.onsuccess = function(e) {
                    var cursor = e.target.result;
                    if (cursor) {
                        var r = cursor.value;
                        if ((r.propertyName || '') === (prop['物件名'] || '')) {
                            matched = r;
                        } else {
                            cursor.continue();
                            return;
                        }
                    }
                    var now = new Date().toISOString();
                    var record = matched || {
                        propertyName: prop['物件名'] || '',
                        address:      prop['所在地']  || '',
                        sourceUrl:    opts.sourceUrl || '',
                        tags:         opts.tags || [],
                        notes:        opts.notes || '',
                        status:       opts.status || 'lead',
                        createdAt:    now
                    };
                    record.prop      = prop;
                    record.score     = prop['スコア'] || 0;
                    record.rank      = prop['評価ランク'] || '';
                    record.price     = prop['価格(万円)'] || null;
                    record.updatedAt = now;
                    if (opts.status) record.status = opts.status;
                    if (opts.notes)  record.notes  = opts.notes;
                    if (opts.tags)   record.tags   = opts.tags;

                    var putReq = matched ? store.put(record) : store.add(record);
                    putReq.onsuccess = function(ev) { resolve({ id: ev.target.result, isNew: !matched }); };
                    putReq.onerror   = function(ev) { reject(ev.target.error); };
                };
                idxReq.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function listProperties(filter) {
        filter = filter || {};
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_MASTER, 'readonly');
                var req = tx.objectStore(STORE_MASTER).getAll();
                req.onsuccess = function(e) {
                    var items = e.target.result || [];
                    if (filter.status) items = items.filter(function(r) { return r.status === filter.status; });
                    if (filter.minScore) items = items.filter(function(r) { return (r.score || 0) >= filter.minScore; });
                    if (filter.search) {
                        var q = filter.search.toLowerCase();
                        items = items.filter(function(r) {
                            return (r.propertyName || '').toLowerCase().indexOf(q) >= 0 ||
                                   (r.address || '').toLowerCase().indexOf(q) >= 0;
                        });
                    }
                    items.sort(function(a, b) {
                        return (b.updatedAt || '').localeCompare(a.updatedAt || '');
                    });
                    resolve(items);
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function getProperty(id) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_MASTER, 'readonly');
                var req = tx.objectStore(STORE_MASTER).get(id);
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function updateProperty(id, updates) {
        return getProperty(id).then(function(record) {
            if (!record) throw new Error('物件が見つかりません');
            Object.assign(record, updates);
            record.updatedAt = new Date().toISOString();
            return open().then(function(db) {
                return new Promise(function(resolve, reject) {
                    var tx = db.transaction(STORE_MASTER, 'readwrite');
                    var req = tx.objectStore(STORE_MASTER).put(record);
                    req.onsuccess = function() { resolve(record); };
                    req.onerror = function(e) { reject(e.target.error); };
                });
            });
        });
    }

    function deleteProperty(id) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE_MASTER, 'readwrite');
                var req = tx.objectStore(STORE_MASTER).delete(id);
                req.onsuccess = function() { resolve(); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function exportAllCSV() {
        return listProperties().then(function(items) {
            var headers = ['id','物件名','所在地','ステータス','スコア','評価ランク','価格(万円)','タグ','メモ','登録日','更新日'];
            var rows = [headers.join(',')];
            items.forEach(function(r) {
                var statusLabel = (STATUSES.find(function(s) { return s.code === r.status; }) || {}).label || r.status;
                var row = [
                    r.id,
                    csvEscape(r.propertyName),
                    csvEscape(r.address),
                    csvEscape(statusLabel),
                    r.score || 0,
                    csvEscape(r.rank || ''),
                    r.price || '',
                    csvEscape((r.tags || []).join('|')),
                    csvEscape(r.notes || ''),
                    r.createdAt || '',
                    r.updatedAt || ''
                ];
                rows.push(row.join(','));
            });
            return rows.join('\n');
        });
    }

    function csvEscape(v) {
        if (v === undefined || v === null) return '';
        var s = String(v).replace(/"/g, '""');
        return /[,"\n]/.test(s) ? '"' + s + '"' : s;
    }

    function getStatusOptions() { return STATUSES.slice(); }
    function findStatus(code) {
        return STATUSES.find(function(s) { return s.code === code; });
    }

    return {
        saveProperty:    saveProperty,
        listProperties:  listProperties,
        getProperty:     getProperty,
        updateProperty:  updateProperty,
        deleteProperty:  deleteProperty,
        exportAllCSV:    exportAllCSV,
        getStatusOptions:getStatusOptions,
        findStatus:      findStatus
    };
})();
