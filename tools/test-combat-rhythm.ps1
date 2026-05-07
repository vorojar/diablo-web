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

function Assert-NotContains {
    param(
        [string]$Text,
        [string]$Pattern,
        [string]$Message
    )

    if ($Text.Contains($Pattern)) {
        throw $Message
    }
}

$gamePath = Join-Path $Root 'game.js'
$indexPath = Join-Path $Root 'index.html'

$game = Get-Content -LiteralPath $gamePath -Raw
$index = Get-Content -LiteralPath $indexPath -Raw
$rangedStart = $game.IndexOf("if (e.ai === 'ranged') {")
$reviveStart = $game.IndexOf("} else if (e.ai === 'revive') {", $rangedStart)
if ($rangedStart -lt 0 -or $reviveStart -lt 0) {
    throw 'FAIL: cannot locate ranged AI block.'
}
$rangedBlock = $game.Substring($rangedStart, $reviveStart - $rangedStart)
$specterStart = $game.IndexOf("} else if (e.ai === 'specter') {")
$chaseStart = $game.IndexOf('const shouldFlee =', $specterStart)
if ($specterStart -lt 0 -or $chaseStart -lt 0) {
    throw 'FAIL: cannot locate specter AI block.'
}
$specterBlock = $game.Substring($specterStart, $chaseStart - $specterStart)

Assert-Contains -Text $game -Pattern 'const scheduledMonsterAttacks = []' -Message 'FAIL: missing scheduled monster attack queue.'
Assert-Contains -Text $game -Pattern 'function startMonsterAttack' -Message 'FAIL: missing monster attack windup entry.'
Assert-Contains -Text $game -Pattern 'function processScheduledMonsterAttacks' -Message 'FAIL: missing delayed monster attack processor.'
Assert-Contains -Text $game -Pattern 'processScheduledMonsterAttacks' -Message 'FAIL: updateEnemies does not process delayed attacks.'
Assert-Contains -Text $game -Pattern 'function resolveEnemyMeleeImpact' -Message 'FAIL: missing unified melee impact resolver.'
Assert-Contains -Text $game -Pattern 'deathVisualTimer' -Message 'FAIL: missing death visibility window.'
Assert-Contains -Text $game -Pattern 'if (!e || (e.dead && !(e.deathVisualTimer > 0))) return;' -Message 'FAIL: drawEnemyActor does not render the death visibility window.'
Assert-NotContains -Text $game -Pattern "triggerMonsterAction(e, 'attack'" -Message 'FAIL: monster AI still triggers attack animation directly.'
Assert-NotContains -Text $game -Pattern 'playerTakeDamage(calculateEnemyOutgoingDamage(e' -Message 'FAIL: monster AI still applies player damage immediately.'
Assert-Contains -Text $rangedBlock -Pattern 'if (distSq < 22500) {' -Message 'FAIL: ranged enemies should back away whenever they are too close.'
Assert-NotContains -Text $rangedBlock -Pattern 'if (distSq < 22500 && hasLOS)' -Message 'FAIL: ranged enemies only back away when line of sight is open.'
Assert-NotContains -Text $rangedBlock -Pattern 'if (!hasLineOfSight(attacker.x, attacker.y, player.x, player.y)) return;' -Message 'FAIL: ranged delayed impact cancels the arrow after windup.'
Assert-Contains -Text $specterBlock -Pattern "type: 'lightning_ball'" -Message 'FAIL: specter delayed attack does not emit lightning projectiles.'
Assert-Contains -Text $specterBlock -Pattern 'if (distSq < 14400) {' -Message 'FAIL: specter should back away whenever it is too close.'
Assert-NotContains -Text $specterBlock -Pattern 'if (distSq < 14400 && hasLOS)' -Message 'FAIL: specter only backs away when line of sight is open.'
Assert-NotContains -Text $specterBlock -Pattern 'if (!hasLineOfSight(attacker.x, attacker.y, player.x, player.y)) return;' -Message 'FAIL: specter delayed impact cancels the lightning shot after windup.'
Assert-Contains -Text $index -Pattern 'game.js?v=202605080230' -Message 'FAIL: index.html did not bump the game.js cache version.'

Write-Host 'PASS: combat rhythm contract'
