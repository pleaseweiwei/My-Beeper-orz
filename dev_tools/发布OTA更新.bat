@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   Beeper 热更新发布工具
echo ============================================
echo.

REM ── 1. 读取当前版本号 ──────────────────────────────────────────
for /f "delims=" %%v in ('powershell -NoProfile -Command "(Get-Content version.json | ConvertFrom-Json).version"') do set OLDVER=%%v
set /a NEWVER=%OLDVER%+1

echo 当前版本: v%OLDVER%
echo 新版本  : v%NEWVER%
echo.

REM ── 2. 同步网页文件到 android/assets ─────────────────────────
echo [1/4] 同步网页资源到 android assets...
call android\copy_assets.bat
echo.

REM ── 3. 在 assets/www/version.txt 写入新版本号 ────────────────
echo [2/4] 写入版本号 %NEWVER% 到 assets...
echo %NEWVER%> android\app\src\main\assets\www\version.txt
echo.

REM ── 4. 打包 web_update.zip (使用 Python 递归压缩，避免 PowerShell Compress-Archive 不递归子目录的 bug) ───────────────────────────
echo [3/4] 打包 web_update.zip...
if exist web_update.zip del /f web_update.zip

REM 用 Node.js 递归打包（跨平台，无需第三方依赖）
node make_zip.js
if errorlevel 1 (
    echo [ERROR] Node.js 打包失败，请确保 node 已安装！
    pause
    exit /b 1
)

for %%s in (web_update.zip) do (
  set /a SIZE_MB=%%~zs / 1048576
)
echo   已生成 web_update.zip
echo.

REM ── 5. 更新 version.json ─────────────────────────────────────
echo [4/4] 更新 version.json...
powershell -NoProfile -Command ^
  "$v = [ordered]@{version=%NEWVER%;url='https://raw.githubusercontent.com/ljb0621/bono1122/main/web_update.zip'}; ($v | ConvertTo-Json -Compress) | Set-Content 'version.json' -Encoding UTF8"

echo.
echo ============================================
echo   完成！version.json 已更新到 v%NEWVER%
echo ============================================
echo.
echo 下一步：将更改推送到 GitHub，手机端下次启动自动更新
echo.
echo   git add version.json web_update.zip android\app\src\main\assets\www\version.txt
echo   git commit -m "OTA: update to v%NEWVER%"
echo   git push
echo.
echo 如需同时更新内置 APK（添加新权限/原生功能时才需要）：
echo   cd android ^&^& gradlew.bat assembleDebug
echo.
pause
