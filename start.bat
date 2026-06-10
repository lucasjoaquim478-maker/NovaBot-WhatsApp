@echo off
title NovaBot WhatsApp - Robo
color 0a
cd /d "%~dp0"

rem LOG
echo [%date% %time%] INICIO > start.log
echo [%date% %time%] DIR: %cd% >> start.log
echo [%date% %time%] PATH: %PATH% >> start.log

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
echo [%date% %time%] NODE_CHECK: procurando node no PATH >> start.log
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [%date% %time%] NODE_CHECK: node encontrado no PATH >> start.log
    goto CHECK_DEPS
)

echo [%date% %time%] NODE_CHECK: node nao no PATH, procurando node\node.exe >> start.log
if exist "node\node.exe" (
    echo [%date% %time%] NODE_CHECK: node\node.exe encontrado >> start.log
    set "NODE_CMD=node\node.exe"
    set "PATH=%~dp0node;%~dp0node_modules\.bin;%PATH%"
    goto CHECK_DEPS
)

echo [NODE] Node.js nao encontrado. Baixando versao portatil...
echo.
echo [%date% %time%] DOWNLOAD: baixando Node.js %NODE_VERSION% >> start.log

set NODE_VERSION=v22.14.0
set NODE_ZIP=node-%NODE_VERSION%-win-x64.zip
set NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_ZIP%

if exist "%TEMP%\%NODE_ZIP%" (
    echo [%date% %time%] DOWNLOAD: zip ja existe no TEMP >> start.log
    goto EXTRACT
)

echo 1. Baixando Node.js %NODE_VERSION% (%~dp0node\)
echo.

REM Try curl.exe (Windows 10+ native)
echo [%date% %time%] DOWNLOAD: tentando curl >> start.log
curl.exe -L --progress-bar "%NODE_URL%" -o "%TEMP%\%NODE_ZIP%"
if %errorlevel% equ 0 (
    echo [%date% %time%] DOWNLOAD: curl OK >> start.log
    goto EXTRACT
)

REM Fallback: PowerShell
echo [%date% %time%] DOWNLOAD: curl falhou, tentando PowerShell >> start.log
echo Tentando metodo alternativo...
powershell -Command "& {try{curl.exe -L -o '%TEMP%\%NODE_ZIP%' '%NODE_URL%' 2>$null; if(test-path '%TEMP%\%NODE_ZIP%'){exit 0}}catch{}; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try{(New-Object Net.WebClient).DownloadFile('%NODE_URL%', '%TEMP%\%NODE_ZIP%'); exit 0}catch{}; Start-BitsTransfer -Source '%NODE_URL%' -Destination '%TEMP%\%NODE_ZIP%' 2>$null; if(test-path '%TEMP%\%NODE_ZIP%'){exit 0}else{exit 1}}"
if %errorlevel% equ 0 (
    echo [%date% %time%] DOWNLOAD: PowerShell OK >> start.log
    goto EXTRACT
)

echo [%date% %time%] DOWNLOAD: TODOS OS METODOS FALHARAM >> start.log
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
echo [%date% %time%] EXTRACT: extraindo Node.zip >> start.log
if exist "node" rmdir /s /q "node" 2>nul
powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; try{[System.IO.Compression.ZipFile]::ExtractToDirectory('%TEMP%\%NODE_ZIP%', '.')}catch{}; if(test-path 'node-%NODE_VERSION%-win-x64'){Move-Item 'node-%NODE_VERSION%-win-x64' 'node' -Force}"
if not exist "node\node.exe" (
    echo [%date% %time%] EXTRACT: node.exe nao encontrado apos extracao >> start.log
    echo [ERRO] Falha ao extrair Node.js!
    pause
    exit /b
)
if not exist "node\node_modules\npm" (
    echo [%date% %time%] EXTRACT: npm ausente, tentando novamente >> start.log
    echo [ERRO] Node.js extraido incompleto (npm ausente). Tentando novamente...
    if exist "%TEMP%\%NODE_ZIP%" del "%TEMP%\%NODE_ZIP%"
    rmdir /s /q "node" 2>nul
    goto NODE_CHECK
)
echo [%date% %time%] EXTRACT: node + npm OK >> start.log
echo [NODE] Node.js %NODE_VERSION% instalado com sucesso!
set "NODE_CMD=node\node.exe"
set "PATH=%~dp0node;%~dp0node_modules\.bin;%PATH%"

:CHECK_DEPS
echo.
echo [%date% %time%] CHECK_DEPS >> start.log
%NODE_CMD% --version

if not exist "node_modules" (
    echo [%date% %time%] CHECK_DEPS: node_modules nao encontrado, instalando >> start.log
    echo Instalando dependencias...
    if "%NODE_CMD%"=="node" (
        npm install
    ) else (
        "%~dp0node\npm.cmd" install
    )
    if %errorlevel% neq 0 (
        echo [%date% %time%] CHECK_DEPS: npm install FALHOU >> start.log
        echo [ERRO] Falha ao instalar dependencias!
        pause
        exit /b
    )
    echo [%date% %time%] CHECK_DEPS: npm install OK >> start.log
    echo Dependencias instaladas com sucesso!
)

if not exist "config.json" (
    echo [%date% %time%] CONFIG: config.json nao encontrado, criando >> start.log
    if exist "config.example.json" (
        copy "config.example.json" "config.json" >nul
        echo [%date% %time%] CONFIG: config.json criado a partir de example >> start.log
        echo [CONFIG] ATENCAO: Edite config.json com seus dados (ownerNumber, api keys) quando puder.
        echo [CONFIG] Por enquanto o bot vai iniciar com valores temporarios.
        echo.
    ) else (
        echo [%date% %time%] CONFIG: config.example.json tambem nao encontrado >> start.log
        echo [ERRO] config.json e config.example.json nao encontrados!
        pause
        exit /b
    )
)

echo [%date% %time%] INICIANDO BOT >> start.log

:Loop
echo.
echo ============================================
echo         NovaBot WhatsApp - Premium
echo ============================================
echo.

echo Iniciando bot...
%NODE_CMD% index.js
echo [%date% %time%] BOT: node index.js saiu com codigo %errorlevel% >> start.log
echo.
echo [!] Bot desconectou. Reiniciando em 3 segundos...
echo.
timeout /t 3 /nobreak >nul
echo [%date% %time%] BOT: reiniciando >> start.log
goto Loop
