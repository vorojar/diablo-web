# 暗黑破坏神 Web版 - 功能完善任务清单

> 基于暗黑破坏神2的核心特色，按重要性排序的待实现功能列表

---

## 🎯 第一优先级：核心玩法深度

### 1. ✅ 精英怪词缀系统 ⭐⭐⭐⭐⭐

**重要性说明：**
- 暗黑2的精髓就是精英怪的随机词缀，这是游戏挑战性和变化性的核心
- 当前精英怪只是属性增强，没有特殊能力，战斗缺乏变化
- 实现难度：中等

**建议实现的词缀：**
```javascript
精英怪词缀列表：
- 额外快速 (Extra Fast)：移速+50%
- 闪电强化 (Lightning Enchanted)：死亡时爆炸
- 火焰强化 (Fire Enchanted)：攻击附带火焰伤害
- 寒冰强化 (Cold Enchanted)：攻击附带冰冻效果
- 魔法免疫 (Magic Immune)：技能伤害减免80%
- 额外强壮 (Extra Strong)：伤害+200%
- 多重射击 (Multishot)：远程怪物发射3支箭
- 狂热 (Fanaticism)：周围怪物攻速+50%
- 吸血 (Life Steal)：攻击回复生命
- 法力燃烧 (Mana Burn)：攻击消耗玩家法力
- 石肤 (Stone Skin)：受到伤害减少50%
- 诅咒 (Cursed)：降低玩家防御和抗性
```

**实现位置：** `game.js` 中生成精英怪的逻辑，添加 `affixes` 数组字段

---

### 2. ✅ 抗性系统 ⭐⭐⭐⭐⭐

**重要性说明：**
- 暗黑2的装备选择核心就是平衡伤害和抗性
- 当前只有"护甲"一个防御属性，太单薄
- 让装备选择更有策略性

**建议实现：**
```javascript
// 玩家抗性属性
player: {
    resistances: {
        fire: 0,      // 火抗 (-100% 到 75%)
        cold: 0,      // 冰抗 (-100% 到 75%)
        lightning: 0, // 电抗 (-100% 到 75%)
        poison: 0     // 毒抗 (-100% 到 75%)
    }
}

// 伤害类型系统
damageTypes: {
    physical: 物理伤害（受护甲影响）,
    fire: 火焰伤害（受火抗影响）,
    cold: 冰霜伤害（受冰抗影响）,
    lightning: 闪电伤害（受电抗影响）,
    poison: 毒素伤害（持续伤害，受毒抗影响）
}

// 装备词缀添加抗性
affixes: {
    '烈焰之': { fireRes: 15-30 },
    '冰霜之': { coldRes: 15-30 },
    '闪电之': { lightningRes: 15-30 },
    '全能之': { allRes: 10-20 }  // 所有抗性
}

// 敌人攻击附带元素伤害
enemy: {
    damageType: 'fire',  // 攻击类型
    elementalDamage: 20  // 额外元素伤害
}
```

**实现位置：**
- `player` 对象添加 `resistances` 字段
- `takeDamage()` 函数中添加抗性计算
- 装备词缀系统添加抗性加成
- UI中显示抗性值

---

### 3. ✅ 更丰富的装备词缀系统 ⭐⭐⭐⭐☆

**重要性说明：**
- 当前词缀只有基础属性加成，缺乏暗黑2的特色词缀
- 需要更多独特和强力的词缀来驱动刷装备的动力

**建议添加的词缀类型：**

```javascript
// 抗性类词缀
resistance_affixes: {
    prefix: {
        '烈焰之': { fireRes: 15-30 },
        '冰霜之': { coldRes: 15-30 },
        '闪电之': { lightningRes: 15-30 },
        '剧毒之': { poisonRes: 15-30 },
        '全能之': { allRes: 10-20 }
    }
}

// 元素伤害词缀
elemental_affixes: {
    prefix: {
        '燃烧的': { fireDamage: 10-30 },
        '寒冰的': { coldDamage: 10-30 },
        '雷电的': { lightningDamage: 10-30 },
        '剧毒的': { poisonDamage: 50-150, duration: 3 }  // 持续伤害
    }
}

// 特殊效果词缀
special_affixes: {
    prefix: {
        '吸血鬼之': { lifeStealPercent: 3-8 },
        '穿刺的': { armorPierce: 10-30 },  // 忽略防御
        '击退的': { knockbackChance: 20-50 },
        '减速的': { slowChance: 25-50, slowAmount: 30 },
        '致命的': { critDamage: 150-250 },  // 暴击伤害加成
        '连击的': { doubleHitChance: 10-25 }  // 双倍攻击
    },
    suffix: {
        '之再生': { hpRegen: 5-15 },  // 每秒回血
        '之冥想': { mpRegen: 50-200 },  // 法力回复速度%
        '之格挡': { blockChance: 10-30 },  // 盾牌专属
        '之反射': { reflectDamage: 5-15 },  // 反伤%
        '之神速': { attackSpeed: 20-40 },
        '之铁壁': { damageReduction: 5-15 }  // 伤害减免%
    }
}

// 光环效果词缀（暗金专属）
aura_affixes: {
    '技能大师': { allSkills: 1-2 },  // +X 所有技能等级
    '法力护盾': { manaShield: 10-20 },  // X% 伤害转移到法力
    '荆棘': { thornsDamage: 50-200 },  // 反伤固定值
    '冰冻光环': { freezeAura: true, radius: 200 },  // 周围敌人减速
    '恐惧光环': { fearAura: true, radius: 150 }  // 敌人后退
}

// 套装专属词缀
set_bonus_affixes: {
    '部分套装减免': { damageReduction: 5 },  // 物理伤害减免
    '完整套装变身': { transformSkill: true }  // 特殊技能
}
```

