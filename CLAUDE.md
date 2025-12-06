# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个使用 HTML5 Canvas 和原生 JavaScript 开发的暗黑破坏神风格 ARPG 游戏。整个游戏架构采用单文件设计，所有逻辑集中在 `game.js` 中，无任何外部依赖。

## 如何运行

直接在浏览器中打开 `index.html` 即可。由于使用了 IndexedDB 进行本地存档，需要现代浏览器支持（Chrome、Firefox、Edge 等）。

**注意**: 这是纯前端应用，不需要构建、编译或安装依赖。

## 核心架构

### 单文件架构
所有游戏逻辑集中在 `game.js` 中（约5500行），采用函数式编程风格，主要系统包括：

1. **游戏循环系统**: `gameLoop()` → `update(dt)` → `draw()`
2. **状态管理**: 全局 `player` 对象维护玩家所有状态
3. **数据持久化**: `SaveSystem` 使用 IndexedDB 实现自动存档
4. **音频管理**: `AudioSys` 对象管理所有音效和背景音乐
5. **面板管理**: `panelManager` 对象处理多层 UI 面板的层级和位置
6. **自动战斗系统**: `AutoBattle` 对象管理自动战斗AI、A*寻路和自动拾取
7. **套装系统**: `SET_ITEMS` 定义套装数据，`calculateEquippedSets()` 计算穿戴加成

### 关键全局对象

```javascript
// 玩家状态 - 存储所有游戏数据
const player = {
    // 位置和移动
    x, y, radius, speed, direction,
    targetX, targetY, targetItem,

    // 角色属性
    lvl, xp, xpNext, points, skillPoints,
    str, dex, vit, ene,

    // 战斗属性
    hp, maxHp, mp, maxMp, damage, armor,
    lifeSteal, attackSpeed, critChance,

    // 装备和物品
    equipment: { mainhand, offhand, body, ring, helm, gloves, boots, belt, amulet },
    inventory: Array(30),
    stash: Array(36),

    // 任务和成就
    floor, questIndex, questState, questProgress,
    achievements, died
};

// 音频系统
const AudioSys = {
    ctx, // Web Audio Context
    masterGain, sfxGain,
    bgmEl, // Background music <audio> element
    init(), play(id), stop()
};

// 存档系统
const SaveSystem = {
    async save(),
    async load(),
    async reset()
};

// 面板管理系统
const panelManager = {
    panels: { stats, inventory, skills, quest, achievements, shop, stash },
    open(panelId), close(panelId),
    bringToFront(panelId),
    calculatePosition(panelId)
};

// 自动战斗系统
const AutoBattle = {
    enabled: false,              // 是否启用
    settings: {
        useSkill: true,          // 优先使用技能
        keepDistance: 150,       // 保持距离（远程战术）
        hpThreshold: 0.3,        // 喝红药阈值
        mpThreshold: 0.2,        // 喝蓝药阈值
        emergencyHp: 0.15,       // 紧急回城阈值
        pickupUnique: true,      // 自动拾取暗金
        pickupSet: true          // 自动拾取套装
    },
    astarFindPath(),             // A*寻路算法
    findNearestEnemy(),          // 寻找最近敌人
    update()                     // 每帧更新AI逻辑
};
```

### 套装系统数据结构

```javascript
// 套装物品数据库
const SET_ITEMS = {
    'tals_set': {           // 塔拉夏的外袍 - 法师套装
        name: "塔拉夏的外袍",
        pieces: { helm, body, belt, gloves, boots, amulet },
        bonuses: {
            2: { stats: { ene: 10, mp: 50 } },
            4: { stats: { fireDamage: 20, allResist: 15 } },
            6: { stats: { critChance: 15, critDamage: 0.5 } }
        }
    },
    'immortal_king': {...}, // 不朽之王 - 战士套装
    'shadow_dancer': {...}  // 暗影舞者 - 刺客套装
};

// 物品稀有度
// rarity: 0-普通(白), 1-白色, 2-魔法(蓝), 3-稀有(黄), 4-暗金(金), 5-套装(绿)
```

### 游戏世界数据结构

```javascript
// 地图相关
let mapData = [];          // 二维数组，0=地板, 1=墙壁
let visitedMap = [];       // 玩家已探索区域
let dungeonExit = { x, y };
let dungeonEntrance = { x, y };
let townPortal = null;     // 回城传送门

// 实体列表
let enemies = [];          // 敌人数组 { x, y, hp, maxHp, dmg, speed, ai, isBoss, rarity, ... }
let npcs = [];             // NPC数组 { x, y, name, frameIndex }
let groundItems = [];      // 地面掉落物品
let projectiles = [];      // 飞行弹道（箭矢、火球等）
let particles = [];        // 粒子效果
let damageNumbers = [];    // 伤害数字显示
```

## 重要系统和数据流

### 地图生成系统
- **城镇生成**: `generateTown()` - 固定布局，包含3个NPC（基格、阿卡拉、瓦瑞夫）
- **地牢生成**: `generateDungeon()` - 随机地图生成，包含房间、走廊、出入口

### 敌人 AI 系统
敌人有三种 AI 类型（通过 `ai` 字段区分）：
1. **'chase'** (近战): 默认AI，追击玩家并近战攻击
2. **'ranged'** (远程): 骷髅弓箭手，距离150内后退，150-400发射箭矢
3. **'revive'** (复活): 沉沦魔巫师，可以复活死去的怪物

敌人属性在 `game.js:1115-1203` 的 `enemies.forEach()` 循环中更新。

