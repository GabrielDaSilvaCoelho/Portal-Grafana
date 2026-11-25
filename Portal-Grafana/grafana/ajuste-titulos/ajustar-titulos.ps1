param(
    [ValidateRange(12, 28)]
    [int]$Fonte = 22,
    [string]$PastaGrafana = 'C:\Program Files\GrafanaLabs\grafana',
    [switch]$Desfazer,
    [switch]$NaoReiniciar
)

$ErrorActionPreference = 'Stop'
$raizTitulos = [IO.Path]::GetFullPath($PastaGrafana)
$indexTitulos = Join-Path $raizTitulos 'public\views\index.html'
$cssTitulos = Join-Path $raizTitulos 'public\triade-titulos.css'
if (-not (Test-Path -LiteralPath $indexTitulos -PathType Leaf)) {
    throw ('Nao encontrei public\views\index.html em: ' + $raizTitulos)
}

$htmlTitulos = [IO.File]::ReadAllText($indexTitulos)
$padraoTitulos = '(?s)<!-- TRIADE-TITULOS-INICIO -->.*?<!-- TRIADE-TITULOS-FIM -->'
if (-not $Desfazer -and $htmlTitulos -notmatch '(?i)</head>') {
    throw 'O modelo HTML nao possui </head>. Nenhum arquivo foi alterado.'
}
if (-not $Desfazer -and $htmlTitulos -notmatch '\[\[\.AppSubUrl\]\]') {
    throw 'O modelo HTML nao corresponde ao Grafana esperado. Nenhum arquivo foi alterado.'
}

$nomeBackupTitulos = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
$pastaBackupTitulos = Join-Path $raizTitulos ('triade-backups\' + $nomeBackupTitulos)
New-Item -ItemType Directory -Path $pastaBackupTitulos -Force | Out-Null
Copy-Item -LiteralPath $indexTitulos -Destination (Join-Path $pastaBackupTitulos 'index.html')
if (Test-Path -LiteralPath $cssTitulos -PathType Leaf) {
    Copy-Item -LiteralPath $cssTitulos -Destination (Join-Path $pastaBackupTitulos 'triade-titulos.css')
}

$utf8Titulos = [Text.UTF8Encoding]::new($false)
# Retira apenas nosso bloco, preservando alteracoes de outros componentes.
$htmlNovoTitulos = [regex]::Replace($htmlTitulos, $padraoTitulos, '')
if ($Desfazer) {
    [IO.File]::WriteAllText($indexTitulos, $htmlNovoTitulos, $utf8Titulos)
    Write-Output 'Personalizacao dos titulos desativada.'
} else {
    $estiloTitulos = @"
/* Triade: titulos dos paineis do Grafana. */
[data-testid$="header-container"] h2,
[data-testid$="hover-header-container"] h2,
.panel-title-text {
  font-size: ${Fonte}px !important;
  line-height: 1.1 !important;
  font-weight: 600 !important;
}
[data-testid$="header-container"] h2 button,
[data-testid$="header-container"] h2 button span,
[data-testid$="hover-header-container"] h2 button,
[data-testid$="hover-header-container"] h2 button span {
  font-size: inherit !important;
  line-height: inherit !important;
}
"@
    $versaoTitulos = [Guid]::NewGuid().ToString('N')
    $blocoTitulos = '<!-- TRIADE-TITULOS-INICIO --><link rel="stylesheet" href="[[.AppSubUrl]]/public/triade-titulos.css?v=' + $versaoTitulos + '" /><!-- TRIADE-TITULOS-FIM -->'
    $fechamentoTitulos = [regex]::new('(?i)</head>')
    $htmlNovoTitulos = $fechamentoTitulos.Replace($htmlNovoTitulos, $blocoTitulos + '</head>', 1)
    [IO.File]::WriteAllText($cssTitulos, $estiloTitulos, $utf8Titulos)
    try {
        [IO.File]::WriteAllText($indexTitulos, $htmlNovoTitulos, $utf8Titulos)
    } catch {
        Copy-Item -LiteralPath (Join-Path $pastaBackupTitulos 'index.html') -Destination $indexTitulos -Force
        throw
    }
    Write-Output ('Titulos configurados para ' + $Fonte + ' px.')
}
Write-Output ('Copia de seguranca: ' + $pastaBackupTitulos)

if (-not $NaoReiniciar) {
    try {
        Restart-Service -Name Grafana -ErrorAction Stop
        Write-Output 'Servico Grafana reiniciado. Atualize o navegador com Ctrl+F5.'
    } catch {
        Write-Warning 'Os arquivos foram salvos, mas nao foi possivel reiniciar o servico. Reinicie o Grafana pelo services.msc e atualize o navegador com Ctrl+F5.'
    }
} else {
    Write-Output 'Reinicializacao nao solicitada. Reinicie o Grafana para carregar o modelo atualizado.'
}
