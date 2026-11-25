$ErrorActionPreference = 'Stop'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Instale o Node.js 20 ou superior na VM. Se o Node-RED já funciona, confira se o comando node está disponível neste PowerShell.'
}
$versaoPortal = (& node --version).TrimStart('v').Split('.')[0]
if ([int]$versaoPortal -lt 20) { throw 'Este portal precisa do Node.js 20 ou superior.' }

$urlPortal = Read-Host 'Endereço do Grafana [Enter = http://127.0.0.1:3000]'
if ([string]::IsNullOrWhiteSpace($urlPortal)) { $urlPortal = 'http://127.0.0.1:3000' }
$env:GRAFANA_URL = $urlPortal.Trim()
$publicoPortal = Read-Host 'Cole o endereço do Grafana em que você já faz login no navegador (ex.: http://localhost:3000) [Enter = mesmo endereço]'
if ([string]::IsNullOrWhiteSpace($publicoPortal)) { $publicoPortal = $env:GRAFANA_URL }
$env:GRAFANA_PUBLIC_URL = $publicoPortal.Trim()
$tokenPortal = Read-Host 'Token de leitura do Grafana [Enter = acesso anônimo já habilitado]' -AsSecureString
$tokenAnteriorPortal = $env:GRAFANA_TOKEN
try {
    $env:GRAFANA_TOKEN = [pscredential]::new('grafana', $tokenPortal).GetNetworkCredential().Password
    & node (Join-Path $PSScriptRoot 'backend\servidor.cjs')
    exit $LASTEXITCODE
} finally {
    $env:GRAFANA_TOKEN = $tokenAnteriorPortal
}
