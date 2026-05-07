param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

function Assert-Contains {
    param(
        [string]$Text,
        [string]$Pattern,
        [string]$Message
    )

    if (-not $Text.Contains($Pattern)) {
        throw $Message
    }
}

$gamePath = Join-Path $Root 'game.js'
$game = Get-Content -LiteralPath $gamePath -Raw

Assert-Contains -Text $game -Pattern 'function startRangedEnemyAttack' -Message 'FAIL: ranged enemies should share one ranged attack entry.'
Assert-Contains -Text $game -Pattern 'const retreated = Math.hypot(e.x - beforeRetreatX, e.y - beforeRetreatY) > 0.5;' -Message 'FAIL: ranged close branch should detect failed retreat.'
Assert-Contains -Text $game -Pattern 'if (!retreated && hasLOS && e.cooldown <= 0) {' -Message 'FAIL: cornered ranged enemies should attack when they cannot back away.'
Assert-Contains -Text $game -Pattern 'startRangedEnemyAttack(e);' -Message 'FAIL: cornered ranged enemies should use the normal ranged attack entry.'

Write-Host 'PASS: ranged enemy cornered attack contract'
