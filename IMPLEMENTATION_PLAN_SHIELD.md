# 📋 第四技能系统实施方案文档

**技能名称**：神圣护盾 (Divine Shield)
**键位**：R键
**文档版本**：v1.0（风险控制优先版）
**创建日期**：2026-01-02

## 一、风险评估与规避策略

### ⚠️ 已识别风险及对应措施

| 风险描述 | 风险等级 | 规避方案 | 验证方式 |
|---------|---------|---------|---------|
| **护盾过强导致站撸** | 🔴 高 | 1. 护盾值上限设为30%而非35%<br>2. 冷却时间>持续时间<br>3. 关键BOSS攻击穿盾 | 测试无盾vs有盾通关时间差<30% |
| **法转血机制滥用** | 🔴 高 | **直接删除该机制**<br>改为：护盾存在期间+20%伤害减免 | 监控玩家不点该分支时的生存数据 |
| **无限护盾循环** | 🟡 中 | 1. 冷却12秒 > 持续时间5秒<br>2. 护盾不享受冷却缩减<br>3. 护盾期间无法获得新护盾 | 测试CD堆叠和护盾刷新逻辑 |
| **防御属性贬值** | 🟡 中 | 护盾值基于**最大生命值**而非固定数值<br>护甲/抗性依然有效 | 对比不同护甲值下护盾收益曲线 |
| **新手依赖护盾** | 🟡 中 | 1. 前期不返还技能点<br>2. 引导玩家学习走位<br>3. 高等级减少冷却 | 新手区留存数据追踪 |
| **UI复杂度增加** | 🟢 低 | 复用现有面板，护盾值显示在HP条旁 | 可用性测试 |

---

## 二、最终技能设计（调整后）

### **阶段1：神圣护盾（基础）**
```javascript
// 位置：constants.js:218
manaCost: 15
cooldown: 12秒
shieldValue: maxHp * (20% + level*2%)    // 上限30%
duration: 5秒 + level*0.5秒             // 上限7.5秒
// 视觉效果：金色半透明圆环
```

**改动说明**：从3%/级降为2%/级，上限30%避免数值膨胀

---

### **阶段2A：反射护盾**（输出向）
```javascript
// 基础效果
damageReflect: 10% + level*3%   // 上限25%
// 反弹伤害计算：reflectDamage = incomingDamage * reflectRatio * 0.5
// 系数0.5确保不会比直接攻击更强
```

**分支选择：**

##### **A1：惩戒光环（伤害型）**
```javascript
auraDamage: shieldValue * 2%/秒
slowEffect: 攻击速度-15%
// 移除原版的持续伤害，改为周期性脉冲
pulseInterval: 2秒  // 每2秒造成一次伤害
```
**规避**：脉冲伤害而非持续，避免过强AOE

##### **A2：绝对防御（生存型）**
```javascript
criticalImmunity: true
lifeStealOnReflectKill: incomingDamage * 5%  // 降至5%防止吸血过强
// 移除反伤+20%加成，保持25%上限
```

---

### **阶段2B：守护护盾**（生存向）
```javascript
healOnExpire: maxHp * (10% + level*2%)   // 上限20%
ccReduction: 30% + level*5%             // 上限55%
```

**分支选择：**

##### **B1：守护天使**
```javascript
invincibility: 1.0秒  // 从1.5秒下调
moveSpeed: +40%
// 添加限制：无敌期间无法攻击
canAttack: false
```
**规避**：防止1.5秒无敌滥用，无法攻击平衡强度

##### **B2：生命链接**
```javascript
// 原"法转血"方案已删除
// 替换为：持续时间结束时生成次级护盾
secondaryShield: shieldValue * 30%
secondaryDuration: 3秒
```
**规避**：删除法转血，改为分段护盾，鼓励节奏把控

---

## 三、详细实施步骤

### **阶段0：准备工作**（预估：30分钟）

**代码文件新建与备份**
- [ ] 创建 `shield-skill.js` 管理护盾状态（避免game.js膨胀）
- [ ] 备份 `constants.js` 和 `game.js`

**数据结构设计**
```javascript
// 添加到 player 对象: game.js:549
shield: {
    active: false,
    value: 0,           // 当前护盾值
    maxValue: 0,        // 最大护盾值
    timer: 0,           // 剩余时间
    cooldown: 0,        // 冷却时间
    type: null          // 'reflect' 或 'guard'
}
```

---

### **阶段1：基础护盾实现**（预估：2小时）

#### 步骤1.1：添加技能配置（constants.js）

