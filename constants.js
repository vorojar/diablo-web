// ========== 全局常量定义 ==========
// 稀有度等级
const RARITY = {
    COMMON: 0,      // 普通(白)
    NORMAL: 1,      // 普通强化(白)
    MAGIC: 2,       // 魔法(蓝)
    RARE: 3,        // 稀有(黄)
    UNIQUE: 4,      // 暗金(金)
    SET: 5          // 套装(绿)
};

// 物品类型
const ITEM_TYPE = {
    WEAPON: 'weapon',
    ARMOR: 'armor',
    HELM: 'helm',
    BELT: 'belt',
    GLOVES: 'gloves',
    BOOTS: 'boots',
    RING: 'ring',
    AMULET: 'amulet',
    POTION: 'potion',
    SCROLL: 'scroll',
    GOLD: 'gold'
};

// 消耗品名称
const CONSUMABLE_NAME = {
    HEALTH_POTION: '治疗药剂',
    MANA_POTION: '法力药剂',
    TOWN_PORTAL: '回城卷轴'
};

// 工具函数：检查是否为受保护物品（不可丢弃）
function isProtectedItem(item) {
    if (!item) return false;
    return item.rarity >= RARITY.UNIQUE ||
        item.name === CONSUMABLE_NAME.HEALTH_POTION ||
        item.name === CONSUMABLE_NAME.MANA_POTION ||
        item.name === CONSUMABLE_NAME.TOWN_PORTAL;
}

const TILE_SIZE = 40;
const MAP_WIDTH = 80;
const MAP_HEIGHT = 80;

const COLORS = {
    // 基础颜色
    white: '#ffffff',
    blue: '#4850b8',
    yellow: '#ffff00',
    gold: '#908858',
    red: '#c23b22',
    green: '#00ff00',
    ice: '#00ccff',

    // 地图元素
    floor: '#0c0c0c',
    floorAlt: '#080808',
    wall: '#2C2C2C',
    townFloor: '#1a1a1a',
    exit: '#0055aa',
    entrance: '#aa5500',

    // 稀有度颜色（物品）
    rarityCommon: '#ffffff',     // 白色
    rarityMagic: '#4850b8',      // 蓝色
    rarityRare: '#ffff00',       // 黄色
    rarityUnique: '#908858',     // 暗金
    raritySet: '#20ff20',        // 套装绿

    // 战斗反馈
    damage: '#ff0000',           // 伤害数字
    critical: '#ffff00',         // 暴击
    heal: '#00ff00',             // 治疗
    thornsDamage: '#88ff88',     // 荆棘反伤
    manaCost: '#0066ff',         // 法力消耗
    revive: '#ff00ff',           // 复活

    // 提示/警告
    warning: '#ff4444',          // 警告（背包满等）
    error: '#ff0000',            // 错误
    success: '#00ff00',          // 成功
    info: '#4d94ff',             // 信息

    // 元素伤害
    fire: '#ff4400',             // 火焰
    lightning: '#ffff00',        // 闪电
    cold: '#00ccff',             // 冰霜
    poison: '#00ff00',           // 毒素

    // NPC/敌人
    npc: '#00ff00',              // NPC标记
    enemy: '#ff0000',            // 敌人
    boss: '#ff00ff',             // BOSS
    elite: '#ffaa00'             // 精英怪
};

// 工具函数：根据稀有度获取颜色
function getRarityColor(rarity) {
    const colorMap = {
        [RARITY.COMMON]: COLORS.rarityCommon,
        [RARITY.NORMAL]: COLORS.rarityCommon,
        [RARITY.MAGIC]: COLORS.rarityMagic,
        [RARITY.RARE]: COLORS.rarityRare,
        [RARITY.UNIQUE]: COLORS.rarityUnique,
        [RARITY.SET]: COLORS.raritySet
    };
    return colorMap[rarity] || COLORS.white;
}

