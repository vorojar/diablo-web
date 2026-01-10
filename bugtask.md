# Bug修复任务清单

> 由 QA主管 + 技术总监 审查生成
> 创建时间: 2026-01-10

---

## P0 - 严重问题 (必须修复)

- [x] **连锁闪电绕过死亡流程** - `game.js:7295`
  - 问题: 直接设置 `other.dead = true`，跳过了掉落、经验、成就等逻辑
  - 修复: 改为调用 `takeDamage()` 函数 ✅

- [x] **护盾未统一拦截伤害** - 多处 `player.hp -= dmg`
  - 问题: phase/vampire/specter等AI直接扣血，护盾形同虚设
  - 修复: 创建统一的 `playerTakeDamage()` 函数 ✅

- [x] **负血量未检查** - 玩家受伤逻辑
  - 问题: 高伤害可能导致HP为负数
  - 修复: 在 `playerTakeDamage()` 中添加 `Math.max(0, ...)` 边界检查 ✅

---

## P1 - 中等问题 (应该修复)

- [x] **护甲公式过弱** - `armor * 0.1`
  - 问题: 100护甲只减10点伤害，几乎无意义
  - 修复: 改用减伤百分比公式 `armor / (armor + 100)` ✅

- [x] **魔法数字泛滥** - 敌人AI距离阈值
  - 问题: `1600`, `160000`, `40000` 等硬编码难维护
  - 修复: 抽取到 `GAME_CONFIG` 常量 ✅

- [x] **存档缺少版本号** - save-system.js
  - 问题: 无法判断存档版本，迁移困难
  - 修复: 添加 `SAVE_DATA_VERSION` 和 `saveVersion` 字段 ✅

---

## P2 - 低优先级 (建议修复)

- [x] **A*寻路性能** - 每次sort是O(nlogn)
  - 修复: 实现 `MinHeap` 二叉堆，取最小值从 O(n log n) 优化到 O(log n) ✅

- [x] **敌人遍历多次** - update和findTarget重复遍历
  - 修复: 新增 `EnemyCache` 每帧更新一次，缓存活/死敌人计数和列表 ✅

---

## 修复记录

| 序号 | 问题 | 修复时间 | 修复文件 |
|------|------|----------|----------|
| 1 | 创建playerTakeDamage统一伤害函数 | 2026-01-10 | game.js:9204 |
| 2 | 修复phase AI使用统一伤害 | 2026-01-10 | game.js:4757 |
| 3 | 修复vampire AI使用统一伤害 | 2026-01-10 | game.js:4795,4836 |
| 4 | 修复chase AI使用统一伤害 | 2026-01-10 | game.js:4881 |
| 5 | 修复弹幕伤害使用统一伤害 | 2026-01-10 | game.js:4382 |
| 6 | 修复毒素DOT边界检查 | 2026-01-10 | game.js:4018 |
| 7 | 修复连锁闪电走正常死亡流程 | 2026-01-10 | game.js:7295 |
| 8 | 护甲公式改为百分比减伤 | 2026-01-10 | game.js:9232 |
| 9 | 抽取AI距离常量 | 2026-01-10 | constants.js:482-490 |
| 10 | 添加存档版本号 | 2026-01-10 | save-system.js:10,217 |
| 11 | A*寻路二叉堆优化 | 2026-01-10 | auto-battle.js:42-127 |
| 12 | 敌人缓存系统 | 2026-01-10 | game.js:400-442 |
| 13 | 修复浮点数伤害显示 | 2026-01-10 | game.js:7200,8522 |
| 14 | 修复护盾值浮点数 | 2026-01-10 | game.js:3914,9966 |

---

## 新增功能

### `playerTakeDamage(rawDamage, source, options)` 函数

统一的玩家受伤入口，位于 `game.js:9206`，包含：

1. **无敌状态检查** - 无敌帧和护盾无敌
2. **天赋效果处理** - 狂战士增伤
3. **元素抗性减伤** - 非物理伤害
4. **护甲减伤** - 新公式 `armor/(armor+100)`
5. **护盾吸收** - 优先扣护盾，支持反射
6. **边界检查** - HP不会为负
7. **受击反馈** - 伤害数字、音效、连击中断
8. **荆棘反弹** - 天赋效果
9. **自动战斗通知**
10. **死亡检查**

### 新增常量 (constants.js)

```javascript
MONSTER_MELEE_RANGE: 40,           // 近战攻击距离
MONSTER_MELEE_RANGE_SQ: 1600,      // 平方值（性能优化）
MONSTER_CHASE_RANGE: 400,          // 追击范围
MONSTER_CHASE_RANGE_SQ: 160000,
MONSTER_DISENGAGE_RANGE: 35,       // 脱战距离
MONSTER_DISENGAGE_RANGE_SQ: 1225,
```

### 存档版本号 (save-system.js)

```javascript
const SAVE_DATA_VERSION = 2;  // v2: 统一伤害系统、护甲公式改进
```

### A* 寻路二叉堆优化 (auto-battle.js)

`MinHeap` 类实现最小二叉堆，优化 A* 寻路算法：
- `push(node)` - O(log n) 插入
- `pop()` - O(log n) 取出最小值
- `updateNode(key, newNode)` - O(log n) 更新已有节点

性能提升：原来每次迭代 `sort()` 是 O(n log n)，现在取最小值只需 O(log n)。

### 敌人缓存系统 (game.js)

```javascript
const EnemyCache = {
    aliveCount: 0,      // 活着的敌人数量
    deadCount: 0,       // 死亡的敌人数量
    aliveList: [],      // 活敌人引用列表
    update(frameId),    // 每帧更新一次
    getNearbyAlive(maxDistSq)  // 获取附近敌人
};
```

优化点：
- 每帧只遍历 `enemies` 数组一次
- `spawnEnemyTimer`、`EnemyPool.getStats()`、`AutoBattle.findTarget()` 等均使用缓存
