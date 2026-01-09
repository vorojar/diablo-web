---
name: code-review
description: 审查代码质量、性能、安全性和可维护性。当审查代码改动、检查代码质量、重构前评估、或讨论代码问题时使用。
allowed-tools: Read, Grep, Glob
---

# 代码审查 Skill

## 概述

为菠萝战纪游戏项目进行专业的代码审查，重点关注 Canvas 游戏开发的特殊需求。

## 审查维度

### 1. 性能检查

Canvas 游戏每帧都在执行，性能问题会直接导致卡顿。

**必查项目**:

| 问题 | 危害 | 正确做法 |
|------|------|----------|
| 循环内创建对象 | GC 频繁触发 | 使用对象池 (如 `EnemyPool`) |
| `array.filter()` 返回新数组 | 内存抖动 | 原地过滤或复用数组 |
| 频繁 `Math.sqrt()` | CPU 密集 | 用距离平方比较 |
| 每帧查询 DOM | 阻塞渲染 | 缓存 DOM 引用 |
| `JSON.parse/stringify` | 阻塞主线程 | 避免在游戏循环中使用 |

**代码示例**:

```javascript
// 差: 每帧创建新数组
enemies = enemies.filter(e => e.hp > 0);

// 好: 原地过滤
let writeIndex = 0;
for (let i = 0; i < enemies.length; i++) {
    if (enemies[i].hp > 0) {
        enemies[writeIndex++] = enemies[i];
    }
}
enemies.length = writeIndex;
```

```javascript
// 差: 每帧计算距离
const dist = Math.sqrt(dx*dx + dy*dy);
if (dist < 100) { ... }

// 好: 比较距离平方
const distSq = dx*dx + dy*dy;
if (distSq < 10000) { ... }  // 100² = 10000
```

### 2. 游戏逻辑检查

**关键系统完整性**:

- [ ] 伤害计算是否经过 `takeDamage()` 函数 (`game.js:5400`)
- [ ] 物品操作是否使用 `ItemSystem` 的方法
- [ ] 存档数据修改后是否触发自动保存
- [ ] 敌人死亡是否正确回收到 `EnemyPool`

**状态一致性**:

- [ ] 修改 `player` 对象后，相关 UI 是否更新
- [ ] 装备变更后是否调用 `calculateEquippedSets()`
- [ ] 套装变更后是否调用 `checkSetAchievements()`

### 3. 代码风格检查

**项目规范** (来自 CLAUDE.md):

```javascript
// ✓ 使用 ES6+ 语法
const fn = (x) => x * 2;
let count = 0;
const msg = `当前层数: ${player.floor}`;

// ✓ 使用统一常量
if (item.rarity === RARITY.UNIQUE) { ... }
if (item.type === ITEM_TYPE.WEAPON) { ... }

// ✓ 使用工具函数
if (isProtectedItem(item)) { ... }
if (isInTown()) { ... }
const color = getRarityColor(item.rarity);

// ✗ 避免魔术数字
if (item.rarity === 4) { ... }  // 差
if (item.rarity === RARITY.UNIQUE) { ... }  // 好
```

**命名规范**:

| 类型 | 规范 | 示例 |
|------|------|------|
| 常量 | UPPER_SNAKE_CASE | `MAX_ENEMIES`, `TILE_SIZE` |
| 函数 | camelCase | `takeDamage()`, `dropLoot()` |
| 布尔变量 | is/has/can 前缀 | `isInTown`, `hasKey`, `canAttack` |
| 配置对象 | PascalCase | `GAME_CONFIG`, `SKILL_CONFIG` |

### 4. 安全性检查

**数据验证**:

```javascript
// 检查用户输入/外部数据
function loadSaveData(data) {
    // ✓ 验证数据结构
    if (!data || typeof data !== 'object') return null;

    // ✓ 验证关键字段
    if (typeof data.floor !== 'number' || data.floor < 1) {
        data.floor = 1;
    }

    // ✓ 防止原型污染
    if (data.__proto__ || data.constructor) {
        delete data.__proto__;
        delete data.constructor;
    }
}
```

**IndexedDB 操作**:

- [ ] 事务是否正确处理错误
- [ ] 是否有数据迁移逻辑 (版本升级时)
- [ ] 敏感数据是否需要加密

### 5. 存档兼容性检查

修改 `player` 对象结构时必须检查：

```javascript
// 在 SaveSystem.load() 中添加向后兼容
async load() {
    const data = await this.getData();

    // 新字段的默认值
    if (data.newField === undefined) {
        data.newField = defaultValue;
    }

    // 旧数据迁移
    if (data.oldField !== undefined) {
        data.newField = migrateOldField(data.oldField);
        delete data.oldField;
    }
}
```

### 6. 版本号检查

**修改文件后必须更新 `index.html` 中的版本号**:

```html
<!-- 检查这些文件的版本号是否更新 -->
<script src="game.js?v=5.4.1"></script>
<script src="constants.js?v=5.4.1"></script>
<script src="item-system.js?v=5.4.1"></script>
<script src="enemy-system.js?v=5.4.1"></script>
<script src="save-system.js?v=5.4.1"></script>
<script src="set-items.js?v=5.4.1"></script>
<script src="ui-panels.js?v=5.4.1"></script>
<script src="audio.js?v=5.4.1"></script>
```

## 审查报告格式

```markdown
## 代码审查报告

### 文件: xxx.js

#### 严重问题
- **[性能]** 第123行: 循环内创建数组
  - 问题: `enemies.filter()` 每帧创建新数组
  - 建议: 使用原地过滤

#### 一般问题
- **[风格]** 第456行: 使用魔术数字
  - 问题: `if (rarity === 4)`
  - 建议: 使用 `RARITY.UNIQUE`

#### 建议改进
- **[可读性]** 第789行: 函数过长 (180行)
  - 建议: 拆分为多个小函数

### 总结
- 严重问题: 1
- 一般问题: 3
- 建议改进: 2
- 版本号: 需要更新 ✗
```

## 快速检查命令

在审查时可以使用这些搜索：

```bash
# 查找魔术数字
grep -n "rarity === [0-5]" game.js

# 查找可能的性能问题
grep -n "\.filter(" game.js
grep -n "\.map(" game.js
grep -n "JSON\." game.js

# 查找未使用常量的地方
grep -n "TILE_SIZE\|RARITY\|ITEM_TYPE" game.js
```

## 常见问题速查

| 问题类型 | 关键词 | 检查位置 |
|----------|--------|----------|
| 隔墙攻击 | `hasLineOfSight` | 战斗逻辑 |
| 怪物瞬移 | 受伤位置更新 | `takeDamage()` |
| 存档丢失 | IndexedDB 事务 | `SaveSystem` |
| 套装不生效 | `calculateEquippedSets` | 装备逻辑 |
| UI 不更新 | `updateXXX()` 调用 | 状态变更处 |