**文件路径**：`constants.js:218-349`
```javascript
// 在SKILL_TREE对象后追加
const SKILL_TREE = {
    // ...现有技能...
    holy_shield: {
        name: '神圣护盾',
        key: 'R',
        desc: '召唤神圣护盾吸收伤害',
        stage1: {
            manaCost: 15,
            cooldown: 12,
            shieldRatio: 0.20,  // 基础20%
            shieldPerLevel: 0.02, // 每级+2%
            duration: 5,
            durationPerLevel: 0.5
        },
        stage2: {
            reflect: {
                name: '反射护盾',
                desc: '反弹部分伤害给攻击者',
                effect: { reflectRatio: 0.10, reflectPerLevel: 0.03 }
            },
            guard: {
                name: '守护护盾',
                desc: '护盾消失时治疗自身',
                effect: { healRatio: 0.10, healPerLevel: 0.02, ccReduction: 0.30, ccPerLevel: 0.05 }
            }
        },
        stage3: {
            // 反射分支
            retribution: {
                name: '惩戒光环',
                desc: '脉冲伤害并减速周围敌人',
                effect: { auraDamageRatio: 0.02, slowAmount: 0.15, pulseInterval: 2 }
            },
            fortress: {
                name: '绝对防御',
                desc: '免疫暴击，击杀回血',
                effect: { critImmunity: true, lifestealRatio: 0.05 }
            },
            // 守护分支
            angel: {
                name: '守护天使',
                desc: '护盾消失后短暂无敌',
                effect: { invincibleDuration: 1.0, movespeedBonus: 0.40, canAttack: false }
            },
            link: {
                name: '生命链接',
                desc: '生成次级护盾',
                effect: { secondaryShieldRatio: 0.30, secondaryDuration: 3 }
            }
        }
    }
}
```

#### 步骤1.2：添加护盾逻辑（新建 shield-skill.js）

**文件**：`shield-skill.js`（新建）
```javascript
const ShieldSystem = {
    // 施放护盾
    cast: function(skillLevel, branch, stage3Branch) {
        if (player.shield.cooldown > 0 || player.mp < 15) return false;

        const config = SKILL_TREE.holy_shield;
        const shieldValue = player.maxHp * (config.stage1.shieldRatio +
                          (skillLevel - 1) * config.stage1.shieldPerLevel);

        player.shield = {
            active: true,
            value: shieldValue,
            maxValue: shieldValue,
            timer: config.stage1.duration + (skillLevel - 1) * config.stage1.durationPerLevel,
            cooldown: config.stage1.cooldown,
            type: branch,
            stage3: stage3Branch
        };

        player.mp -= config.stage1.manaCost;
        createParticleEffect(); // 创建视觉效果
        return true;
    },

    // 每帧更新
    update: function(dt) {
        // 冷却倒计时
        if (player.shield.cooldown > 0) {
            player.shield.cooldown = Math.max(0, player.shield.cooldown - dt);
        }

        // 护盾激活状态
        if (player.shield.active) {
            player.shield.timer -= dt;

            // 时间到或护盾值归零
            if (player.shield.timer <= 0 || player.shield.value <= 0) {
                this.expire();
            }
        }

        // 无敌帧更新（守护天使）
        if (player.shield.invincibleTimer > 0) {
            player.shield.invincibleTimer -= dt;
        }
    },

    // 护盾消失
    expire: function() {
        const shield = player.shield;
        const config = SKILL_TREE.holy_shield.stage2[shield.type];

        // 触发治疗效果
        if (shield.type === 'guard') {
            const healAmount = player.maxHp * (config.effect.healRatio +
                             (config.level - 1) * config.effect.healPerLevel);
            player.hp = Math.min(player.maxHp, player.hp + healAmount);
            createHealEffect();
        }

        // 触发守护天使
        if (shield.stage3 === 'angel' && shield.value > 0) {
            player.shield.invincibleTimer = SKILL_TREE.holy_shield.stage3.angel.effect.invincibleDuration;
        }

        // 触发生命链接（次级护盾）
        if (shield.stage3 === 'link' && shield.value > 0) {
            const secondaryValue = shield.maxValue * SKILL_TREE.holy_shield.stage3.link.effect.secondaryShieldRatio;
            player.shield.value = secondaryValue;
            player.shield.maxValue = secondaryValue;
            player.shield.timer = SKILL_TREE.holy_shield.stage3.link.effect.secondaryDuration;
            player.shield.stage3 = null; // 只触发一次
            return; // 不关闭护盾
        }

        // 重置护盾状态
        player.shield.active = false;
        player.shield.value = 0;
        player.shield.timer = 0;
        player.shield.stage3 = null;
    },

    // 承受伤害时调用
    takeDamage: function(damage) {
        if (!player.shield.active) return damage;

        const shield = player.shield;
        let remainingDamage = damage;

        // 护盾吸收伤害
        if (shield.value > 0) {
            const absorbed = Math.min(shield.value, damage);
            shield.value -= absorbed;
            remainingDamage = damage - absorbed;

            // 创建护盾受击效果
            createShieldHitEffect(absorbed);
        }

        // 反射伤害
        if (shield.type === 'reflect' && damage > 0) {
            const reflectRatio = SKILL_TREE.holy_shield.stage2.reflect.effect.reflectRatio +
                               (skillLevel - 1) * SKILL_TREE.holy_shield.stage2.reflect.effect.reflectPerLevel;
            const reflectDamage = damage * reflectRatio * 0.5; // 0.5系数防止过强
            // 调用伤害敌人逻辑...
        }

        return remainingDamage;
    }
}
```

