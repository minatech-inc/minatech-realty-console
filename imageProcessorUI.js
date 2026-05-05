/**
 * 画像処理UI
 * - 複数画像を取り込み、SUUMO規格にリサイズ＋自動マスキング
 * - 加工後画像をプレビュー＆ダウンロード（zip対応も検討）
 */
var ImageProcessorUI = (function() {
    'use strict';

    function open() {
        renderModal();
    }

    function renderModal() {
        closeModal();
        var html = '<div class="suumo-modal-overlay" id="ip-modal" style="overflow:auto;">';
        html += '<div class="suumo-modal-content" style="max-width:980px;">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">';
        html += '<h2 style="margin:0;">画像処理（SUUMO規格対応）</h2>';
        html += '<button id="ip-close" class="btn btn-outline">閉じる</button>';
        html += '</div>';

        html += '<div style="background:#f5f5f5;padding:12px;border-radius:6px;margin-bottom:14px;">';
        html += '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;">';
        html += '<label style="font-size:13px;"><b>サイズ:</b> ';
        html += '<select id="ip-profile" style="padding:4px;margin-left:6px;">';
        html += '<option value="thumbnail">サムネイル(480×360)</option>';
        html += '<option value="standard" selected>標準(750×500)</option>';
        html += '<option value="large">高画質(1200×800)</option>';
        html += '</select></label>';
        html += '<label style="font-size:13px;"><input type="checkbox" id="ip-mask-faces" checked> 顔を自動マスキング</label>';
        html += '<label style="font-size:13px;"><input type="checkbox" id="ip-mask-plates"> ナンバープレート検出（重い）</label>';
        html += '</div>';
        html += '<div style="margin-top:10px;color:#666;font-size:12px;">※顔検知ライブラリは初回使用時にCDNからロード（〜2MB）。ナンバー検出はOCR使用のため処理に時間がかかります。</div>';
        html += '</div>';

        html += '<div id="ip-drop-zone" style="border:2px dashed #4caf50;border-radius:8px;padding:30px;text-align:center;background:#f1f8e9;cursor:pointer;">';
        html += '<p style="margin:0;color:#558b2f;font-weight:bold;">画像をドロップ または クリックして選択</p>';
        html += '<p style="margin:6px 0 0;color:#999;font-size:12px;">複数選択可・JPG/PNG/WebP対応</p>';
        html += '<input type="file" id="ip-file-input" accept="image/*" multiple style="display:none;">';
        html += '</div>';

        html += '<div id="ip-progress" style="display:none;margin:14px 0;">';
        html += '<div style="background:#eee;border-radius:4px;overflow:hidden;height:8px;"><div id="ip-bar" style="background:#4caf50;height:100%;width:0%;transition:width 0.3s;"></div></div>';
        html += '<div id="ip-status" style="font-size:12px;color:#666;margin-top:4px;">準備中...</div>';
        html += '</div>';

        html += '<div id="ip-results" style="margin-top:14px;"></div>';
        html += '</div></div>';

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstChild);

        document.getElementById('ip-close').onclick = closeModal;
        var dropZone = document.getElementById('ip-drop-zone');
        var input = document.getElementById('ip-file-input');
        dropZone.onclick = function() { input.click(); };
        input.onchange = function() { handleFiles(input.files); input.value = ''; };
        ['dragenter','dragover'].forEach(function(ev) {
            dropZone.addEventListener(ev, function(e) {
                e.preventDefault();
                dropZone.style.background = '#dcedc8';
            });
        });
        ['dragleave','drop'].forEach(function(ev) {
            dropZone.addEventListener(ev, function(e) {
                e.preventDefault();
                dropZone.style.background = '#f1f8e9';
            });
        });
        dropZone.addEventListener('drop', function(e) {
            if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        });
    }

    function handleFiles(fileList) {
        var files = Array.from(fileList).filter(function(f) { return /^image\//.test(f.type); });
        if (files.length === 0) return;
        var profile = document.getElementById('ip-profile').value;
        var maskFaces = document.getElementById('ip-mask-faces').checked;
        var maskPlates = document.getElementById('ip-mask-plates').checked;
        document.getElementById('ip-progress').style.display = 'block';
        document.getElementById('ip-results').innerHTML = '';
        processSequentially(files, 0, [], { profile: profile, detectFaces: maskFaces, detectPlates: maskPlates });
    }

    function processSequentially(files, idx, results, opts) {
        if (idx >= files.length) {
            renderResults(results);
            document.getElementById('ip-progress').style.display = 'none';
            return;
        }
        var f = files[idx];
        var pct = (idx / files.length) * 100;
        document.getElementById('ip-bar').style.width = pct + '%';
        document.getElementById('ip-status').textContent = '(' + (idx + 1) + '/' + files.length + ') ' + f.name + ' を処理中...';

        ImageProcessor.processForSuumo(f, {
            profile: opts.profile,
            mask: opts.detectFaces || opts.detectPlates,
            detectFaces: opts.detectFaces,
            detectPlates: opts.detectPlates
        }).then(function(r) {
            results.push({
                originalName: f.name,
                originalSize: f.size,
                processed: r.blob,
                detections: r.detections,
                warnings: r.warnings
            });
            processSequentially(files, idx + 1, results, opts);
        }).catch(function(err) {
            results.push({
                originalName: f.name,
                error: err.message
            });
            processSequentially(files, idx + 1, results, opts);
        });
    }

    function renderResults(results) {
        document.getElementById('ip-bar').style.width = '100%';
        document.getElementById('ip-status').textContent = '完了 (' + results.length + '件)';
        var el = document.getElementById('ip-results');
        var html = '<h3 style="margin:14px 0 10px;">処理結果</h3>';
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">';
        var anySuccess = false;
        results.forEach(function(r, i) {
            html += '<div style="border:1px solid #ddd;border-radius:6px;padding:10px;background:#fafafa;">';
            if (r.error) {
                html += '<div style="color:#c62828;font-size:12px;">エラー: ' + esc(r.error) + '</div>';
                html += '<div style="font-size:11px;color:#999;margin-top:6px;">' + esc(r.originalName) + '</div>';
            } else {
                anySuccess = true;
                var url = URL.createObjectURL(r.processed);
                var origKB = Math.round(r.originalSize / 1024);
                var newKB = Math.round(r.processed.size / 1024);
                html += '<img src="' + url + '" style="width:100%;height:auto;border-radius:4px;" data-blob-id="' + i + '">';
                html += '<div style="font-size:11px;margin-top:6px;color:#666;">' + esc(r.originalName) + '</div>';
                html += '<div style="font-size:11px;color:#388e3c;">' + origKB + 'KB → ' + newKB + 'KB</div>';
                if (r.detections && r.detections.length > 0) {
                    var faces = r.detections.filter(function(d) { return d.type === 'face'; }).length;
                    var plates = r.detections.filter(function(d) { return d.type === 'plate'; }).length;
                    html += '<div style="font-size:11px;color:#1976d2;">マスク: ';
                    if (faces) html += '顔' + faces + '件 ';
                    if (plates) html += 'ナンバー' + plates + '件';
                    html += '</div>';
                }
                if (r.warnings && r.warnings.length > 0) {
                    html += '<div style="font-size:11px;color:#f57c00;" title="' + esc(r.warnings.join('\n')) + '">⚠ 警告' + r.warnings.length + '件</div>';
                }
                html += '<button data-idx="' + i + '" class="ip-dl-btn" style="margin-top:6px;width:100%;font-size:11px;padding:4px;background:#4caf50;color:#fff;border:none;border-radius:3px;cursor:pointer;">DL</button>';
            }
            html += '</div>';
        });
        html += '</div>';
        if (anySuccess) {
            html += '<button id="ip-dl-all" class="btn btn-primary" style="margin-top:14px;">全画像を一括ダウンロード</button>';
        }
        el.innerHTML = html;

        el.querySelectorAll('.ip-dl-btn').forEach(function(b) {
            b.onclick = function() {
                var i = parseInt(b.getAttribute('data-idx'));
                var r = results[i];
                if (r && r.processed) {
                    ImageProcessor.downloadBlob(r.processed, suumoFilename(r.originalName));
                }
            };
        });
        var dlAll = document.getElementById('ip-dl-all');
        if (dlAll) dlAll.onclick = function() {
            results.forEach(function(r) {
                if (r.processed) ImageProcessor.downloadBlob(r.processed, suumoFilename(r.originalName));
            });
        };
    }

    function suumoFilename(orig) {
        // 拡張子を.jpgに統一
        var base = (orig || 'image').replace(/\.[^.]+$/, '');
        return 'suumo_' + base + '.jpg';
    }

    function closeModal() {
        var m = document.getElementById('ip-modal');
        if (m) m.remove();
    }
    function esc(s) {
        if (s === undefined || s === null) return '';
        return String(s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }

    return { open: open };
})();