**实现位置：** `AFFIXES` 常量对象，`generateItem()` 函数中的词缀生成逻辑

---

### 4. ✅ 装备需求系统 ⭐⭐⭐⭐☆

**重要性说明：**
- 当前可以装备任何物品，缺乏角色成长的规划感
- 暗黑2中需要合理分配属性才能穿装备，这是重要的策略元素
- 实现简单但影响深远

**建议实现：**
```javascript
// 物品添加需求字段
item: {
    name: '巨神之剑',
    type: 'weapon',
    requirements: {
        level: 15,     // 需要等级
        str: 45,       // 需要力量
        dex: 30        // 需要敏捷
    },
    // ... 其他属性
}

// 需求计算规则
requirements_formula: {
    // 武器
    weapon: {
        level: Math.floor(itemLevel * 0.8),
        str: baseDamage * 3,
        dex: baseDamage * 2
    },
    // 护甲
    armor: {
        level: Math.floor(itemLevel * 0.7),
        str: baseDefense * 2
    },
    // 盾牌
    shield: {
        level: Math.floor(itemLevel * 0.75),
        str: baseDefense * 1.5
    }
}

// 装备检查函数
function canEquip(item) {
    if (item.requirements.level > player.lvl) return false;
    if (item.requirements.str > player.str) return false;
    if (item.requirements.dex > player.dex) return false;
    return true;
}

// UI显示
// 不满足需求的属性用红色显示
// 物品栏中无法装备的物品变暗
```

**实现位置：**
- `generateItem()` 函数中添加需求计算
- `equipItem()` 函数中添加需求检查
- 物品提示框中显示需求信息

---

## 🎮 第二优先级：长期可玩性

### 5. 套装系统（绿装） ⭐⭐⭐⭐☆

**重要性说明：**
- 暗黑2的套装是收集目标和Build核心
- 集齐套装获得额外加成，极大增加收集乐趣
- 为后期游戏提供明确目标

**建议实现：**
```javascript
// 套装定义
ITEM_SETS = {
    tancred: {
        name: "塔格奥的化身",
        items: {
            helm: { name: "塔格奥的颅骨", baseType: 'helm', stats: { def: 15, hp: 20 } },
            armor: { name: "塔格奥的外壳", baseType: 'body', stats: { def: 40, hp: 30 } },
            weapon: { name: "塔格奥的棘刺", baseType: 'weapon', stats: { dmg: [5, 10], str: 10 } }
        },
        bonuses: {
            2: {  // 2件套加成
                str: 10,
                hp: 50,
                desc: "+10 力量, +50 生命值"
            },
            3: {  // 3件套加成
                str: 20,
                hp: 100,
                armor: 30,
                special: 'fire_damage',
                specialValue: 20,
                desc: "+20 力量, +100 生命值, +30 防御, 攻击附带20点火焰伤害"
            }
        }
    },

    sigon: {
        name: "西贡的完全钢铁",
        items: {
            helm: { name: "西贡的面罩", baseType: 'helm', stats: { def: 20, mp: 30 } },
            armor: { name: "西贡的护甲", baseType: 'body', stats: { def: 50, hp: 50 } },
            gloves: { name: "西贡的护手", baseType: 'gloves', stats: { def: 10, attackSpeed: 10 } },
            belt: { name: "西贡的腰带", baseType: 'belt', stats: { def: 12, str: 5 } },
            boots: { name: "西贡的战靴", baseType: 'boots', stats: { def: 8, speed: 20 } },
            shield: { name: "西贡的卫士", baseType: 'offhand', stats: { def: 25, blockChance: 15 } }
        },
        bonuses: {
            2: { hp: 50, mp: 30 },
            3: { hp: 100, mp: 60, allRes: 10 },
            4: { hp: 150, mp: 100, allRes: 15, attackSpeed: 20 },
            6: { hp: 300, mp: 200, allRes: 25, attackSpeed: 30, lifeSteal: 5,
                 desc: "完整套装：变为不可阻挡的战士" }
        }
    },

    // 法师套装
    tasha: {
        name: "塔拉夏的外袍",
        items: {
            helm: { name: "塔拉夏的凝视", baseType: 'helm' },
            armor: { name: "塔拉夏的外袍", baseType: 'body' },
            weapon: { name: "塔拉夏的护佑", baseType: 'weapon' },
            amulet: { name: "塔拉夏的徽记", baseType: 'amulet' }
        },
        bonuses: {
            2: { allSkills: 1, mpRegen: 100 },
            3: { allSkills: 2, mpRegen: 200, allRes: 20 },
            4: { allSkills: 3, mpRegen: 300, allRes: 30, special: 'energy_shield' }
        }
    }
};

// 套装检测函数
function getEquippedSetItems() {
    const sets = {};
    for (let slot in player.equipment) {
        const item = player.equipment[slot];
        if (item && item.setId) {
            if (!sets[item.setId]) sets[item.setId] = 0;
            sets[item.setId]++;
        }
    }
    return sets;
}

// 应用套装加成
function applySetBonuses() {
    const sets = getEquippedSetItems();
    let bonuses = {};
    for (let setId in sets) {
        const count = sets[setId];
        const setBonuses = ITEM_SETS[setId].bonuses;
        for (let num in setBonuses) {
            if (count >= parseInt(num)) {
                Object.assign(bonuses, setBonuses[num]);
            }
        }
    }
    return bonuses;
}
```

