$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

Assert-Contains -Text $game -Pattern 'function getCanvasRenderPixelLimit\(\)' -Message 'FAIL: render pixel cap should be controlled by a single quality helper.'
Assert-Contains -Text $game -Pattern "player\.graphicsQuality === 'low' \? MAX_CANVAS_RENDER_PIXELS : Infinity" -Message 'FAIL: high quality should not downsample the canvas backing buffer.'
Assert-Contains -Text $game -Pattern 'const pixelLimit = getCanvasRenderPixelLimit\(\);' -Message 'FAIL: updateRenderViewport should use the quality-aware pixel limit.'
Assert-Contains -Text $game -Pattern 'resize\(\);' -Message 'FAIL: toggling graphics quality should resize the backing buffer immediately.'

Write-Host 'PASS: render quality cap contract'
