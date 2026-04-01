@echo off
chcp 65001 >nul
echo ====================================================
echo  复制 Web 资源到 Android assets/www 目录
echo ====================================================

set SRC=%~dp0..\
set DST=%~dp0app\src\main\assets\www\

:: 创建目标目录结构
if not exist "%DST%"      mkdir "%DST%"
if not exist "%DST%css\"  mkdir "%DST%css\"
if not exist "%DST%js\"   mkdir "%DST%js\"

:: ── 1. 复制所有根目录 HTML 文件 ──────────────────────────
echo [1/6] 复制 HTML 文件...
for %%F in ("%SRC%*.html") do (
    copy /Y "%%F" "%DST%" >nul
    echo        + %%~nxF
)

:: ── 2. 复制核心资源文件 ───────────────────────────────────
echo [2/6] 复制核心资源（icon / manifest / service-worker）...
if exist "%SRC%icon.png"          copy /Y "%SRC%icon.png"          "%DST%icon.png"          >nul
if exist "%SRC%manifest.json"     copy /Y "%SRC%manifest.json"     "%DST%manifest.json"     >nul
if exist "%SRC%service-worker.js" copy /Y "%SRC%service-worker.js" "%DST%service-worker.js" >nul

:: ── 3. 复制所有 CSS ───────────────────────────────────────
echo [3/6] 复制 css\...
for %%F in ("%SRC%css\*.css") do (
    copy /Y "%%F" "%DST%css\" >nul
    echo        + %%~nxF
)

:: ── 4. 复制所有 JS ────────────────────────────────────────
echo [4/6] 复制 js\...
for %%F in ("%SRC%js\*.js") do (
    copy /Y "%%F" "%DST%js\" >nul
    echo        + %%~nxF
)

:: ── 5. 复制其他静态资源（如有 images / fonts / audio 目录）
echo [5/6] 复制其他静态资源目录（如存在）...
for %%D in (images img fonts audio media assets data) do (
    if exist "%SRC%%%D\" (
        if not exist "%DST%%%D\" mkdir "%DST%%%D\"
        xcopy /E /Y /Q "%SRC%%%D\*" "%DST%%%D\" >nul
        echo        + %%D\  [目录]
    )
)

:: ── 6. 把 icon.png 复制到各 mipmap 密度目录 ──────────────
echo [6/6] 复制图标到 mipmap 目录...
set MIPMAP_BASE=%~dp0app\src\main\res\

for %%D in (mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi) do (
    if not exist "%MIPMAP_BASE%%%D\" mkdir "%MIPMAP_BASE%%%D\"
    copy /Y "%SRC%icon.png" "%MIPMAP_BASE%%%D\ic_launcher.png"       >nul
    copy /Y "%SRC%icon.png" "%MIPMAP_BASE%%%D\ic_launcher_round.png" >nul
)
echo        mipmap-mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi 图标已更新

:: ── 统计复制结果 ─────────────────────────────────────────
echo.
echo 统计：
for /f %%i in ('dir /b /s "%DST%*.html" 2^>nul ^| find /c /v ""') do echo   HTML 文件: %%i 个
for /f %%i in ('dir /b /s "%DST%css\*.css" 2^>nul ^| find /c /v ""') do echo   CSS  文件: %%i 个
for /f %%i in ('dir /b /s "%DST%js\*.js"  2^>nul ^| find /c /v ""') do echo   JS   文件: %%i 个

echo.
echo ====================================================
echo  完成！Web 资源已同步至:
echo    %DST%
echo.
echo  下一步：在 android\ 目录运行
echo    gradlew.bat assembleDebug
echo ====================================================
pause