**实现位置：**
- 新增 `ITEM_SETS` 常量对象
- 装备系统中添加套装检测
- UI中显示套装加成和已装备件数

---

### 6. 符文和镶嵌系统 ⭐⭐⭐⭐☆

**重要性说明：**
- 暗黑2最具深度的系统之一
- 符文之语让普通装备也有价值
- 增加装备Customization

**建议实现：**
```javascript
// 符文定义
RUNES = {
    el: { id: 1, name: 'El',
          weapon: { attackRating: 15 },
          armor: { defense: 1 },
          helm: { defense: 1 } },

    eld: { id: 2, name: 'Eld',
           weapon: { enemyDefense: -1 },
           armor: { blockChance: 15 },
           helm: { speed: 5 } },

    tir: { id: 3, name: 'Tir',
           weapon: { manaPerKill: 2 },
           armor: { manaRegen: 2 },
           helm: { manaRegen: 2 } },

    tal: { id: 7, name: 'Tal',
           weapon: { poisonDamage: 50, duration: 3 },
           armor: { poisonRes: 30 },
           helm: { poisonRes: 30 } },

    ort: { id: 9, name: 'Ort',
           weapon: { lightningDamage: [1, 50] },
           armor: { lightningRes: 30 },
           helm: { lightningRes: 30 } },

    thul: { id: 10, name: 'Thul',
            weapon: { coldDamage: [3, 14] },
            armor: { coldRes: 30 },
            helm: { coldRes: 30 } },

    amn: { id: 11, name: 'Amn',
           weapon: { lifeSteal: 7 },
           armor: { damageReduction: 7 },
           helm: { damageReduction: 7 } }
};

// 符文之语定义
RUNEWORDS = {
    steel: {
        name: '钢铁',
        runes: ['tir', 'el'],
        itemType: 'weapon',
        sockets: 2,
        stats: {
            damage: 20,  // +20% 增强伤害
            minDamage: 3,
            maxDamage: 3,
            attackRating: 50,
            desc: '入门级符文之语'
        }
    },

    spirit: {
        name: '精神',
        runes: ['tal', 'thul', 'ort', 'amn'],
        itemType: 'weapon',
        sockets: 4,
        stats: {
            allSkills: 2,
            fastCast: 35,
            fastHitRecovery: 55,
            mana: 112,
            absorbMagic: 35,
            desc: '法师神器符文之语'
        }
    },

    stealth: {
        name: '隐秘',
        runes: ['tal', 'eth'],
        itemType: 'armor',
        sockets: 2,
        stats: {
            fastCast: 25,
            fastHitRecovery: 25,
            speed: 25,
            mpRegen: 15,
            poisonRes: 30,
            desc: '早期法师铠甲'
        }
    }
};

// 装备添加孔位系统
item: {
    sockets: 2,           // 孔位数量
    socketedRunes: [],    // 已镶嵌的符文 ['el', 'tir']
    isRuneword: false,    // 是否触发符文之语
    runewordId: null      // 符文之语ID
}

// 镶嵌函数
function socketRune(item, rune) {
    if (item.socketedRunes.length >= item.sockets) {
        return false;  // 孔位已满
    }
    item.socketedRunes.push(rune);

    // 检查是否匹配符文之语
    checkRuneword(item);
    return true;
}

// 符文之语检测
function checkRuneword(item) {
    for (let rwId in RUNEWORDS) {
        const rw = RUNEWORDS[rwId];
        if (rw.itemType === item.baseType &&
            rw.sockets === item.sockets &&
            arraysEqual(rw.runes, item.socketedRunes)) {
            item.isRuneword = true;
            item.runewordId = rwId;
            // 应用符文之语加成
            applyRunewordStats(item, rw);
            break;
        }
    }
}
```

**实现位置：**
- 新增 `RUNES` 和 `RUNEWORDS` 常量
- 装备生成时随机添加孔位
- 新增镶嵌UI界面
- 符文作为特殊物品类型

---

### 7. ✅ 地狱模式 ⭐⭐⭐⭐⭐

**重要性说明：**
- 暗黑2的Replay价值核心
- 当前10层打完就结束，缺乏后续内容
- 提供渐进式挑战和高收益奖励

**已实现功能：**
- 击败巴尔后解锁地狱模式
- 营地新增"地狱守卫"传送NPC
- 独立的地牢/地狱双地图系统（各有1-10层）
- 地狱难度倍率：怪物血量×6，伤害×4，速度×1.3，经验×5，掉落品质×3.5
- 地狱怪物名字带"地狱"前缀（如"地狱沉沦魔"）
- 玩家可以随时通过NPC或BOSS房入口返回普通地牢
- 死亡后自动重置为普通模式，避免状态混乱
- UI左上角显示红色"地狱"指示器

