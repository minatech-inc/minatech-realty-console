/**
 * マイソク取込・登録（実業務用の物件取込）
 *
 * 「分析（投資評価・スコアリング）」と「実業務（重説・契約書・取引管理のための物件登録）」を
 * 分離するための専用画面。スコアリングを経由せず、
 *   マイソクPDF/画像 or テキスト → 解析 → 内容確認・修正 → 物件マスタ登録
 * の最短動線で登録し、そのまま取引進行管理・重説作成へ進める。
 */
var IntakeUI = (function() {
    'use strict';

    var parsedProps = [];

    // 編集フォームに出す主要フィールド
    var FIELDS = [
        '物件名', '所在地', '物件カテゴリ', '価格(万円)', '専有面積(㎡)', '土地面積(㎡)', '建物面積(㎡)',
        '間取り', '築年月', '構造', '駅徒歩(分)', '表面利回り(%)', '現況', '備考'
    ];

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/[&<>"']/g, function(c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
    }

    function close() {
        var m = document.getElementById('ik-modal');
        if (m) m.remove();
    }

    function open() {
        close();
        parsedProps = [];
        var html = '<div class="suumo-modal-overlay" id="ik-modal" style="overflow:auto;">' +
            '<div class="suumo-modal-content" style="max-width:900px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<div><h2 style="margin:0;">マイソク取込・登録</h2>' +
            '<p style="margin:4px 0 0;font-size:12px;color:#666;">実業務用の物件登録です。スコアリングは行わず、マスタ登録後にそのまま重説・契約書・取引進行管理で使えます。投資評価が目的の場合は「物件評価分析」をご利用ください。</p></div>' +
            '<button id="ik-close" class="btn btn-outline">閉じる</button></div>' +

            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">' +
            '<div style="border:2px dashed #cbd5e1;border-radius:10px;padding:20px;text-align:center;" id="ik-drop">' +
            '<div style="font-weight:600;margin-bottom:4px;">マイソクPDF・画像から取込</div>' +
            '<div style="font-size:11.5px;color:#667;margin-bottom:10px;">PDF / JPG / PNG（複数可）。文字が読めない画像はOCRで抽出します。</div>' +
            '<input type="file" id="ik-file" accept=".pdf,image/*" multiple style="display:none;">' +
            '<button id="ik-file-btn" class="btn btn-primary btn-sm">ファイルを選択</button>' +
            '</div>' +
            '<div style="border:1px solid #e3e8ef;border-radius:10px;padding:14px;">' +
            '<div style="font-weight:600;margin-bottom:6px;">テキストから取込</div>' +
            '<textarea id="ik-paste" rows="4" placeholder="レインズ・マイソクのテキストを貼り付け" style="width:100%;padding:8px;border:1px solid #d1d8e2;border-radius:6px;font-size:12px;"></textarea>' +
            '<button id="ik-parse-text" class="btn btn-outline btn-sm" style="margin-top:6px;">テキストを解析</button>' +
            '</div></div>' +

            '<div id="ik-progress" style="display:none;margin-top:12px;">' +
            '<div style="height:6px;background:#eef1f6;border-radius:999px;overflow:hidden;">' +
            '<div id="ik-progress-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);transition:width .3s;"></div></div>' +
            '<div id="ik-progress-text" style="font-size:11.5px;color:#667;margin-top:4px;">準備中…</div></div>' +

            '<div id="ik-result" style="margin-top:14px;"></div>' +
            '</div></div>';

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('ik-close').onclick = close;
        var fileInput = document.getElementById('ik-file');
        document.getElementById('ik-file-btn').onclick = function() { fileInput.click(); };
        fileInput.onchange = function() { if (fileInput.files.length) extractFiles(fileInput.files); };

        var drop = document.getElementById('ik-drop');
        ['dragenter', 'dragover'].forEach(function(ev) {
            drop.addEventListener(ev, function(e) { e.preventDefault(); drop.style.background = '#eff6ff'; });
        });
        ['dragleave', 'drop'].forEach(function(ev) {
            drop.addEventListener(ev, function(e) { e.preventDefault(); drop.style.background = ''; });
        });
        drop.addEventListener('drop', function(e) {
            if (e.dataTransfer && e.dataTransfer.files.length) extractFiles(e.dataTransfer.files);
        });

        document.getElementById('ik-parse-text').onclick = function() {
            var text = document.getElementById('ik-paste').value;
            if (!text.trim()) { alert('テキストを貼り付けてください'); return; }
            parseAndPreview(text);
        };
    }

    function setProgress(pct, text) {
        var wrap = document.getElementById('ik-progress');
        if (!wrap) return;
        wrap.style.display = 'block';
        document.getElementById('ik-progress-fill').style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (text) document.getElementById('ik-progress-text').textContent = text;
    }

    function extractFiles(files) {
        if (typeof PdfAnalyzer === 'undefined') { alert('PDF解析モジュールが読み込まれていません'); return; }
        setProgress(2, '抽出を開始します…');
        PdfAnalyzer.extractAll(files, {
            onProgress: setProgress,
            onLog: function(msg) { setProgress(undefined, msg); }
        }).then(function(text) {
            if (!text || !text.trim()) {
                setProgress(100, '抽出結果が空でした。画質・ファイル形式をご確認ください。');
                return;
            }
            parseAndPreview(text);
        });
    }

    function parseAndPreview(text) {
        var props = [];
        try { props = ReinsParser.parse(text) || []; } catch (e) {}
        if (!props.length) props = [{}];
        // 解析で拾えなかった場合に備え、原文を備考に添付しない（ノイズ回避）。編集フォームで補完してもらう
        parsedProps = props;
        renderPreview();
    }

    function renderPreview() {
        var target = document.getElementById('ik-result');
        var html = '<div style="font-weight:600;margin-bottom:8px;">取込内容の確認・修正（' + parsedProps.length + '件）</div>' +
            '<p style="font-size:11.5px;color:#667;margin:0 0 10px;">空欄は登録後にマスタで追記できます。物件名と所在地だけは登録前の入力を推奨します。</p>';
        parsedProps.forEach(function(p, i) {
            html += '<div style="border:1px solid #e3e8ef;border-radius:10px;padding:14px;margin-bottom:10px;">' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;">';
            FIELDS.forEach(function(f) {
                html += '<div><label style="display:block;font-size:11px;color:#556;">' + esc(f) + '</label>' +
                    '<input type="text" class="ik-field" data-prop="' + i + '" data-field="' + esc(f) + '"' +
                    ' value="' + esc(p[f] || '') + '" style="width:100%;padding:6px 8px;border:1px solid #d1d8e2;border-radius:6px;font-size:12.5px;"></div>';
            });
            html += '</div>' +
                '<div style="margin-top:10px;text-align:right;">' +
                '<button class="btn btn-primary btn-sm ik-save" data-prop="' + i + '">この物件をマスタに登録</button>' +
                '</div></div>';
        });
        target.innerHTML = html;

        Array.prototype.forEach.call(document.querySelectorAll('.ik-field'), function(inp) {
            inp.onchange = function() {
                parsedProps[parseInt(inp.dataset.prop, 10)][inp.dataset.field] = inp.value.trim();
            };
        });
        Array.prototype.forEach.call(document.querySelectorAll('.ik-save'), function(b) {
            b.onclick = async function() {
                var p = parsedProps[parseInt(b.dataset.prop, 10)];
                if (!p['物件名'] && !p['所在地']) { alert('物件名または所在地を入力してください'); return; }
                if (!p['物件名']) p['物件名'] = p['所在地'];
                try {
                    await PropertyMaster.saveProperty(Object.assign({}, p, { 'ステータス': '検討中' }));
                    b.textContent = '登録済み';
                    b.disabled = true;
                    showNext(p);
                } catch (e) {
                    alert('登録に失敗しました: ' + (e && e.message ? e.message : e));
                }
            };
        });
    }

    function showNext(p) {
        var target = document.getElementById('ik-result');
        var div = document.createElement('div');
        div.style.cssText = 'background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:12px 16px;margin-bottom:10px;font-size:13px;';
        div.innerHTML = '<b>' + esc(p['物件名']) + '</b> を物件マスタに登録しました。続けて:' +
            '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
            '<button class="btn btn-primary btn-sm" id="ik-go-tx">取引進行管理を開始</button>' +
            '<button class="btn btn-outline btn-sm" id="ik-go-dsc">重説下書きを作成</button>' +
            '<button class="btn btn-outline btn-sm" id="ik-go-master">物件マスタを開く</button></div>';
        target.insertBefore(div, target.firstChild);

        div.querySelector('#ik-go-tx').onclick = function() {
            close();
            if (typeof TransactionUI !== 'undefined') TransactionUI.open();
        };
        div.querySelector('#ik-go-dsc').onclick = function() {
            close();
            if (typeof DisclosureUI !== 'undefined') DisclosureUI.open(p);
        };
        div.querySelector('#ik-go-master').onclick = function() {
            close();
            if (typeof PropertyMasterUI !== 'undefined') PropertyMasterUI.openMasterList();
        };
    }

    return { open: open, close: close };
})();