#### 步骤1.3：集成到游戏循环（game.js）

**文件**：`game.js:4400`（update函数）
```javascript
// 在 player.invincibleTimer 更新后添加
if (window.ShieldSystem) {
    ShieldSystem.update(dt);
}
```

**文件**：`game.js:4870`（受伤前调用）
```javascript
// 在 takeDamage 前插入
if (player.shield.active) {
    actualDamage = ShieldSystem.takeDamage(actualDamage);
    if (actualDamage <= 0) return; // 护盾完全吸收
}
```

---

### **阶段2：UI集成**（预估：2小时）

#### 步骤2.1：添加技能标签（index.html）

**文件**：`index.html:196-200`
```html
<div class="skill-tree-tabs">
    <div class="skill-tree-tab active" data-skill="fireball" onclick="switchSkillTab('fireball')">🔥 火焰</div>
    <div class="skill-tree-tab" data-skill="thunder" onclick="switchSkillTab('thunder')">⚡ 雷电</div>
    <div class="skill-tree-tab" data-skill="multishot" onclick="switchSkillTab('multishot')">🏹 射击</div>
    <div class="skill-tree-tab" data-skill="holy_shield" onclick="switchSkillTab('holy_shield')">🛡️ 护盾</div>  <!-- 新增 -->
</div>
```

#### 步骤2.2：添加HUD显示（game.js）

**文件**：`game.js:6680`（drawUI函数）
```javascript
// 在HP/MP条附近添加护盾条
if (player.shield.active) {
    const shieldRatio = player.shield.value / player.shield.maxValue;
    drawShieldBar(shieldRatio); // 在HP条上方显示金色护盾条

    // 显示剩余时间
    ctx.fillStyle = 'gold';
    ctx.font = '12px Arial';
    ctx.fillText(Math.ceil(player.shield.timer) + 's', player.x - 10, player.y - 40);
}

// 显示冷却时间
if (player.shield.cooldown > 0 && !player.shield.active) {
    const cdRatio = player.shield.cooldown / SKILL_TREE.holy_shield.stage1.cooldown;
    drawCooldownOverlay('R', cdRatio);
}
```

#### 步骤2.3：添加按键监听（game.js）

**文件**：`game.js:7100`（keydown事件）
```javascript
case 'KeyR':
case 'r':
    if (player.skillTree && player.skillTree.holy_shield) {
        const level = getSkillTotalLevel('holy_shield');
        if (level > 0) {
            ShieldSystem.cast(level, player.skillTree.holy_shield.type, player.skillTree.holy_shield.stage3);
        }
    }
    break;
```

---

### **阶段3：存档迁移**（预估：1小时）

**文件**：`save-system.js:50`（load函数）
```javascript
// 初始化新技能树结构
if (!data.skillTree) {
    data.skillTree = {
        fireball: { stage1: 1, stage2: { type: null, level: 0 }, stage3: null },
        thunder: { stage1: 0, stage2: { type: null, level: 0 }, stage3: null },
        multishot: { stage1: 0, stage2: { type: null, level: 0 }, stage3: null },
        holy_shield: { stage1: 0, stage2: { type: null, level: 0 }, stage3: null }  // 新增
    };
}
```

---

## 四、检查点与验证机制

### 每个阶段的验证清单

#### ✅ **阶段0完工检查**
- [ ] 备份文件已创建
- [ ] shield-skill.js文件已新建
- [ ] constants.js和game.js已备份
- [ ] player对象已添加shield属性

#### ✅ **阶段1完工检查**
- [ ] SKILL_TREE配置已添加
- [ ] ShieldSystem基础功能已实现
- [ ] 护盾施放逻辑可调用
- [ ] 护盾吸收伤害正常
- [ ] UI显示护盾条
- [ ] 按键R可施放
- [ ] 基础数值测试通过

