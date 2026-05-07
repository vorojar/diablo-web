$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw
$autoBattle = Get-Content -LiteralPath (Join-Path $root 'auto-battle.js') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

Assert-Contains -Text $autoBattle -Pattern 'resetRuntimeState\(reason\)' -Message 'FAIL: AutoBattle needs one explicit reset entry for floor/map changes.'
Assert-Contains -Text $autoBattle -Pattern 'this\.losCache\.clear\(\);' -Message 'FAIL: AutoBattle floor reset must clear LOS cache.'
Assert-Contains -Text $autoBattle -Pattern 'this\.currentTarget = null;' -Message 'FAIL: AutoBattle floor reset must clear stale enemy target references.'
Assert-Contains -Text $autoBattle -Pattern 'this\.lastDamagedBy = null;' -Message 'FAIL: AutoBattle floor reset must clear stale damage source references.'
Assert-Contains -Text $game -Pattern 'AutoBattle\.resetRuntimeState\(''enterFloor''\);' -Message 'FAIL: enterFloor should reset AutoBattle runtime state after map/enemy references are invalidated.'

Write-Host 'PASS: auto battle floor reset cache contract'
