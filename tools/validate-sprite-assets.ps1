param([string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path)
$ErrorActionPreference = 'Stop'
# 保留统一验证入口，实际校验发布WebP的尺寸、透明通道和VFX帧边界。
& node (Join-Path $PSScriptRoot 'validate-runtime-sprites.js') $Root
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
