$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

Assert-Contains -Text $game -Pattern 'player\.attackCooldown = 0\.8 / \(1 \+ player\.attackSpeed / 100\);' -Message 'FAIL: physical attack base cooldown should be 0.8s before attack speed bonuses.'
Assert-NotContains -Text $game -Pattern 'player\.attackCooldown = 0\.5 / \(1 \+ player\.attackSpeed / 100\);' -Message 'FAIL: 0.5s base physical cooldown is too fast and should not remain.'

Write-Host 'PASS: player attack cooldown contract'
