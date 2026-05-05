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

Assert-Contains -Text $game -Pattern 'const scheduledMonsterAttacks = []' -Message 'FAIL: missing scheduled monster attack queue.'
Assert-Contains -Text $game -Pattern 'function startMonsterAttack' -Message 'FAIL: missing monster attack windup entry.'
Assert-Contains -Text $game -Pattern 'function processScheduledMonsterAttacks' -Message 'FAIL: missing delayed monster attack processor.'
Assert-Contains -Text $game -Pattern 'processScheduledMonsterAttacks' -Message 'FAIL: updateEnemies does not process delayed attacks.'
Assert-Contains -Text $game -Pattern 'function resolveEnemyMeleeImpact' -Message 'FAIL: missing unified melee impact resolver.'
Assert-Contains -Text $game -Pattern 'deathVisualTimer' -Message 'FAIL: missing death visibility window.'
Assert-Contains -Text $game -Pattern 'if (!e || (e.dead && !(e.deathVisualTimer > 0))) return;' -Message 'FAIL: drawEnemyActor does not render the death visibility window.'
Assert-Contains -Text $index -Pattern 'game.js?v=202605060800' -Message 'FAIL: index.html did not bump the game.js cache version.'
Assert-NotContains -Text $game -Pattern "triggerMonsterAction(e, 'attack'" -Message 'FAIL: monster AI still triggers attack animation directly.'
Assert-NotContains -Text $game -Pattern 'playerTakeDamage(calculateEnemyOutgoingDamage(e' -Message 'FAIL: monster AI still applies player damage immediately.'

Write-Host 'PASS: combat rhythm contract'
