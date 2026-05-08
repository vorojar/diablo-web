$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$gamePath = Join-Path $root 'game.js'
$indexPath = Join-Path $root 'index.html'
$stylePath = Join-Path $root 'style.css'

$game = Get-Content -LiteralPath $gamePath -Raw
$index = Get-Content -LiteralPath $indexPath -Raw
$style = Get-Content -LiteralPath $stylePath -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

Assert-Contains -Text $style -Pattern '#notification-area\s*\{[\s\S]*?top:\s*60px;' -Message 'FAIL: notification area top anchor changed; review Boss HUD safe offset.'
Assert-Contains -Text $game -Pattern 'function drawBossHealthHud\(\)[\s\S]*?const y = 78;' -Message 'FAIL: Boss HUD should be below the top notification area.'
Assert-Contains -Text $index -Pattern 'game\.js\?v=202605080345' -Message 'FAIL: index.html did not bump the game.js cache version.'

Write-Host 'PASS: boss HUD position contract'
