# Physical Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让物理普攻在角色成长后获得围攻场景下的横扫刀锋能力，提升战士系清怪和自动战斗稳定性。

**Architecture:** 不新增主动按钮，横扫作为 `performAttack()` 的被动进化。等级/力量决定横扫阶位，当前目标附近和玩家身边的敌人数量决定是否触发，额外目标复用 `takeDamage()` 结算并复用/扩展现有 `slashEffects` 视觉层。

**Tech Stack:** 原生 JavaScript、HTML5 Canvas、现有 `game.js`/`constants.js` 单页架构、PowerShell/Node 回归脚本。

---

### Task 1: 横扫规则契约

**Files:**
- Create: `tools/test-physical-sweep-behavior.js`
- Modify: `constants.js`
- Modify: `game.js`

- [x] **Step 1: Write the failing behavior test**

测试必须验证三件事：低等级不触发，成长后围攻触发，只命中合法额外目标且不重复主目标。

Run: `node tools\test-physical-sweep-behavior.js`

Expected before implementation: FAIL because `getPhysicalSweepTier` and `triggerPhysicalSweep` are not defined.

- [x] **Step 2: Add sweep constants**

在 `GAME_CONFIG` 中增加横扫解锁等级、力量门槛、半径、角度、目标上限和伤害倍率，保持唯一事实源。

- [x] **Step 3: Implement pure helpers**

新增 `getPhysicalSweepTier()`、`getPhysicalSweepConfig()`、`getAngleDelta()`、`getPhysicalSweepTargets()`，这些函数只读取 `player`、`enemies`、`GAME_CONFIG` 和视线函数，便于 Node 脚本独立测试。

### Task 2: 普攻横扫伤害

**Files:**
- Modify: `game.js`

- [x] **Step 1: Route through `performAttack()`**

在主目标普攻结算后调用 `triggerPhysicalSweep(t, dmg, isCrit, attackAngle)`。

- [x] **Step 2: Apply secondary damage**

额外目标使用 `takeDamage(target, sweepDamageObj, false)`，保留物理、元素和暴击字段，但物理伤害按横扫倍率缩放。

- [x] **Step 3: Preserve balance**

只有玩家达到横扫阶位且附近达到围攻人数门槛时触发；自动战斗无需额外改动，因为它已经统一调用 `performAttack()`。

### Task 3: 刀锋视觉和玩家可读反馈

**Files:**
- Modify: `game.js`
- Modify: `changelog.js`
- Modify: `index.html`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Expand slash rendering**

让 `slashEffects` 支持 `arcWidth`、`lineWidth`、`glowColor` 和 `isSweep`，普通斩击继续走默认值。

- [x] **Step 2: Add sweep visual emitter**

新增 `createPhysicalSweepEffect()`，按阶位生成多道半月刀弧，并显示 `横扫 xN` 反馈。

- [x] **Step 3: Bump cache versions and changelog**

更新 `game.js`、`constants.js`、`changelog.js` 的 `index.html` 版本号，新增游戏内 `v7.13` 更新公告和 `CHANGELOG.md` 记录。

### Task 4: 验证和交付

**Files:**
- Modify: version contract tests under `tools/`

- [x] **Step 1: Run focused tests**

Run:
- `node tools\test-physical-sweep-behavior.js`
- `node --check game.js`
- `node --check constants.js`

- [x] **Step 2: Run existing regressions**

Run:
- all `tools/test-*.ps1`
- all non-live Node tests
- live monster respawn test if local browser endpoint is available

- [x] **Step 3: Commit and push**

Commit message: `feat: 新增物理横扫刀锋`

Report changed behavior, validation commands, commit hash, and whether restart is needed.
