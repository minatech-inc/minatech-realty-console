@echo off
rem ============================================
rem Realty Console 全項目テスト（週次・毎週月曜 06:30）
rem 層1コアロジック + 層2 UI E2E + 層3 重い機能 + 本番スモーク
rem 結果は必ずHTMLレポートとして出力される（成功時も失敗時も）
rem ============================================
setlocal
cd /d "%~dp0.."

echo [%date% %time%] Realty Console 全項目テスト開始 >> tests\reports\run.log

call npx playwright test 2>> tests\reports\run.log
set TEST_EXIT=%ERRORLEVEL%

call node tests\lib\make-report.js >> tests\reports\run.log 2>&1
set REPORT_EXIT=%ERRORLEVEL%

echo [%date% %time%] テスト終了 exit=%TEST_EXIT% report=%REPORT_EXIT% >> tests\reports\run.log

rem 失敗時は Windows 通知（既存の通知基盤と同形式）
if not "%TEST_EXIT%"=="0" (
    powershell -NoProfile -Command "New-BurntToastNotification -Text 'Realty Console テスト失敗', 'デスクトップのテストレポートを確認してください' -ErrorAction SilentlyContinue" 2>nul
)

endlocal
