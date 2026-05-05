/**
 * 画像処理モジュール
 *
 * 機能:
 *  1. リサイズ・自動トリミング（SUUMO規格 推奨横幅750px）
 *  2. ファイルサイズ圧縮（4MB以下）
 *  3. 自動マスキング（顔検知/ナンバープレート検知）
 *
 * 顔検知は face-api.js（CDN）を遅延ロード。
 * ナンバープレートは Tesseract.js（既存PDFアナライザでロード済）でOCR検出。
 */
var ImageProcessor = (function() {
    'use strict';

    // SUUMO推奨サイズ（規定書「画像（素材）の基本ルール」記載なし、業界標準値を採用）
    var SUUMO_PROFILES = {
        // 一覧サムネ用
        thumbnail:  { w: 480, h: 360, quality: 0.85 },
        // 標準サイズ
        standard:   { w: 750, h: 500, quality: 0.88 },
        // 高画質
        large:      { w: 1200, h: 800, quality: 0.92 }
    };
    var MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB

    // face-api.js CDN
    var FACEAPI_CDN = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
    var FACEAPI_MODELS = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';
    var faceLoading = null;

    // ======== 画像読込 ========
    function loadImage(file) {
        return new Promise(function(resolve, reject) {
            var img = new Image();
            img.onload = function() { resolve(img); };
            img.onerror = function() { reject(new Error('画像読み込みに失敗')); };
            img.src = URL.createObjectURL(file);
        });
    }

    // ======== リサイズ・トリミング ========
    /**
     * 画像をSUUMOプロファイルに合わせてリサイズ＋センタークロップ
     * @param {File} file
     * @param {string} profile - 'thumbnail' | 'standard' | 'large'
     * @returns {Promise<Blob>}
     */
    function resize(file, profile) {
        var p = SUUMO_PROFILES[profile] || SUUMO_PROFILES.standard;
        return loadImage(file).then(function(img) {
            var canvas = document.createElement('canvas');
            canvas.width = p.w;
            canvas.height = p.h;
            var ctx = canvas.getContext('2d');

            // アスペクト比を保ちつつセンタークロップ
            var srcRatio = img.width / img.height;
            var dstRatio = p.w / p.h;
            var sx, sy, sw, sh;
            if (srcRatio > dstRatio) {
                // 横長を縦に合わせる
                sh = img.height;
                sw = sh * dstRatio;
                sx = (img.width - sw) / 2;
                sy = 0;
            } else {
                sw = img.width;
                sh = sw / dstRatio;
                sx = 0;
                sy = (img.height - sh) / 2;
            }
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, p.w, p.h);
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, p.w, p.h);
            URL.revokeObjectURL(img.src);

            return canvasToBlob(canvas, 'image/jpeg', p.quality);
        });
    }

    function canvasToBlob(canvas, type, quality) {
        return new Promise(function(resolve) {
            canvas.toBlob(function(blob) { resolve(blob); }, type, quality);
        });
    }

    // ======== 圧縮（サイズ超過時） ========
    function compressIfLarge(blob, maxSize) {
        maxSize = maxSize || MAX_FILE_SIZE;
        if (blob.size <= maxSize) return Promise.resolve(blob);
        // 段階的に品質を下げる
        return loadImage(new File([blob], 'tmp.jpg', { type: blob.type }))
            .then(function(img) {
                var canvas = document.createElement('canvas');
                var scale = Math.sqrt(maxSize / blob.size) * 0.95;
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(img.src);
                return canvasToBlob(canvas, 'image/jpeg', 0.82);
            });
    }

    // ======== face-api.js ロード ========
    function loadFaceApi() {
        if (window.faceapi && window.faceapi.nets && window.faceapi.nets.tinyFaceDetector.isLoaded) {
            return Promise.resolve();
        }
        if (faceLoading) return faceLoading;
        faceLoading = new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = FACEAPI_CDN;
            s.onload = function() {
                window.faceapi.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODELS)
                    .then(resolve)
                    .catch(reject);
            };
            s.onerror = function() { reject(new Error('face-api.js読み込み失敗')); };
            document.head.appendChild(s);
        });
        return faceLoading;
    }

    // ======== マスキング処理 ========
    /**
     * 画像から顔とナンバープレートを検知してぼかし加工
     * @param {File|Blob} file
     * @param {object} opts - { detectFaces: bool, detectPlates: bool, blurStrength: number }
     * @returns {Promise<{ blob: Blob, detections: Array, warnings: Array }>}
     */
    function autoMask(file, opts) {
        opts = Object.assign({
            detectFaces: true,
            detectPlates: true,
            blurStrength: 25
        }, opts || {});

        var detections = [];
        var warnings = [];

        return loadImage(file).then(function(img) {
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            var tasks = [];

            // 顔検知
            if (opts.detectFaces) {
                tasks.push(loadFaceApi().then(function() {
                    return faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions({
                        inputSize: 320,
                        scoreThreshold: 0.5
                    }));
                }).then(function(faces) {
                    faces.forEach(function(d) {
                        var box = d.box;
                        // パディングを少し広く
                        var pad = box.width * 0.15;
                        var rect = {
                            type: 'face',
                            x: Math.max(0, box.x - pad),
                            y: Math.max(0, box.y - pad),
                            w: box.width + pad * 2,
                            h: box.height + pad * 2,
                            confidence: d.score
                        };
                        detections.push(rect);
                        applyBlur(ctx, rect, opts.blurStrength);
                    });
                }).catch(function(e) {
                    warnings.push('顔検知失敗: ' + e.message);
                }));
            }

            // ナンバープレート検知（簡易: 画像全体OCR + 数字-数字パターン検出）
            if (opts.detectPlates) {
                tasks.push(detectPlatesByOCR(canvas).then(function(plates) {
                    plates.forEach(function(rect) {
                        rect.type = 'plate';
                        detections.push(rect);
                        applyBlur(ctx, rect, opts.blurStrength);
                    });
                }).catch(function(e) {
                    warnings.push('ナンバープレート検知失敗: ' + e.message);
                }));
            }

            return Promise.all(tasks).then(function() {
                URL.revokeObjectURL(img.src);
                return canvasToBlob(canvas, 'image/jpeg', 0.9).then(function(blob) {
                    return { blob: blob, detections: detections, warnings: warnings };
                });
            });
        });
    }

    function applyBlur(ctx, rect, strength) {
        // ガウシアンブラーで該当領域をぼかし
        var x = Math.round(rect.x), y = Math.round(rect.y);
        var w = Math.round(rect.w), h = Math.round(rect.h);
        if (w <= 0 || h <= 0) return;
        // 一旦該当領域を抜き出して、scaleダウン→scaleアップでモザイク化
        var temp = document.createElement('canvas');
        var pixelSize = Math.max(8, Math.round(Math.min(w, h) / 8));
        temp.width = Math.max(1, Math.round(w / pixelSize));
        temp.height = Math.max(1, Math.round(h / pixelSize));
        var tctx = temp.getContext('2d');
        tctx.imageSmoothingEnabled = false;
        tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, temp.width, temp.height);
        // 元キャンバスへ拡大コピー
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(temp, 0, 0, temp.width, temp.height, x, y, w, h);
        ctx.imageSmoothingEnabled = true;
    }

    // ナンバープレート検出（OCR利用、簡易版）
    function detectPlatesByOCR(canvas) {
        if (!window.Tesseract) {
            return Promise.resolve([]); // Tesseract未ロードならスキップ
        }
        return window.Tesseract.recognize(canvas, 'jpn+eng', {
            logger: function() {} // ログ抑制
        }).then(function(result) {
            var plates = [];
            (result.data.words || []).forEach(function(w) {
                // 「数字-数字」パターン or 「品川 500 ぬ 12-34」風のパターンを検出
                if (/(\d{2,3}[-\s]\d{2,4})|(\d{1,4}\s*[ぁ-ん]\s*\d{2,4})/.test(w.text)) {
                    var b = w.bbox;
                    plates.push({
                        x: b.x0, y: b.y0,
                        w: b.x1 - b.x0,
                        h: b.y1 - b.y0,
                        confidence: w.confidence,
                        text: w.text
                    });
                }
            });
            return plates;
        }).catch(function() {
            return [];
        });
    }

    // ======== 一括処理（リサイズ＋マスク） ========
    function processForSuumo(file, opts) {
        opts = Object.assign({
            profile: 'standard',
            mask: true,
            detectFaces: true,
            detectPlates: false  // OCRは重いのでデフォルトOFF
        }, opts || {});

        var p = opts.mask
            ? autoMask(file, { detectFaces: opts.detectFaces, detectPlates: opts.detectPlates })
                .then(function(r) { return resize(new File([r.blob], file.name, { type: 'image/jpeg' }), opts.profile)
                    .then(function(blob) { return { blob: blob, detections: r.detections, warnings: r.warnings }; }); })
            : resize(file, opts.profile)
                .then(function(blob) { return { blob: blob, detections: [], warnings: [] }; });

        return p.then(function(r) {
            return compressIfLarge(r.blob).then(function(final) {
                r.blob = final;
                return r;
            });
        });
    }

    // ======== ヘルパー ========
    function blobToDataURL(blob) {
        return new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.readAsDataURL(blob);
        });
    }

    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    return {
        SUUMO_PROFILES:  SUUMO_PROFILES,
        loadImage:       loadImage,
        resize:          resize,
        compressIfLarge: compressIfLarge,
        autoMask:        autoMask,
        processForSuumo: processForSuumo,
        blobToDataURL:   blobToDataURL,
        downloadBlob:    downloadBlob
    };
})();
