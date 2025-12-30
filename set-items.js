// ========== 套装系统数据库 ==========
const SET_ITEMS = {
    'tals_set': {
        name: "塔拉夏的外袍",
        description: "法师专属套装，强化火焰技能",
        pieces: {
            helm: {
                name: "塔拉夏的守护",
                icon: '🪖',
                type: 'helm',
                def: 15,
                stats: { maxMp: 30, mpRegen: 5, allRes: 10 }  // mpRegen改为百分比
            },
            body: {
                name: "塔拉夏的外袍",
                icon: '🛡️',
                type: 'armor',
                def: 120,
                stats: { maxHp: 50, maxMp: 45, allRes: 15 }
            },
            amulet: {
                name: "塔拉夏的裁决",
                icon: '📿',
                type: 'amulet',
                stats: { maxMp: 45, fireDmg: 25, lightningDmg: 25 }
            },
            mainhand: {
                name: "塔拉夏的永恒权杖",
                icon: '⚔️',
                type: 'weapon',
                minDmg: 15,
                maxDmg: 35,
                stats: { maxMp: 60, fireDmg: 40 }
            },
            belt: {
                name: "塔拉夏的束带",
                icon: '🎗️',
                type: 'belt',
                def: 10,
                stats: { maxMp: 60, fireDmg: 15 }
            },
            gloves: {
                name: "塔拉夏的灵巧",
                icon: '🧤',
                type: 'gloves',
                def: 8,
                stats: { maxMp: 36, attackSpeed: 20, lightningDmg: 20 }
            }
        },
        bonuses: {
            2: {
                desc: "+50 全抗性",
                stats: { allRes: 50 }
            },
            4: {
                desc: "法力恢复速度 +10%，最大法力 +60",
                stats: { mpRegen: 10, maxMp: 60 }  // 从100%降到10%
            },
            6: {
                desc: "火焰伤害 +200，法力回复 +5%，暴击率 +10%",
                stats: { fireDmg: 200, mpRegen: 5, critChance: 10 }  // 从50%降到5%
            }
        }
    },

    'immortal_king': {
        name: "不朽之王",
        description: "战士专属套装，强化物理攻击",
        pieces: {
            helm: {
                name: "不朽之王的意志",
                icon: '🪖',
                type: 'helm',
                def: 20,
                stats: { dmgPct: 50, maxHp: 50 }
            },
            body: {
                name: "不朽之王的灵魂牢笼",
                icon: '🛡️',
                type: 'armor',
                def: 200,
                stats: { dmgPct: 75, maxHp: 100, def: 50 }
            },
            boots: {
                name: "不朽之王的践踏",
                icon: '👢',
                type: 'boots',
                def: 15,
                stats: { dmgPct: 50, maxHp: 50 }
            },
            mainhand: {
                name: "不朽之王的石碎器",
                icon: '🪓',
                type: 'weapon',
                minDmg: 30,
                maxDmg: 60,
                stats: { dmgPct: 175 }
            },
            belt: {
                name: "不朽之王的细节",
                icon: '🥋',
                type: 'belt',
                def: 18,
                stats: { dmgPct: 60, maxHp: 75, def: 25 }
            },
            gloves: {
                name: "不朽之王的钢铁之握",
                icon: '🧤',
                type: 'gloves',
                def: 12,
                stats: { dmgPct: 105, attackSpeed: 15 }
            }
        },
        bonuses: {
            2: {
                desc: "+100 最大生命",
                stats: { maxHp: 100 }
            },
            4: {
                desc: "生命偷取 +10%，攻击速度 +30%",
                stats: { lifeSteal: 10, attackSpeed: 30 }
            },
            6: {
                desc: "物理伤害 +450%，防御 +150",
                stats: { dmgPct: 450, def: 150 }
            }
        }
    },

    'shadow_dancer': {
        name: "暗影舞者",
        description: "刺客专属套装，强化暴击和攻速",
        pieces: {
            helm: {
                name: "暗影舞者的面罩",
                icon: '🪖',
                type: 'helm',
                def: 27,
                stats: { critChance: 8, attackSpeed: 10 }
            },
            body: {
                name: "暗影舞者的披风",
                icon: '🛡️',
                type: 'armor',
                def: 100,
                stats: { critChance: 10, attackSpeed: 15 }
            },
            gloves: {
                name: "暗影舞者的利爪",
                icon: '🧤',
                type: 'gloves',
                def: 23,
                stats: { critChance: 8, attackSpeed: 20 }
            },
            boots: {
                name: "暗影舞者的迅捷",
                icon: '👢',
                type: 'boots',
                def: 25,
                stats: { critChance: 8, attackSpeed: 15 }
            },
            belt: {
                name: "暗影舞者的束缚",
                icon: '🎗️',
                type: 'belt',
                def: 21,
                stats: { critChance: 6, attackSpeed: 12, critDamage: 20 }
            },
            amulet: {
                name: "暗影舞者的徽记",
                icon: '📿',
                type: 'amulet',
                stats: { critChance: 9, critDamage: 30, dmgPct: 25 }
            }
        },
        bonuses: {
            2: {
                desc: "攻击速度 +30%",
                stats: { attackSpeed: 30 }
            },
            4: {
                desc: "暴击伤害 +75%，暴击率 +10%",
                stats: { critDamage: 75, critChance: 10 }
            },
            6: {
                desc: "暴击率 +20%，伤害 +150%，防御 +40",
                stats: { critChance: 35, dmgPct: 150, def: 40 }
            }
        }
    },

    // ========== 新增套装 v4.1 ==========

    'natalya': {
        name: "娜塔亚的复仇",
        description: "亚马逊套装，强化弓箭和闪电",
        pieces: {
            helm: {
                name: "娜塔亚的凝视",
                icon: '🪖',
                type: 'helm',
                def: 18,
                stats: { lightningDmg: 30, critChance: 5 }
            },
            body: {
                name: "娜塔亚的影甲",
                icon: '🛡️',
                type: 'armor',
                def: 85,
                stats: { lightningDmg: 45, def: 30, allRes: 15 }
            },
            gloves: {
                name: "娜塔亚的触感",
                icon: '🧤',
                type: 'gloves',
                def: 10,
                stats: { lightningDmg: 35, attackSpeed: 25 }
            },
            boots: {
                name: "娜塔亚的灵魂",
                icon: '👢',
                type: 'boots',
                def: 12,
                stats: { lightningDmg: 25, critChance: 6 }
            },
            ring: {
                name: "娜塔亚的印记",
                icon: '💍',
                type: 'ring',
                stats: { lightningDmg: 40, dmgPct: 30 }
            },
            mainhand: {
                name: "娜塔亚的锋刃",
                icon: '🗡️',
                type: 'weapon',
                minDmg: 20,
                maxDmg: 45,
                stats: { lightningDmg: 60, critChance: 8 }
            }
        },
        bonuses: {
            2: {
                desc: "闪电伤害 +80",
                stats: { lightningDmg: 80 }
            },
            4: {
                desc: "攻击速度 +40%，暴击率 +12%",
                stats: { attackSpeed: 40, critChance: 12 }
            },
            6: {
                desc: "闪电伤害 +250，多重射击伤害 +100%",
                stats: { lightningDmg: 250, dmgPct: 200 }
            }
        }
    },

    'griswold': {
        name: "格里斯沃尔德的传承",
        description: "圣骑士套装，强化防御和神圣",
        pieces: {
            helm: {
                name: "格里斯沃尔德的荣耀",
                icon: '🪖',
                type: 'helm',
                def: 35,
                stats: { def: 40, maxHp: 60, allRes: 20 }
            },
            body: {
                name: "格里斯沃尔德的圣铠",
                icon: '🛡️',
                type: 'armor',
                def: 250,
                stats: { def: 80, maxHp: 120, allRes: 30 }
            },
            gloves: {
                name: "格里斯沃尔德的圣手",
                icon: '🧤',
                type: 'gloves',
                def: 20,
                stats: { def: 25, dmgPct: 40, lifeSteal: 3 }
            },
            boots: {
                name: "格里斯沃尔德的坚毅",
                icon: '👢',
                type: 'boots',
                def: 22,
                stats: { def: 30, maxHp: 50 }
            },
            mainhand: {
                name: "格里斯沃尔德的救赎",
                icon: '⚔️',
                type: 'weapon',
                minDmg: 25,
                maxDmg: 50,
                stats: { dmgPct: 80, def: 35, lifeSteal: 5 }
            },
            amulet: {
                name: "格里斯沃尔德的圣符",
                icon: '📿',
                type: 'amulet',
                stats: { allRes: 40, maxHp: 80, def: 20 }
            }
        },
        bonuses: {
            2: {
                desc: "防御 +120，全抗性 +30",
                stats: { def: 120, allRes: 30 }
            },
            4: {
                desc: "最大生命 +200，生命偷取 +8%",
                stats: { maxHp: 200, lifeSteal: 8 }
            },
            6: {
                desc: "伤害 +300%，受到伤害减少20%",
                stats: { dmgPct: 300, def: 200 }
            }
        }
    },

    'trang_oul': {
        name: "庄·欧的化身",
        description: "死灵法师套装，强化毒素和召唤",
        pieces: {
            helm: {
                name: "庄·欧的面甲",
                icon: '🪖',
                type: 'helm',
                def: 16,
                stats: { poisonDmg: 35, maxMp: 40 }
            },
            body: {
                name: "庄·欧的圣甲",
                icon: '🛡️',
                type: 'armor',
                def: 90,
                stats: { poisonDmg: 55, maxMp: 60, allRes: 20 }
            },
            gloves: {
                name: "庄·欧的利爪",
                icon: '🧤',
                type: 'gloves',
                def: 9,
                stats: { poisonDmg: 40, coldDmg: 25 }
            },
            boots: {
                name: "庄·欧的鳞靴",
                icon: '👢',
                type: 'boots',
                def: 11,
                stats: { poisonDmg: 30, maxMp: 35 }
            },
            belt: {
                name: "庄·欧的腰带",
                icon: '🎗️',
                type: 'belt',
                def: 8,
                stats: { poisonDmg: 45, mpRegen: 5 }  // mpRegen改为百分比
            },
            mainhand: {
                name: "庄·欧的权杖",
                icon: '⚔️',
                type: 'weapon',
                minDmg: 18,
                maxDmg: 38,
                stats: { poisonDmg: 80, maxMp: 50 }
            }
        },
        bonuses: {
            2: {
                desc: "毒素伤害 +100",
                stats: { poisonDmg: 100 }
            },
            4: {
                desc: "法力回复 +15%，最大法力 +100",
                stats: { mpRegen: 15, maxMp: 100 }  // 从150%降到15%
            },
            6: {
                desc: "毒素伤害 +300，敌人中毒持续时间翻倍",
                stats: { poisonDmg: 300, dmgPct: 100 }
            }
        }
    },

    'aldur': {
        name: "奥杜尔的节拍",
        description: "德鲁伊套装，强化自然和生命恢复",
        pieces: {
            helm: {
                name: "奥杜尔的凝视",
                icon: '🪖',
                type: 'helm',
                def: 22,
                stats: { maxHp: 80, hpRegen: 20 }
            },
            body: {
                name: "奥杜尔的驱邪铠",
                icon: '🛡️',
                type: 'armor',
                def: 130,
                stats: { maxHp: 150, hpRegen: 35, allRes: 25 }
            },
            boots: {
                name: "奥杜尔的前进",
                icon: '👢',
                type: 'boots',
                def: 18,
                stats: { maxHp: 60, hpRegen: 15, def: 20 }
            },
            mainhand: {
                name: "奥杜尔的节律",
                icon: '🪓',
                type: 'weapon',
                minDmg: 22,
                maxDmg: 48,
                stats: { dmgPct: 100, hpRegen: 25, lifeSteal: 6 }
            },
            gloves: {
                name: "奥杜尔的蛮力",
                icon: '🧤',
                type: 'gloves',
                def: 14,
                stats: { dmgPct: 50, maxHp: 50, hpRegen: 10 }
            },
            ring: {
                name: "奥杜尔的命运",
                icon: '💍',
                type: 'ring',
                stats: { maxHp: 70, hpRegen: 30, allRes: 15 }
            }
        },
        bonuses: {
            2: {
                desc: "生命恢复 +50/秒，最大生命 +100",
                stats: { hpRegen: 50, maxHp: 100 }
            },
            4: {
                desc: "生命偷取 +12%，全抗性 +50",
                stats: { lifeSteal: 12, allRes: 50 }
            },
            6: {
                desc: "最大生命 +400，伤害 +200%",
                stats: { maxHp: 400, dmgPct: 200 }
            }
        }
    },

    'mavina': {
        name: "马维娜的战斗颂歌",
        description: "狂战套装，强化狂暴和双倍伤害",
        pieces: {
            helm: {
                name: "马维娜的真面目",
                icon: '🪖',
                type: 'helm',
                def: 25,
                stats: { dmgPct: 60, critDamage: 25 }
            },
            body: {
                name: "马维娜的怀抱",
                icon: '🛡️',
                type: 'armor',
                def: 110,
                stats: { dmgPct: 90, attackSpeed: 20 }
            },
            gloves: {
                name: "马维娜的紧握",
                icon: '🧤',
                type: 'gloves',
                def: 15,
                stats: { dmgPct: 55, critDamage: 30, attackSpeed: 15 }
            },
            boots: {
                name: "马维娜的跟腱",
                icon: '👢',
                type: 'boots',
                def: 17,
                stats: { dmgPct: 45, attackSpeed: 10 }
            },
            belt: {
                name: "马维娜的束腰",
                icon: '🎗️',
                type: 'belt',
                def: 13,
                stats: { dmgPct: 50, maxHp: 40 }
            },
            mainhand: {
                name: "马维娜的弯弓",
                icon: '🏹',
                type: 'weapon',
                minDmg: 28,
                maxDmg: 55,
                stats: { dmgPct: 120, critDamage: 40 }
            }
        },
        bonuses: {
            2: {
                desc: "伤害 +100%",
                stats: { dmgPct: 100 }
            },
            4: {
                desc: "暴击伤害 +100%，攻击速度 +35%",
                stats: { critDamage: 100, attackSpeed: 35 }
            },
            6: {
                desc: "伤害 +400%，暴击率 +25%",
                stats: { dmgPct: 400, critChance: 25 }
            }
        }
    },

    'sigon': {
        name: "希冈的钢铁",
        description: "混沌套装，全属性均衡提升",
        pieces: {
            helm: {
                name: "希冈的护面",
                icon: '🪖',
                type: 'helm',
                def: 20,
                stats: { maxHp: 40, maxMp: 30, def: 15 }
            },
            body: {
                name: "希冈的铁甲",
                icon: '🛡️',
                type: 'armor',
                def: 140,
                stats: { maxHp: 80, def: 50, allRes: 20 }
            },
            gloves: {
                name: "希冈的铁手",
                icon: '🧤',
                type: 'gloves',
                def: 12,
                stats: { dmgPct: 35, attackSpeed: 15, critChance: 5 }
            },
            boots: {
                name: "希冈的军靴",
                icon: '👢',
                type: 'boots',
                def: 14,
                stats: { maxHp: 35, def: 20, allRes: 10 }
            },
            belt: {
                name: "希冈的腰带",
                icon: '🥋',
                type: 'belt',
                def: 10,
                stats: { maxHp: 50, maxMp: 40, lifeSteal: 4 }
            },
            amulet: {
                name: "希冈的徽章",
                icon: '📿',
                type: 'amulet',
                stats: { dmgPct: 40, critChance: 6, allRes: 25 }
            }
        },
        bonuses: {
            2: {
                desc: "全属性 +50 (HP/MP/防御)",
                stats: { maxHp: 50, maxMp: 50, def: 50 }
            },
            4: {
                desc: "伤害 +150%，全抗性 +40",
                stats: { dmgPct: 150, allRes: 40 }
            },
            6: {
                desc: "全属性大幅提升",
                stats: { maxHp: 200, maxMp: 100, def: 100, dmgPct: 250, critChance: 15 }
            }
        }
    },

    // ========== 深渊挑战专属套装 ==========
    'abyss_conqueror': {
        name: "深渊征服者",
        description: "深渊挑战专属套装，只有周榜前列才能获得",
        pieces: {
            helm: {
                name: "深渊征服者的冠冕",
                icon: '👑',
                type: 'helm',
                def: 45,
                stats: { dmgPct: 100, maxHp: 100, allRes: 30 }
            },
            body: {
                name: "深渊征服者的战甲",
                icon: '🛡️',
                type: 'armor',
                def: 280,
                stats: { dmgPct: 150, maxHp: 200, def: 80, allRes: 40 }
            },
            gloves: {
                name: "深渊征服者的铁拳",
                icon: '🧤',
                type: 'gloves',
                def: 28,
                stats: { dmgPct: 80, critChance: 12, attackSpeed: 25 }
            },
            boots: {
                name: "深渊征服者的践踏",
                icon: '👢',
                type: 'boots',
                def: 30,
                stats: { dmgPct: 70, maxHp: 80, def: 40 }
            },
            belt: {
                name: "深渊征服者的束缚",
                icon: '🎗️',
                type: 'belt',
                def: 22,
                stats: { dmgPct: 60, maxHp: 60, lifeSteal: 8 }
            },
            amulet: {
                name: "深渊征服者的徽记",
                icon: '📿',
                type: 'amulet',
                stats: { dmgPct: 120, critChance: 15, critDamage: 50 }
            }
        },
        bonuses: {
            2: {
                desc: "伤害 +200%，全抗性 +50",
                stats: { dmgPct: 200, allRes: 50 }
            },
            4: {
                desc: "暴击率 +20%，生命偷取 +15%",
                stats: { critChance: 20, lifeSteal: 15 }
            },
            6: {
                desc: "伤害 +500%，最大生命 +500，攻速 +50%",
                stats: { dmgPct: 500, maxHp: 500, attackSpeed: 50 }
            }
        }
    }
};
