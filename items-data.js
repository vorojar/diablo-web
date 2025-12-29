// ========== 物品数据定义 ==========

const ITEM_TYPES = {
    WEAPON: { icon: '⚔️' }, ARMOR: { icon: '🛡️' }, RING: { icon: '💍' }, POTION: { icon: '🍷' }, SCROLL: { icon: '📜' },
    HELM: { icon: '🪖' }, GLOVES: { icon: '🧤' }, BOOTS: { icon: '👢' }, BELT: { icon: '🎗️' }, AMULET: { icon: '📿' }
};

// 难度系数配置
const DIFFICULTY_MODIFIERS = {
    normal: {
        monsterHpMult: 1,
        monsterDmgMult: 1,
        monsterSpeedMult: 1,
        xpMult: 1,
        dropQualityMult: 1
    },
    hell: {
        monsterHpMult: 6,
        monsterDmgMult: 4,
        monsterSpeedMult: 1.3,
        xpMult: 5,
        dropQualityMult: 3.5  // 150%提升 = 原250%
    }
};

const BASE_ITEMS = [
    { name: '短剑', type: 'weapon', minDmg: 2, maxDmg: 5, rarity: 1, icon: '🗡️' },
    { name: '巨斧', type: 'weapon', minDmg: 6, maxDmg: 14, rarity: 1, icon: '🪓' },
    { name: '布甲', type: 'armor', def: 5, rarity: 1, icon: '👕' },
    { name: '皮甲', type: 'armor', def: 12, rarity: 1, icon: '🦺' },
    { name: '板甲', type: 'armor', def: 25, rarity: 1, icon: '🛡️' },

    { name: '皮帽', type: 'helm', def: 3, rarity: 1, icon: '🧢' },
    { name: '全盔', type: 'helm', def: 8, rarity: 1, icon: '🪖' },

    { name: '皮手套', type: 'gloves', def: 2, rarity: 1, icon: '🧤' },
    { name: '重手套', type: 'gloves', def: 5, rarity: 1, icon: '🧤' },

    { name: '皮靴', type: 'boots', def: 2, rarity: 1, icon: '👢' },
    { name: '锁链靴', type: 'boots', def: 6, rarity: 1, icon: '👢' },

    { name: '轻扣带', type: 'belt', def: 2, rarity: 1, icon: '🎗️' },
    { name: '重腰带', type: 'belt', def: 5, rarity: 1, icon: '🥋' },

    { name: '铜戒指', type: 'ring', rarity: 1, icon: '💍' },
    { name: '护身符', type: 'amulet', rarity: 1, icon: '📿' },

    { name: '治疗药剂', type: 'potion', heal: 50, rarity: 0, stackable: true, icon: '🔴' },
    { name: '法力药剂', type: 'potion', mana: 30, rarity: 0, stackable: true, icon: '🔵' },
    { name: '回城卷轴', type: 'scroll', rarity: 0, stackable: true, icon: '📜' }
];

// 装备词缀系统
const AFFIXES = {
    prefixes: [
        // 基础属性
        { name: '残忍的', stat: 'dmgPct', min: 10, max: 30 },
        { name: '野蛮的', stat: 'dmgPct', min: 15, max: 40 },
        { name: '坚固的', stat: 'def', min: 5, max: 15 },
        { name: '吸血的', stat: 'lifeSteal', min: 3, max: 5 },
        { name: '急速的', stat: 'attackSpeed', min: 5, max: 15 },
        // 抗性类
        { name: '烈焰之', stat: 'fireRes', min: 15, max: 30 },
        { name: '冰霜之', stat: 'coldRes', min: 15, max: 30 },
        { name: '闪电之', stat: 'lightningRes', min: 15, max: 30 },
        { name: '剧毒之', stat: 'poisonRes', min: 15, max: 30 },
        { name: '全能之', stat: 'allRes', min: 8, max: 15 },
        // 元素伤害
        { name: '燃烧的', stat: 'fireDmg', min: 5, max: 20 },
        { name: '雷电的', stat: 'lightningDmg', min: 5, max: 20 },
        { name: '剧毒的', stat: 'poisonDmg', min: 10, max: 40 },
        // 特殊效果
        { name: '穿刺的', stat: 'armorPierce', min: 10, max: 25 },
        { name: '击退的', stat: 'knockback', min: 20, max: 40 },
        { name: '减速的', stat: 'slow', min: 25, max: 50 },
        { name: '致命的', stat: 'critDamage', min: 30, max: 80 },
        { name: '连击的', stat: 'doubleHit', min: 10, max: 20 }
    ],
    suffixes: [
        // 基础属性（已转换为直接效果）
        { name: '之熊', stat: 'maxHp', min: 25, max: 50 },
        { name: '之鹰', stat: 'critChance', min: 3, max: 5 },
        { name: '之吸血', stat: 'lifeSteal', min: 3, max: 6 },
        { name: '之急速', stat: 'attackSpeed', min: 5, max: 10 },
        { name: '之力量', stat: 'dmgPct', min: 15, max: 30 },
        // 抗性类
        { name: '之抗火', stat: 'fireRes', min: 10, max: 25 },
        { name: '之抗冰', stat: 'coldRes', min: 10, max: 25 },
        { name: '之抗电', stat: 'lightningRes', min: 10, max: 25 },
        { name: '之抗毒', stat: 'poisonRes', min: 10, max: 25 },
        { name: '之守护', stat: 'allRes', min: 5, max: 12 },
        // 特殊效果
        { name: '之再生', stat: 'hpRegen', min: 3, max: 10 },
        { name: '之冥想', stat: 'mpRegen', min: 3, max: 10 },  // 改为百分比（从30-100降到3-10%）
        { name: '之格挡', stat: 'blockChance', min: 10, max: 25 },
        { name: '之反射', stat: 'reflectDamage', min: 5, max: 15 },
        { name: '之神速', stat: 'attackSpeed', min: 10, max: 20 },
        { name: '之铁壁', stat: 'damageReduction', min: 3, max: 10 },
        { name: '之精准', stat: 'attackRating', min: 50, max: 150 },
        { name: '之幸运', stat: 'magicFind', min: 10, max: 30 }
    ]
};
