/**
 * 物件マスタUI
 * - 一覧モーダル（検索・フィルタ・ステータス変更・削除・読込）
 * - 解析結果からマスタへの保存ボタン
 */
var PropertyMasterUI = (function() {
    'use strict';

    function openMasterList(onSelect) {
        renderModal();
        loadAndRender('', '');
        function loadAndRender(search, statusFilter) {
            var filter = {};
            if (search) filter.search = search;
            if (statusFilter) filter.status = statusFilter;
            PropertyMaster.listProperties(filter).then(function(items) {
                renderList(items, onSelect, loadAndRender);
            });
        }
    }

    function renderModal() {
        closeModal();
        var html = '<div class="suumo-modal-overlay" id="pm-modal" style="overflow:auto;">';
        html += '<div class="suumo-modal-content" style="max-width:1100px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
        html += '<h2 style="margin:0;">物件マスタ</h2>';
        html += '<div>';
        html += '<button id="pm-export-csv" class="btn btn-outline" title="表形式でエクスポート">CSV出力</button> ';
        html += '<button id="pm-export-json" class="btn btn-outline" title="バックアップ・端末移行用">JSONバックアップ</button> ';
        html += '<button id="pm-import-json" class="btn btn-outline" title="別端末から復元">JSON復元</button> ';
        html += '<input type="file" id="pm-import-file" accept=".json,application/json" style="display:none;">';
        html += '<button id="pm-close" class="btn btn-outline">閉じる</button>';
        html += '</div></div>';
        // フィルタ
        html += '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center;">';
        html += '<input type="text" id="pm-search" placeholder="物件名・所在地で検索" style="flex:1;min-width:200px;padding:6px;border:1px solid #ccc;border-radius:4px;">';
        html += '<select id="pm-status-filter" style="padding:6px;border:1px solid #ccc;border-radius:4px;">';
        html += '<option value="">全ステータス</option>';
        PropertyMaster.getStatusOptions().forEach(function(s) {
            html += '<option value="' + s.code + '">' + s.label + '</option>';
        });
        html += '</select>';
        html += '<span id="pm-count" style="color:#666;font-size:13px;">0件</span>';
        html += '</div>';
        // 一覧
        html += '<div id="pm-list" style="min-height:200px;"></div>';
        html += '</div></div>';
        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('pm-close').onclick = closeModal;
        document.getElementById('pm-search').oninput = function(e) {
            var status = document.getElementById('pm-status-filter').value;
            triggerReload(e.target.value, status);
        };
        document.getElementById('pm-status-filter').onchange = function(e) {
            var search = document.getElementById('pm-search').value;
            triggerReload(search, e.target.value);
        };
        document.getElementById('pm-export-csv').onclick = function() {
            PropertyMaster.exportAllCSV().then(function(csv) {
                downloadFile('property-master-' + new Date().toISOString().slice(0,10) + '.csv', csv, 'text/csv;charset=utf-8');
            });
        };
        document.getElementById('pm-export-json').onclick = function() {
            PropertyMaster.exportAllJSON().then(function(json) {
                downloadFile('property-master-backup-' + new Date().toISOString().slice(0,10) + '.json', json, 'application/json;charset=utf-8');
                if (typeof showToast === 'function') showToast('JSONバックアップを保存しました。別端末で復元する場合はこのファイルを「JSON復元」から読み込んでください', 'success');
            });
        };
        document.getElementById('pm-import-json').onclick = function() {
            document.getElementById('pm-import-file').click();
        };
        document.getElementById('pm-import-file').onchange = function(e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var mode = confirm(
                'JSONを復元します。\n\n' +
                '「OK」 = 既存マスタにマージ（物件名+所在地で重複検出して更新／追加）\n' +
                '「キャンセル」 = 完全に置き換える（既存マスタ全削除）を選択する場合は次のダイアログで「OK」'
            );
            var importMode = 'merge';
            if (!mode) {
                if (!confirm('完全に置き換えますか？\n\n既存マスタを全て削除してから取り込みます。\n（この操作は取り消せません）')) {
                    document.getElementById('pm-import-file').value = '';
                    return;
                }
                importMode = 'replace';
            }
            var reader = new FileReader();
            reader.onload = function() {
                PropertyMaster.importJSON(reader.result, { mode: importMode })
                    .then(function(stat) {
                        var msg = '取込完了：追加 ' + stat.added + '件 / 更新 ' + stat.updated + '件 / スキップ ' + stat.skipped + '件（合計 ' + stat.total + '件）';
                        if (typeof showToast === 'function') showToast(msg, 'success');
                        else alert(msg);
                        triggerReload(
                            document.getElementById('pm-search').value,
                            document.getElementById('pm-status-filter').value
                        );
                    })
                    .catch(function(err) {
                        var msg = '復元失敗: ' + err.message;
                        if (typeof showToast === 'function') showToast(msg, 'error');
                        else alert(msg);
                    })
                    .then(function() {
                        document.getElementById('pm-import-file').value = '';
                    });
            };
            reader.onerror = function() {
                alert('ファイル読み込みに失敗しました');
            };
            reader.readAsText(file);
        };
    }

    function triggerReload(search, status) {
        var filter = {};
        if (search) filter.search = search;
        if (status) filter.status = status;
        PropertyMaster.listProperties(filter).then(function(items) {
            renderList(items);
        });
    }

    function renderList(items, onSelect, reloadCb) {
        var listEl = document.getElementById('pm-list');
        var countEl = document.getElementById('pm-count');
        if (!listEl) return;
        if (countEl) countEl.textContent = items.length + '件';

        if (items.length === 0) {
            listEl.innerHTML = '<div style="padding:30px;text-align:center;color:#999;">該当する物件はありません。解析結果から「マスタに保存」で登録できます。</div>';
            return;
        }
        var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
        html += '<thead><tr style="background:#f5f5f5;border-bottom:2px solid #ddd;">';
        html += '<th style="text-align:left;padding:6px;">物件名</th>';
        html += '<th style="text-align:left;padding:6px;">所在地</th>';
        html += '<th style="text-align:right;padding:6px;">価格</th>';
        html += '<th style="text-align:center;padding:6px;">スコア</th>';
        html += '<th style="text-align:center;padding:6px;">ランク</th>';
        html += '<th style="text-align:left;padding:6px;">ステータス</th>';
        html += '<th style="padding:6px;">更新日</th>';
        html += '<th style="padding:6px;">操作</th>';
        html += '</tr></thead><tbody>';
        items.forEach(function(r) {
            var statusInfo = PropertyMaster.findStatus(r.status) || { label: r.status, color: '#999' };
            html += '<tr style="border-bottom:1px solid #eee;">';
            html += '<td style="padding:6px;">' + esc(r.propertyName || '(無題)') + '</td>';
            html += '<td style="padding:6px;">' + esc(r.address || '') + '</td>';
            html += '<td style="text-align:right;padding:6px;">' + (r.price ? Number(r.price).toLocaleString('ja-JP') + '万円' : '-') + '</td>';
            html += '<td style="text-align:center;padding:6px;font-weight:bold;">' + (r.score || 0) + '</td>';
            html += '<td style="text-align:center;padding:6px;">' + esc(r.rank || '-') + '</td>';
            html += '<td style="padding:6px;">';
            html += '<select data-id="' + r.id + '" class="pm-status-sel" style="padding:2px 4px;border:1px solid ' + statusInfo.color + ';border-radius:3px;background:' + statusInfo.color + '22;color:#333;font-size:12px;">';
            PropertyMaster.getStatusOptions().forEach(function(s) {
                html += '<option value="' + s.code + '"' + (s.code === r.status ? ' selected' : '') + '>' + s.label + '</option>';
            });
            html += '</select>';
            html += '</td>';
            html += '<td style="padding:6px;font-size:11px;color:#666;">' + (r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('ja-JP') : '') + '</td>';
            html += '<td style="padding:6px;text-align:right;">';
            html += '<button data-id="' + r.id + '" class="pm-load-btn" style="font-size:11px;padding:2px 8px;background:#1976d2;color:#fff;border:none;border-radius:3px;cursor:pointer;margin-right:4px;">読込</button>';
            html += '<button data-id="' + r.id + '" class="pm-del-btn" style="font-size:11px;padding:2px 8px;background:#c62828;color:#fff;border:none;border-radius:3px;cursor:pointer;">削除</button>';
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        listEl.innerHTML = html;

        // ステータス変更
        listEl.querySelectorAll('.pm-status-sel').forEach(function(sel) {
            sel.onchange = function() {
                var id = parseInt(sel.getAttribute('data-id'));
                PropertyMaster.updateProperty(id, { status: sel.value }).then(function() {
                    triggerReload(
                        document.getElementById('pm-search').value,
                        document.getElementById('pm-status-filter').value
                    );
                });
            };
        });
        // 読込
        listEl.querySelectorAll('.pm-load-btn').forEach(function(b) {
            b.onclick = function() {
                var id = parseInt(b.getAttribute('data-id'));
                PropertyMaster.getProperty(id).then(function(r) {
                    if (!r) return;
                    if (typeof onSelect === 'function') onSelect(r);
                    closeModal();
                });
            };
        });
        // 削除
        listEl.querySelectorAll('.pm-del-btn').forEach(function(b) {
            b.onclick = function() {
                if (!confirm('この物件をマスタから削除しますか？')) return;
                var id = parseInt(b.getAttribute('data-id'));
                PropertyMaster.deleteProperty(id).then(function() {
                    triggerReload(
                        document.getElementById('pm-search').value,
                        document.getElementById('pm-status-filter').value
                    );
                });
            };
        });
    }

    // 解析結果から保存：ステータス選択ダイアログ
    function saveFromAnalysis(prop) {
        var statuses = PropertyMaster.getStatusOptions();
        // シンプルなプロンプトUI
        var html = '<div class="suumo-modal-overlay" id="pm-save-modal">';
        html += '<div class="suumo-modal-content" style="max-width:480px;">';
        html += '<h2>マスタに保存</h2>';
        html += '<p style="margin:6px 0;font-size:14px;"><b>' + esc(prop['物件名'] || '(無題)') + '</b></p>';
        html += '<p style="margin:6px 0 14px;color:#666;font-size:13px;">' + esc(prop['所在地'] || '') + '</p>';
        html += '<label style="display:block;font-size:12px;color:#555;">ステータス</label>';
        html += '<select id="pm-save-status" style="width:100%;padding:6px;margin-bottom:10px;border:1px solid #ccc;border-radius:4px;">';
        statuses.forEach(function(s) {
            html += '<option value="' + s.code + '">' + s.label + '</option>';
        });
        html += '</select>';
        html += '<label style="display:block;font-size:12px;color:#555;">タグ（カンマ区切り）</label>';
        html += '<input type="text" id="pm-save-tags" placeholder="湘南,築古,リフォーム済" style="width:100%;padding:6px;margin-bottom:10px;border:1px solid #ccc;border-radius:4px;">';
        html += '<label style="display:block;font-size:12px;color:#555;">メモ</label>';
        html += '<textarea id="pm-save-notes" rows="3" placeholder="自由記入" style="width:100%;padding:6px;margin-bottom:14px;border:1px solid #ccc;border-radius:4px;"></textarea>';
        html += '<div style="text-align:right;">';
        html += '<button id="pm-save-cancel" class="btn btn-outline">キャンセル</button> ';
        html += '<button id="pm-save-confirm" class="btn btn-primary">保存</button>';
        html += '</div></div></div>';

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('pm-save-cancel').onclick = function() {
            var m = document.getElementById('pm-save-modal');
            if (m) m.remove();
        };
        document.getElementById('pm-save-confirm').onclick = function() {
            var status = document.getElementById('pm-save-status').value;
            var tags = document.getElementById('pm-save-tags').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
            var notes = document.getElementById('pm-save-notes').value;
            PropertyMaster.saveProperty(prop, { status: status, tags: tags, notes: notes }).then(function(r) {
                document.getElementById('pm-save-modal').remove();
                if (typeof showToast === 'function') {
                    showToast(r.isNew ? 'マスタに新規登録しました' : 'マスタを更新しました', 'success');
                }
            }).catch(function(err) {
                alert('保存失敗: ' + err.message);
            });
        };
    }

    function closeModal() {
        var m = document.getElementById('pm-modal');
        if (m) m.remove();
    }
    function esc(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    function downloadFile(filename, content, mime) {
        var blob = new Blob([content], { type: mime });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    return {
        openMasterList: openMasterList,
        saveFromAnalysis: saveFromAnalysis
    };
})();
