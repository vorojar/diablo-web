$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$game = Get-Content -LiteralPath (Join-Path $root 'game.js') -Raw
$style = Get-Content -LiteralPath (Join-Path $root 'style.css') -Raw
$index = Get-Content -LiteralPath (Join-Path $root 'index.html') -Raw
$online = Get-Content -LiteralPath (Join-Path $root 'online.js') -Raw

function Assert-Contains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -notmatch $Pattern) { throw $Message }
}

function Assert-NotContains {
    param([string]$Text, [string]$Pattern, [string]$Message)
    if ($Text -match $Pattern) { throw $Message }
}

Assert-Contains -Text $game -Pattern "if \(!lastReadVersion\)\s*\{\s*localStorage\.setItem\('changelog_read_version', currentVersion\);\s*return;\s*\}" -Message 'FAIL: first-time users should not see the changelog popup.'
Assert-Contains -Text $game -Pattern "if \(lastReadVersion !== currentVersion\)\s*\{\s*showChangelogPanel\(\);\s*\}" -Message 'FAIL: returning users should still see unread changelog versions.'

Assert-Contains -Text $index -Pattern 'id="mobile-menu-toggle"' -Message 'FAIL: missing mobile menu collapse toggle.'
Assert-Contains -Text $index -Pattern 'id="mobile-chat-toggle"' -Message 'FAIL: missing mobile chat collapse toggle.'
Assert-Contains -Text $index -Pattern 'id="mobile-menu-dot"' -Message 'FAIL: mobile menu toggle should expose a red dot for aggregated menu notifications.'
Assert-Contains -Text $index -Pattern 'id="mobile-chat-dot"' -Message 'FAIL: mobile chat toggle should expose a red dot for unread messages.'
Assert-Contains -Text $style -Pattern '#mobile-menu-toggle' -Message 'FAIL: missing mobile menu toggle styles.'
Assert-Contains -Text $style -Pattern '#mobile-chat-toggle' -Message 'FAIL: missing mobile chat toggle styles.'
Assert-Contains -Text $style -Pattern '(?s)\.orb-container\s*\{.*?flex:\s*0\s+0\s+130px;.*?aspect-ratio:\s*1\s*/\s*1;' -Message 'FAIL: HUD orbs should not shrink horizontally under flex layout.'
Assert-Contains -Text $style -Pattern '(?s)@media \(max-width: 768px\),\s*\r?\n\s*\(pointer: coarse\).*?\.orb-container\s*\{.*?flex-basis:\s*80px;' -Message 'FAIL: mobile HUD orbs should keep a fixed circular flex basis.'
Assert-Contains -Text $style -Pattern '(?s)@media \(max-width: 768px\),\s*\r?\n\s*\(pointer: coarse\).*?\.orb-container\s*\{.*?margin-bottom:\s*14px;' -Message 'FAIL: mobile HUD orbs should be lifted above the bottom edge.'
Assert-Contains -Text $style -Pattern '\.mobile-fab-dot' -Message 'FAIL: mobile FAB red dot should use shared styles.'
Assert-Contains -Text $style -Pattern 'body\.mobile-menu-open\s+\.menu-btns' -Message 'FAIL: mobile menu should only expand while the shell is open.'
Assert-Contains -Text $style -Pattern '\.chat-box:not\(\.collapsed\)' -Message 'FAIL: mobile chat panel should expand from a compact launcher.'
Assert-Contains -Text $game -Pattern 'function toggleMobileMenu\(' -Message 'FAIL: missing mobile menu toggle behavior.'
Assert-Contains -Text $game -Pattern 'function initMobileHudShell\(' -Message 'FAIL: missing mobile HUD shell initialization.'
Assert-Contains -Text $game -Pattern 'function updateMobileMenuDot\(' -Message 'FAIL: missing mobile menu red dot sync behavior.'
Assert-Contains -Text $game -Pattern 'function updateMobileChatUnreadDot\(' -Message 'FAIL: missing mobile chat unread red dot sync behavior.'
Assert-Contains -Text $game -Pattern 'updateMobileMenuDot\(\);' -Message 'FAIL: menu indicators should refresh the mobile menu red dot.'
Assert-Contains -Text $online -Pattern 'updateMobileChatUnreadDot\(this\.unreadCount\);' -Message 'FAIL: chat unread updates should directly refresh the mobile chat red dot.'

Assert-Contains -Text $game -Pattern 'function spawnMonsterAttackTelegraph\(' -Message 'FAIL: missing shared monster attack telegraph.'
Assert-Contains -Text $game -Pattern 'spawnMonsterAttackTelegraph\(enemy, \{ \.\.\.options, targetX: aim\.targetX, targetY: aim\.targetY, angle: aim\.angle \}\);' -Message 'FAIL: startMonsterAttack should emit the shared telegraph with locked aim.'
Assert-Contains -Text $game -Pattern "telegraph:\s*'projectile'" -Message 'FAIL: ranged monster attacks should mark projectile telegraphs.'
Assert-Contains -Text $game -Pattern "telegraph:\s*'melee'" -Message 'FAIL: melee monster attacks should mark melee telegraphs.'

Assert-Contains -Text $index -Pattern 'style\.css\?v=202606130930' -Message 'FAIL: index.html did not bump the style.css cache version.'
Assert-Contains -Text $index -Pattern 'game\.js\?v=202606130910' -Message 'FAIL: index.html did not bump the game.js cache version.'
Assert-Contains -Text $index -Pattern 'online\.js\?v=202606130910' -Message 'FAIL: index.html did not bump the online.js cache version.'

Write-Host 'PASS: mobile UI and warning contract'
