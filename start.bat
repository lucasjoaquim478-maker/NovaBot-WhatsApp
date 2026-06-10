@echo off
title NovaBot WhatsApp - Robo
color 0a
cd /d "%~dp0"

echo.
echo      .------------------------------------------.
echo      ^|                 .--.   .--.               ^|
echo      ^|                /    \_/    \              ^|
echo      ^|               ^|  .--.--.--.  ^|            ^|
echo      ^|               ^|  ^|  ^|  ^|  ^|  ^|            ^|
echo      ^|               ^|  '--'--'--'  ^|            ^|
echo      ^|                \_/  \_/  \_/             ^|
echo      ^|                  ^|       ^|                ^|
echo      ^|               ___^|___ ___^|___             ^|
echo      ^|              ^|           ^|   ^|            ^|
echo      ^|              ^|    NovaBot   ^|            ^|
echo      ^|              ^|   WhatsApp   ^|            ^|
echo      ^|              ^|   Premium    ^|            ^|
echo      ^|              '-------------'             ^|
echo      '------------------------------------------'
echo.

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

if exist "%TEMP%\%NODE_ZIP%" goto EXTRACT

echo 1. Baixando Node.js %NODE_VERSION% (%~dp0node\)
echo.

REM Try curl.exe (Windows 10+ native)
curl.exe -L --progress-bar "%NODE_URL%" -o "%TEMP%\%NODE_ZIP%"
if %errorlevel% equ 0 goto EXTRACT

REM Fallback: PowerShell
echo Tentando metodo alternativo...
powershell -Command "& {try{curl.exe -L -o '%TEMP%\%NODE_ZIP%' '%NODE_URL%' 2>$null; if(test-path '%TEMP%\%NODE_ZIP%'){exit 0}}catch{}; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try{(New-Object Net.WebClient).DownloadFile('%NODE_URL%', '%TEMP%\%NODE_ZIP%'); exit 0}catch{}; Start-BitsTransfer -Source '%NODE_URL%' -Destination '%TEMP%\%NODE_ZIP%' 2>$null; if(test-path '%TEMP%\%NODE_ZIP%'){exit 0}else{exit 1}}"
if %errorlevel% equ 0 goto EXTRACT

echo [ERRO] Nao foi possivel baixar o Node.js automaticamente.
echo.
echo Solucao manual:
echo 1. Acesse: https://nodejs.org/dist/%NODE_VERSION%/
echo 2. Baixe: %NODE_ZIP%
echo 3. Extraia para a pasta "node" dentro da pasta do bot
echo 4. Execute start.bat novamente
echo.
pause
exit /b

:EXTRACT
echo 2. Extraindo...
if exist "node" rmdir /s /q "node" 2>nul
powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; try{[System.IO.Compression.ZipFile]::ExtractToDirectory('%TEMP%\%NODE_ZIP%', '.')}catch{}; if(test-path 'node-%NODE_VERSION%-win-x64'){Move-Item 'node-%NODE_VERSION%-win-x64' 'node' -Force}"
if not exist "node\node.exe" (
    echo [ERRO] Falha ao extrair Node.js!
    pause
    exit /b
)
if not exist "node\node_modules\npm" (
    echo [ERRO] Node.js extraido incompleto (npm ausente). Tentando novamente...
    if exist "%TEMP%\%NODE_ZIP%" del "%TEMP%\%NODE_ZIP%"
    rmdir /s /q "node" 2>nul
    goto NODE_CHECK
)
echo [NODE] Node.js %NODE_VERSION% instalado com sucesso!
set "NODE_CMD=node\node.exe"
set "PATH=%~dp0node;%~dp0node_modules\.bin;%PATH%"

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

if not exist "config.json" (
    if exist "config.example.json" (
        echo [CONFIG] config.json nao encontrado. Criando a partir de config.example.json...
        copy "config.example.json" "config.json" >nul
        echo [CONFIG] ATENCAO: Edite config.json com seus dados (ownerNumber, api keys) quando puder.
        echo [CONFIG] Por enquanto o bot vai iniciar com valores temporarios.
        echo.
    ) else (
        echo [ERRO] config.json e config.example.json nao encontrados!
        pause
        exit /b
    )
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
