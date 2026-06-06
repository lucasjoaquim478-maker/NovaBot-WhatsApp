$host.UI.RawUI.WindowTitle = "NovaBot WhatsApp - Premium"
$host.UI.RawUI.ForegroundColor = "Green"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$script:nodeVersion = "v22.14.0"
$script:nodeZip = "node-$($script:nodeVersion)-win-x64.zip"
$script:nodeUrl = "https://nodejs.org/dist/$($script:nodeVersion)/$($script:nodeZip)"
$script:nodeDir = Join-Path $scriptDir "node"
$script:nodeExe = Join-Path $script:nodeDir "node.exe"

function Get-NodeCmd {
    $globalNode = Get-Command "node" -ErrorAction SilentlyContinue
    if ($globalNode) { return "node" }
    if (Test-Path $script:nodeExe) { return $script:nodeExe }
    return $null
}

function Install-Node {
    Write-Host "[NODE] Node.js nao encontrado. Baixando versao portatil..." -ForegroundColor Yellow
    Write-Host ""

    $zipPath = Join-Path $env:TEMP $script:nodeZip

    if (-not (Test-Path $zipPath)) {
        Write-Host "1. Baixando Node.js $($script:nodeVersion) ..." -ForegroundColor Cyan
        try { curl.exe -L --progress-bar "$($script:nodeUrl)" -o "$zipPath" 2>$null } catch {}
        if (-not (Test-Path $zipPath)) {
            try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile($script:nodeUrl, $zipPath) } catch {}
        }
        if (-not (Test-Path $zipPath)) {
            try { Start-BitsTransfer -Source $script:nodeUrl -Destination $zipPath } catch {}
        }
        if (-not (Test-Path $zipPath)) {
            Write-Host "[ERRO] Nao foi possivel baixar o Node.js automaticamente." -ForegroundColor Red
            Write-Host ""
            Write-Host "Solucao manual:" -ForegroundColor Yellow
            Write-Host "1. Acesse: https://nodejs.org/dist/$($script:nodeVersion)/" -ForegroundColor Yellow
            Write-Host "2. Baixe: $($script:nodeZip)" -ForegroundColor Yellow
            Write-Host "3. Extraia para a pasta 'node' dentro da pasta do bot" -ForegroundColor Yellow
            Write-Host "4. Execute start.ps1 novamente" -ForegroundColor Yellow
            Read-Host "`nPressione Enter para sair"
            exit 1
        }
    }

    Write-Host "2. Extraindo..." -ForegroundColor Cyan
    if (Test-Path $script:nodeDir) { Remove-Item $script:nodeDir -Recurse -Force }
    try {
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $scriptDir)
        $extracted = "node-$($script:nodeVersion)-win-x64"
        if (Test-Path $extracted) { Move-Item $extracted "node" -Force }
    } catch {}

    if (-not (Test-Path $script:nodeExe)) {
        Write-Host "[ERRO] Falha ao extrair Node.js!" -ForegroundColor Red
        Read-Host "Pressione Enter para sair"
        exit 1
    }
    Write-Host "[NODE] Node.js $($script:nodeVersion) instalado com sucesso!" -ForegroundColor Green
}

$nodeCmd = Get-NodeCmd
if (-not $nodeCmd) {
    Install-Node
    $nodeCmd = $script:nodeExe
    $env:PATH = "$script:nodeDir;$script:nodeDir\node_modules\.bin;$env:PATH"
}

while ($true) {
    Clear-Host
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "         NovaBot WhatsApp - Premium" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""

    $ver = & $nodeCmd --version
    Write-Host "Node: $ver" -ForegroundColor Green
    Write-Host ""

    if (-not (Test-Path "node_modules")) {
        Write-Host "Instalando dependencias..." -ForegroundColor Yellow
        if ($nodeCmd -eq "node") { npm install } else { & (Join-Path $script:nodeDir "npm.cmd") install }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[ERRO] Falha ao instalar dependencias!" -ForegroundColor Red
            Read-Host "Pressione Enter para sair"
            exit 1
        }
        Write-Host "Dependencias instaladas com sucesso!" -ForegroundColor Green
    }

    Write-Host "Iniciando bot..." -ForegroundColor Green
    & $nodeCmd index.js

    Write-Host "" -ForegroundColor Yellow
    Write-Host "[!] Bot desconectou. Reiniciando em 3 segundos..." -ForegroundColor Yellow
    Write-Host ""
    Start-Sleep -Seconds 3
}
