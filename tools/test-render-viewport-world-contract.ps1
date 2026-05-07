$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

Assert-Contains -Text $game -Pattern 'renderScaleX:\s*1' -Message 'FAIL: render viewport needs a backing-buffer scale separate from world coordinates.'
Assert-Contains -Text $game -Pattern 'function getViewportWidth\(\)' -Message 'FAIL: gameplay viewport width should come from CSS viewport, not capped canvas.width.'
Assert-Contains -Text $game -Pattern 'function applyRenderViewportTransform\(\)' -Message 'FAIL: draw should downscale rendering with a canvas transform instead of shrinking world coordinates.'
Assert-Contains -Text $game -Pattern 'ctx\.setTransform\(renderViewport\.renderScaleX, 0, 0, renderViewport\.renderScaleY, 0, 0\);' -Message 'FAIL: draw must apply the render scale before world/HUD drawing.'
Assert-Contains -Text $game -Pattern 'return clientX - rect\.left;' -Message 'FAIL: pointer X must stay in CSS/world pixels when backing buffer is capped.'
Assert-Contains -Text $game -Pattern 'return x;' -Message 'FAIL: DOM overlay X is already in CSS/world pixels and should not be stretched again.'
Assert-Contains -Text $game -Pattern 'camera\.x = Math\.round\(player\.x\) - getViewportWidth\(\) / 2;' -Message 'FAIL: camera must use CSS viewport width to preserve large-window field of view.'
Assert-Contains -Text $game -Pattern 'const viewportWidth = getViewportWidth\(\);' -Message 'FAIL: draw/culling should use viewport helper values.'
Assert-NotContains -Text $game -Pattern 'clientX - rect\.left\) \* canvas\.width / rect\.width' -Message 'FAIL: pointer conversion still shrinks coordinates to backing-buffer pixels.'
Assert-NotContains -Text $game -Pattern 'camera\.x \+ canvas\.width' -Message 'FAIL: culling/spawning still treats capped canvas.width as viewport width.'

Write-Host 'PASS: render viewport world contract'