// ========== 地牢层名称配置 ==========
const FLOOR_NAMES = {
    // 森林群系 (1-10层)
    forest: [
        '荒芜旷野',     // 1
        '黑暗丛林',     // 2
        '蜘蛛洞穴',     // 3
        '遗忘高塔',     // 4
        '腐败神殿',     // 5
        '毒沼深处',     // 6
        '枯木墓地',     // 7
        '古树之心',     // 8
        '德鲁伊圣所',   // 9
        '世界之树'      // 10
    ],
    // 冰原群系 (11-20层)
    ice: [
        '冰封山道',     // 11
        '霜狼巢穴',     // 12
        '冻结废墟',     // 13
        '寒冰墓穴',     // 14
        '暴风祭坛',     // 15
        '冰晶洞窟',     // 16
        '极寒深渊',     // 17
        '冰霜王座',     // 18
        '永冬神殿',     // 19
        '冰封圣殿'      // 20
    ],
    // 熔岩群系 (21+层，循环)
    fire: [
        '灼热裂隙',     // 21/31/41...
        '熔岩河谷',     // 22/32/42...
        '燃烧矿坑',     // 23/33/43...
        '烈焰祭坛',     // 24/34/44...
        '硫磺深渊',     // 25/35/45...
        '恶魔熔炉',     // 26/36/46...
        '毁灭圣堂',     // 27/37/47...
        '炼狱之心',     // 28/38/48...
        '混沌裂口',     // 29/39/49...
        '世界之石'      // 30/40/50...
    ],
    // 周目前缀 (21层后，每10层一个周目)
    cyclePrefix: ['', '深渊', '虚空', '永恒', '混沌', '末日']
};

// 获取层数对应的名称
function getFloorName(floor, isHell = false) {
    if (floor <= 0) return '罗格营地';

    // 地狱模式：统一用熔岩名称
    if (isHell) {
        const index = ((floor - 1) % 10);
        return `地狱·${FLOOR_NAMES.fire[index]}`;
    }

    // 森林群系 1-10
    if (floor <= 10) {
        return FLOOR_NAMES.forest[floor - 1];
    }

    // 冰原群系 11-20
    if (floor <= 20) {
        return FLOOR_NAMES.ice[floor - 11];
    }

    // 熔岩群系 21+（循环）
    const fireIndex = ((floor - 21) % 10);
    const cycle = Math.floor((floor - 21) / 10);  // 0=首次, 1=深渊, 2=虚空...
    const prefix = FLOOR_NAMES.cyclePrefix[Math.min(cycle, FLOOR_NAMES.cyclePrefix.length - 1)];

    if (prefix) {
        return `${prefix}·${FLOOR_NAMES.fire[fireIndex]}`;
    }
    return FLOOR_NAMES.fire[fireIndex];
}

// ========== 技能配置 ==========
const SKILL_CONFIG = {
    fireball: {
        baseMana: 10,
        manaPerLevel: 0,        // 固定消耗
        range: 450,
        cooldown: 0.5,
        explosionLevel: 5       // 5级解锁爆炸
    },
    thunder: {
        baseMana: 8,
        manaPerLevel: 0.5,
        range: 190,
        cooldown: 0.8
    },
    multishot: {
        baseMana: 10,
        manaPerLevel: 0,
        range: 500,
        cooldown: 1.0
    }
};

// 工具函数：计算技能法力消耗
function getSkillManaCost(skillName, level) {
    const config = SKILL_CONFIG[skillName];
    if (!config) return 10;
    return config.baseMana + (level - 1) * config.manaPerLevel;
}

