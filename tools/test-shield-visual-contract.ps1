$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'assert-versioned-asset.ps1')

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
Assert-Contains -Text $game -Pattern 'function getShieldVisualGrowthTier\(' -Message 'FAIL: shield should expose visual growth tiers.'
Assert-Contains -Text $game -Pattern 'function drawShieldSacredWallRunes\(' -Message 'FAIL: shield growth should include sacred wall rune linework.'
Assert-Contains -Text $game -Pattern 'function drawShieldMirrorFacets\(' -Message 'FAIL: reflect shield growth should include mirror facets.'
Assert-Contains -Text $game -Pattern 'function drawPlayerShieldBack\(' -Message 'FAIL: shield should have a subtle back layer.'
Assert-Contains -Text $game -Pattern 'function drawPlayerShieldFront\(' -Message 'FAIL: shield should have a foreground rim layer.'
Assert-Contains -Text $game -Pattern 'const visualTier = getShieldVisualGrowthTier\(\);' -Message 'FAIL: shield rendering should read the visual growth tier.'
Assert-Contains -Text $game -Pattern 'drawShieldSacredWallRunes\(ctx, profile, visualTier, shieldPercent, pulse\);' -Message 'FAIL: shield front layer should draw sacred wall growth.'
Assert-Contains -Text $game -Pattern 'drawShieldMirrorFacets\(ctx, profile, visualTier, shieldPercent, pulse\);' -Message 'FAIL: shield front layer should draw mirror growth.'
Assert-Contains -Text $game -Pattern 'ctx\.lineTo\(side \* \(34 \+ visualTier \* 5\), -62\);' -Message 'FAIL: sacred wall should read as tall side pillars.'
Assert-Contains -Text $game -Pattern 'ctx\.lineTo\(18, -54\);' -Message 'FAIL: mirror shield should draw hard diagonal facets.'
Assert-Contains -Text $game -Pattern 'drawPlayerShieldBack\(ctx, px, py\);' -Message 'FAIL: shield back layer should render before the hero.'
Assert-Contains -Text $game -Pattern 'drawPlayerShieldFront\(ctx, px, py\);' -Message 'FAIL: shield front layer should render after the hero.'
Assert-Contains -Text $game -Pattern 'ctx\.ellipse\(0, -24, 34, 42' -Message 'FAIL: shield should be a vertical protective dome, not a flattened ground oval.'
Assert-Contains -Text $game -Pattern 'ctx\.arc\(0, -24, 34, Math\.PI \* 0\.10, Math\.PI \* 0\.90' -Message 'FAIL: foreground shield should use visible side/top arcs.'
Assert-Contains -Text $game -Pattern 'backGradient\.addColorStop\(0, ''rgba\(255,255,255,0\)''\);' -Message 'FAIL: shield center should remain transparent.'
Assert-NotContains -Text $game -Pattern 'const scaleX = 0\.6;' -Message 'FAIL: old flattened oval shield scale is still present.'
Assert-NotContains -Text $game -Pattern 'innerGlow\.addColorStop\(1, shieldColor \+ pulseAlpha\.toFixed\(2\) \+ ''\)''\);' -Message 'FAIL: old solid shield fill is still present.'
Assert-VersionedAsset -Index $index -Root $root -Asset 'game.js'

Write-Host 'PASS: shield visual contract'
