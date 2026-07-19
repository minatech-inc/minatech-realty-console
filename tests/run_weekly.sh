#!/bin/bash
# Realty Console 週次全項目テスト（毎週月曜 06:30）
# run_weekly.bat（ASCII launcher）から git-bash 経由で実行される
cd /c/Users/MINATE~1/MinaTech-RealtyConsole || exit 1
mkdir -p tests/reports
{
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] weekly full test start"
    npx playwright test
    echo "playwright exit=$?"
    node tests/lib/make-report.js
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] done"
} >> tests/reports/run.log 2>&1
