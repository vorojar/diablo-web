param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

function Read-BigEndianUInt32 {
    param(
        [byte[]]$Bytes,
        [int]$Offset
    )

    return ([uint32]$Bytes[$Offset] -shl 24) -bor
        ([uint32]$Bytes[$Offset + 1] -shl 16) -bor
        ([uint32]$Bytes[$Offset + 2] -shl 8) -bor
        [uint32]$Bytes[$Offset + 3]
}

function Get-PngSize {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Missing PNG file: $Path"
    }

    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    if ($bytes.Length -lt 24) {
        throw "PNG file is too small: $Path"
    }

    for ($i = 0; $i -lt $signature.Length; $i++) {
        if ($bytes[$i] -ne $signature[$i]) {
            throw "Invalid PNG file: $Path"
        }
    }

    $chunkType = [System.Text.Encoding]::ASCII.GetString($bytes, 12, 4)
    if ($chunkType -ne 'IHDR') {
        throw "PNG IHDR chunk is missing: $Path"
    }

    return [pscustomobject]@{
        Width = Read-BigEndianUInt32 -Bytes $bytes -Offset 16
        Height = Read-BigEndianUInt32 -Bytes $bytes -Offset 20
    }
}

function Get-NumberAfterKey {
    param(
        [string]$Text,
        [string]$Key
    )

    $match = [regex]::Match($Text, "$Key\s*:\s*(\d+)")
    if (-not $match.Success) {
        throw "Cannot find $Key in config block"
    }

    return [int]$match.Groups[1].Value
}

function Get-SpriteContract {
    param(
        [string]$GameJs,
        [string]$Label,
        [string]$SrcPattern,
        [string]$ConfigName
    )

    $srcMatch = [regex]::Match($GameJs, $SrcPattern)
    if (-not $srcMatch.Success) {
        throw "Cannot find sprite sheet path for $Label"
    }

    $configMatch = [regex]::Match(
        $GameJs,
        "const\s+$ConfigName\s*=\s*\{(?<body>[\s\S]*?)\n\};"
    )
    if (-not $configMatch.Success) {
        throw "Cannot find sprite config $ConfigName for $Label"
    }

    $body = $configMatch.Groups['body'].Value
    $src = $srcMatch.Groups[1].Value.Split('?')[0]

    return [pscustomobject]@{
        Label = $Label
        File = $src
        Cols = Get-NumberAfterKey -Text $body -Key 'cols'
        Rows = Get-NumberAfterKey -Text $body -Key 'rows'
        DeclaredFrameWidth = Get-NumberAfterKey -Text $body -Key 'frameWidth'
        DeclaredFrameHeight = Get-NumberAfterKey -Text $body -Key 'frameHeight'
    }
}

$gameJsPath = Join-Path $Root 'game.js'
if (-not (Test-Path -LiteralPath $gameJsPath)) {
    throw "Cannot find game.js: $gameJsPath"
}

$gameJs = Get-Content -LiteralPath $gameJsPath -Raw
$contracts = @(
    Get-SpriteContract `
        -GameJs $gameJs `
        -Label 'hero' `
        -SrcPattern "heroSpriteSheet\.src\s*=\s*'([^']+)'" `
        -ConfigName 'HERO_SPRITE_CONFIG'
    Get-SpriteContract `
        -GameJs $gameJs `
        -Label 'monster' `
        -SrcPattern "monsterSpriteSheet\.src\s*=\s*'([^']+)'" `
        -ConfigName 'MONSTER_SPRITE_CONFIG'
)

$vfxManifestPath = Join-Path $Root 'vfx-manifest.js'
if (-not (Test-Path -LiteralPath $vfxManifestPath)) {
    throw "Cannot find vfx-manifest.js: $vfxManifestPath"
}

$vfxManifest = Get-Content -LiteralPath $vfxManifestPath -Raw
$vfxSheetMatch = [regex]::Match($vfxManifest, "sheet\s*:\s*'([^']+)'")
if (-not $vfxSheetMatch.Success) {
    throw "Cannot find VFX sheet path"
}

