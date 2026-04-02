@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title 悬浮桌宠 APK 编译工具

echo ============================================
echo   悬浮桌宠 APK 一键编译
echo ============================================
echo.

:: ─── 1. 检测 JAVA_HOME ───────────────────────────────
if defined JAVA_HOME (
    echo [✓] 已找到 JAVA_HOME: %JAVA_HOME%
    goto :java_ok
)

:: 自动搜索 Microsoft OpenJDK 17
for /d %%i in ("C:\Program Files\Microsoft\jdk-17*") do (
    set "JAVA_HOME=%%i"
    echo [✓] 自动检测到 Microsoft OpenJDK: %%i
    goto :java_ok
)

:: 自动搜索 Eclipse Temurin / Adoptium
for /d %%i in ("C:\Program Files\Eclipse Adoptium\jdk-17*") do (
    set "JAVA_HOME=%%i"
    echo [✓] 自动检测到 Eclipse Temurin JDK: %%i
    goto :java_ok
)

:: 从注册表读取
for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\JavaSoft\JDK" /v CurrentVersion 2^>nul') do set JDK_VER=%%b
if defined JDK_VER (
    for /f "tokens=2*" %%a in ('reg query "HKLM\SOFTWARE\JavaSoft\JDK\!JDK_VER!" /v JavaHome 2^>nul') do (
        set "JAVA_HOME=%%b"
        echo [✓] 从注册表读取 JDK: !JAVA_HOME!
        goto :java_ok
    )
)

:: 未找到 JDK
echo [✗] 未找到 JDK 17！
echo.
echo 正在尝试用 winget 安装 Microsoft OpenJDK 17...
echo (安装时会弹出 UAC 权限提示，请点击"是")
echo.
winget install --id Microsoft.OpenJDK.17 --accept-source-agreements --accept-package-agreements
if %ERRORLEVEL% neq 0 (
    echo.
    echo [✗] 自动安装失败，请手动安装 JDK 17：
    echo     https://aka.ms/download-JDK/microsoft-JDK-17-windows-x64.msi
    echo.
    pause
    exit /b 1
)
:: 安装后重新检测
for /d %%i in ("C:\Program Files\Microsoft\jdk-17*") do (
    set "JAVA_HOME=%%i"
    goto :java_ok
)
echo [✗] 安装后仍未找到 JDK，请重启命令行后重试。
pause
exit /b 1

:java_ok
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo.

:: ─── 2. 检测 Android SDK ─────────────────────────────
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%local.properties" (
    echo [✓] local.properties 已存在
) else (
    if exist "%LOCALAPPDATA%\Android\Sdk" (
        echo sdk.dir=%LOCALAPPDATA%\Android\Sdk > "%SCRIPT_DIR%local.properties"
        echo [✓] 已创建 local.properties
    ) else (
        echo [✗] 未找到 Android SDK，请先安装。
        pause
        exit /b 1
    )
)
echo.

:: ─── 3. 同步网页资源 ─────────────────────────────────
echo [→] 同步网页资源到 assets/www...
if exist "%SCRIPT_DIR%copy_assets.bat" (
    call "%SCRIPT_DIR%copy_assets.bat" >nul 2>&1
    echo [✓] 网页资源同步完成
) else (
    echo [!] 未找到 copy_assets.bat，跳过资源同步
)
echo.

:: ─── 4. 执行 Gradle 编译 ────────────────────────────
echo [→] 开始 Gradle 编译（首次编译需下载依赖，约需 5-15 分钟）...
echo     Gradle 版本: 8.10.2
echo     AGP 版本:    8.8.0
echo.

cd /d "%SCRIPT_DIR%"
call gradlew.bat assembleDebug --no-daemon --warning-mode=all 2>&1

if %ERRORLEVEL% neq 0 (
    echo.
    echo ============================================
    echo [✗] 编译失败！请查看上方错误信息。
    echo ============================================
    pause
    exit /b 1
)

:: ─── 5. 查找 APK 输出路径 ────────────────────────────
echo.
echo ============================================
echo [✓] 编译成功！
echo ============================================

set "APK_PATH=%SCRIPT_DIR%app\build\outputs\apk\debug\app-debug.apk"
if exist "%APK_PATH%" (
    echo APK 路径: %APK_PATH%
    echo.
    echo 正在打开 APK 所在文件夹...
    explorer /select,"%APK_PATH%"
) else (
    echo APK 路径: %SCRIPT_DIR%app\build\outputs\apk\debug\
)

echo.
pause
