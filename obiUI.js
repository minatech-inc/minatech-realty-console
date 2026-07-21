/**
 * マイソク帯替え（自社フッター自動貼付）
 *
 * 元付業者からダウンロードしたマイソク（PDF/画像）の下部帯を、
 * 自社の帯（フッター画像）で覆って客付け用の販売図面を生成する。
 *
 * - 帯画像は初回に登録すると localStorage に保存され、以後は自動適用
 * - 帯の高さは元図面に合わせてスライダーで調整（プレビュー即時反映）
 * - 出力: PNG（画面共有・LINE送付用）/ A4 PDF（印刷用）
 * - PDFは1ページ目を対象（マイソクは通常1枚）
 */
var ObiUI = (function() {
    'use strict';

    var OBI_KEY = 'rc_obi_image';        // 帯画像 dataURL
    var OBI_HEIGHT_KEY = 'rc_obi_height'; // 帯高さ%
    var srcCanvas = null;   // 元マイソク描画済みcanvas
    var srcName = '';

    function esc(s) {
        return String(s === undefined || s === null ? '' : s)
            .replace(/[&<>"']/g, function(c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
    }

    function close() {
        var m = document.getElementById('obi-modal');
        if (m) m.remove();
    }

    function getObi() {
        try { return localStorage.getItem(OBI_KEY) || ''; } catch (e) { return ''; }
    }
    function getHeightPct() {
        var v = parseFloat(localStorage.getItem(OBI_HEIGHT_KEY));
        return isNaN(v) ? 12 : v;
    }

    function open() {
        close();
        srcCanvas = null;
        var hasObi = !!getObi();
        var html = '<div class="suumo-modal-overlay" id="obi-modal" style="overflow:auto;">' +
            '<div class="suumo-modal-content" style="max-width:980px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
            '<div><h2 style="margin:0;">マイソク帯替え</h2>' +
            '<p style="margin:4px 0 0;font-size:12px;color:#666;">ダウンロードしたマイソクの下部帯を自社フッターに差し替えます（帯画像は初回登録後、自動適用）。</p></div>' +
            '<button id="obi-close" class="btn btn-outline">閉じる</button></div>' +

            // Step1: 帯画像
            '<div style="border:1px solid #e3e8ef;border-radius:10px;padding:12px 16px;margin-top:10px;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
            '<div style="font-weight:600;">Step 1: 自社帯（フッター画像）' +
            '<span id="obi-status" style="font-size:11.5px;font-weight:400;margin-left:10px;color:' + (hasObi ? '#047857">登録済み（自動適用）' : '#b45309">未登録 — PNG/JPGを選択してください') + '</span></div>' +
            '<div><input type="file" id="obi-band-file" accept="image/*" style="display:none;">' +
            '<button id="obi-band-default" class="btn btn-primary btn-sm">標準帯を使用</button> ' +
            '<button id="obi-band-btn" class="btn btn-outline btn-sm">' + (hasObi ? '帯画像を差し替え' : '別の帯画像を登録') + '</button></div></div>' +
            '<div id="obi-band-preview" style="margin-top:8px;">' + (hasObi ? '<img src="' + getObi() + '" style="max-width:100%;border:1px solid #eee;border-radius:6px;">' : '') + '</div>' +
            '</div>' +

            // Step2: マイソク選択
            '<div style="border:2px dashed #cbd5e1;border-radius:10px;padding:18px;text-align:center;margin-top:10px;" id="obi-drop">' +
            '<div style="font-weight:600;margin-bottom:4px;">Step 2: マイソク（PDF / JPG / PNG）を選択</div>' +
            '<div style="font-size:11.5px;color:#667;margin-bottom:8px;">PDFは1ページ目を高解像度で取り込みます。ドラッグ＆ドロップ可。</div>' +
            '<input type="file" id="obi-src-file" accept=".pdf,image/*" style="display:none;">' +
            '<button id="obi-src-btn" class="btn btn-primary btn-sm">ファイルを選択</button></div>' +

            // Step3: プレビュー・調整・出力
            '<div id="obi-work" style="display:none;margin-top:12px;">' +
            '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:8px;">' +
            '<div style="font-weight:600;">Step 3: 帯の高さ調整と出力</div>' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:12px;flex:1;min-width:260px;">元帯を覆う高さ ' +
            '<input type="range" id="obi-height" min="5" max="30" step="0.5" value="' + getHeightPct() + '" style="flex:1;">' +
            '<span id="obi-height-val" style="width:44px;text-align:right;">' + getHeightPct() + '%</span></label>' +
            '<button id="obi-dl-png" class="btn btn-outline btn-sm">PNGで保存</button>' +
            '<button id="obi-dl-pdf" class="btn btn-primary btn-sm">A4 PDFで保存（印刷用）</button></div>' +
            '<div style="border:1px solid #e3e8ef;border-radius:10px;overflow:auto;max-height:60vh;background:#f8fafc;padding:10px;text-align:center;">' +
            '<canvas id="obi-canvas" style="max-width:100%;box-shadow:0 2px 12px rgba(15,23,42,.12);background:#fff;"></canvas></div>' +
            '<p style="font-size:11px;color:#98a2b3;margin:6px 0 0;">※帯替えは元付業者の広告承認範囲内でご利用ください。帯内の免許番号・連絡先は最新か必ずご確認を。</p>' +
            '</div>' +
            '</div></div>';

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('obi-close').onclick = close;

        // 標準帯（同梱の自社フッター）: 未登録時は自動適用
        document.getElementById('obi-band-default').onclick = function() { loadDefaultBand(true); };
        if (!hasObi) loadDefaultBand(false);

        // 帯画像登録
        var bandFile = document.getElementById('obi-band-file');
        document.getElementById('obi-band-btn').onclick = function() { bandFile.click(); };
        bandFile.onchange = function() {
            if (!bandFile.files.length) return;
            var reader = new FileReader();
            reader.onload = function() {
                try { localStorage.setItem(OBI_KEY, reader.result); } catch (e) {
                    alert('帯画像が大きすぎて保存できません。2MB以下のPNG/JPGを推奨します。');
                    return;
                }
                document.getElementById('obi-status').textContent = '登録済み（自動適用）';
                document.getElementById('obi-status').style.color = '#047857';
                document.getElementById('obi-band-preview').innerHTML =
                    '<img src="' + reader.result + '" style="max-width:100%;border:1px solid #eee;border-radius:6px;">';
                compose();
            };
            reader.readAsDataURL(bandFile.files[0]);
        };

        // マイソク選択
        var srcFile = document.getElementById('obi-src-file');
        document.getElementById('obi-src-btn').onclick = function() { srcFile.click(); };
        srcFile.onchange = function() { if (srcFile.files.length) loadSource(srcFile.files[0]); };
        var drop = document.getElementById('obi-drop');
        ['dragenter', 'dragover'].forEach(function(ev) {
            drop.addEventListener(ev, function(e) { e.preventDefault(); drop.style.background = '#eff6ff'; });
        });
        ['dragleave', 'drop'].forEach(function(ev) {
            drop.addEventListener(ev, function(e) { e.preventDefault(); drop.style.background = ''; });
        });
        drop.addEventListener('drop', function(e) {
            if (e.dataTransfer && e.dataTransfer.files.length) loadSource(e.dataTransfer.files[0]);
        });

        // スライダー・出力
        var slider = document.getElementById('obi-height');
        slider.oninput = function() {
            document.getElementById('obi-height-val').textContent = slider.value + '%';
            try { localStorage.setItem(OBI_HEIGHT_KEY, slider.value); } catch (e) {}
            compose();
        };
        document.getElementById('obi-dl-png').onclick = function() { download('png'); };
        document.getElementById('obi-dl-pdf').onclick = function() { download('pdf'); };
    }

    // ===== 標準帯の読込（obi-footer.png を localStorage へ） =====
    function loadDefaultBand(userTriggered) {
        fetch('obi-footer.png?v=20260720', { cache: 'no-store' })
            .then(function(res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.blob();
            })
            .then(function(blob) {
                return new Promise(function(resolve, reject) {
                    var reader = new FileReader();
                    reader.onload = function() { resolve(reader.result); };
                    reader.onerror = reject;
                    reader.readAsDataURL(blob);
                });
            })
            .then(function(dataURL) {
                try { localStorage.setItem(OBI_KEY, dataURL); } catch (e) {}
                var st = document.getElementById('obi-status');
                if (st) { st.textContent = '標準帯を適用中（自動）'; st.style.color = '#047857'; }
                var pv = document.getElementById('obi-band-preview');
                if (pv) pv.innerHTML = '<img src="' + dataURL + '" style="max-width:100%;border:1px solid #eee;border-radius:6px;">';
                compose();
            })
            .catch(function(e) {
                if (userTriggered) alert('標準帯の読込に失敗しました: ' + e.message);
            });
    }

    // ===== 元マイソク読込 =====
    function loadSource(file) {
        srcName = file.name.replace(/\.(pdf|png|jpe?g)$/i, '');
        var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
            if (!window.pdfjsLib) { alert('PDF描画モジュールが読み込まれていません'); return; }
            file.arrayBuffer().then(function(buf) {
                return pdfjsLib.getDocument({ data: buf }).promise;
            }).then(function(pdf) {
                return pdf.getPage(1);
            }).then(function(page) {
                var scale = 2400 / page.getViewport({ scale: 1 }).width; // 幅2400pxで高精細取込
                var vp = page.getViewport({ scale: scale });
                var c = document.createElement('canvas');
                c.width = vp.width; c.height = vp.height;
                return page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function() { return c; });
            }).then(function(c) {
                srcCanvas = c;
                compose();
            }).catch(function(e) {
                alert('PDFの読込に失敗しました: ' + (e && e.message ? e.message : e));
            });
        } else {
            var img = new Image();
            img.onload = function() {
                var c = document.createElement('canvas');
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                srcCanvas = c;
                compose();
            };
            img.onerror = function() { alert('画像の読込に失敗しました'); };
            img.src = URL.createObjectURL(file);
        }
    }

    // ===== 合成 =====
    function compose() {
        if (!srcCanvas) return;
        var obiData = getObi();
        var work = document.getElementById('obi-work');
        if (work) work.style.display = 'block';
        var out = document.getElementById('obi-canvas');
        if (!out) return;
        var ctx = out.getContext('2d');
        out.width = srcCanvas.width;
        out.height = srcCanvas.height;
        ctx.drawImage(srcCanvas, 0, 0);

        if (!obiData) {
            var warn = document.getElementById('obi-status');
            if (warn) warn.textContent = '未登録 — Step 1 で帯画像を登録すると自動合成されます';
            return;
        }
        var pct = parseFloat(document.getElementById('obi-height').value) / 100;
        var bandH = Math.round(out.height * pct);

        // 元帯を白で覆う
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, out.height - bandH, out.width, bandH);

        // 自社帯を下端に幅いっぱいで描画（アスペクト維持・帯高さに収める）
        var img = new Image();
        img.onload = function() {
            var scale = Math.min(out.width / img.naturalWidth, bandH / img.naturalHeight);
            var w = img.naturalWidth * scale;
            var h = img.naturalHeight * scale;
            var x = (out.width - w) / 2;
            var y = out.height - h - Math.max(0, (bandH - h) / 2);
            ctx.drawImage(img, x, y, w, h);
        };
        img.src = obiData;
    }

    // ===== 出力 =====
    function download(kind) {
        var out = document.getElementById('obi-canvas');
        if (!out || !srcCanvas) { alert('先にマイソクを選択してください'); return; }
        var name = '帯替え_' + (srcName || 'マイソク');
        if (kind === 'png') {
            var a = document.createElement('a');
            a.href = out.toDataURL('image/png');
            a.download = name + '.png';
            a.click();
        } else {
            if (typeof window.jspdf === 'undefined') { alert('PDF出力モジュールが読み込まれていません'); return; }
            var jsPDF = window.jspdf.jsPDF;
            var landscape = out.width > out.height;
            var pdf = new jsPDF(landscape ? 'l' : 'p', 'mm', 'a4');
            var pw = pdf.internal.pageSize.getWidth();
            var ph = pdf.internal.pageSize.getHeight();
            var scale = Math.min(pw / out.width, ph / out.height);
            var w = out.width * scale;
            var h = out.height * scale;
            pdf.addImage(out.toDataURL('image/jpeg', 0.92), 'JPEG', (pw - w) / 2, (ph - h) / 2, w, h);
            pdf.save(name + '.pdf');
        }
    }

    return { open: open, close: close };
})();
