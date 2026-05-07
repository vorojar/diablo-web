$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw
$index = Get-Content -LiteralPath (Join-Path $root 'index.html') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

Assert-Contains -Text $game -Pattern 'const MAX_CANVAS_RENDER_PIXELS = 1600 \* 900;' -Message 'FAIL: large viewport render buffer should be capped.'
Assert-Contains -Text $game -Pattern 'function updateRenderViewport\(\)' -Message 'FAIL: resize should compute quality-aware render viewport.'
Assert-Contains -Text $game -Pattern 'function getCanvasRenderPixelLimit\(\)' -Message 'FAIL: render cap should be controlled by graphics quality.'
Assert-Contains -Text $game -Pattern 'canvas\.style\.width = cssWidth \+ ''px'';' -Message 'FAIL: canvas CSS size should still fill the browser window.'
Assert-Contains -Text $game -Pattern 'canvas\.width = renderWidth;' -Message 'FAIL: canvas backing width should use capped render width.'
Assert-Contains -Text $game -Pattern 'function clientToCanvasX\(clientX\)' -Message 'FAIL: pointer X should stay in CSS/world pixels.'
Assert-Contains -Text $game -Pattern 'function canvasToCssX\(x\)' -Message 'FAIL: DOM overlays should share CSS/world pixel coordinates.'
Assert-Contains -Text $game -Pattern 'window\.addEventListener\(''mousemove'', e => \{ mouse\.x = clientToCanvasX\(e\.clientX\); mouse\.y = clientToCanvasY\(e\.clientY\); \}\);' -Message 'FAIL: mouse movement should respect the viewport coordinate contract.'
Assert-Contains -Text $game -Pattern 'x: clientToCanvasX\(touch\.clientX\),' -Message 'FAIL: touch X should respect the viewport coordinate contract.'
Assert-Contains -Text $game -Pattern 'i\.el\.style\.left = canvasToCssX\(sx\) \+ ''px'';' -Message 'FAIL: item labels should be positioned in CSS pixels.'
Assert-Contains -Text $game -Pattern 'div\.style\.left = canvasToCssX\(screenX\) \+ ''px'';' -Message 'FAIL: DOM damage numbers should be positioned in CSS pixels.'
Assert-Contains -Text $game -Pattern 'd\.el\.style\.transform = `translate\(\$\{canvasToCssX\(drawX - d\.sx\)\}px, \$\{canvasToCssY\(drawY - d\.sy\)\}px\)`;' -Message 'FAIL: DOM damage number movement should use CSS pixels.'
Assert-Contains -Text $index -Pattern 'game\.js\?v=202605080025' -Message 'FAIL: index.html did not bump the game.js cache version.'

Write-Host 'PASS: large viewport render cap contract'
