@echo off
title NovaBot WhatsApp - Robo
color 0a
cd /d "%~dp0"

rem LOG (timestamp seguro sem : ou ,)
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "DT=%%I"
set "TS=%DT:~0,4%-%DT:~4,2%-%DT:~6,2%_%DT:~8,2%h%DT:~10,2%m%DT:~12,2%s"
echo [%TS%] INICIO > start.log
echo [%TS%] DIR: %cd% >> start.log
echo [%TS%] PATH: %PATH% >> start.log

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
echo [%TS%] NODE_CHECK: procurando node no PATH >> start.log
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo [%TS%] NODE_CHECK: node encontrado no PATH >> start.log
    goto CHECK_DEPS
)

echo [%TS%] NODE_CHECK: node nao no PATH, procurando node\node.exe >> start.log
if exist "node\node.exe" (
    echo [%TS%] NODE_CHECK: node\node.exe encontrado >> start.log
    set "NODE_CMD=node\node.exe"
    set "PATH=%~dp0node;%~dp0node_modules\.bin;%PATH%"
    goto CHECK_DEPS
)

echo [NODE] Node.js nao encontrado. Baixando versao portatil...
echo.
echo [%TS%] DOWNLOAD: baixando Node.js %NODE_VERSION% >> start.log

set NODE_VERSION=v22.14.0
set NODE_ZIP=node-%NODE_VERSION%-win-x64.zip
set NODE_URL=https://nodejs.org/dist/%NODE_VERSION%/%NODE_ZIP%

if exist "%TEMP%\%NODE_ZIP%" (
    echo [%TS%] DOWNLOAD: zip ja existe no TEMP >> start.log
    goto EXTRACT
)

echo 1. Baixando Node.js %NODE_VERSION% (%~dp0node\)
echo.

REM Try curl.exe (Windows 10+ native)
echo [%TS%] DOWNLOAD: tentando curl >> start.log
curl.exe -L --progress-bar "%NODE_URL%" -o "%TEMP%\%NODE_ZIP%"
if %errorlevel% equ 0 (
    echo [%TS%] DOWNLOAD: curl OK >> start.log
    goto EXTRACT
)

REM Fallback: PowerShell
echo [%TS%] DOWNLOAD: curl falhou, tentando PowerShell >> start.log
echo Tentando metodo alternativo...
powershell -Command "& {try{curl.exe -L -o '%TEMP%\%NODE_ZIP%' '%NODE_URL%' 2>$null; if(test-path '%TEMP%\%NODE_ZIP%'){exit 0}}catch{}; [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try{(New-Object Net.WebClient).DownloadFile('%NODE_URL%', '%TEMP%\%NODE_ZIP%'); exit 0}catch{}; Start-BitsTransfer -Source '%NODE_URL%' -Destination '%TEMP%\%NODE_ZIP%' 2>$null; if(test-path '%TEMP%\%NODE_ZIP%'){exit 0}else{exit 1}}"
if %errorlevel% equ 0 (
    echo [%TS%] DOWNLOAD: PowerShell OK >> start.log
    goto EXTRACT
)

echo [%TS%] DOWNLOAD: TODOS OS METODOS FALHARAM >> start.log
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
echo [%TS%] EXTRACT: extraindo Node.zip >> start.log
if exist "node" rmdir /s /q "node" 2>nul
powershell -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; try{[System.IO.Compression.ZipFile]::ExtractToDirectory('%TEMP%\%NODE_ZIP%', '.')}catch{}; if(test-path 'node-%NODE_VERSION%-win-x64'){Move-Item 'node-%NODE_VERSION%-win-x64' 'node' -Force}"
if not exist "node\node.exe" (
    echo [%TS%] EXTRACT: node.exe nao encontrado apos extracao >> start.log
    echo [ERRO] Falha ao extrair Node.js!
    pause
    exit /b
)
if not exist "node\node_modules\npm" (
    echo [%TS%] EXTRACT: npm ausente, tentando novamente >> start.log
    echo [ERRO] Node.js extraido incompleto (npm ausente). Tentando novamente...
    if exist "%TEMP%\%NODE_ZIP%" del "%TEMP%\%NODE_ZIP%"
    rmdir /s /q "node" 2>nul
    goto NODE_CHECK
)
echo [%TS%] EXTRACT: node + npm OK >> start.log
echo [NODE] Node.js %NODE_VERSION% instalado com sucesso!
set "NODE_CMD=node\node.exe"
set "PATH=%~dp0node;%~dp0node_modules\.bin;%PATH%"

:CHECK_DEPS
echo.
echo [%TS%] CHECK_DEPS >> start.log
%NODE_CMD% --version

if not exist "node_modules" (
    echo [%TS%] CHECK_DEPS: node_modules nao encontrado, instalando >> start.log
    echo Instalando dependencias...
    if "%NODE_CMD%"=="node" (
        npm install
    ) else (
        "%~dp0node\npm.cmd" install
    )
    if %errorlevel% neq 0 (
        echo [%TS%] CHECK_DEPS: npm install FALHOU >> start.log
        echo [ERRO] Falha ao instalar dependencias!
        pause
        exit /b
    )
    echo [%TS%] CHECK_DEPS: npm install OK >> start.log
    echo Dependencias instaladas com sucesso!
)

if not exist "config.json" (
    echo [%TS%] CONFIG: config.json nao encontrado, criando >> start.log
    if exist "config.example.json" (
        copy "config.example.json" "config.json" >nul
        echo [%TS%] CONFIG: config.json criado a partir de example >> start.log
        echo [CONFIG] ATENCAO: Edite config.json com seus dados ^(ownerNumber, api keys^) quando puder.
        echo [CONFIG] Por enquanto o bot vai iniciar com valores temporarios.
        echo.
    ) else (
        echo [%TS%] CONFIG: config.example.json tambem nao encontrado >> start.log
        echo [ERRO] config.json e config.example.json nao encontrados!
        pause
        exit /b
    )
)

echo [%TS%] INICIANDO BOT >> start.log

:Loop
echo.
echo ============================================
echo         NovaBot WhatsApp - Premium
echo ============================================
echo.

echo Iniciando bot...
%NODE_CMD% index.js
echo [%TS%] BOT: node index.js saiu com codigo %errorlevel% >> start.log
echo.
echo [!] Bot desconectou. Reiniciando em 3 segundos...
echo.
timeout /t 3 /nobreak >nul
echo [%TS%] BOT: reiniciando >> start.log
goto Loop