**核心配置：**
```javascript
DIFFICULTY_MODIFIERS = {
    normal: {
        monsterHpMult: 1,
        monsterDmgMult: 1,
        monsterSpeedMult: 1,
        xpMult: 1,
        dropQualityMult: 1,
        resistancePenalty: 0
    },
    hell: {
        monsterHpMult: 6,
        monsterDmgMult: 4,
        monsterSpeedMult: 1.3,
        xpMult: 5,
        dropQualityMult: 3.5,
        resistancePenalty: -100
    }
}
```

**实现位置：**
- `DIFFICULTY_MODIFIERS` 配置（game.js:636-658）
- 地狱守卫NPC生成与对话（game.js:956-959, 1815-1864）
- 怪物生成时应用难度倍率（game.js:1010-1042）
- 地狱状态管理（player.isInHell, player.hellFloor）

---

### 8. 更深的技能树系统 ⭐⭐⭐☆☆

**重要性说明：**
- 当前只有3个技能，太少
- 暗黑2每个职业有约30个技能分3个分支
- 需要更多Build选择

**建议技能树结构：**
```javascript
SKILL_TREE = {
    fire: {
        name: '火系',
        skills: {
            fireball: {
                name: '火球术',
                maxLevel: 20,
                manaCost: (lvl) => 5 + lvl * 2,
                damage: (lvl) => 20 + lvl * 10,
                range: 400,
                requires: null
            },
            fireWall: {
                name: '火墙',
                maxLevel: 20,
                manaCost: (lvl) => 10 + lvl * 3,
                damage: (lvl) => 5 + lvl * 3,  // 每秒
                duration: (lvl) => 3 + lvl * 0.5,
                requires: { fireball: 5 }
            },
            meteor: {
                name: '陨石',
                maxLevel: 20,
                manaCost: (lvl) => 20 + lvl * 5,
                damage: (lvl) => 50 + lvl * 20,
                areaRadius: (lvl) => 100 + lvl * 5,
                requires: { fireWall: 10 }
            },
            inferno: {
                name: '地狱火',
                maxLevel: 20,
                manaCost: (lvl) => 15 + lvl * 4,
                damage: (lvl) => 8 + lvl * 4,  // 持续伤害
                chainTargets: (lvl) => Math.min(5, 1 + Math.floor(lvl / 5)),
                requires: { fireball: 8 }
            }
        }
    },

    cold: {
        name: '冰系',
        skills: {
            frostNova: {
                name: '冰霜新星',
                maxLevel: 20,
                manaCost: (lvl) => 8 + lvl * 2,
                damage: (lvl) => 15 + lvl * 8,
                freezeDuration: (lvl) => 2 + lvl * 0.2,
                radius: 200,
                requires: null
            },
            frozenArmor: {
                name: '冰封装甲',
                maxLevel: 20,
                manaCost: (lvl) => 12 + lvl * 2,
                defense: (lvl) => 30 + lvl * 10,
                freezeAttacker: true,
                duration: (lvl) => 120 + lvl * 10,
                requires: { frostNova: 3 }
            },
            blizzard: {
                name: '暴风雪',
                maxLevel: 20,
                manaCost: (lvl) => 25 + lvl * 5,
                damage: (lvl) => 10 + lvl * 5,  // 每秒
                duration: (lvl) => 4 + lvl * 0.3,
                radius: (lvl) => 150 + lvl * 10,
                requires: { frostNova: 12 }
            },
            glacialSpike: {
                name: '冰尖柱',
                maxLevel: 20,
                manaCost: (lvl) => 18 + lvl * 3,
                damage: (lvl) => 30 + lvl * 12,
                freezeDuration: (lvl) => 3 + lvl * 0.3,
                piercing: true,
                requires: { frostNova: 8 }
            }
        }
    },

    lightning: {
        name: '闪电系',
        skills: {
            chargedBolt: {
                name: '充能弹',
                maxLevel: 20,
                manaCost: (lvl) => 6 + lvl * 1.5,
                damage: (lvl) => 8 + lvl * 4,
                bolts: (lvl) => 3 + Math.floor(lvl / 5),
                requires: null
            },
            chainLightning: {
                name: '闪电链',
                maxLevel: 20,
                manaCost: (lvl) => 15 + lvl * 4,
                damage: (lvl) => 25 + lvl * 12,
                chains: (lvl) => 3 + Math.floor(lvl / 4),
                requires: { chargedBolt: 6 }
            },
            thunderstorm: {
                name: '雷暴',
                maxLevel: 20,
                manaCost: (lvl) => 20 + lvl * 4,
                damage: (lvl) => 15 + lvl * 8,
                duration: (lvl) => 10 + lvl,
                frequency: 1.0,  // 每秒一次
                requires: { chargedBolt: 10 }
            },
            energyShield: {
                name: '能量护盾',
                maxLevel: 20,
                manaCost: (lvl) => 25,
                damageToMana: (lvl) => 10 + lvl * 3,  // %
                duration: (lvl) => 60 + lvl * 10,
                requires: { chargedBolt: 5 }
            }
        }
    }
};
```

**实现位置：**
- 扩展 `SKILL_TREE` 结构
- 更新技能面板UI支持树状依赖关系
- 添加每个新技能的释放逻辑

---

## 🌟 第三优先级：体验优化

### 9. 死亡惩罚机制 ⭐⭐⭐☆☆

