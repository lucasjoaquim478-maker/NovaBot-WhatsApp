$host.UI.RawUI.WindowTitle = "NovaBot WhatsApp - Premium"
$host.UI.RawUI.ForegroundColor = "Green"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

while ($true) {
    Clear-Host
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "         NovaBot WhatsApp - Premium" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""

    $nodeVersion = node --version 2>$null
    if (-not $nodeVersion) {
        Write-Host "[ERRO] Node.js nao esta instalado!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Instale o Node.js em: https://nodejs.org" -ForegroundColor Yellow
        Write-Host "(Use a versao LTS mais recente)" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Pressione Enter para sair"
        exit 1
    }

    Write-Host "Node: $nodeVersion" -ForegroundColor Green
    Write-Host ""

    Set-Location $scriptDir

    if (-not (Test-Path "node_modules")) {
        Write-Host "Instalando dependencias..." -ForegroundColor Yellow
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] Falha ao instalar dependencias!" -ForegroundColor Red
            Read-Host "Pressione Enter para sair"
            exit 1
        }
        Write-Host "Dependencias instaladas com sucesso!" -ForegroundColor Green
    }

    Write-Host "Iniciando bot..." -ForegroundColor Green
    node index.js

    Write-Host "" -ForegroundColor Yellow
    Write-Host "[!] Bot desconectou. Reiniciando em 3 segundos..." -ForegroundColor Yellow
    Write-Host ""
    Start-Sleep -Seconds 3
}
