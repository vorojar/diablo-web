param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [string]$Output = '',
    [int]$FrameCount = 8,
    [int]$FrameSize = 128,
    [int]$SourceRows = 1,
    [int]$TargetRowOffset = 0,
    [ValidateSet('LightChecker', 'BlackAdditive')]
    [string]$BackgroundMode = 'LightChecker',
    [switch]$UseSourceGrid,
    [switch]$PreserveExisting
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

if (-not $Output) {
    $Output = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'vfx_sheet.png'
}

function Test-BackgroundPixel {
    param([System.Drawing.Color]$Color)

    $max = [Math]::Max($Color.R, [Math]::Max($Color.G, $Color.B))
    $min = [Math]::Min($Color.R, [Math]::Min($Color.G, $Color.B))
    $brightness = ($Color.R + $Color.G + $Color.B) / 3

    if ($BackgroundMode -eq 'BlackAdditive') {
        return $brightness -lt 55 -and ($max - $min) -lt 18
    }

    return $brightness -gt 215 -and ($max - $min) -lt 24
}

function Copy-TransparentImage {
    param([System.Drawing.Bitmap]$Source)

    $image = [System.Drawing.Bitmap]::new($Source.Width, $Source.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    for ($y = 0; $y -lt $Source.Height; $y++) {
        for ($x = 0; $x -lt $Source.Width; $x++) {
            $color = $Source.GetPixel($x, $y)
            if (Test-BackgroundPixel $color) {
                $image.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))
            } else {
                $image.SetPixel($x, $y, $color)
            }
        }
    }
    return $image
}

function Get-ContentBounds {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [int]$MinSearchX = 0,
        [int]$MaxSearchX = ($Bitmap.Width - 1),
        [int]$MinSearchY = 0,
        [int]$MaxSearchY = ($Bitmap.Height - 1)
    )

    $minX = $Bitmap.Width
    $minY = $Bitmap.Height
    $maxX = -1
    $maxY = -1

    for ($y = $MinSearchY; $y -le $MaxSearchY; $y++) {
        for ($x = $MinSearchX; $x -le $MaxSearchX; $x++) {
            if ($Bitmap.GetPixel($x, $y).A -gt 12) {
                if ($x -lt $minX) { $minX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }

    if ($maxX -lt 0) {
        return [pscustomobject]@{ X = 0; Y = 0; Width = 1; Height = 1 }
    }

    return [pscustomobject]@{
        X = $minX
        Y = $minY
        Width = $maxX - $minX + 1
        Height = $maxY - $minY + 1
    }
}

function Get-ContentColumnRuns {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [int]$MinSearchY = 0,
        [int]$MaxSearchY = ($Bitmap.Height - 1),
        [int]$MinimumGap = 18
    )

    $contentColumns = New-Object System.Collections.Generic.List[int]
    for ($x = 0; $x -lt $Bitmap.Width; $x++) {
        $count = 0
        for ($y = $MinSearchY; $y -le $MaxSearchY; $y += 2) {
            if ($Bitmap.GetPixel($x, $y).A -gt 12) {
                $count++
            }
        }
        if ($count -gt 2) {
            $contentColumns.Add($x)
        }
    }

    $runs = New-Object System.Collections.Generic.List[object]
    if ($contentColumns.Count -eq 0) {
        return $runs
    }

    $start = $contentColumns[0]
    $previous = $contentColumns[0]
    for ($i = 1; $i -lt $contentColumns.Count; $i++) {
        $x = $contentColumns[$i]
        if ($x - $previous -gt $MinimumGap) {
            $runs.Add([pscustomobject]@{ Start = $start; End = $previous })
            $start = $x
        }
        $previous = $x
    }
    $runs.Add([pscustomobject]@{ Start = $start; End = $previous })

    return $runs
}

if (-not (Test-Path -LiteralPath $SourcePath)) {
    throw "Input image not found: $SourcePath"
}

$source = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $SourcePath).Path)
$transparentSource = Copy-TransparentImage $source

$targetRows = $TargetRowOffset + $SourceRows
if ($PreserveExisting -and (Test-Path -LiteralPath $Output)) {
    $existingTarget = [System.Drawing.Bitmap]::FromFile((Resolve-Path -LiteralPath $Output).Path)
    $targetRows = [Math]::Max($targetRows, [int][Math]::Ceiling($existingTarget.Height / $FrameSize))
} else {
    $existingTarget = $null
}

