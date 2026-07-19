/**
 * PDF/マイソク取り込み
 * Phase 1: pdf.js ネイティブテキスト抽出（無料）
 * Phase 2: Tesseract.js OCR フォールバック（無料）
 * Phase 3: Claude Haiku Vision API フォールバック（有料・opt-in）
 */
(function() {
    'use strict';

    var TESS_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    var ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
    var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
    var MIN_TEXT_CHARS = 80;
    // pdf.js CMap/標準フォント: CJK CID フォントをUnicodeへ正しくマッピングするために必須
    var PDFJS_VER = '3.11.174';
    var PDFJS_CMAP_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/cmaps/';
    var PDFJS_FONTS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VER + '/standard_fonts/';

    function pdfLoadOptions(buf) {
        return {
            data: buf,
            cMapUrl: PDFJS_CMAP_URL,
            cMapPacked: true,
            standardFontDataUrl: PDFJS_FONTS_URL
        };
    }

    var els = {};
    var tesseractLoading = null;

    document.addEventListener('DOMContentLoaded', function() {
        els.drop = document.getElementById('pdf-drop');
        els.file = document.getElementById('pdf-file');
        els.btnSelect = document.getElementById('btn-pdf-select');
        els.useVision = document.getElementById('pdf-use-vision');
        els.btnSettings = document.getElementById('btn-pdf-settings');
        els.progress = document.getElementById('pdf-progress');
        els.progressFill = document.getElementById('pdf-progress-fill');
        els.progressText = document.getElementById('pdf-progress-text');
        els.log = document.getElementById('pdf-log');
        els.modal = document.getElementById('pdf-settings-modal');
        els.keyInput = document.getElementById('anthropic-key-input');
        els.btnSave = document.getElementById('btn-pdf-settings-save');
        els.btnCancel = document.getElementById('btn-pdf-settings-cancel');

        if (!els.drop) return;

        els.btnSelect.addEventListener('click', function(e) { e.stopPropagation(); els.file.click(); });
        els.drop.addEventListener('click', function() { els.file.click(); });
        els.file.addEventListener('change', function() { handleFiles(els.file.files); els.file.value = ''; });

        ['dragenter','dragover'].forEach(function(ev) {
            els.drop.addEventListener(ev, function(e) { e.preventDefault(); els.drop.classList.add('dragover'); });
        });
        ['dragleave','drop'].forEach(function(ev) {
            els.drop.addEventListener(ev, function(e) { e.preventDefault(); els.drop.classList.remove('dragover'); });
        });
        els.drop.addEventListener('drop', function(e) {
            if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
        });

        els.btnSettings.addEventListener('click', function() {
            els.keyInput.value = localStorage.getItem('anthropic_api_key') || '';
            els.modal.style.display = 'flex';
        });
        els.btnCancel.addEventListener('click', function() { els.modal.style.display = 'none'; });
        els.btnSave.addEventListener('click', function() {
            var k = els.keyInput.value.trim();
            if (k) localStorage.setItem('anthropic_api_key', k);
            else localStorage.removeItem('anthropic_api_key');
            els.modal.style.display = 'none';
            log('API設定を保存しました', 'ok');
        });

        var savedVision = localStorage.getItem('pdf_use_vision') === '1';
        els.useVision.checked = savedVision;
        els.useVision.addEventListener('change', function() {
            localStorage.setItem('pdf_use_vision', els.useVision.checked ? '1' : '0');
        });
    });

    function log(msg, kind) {
        if (externalLog) { externalLog(msg, kind); return; }
        if (!els.log) return;
        var div = document.createElement('div');
        div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
        if (kind) div.className = 'log-' + kind;
        els.log.appendChild(div);
        els.log.scrollTop = els.log.scrollHeight;
    }

    function setProgress(pct, text) {
        if (externalProgress) { externalProgress(pct, text); return; }
        if (!els.progress) return;
        els.progress.style.display = 'block';
        els.progressFill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (text) els.progressText.textContent = text;
    }

    // ===== 外部モジュール向けAPI（取込画面などから利用） =====
    // ログ/進捗をコールバックへ差し替えたうえで抽出のみを実行し、テキストを返す
    var externalLog = null;
    var externalProgress = null;

    function extractAll(fileList, callbacks) {
        callbacks = callbacks || {};
        externalLog = callbacks.onLog || function() {};
        externalProgress = callbacks.onProgress || function() {};
        var files = Array.from(fileList);
        return new Promise(function(resolve) {
            (function next(idx, accum) {
                if (idx >= files.length) {
                    externalProgress(100, '完了');
                    externalLog = null;
                    externalProgress = null;
                    resolve(accum.join('\n\n---\n\n'));
                    return;
                }
                var f = files[idx];
                (callbacks.onProgress || function() {})((idx / files.length) * 100, '(' + (idx + 1) + '/' + files.length + ') ' + f.name);
                extractFromFile(f).then(function(text) {
                    if (text && text.trim()) accum.push(text);
                    next(idx + 1, accum);
                }).catch(function() {
                    next(idx + 1, accum);
                });
            })(0, []);
        });
    }

    window.PdfAnalyzer = { extractAll: extractAll };

    function handleFiles(fileList) {
        var files = Array.from(fileList);
        if (files.length === 0) return;
        els.log.innerHTML = '';
        log(files.length + '件のファイルを処理開始', 'ok');
        processQueue(files, 0, []);
    }

    function processQueue(files, idx, accumText) {
        if (idx >= files.length) {
            setProgress(100, '完了');
            finalize(accumText.join('\n\n---\n\n'));
            return;
        }
        var f = files[idx];
        setProgress((idx / files.length) * 100, '(' + (idx+1) + '/' + files.length + ') ' + f.name);
        extractFromFile(f).then(function(text) {
            if (text && text.trim()) {
                accumText.push(text);
                log(f.name + ' → ' + text.length + '文字抽出', 'ok');
            } else {
                log(f.name + ' → テキスト抽出失敗', 'err');
            }
            processQueue(files, idx + 1, accumText);
        }).catch(function(err) {
            log(f.name + ' → エラー: ' + (err.message || err), 'err');
            processQueue(files, idx + 1, accumText);
        });
    }

    function extractFromFile(file) {
        var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
            return extractPdf(file).then(function(text) {
                var cleanLen = text ? text.replace(/\s/g,'').length : 0;
                var replacements = text ? (text.match(/\uFFFD/g) || []).length : 0;
                var validChars = cleanLen - replacements;
                var replacementRatio = cleanLen > 0 ? replacements / cleanLen : 0;

                // 判定ロジック:
                //   - 有効文字(FFFD以外)が300文字以上あればネイティブ抽出を信頼（多少の文字化けは許容）
                //   - 文字化け率30%以上かつ有効文字が少ない場合のみOCRへフォールバック
                //   - 抽出文字数がMIN_TEXT_CHARS未満も OCR フォールバック
                var hasEnoughValid = validChars >= 300;
                var tooManyReplacements = replacementRatio >= 0.30;
                var tooLittleText = cleanLen < MIN_TEXT_CHARS;

                if (hasEnoughValid && !tooManyReplacements) {
                    if (replacements > 0) {
                        log(file.name + ' → ネイティブ抽出OK（文字化け' + replacements + '文字は許容範囲）', 'ok');
                    }
                    return text;
                }

                if (tooManyReplacements) {
                    log(file.name + ' → 文字化け率 ' + Math.round(replacementRatio * 100) + '%（カスタムフォント）のためOCRへ', 'warn');
                } else if (tooLittleText) {
                    log(file.name + ' → ネイティブ抽出が少ないためOCRへ', 'warn');
                } else {
                    log(file.name + ' → 有効文字数不足のためOCRへ', 'warn');
                }
                return rasterizePdf(file).then(function(images) {
                    return ocrImages(images, file.name);
                });
            });
        }
        return fileToImageBlob(file).then(function(blob) {
            return ocrImages([blob], file.name);
        });
    }

    function extractPdf(file) {
        if (!window.pdfjsLib) return Promise.reject(new Error('pdf.js未ロード'));
        return file.arrayBuffer().then(function(buf) {
            return pdfjsLib.getDocument(pdfLoadOptions(buf)).promise;
        }).then(function(pdf) {
            var parts = [];
            var chain = Promise.resolve();
            for (var i = 1; i <= pdf.numPages; i++) {
                (function(pageNum) {
                    chain = chain.then(function() {
                        return pdf.getPage(pageNum).then(function(page) {
                            return page.getTextContent();
                        }).then(function(tc) {
                            parts.push(groupByLine(tc.items));
                        });
                    });
                })(i);
            }
            return chain.then(function() { return parts.join('\n'); });
        });
    }

    function rasterizePdf(file) {
        return file.arrayBuffer().then(function(buf) {
            return pdfjsLib.getDocument(pdfLoadOptions(buf)).promise;
        }).then(function(pdf) {
            var images = [];
            var chain = Promise.resolve();
            var max = Math.min(pdf.numPages, 5);
            for (var i = 1; i <= max; i++) {
                (function(pageNum) {
                    chain = chain.then(function() {
                        return pdf.getPage(pageNum).then(function(page) {
                            var viewport = page.getViewport({ scale: 2.0 });
                            var canvas = document.createElement('canvas');
                            canvas.width = viewport.width;
                            canvas.height = viewport.height;
                            return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function() {
                                return new Promise(function(res) { canvas.toBlob(res, 'image/png'); });
                            }).then(function(blob) { images.push(blob); });
                        });
                    });
                })(i);
            }
            return chain.then(function() { return images; });
        });
    }

    function fileToImageBlob(file) { return Promise.resolve(file); }

    // Y座標でグルーピング + 大きな横ギャップで列分割
    function groupByLine(items) {
        if (!items || items.length === 0) return '';
        var rows = [];
        items.forEach(function(it) {
            if (!it.str || !it.str.trim()) return;
            var y = it.transform ? it.transform[5] : 0;
            var x = it.transform ? it.transform[4] : 0;
            var w = it.width || 0;
            var h = (it.height || (it.transform ? it.transform[3] : 10)) || 10;
            var tol = Math.max(1.5, h * 0.3);
            var row = null;
            for (var i = 0; i < rows.length; i++) {
                if (Math.abs(rows[i].y - y) <= tol) { row = rows[i]; break; }
            }
            if (!row) { row = { y: y, h: h, items: [] }; rows.push(row); }
            row.items.push({ x: x, w: w, h: h, str: it.str });
        });
        rows.sort(function(a, b) { return b.y - a.y; });
        var lines = [];
        rows.forEach(function(r) {
            r.items.sort(function(a, b) { return a.x - b.x; });
            var segs = [];
            var buf = '';
            var prevEnd = null;
            var gapThreshold = r.h * 3;
            r.items.forEach(function(it) {
                if (prevEnd !== null && (it.x - prevEnd) > gapThreshold) {
                    if (buf.trim()) segs.push(buf.trim());
                    buf = '';
                }
                buf += (buf && !buf.endsWith(' ') ? ' ' : '') + it.str;
                prevEnd = it.x + it.w;
            });
            if (buf.trim()) segs.push(buf.trim());
            segs.forEach(function(s) { if (s) lines.push(s); });
        });
        return lines.join('\n');
    }

    function ocrImages(images, label) {
        return loadTesseract().then(function() {
            return window.Tesseract.createWorker('jpn', 1, {
                logger: function(m) {
                    if (m.status === 'recognizing text') {
                        els.progressText.textContent = label + ' OCR ' + Math.round(m.progress * 100) + '%';
                    }
                }
            });
        }).then(function(worker) {
            var out = [];
            var chain = Promise.resolve();
            images.forEach(function(img) {
                chain = chain.then(function() {
                    return worker.recognize(img).then(function(r) { out.push(r.data.text || ''); });
                });
            });
            return chain.then(function() {
                return worker.terminate().then(function() { return out.join('\n'); });
            });
        }).then(function(text) {
            if (text && text.replace(/\s/g,'').length >= MIN_TEXT_CHARS) return text;
            if (els.useVision.checked && localStorage.getItem('anthropic_api_key')) {
                log(label + ' → OCR結果が薄いためVision APIへ', 'warn');
                return visionExtract(images, label);
            }
            return text;
        });
    }

    function loadTesseract() {
        if (window.Tesseract) return Promise.resolve();
        if (tesseractLoading) return tesseractLoading;
        tesseractLoading = new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = TESS_CDN;
            s.onload = resolve;
            s.onerror = function() { reject(new Error('Tesseract.js読み込み失敗')); };
            document.head.appendChild(s);
        });
        return tesseractLoading;
    }

    function blobToBase64(blob) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function() {
                var s = reader.result;
                resolve(s.substring(s.indexOf(',') + 1));
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function visionExtract(images, label) {
        var key = localStorage.getItem('anthropic_api_key');
        if (!key) return Promise.resolve('');
        var prompt = 'この不動産物件概要書（マイソク）から全テキスト情報を日本語で抽出してください。物件名、所在地、価格、利回り、最寄駅、面積、構造、築年月、現況、土地面積、建物面積、備考などを含めて、構造化せず全文テキストとして出力してください。解説は不要です。';
        return Promise.all(images.map(blobToBase64)).then(function(b64s) {
            var content = [];
            b64s.forEach(function(b64) {
                content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } });
            });
            content.push({ type: 'text', text: prompt });
            return fetch(ANTHROPIC_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: ANTHROPIC_MODEL,
                    max_tokens: 2048,
                    messages: [{ role: 'user', content: content }]
                })
            });
        }).then(function(r) {
            if (!r.ok) return r.text().then(function(t) { throw new Error('Vision API ' + r.status + ': ' + t); });
            return r.json();
        }).then(function(data) {
            var text = (data.content || []).map(function(c) { return c.text || ''; }).join('\n');
            log(label + ' → Vision抽出 ' + text.length + '文字', 'ok');
            return text;
        }).catch(function(err) {
            log(label + ' → Vision失敗: ' + err.message, 'err');
            return '';
        });
    }

    function finalize(text) {
        if (!text || !text.trim()) {
            log('抽出結果が空です。画質やファイル形式を確認してください。', 'err');
            return;
        }
        var pasteArea = document.getElementById('paste-area');
        if (pasteArea) pasteArea.value = text;
        var pasteTab = document.querySelector('.tab[data-tab="paste"]');
        var pasteContent = document.getElementById('tab-paste');
        if (pasteTab && pasteContent) {
            document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
            document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
            pasteTab.classList.add('active');
            pasteContent.classList.add('active');
        }
        var btn = document.getElementById('btn-parse');
        if (btn) {
            log('解析を実行します', 'ok');
            btn.click();
        }
    }
})();