**重要性说明：**
- 当前死亡没有惩罚，降低了游戏张力
- 暗黑2的尸体回收机制是经典设计
- 增加游戏挑战性和刺激感

**建议实现：**
```javascript
// 玩家死亡处理
function onPlayerDeath() {
    // 1. 创建尸体
    const corpse = {
        x: player.x,
        y: player.y,
        equipment: { ...player.equipment },  // 复制装备
        floor: player.floor
    };
    player.corpses.push(corpse);  // 可能有多个尸体

    // 2. 经验惩罚
    const xpLoss = Math.floor(player.xp * 0.10);  // 掉落10%经验
    player.xp = Math.max(0, player.xp - xpLoss);
    createDamageNumber(player.x, player.y - 50, `-${xpLoss} XP`, '#ff0000');

    // 3. 脱下所有装备（只保留腰带物品）
    for (let slot in player.equipment) {
        player.equipment[slot] = null;
    }

    // 4. 重置属性
    calculatePlayerStats();

    // 5. 复活到城镇
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    player.floor = 0;
    generateTown();

    showNotification('你已死亡！返回尸体取回装备。');
}

// 尸体回收
function retrieveCorpse(corpse) {
    // 自动拾取尸体上的装备到背包
    for (let slot in corpse.equipment) {
        const item = corpse.equipment[slot];
        if (item) {
            addToInventory(item);
        }
    }
    // 移除尸体
    player.corpses = player.corpses.filter(c => c !== corpse);
    showNotification('已取回尸体上的装备');
}

// 地图上渲染尸体
function drawCorpses() {
    player.corpses.forEach(corpse => {
        if (corpse.floor === player.floor) {
            ctx.fillStyle = '#880000';
            ctx.beginPath();
            ctx.arc(corpse.x, corpse.y, 15, 0, Math.PI * 2);
            ctx.fill();
            // 绘制骷髅头符号
            ctx.fillStyle = '#fff';
            ctx.font = '20px Arial';
            ctx.fillText('💀', corpse.x - 10, corpse.y + 8);
        }
    });
}
```

**实现位置：**
- `checkPlayerDeath()` 函数中添加死亡逻辑
- 新增尸体渲染和回收系统
- 存档系统中保存尸体位置

---

### 10. 传送点系统（Waypoint） ⭐⭐⭐☆☆

**重要性说明：**
- 当前每次都要从第1层走到深层，重复劳动
- 暗黑2的Waypoint是便利性核心
- 减少无意义的跑路时间

**建议实现：**
```javascript
// 传送点配置
WAYPOINTS = {
    floors: [1, 3, 5, 7, 10],  // 哪些层有传送点
    activated: []  // 已激活的传送点
};

// 传送点对象
waypoint: {
    x: 某位置,
    y: 某位置,
    floor: 5,
    activated: false
}

// 激活传送点
function activateWaypoint(wp) {
    if (!wp.activated) {
        wp.activated = true;
        WAYPOINTS.activated.push(wp.floor);
        showNotification(`传送点已激活：地牢第${wp.floor}层`);
        AudioSys.play('quest');
    }

    // 显示传送点菜单
    showWaypointMenu();
}

// 传送点UI
function showWaypointMenu() {
    const menu = document.createElement('div');
    menu.className = 'waypoint-menu';

    WAYPOINTS.activated.forEach(floor => {
        const btn = document.createElement('button');
        btn.textContent = `传送到第${floor}层`;
        btn.onclick = () => {
            enterFloor(floor, 'waypoint');
            menu.remove();
        };
        menu.appendChild(btn);
    });

    document.body.appendChild(menu);
}

// 地图生成时创建传送点
function generateDungeon() {
    // ... 原有逻辑

    if (WAYPOINTS.floors.includes(player.floor)) {
        // 在地图中间某处生成传送点
        const wpX = centerX * TILE_SIZE;
        const wpY = centerY * TILE_SIZE;
        waypoint = { x: wpX, y: wpY, floor: player.floor, activated: false };
    }
}
```

**实现位置：**
- 地图生成时在特定层创建传送点
- 新增传送点UI界面
- 城镇中也放置一个主传送点

---

### 11. 可破坏物品和箱子 ⭐⭐⭐☆☆

**重要性说明：**
- 暗黑2的探索乐趣来源之一
- 增加地图互动性
- 提供额外奖励

