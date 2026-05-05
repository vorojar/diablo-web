---
name: add-game-content
description: 为菠萝战纪游戏添加新内容：怪物、装备、套装、技能、任务、成就。当需要添加游戏内容、扩展游戏系统或新增功能时使用。
allowed-tools: Read, Grep, Glob, Edit, Write
---

# 添加游戏内容 Skill

## 概述

帮助快速、正确地向菠萝战纪添加新的游戏内容，确保遵循现有代码规范。

## 内容类型速查

### 1. 添加新怪物

**位置**: `enemy-system.js` 或 `game.js:3840` (enterFloor)

**步骤**:
1. 在 `MONSTER_FRAMES` 添加帧索引
2. 在敌人生成逻辑中添加生成条件
3. 设置 AI 类型: `'chase'`(近战) / `'ranged'`(远程) / `'revive'`(复活)

**模板**:
```javascript
{
    x, y,
    hp: baseHp * multiplier,
    maxHp: baseHp * multiplier,
    dmg: baseDmg * multiplier,
    speed: 80,
    ai: 'chase',          // AI类型
    rarity: 0,            // 0普通 1精英
    isBoss: false,
    frameIndex: 0         // 精灵图帧
}
```

### 2. 添加新装备

**位置**: `item-system.js` 的 `generateItem()` 函数

**稀有度常量** (constants.js):
```javascript
RARITY.COMMON   = 0  // 普通(白)
RARITY.NORMAL   = 1  // 白色
RARITY.MAGIC    = 2  // 魔法(蓝)
RARITY.RARE     = 3  // 稀有(黄)
RARITY.UNIQUE   = 4  // 暗金(金)
RARITY.SET      = 5  // 套装(绿)
```

**装备类型** (constants.js):
```javascript
ITEM_TYPE.WEAPON, ARMOR, HELM, BELT, GLOVES, BOOTS, RING, AMULET
```

### 3. 添加新套装

**位置**: `set-items.js` 的 `SET_ITEMS` 对象

**模板**:
```javascript
'new_set_id': {
    name: "套装名称",
    pieces: {
        helm: { name: "XX之冠", base: "头盔", stats: { maxHp: 50 } },
        body: { name: "XX战甲", base: "板甲", stats: { def: 100 } },
        // ... 其他部位
    },
    bonuses: {
        2: { stats: { allRes: 30 } },           // 2件套效果
        4: { stats: { dmgPct: 100 } },          // 4件套效果
        6: { stats: { critChance: 25 } }        // 6件套效果
    }
}
```

**注意**: 添加后需在 `calculateEquippedSets()` 中确认能正确识别。

### 4. 添加新技能

**位置**:
- 配置: `game.js` 的 `SKILL_CONFIG`
- 玩家数据: `player.skills`
- 按键绑定: 按键监听逻辑

**SKILL_CONFIG 模板**:
```javascript
newskill: {
    baseMana: 15,
    manaPerLevel: 2,
    range: 300,
    cooldown: 1.0
}
```

### 5. 添加新任务

**位置**: `game.js` 的 `QUEST_DB` 数组

**任务类型**:
- `kill_count`: 击杀数量
- `kill_elite`: 击杀精英
- `kill_boss`: 击杀BOSS

**模板**:
```javascript
{
    id: 'quest_id',
    name: '任务名称',
    description: '任务描述',
    type: 'kill_count',
    target: 50,
    reward: { xp: 500, gold: 200 }
}
```

### 6. 添加新成就

**位置**: `game.js` 的 `ACHIEVEMENTS` 数组

**成就类型**:
- `kill_monster`: 击杀怪物
- `reach_floor`: 到达层数
- `collect_unique`: 收集暗金
- `collect_set`: 收集套装
- `equip_set`: 穿戴完整套装
- `no_death`: 无死亡挑战

**模板**:
```javascript
{
    id: 'achievement_id',
    name: '成就名称',
    description: '成就描述',
    type: 'kill_boss',
    target: 10,
    reward: { title: '称号名' }
}
```

## 添加内容后的检查清单

- [ ] 在 `index.html` 中更新相关 JS 文件的版本号（避免缓存）
- [ ] 确保新增常量使用 `RARITY` / `ITEM_TYPE` 等统一常量
- [ ] 检查存档兼容性（是否需要在 SaveSystem.load 添加迁移逻辑）
- [ ] 如涉及 UI，检查 `panelManager` 中的面板配置

## 版本号更新提醒

修改以下文件后，必须更新 `index.html` 中的版本号：

```html
<script src="game.js?v=X.X.X"></script>
<script src="item-system.js?v=X.X.X"></script>
<script src="set-items.js?v=X.X.X"></script>
<!-- 等等 -->
```

## 示例对话

**用户**: 帮我添加一个新的法师套装

**Codex 应该**:
1. 先确认套装的主题和属性方向
2. 在 `set-items.js` 添加套装定义
3. 设计合理的阶段加成 (2/4/6件)
4. 更新 `index.html` 版本号
5. 提醒测试存档兼容性
