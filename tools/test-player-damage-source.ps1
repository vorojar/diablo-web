$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw
$enemySystem = Get-Content -LiteralPath (Join-Path $root 'enemy-system.js') -Raw
$index = Get-Content -LiteralPath (Join-Path $root 'index.html') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

Assert-Contains -Text $game -Pattern 'sourceName = null' -Message 'FAIL: playerTakeDamage should accept a sourceName snapshot.'
Assert-Contains -Text $game -Pattern 'player\.lastDamageSource = sourceName \|\| source\?\.name \|\| player\.lastDamageSource \|\|' -Message 'FAIL: player damage source should prefer stable sourceName and avoid unknown.'
Assert-NotContains -Text $game -Pattern "player\.lastDamageSource = source\?\.name \|\| '未知';" -Message 'FAIL: player damage source still falls back to unknown.'
Assert-Contains -Text $game -Pattern 'sourceName: p\.sourceName' -Message 'FAIL: projectile hits should pass the sourceName snapshot.'
Assert-Contains -Text $game -Pattern 'sourceName: attacker\.name' -Message 'FAIL: enemy projectiles should snapshot the attacker name when fired.'
Assert-Contains -Text $game -Pattern 'sourceName: enemy\.name' -Message 'FAIL: scatter volley projectiles should snapshot the enemy name when fired.'
Assert-Contains -Text $enemySystem -Pattern 'sourceName: boss\.name' -Message 'FAIL: boss tentacle projectiles should snapshot the boss name when fired.'
Assert-Contains -Text $index -Pattern 'enemy-system\.js\?v=202605061245' -Message 'FAIL: index.html did not bump the enemy-system.js cache version.'

Write-Host 'PASS: player damage source contract'