$target = [System.Drawing.Bitmap]::new($FrameSize * $FrameCount, $FrameSize * $targetRows, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($target)
$graphics.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

if ($existingTarget) {
    $graphics.DrawImage($existingTarget, 0, 0, $existingTarget.Width, $existingTarget.Height)
    $existingTarget.Dispose()
    $existingTarget = $null
}

$sourceRowHeight = [int][Math]::Floor($transparentSource.Height / $SourceRows)

for ($sourceRow = 0; $sourceRow -lt $SourceRows; $sourceRow++) {
    $sourceMinY = $sourceRow * $sourceRowHeight
    $sourceMaxY = if ($sourceRow -eq $SourceRows - 1) { $transparentSource.Height - 1 } else { (($sourceRow + 1) * $sourceRowHeight) - 1 }
    $runs = if ($UseSourceGrid) {
        New-Object System.Collections.Generic.List[object]
    } else {
        Get-ContentColumnRuns -Bitmap $transparentSource -MinSearchY $sourceMinY -MaxSearchY $sourceMaxY
    }

    if ($UseSourceGrid -or $runs.Count -ne $FrameCount) {
        $runs = New-Object System.Collections.Generic.List[object]
        $sourceFrameWidth = [int][Math]::Floor($transparentSource.Width / $FrameCount)
        for ($i = 0; $i -lt $FrameCount; $i++) {
            $start = $i * $sourceFrameWidth
            $end = if ($i -eq $FrameCount - 1) { $transparentSource.Width - 1 } else { (($i + 1) * $sourceFrameWidth) - 1 }
            $runs.Add([pscustomobject]@{ Start = $start; End = $end })
        }
    }

    $frames = New-Object System.Collections.Generic.List[object]
    $maxBoundsWidth = 1
    $maxBoundsHeight = 1

    for ($i = 0; $i -lt $FrameCount; $i++) {
        $run = $runs[$i]
        $bounds = Get-ContentBounds -Bitmap $transparentSource -MinSearchX $run.Start -MaxSearchX $run.End -MinSearchY $sourceMinY -MaxSearchY $sourceMaxY
        $frames.Add([pscustomobject]@{ Bitmap = $transparentSource; Bounds = $bounds })
        if ($bounds.Width -gt $maxBoundsWidth) { $maxBoundsWidth = $bounds.Width }
        if ($bounds.Height -gt $maxBoundsHeight) { $maxBoundsHeight = $bounds.Height }
    }

    $globalScale = [Math]::Min(118 / $maxBoundsWidth, 112 / $maxBoundsHeight)
    $targetRow = $TargetRowOffset + $sourceRow
    $targetBaselineY = $targetRow * $FrameSize + 118

    for ($i = 0; $i -lt $frames.Count; $i++) {
        $entry = $frames[$i]
        $bounds = $entry.Bounds
        $drawWidth = [Math]::Max(1, [int][Math]::Round($bounds.Width * $globalScale))
        $drawHeight = [Math]::Max(1, [int][Math]::Round($bounds.Height * $globalScale))
        $drawX = $i * $FrameSize + [int][Math]::Round(($FrameSize - $drawWidth) / 2)
        $drawY = $targetBaselineY - $drawHeight

        $srcRect = [System.Drawing.Rectangle]::new($bounds.X, $bounds.Y, $bounds.Width, $bounds.Height)
        $dstRect = [System.Drawing.Rectangle]::new($drawX, $drawY, $drawWidth, $drawHeight)
        $imageAttributes = $null
        if ($i -ge 4) {
            $imageAttributes = [System.Drawing.Imaging.ImageAttributes]::new()
            $matrix = [System.Drawing.Imaging.ColorMatrix]::new()
            $matrix.Matrix00 = 0.78
            $matrix.Matrix11 = 0.66
            $matrix.Matrix22 = 0.54
            $matrix.Matrix33 = 0.92
            $matrix.Matrix40 = 0.02
            $matrix.Matrix41 = -0.02
            $matrix.Matrix42 = -0.03
            $imageAttributes.SetColorMatrix($matrix)
        }

        if ($imageAttributes) {
            $graphics.DrawImage($entry.Bitmap, $dstRect, $srcRect.X, $srcRect.Y, $srcRect.Width, $srcRect.Height, [System.Drawing.GraphicsUnit]::Pixel, $imageAttributes)
            $imageAttributes.Dispose()
        } else {
            $graphics.DrawImage($entry.Bitmap, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
        }
    }
}

$target.Save($Output, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$target.Dispose()
if ($existingTarget) {
    $existingTarget.Dispose()
}
$transparentSource.Dispose()
$source.Dispose()

Write-Host "Promoted AI VFX sheet to $Output"
