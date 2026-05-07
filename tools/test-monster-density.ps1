$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$constantsPath = Join-Path $root 'constants.js'
$gamePath = Join-Path $root 'game.js'
$indexPath = Join-Path $root 'index.html'

$constants = Get-Content -LiteralPath $constantsPath -Raw
$game = Get-Content -LiteralPath $gamePath -Raw
$index = Get-Content -LiteralPath $indexPath -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

Assert-Contains -Text $constants -Pattern 'MAX_ENEMIES:\s*120' -Message 'FAIL: monster cap should support denser farming.'
Assert-Contains -Text $constants -Pattern 'INITIAL_ENEMIES:\s*60' -Message 'FAIL: initial floor population should be higher.'
Assert-Contains -Text $constants -Pattern 'ENEMY_SPAWN_INTERVAL:\s*1000' -Message 'FAIL: respawn interval should be faster.'
Assert-Contains -Text $constants -Pattern 'ENEMY_SPAWN_BATCH_SIZE:\s*3' -Message 'FAIL: respawn should add monsters in small batches.'
Assert-Contains -Text $constants -Pattern 'AUTO_BATTLE_SPAWN_BATCH_SIZE:\s*6' -Message 'FAIL: auto battle should refill combat faster.'
Assert-Contains -Text $constants -Pattern 'AUTO_BATTLE_ENEMY_TARGET:\s*100' -Message 'FAIL: auto battle should maintain a higher enemy target.'
Assert-Contains -Text $game -Pattern 'function findEnemySpawnPosition\(' -Message 'FAIL: respawn needs bounded retries instead of dropping a whole tick.'
Assert-Contains -Text $game -Pattern 'getDynamicEnemyTargetCount\(' -Message 'FAIL: dynamic spawn target should depend on auto battle state.'
Assert-Contains -Text $game -Pattern 'for \(let spawnIndex = 0; spawnIndex < spawnCount; spawnIndex\+\+\)' -Message 'FAIL: dynamic spawner should refill in batches.'
Assert-Contains -Text $game -Pattern 'Math\.min\(1,\s*0\.65\s*\+\s*f\s*\*\s*0\.05\)' -Message 'FAIL: initial floor population scale should start higher.'
Assert-Contains -Text $index -Pattern 'constants\.js\?v=202605072110' -Message 'FAIL: index.html did not bump constants.js cache version.'
Assert-Contains -Text $index -Pattern 'game\.js\?v=202605072110' -Message 'FAIL: index.html did not bump game.js cache version.'

Write-Host 'PASS: monster density contract'
