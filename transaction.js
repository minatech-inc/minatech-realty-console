/**
 * 取引進行管理 — 申込から引渡しまでのステップ管理
 *
 * 市場標準の取引フロー（SUUMO/大手仲介の解説・宅建実務に準拠）:
 *   売買: 購入申込 → ローン事前審査 → 重説・売買契約 → ローン本審査 → 金消契約 → 決済準備 → 決済・引渡し
 *   賃貸: 内見・申込 → 入居審査 → 重説・賃貸借契約 → 初期費用入金 → 鍵渡し・入居
 *
 * - 進行状況は IndexedDB に永続保存
 * - 各ステップに書類テンプレート（協会Word様式）を紐付け
 * - 印刷物: 社内用チェックリスト / 顧客配布用「お引渡しまでの流れ」
 */
var Transaction = (function() {
    'use strict';

    var DB_NAME = 'rc_transactions';
    var STORE = 'transactions';
    var dbPromise = null;

    // ===== ステップ定義（市場標準フロー） =====
    var FLOWS = {
        sale: {
            label: '売買',
            steps: [
                {
                    key: 'apply', title: '購入申込',
                    duration: '申込〜契約は通常1週間〜10日',
                    items: [
                        '買付証明書の受領（購入希望金額・支払条件・有効期限を確認)',
                        '売渡承諾書の発行（売主へ意思確認のうえ）',
                        '交渉条件の整理（価格・引渡時期・付帯設備）'
                    ],
                    docs: [
                        { name: '買付証明書（区分所有建物）', path: '付随書式/申込・契約関係/買付証明書（区分所有建物）.docx', autofill: true },
                        { name: '買付証明書（土地建物）', path: '付随書式/申込・契約関係/買付証明書（土地建物）.docx' },
                        { name: '売渡承諾書（区分所有建物）', path: '付随書式/申込・契約関係/売渡承諾書（区分所有建物）.docx' },
                        { name: '売渡承諾書（土地建物）', path: '付随書式/申込・契約関係/売渡承諾書（土地建物）.docx' }
                    ]
                },
                {
                    key: 'prescreen', title: '住宅ローン事前審査',
                    duration: '通常2〜7日',
                    items: [
                        '事前審査申込（源泉徴収票・本人確認書類・物件資料）',
                        '審査結果の確認・買主へ連絡',
                        '融資利用特約の条件整理（承認期日・解除期日）'
                    ],
                    docs: []
                },
                {
                    key: 'contract', title: '重要事項説明・売買契約締結',
                    duration: '所要2〜3時間・手付金授受',
                    items: [
                        '重要事項説明書の作成・宅建士による説明（35条書面）',
                        '売買契約書の締結（37条書面）・手付金の授受',
                        '媒介手数料（半金）の請求',
                        '契約書類の控え交付・原本保管'
                    ],
                    docs: [
                        { name: '重説・売買契約書', note: 'サイドバー「重説下書き」「売買契約書」から生成' },
                        { name: '契約のご案内（売主用）', path: '付随書式/申込・契約関係/契約のご案内（売主用）.docx' },
                        { name: '契約のご案内（買主用）', path: '付随書式/申込・契約関係/契約のご案内（買主用）.docx' },
                        { name: '媒介手数料支払い承諾書', path: '付随書式/申込・契約関係/媒介手数料支払い承諾書.docx' }
                    ]
                },
                {
                    key: 'loan', title: '住宅ローン本審査',
                    duration: '通常1〜2週間',
                    items: [
                        '本審査申込のサポート（契約書・重説の写し提出）',
                        '承認結果の確認（融資特約期日までに）',
                        '否認時: 融資特約による解除手続きの検討'
                    ],
                    docs: [
                        { name: '融資利用特約の変更合意書', path: '付随書式/覚書・合意書/融資利用特約の変更合意書.docx' }
                    ]
                },
                {
                    key: 'kinshou', title: '金銭消費貸借契約（金消契約）',
                    duration: '決済の1〜2週間前',
                    items: [
                        '金消契約の日程調整（買主・金融機関）',
                        '必要書類の案内（実印・印鑑証明・住民票・本人確認）',
                        '決済日・引渡日の確定'
                    ],
                    docs: []
                },
                {
                    key: 'prep', title: '決済準備',
                    duration: '決済の1週間前まで',
                    items: [
                        '司法書士の手配（所有権移転・抵当権抹消/設定）',
                        '売主: 抵当権抹消準備（金融機関へ完済連絡・必要書類）',
                        '固定資産税・都市計画税・管理費等の清算金計算',
                        '売主必要書類の案内（登記識別情報・実印・印鑑証明・評価証明）',
                        '残代金支払いのご案内送付（売主用・買主用）'
                    ],
                    docs: [
                        { name: '残代金支払いのご案内（売主用）', path: '付随書式/残代金・決済関係/残代金支払いのご案内（売主用）.docx' },
                        { name: '残代金支払いのご案内（買主用）', path: '付随書式/残代金・決済関係/残代金支払いのご案内（買主用）.docx' },
                        { name: '固定資産税・都市計画税清算書', path: '付随書式/残代金・決済関係/固定資産税・都市計画税清算書.docx' },
                        { name: '管理費・修繕積立金清算書', path: '付随書式/残代金・決済関係/管理費・修繕積立金清算書.docx' }
                    ]
                },
                {
                    key: 'closing', title: '残代金決済・引渡し',
                    duration: '契約から約1ヶ月後・所要1〜1.5時間',
                    items: [
                        '決済立会い（通常は買主の融資実行金融機関にて）',
                        '司法書士による本人確認・書類確認・登記申請',
                        '残代金の着金確認・清算金の授受',
                        '媒介手数料（残金）の受領',
                        '鍵・付帯設備・関係書類の引渡し',
                        '引渡完了確認書・鍵受領書の取り交わし'
                    ],
                    docs: [
                        { name: '売買物件引渡し完了確認書', path: '付随書式/残代金・決済関係/売買物件引渡し完了確認書.docx' },
                        { name: '鍵受領書', path: '付随書式/残代金・決済関係/鍵受領書.docx' }
                    ]
                }
            ]
        },
        rental: {
            label: '賃貸',
            steps: [
                {
                    key: 'apply', title: '内見・入居申込',
                    duration: '当日〜3日',
                    items: [
                        '内見実施・物件状態の説明',
                        '入居申込書の受領（管理会社・保証会社の指定様式）',
                        '必要書類の案内（本人確認・収入証明）'
                    ],
                    docs: []
                },
                {
                    key: 'screening', title: '入居審査',
                    duration: '通常2〜5日',
                    items: [
                        '保証会社審査の申込',
                        '管理会社・貸主の承諾確認',
                        '審査結果の連絡'
                    ],
                    docs: []
                },
                {
                    key: 'contract', title: '重要事項説明・賃貸借契約',
                    duration: '所要1〜2時間',
                    items: [
                        '重要事項説明（35条書面）',
                        '賃貸借契約の締結・火災保険加入確認',
                        '契約書類の控え交付'
                    ],
                    docs: [
                        { name: '重説・賃貸借契約書', note: 'サイドバー「重説下書き」「賃貸借契約書」から生成' }
                    ]
                },
                {
                    key: 'payment', title: '初期費用入金',
                    duration: '入居日の3日前まで',
                    items: [
                        '初期費用の請求（敷金・礼金・前家賃・仲介手数料・保証料・保険料）',
                        '入金確認'
                    ],
                    docs: []
                },
                {
                    key: 'movein', title: '鍵渡し・入居',
                    duration: '入居日当日',
                    items: [
                        '鍵の引渡し・受領書の取り交わし',
                        '室内状況の立会い確認（現況写真の保存推奨）',
                        'ライフライン連絡先の案内'
                    ],
                    docs: [
                        { name: '鍵受領書', path: '付随書式/残代金・決済関係/鍵受領書.docx' }
                    ]
                }
            ]
        }
    };

    // ===== IndexedDB =====
    function open() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function(resolve, reject) {
            var req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function(e) {
                var db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                }
            };
            req.onsuccess = function(e) { resolve(e.target.result); };
            req.onerror = function(e) { reject(e.target.error); };
        });
        return dbPromise;
    }

    function tx(mode, fn) {
        return open().then(function(db) {
            return new Promise(function(resolve, reject) {
                var t = db.transaction(STORE, mode);
                var store = t.objectStore(STORE);
                var req = fn(store);
                req.onsuccess = function(e) { resolve(e.target.result); };
                req.onerror = function(e) { reject(e.target.error); };
            });
        });
    }

    /** 新規取引を作成 */
    function create(flowType, prop, parties) {
        var flow = FLOWS[flowType];
        if (!flow) return Promise.reject(new Error('不明な取引種別'));
        var record = {
            flowType: flowType,
            propName: (prop && prop['物件名']) || '(物件未設定)',
            prop: prop || {},
            parties: parties || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            steps: flow.steps.map(function(s) {
                return {
                    key: s.key,
                    done: false,
                    doneDate: '',
                    memo: '',
                    checks: s.items.map(function() { return false; })
                };
            })
        };
        return tx('readwrite', function(store) { return store.add(record); });
    }

    function list() {
        return tx('readonly', function(store) { return store.getAll(); });
    }

    function get(id) {
        return tx('readonly', function(store) { return store.get(id); });
    }

    function update(record) {
        record.updatedAt = new Date().toISOString();
        return tx('readwrite', function(store) { return store.put(record); });
    }

    function remove(id) {
        return tx('readwrite', function(store) { return store.delete(id); });
    }

    /** 進捗率(0-100) */
    function progressOf(record) {
        var total = 0, done = 0;
        record.steps.forEach(function(s) {
            s.checks.forEach(function(c) { total++; if (c) done++; });
        });
        return total ? Math.round(done / total * 100) : 0;
    }

    /** 現在のステップindex（未完了チェックが最初に現れるステップ） */
    function currentStepIndex(record) {
        for (var i = 0; i < record.steps.length; i++) {
            if (record.steps[i].checks.some(function(c) { return !c; })) return i;
        }
        return record.steps.length - 1;
    }

    // ===== 印刷用HTML生成 =====
    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/[&<>"']/g, function(c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
    }

    var PRINT_CSS =
        'body{font-family:"Noto Sans JP","Hiragino Kaku Gothic ProN",Meiryo,sans-serif;color:#1a2233;' +
        'max-width:720px;margin:24px auto;padding:0 24px;line-height:1.7;font-size:12.5px;}' +
        'h1{font-size:19px;border-bottom:2px solid #1a2940;padding-bottom:8px;margin:0 0 4px;}' +
        '.sub{color:#556;font-size:11px;margin-bottom:18px;}' +
        '.step{border:1px solid #cbd5e1;border-radius:8px;margin-bottom:12px;overflow:hidden;page-break-inside:avoid;}' +
        '.step-head{display:flex;justify-content:space-between;align-items:center;background:#f1f5f9;padding:8px 14px;font-weight:700;}' +
        '.step-head .dur{font-weight:400;font-size:10.5px;color:#556;}' +
        '.step-body{padding:10px 14px;}' +
        '.chk{display:flex;gap:8px;align-items:flex-start;margin:4px 0;}' +
        '.box{width:12px;height:12px;border:1.5px solid #64748b;border-radius:2px;flex:none;margin-top:3px;display:inline-block;}' +
        '.box.on{background:#1a2940;border-color:#1a2940;}' +
        '.done-badge{font-size:10px;color:#047857;border:1px solid #047857;border-radius:999px;padding:1px 8px;}' +
        '.memo{font-size:11px;color:#556;background:#f8fafc;border-radius:6px;padding:6px 10px;margin-top:6px;}' +
        '.foot{margin-top:20px;font-size:10.5px;color:#667;border-top:1px solid #cbd5e1;padding-top:10px;}' +
        '.guide-step{display:flex;gap:14px;margin-bottom:2px;page-break-inside:avoid;}' +
        '.guide-num{flex:none;width:30px;height:30px;border-radius:50%;background:#1a2940;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;}' +
        '.guide-line{flex:none;width:2px;background:#cbd5e1;margin:0 auto;min-height:18px;}' +
        '.guide-rail{display:flex;flex-direction:column;align-items:center;}' +
        '.guide-body{padding-bottom:14px;}' +
        '.guide-title{font-weight:700;font-size:14px;}' +
        '.guide-dur{font-size:10.5px;color:#8a6d1d;background:#fdf6e3;border-radius:999px;padding:1px 10px;display:inline-block;margin-left:8px;}' +
        '.guide-desc{font-size:11.5px;color:#445;margin-top:3px;}' +
        '@media print{body{margin:0 auto;} .no-print{display:none;}}';

    function printWindow(title, bodyHTML) {
        var w = window.open('', '_blank');
        w.document.write('<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8"><title>' + esc(title) +
            '</title><style>' + PRINT_CSS + '</style></head><body>' + bodyHTML +
            '<div class="no-print" style="text-align:center;margin:18px 0;">' +
            '<button onclick="window.print()" style="padding:10px 28px;font-size:14px;cursor:pointer;">印刷する</button></div>' +
            '</body></html>');
        w.document.close();
    }

    /** 社内用チェックリスト */
    function printChecklist(record) {
        var flow = FLOWS[record.flowType];
        var today = new Date().toLocaleDateString('ja-JP');
        var html = '<h1>取引進行チェックリスト（社内用）</h1>' +
            '<div class="sub">物件: ' + esc(record.propName) + '　／　取引種別: ' + esc(flow.label) +
            '　／　進捗 ' + progressOf(record) + '%　／　出力日: ' + today + '</div>';
        flow.steps.forEach(function(def, i) {
            var st = record.steps[i];
            var allDone = st.checks.every(function(c) { return c; });
            html += '<div class="step"><div class="step-head"><span>' + (i + 1) + '. ' + esc(def.title) +
                (allDone ? '　<span class="done-badge">完了' + (st.doneDate ? ' ' + esc(st.doneDate) : '') + '</span>' : '') +
                '</span><span class="dur">' + esc(def.duration) + '</span></div><div class="step-body">';
            def.items.forEach(function(item, j) {
                html += '<div class="chk"><span class="box' + (st.checks[j] ? ' on' : '') + '"></span><span>' + esc(item) + '</span></div>';
            });
            if (st.memo) html += '<div class="memo">メモ: ' + esc(st.memo) + '</div>';
            html += '</div></div>';
        });
        html += '<div class="foot">Shonan Minato Real Estate（MinaTech株式会社）／ 神奈川県知事（1）第32624号 ／ TEL 0466-96-0313</div>';
        printWindow('取引進行チェックリスト - ' + record.propName, html);
    }

    /** 顧客配布用「お引渡しまでの流れ」 */
    var GUIDE_DESC = {
        sale: {
            apply: '購入のお申込みをいただきます。買付証明書にご希望金額・条件をご記入ください。',
            prescreen: '住宅ローンの事前審査を行います。源泉徴収票・本人確認書類をご準備ください。',
            contract: '宅地建物取引士が重要事項をご説明のうえ、売買契約を締結します。手付金をご用意ください。',
            loan: '金融機関による住宅ローンの本審査です。当社が書類提出をサポートします。',
            kinshou: '金融機関と正式なローン契約（金銭消費貸借契約）を結びます。実印・印鑑証明等が必要です。',
            prep: '決済に向けて、司法書士の手配・清算金の計算・必要書類のご案内を行います。',
            closing: '残代金のお支払いと同時に、登記手続き・鍵のお引渡しを行います。ここでお住まいはあなたのものです。'
        },
        rental: {
            apply: '内見後、入居申込書をご提出いただきます。本人確認書類・収入証明をご準備ください。',
            screening: '保証会社・貸主による入居審査を行います（通常2〜5日）。',
            contract: '宅地建物取引士が重要事項をご説明のうえ、賃貸借契約を締結します。',
            payment: '入居日までに初期費用（敷金・礼金・前家賃等）をお支払いください。',
            movein: '鍵をお渡しします。室内の状態をご一緒に確認し、新生活スタートです。'
        }
    };

    function printCustomerGuide(record) {
        var flow = FLOWS[record.flowType];
        var descs = GUIDE_DESC[record.flowType] || {};
        var html = '<h1>お引渡しまでの流れ</h1>' +
            '<div class="sub">' + esc(record.propName) + '　／　' +
            esc(flow.label) + 'のお取引でご案内する標準的な流れです。ご不明点はいつでも担当までご連絡ください。</div>';
        flow.steps.forEach(function(def, i) {
            var last = i === flow.steps.length - 1;
            html += '<div class="guide-step"><div class="guide-rail"><div class="guide-num">' + (i + 1) + '</div>' +
                (last ? '' : '<div class="guide-line" style="flex:1;"></div>') + '</div>' +
                '<div class="guide-body"><span class="guide-title">' + esc(def.title) + '</span>' +
                '<span class="guide-dur">' + esc(def.duration) + '</span>' +
                '<div class="guide-desc">' + esc(descs[def.key] || def.items[0] || '') + '</div></div></div>';
        });
        html += '<div class="foot">Shonan Minato Real Estate（MinaTech株式会社）／ 宅地建物取引業 神奈川県知事（1）第32624号<br>' +
            'TEL 0466-96-0313（年中無休 10:00〜21:00）／ LINE公式 @760zrvim ／ https://realestate.minatech1210.com/</div>';
        printWindow('お引渡しまでの流れ - ' + record.propName, html);
    }

    return {
        FLOWS: FLOWS,
        create: create,
        list: list,
        get: get,
        update: update,
        remove: remove,
        progressOf: progressOf,
        currentStepIndex: currentStepIndex,
        printChecklist: printChecklist,
        printCustomerGuide: printCustomerGuide
    };
})();