**建议实现：**
```javascript
// 可破坏物品类型
DESTRUCTIBLES = {
    barrel: {
        name: '木桶',
        hp: 1,
        sprite: '🛢️',
        lootChance: 0.3,
        lootTable: 'low'
    },
    chest: {
        name: '箱子',
        hp: 1,
        sprite: '📦',
        lootChance: 0.8,
        lootTable: 'medium'
    },
    urn: {
        name: '罐子',
        hp: 1,
        sprite: '🏺',
        lootChance: 0.4,
        lootTable: 'gold'
    },
    corpse: {
        name: '尸体',
        hp: 1,
        sprite: '⚰️',
        lootChance: 0.6,
        lootTable: 'high'
    },
    crate: {
        name: '板条箱',
        hp: 2,
        sprite: '📦',
        lootChance: 0.5,
        lootTable: 'medium'
    }
};

// 可破坏物品数组
let destructibles = [];

// 生成可破坏物品
function spawnDestructibles() {
    const count = 10 + Math.floor(Math.random() * 15);

    for (let i = 0; i < count; i++) {
        let x, y;
        do {
            x = Math.floor(Math.random() * MAP_WIDTH);
            y = Math.floor(Math.random() * MAP_HEIGHT);
        } while (mapData[y][x] === 1);  // 确保在地板上

        const types = Object.keys(DESTRUCTIBLES);
        const type = types[Math.floor(Math.random() * types.length)];

        destructibles.push({
            x: x * TILE_SIZE + TILE_SIZE / 2,
            y: y * TILE_SIZE + TILE_SIZE / 2,
            type: type,
            hp: DESTRUCTIBLES[type].hp,
            broken: false
        });
    }
}

// 破坏物品
function breakDestructible(obj) {
    obj.hp--;
    if (obj.hp <= 0) {
        obj.broken = true;
        AudioSys.play('break');  // 破碎音效

        // 掉落物品
        const config = DESTRUCTIBLES[obj.type];
        if (Math.random() < config.lootChance) {
            dropLootFromDestructible(obj, config.lootTable);
        }

        // 粒子效果
        createBreakParticles(obj.x, obj.y);
    }
}

// 掉落逻辑
function dropLootFromDestructible(obj, lootTable) {
    if (lootTable === 'gold') {
        const gold = 10 + Math.floor(Math.random() * 50);
        groundItems.push({
            x: obj.x,
            y: obj.y,
            type: 'gold',
            amount: gold
        });
    } else {
        // 随机掉落物品
        const rarity = lootTable === 'high' ? 2 : (lootTable === 'medium' ? 1 : 0);
        const item = generateItem(randomItemType(), rarity, player.floor);
        groundItems.push({
            x: obj.x,
            y: obj.y,
            item: item
        });
    }
}
```

**实现位置：**
- 地图生成时随机放置可破坏物品
- 添加攻击检测和破坏逻辑
- 渲染可破坏物品和破碎动画

---

### 12. 更多怪物种类 ⭐⭐⭐☆☆

**重要性说明：**
- 当前只有3种怪物（沉沦魔、骷髅弓箭手、巫师），视觉疲劳
- 不同怪物有不同战斗模式增加变化性

**建议添加的怪物：**
```javascript
MONSTER_TYPES = {
    // 已有的
    fallen: { name: '沉沦魔', ai: 'chase', frameIndex: 0, hp: 30, dmg: 8, speed: 80 },
    skeleton_archer: { name: '骷髅弓箭手', ai: 'ranged', frameIndex: 1, hp: 25, dmg: 10, speed: 70 },
    shaman: { name: '沉沦魔巫师', ai: 'revive', frameIndex: 2, hp: 20, dmg: 5, speed: 60 },

    // 新增
    zombie: {
        name: '僵尸',
        ai: 'chase',
        frameIndex: 3,
        hp: 80,   // 高血量
        dmg: 12,
        speed: 40,  // 慢速
        special: 'tank'
    },

    spider: {
        name: '蜘蛛',
        ai: 'chase',
        frameIndex: 4,
        hp: 15,  // 低血量
        dmg: 6,
        speed: 120,  // 快速
        special: 'swarm',  // 成群出现
        poisonAttack: true
    },

    demon: {
        name: '飞行恶魔',
        ai: 'flying',
        frameIndex: 5,
        hp: 40,
        dmg: 15,
        speed: 100,
        special: 'ignore_walls',  // 可以飞跃墙壁
        fireAttack: true
    },

    goblin: {
        name: '财宝哥布林',
        ai: 'flee',
        frameIndex: 6,
        hp: 50,
        dmg: 0,
        speed: 150,
        special: 'treasure',  // 杀死后掉大量金币
        goldDrop: [500, 2000]
    },

    splitter: {
        name: '分裂怪',
        ai: 'chase',
        frameIndex: 7,
        hp: 45,
        dmg: 10,
        speed: 70,
        special: 'split',  // 死亡时分裂成2个小怪
        splitInto: 2
    },

    ghost: {
        name: '幽灵',
        ai: 'stealth',
        frameIndex: 8,
        hp: 30,
        dmg: 12,
        speed: 90,
        special: 'invisible',  // 只有靠近才显形
        revealDistance: 100
    },

    golem: {
        name: '石魔像',
        ai: 'chase',
        frameIndex: 9,
        hp: 150,
        dmg: 20,
        speed: 30,
        special: 'heavy',  // 超重单位
        stonekin: true,  // 物理抗性+50%
        slowImmune: true
    },

    necromancer: {
        name: '亡灵法师',
        ai: 'summon',
        frameIndex: 10,
        hp: 35,
        dmg: 8,
        speed: 60,
        special: 'summon_skeleton',  // 召唤骷髅
        summonCooldown: 10
    }
};

// 新AI类型实现
AI_BEHAVIORS = {
    flee: function(enemy, dt) {
        // 逃跑AI - 远离玩家
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < 300) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const moveX = enemy.x + (dx / dist) * enemy.speed * dt;
            const moveY = enemy.y + (dy / dist) * enemy.speed * dt;
            if (!isWall(moveX, enemy.y)) enemy.x = moveX;
            if (!isWall(enemy.x, moveY)) enemy.y = moveY;
        }
    },

    flying: function(enemy, dt) {
        // 飞行AI - 忽略墙壁
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < 400) {
            const nx = enemy.x + ((player.x - enemy.x) / dist) * enemy.speed * dt;
            const ny = enemy.y + ((player.y - enemy.y) / dist) * enemy.speed * dt;
            enemy.x = nx;  // 不检查墙壁
            enemy.y = ny;
        }
    },

    stealth: function(enemy, dt) {
        // 隐身AI
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        enemy.visible = dist < enemy.revealDistance;

        if (enemy.visible && dist < 400 && dist > 35) {
            const nx = enemy.x + ((player.x - enemy.x) / dist) * enemy.speed * dt;
            const ny = enemy.y + ((player.y - enemy.y) / dist) * enemy.speed * dt;
            if (!isWall(nx, enemy.y)) enemy.x = nx;
            if (!isWall(enemy.x, ny)) enemy.y = ny;
        }
    },

    summon: function(enemy, dt) {
        // 召唤AI
        if (enemy.cooldown <= 0) {
            const nearbyEnemies = enemies.filter(e =>
                !e.dead && Math.hypot(e.x - enemy.x, e.y - enemy.y) < 200
            ).length;

            if (nearbyEnemies < 5) {  // 最多5个小弟
                summonMinion(enemy);
                enemy.cooldown = 10;
            }
        }

        // 保持距离
        const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        if (dist < 150) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const moveX = enemy.x + (dx / dist) * enemy.speed * dt;
            const moveY = enemy.y + (dy / dist) * enemy.speed * dt;
            if (!isWall(moveX, enemy.y)) enemy.x = moveX;
            if (!isWall(enemy.x, moveY)) enemy.y = moveY;
        }
    }
};
```

