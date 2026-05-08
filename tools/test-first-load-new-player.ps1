$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$gamePath = Join-Path $root 'game.js'
$game = Get-Content -LiteralPath $gamePath -Raw

if ($game -notmatch 'function createDefaultSkillTree\(') {
    throw 'FAIL: missing shared createDefaultSkillTree initializer.'
}

$newPlayerBranch = [regex]::Match(
    $game,
    "(?<body>const starterClub = createItem\([\s\S]*?)\n\s*document\.getElementById\('chk-auto-gold'\)"
)

if (-not $newPlayerBranch.Success) {
    throw 'FAIL: cannot locate the new-player branch in startGame.'
}

$body = $newPlayerBranch.Groups['body'].Value
if ($body -notmatch 'player\.skillTree\s*=\s*createDefaultSkillTree\(player\.skills\)') {
    throw 'FAIL: new-player branch does not initialize player.skillTree before the first updateSkillsUI call.'
}

$startGameTail = [regex]::Match(
    $game,
    "updateStats\(\); enterFloor\(player\.floor, 'start'\);(?<tail>[\s\S]*?)gameActive = true;"
)

if (-not $startGameTail.Success) {
    throw 'FAIL: cannot locate startGame first-frame startup order.'
}

if ($startGameTail.Groups['tail'].Value -notmatch 'updateSkillsUI\(\)') {
    throw 'FAIL: regression test does not cover the updateSkillsUI startup path.'
}

Write-Host 'OK: new-player first load initializes skillTree before rendering skill UI.'