### 战斗系统
- **物理攻击**: 主角点击敌人触发，计算距离和视线检测（防止隔墙攻击）
- **技能系统**:
  - 火球术 (Q): 发射单体远程火球，中等射程（约400像素）
  - 冰霜新星 (W): 范围冻结，短程（约200像素）
  - 多重射击 (E): 扇形箭矢，远程（约500像素）
- **伤害计算**: `takeDamage(e, dmg)` 函数处理所有敌人受伤逻辑

### 物品系统
物品品质等级：
- `rarity: 0` - 普通（白色）
- `rarity: 1` - 魔法（蓝色）
- `rarity: 2` - 稀有（黄色）
- `rarity: 3` - 暗金（金色）
- `rarity: 5` - 套装（绿色）

物品生成流程：`generateItem(type, rarity, level)` → 随机词缀 → 添加到背包/地面
套装物品生成：`createSetItem(setId, pieceSlot, level)` 或 `generateRandomSetItem(level)`

### 任务系统
任务数据存储在 `QUEST_DB` 数组（10个任务），任务类型：
- `kill_count`: 击杀指定数量
- `kill_elite`: 击杀特定精英怪
- `kill_boss`: 击杀特定BOSS

任务进度在 `takeDamage()` 函数的死亡逻辑中检测更新。

### 成就系统
成就定义在 `ACHIEVEMENTS` 数组，类型包括：
- `kill_monster`: 击杀特定怪物
- `reach_floor`: 到达指定层数
- `collect_unique`: 收集暗金装备
- `no_death`: 无死亡挑战
- `kill_boss`: 击杀BOSS数量
- `reach_level`: 达到等级
- `collect_set`: 收集套装装备（套装收藏家）
- `equip_set`: 穿戴完整套装（套装大师）

成就追踪通过 `trackAchievement(type, data)` 函数触发。套装相关成就通过 `checkSetAchievements()` 函数单独检查。

### 自动战斗系统
自动战斗通过按 `F` 键或点击 UI 按钮开关，主要逻辑：
- **A*寻路**: 使用 `astarFindPath()` 进行智能路径规划，避免卡墙
- **目标选择**: `findNearestEnemy()` 优先攻击距离最近的敌人
- **战术行为**: 支持近战/远程两种风格，可配置保持距离
- **自动使用药水**: 根据HP/MP阈值自动喝药
- **紧急回城**: 血量过低时自动使用回城卷轴
- **自动拾取**: 拾取金币、药水、卷轴、暗金和套装装备
- **防卡死机制**: 检测摇摆和卡住状态，自动调整路径

## 常见修改场景

### 调整游戏平衡
- **怪物属性**: 在 `enterFloor()` 函数中的敌人生成逻辑（`game.js:754-856`）
- **BOSS强度**: `game.js:805-833` 中的BOSS属性计算
- **技能数值**: 搜索技能名称（如 `'fireball'`）找到对应的伤害、法力消耗、射程等参数
- **掉落率**: `dropLoot()` 函数控制物品掉落

### 添加新内容
- **新技能**:
  1. 在 `player.skills` 添加技能等级
  2. 在按键监听中添加触发逻辑
  3. 在技能面板 UI 添加显示
- **新怪物类型**: 在 `MONSTER_FRAMES` 添加帧索引，在敌人生成时设置 `ai` 类型
- **新物品类型**: 在 `ITEM_TYPES` 添加类型定义，在 `SLOT_MAP` 配置装备槽位
- **新任务**: 在 `QUEST_DB` 数组添加任务对象
- **新套装**: 在 `SET_ITEMS` 添加套装定义，包含 `pieces`（各部位装备）和 `bonuses`（阶段性加成）
- **新成就**: 在 `ACHIEVEMENTS` 数组添加成就对象，在相应逻辑处调用 `trackAchievement()`

### UI 相关修改
- **面板布局**: 修改 `panelManager.panels` 对象中的位置配置
- **样式**: 所有CSS在 `style.css` 中
- **HUD元素**: 在 `index.html` 和对应的更新函数中修改

## 已知Bug和注意事项

### 最近修复的问题
1. **远程攻击BOSS瞬移bug**: 已在 `game.js:1606-1611` 移除 `takeDamage()` 中的瞬移逻辑
2. **隔墙攻击bug**: 添加了视线检测
3. **复活怪物位置bug**: 添加了距离检测，确保复活怪物距离玩家150-250像素

### 开发注意事项
1. **不要修改怪物受伤时的移动逻辑**: 已移除受伤瞬移，避免重新引入
2. **chase AI 的追击距离**: 当前限制为400像素，如果需要远距离追击需要修改 `game.js:1192` 的距离判断
3. **存档兼容性**: 修改 `player` 对象结构时，需要在 `SaveSystem.load()` 中添加向后兼容代码
4. **音频播放**: Web Audio API 需要用户交互后才能播放，已在 `startGame()` 中处理
5. **套装系统**: 添加新套装时需更新 `SET_ITEMS` 和 `COLORS.setGreen`，装备/卸下时需调用 `checkSetAchievements()`
6. **自动战斗设置**: `AutoBattle.settings` 会保存到 IndexedDB，修改设置结构需保持向后兼容

## 性能优化建议
- 粒子系统和伤害数字有自动清理机制（生命周期结束后删除）
- 敌人死亡不会从数组移除，只是标记 `dead: true`，避免循环中删除元素
- 地图生成使用缓存的房间列表，避免重复计算

## 代码风格
- 使用 ES6+ 语法（箭头函数、const/let、模板字符串）
- 坐标系统使用像素值，地图使用瓦片索引（`Math.floor(x / TILE_SIZE)`）
- 颜色使用 `COLORS` 常量对象统一管理
- 所有文本为中文（包括注释）
- 使用简洁token执行和输出