**实现位置：**
- 扩展 `MONSTER_TYPES` 配置
- 添加新的AI行为函数
- 根据楼层随机生成不同种类怪物

---

## ⚔️ 第四优先级：BOSS机制

### 13. BOSS技能和阶段系统 ⭐⭐⭐☆☆

**重要性说明：**
- 当前BOSS只是属性更高的普通怪
- 暗黑2的BOSS有独特技能和机制
- 让BOSS战更有挑战和记忆点

**建议实现：**
```javascript
// BOSS技能定义
BOSS_SKILLS = {
    // 屠夫 (第5层)
    butcher: {
        name: '屠夫',
        skills: [
            {
                id: 'blood_frenzy',
                name: '鲜血狂怒',
                trigger: { type: 'hp_threshold', value: 0.5 },
                effect: {
                    attackSpeed: 2.0,
                    speed: 1.5,
                    color: '#ff0000',
                    duration: -1  // 永久
                },
                message: '屠夫进入狂暴状态！'
            },
            {
                id: 'hook_throw',
                name: '钩锁投掷',
                trigger: { type: 'cooldown', value: 8 },
                effect: {
                    pullPlayer: true,
                    pullDistance: 200,
                    damage: 30
                },
                message: '屠夫扔出了钩锁！'
            },
            {
                id: 'whirlwind',
                name: '旋风斩',
                trigger: { type: 'cooldown', value: 12 },
                effect: {
                    spinDuration: 3,
                    spinDamage: 15,
                    spinRadius: 100
                },
                message: '屠夫开始旋转攻击！'
            }
        ],
        phases: [
            { hp: [1.0, 0.5], behavior: 'aggressive' },
            { hp: [0.5, 0], behavior: 'berserk', spawnAdds: true }
        ]
    },

    // 暗黑破坏神 (第9层)
    diablo: {
        name: '暗黑破坏神',
        skills: [
            {
                id: 'lightning_inferno',
                name: '闪电狱',
                trigger: { type: 'cooldown', value: 10 },
                effect: {
                    createGrid: true,
                    gridSize: 50,
                    duration: 5,
                    damage: 25
                },
                message: '地面出现闪电网格！'
            },
            {
                id: 'fire_nova',
                name: '火焰新星',
                trigger: { type: 'cooldown', value: 8 },
                effect: {
                    waves: 3,
                    waveDelay: 0.5,
                    damage: 30,
                    radius: 300
                },
                message: '暗黑破坏神释放火焰新星！'
            },
            {
                id: 'bone_prison',
                name: '骨牢',
                trigger: { type: 'cooldown', value: 15 },
                effect: {
                    trapPlayer: true,
                    trapDuration: 3,
                    trapDamage: 10
                },
                message: '你被困在骨牢中！'
            },
            {
                id: 'red_lightning',
                name: '红色闪电',
                trigger: { type: 'cooldown', value: 6 },
                effect: {
                    homing: true,
                    damage: 40,
                    speed: 200
                },
                message: '暗黑破坏神发射追踪闪电！'
            }
        ],
        phases: [
            { hp: [1.0, 0.7], skills: ['fire_nova', 'red_lightning'] },
            { hp: [0.7, 0.3], skills: ['fire_nova', 'red_lightning', 'lightning_inferno'] },
            { hp: [0.3, 0], skills: 'all', speed: 1.5, message: '暗黑破坏神进入最终形态！' }
        ]
    },

    // 巴尔 (第10层)
    baal: {
        name: '巴尔',
        skills: [
            {
                id: 'tentacle_summon',
                name: '触手召唤',
                trigger: { type: 'cooldown', value: 20 },
                effect: {
                    summonCount: 5,
                    summonType: 'tentacle',
                    summonHP: 100
                },
                message: '巴尔召唤出扭曲的触手！'
            },
            {
                id: 'mana_rift',
                name: '法力裂隙',
                trigger: { type: 'cooldown', value: 12 },
                effect: {
                    drainMana: 0.5,  // 50% 当前法力
                    createVoid: true,
                    voidDuration: 8,
                    voidDamage: 20
                },
                message: '法力被吸入虚空！'
            },
            {
                id: 'clone',
                name: '分身术',
                trigger: { type: 'hp_threshold', value: 0.5 },
                effect: {
                    createClone: true,
                    cloneHP: 0.3  // 分身有30%主体血量
                },
                message: '巴尔创造了分身！'
            },
            {
                id: 'hoarfrost',
                name: '霜冻之握',
                trigger: { type: 'cooldown', value: 10 },
                effect: {
                    freezeArea: true,
                    radius: 200,
                    slowAmount: 0.7,
                    duration: 5
                },
                message: '寒冰蔓延！'
            }
        ],
        phases: [
            { hp: [1.0, 0.7], skills: ['mana_rift', 'hoarfrost'] },
            { hp: [0.7, 0.5], skills: ['mana_rift', 'hoarfrost', 'tentacle_summon'] },
            { hp: [0.5, 0.3], skills: 'all', trigger: 'clone' },
            { hp: [0.3, 0], skills: 'all', attackSpeed: 2.0, message: '巴尔释放全部力量！' }
        ]
    }
};

// BOSS技能系统
function updateBossSkills(boss, dt) {
    if (!boss.isBoss || !BOSS_SKILLS[boss.bossId]) return;

    const bossData = BOSS_SKILLS[boss.bossId];
    const currentPhase = getCurrentPhase(boss, bossData.phases);

    // 检查阶段转换
    if (currentPhase !== boss.currentPhase) {
        onPhaseChange(boss, currentPhase);
        boss.currentPhase = currentPhase;
    }

    // 更新技能冷却
    if (boss.skillCooldowns) {
        for (let skillId in boss.skillCooldowns) {
            if (boss.skillCooldowns[skillId] > 0) {
                boss.skillCooldowns[skillId] -= dt;
            }
        }
    }

    // 触发技能
    bossData.skills.forEach(skill => {
        if (shouldTriggerSkill(boss, skill)) {
            executeSkill(boss, skill);
        }
    });
}

// 判断是否触发技能
function shouldTriggerSkill(boss, skill) {
    if (skill.trigger.type === 'cooldown') {
        return boss.skillCooldowns[skill.id] <= 0;
    } else if (skill.trigger.type === 'hp_threshold') {
        const hpPercent = boss.hp / boss.maxHp;
        return hpPercent <= skill.trigger.value && !boss.triggeredSkills[skill.id];
    }
    return false;
}

// 执行技能
function executeSkill(boss, skill) {
    showNotification(skill.message);

    switch(skill.id) {
        case 'hook_throw':
            // 将玩家拉向BOSS
            const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
            player.x = boss.x + Math.cos(angle) * 50;
            player.y = boss.y + Math.sin(angle) * 50;
            player.hp -= skill.effect.damage;
            break;

        case 'whirlwind':
            // 旋风斩
            boss.spinning = true;
            boss.spinTimer = skill.effect.spinDuration;
            boss.spinDamage = skill.effect.spinDamage;
            boss.spinRadius = skill.effect.spinRadius;
            break;

        case 'lightning_inferno':
            // 创建闪电网格
            createLightningGrid(boss.x, boss.y, skill.effect);
            break;

        // ... 更多技能实现
    }

    // 设置冷却
    if (skill.trigger.type === 'cooldown') {
        boss.skillCooldowns[skill.id] = skill.trigger.value;
    } else if (skill.trigger.type === 'hp_threshold') {
        boss.triggeredSkills[skill.id] = true;
    }
}
```

