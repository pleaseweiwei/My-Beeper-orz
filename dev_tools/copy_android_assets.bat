@echo off
setlocal
set "ROOT=%~dp0.."
set "DEST=%ROOT%\android\app\src\main\assets\www"
if not exist "%DEST%" mkdir "%DEST%"
robocopy "%ROOT%" "%DEST%" index.html manifest.json service-worker.js icon.png version.txt /NFL /NDL /NJH /NJS /NP
robocopy "%ROOT%\css" "%DEST%\css" /E /NFL /NDL /NJH /NJS /NP
robocopy "%ROOT%\js" "%DEST%\js" /E /NFL /NDL /NJH /NJS /NP
rem floatpet_overlay.html is maintained directly in the Android assets directory.
rem Do not delete or copy it from the web project root: no root source exists.
rem The copied index must be patched after copying, otherwise CDN references from the web version return.
node "%ROOT%\dev_tools\patch_index.js"
echo Web assets copied to %DEST%
exit /b 0