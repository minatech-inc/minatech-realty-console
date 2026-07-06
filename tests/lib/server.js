/**
 * テスト用の静的ファイルサーバ（依存パッケージなし）
 * リポジトリルートを http://127.0.0.1:4173 で配信する。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = process.env.PORT || 4173;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
    try {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const filePath = path.join(ROOT, urlPath);
        if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found: ' + urlPath);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (e) {
        res.writeHead(500);
        res.end(String(e));
    }
}).listen(PORT, '127.0.0.1', () => {
    console.log(`[test-server] http://127.0.0.1:${PORT} (root: ${ROOT})`);
});
