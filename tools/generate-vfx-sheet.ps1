param(
    [string]$Output = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'vfx_sheet.png')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$frameSize = 128
$frameCount = 8
$width = $frameSize * $frameCount
$height = $frameSize

$bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

function New-Color {
    param([int]$A, [int]$R, [int]$G, [int]$B)
    return [System.Drawing.Color]::FromArgb($A, $R, $G, $B)
}

function Fill-GlowEllipse {
    param(
        [System.Drawing.Graphics]$Graphics,
        [float]$X,
        [float]$Y,
        [float]$W,
        [float]$H,
        [System.Drawing.Color]$CenterColor,
        [System.Drawing.Color]$EdgeColor
    )

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddEllipse($X, $Y, $W, $H)
    $brush = [System.Drawing.Drawing2D.PathGradientBrush]::new($path)
    $brush.CenterColor = $CenterColor
    $brush.SurroundColors = [System.Drawing.Color[]]@($EdgeColor)
    $Graphics.FillPath($brush, $path)
    $brush.Dispose()
    $path.Dispose()
}

for ($frame = 0; $frame -lt $frameCount; $frame++) {
    $t = $frame / ($frameCount - 1)
    $originX = $frame * $frameSize
    $cx = $originX + 64
    $cy = 72

    $coreAlpha = [int](220 * [Math]::Max(0, 1 - $t * 1.25))
    $glowAlpha = [int](190 * [Math]::Max(0, 1 - $t * 0.9))
    $ringAlpha = [int](230 * [Math]::Max(0, 1 - $t))
    $coreRadius = 12 + 18 * [Math]::Sin([Math]::Min(1, $t * 1.25) * [Math]::PI)
    $glowRadius = 34 + 50 * $t
    $ringRadius = 12 + 44 * $t

    Fill-GlowEllipse $graphics ($cx - $glowRadius) ($cy - $glowRadius * 0.82) ($glowRadius * 2) ($glowRadius * 1.64) `
        (New-Color $glowAlpha 255 102 24) (New-Color 0 255 70 0)

    if ($ringAlpha -gt 0) {
        $ringPen = [System.Drawing.Pen]::new((New-Color $ringAlpha 255 184 64), [Math]::Max(2, 5 * (1 - $t)))
        $graphics.DrawEllipse($ringPen, $cx - $ringRadius, $cy - $ringRadius * 0.55, $ringRadius * 2, $ringRadius * 1.1)
        $ringPen.Dispose()
    }

    if ($coreAlpha -gt 0) {
        Fill-GlowEllipse $graphics ($cx - $coreRadius) ($cy - $coreRadius) ($coreRadius * 2) ($coreRadius * 2) `
            (New-Color $coreAlpha 255 248 198) (New-Color 0 255 112 20)
    }

    $sparkCount = 14
    for ($spark = 0; $spark -lt $sparkCount; $spark++) {
        $angle = (($spark / $sparkCount) * [Math]::PI * 2) + 0.38
        $distance = 12 + 52 * $t + (($spark % 3) * 3)
        $length = 13 + 18 * (1 - [Math]::Abs(0.55 - $t))
        $alpha = [int](210 * [Math]::Max(0, 1 - $t * 0.95))
        if ($alpha -le 0) { continue }

        $sx = $cx + [Math]::Cos($angle) * $distance
        $sy = $cy + [Math]::Sin($angle) * $distance * 0.82
        $ex = $sx + [Math]::Cos($angle) * $length
        $ey = $sy + [Math]::Sin($angle) * $length * 0.82
        $penColor = if ($spark % 4 -eq 0) { New-Color $alpha 255 245 190 } else { New-Color $alpha 255 118 24 }
        $sparkPen = [System.Drawing.Pen]::new($penColor, [Math]::Max(1.2, 3.2 * (1 - $t)))
        $sparkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
        $sparkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
        $graphics.DrawLine($sparkPen, [float]$sx, [float]$sy, [float]$ex, [float]$ey)
        $sparkPen.Dispose()
    }

    $smokeAlpha = [int](90 * [Math]::Max(0, $t - 0.25))
    if ($smokeAlpha -gt 0) {
        Fill-GlowEllipse $graphics ($cx - 36 - 8 * $t) ($cy - 28 - 10 * $t) (72 + 16 * $t) (42 + 18 * $t) `
            (New-Color $smokeAlpha 80 62 48) (New-Color 0 40 30 25)
    }
}

$bitmap.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

Write-Host "Generated $Output"
