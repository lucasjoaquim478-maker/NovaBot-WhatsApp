@echo off
title NovaBot WhatsApp
color 0a
cd /d "%~dp0"

:NODE_CHECK
set "NODE_CMD=node"
where node >nul 2>nul
if %errorlevel% equ 0 goto CHECK_DEPS

if exist "node\node.exe" (
    set "NODE_CMD=node\node.exe"
    set "PATH=%~dp0node;%~dp0node_modules\.bin;%PATH%"
    goto CHECK_DEPS
)

echo [NODE] Node.js nao encontrado. Baixando versao portatil...
echo.

set NODE_VERSION=v22.14.0
set NODE_ZIP=node-%NODE_VERSION%-win-x64.zip
set NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_ZIP%

if not exist "%TEMP%\%NODE_ZIP%" (
    echo Baixando Node.js %NODE_VERSION%...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%TEMP%\%NODE_ZIP%'"
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao baixar Node.js!
        echo Baixe manualmente em: https://nodejs.org
        pause
        exit /b
    )
)

echo Extraindo...
powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('%TEMP%\%NODE_ZIP%', '.'); Move-Item 'node-%NODE_VERSION%-win-x64' 'node' -Force"
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao extrair Node.js!
    pause
    exit /b
)

if exist "node\node.exe" (
    set "NODE_CMD=node\node.exe"
    set "PATH=%~dp0node;%~dp0node_modules\.bin;%PATH%"
    echo [NODE] Node.js %NODE_VERSION% instalado com sucesso!
) else (
    echo [ERRO] Node.js nao encontrado apos extracao!
    pause
    exit /b
)

:CHECK_DEPS
echo.
%NODE_CMD% --version

if not exist "node_modules" (
    echo Instalando dependencias...
    if "%NODE_CMD%"=="node" (
        npm install
    ) else (
        "%~dp0node\npm.cmd" install
    )
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependencias!
        pause
        exit /b
    )
    echo Dependencias instaladas com sucesso!
)

:Loop
echo.
echo ============================================
echo         NovaBot WhatsApp - Premium
echo ============================================
echo.

echo Iniciando bot...
%NODE_CMD% index.js
echo.
echo [!] Bot desconectou. Reiniciando em 3 segundos...
echo.
timeout /t 3 /nobreak >nul
goto Loop