**实现位置：**
- 新增 `BOSS_SKILLS` 配置对象
- 在 `updateEnemies()` 中添加BOSS技能更新逻辑
- 为每个技能实现特殊效果函数

---

## 📋 实现优先级总结

### 立即实现（核心体验提升）
1. ✅ 精英怪词缀系统
2. ✅ 抗性系统
3. ✅ 更丰富的装备词缀
4. ✅ 装备需求系统

### 中期实现（深度和可玩性）
5. 📋 套装系统
6. 📋 符文/镶嵌系统
7. 📋 难度系统
8. 📋 扩展技能树

### 后期实现（体验优化）
9. 📋 死亡惩罚
10. 📋 传送点系统
11. 📋 可破坏物品
12. 📋 更多怪物种类

### 增强实现（锦上添花）
13. 📋 BOSS技能系统

---

## 🎯 推荐实施顺序

1. **第一阶段**：实现抗性系统和装备词缀扩展（关联性强，一起做）
2. **第二阶段**：添加装备需求和精英怪词缀（让战斗更有挑战）
3. **第三阶段**：套装系统（收集目标）
4. **第四阶段**：难度系统（延长游戏寿命）
5. **第五阶段**：符文系统（深度玩法）
6. **第六阶段**：技能树扩展（多样化Build）
7. **第七阶段**：其他优化功能

---

**最关键的是前4项**，它们直接影响核心战斗体验和装备系统的深度，是暗黑2区别于其他ARPG的本质特征。实现这些后，游戏的策略深度和可玩性会有质的飞跃。