$vfxEffectMatch = [regex]::Match($vfxManifest, "fireballImpact\s*:\s*\{(?<body>[\s\S]*?)\n\s*\}")
if (-not $vfxEffectMatch.Success) {
    throw "Cannot find VFX effect config fireballImpact"
}

$vfxBody = $vfxEffectMatch.Groups['body'].Value
$vfxContract = [pscustomobject]@{
    Label = 'vfx:fireballImpact'
    File = $vfxSheetMatch.Groups[1].Value.Split('?')[0]
    Row = Get-NumberAfterKey -Text $vfxBody -Key 'row'
    FrameWidth = Get-NumberAfterKey -Text $vfxBody -Key 'frameWidth'
    FrameHeight = Get-NumberAfterKey -Text $vfxBody -Key 'frameHeight'
    FrameCount = Get-NumberAfterKey -Text $vfxBody -Key 'frameCount'
}

$failed = $false
foreach ($contract in $contracts) {
    $pngPath = Join-Path $Root $contract.File
    $size = Get-PngSize -Path $pngPath
    $cellWidth = if ($contract.Cols -gt 0) { [int]($size.Width / $contract.Cols) } else { 0 }
    $cellHeight = if ($contract.Rows -gt 0) { [int]($size.Height / $contract.Rows) } else { 0 }
    $errors = @()

    if ($size.Width % $contract.Cols -ne 0) {
        $errors += "width $($size.Width) is not divisible by cols $($contract.Cols)"
    }
    if ($size.Height % $contract.Rows -ne 0) {
        $errors += "height $($size.Height) is not divisible by rows $($contract.Rows)"
    }
    if ($cellWidth -ne $contract.DeclaredFrameWidth) {
        $errors += "actual frame width $cellWidth differs from declared $($contract.DeclaredFrameWidth)"
    }
    if ($cellHeight -ne $contract.DeclaredFrameHeight) {
        $errors += "actual frame height $cellHeight differs from declared $($contract.DeclaredFrameHeight)"
    }

    if ($errors.Count -gt 0) {
        $failed = $true
        Write-Host "FAIL: $($contract.Label) $($contract.File) [$($size.Width)x$($size.Height)]"
        foreach ($err in $errors) {
            Write-Host "  - $err"
        }
    } else {
        Write-Host "PASS: $($contract.Label) $($contract.File) [$($size.Width)x$($size.Height)], grid $($contract.Cols)x$($contract.Rows), cell $cellWidth x $cellHeight"
    }
}

$vfxPngPath = Join-Path $Root $vfxContract.File
$vfxSize = Get-PngSize -Path $vfxPngPath
$vfxRequiredWidth = $vfxContract.FrameWidth * $vfxContract.FrameCount
$vfxRequiredHeight = $vfxContract.FrameHeight * ($vfxContract.Row + 1)
$vfxErrors = @()
if ($vfxSize.Width -ne $vfxRequiredWidth) {
    $vfxErrors += "width $($vfxSize.Width) differs from required $vfxRequiredWidth"
}
if ($vfxSize.Height -lt $vfxRequiredHeight) {
    $vfxErrors += "height $($vfxSize.Height) is smaller than required $vfxRequiredHeight"
}
if ($vfxErrors.Count -gt 0) {
    $failed = $true
    Write-Host "FAIL: $($vfxContract.Label) $($vfxContract.File) [$($vfxSize.Width)x$($vfxSize.Height)]"
    foreach ($err in $vfxErrors) {
        Write-Host "  - $err"
    }
} else {
    Write-Host "PASS: $($vfxContract.Label) $($vfxContract.File) [$($vfxSize.Width)x$($vfxSize.Height)], frames $($vfxContract.FrameCount), cell $($vfxContract.FrameWidth) x $($vfxContract.FrameHeight)"
}

if ($failed) {
    exit 1
}

Write-Host "Sprite asset contract check passed."
