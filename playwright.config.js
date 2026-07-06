// Realty Console 全項目自動テスト設定
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/specs',
    timeout: 60 * 1000,
    expect: { timeout: 10 * 1000 },
    fullyParallel: false,
    workers: 1,
    retries: 1,
    reporter: [
        ['list'],
        ['json', { outputFile: 'tests/reports/last-run.json' }]
    ],
    use: {
        baseURL: 'http://127.0.0.1:4173',
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
        viewport: { width: 1440, height: 900 },
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure'
    },
    webServer: {
        command: 'node tests/lib/server.js',
        url: 'http://127.0.0.1:4173/index.html',
        reuseExistingServer: true,
        timeout: 15 * 1000
    }
});
