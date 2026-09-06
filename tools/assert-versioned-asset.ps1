# 资源版本是部署标识，不能绑定某次历史提交的日期。
function Assert-VersionedAsset {
    param([string]$Index, [string]$Root, [string]$Asset)
    $escaped = [regex]::Escape($Asset)
    $references = [regex]::Matches($Index, '(?:src|href)=["'']' + $escaped + '\?v=([^"''\s&]+)["'']')
    if ($references.Count -ne 1) { throw "FAIL: $Asset must have exactly one reference with a non-empty cache version." }
    if (-not (Test-Path -LiteralPath (Join-Path $Root $Asset) -PathType Leaf)) { throw "FAIL: referenced asset $Asset does not exist." }
}