// ========== 技能树配置 ==========
const SKILL_TREE = {
    fireball: {
        name: '火球术',
        key: 'Q',
        desc: '发射火球攻击敌人',
        stage2: {
            explosion: {
                name: '爆炸强化',
                desc: '爆炸范围+15%/级，爆炸伤害+8%/级',
                effect: { explosionRadius: 0.15, explosionDamage: 0.08 }
            },
            burn: {
                name: '灼烧',
                desc: '附加灼烧DOT，每秒6%伤害/级，持续2+0.4秒/级',
                effect: { burnDPS: 0.06, burnDuration: 0.4, burnBase: 2 }
            }
        },
        stage3: {
            explosion: {
                meteor: {
                    name: '陨石术',
                    desc: '火球变陨石，爆炸伤害+100%，落点燃烧3秒',
                    effect: { meteorMode: true, explosionBonus: 1.0, groundFire: 3 }
                },
                nova: {
                    name: '火焰新星',
                    desc: '释放时同时以自身为中心爆发火焰波',
                    effect: { novaMode: true, novaDamageRatio: 0.5, knockback: true }
                }
            },
            burn: {
                spread: {
                    name: '蔓延',
                    desc: '灼烧传染给周围敌人，传染伤害60%',
                    effect: { burnSpread: true, spreadRatio: 0.6 }
                },
                detonate: {
                    name: '焚尽',
                    desc: '灼烧中敌人受火伤+30%，灼烧结束时引爆',
                    effect: { burnAmplify: 0.3, burnDetonate: true }
                }
            }
        }
    },
    thunder: {
        name: '雷电术',
        key: 'W',
        desc: '召唤雷电打击敌人',
        stage2: {
            chain: {
                name: '连锁',
                desc: '弹射目标+1/级，弹射衰减-5%/级',
                effect: { chainTargets: 1, chainDecayReduce: 0.05 }
            },
            shock: {
                name: '感电',
                desc: '麻痹0.3+0.1秒/级，受雷伤+10%/级',
                effect: { stunBase: 0.3, stunPerLevel: 0.1, lightningAmp: 0.1 }
            }
        },
        stage3: {
            chain: {
                storm: {
                    name: '雷暴',
                    desc: '创造雷暴区域3秒，每0.5秒落雷，区域减速30%',
                    effect: { stormMode: true, stormDuration: 3, stormInterval: 0.5, slowAmount: 0.3 }
                },
                overload: {
                    name: '超载',
                    desc: '击杀时爆炸，爆炸=敌人10%最大生命',
                    effect: { killExplode: true, explodeHpRatio: 0.1 }
                }
            },
            shock: {
                torture: {
                    name: '电刑',
                    desc: '感电期间持续掉血，每秒=雷电伤害×20%',
                    effect: { shockDOT: true, shockDPS: 0.2 }
                },
                shield: {
                    name: '电弧护盾',
                    desc: '击中获得护盾=伤害×15%，护盾期间免控',
                    effect: { arcShield: true, shieldRatio: 0.15, immuneCC: true }
                }
            }
        }
    },
    multishot: {
        name: '多重射击',
        key: 'E',
        desc: '扇形发射多支箭矢',
        stage2: {
            pierce: {
                name: '穿透',
                desc: '穿透+1敌人/级，穿透衰减-4%/级',
                effect: { pierceTargets: 1, pierceDecayReduce: 0.04 }
            },
            spread: {
                name: '扩散',
                desc: '额外箭矢+1/级，扩散角+5°/级',
                effect: { extraArrows: 1, spreadAngle: 5 }
            }
        },
        stage3: {
            pierce: {
                rain: {
                    name: '箭雨',
                    desc: '箭矢飞行后分裂下落，覆盖范围伤害=单箭×60%',
                    effect: { rainMode: true, rainDamageRatio: 0.6 }
                },
                snipe: {
                    name: '狙击',
                    desc: '长按蓄力2秒，伤害+50%/秒，穿透+3',
                    effect: { snipeMode: true, chargeDamage: 0.5, chargeMaxTime: 2, chargePierce: 3 }
                }
            },
            spread: {
                barrage: {
                    name: '弹幕',
                    desc: '连发3波，间隔0.2秒，总伤害+80%',
                    effect: { barrageMode: true, barrageWaves: 3, barrageInterval: 0.2, barrageDamage: 0.8 }
                },
                split: {
                    name: '分裂箭',
                    desc: '箭矢飞行中分裂成2支，小箭伤害50%',
                    effect: { splitMode: true, splitCount: 2, splitDamage: 0.5 }
                }
            }
        }
    },
    holy_shield: {
        name: '神圣护盾',
        key: 'R',
        desc: '召唤神圣护盾吸收伤害',
        stage1: {
            manaCost: 15,
            cooldown: 12,
            shieldRatio: 0.20,
            shieldPerLevel: 0.02,
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
            reflect: {  // 反射护盾分支 - 进攻反击风格
                retribution: {
                    name: '惩戒光环',
                    desc: '脉冲伤害并减速周围敌人',
                    effect: { auraDamageRatio: 0.02, slowAmount: 0.15, pulseInterval: 2 }
                },
                fortress: {
                    name: '绝对防御',
                    desc: '免疫暴击，击杀回血',
                    effect: { critImmunity: true, lifestealRatio: 0.05 }
                }
            },
            guard: {  // 守护护盾分支 - 生存续航风格
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
};

// 技能树常量
const SKILL_TREE_MAX_LEVEL = 5;  // 每阶段最大等级

// 工具函数：获取技能总等级（用于兼容现有系统）
function getSkillTotalLevel(skillName) {
    if (!player.skillTree || !player.skillTree[skillName]) {
        return player.skills ? player.skills[skillName] || 0 : 0;
    }
    const tree = player.skillTree[skillName];
    return tree.stage1 + (tree.stage2.level || 0) + (tree.stage3.level || 0);
}

// 工具函数：检查阶段是否解锁
function isStageUnlocked(skillName, stage) {
    if (!player.skillTree || !player.skillTree[skillName]) return stage === 1;
    const tree = player.skillTree[skillName];
    if (stage === 1) return true;
    if (stage === 2) return tree.stage1 >= SKILL_TREE_MAX_LEVEL;
    if (stage === 3) return tree.stage2.level >= SKILL_TREE_MAX_LEVEL;
    return false;
}

// 工具函数：获取技能树效果加成
function getSkillTreeBonus(skillName) {
    const bonus = {};
    if (!player.skillTree || !player.skillTree[skillName]) return bonus;

    const tree = player.skillTree[skillName];
    const config = SKILL_TREE[skillName];
    if (!config) return bonus;

    // 阶段2加成
    if (tree.stage2.chosen && tree.stage2.level > 0) {
        const s2Config = config.stage2[tree.stage2.chosen];
        if (s2Config && s2Config.effect) {
            for (const key in s2Config.effect) {
                bonus[key] = s2Config.effect[key] * tree.stage2.level;
            }
        }
    }

    // 阶段3加成（固定效果，不按等级）
    if (tree.stage3.chosen && tree.stage3.level > 0) {
        const s2Choice = tree.stage2.chosen;
        const s3Config = config.stage3[s2Choice]?.[tree.stage3.chosen];
        if (s3Config && s3Config.effect) {
            for (const key in s3Config.effect) {
                // 阶段3是终极技能，等级只影响是否激活
                if (typeof s3Config.effect[key] === 'boolean') {
                    bonus[key] = s3Config.effect[key];
                } else {
                    bonus[key] = (bonus[key] || 0) + s3Config.effect[key] * tree.stage3.level;
                }
            }
        }
    }

    return bonus;
}

// ========== 游戏配置常量 ==========
const GAME_CONFIG = {
    // 怪物生成
    ELITE_SPAWN_RATE: 0.1,              // 精英怪生成概率 10%
    DOUBLE_AFFIX_RATE: 0.3,             // 双词缀概率 30%
    MAX_ENEMIES: 80,                    // 最大怪物数量（80x80地图）
    INITIAL_ENEMIES: 40,                // 进入楼层时初始生成数量（80x80地图）
    ENEMY_SPAWN_INTERVAL: 2000,         // 怪物生成间隔(ms)
    ENEMY_SPAWN_MIN_DISTANCE: 300,      // 怪物生成最小距离

    // 赌博概率
    GAMBLE_RARE_RATE: 0.3,              // 赌博稀有概率 30%
    GAMBLE_UNIQUE_RATE: 0.05,           // 赌博暗金概率 5%

    // 自动战斗阈值
    AUTO_POTION_HP_THRESHOLD: 0.3,      // 30%喝红药
    AUTO_POTION_MP_THRESHOLD: 0.2,      // 20%喝蓝药
    AUTO_EMERGENCY_HP: 0.15,            // 15%紧急回城
    AUTO_KEEP_DISTANCE: 150,            // 保持距离150

    // 怪物AI距离
    MONSTER_MELEE_RANGE: 30,            // 近战攻击距离
    MONSTER_RANGED_RETREAT: 150,        // 远程后退距离
    MONSTER_RANGED_MAX: 400,            // 远程最大攻击距离

    // 交互距离
    INTERACTION_RANGE: 60,              // 通用交互距离
    NPC_INTERACTION_RANGE: 80,          // NPC交互距离
    PORTAL_INTERACTION_RANGE: 60,       // 传送门交互距离

    // 拾取距离
    PICKUP_RANGE: 400,                  // 自动拾取检测距离
    PICKUP_MOVE_RANGE: 40,              // 拾取移动到物品距离

    // 自动存档
    AUTO_SAVE_INTERVAL: 30,             // 自动存档间隔(秒)

    // 物品消失时间
    ITEM_DESPAWN_SET: 10 * 60 * 1000,   // 套装物品10分钟
    ITEM_DESPAWN_UNIQUE: 3 * 60 * 1000, // 暗金物品3分钟
    ITEM_DESPAWN_RARE: 2 * 60 * 1000,   // 稀有物品2分钟
    ITEM_DESPAWN_COMMON: 1 * 60 * 1000, // 普通物品1分钟

    // 视觉效果
    LOW_HP_THRESHOLD: 0.2,              // 低血量警告阈值 20%
    CAMERA_SMOOTH: 0.1                  // 相机平滑系数
};

// ========== 天赋商店系统 ==========
// 天赋数据库 - 每层可购买的随机天赋
const TALENTS = {
    // 攻击类天赋
    flame_soul: {
        id: 'flame_soul',
        name: '烈焰之魂',
        icon: '🔥',
        desc: '攻击附带30%火焰伤害',
        tier: 'rare',      // normal/rare/epic/legendary
        price: 150,
        effect: { fireDmgPct: 30 }
    },
    thunder_chain: {
        id: 'thunder_chain',
        name: '连锁闪电',
        icon: '⚡',
        desc: '击杀敌人时电击周围敌人',
        tier: 'epic',
        price: 200,
        effect: { onKillChainLightning: true }
    },
    executioner: {
        id: 'executioner',
        name: '处刑者',
        icon: '💀',
        desc: '对低于30%血量敌人伤害+100%',
        tier: 'rare',
        price: 120,
        effect: { executeDmgPct: 100, executeThreshold: 0.3 }
    },
    berserker: {
        id: 'berserker',
        name: '狂战士',
        icon: '😡',
        desc: '伤害+50%，受到伤害+20%',
        tier: 'rare',
        price: 100,
        effect: { dmgPct: 50, damageTakenPct: 20 }
    },
    critical_master: {
        id: 'critical_master',
        name: '暴击大师',
        icon: '🎯',
        desc: '暴击率+15%，暴击伤害+30%',
        tier: 'epic',
        price: 180,
        effect: { critChance: 15, critDamage: 30 }
    },
    poison_blade: {
        id: 'poison_blade',
        name: '淬毒之刃',
        icon: '☠️',
        desc: '攻击附带25%毒素伤害',
        tier: 'rare',
        price: 140,
        effect: { poisonDmgPct: 25 }
    },

    // 防御类天赋
    iron_wall: {
        id: 'iron_wall',
        name: '铁壁',
        icon: '🛡️',
        desc: '+80防御，移速-10%',
        tier: 'normal',
        price: 80,
        effect: { def: 80, speedPct: -10 }
    },
    vampire: {
        id: 'vampire',
        name: '吸血鬼',
        icon: '🧛',
        desc: '生命偷取+8%',
        tier: 'rare',
        price: 130,
        effect: { lifeSteal: 8 }
    },
    regeneration: {
        id: 'regeneration',
        name: '再生',
        icon: '💚',
        desc: '每秒恢复2%最大生命值',
        tier: 'rare',
        price: 150,
        effect: { hpRegenPct: 2 }
    },
    elemental_shield: {
        id: 'elemental_shield',
        name: '元素护盾',
        icon: '🌈',
        desc: '所有抗性+25%',
        tier: 'epic',
        price: 200,
        effect: { allRes: 25 }
    },
    thorns: {
        id: 'thorns',
        name: '荆棘',
        icon: '🌵',
        desc: '反弹20%受到的伤害',
        tier: 'normal',
        price: 90,
        effect: { thornsPct: 20 }
    },

    // 功能类天赋
    magnet: {
        id: 'magnet',
        name: '磁铁',
        icon: '🧲',
        desc: '自动拾取范围翻倍',
        tier: 'normal',
        price: 50,
        effect: { pickupRange: 2 }
    },
    greed: {
        id: 'greed',
        name: '贪婪',
        icon: '💰',
        desc: '金币掉落+50%',
        tier: 'normal',
        price: 60,
        effect: { goldPct: 50 }
    },
    treasure_hunter: {
        id: 'treasure_hunter',
        name: '寻宝者',
        icon: '🗝️',
        desc: '装备掉落率+30%',
        tier: 'rare',
        price: 160,
        effect: { dropRatePct: 30 }
    },
    swift: {
        id: 'swift',
        name: '迅捷',
        icon: '💨',
        desc: '移动速度+25%',
        tier: 'normal',
        price: 70,
        effect: { speedPct: 25 }
    },
    mana_flow: {
        id: 'mana_flow',
        name: '法力涌动',
        icon: '🔮',
        desc: '最大法力+50，法力恢复+3%',
        tier: 'rare',
        price: 120,
        effect: { maxMp: 50, mpRegenPct: 3 }
    },

    // 特殊/传说天赋
    gambler: {
        id: 'gambler',
        name: '赌徒',
        icon: '🎰',
        desc: '伤害随机×0.5~×2.0',
        tier: 'epic',
        price: 100,
        effect: { gamblerDamage: true }
    },
    glass_cannon: {
        id: 'glass_cannon',
        name: '玻璃大炮',
        icon: '💣',
        desc: '伤害+100%，最大生命-30%',
        tier: 'legendary',
        price: 500,
        effect: { dmgPct: 100, maxHpPct: -30 }
    },
    phoenix: {
        id: 'phoenix',
        name: '凤凰',
        icon: '🔥',
        desc: '死亡时复活一次（50%生命）',
        tier: 'legendary',
        price: 1000,
        effect: { phoenixRevive: true }
    },
    bloodlust: {
        id: 'bloodlust',
        name: '嗜血',
        icon: '🩸',
        desc: '击杀敌人时恢复5%最大生命',
        tier: 'rare',
        price: 140,
        effect: { onKillHealPct: 5 }
    }
};

// 天赋稀有度价格倍率
const TALENT_TIER_MULT = {
    normal: 1,
    rare: 1,
    epic: 1,
    legendary: 1
};

// 天赋稀有度颜色
const TALENT_TIER_COLORS = {
    normal: '#ffffff',
    rare: '#4850b8',
    epic: '#a335ee',
    legendary: '#ff8000'
};

// ========== 称号系统 ==========
const TITLES = [
    { id: 'none', name: '无', price: 0, color: '#888888', style: 'normal' },
    { id: 'adventurer', name: '冒险者', price: 10000, color: '#ffffff', style: 'normal' },
    { id: 'elite_hunter', name: '精英猎人', price: 100000, color: '#4488ff', style: 'normal' },
    { id: 'hell_walker', name: '地狱行者', price: 1000000, color: '#ff6600', style: 'normal' },
    { id: 'golden_lord', name: '黄金领主', price: 10000000, color: '#ffd700', style: 'glow' },
    { id: 'billionaire', name: '亿万富翁', price: 100000000, color: 'rainbow', style: 'rainbow' },
    { id: 'legend', name: '不朽传奇', price: 500000000, color: '#a335ee', style: 'glow' }
];
