param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$checks = [System.Collections.Generic.List[object]]::new()
$originalNodePath = $env:NODE_PATH
$shellCommand = (Get-Process -Id $PID).Path

# 每项在独立进程运行，测试的 exit/全局变量不会中断或污染后续检查。
function Invoke-Check {
    param([string]$Name, [string]$Command, [string[]]$Arguments)
    $ErrorActionPreference = 'Continue'
    $output = @(& $Command @Arguments 2>&1)
    $status = $LASTEXITCODE
    $checks.Add([pscustomobject]@{ Name = $Name; Passed = ($status -eq 0); ExitCode = $status })
    if ($status -eq 0) { Write-Host "PASS: $Name" }
    else {
        Write-Host "FAIL: $Name (exit $status)"
        $output | Select-Object -Last 18 | ForEach-Object { Write-Host $_ }
    }
}

try {
    Push-Location $Root
    # 优先使用项目/环境已经配置的 Node 和模块路径，再查找已安装 Codex runtime。
    $runtimeRoot = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.cache/codex-runtimes'
    $runtimes = @()
    if (Test-Path -LiteralPath $runtimeRoot -PathType Container) {
        $runtimes = @(Get-ChildItem -LiteralPath $runtimeRoot -Directory | Sort-Object LastWriteTime -Descending)
    }
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    $node = if ($nodeCommand) { $nodeCommand.Source } else { $null }
    if (-not $node) {
        foreach ($runtime in $runtimes) {
            foreach ($relative in @('dependencies/node/bin/node.exe', 'dependencies/node/bin/node')) {
                $candidate = Join-Path $runtime.FullName $relative
                if (Test-Path -LiteralPath $candidate -PathType Leaf) { $node = $candidate; break }
            }
            if ($node) { break }
        }
    }
    if (-not $node) { throw 'Node.js 未找到。请使用已安装的 Node 或 Codex bundled runtime 后重新验证。' }

    $resolveCode = "require.resolve('@napi-rs/canvas')"
    $ErrorActionPreference = 'Continue'
    $null = & $node -e $resolveCode 2>&1
    $canvasReady = $LASTEXITCODE -eq 0
    if (-not $canvasReady) {
        foreach ($runtime in $runtimes) {
            $modules = Join-Path $runtime.FullName 'dependencies/node/node_modules'
            if (-not (Test-Path -LiteralPath (Join-Path $modules '@napi-rs/canvas/package.json') -PathType Leaf)) { continue }
            $env:NODE_PATH = (@($originalNodePath, $modules) | Where-Object { $_ }) -join [IO.Path]::PathSeparator
            $null = & $node -e $resolveCode 2>&1
            $canvasReady = $LASTEXITCODE -eq 0
            if ($canvasReady) { break }
        }
    }
    $ErrorActionPreference = 'Stop'
    if (-not $canvasReady) {
        Write-Host 'FAIL: 缺少 @napi-rs/canvas；请将 NODE_PATH 指向已有安装或恢复 Codex bundled runtime。测试仍会运行并汇总，不会跳过。'
        $checks.Add([pscustomobject]@{ Name = 'dependency:@napi-rs/canvas'; Passed = $false; ExitCode = 1 })
    }

    $productionRoots = @($Root, (Join-Path $Root 'pb_hooks')) | Where-Object { Test-Path -LiteralPath $_ -PathType Container }
    foreach ($directory in $productionRoots) {
        foreach ($file in (Get-ChildItem -LiteralPath $directory -Filter '*.js' -File | Sort-Object Name)) {
            $relativePath = $file.FullName.Substring($Root.Length + 1)
            Invoke-Check -Name "syntax:$relativePath" -Command $node -Arguments @('--check', $file.FullName)
        }
    }
    $toolsRoot = Join-Path $Root 'tools'
    foreach ($test in (Get-ChildItem -LiteralPath $toolsRoot -Filter 'test-*.ps1' -File | Sort-Object Name)) {
        Invoke-Check -Name $test.Name -Command $shellCommand -Arguments @('-NoProfile', '-File', $test.FullName)
    }
    foreach ($test in (Get-ChildItem -LiteralPath $toolsRoot -Filter 'test-*.js' -File | Where-Object { $_.Name -notmatch '-live(?:\.|-)' } | Sort-Object Name)) {
        Invoke-Check -Name $test.Name -Command $node -Arguments @($test.FullName)
    }
    Invoke-Check -Name 'sprite-assets' -Command $shellCommand -Arguments @('-NoProfile', '-File', (Join-Path $toolsRoot 'validate-sprite-assets.ps1'), '-Root', $Root)
    $failed = @($checks | Where-Object { -not $_.Passed })
    Write-Host ("验证汇总: {0} 项通过，{1} 项失败；live 浏览器测试需单独执行。" -f ($checks.Count - $failed.Count), $failed.Count)
    if ($failed.Count) { $failed | ForEach-Object { Write-Host "FAILED: $($_.Name)" }; exit 1 }
} finally {
    $env:NODE_PATH = $originalNodePath
    Pop-Location
}