#### ✅ **阶段2完工检查**（反射分支）
- [ ] 反射伤害计算正确
- [ ] 反伤显示正常
- [ ] 反伤不触发暴击
- [ ] 反伤有上限（maxHp*0.1）
- [ ] 冷却时间起效
- [ ] 多个敌人攻击时不会崩溃

#### ✅ **阶段3完工检查**（反射分支）
- [ ] 惩戒光环脉冲间隔正确
- [ ] 光环不影响性能（每2秒触发一次）
- [ ] 减速效果不叠加
- [ ] 绝对防御免疫暴击生效
- [ ] 击杀回血数值平衡

#### ✅ **阶段4完工检查**（守护分支）
- [ ] 护盾消失时治疗生效
- [ ] 治疗量正确（最大HP的20%）
- [ ] 异常状态减免生效
- [ ] 守护天使无敌持续1秒
- [ ] 无敌期间无法攻击
- [ ] 生命链接次级护盾正常
- [ ] 次级护盾不触发终极技能

#### ✅ **完整性检查**
- [ ] 存档/读档正常
- [ ] 所有分支可正常解锁
- [ ] 技能点返还正常
- [ ] 与其他技能无冲突
- [ ] 移动端适配正常
- [ ] 性能测试通过（60fps）

---

## 五、平衡性测试方案

### 测试用例1：数值验证
```
目标：阶段1 Lv5的基础护盾
预期值：maxHp * 30%，持续7.5秒，冷却12秒
测试步骤：
1. 创建一个测试角色，HP=500
2. 施放护盾
3. 验证护盾值=150
4. 验证持续7.5秒后消失
5. 验证冷却12秒后可再施放
```

### 测试用例2：反伤平衡
```
目标：反射护盾Lv5的反射伤害不超过普攻30%
测试步骤：
1. 玩家普攻伤害=100
2. 怪物攻击玩家=100
3. 开启反射护盾（反伤25%）
4. 验证反射伤害=100*0.25*0.5=12.5
5. 确认12.5 < 100*0.3（30）
```

### 测试用例3：通关时间对比
```
目标：有护盾vs无护盾通关时间差<30%
测试步骤：
1. 测试者A（无护盾）通关第5层，记录时间
2. 测试者B（有护盾，阶段1 Lv5）通关第5层
3. 计算时间差比例
4. 如果>30%，调整护盾值为25%
```

### 测试用例4：技能组合测试
```
目标：护盾技能不与其他技能冲突
测试组合：
- 火球术+护盾：火球释放时护盾存在
- 雷电术+护盾：护盾期内施放雷电
- 多重射击+护盾：无敌期间能否射击（预期：不能）
```

---

## 六、性能影响评估

### 新增计算开销
| 功能 | 频率 | 性能影响 | 优化措施 |
|-----|------|---------|---------|
| 护盾更新 | 每帧 | 极低 | 仅几个数值计算 |
| 反伤计算 | 被击时 | 低 | 仅在受伤时触发 |
| 光环脉冲 | 每2秒 | 极低 | 缓存敌人列表 |
| 次级护盾 | 护盾消失时 | 极低 | 仅一次检查 |

**总体评估**：<0.5% FPS影响，可接受

---

## 七、回滚方案

### 如果测试发现问题

1. **数值问题**：直接在constants.js调整系数
2. **机制问题**：在shield-skill.js添加feature flag
3. **严重bug**：删除index.html中的技能标签，隐藏功能

### 紧急禁用开关
```javascript
// 在shield-skill.js顶部添加
const ENABLE_SHIELD_SKILL = true; // 设为false可全局禁用
```

---

## 八、实施时间表

| 任务 | 预估时间 | 责任人 | 完成状态 |
|-----|---------|--------|---------|
| 阶段0：准备 | 30分钟 | 开发者 | ⏳ 待开始 |
| 阶段1：基础实现 | 2小时 | 开发者 | ⏳ 待开始 |
| 阶段2：分支实现 | 3小时 | 开发者 | ⏳ 待开始 |
| 阶段3：终极技能 | 4小时 | 开发者 | ⏳ 待开始 |
| UI集成 | 2小时 | 开发者 | ⏳ 待开始 |
| 测试与调优 | 2小时 | 测试员 | ⏳ 待开始 |
| **总计** | **13.5小时** | - | - |

---

## 九、后续扩展（可选）

### v2.0 新功能
- [ ] 护盾破损特效
- [ ] 阶段3专属视觉
- [ ] 护盾音效
- [ ] 配合套装的特殊效果

### v3.0 系统优化
- [ ] 技能预设配置（一键换build）
- [ ] 被动技能第四分支（光环类）
- [ ] 技能符文系统

---

**审批**：待开发团队确认
**修改记录**：2026-01-02 初版创建（针对风险进行了多重调整）
