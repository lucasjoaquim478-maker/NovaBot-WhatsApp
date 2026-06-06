$host.UI.RawUI.WindowTitle = "NovaBot WhatsApp - Premium"
$host.UI.RawUI.ForegroundColor = "Green"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:PATH = "$scriptDir\node;$scriptDir\node_modules\.bin;$env:PATH"

while ($true) {
    Clear-Host
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "         NovaBot WhatsApp - Premium" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""

    $nodeVersion = & "$scriptDir\node\node.exe" --version 2>$null
    if (-not $nodeVersion) {
        Write-Host "[ERRO] Node.js nao encontrado em $scriptDir\node" -ForegroundColor Red
        Read-Host "Pressione Enter para sair"
        exit 1
    }

    Write-Host "Node: $nodeVersion" -ForegroundColor Green
    Write-Host ""

    Set-Location $scriptDir

    if (-not (Test-Path "node_modules")) {
        Write-Host "Instalando dependencias..." -ForegroundColor Yellow
        & "$scriptDir\node\npm.cmd" install
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] Falha ao instalar dependencias!" -ForegroundColor Red
            Read-Host "Pressione Enter para sair"
            exit 1
        }
        Write-Host "Dependencias instaladas com sucesso!" -ForegroundColor Green
    }

    Write-Host "Iniciando bot..." -ForegroundColor Green
    & "$scriptDir\node\node.exe" index.js

    Write-Host "" -ForegroundColor Yellow
    Write-Host "[!] Bot desconectou. Reiniciando em 3 segundos..." -ForegroundColor Yellow
    Write-Host ""
    Start-Sleep -Seconds 3
}
