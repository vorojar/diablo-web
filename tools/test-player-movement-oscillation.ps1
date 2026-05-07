$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw
$autoBattle = Get-Content -LiteralPath (Join-Path $root 'auto-battle.js') -Raw
$index = Get-Content -LiteralPath (Join-Path $root 'index.html') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

Assert-Contains -Text $game -Pattern 'const actualMove = Math\.min\(move, dist\);' -Message 'FAIL: player movement should clamp each frame step to remaining distance.'
Assert-Contains -Text $game -Pattern 'const nx = player\.x \+ \(dx / dist\) \* actualMove' -Message 'FAIL: player x movement should use clamped step.'
Assert-Contains -Text $game -Pattern 'const ny = player\.y \+ \(dy / dist\) \* actualMove' -Message 'FAIL: player y movement should use clamped step.'
Assert-NotContains -Text $game -Pattern 'const nx = player\.x \+ \(dx / dist\) \* move, ny = player\.y \+ \(dy / dist\) \* move;' -Message 'FAIL: old unclamped movement formula can overshoot target and oscillate.'

Assert-Contains -Text $game -Pattern 'let pendingNpcInteraction = null;' -Message 'FAIL: missing pending NPC interaction state.'
Assert-Contains -Text $game -Pattern 'function getNpcApproachTarget\(' -Message 'FAIL: missing NPC approach target helper.'
Assert-Contains -Text $game -Pattern 'function tryResolvePendingNpcInteraction\(' -Message 'FAIL: missing pending NPC interaction resolver.'
Assert-Contains -Text $game -Pattern 'pendingNpcInteraction = npc;' -Message 'FAIL: far NPC clicks should set a pending interaction instead of walking to the click point.'
Assert-Contains -Text $game -Pattern 'tryResolvePendingNpcInteraction\(\);' -Message 'FAIL: update loop should resolve pending NPC interaction once in range.'

Assert-Contains -Text $autoBattle -Pattern 'player\.targetX = pathPos\.x;' -Message 'FAIL: regression contract should cover AutoBattle path targets.'
Assert-Contains -Text $autoBattle -Pattern 'player\.targetX = selected\.x;' -Message 'FAIL: regression contract should cover AutoBattle pickup targets.'

Assert-Contains -Text $index -Pattern 'game\.js\?v=202605072359' -Message 'FAIL: index.html did not bump the game.js cache version.'

Write-Host 'PASS: player movement oscillation contract'
