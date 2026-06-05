@echo off
title NovaBot WhatsApp
color 0a
cd /d "%~dp0"

set "PATH=%~dp0node;%~dp0node_modules\.bin;%PATH%"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado!
    pause
    exit /b
)

:Loop
echo ============================================
echo         NovaBot WhatsApp - Premium
echo ============================================
echo.
node --version

if not exist "node_modules" (
    echo Instalando dependencias...
    npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependencias!
        pause
        exit /b
    )
    echo Dependencias instaladas com sucesso!
)

echo Iniciando bot...
node index.js
echo.
echo [!] Bot desconectou. Reiniciando em 3 segundos...
echo.
timeout /t 3 /nobreak >nul
goto Loop
