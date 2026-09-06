$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'assert-versioned-asset.ps1')

$root = Split-Path -Parent $PSScriptRoot
$constants = Get-Content -LiteralPath (Join-Path $root 'constants.js') -Raw
$index = Get-Content -LiteralPath (Join-Path $root 'index.html') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

Assert-Contains -Text $constants -Pattern 'const MAP_WIDTH = 60;' -Message 'FAIL: dungeon width should be compact enough for shorter runs.'
Assert-Contains -Text $constants -Pattern 'const MAP_HEIGHT = 60;' -Message 'FAIL: dungeon height should be compact enough for shorter runs.'
Assert-Contains -Text $constants -Pattern 'MAX_ENEMIES:\s*80' -Message 'FAIL: smaller maps need a lower monster cap.'
Assert-Contains -Text $constants -Pattern 'INITIAL_ENEMIES:\s*36' -Message 'FAIL: smaller maps need a scaled initial population.'
Assert-Contains -Text $constants -Pattern 'AUTO_BATTLE_ENEMY_TARGET:\s*70' -Message 'FAIL: auto battle target should be scaled for smaller maps.'
Assert-VersionedAsset -Index $index -Root $root -Asset 'constants.js'

Write-Host 'PASS: map size contract'
