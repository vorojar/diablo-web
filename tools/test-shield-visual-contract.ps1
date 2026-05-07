$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw
$index = Get-Content -LiteralPath (Join-Path $root 'index.html') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

Assert-Contains -Text $game -Pattern 'function getPlayerShieldVisualProfile\(' -Message 'FAIL: shield visuals should use a typed color profile.'
Assert-Contains -Text $game -Pattern 'function drawPlayerShieldBack\(' -Message 'FAIL: shield should have a subtle back layer.'
Assert-Contains -Text $game -Pattern 'function drawPlayerShieldFront\(' -Message 'FAIL: shield should have a foreground rim layer.'
Assert-Contains -Text $game -Pattern 'drawPlayerShieldBack\(ctx, px, py\);' -Message 'FAIL: shield back layer should render before the hero.'
Assert-Contains -Text $game -Pattern 'drawPlayerShieldFront\(ctx, px, py\);' -Message 'FAIL: shield front layer should render after the hero.'
Assert-Contains -Text $game -Pattern 'ctx\.ellipse\(0, -24, 34, 42' -Message 'FAIL: shield should be a vertical protective dome, not a flattened ground oval.'
Assert-Contains -Text $game -Pattern 'ctx\.arc\(0, -24, 34, Math\.PI \* 0\.10, Math\.PI \* 0\.90' -Message 'FAIL: foreground shield should use visible side/top arcs.'
Assert-Contains -Text $game -Pattern 'backGradient\.addColorStop\(0, ''rgba\(255,255,255,0\)''\);' -Message 'FAIL: shield center should remain transparent.'
Assert-NotContains -Text $game -Pattern 'const scaleX = 0\.6;' -Message 'FAIL: old flattened oval shield scale is still present.'
Assert-NotContains -Text $game -Pattern 'innerGlow\.addColorStop\(1, shieldColor \+ pulseAlpha\.toFixed\(2\) \+ ''\)''\);' -Message 'FAIL: old solid shield fill is still present.'
Assert-Contains -Text $index -Pattern 'game\.js\?v=202605072330' -Message 'FAIL: index.html did not bump the game.js cache version.'

Write-Host 'PASS: shield visual contract'
