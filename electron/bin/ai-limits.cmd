@echo off
setlocal
set "ELECTRON_RUN_AS_NODE=1"
set "APP_DIR=%~dp0"
if exist "%APP_DIR%resources\app.asar" (
  "%APP_DIR%QuotaLens.exe" "%APP_DIR%resources\app.asar\dist\cli\index.js" %*
) else (
  "%APP_DIR%QuotaLens.exe" %*
)
endlocal
