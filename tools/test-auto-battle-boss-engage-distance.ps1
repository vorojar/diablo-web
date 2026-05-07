$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$autoBattlePath = Join-Path $root 'auto-battle.js'
$indexPath = Join-Path $root 'index.html'

$autoBattle = Get-Content -LiteralPath $autoBattlePath -Raw
$index = Get-Content -LiteralPath $indexPath -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

Assert-Contains -Text $autoBattle -Pattern 'getMeleeEngageDistance\(target\)' -Message 'FAIL: AutoBattle should derive melee engagement distance from target and player radius.'
Assert-Contains -Text $autoBattle -Pattern 'if \(!target \|\| !Number\.isFinite\(target\.radius\)\) throw new Error\(' -Message 'FAIL: invalid melee targets should fail early instead of using hidden fallback values.'
Assert-Contains -Text $autoBattle -Pattern 'if \(!Number\.isFinite\(player\.radius\)\) throw new Error\(' -Message 'FAIL: invalid player radius should fail early instead of using hidden fallback values.'
Assert-Contains -Text $autoBattle -Pattern 'const engageDistance = this\.getMeleeEngageDistance\(this\.currentTarget\);' -Message 'FAIL: AutoBattle chase decision should use dynamic engagement distance.'
Assert-Contains -Text $autoBattle -Pattern 'const meleeRange = this\.getMeleeEngageDistance\(target\);' -Message 'FAIL: AutoBattle attack decision should match the same dynamic engagement distance.'
Assert-NotContains -Text $autoBattle -Pattern 'tdx \* tdx \+ tdy \* tdy > 3600' -Message 'FAIL: hard-coded 60px chase threshold makes Boss melee range jitter.'
Assert-NotContains -Text $autoBattle -Pattern 'dist < 70;' -Message 'FAIL: hard-coded 70px melee threshold should not ignore Boss radius.'
Assert-NotContains -Text $autoBattle -Pattern 'target\?\.radius \|\| 12' -Message 'FAIL: target radius fallback hides corrupted enemy data.'
Assert-NotContains -Text $autoBattle -Pattern 'player\.radius \|\| 15' -Message 'FAIL: player radius fallback hides corrupted player data.'
Assert-Contains -Text $autoBattle -Pattern 'dist <= meleeRange' -Message 'FAIL: exact melee boundary should still attack instead of stalling.'
Assert-Contains -Text $index -Pattern 'auto-battle\.js\?v=202605072205' -Message 'FAIL: index.html did not bump the auto-battle.js cache version.'

Write-Host 'PASS: auto battle boss engage distance contract'
