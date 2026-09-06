$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'assert-versioned-asset.ps1')
$root = Split-Path -Parent $PSScriptRoot
foreach ($version in @('release-a', 'release-b', '123')) {
    Assert-VersionedAsset -Index ('<script src="game.js?v=' + $version + '"></script>') -Root $root -Asset 'game.js'
}
$invalidReferences = @(
    '<script src="game.js"></script>',
    '<script src="game.js?v="></script>',
    '<script src="game.js?v= "></script>',
    '<script src="game.js?v=a"></script><script src="game.js?v=b"></script>',
    '<script src="other.js?v=a"></script>'
)
foreach ($reference in $invalidReferences) {
    $rejected = $false
    try { Assert-VersionedAsset -Index $reference -Root $root -Asset 'game.js' } catch { $rejected = $true }
    if (-not $rejected) { throw "FAIL: accepted invalid reference $reference" }
}
$rejected = $false
try { Assert-VersionedAsset -Index '<script src="missing-file.js?v=a"></script>' -Root $root -Asset 'missing-file.js' } catch { $rejected = $true }
if (-not $rejected) { throw 'FAIL: accepted missing local asset' }
Write-Host 'PASS: versioned asset validation accepts new releases and rejects invalid references'
