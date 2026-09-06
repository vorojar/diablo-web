$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'assert-versioned-asset.ps1')

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

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

Assert-Contains -Text $constants -Pattern 'MAX_ENEMIES:\s*80' -Message 'FAIL: monster cap should match the compact dungeon size.'
Assert-Contains -Text $constants -Pattern 'INITIAL_ENEMIES:\s*36' -Message 'FAIL: initial floor population should match the compact dungeon size.'
Assert-Contains -Text $constants -Pattern 'ENEMY_SPAWN_INTERVAL:\s*1000' -Message 'FAIL: respawn interval should be faster.'
Assert-Contains -Text $constants -Pattern 'ENEMY_SPAWN_BATCH_SIZE:\s*3' -Message 'FAIL: respawn should add monsters in small batches.'
Assert-Contains -Text $constants -Pattern 'AUTO_BATTLE_SPAWN_BATCH_SIZE:\s*6' -Message 'FAIL: auto battle should refill combat faster.'
Assert-Contains -Text $constants -Pattern 'AUTO_BATTLE_ENEMY_TARGET:\s*70' -Message 'FAIL: auto battle should maintain a scaled compact-map enemy target.'
Assert-Contains -Text $game -Pattern 'function findEnemySpawnPosition\(' -Message 'FAIL: respawn needs bounded retries instead of dropping a whole tick.'
Assert-Contains -Text $game -Pattern 'function rebuildEnemySpawnCandidates\(' -Message 'FAIL: respawn should use cached walkable spawn candidates instead of blind whole-map random picks.'
Assert-Contains -Text $game -Pattern 'function getCurrentCombatFloor\(' -Message 'FAIL: dynamic respawn should use the correct normal/hell combat floor.'
Assert-Contains -Text $game -Pattern 'getDynamicEnemyTargetCount\(' -Message 'FAIL: dynamic spawn target should depend on auto battle state.'
Assert-Contains -Text $game -Pattern 'for \(let spawnIndex = 0; spawnIndex < spawnCount; spawnIndex\+\+\)' -Message 'FAIL: dynamic spawner should refill in batches.'
Assert-Contains -Text $game -Pattern 'if \(!spawnPos\) continue;' -Message 'FAIL: one failed spawn point should not abort the whole respawn batch.'
Assert-Contains -Text $game -Pattern 'e\.deadAt = Date\.now\(\);' -Message 'FAIL: dead enemies should record death time for bounded corpse retention.'
Assert-Contains -Text $game -Pattern 'const corpseAge = e\.deadAt \? nowForCleanup - e\.deadAt : Infinity;' -Message 'FAIL: corpse cleanup should not keep nearby dead enemies forever.'
Assert-Contains -Text $game -Pattern 'const f = getCurrentCombatFloor\(\);' -Message 'FAIL: dynamic respawn should not use player.floor directly in hell mode.'
Assert-NotContains -Text $game -Pattern 'document\.hasFocus' -Message 'FAIL: visible auto battle should keep respawning even when the browser window is not focused.'
Assert-NotContains -Text $game -Pattern 'if \(!spawnPos\) break;' -Message 'FAIL: spawn position failure still aborts the whole respawn batch.'
Assert-Contains -Text $game -Pattern 'Math\.min\(1,\s*0\.65\s*\+\s*f\s*\*\s*0\.05\)' -Message 'FAIL: initial floor population scale should start higher.'
Assert-VersionedAsset -Index $index -Root $root -Asset 'constants.js'
Assert-VersionedAsset -Index $index -Root $root -Asset 'game.js'

Write-Host 'PASS: monster density contract'
