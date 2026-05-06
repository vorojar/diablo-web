$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$gamePath = Join-Path $root 'game.js'
$game = Get-Content -LiteralPath $gamePath -Raw

if ($game -notmatch 'function finalizeEnemyDeath\(') {
    throw 'FAIL: missing shared enemy death finalizer.'
}

if ($game -match 'if \(e\.hp <= 0\) e\.dead = true;') {
    throw 'FAIL: enemy DOT still bypasses death finalization.'
}

if ($game -match 'if \(source\.hp <= 0\) source\.dead = true;') {
    throw 'FAIL: reflected/thorns damage still bypasses death finalization.'
}

$stackingPatterns = @(
    'player\.hpRegenPct\s*=\s*\(player\.hpRegenPct\s*\|\|\s*0\)\s*\+',
    'player\.mpRegenPct\s*=\s*\(player\.mpRegenPct\s*\|\|\s*0\)\s*\+',
    'player\.thornsPct\s*=\s*\(player\.thornsPct\s*\|\|\s*0\)\s*\+',
    'player\.goldPct\s*=\s*\(player\.goldPct\s*\|\|\s*0\)\s*\+',
    'player\.dropRatePct\s*=\s*\(player\.dropRatePct\s*\|\|\s*0\)\s*\+',
    'player\.onKillHealPct\s*=\s*\(player\.onKillHealPct\s*\|\|\s*0\)\s*\+'
)

foreach ($pattern in $stackingPatterns) {
    if ($game -match $pattern) {
        throw "FAIL: updateStats still stacks divine blessing derived stats: $pattern"
    }
}

Write-Host 'PASS: core combat regression contract'
