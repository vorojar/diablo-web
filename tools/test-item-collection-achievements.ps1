$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$itemSystemPath = Join-Path $root 'item-system.js'
$indexPath = Join-Path $root 'index.html'
$itemSystem = Get-Content -LiteralPath $itemSystemPath -Raw
$index = Get-Content -LiteralPath $indexPath -Raw

function Get-FunctionBody {
    param(
        [string]$Text,
        [string]$FunctionName
    )

    $start = $Text.IndexOf("function $FunctionName(")
    if ($start -lt 0) {
        throw "FAIL: missing function $FunctionName."
    }

    $braceStart = $Text.IndexOf('{', $start)
    if ($braceStart -lt 0) {
        throw "FAIL: missing body for function $FunctionName."
    }

    $depth = 0
    for ($i = $braceStart; $i -lt $Text.Length; $i++) {
        if ($Text[$i] -eq '{') { $depth++ }
        elseif ($Text[$i] -eq '}') {
            $depth--
            if ($depth -eq 0) {
                return $Text.Substring($start, $i - $start + 1)
            }
        }
    }

    throw "FAIL: unterminated function $FunctionName."
}

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

$addItemToInventory = Get-FunctionBody -Text $itemSystem -FunctionName 'addItemToInventory'
$dropLoot = Get-FunctionBody -Text $itemSystem -FunctionName 'dropLoot'

Assert-NotContains -Text $dropLoot -Pattern "trackAchievement\('collect_unique'\)" -Message 'FAIL: unique collection achievement still triggers on loot drop.'
Assert-NotContains -Text $dropLoot -Pattern "trackAchievement\('collect_set_item'\)" -Message 'FAIL: set collection achievement still triggers on loot drop.'
Assert-Contains -Text $addItemToInventory -Pattern "trackAchievement\('collect_unique'\)" -Message 'FAIL: unique collection achievement is not triggered after inventory pickup succeeds.'
Assert-Contains -Text $addItemToInventory -Pattern "trackAchievement\('collect_set_item'\)" -Message 'FAIL: set collection achievement is not triggered after inventory pickup succeeds.'
Assert-Contains -Text $index -Pattern 'item-system\.js\?v=202605071930' -Message 'FAIL: index.html did not bump the item-system.js cache version.'

Write-Host 'PASS: item collection achievement contract'
