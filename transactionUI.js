/**
 * 取引進行管理 UI
 * - 取引一覧（進捗バー付き）/ 新規作成（物件マスタ連携）
 * - タイムライン形式のステップ表示・チェック・メモ（IndexedDB即時保存）
 * - 各ステップの協会Word様式生成（買付証明書は自動差し込み対応）
 * - 印刷: 社内用チェックリスト / 顧客配布用「お引渡しまでの流れ」
 */
var TransactionUI = (function() {
    'use strict';

    var current = null; // 表示中の取引レコード

    function open() {
        renderList();
    }

    function close() {
        var m = document.getElementById('tx-modal');
        if (m) m.remove();
    }

    function shell(inner) {
        close();
        var html = '<div class="suumo-modal-overlay" id="tx-modal" style="overflow:auto;">' +
            '<div class="suumo-modal-content" style="max-width:1000px;">' + inner + '</div></div>';
        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);
        document.getElementById('tx-close').onclick = close;
    }

    // ===== 一覧 =====
    async function renderList() {
        var records = [];
        try { records = await Transaction.list(); } catch (e) {}
        records.sort(function(a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); });

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div><h2 style="margin:0;">取引進行管理</h2>' +
            '<p style="margin:4px 0 0;font-size:12px;color:#666;">申込から引渡しまでの進行状況を管理します（市場標準フロー準拠）。</p></div>' +
            '<button id="tx-close" class="btn btn-outline">閉じる</button></div>';

        html += '<div style="margin:14px 0;display:flex;gap:8px;">' +
            '<button id="tx-new-sale" class="btn btn-primary btn-sm">新規取引（売買）</button>' +
            '<button id="tx-new-rental" class="btn btn-outline btn-sm">新規取引（賃貸）</button></div>';

        if (!records.length) {
            html += '<div style="text-align:center;color:#888;padding:40px 0;">進行中の取引はありません。「新規取引」から開始してください。</div>';
        } else {
            html += '<div style="display:flex;flex-direction:column;gap:10px;">';
            records.forEach(function(r) {
                var pct = Transaction.progressOf(r);
                var flow = Transaction.FLOWS[r.flowType];
                var cur = flow.steps[Transaction.currentStepIndex(r)];
                html += '<div style="border:1px solid #e3e8ef;border-radius:10px;padding:14px 18px;display:flex;align-items:center;gap:16px;">' +
                    '<div style="flex:1;min-width:0;">' +
                    '<div style="font-weight:600;">' + esc(r.propName) +
                    '<span style="font-size:11px;color:#fff;background:' + (r.flowType === 'sale' ? '#3b82f6' : '#06b6d4') + ';border-radius:999px;padding:1px 10px;margin-left:8px;">' + esc(flow.label) + '</span></div>' +
                    '<div style="font-size:12px;color:#666;margin-top:2px;">現在: ' + esc(cur.title) + '　／　更新: ' + esc((r.updatedAt || '').slice(0, 10)) + '</div>' +
                    '<div style="height:6px;background:#eef1f6;border-radius:999px;margin-top:8px;overflow:hidden;">' +
                    '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);"></div></div></div>' +
                    '<div style="font-weight:700;font-size:15px;width:48px;text-align:right;">' + pct + '%</div>' +
                    '<button class="btn btn-primary btn-sm tx-open" data-id="' + r.id + '">開く</button>' +
                    '<button class="btn btn-outline-danger btn-sm tx-del" data-id="' + r.id + '">削除</button>' +
                    '</div>';
            });
            html += '</div>';
        }

        shell(html);
        document.getElementById('tx-new-sale').onclick = function() { startNew('sale'); };
        document.getElementById('tx-new-rental').onclick = function() { startNew('rental'); };
        Array.prototype.forEach.call(document.querySelectorAll('.tx-open'), function(b) {
            b.onclick = async function() {
                current = await Transaction.get(parseInt(b.dataset.id, 10));
                renderDetail();
            };
        });
        Array.prototype.forEach.call(document.querySelectorAll('.tx-del'), function(b) {
            b.onclick = async function() {
                if (!confirm('この取引を削除しますか？')) return;
                await Transaction.remove(parseInt(b.dataset.id, 10));
                renderList();
            };
        });
    }

    // ===== 新規作成（物件マスタから選択） =====
    function startNew(flowType) {
        if (typeof PropertyMasterUI !== 'undefined') {
            close();
            PropertyMasterUI.openMasterList(async function(record) {
                await Transaction.create(flowType, record.prop, {});
                // マスタ側モーダルを閉じてから一覧に戻る
                var pm = document.getElementById('pm-modal');
                if (pm) pm.remove();
                renderList();
            });
        } else {
            Transaction.create(flowType, { '物件名': '（手動作成）' }, {}).then(renderList);
        }
    }

    // ===== 詳細（タイムライン） =====
    function renderDetail() {
        var r = current;
        var flow = Transaction.FLOWS[r.flowType];
        var pct = Transaction.progressOf(r);
        var curIdx = Transaction.currentStepIndex(r);

        var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
            '<div><h2 style="margin:0;">' + esc(r.propName) + '</h2>' +
            '<p style="margin:4px 0 0;font-size:12px;color:#666;">' + esc(flow.label) + '取引　／　進捗 ' + pct + '%</p></div>' +
            '<button id="tx-close" class="btn btn-outline">閉じる</button></div>';

        html += '<div style="display:flex;gap:8px;margin:12px 0;flex-wrap:wrap;">' +
            '<button id="tx-back" class="btn btn-outline btn-sm">一覧へ戻る</button>' +
            '<button id="tx-print-check" class="btn btn-primary btn-sm">チェックリスト印刷（社内用）</button>' +
            '<button id="tx-print-guide" class="btn btn-primary btn-sm">お引渡しまでの流れ印刷（お客様用）</button></div>';

        flow.steps.forEach(function(def, i) {
            var st = r.steps[i];
            var allDone = st.checks.every(function(c) { return c; });
            var isCurrent = i === curIdx && !allDone;
            html += '<div style="border:1px solid ' + (isCurrent ? '#3b82f6' : '#e3e8ef') + ';border-radius:10px;margin-bottom:10px;overflow:hidden;">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:' +
                (allDone ? '#ecfdf5' : isCurrent ? '#eff6ff' : '#f8fafc') + ';">' +
                '<div style="font-weight:600;">' + (i + 1) + '. ' + esc(def.title) +
                (allDone ? '<span style="font-size:11px;color:#047857;margin-left:8px;">完了' + (st.doneDate ? '（' + esc(st.doneDate) + '）' : '') + '</span>' : '') +
                (isCurrent ? '<span style="font-size:11px;color:#1d4ed8;margin-left:8px;">現在のステップ</span>' : '') +
                '</div><div style="font-size:11px;color:#667;">' + esc(def.duration) + '</div></div>' +
                '<div style="padding:12px 16px;">';

            def.items.forEach(function(item, j) {
                html += '<label style="display:flex;gap:8px;align-items:flex-start;margin:5px 0;cursor:pointer;font-size:13px;">' +
                    '<input type="checkbox" class="tx-check" data-step="' + i + '" data-item="' + j + '"' + (st.checks[j] ? ' checked' : '') + ' style="margin-top:3px;">' +
                    '<span>' + esc(item) + '</span></label>';
            });

            if (def.docs && def.docs.length) {
                html += '<div style="margin-top:10px;padding-top:8px;border-top:1px dashed #e3e8ef;font-size:12px;">' +
                    '<span style="color:#667;font-weight:600;">この段階の書類:</span> ';
                def.docs.forEach(function(doc, k) {
                    if (doc.autofill) {
                        html += '<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;">' +
                            '<button class="btn btn-primary btn-sm tx-doc-fill" data-step="' + i + '" data-doc="' + k + '" style="font-size:11px;padding:3px 10px;">' +
                            esc(doc.name) + ' を自動作成</button></span>';
                    } else if (doc.note) {
                        html += '<span style="color:#445;margin-right:10px;">' + esc(doc.name) + '（' + esc(doc.note) + '）</span>';
                    } else {
                        html += '<span style="color:#445;margin-right:10px;" title="templates/' + esc(doc.path) + '">' + esc(doc.name) + '</span>';
                    }
                });
                html += '<div style="color:#98a2b3;font-size:11px;margin-top:4px;">Word様式は templates フォルダに保管（自動作成対応外の様式はWordで直接編集）</div>';
                html += '</div>';
            }

            html += '<div style="margin-top:8px;"><input type="text" class="tx-memo" data-step="' + i + '" value="' + esc(st.memo) + '"' +
                ' placeholder="メモ（期日・担当・注意点など）" style="width:100%;padding:6px 10px;border:1px solid #d1d8e2;border-radius:6px;font-size:12px;"></div>';
            html += '</div></div>';
        });

        html += '<input type="file" id="tx-docx-input" accept=".docx" style="display:none;">';
        shell(html);

        document.getElementById('tx-back').onclick = renderList;
        document.getElementById('tx-print-check').onclick = function() { Transaction.printChecklist(r); };
        document.getElementById('tx-print-guide').onclick = function() { Transaction.printCustomerGuide(r); };

        Array.prototype.forEach.call(document.querySelectorAll('.tx-check'), function(cb) {
            cb.onchange = async function() {
                var si = parseInt(cb.dataset.step, 10), ii = parseInt(cb.dataset.item, 10);
                r.steps[si].checks[ii] = cb.checked;
                var all = r.steps[si].checks.every(function(c) { return c; });
                r.steps[si].done = all;
                r.steps[si].doneDate = all ? new Date().toLocaleDateString('ja-JP') : '';
                await Transaction.update(r);
                renderDetail();
            };
        });
        Array.prototype.forEach.call(document.querySelectorAll('.tx-memo'), function(inp) {
            inp.onchange = async function() {
                r.steps[parseInt(inp.dataset.step, 10)].memo = inp.value;
                await Transaction.update(r);
            };
        });
        Array.prototype.forEach.call(document.querySelectorAll('.tx-doc-fill'), function(b) {
            b.onclick = function() { pickAndFill(parseInt(b.dataset.step, 10), parseInt(b.dataset.doc, 10)); };
        });
    }

    // ===== 書類の自動差し込み（買付証明書等） =====
    function pickAndFill(stepIdx, docIdx) {
        var input = document.getElementById('tx-docx-input');
        input.onchange = async function() {
            if (!input.files || !input.files.length) return;
            try {
                var master = {};
                try { master = JSON.parse(localStorage.getItem('suumo_broker_master') || '{}'); } catch (e) {}
                var buf = await input.files[0].arrayBuffer();
                var values = DisclosureDocx.buildValues(current.prop, master, {}, current.parties || {});
                var result = await DisclosureDocx.fill(buf, values);
                var a = document.createElement('a');
                a.href = URL.createObjectURL(result.blob);
                a.download = '記入済_' + input.files[0].name.replace(/\.docx$/i, '') + '_' +
                    (current.propName || '').replace(/[\\/:*?"<>|]/g, '') + '.docx';
                a.click();
                setTimeout(function() { URL.revokeObjectURL(a.href); }, 5000);
                alert(result.formatTitle + ' に ' + result.filled + '/' + result.mappable +
                    ' 項目を自動入力しました。金額・条件等はWordでご確認・追記ください。');
            } catch (e) {
                alert('生成に失敗しました: ' + (e && e.message ? e.message : e));
            }
            input.value = '';
        };
        input.click();
    }

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/[&<>"']/g, function(c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
    }

    return { open: open, close: close };
})();
