/**
 * 解析履歴管理（IndexedDB）
 * - 解析結果を永続保存
 * - 履歴一覧・読込・削除・比較用データ取得
 */
var HistoryDB = (function() {
    'use strict';

    var DB_NAME = 'reins_analyzer';
    var DB_VERSION = 1;
    var STORE = 'analyses';
    var dbPromise = null;

    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function(resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    var store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('createdAt', 'createdAt');
                    store.createIndex('title', 'title');
                }
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
        });
        return dbPromise;
    }

    function save(title, category, mode, props) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                var store = tx.objectStore(STORE);
                var record = {
                    title: title || ('解析 ' + new Date().toLocaleString('ja-JP')),
                    category: category,
                    mode: mode,
                    count: props.length,
                    props: props,
                    createdAt: new Date().toISOString()
                };
                var req = store.add(record);
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function list() {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE, 'readonly');
                var store = tx.objectStore(STORE);
                var req = store.getAll();
                req.onsuccess = function(e) {
                    var items = (e.target.result || []).map(function(r) {
                        return {
                            id: r.id, title: r.title, category: r.category,
                            mode: r.mode, count: r.count, createdAt: r.createdAt
                        };
                    });
                    items.sort(function(a,b) { return b.createdAt.localeCompare(a.createdAt); });
                    resolve(items);
                };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function load(id) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE, 'readonly');
                var req = tx.objectStore(STORE).get(id);
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function remove(id) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var tx = db.transaction(STORE, 'readwrite');
                var req = tx.objectStore(STORE).delete(id);
                req.onsuccess = function() { resolve(); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    function loadMany(ids) {
        return Promise.all(ids.map(function(id) { return load(id); }));
    }

    return { save: save, list: list, load: load, remove: remove, loadMany: loadMany };
})();
