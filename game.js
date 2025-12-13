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

// 工具函数：检查是否在城镇
function isInTown() {
    return player.floor === 0 && !player.isInHell;
}

// 统计追踪：添加金币并更新统计
function addGold(amount) {
    player.gold += amount;
    player.stats.totalGold += amount;
    // 更新单次最高金币
    if (player.gold > player.personalBest.maxGold) {
        player.personalBest.maxGold = player.gold;
    }
}

// 统计追踪：更新个人最佳记录
function updatePersonalBest() {
    if (player.lvl > player.personalBest.maxLevel) {
        player.personalBest.maxLevel = player.lvl;
    }
    if (!player.isInHell && player.floor > player.personalBest.maxFloor) {
        player.personalBest.maxFloor = player.floor;
    }
    if (player.isInHell && player.hellFloor > player.personalBest.maxHellFloor) {
        player.personalBest.maxHellFloor = player.hellFloor;
    }
    if (player.kills > player.personalBest.maxKills) {
        player.personalBest.maxKills = player.kills;
    }
}

// 统计追踪：记录稀有物品发现
function trackItemFound(item) {
    if (!item) return;
    if (item.rarity === RARITY.UNIQUE) {
        player.stats.uniqueFound++;
    } else if (item.rarity === RARITY.SET) {
        player.stats.setFound++;
    }
}

// 面板管理系统
const panelManager = {
    panels: {
        'stats': { id: 'stats-panel', group: 'left', top: 10, baseTop: 10, opened: false, zIndex: 0 },
        'achievements': { id: 'achievements-panel', group: 'left', top: 10, baseTop: 10, opened: false, zIndex: 0 },
        'quest': { id: 'quest-panel', group: 'left', top: 15, baseTop: 15, opened: false, zIndex: 0 },
        'inventory': { id: 'inventory-panel', group: 'right', top: 10, baseTop: 10, opened: false, zIndex: 0 },
        'stash': { id: 'stash-panel', group: 'right', top: 15, baseTop: 15, opened: false, zIndex: 0 },
        'skills': { id: 'skills-panel', group: 'center', top: 15, baseTop: 15, opened: false, zIndex: 0, left: 340 },
        'shop': { id: 'shop-panel', group: 'center', top: 10, baseTop: 10, opened: false, zIndex: 0 },
        'blacksmith': { id: 'blacksmith-panel', group: 'center', top: 15, baseTop: 15, opened: false, zIndex: 0 },
        'auto-battle': { id: 'auto-battle-panel', group: 'right', top: 10, baseTop: 10, opened: false, zIndex: 0 }
    },
    maxZIndex: 100,

    // 动态计算面板位置
    calculatePosition(panelId) {
        const panel = this.panels[panelId];
        const element = document.getElementById(panel.id);

        // 计算同组中已打开面板的数量
        const openedInGroup = Object.values(this.panels).filter(
            p => p.group === panel.group && p.opened && p.id !== panel.id
        ).length;

        // 根据同组打开面板数量动态调整位置
        const offset = openedInGroup * 8; // 每个面板错开8%
        const newTop = panel.baseTop + offset;

        element.style.top = newTop + '%';

        // 对于中间组的面板,水平错开
        if (panel.group === 'center' && panel.left) {
            const centerOffset = (openedInGroup % 2) * 50 - 25; // 左右错开
            element.style.left = (panel.left + centerOffset) + 'px';
        }

        return newTop;
    },

    // 设置面板在最上层
    bringToFront(panelId) {
        const panel = this.panels[panelId];
        const element = document.getElementById(panel.id);

        this.maxZIndex += 10;
        panel.zIndex = this.maxZIndex;
        element.style.zIndex = this.maxZIndex;
    },

    // 打开面板
    open(panelId) {
        const panel = this.panels[panelId];
        panel.opened = true;
        this.calculatePosition(panelId);
        this.bringToFront(panelId);
    },

    // 关闭面板
    close(panelId) {
        const panel = this.panels[panelId];
        panel.opened = false;
        panel.zIndex = 0;
    }
};

// 检查是否有任何重要面板打开（排除自动战斗设置面板）
function isAnyPanelOpen() {
    return Object.entries(panelManager.panels).some(
        ([key, p]) => p.opened && key !== 'auto-battle'
    );
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const miniCtx = miniCanvas.getContext('2d');

const TILE_SIZE = 40;
const MAP_WIDTH = 64;
const MAP_HEIGHT = 64;

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

// ========== 游戏配置常量 ==========
const GAME_CONFIG = {
    // 怪物生成
    ELITE_SPAWN_RATE: 0.1,              // 精英怪生成概率 10%
    DOUBLE_AFFIX_RATE: 0.3,             // 双词缀概率 30%
    MAX_ENEMIES: 20,                    // 最大怪物数量
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
    ITEM_DESPAWN_RARE: 5 * 60 * 1000,   // 稀有物品5分钟
    ITEM_DESPAWN_COMMON: 2 * 60 * 1000, // 普通物品2分钟

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
        desc: '最大法力+50，法力恢复+10%',
        tier: 'rare',
        price: 120,
        effect: { maxMp: 50, mpRegenPct: 10 }  // 从50%降到10%
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

let gameActive = false;
let lastTime = 0;
let particles = [];
let damageNumbers = [];
let slashEffects = [];
let enemies = [];
let groundItems = [];
let projectiles = [];
let npcs = [];

// 敌人对象池系统 - 复用对象减少GC压力
const EnemyPool = {
    pool: [],           // 可复用的敌人对象
    maxPoolSize: 100,   // 池最大容量

    // 从池中获取或创建新敌人对象
    acquire(props) {
        let enemy;
        if (this.pool.length > 0) {
            enemy = this.pool.pop();
        } else {
            enemy = {};
        }
        // 重置所有属性
        Object.assign(enemy, {
            x: 0, y: 0, hp: 0, maxHp: 0, dmg: 0, speed: 0, radius: 12,
            dead: false, cooldown: 0, name: '', rarity: 0, xpValue: 0,
            frameIndex: 0, ai: 'chase', isBoss: false, isQuestTarget: false,
            eliteAffixes: null, frozenTimer: 0, damageReduction: 0,
            ...props
        });
        return enemy;
    },

    // 回收敌人对象到池中
    release(enemy) {
        if (this.pool.length < this.maxPoolSize) {
            // 清理引用防止内存泄漏
            enemy.eliteAffixes = null;
            this.pool.push(enemy);
        }
    },

    // 获取池状态（调试用，控制台输入 EnemyPool.getStats() 查看）
    getStats() {
        const alive = enemies.filter(e => !e.dead).length;
        const dead = enemies.filter(e => e.dead).length;
        return {
            poolSize: this.pool.length,      // 对象池中可复用的对象数
            totalInArray: enemies.length,    // 数组中总敌人数
            aliveEnemies: alive,             // 活着的敌人数
            deadBodies: dead,                // 尸体数（等待回收）
            reuseRate: this.pool.length > 0 ? '对象池有效' : '池为空'
        };
    }
};
let autoSaveTimer = 0;
let cleanupTimer = 0;
let isAltPressed = false;

let mapData = [];
let visitedMap = [];
let dungeonExit = { x: 0, y: 0 };
let dungeonEntrance = { x: 0, y: 0 };
let townPortal = null;
let interactionTarget = null;

const mouse = { x: 0, y: 0, worldX: 0, worldY: 0, leftDown: false, rightDown: false };
const camera = { x: 0, y: 0 };

// Settings
const Settings = { bgm: true, sfx: true };

const QUEST_DB = [
    { id: 0, title: '邪恶洞窟', desc: '清除地牢第1层的 10 只怪物。', type: 'kill_count', target: 10, floor: 1, reward: '1 技能点' },
    { id: 1, title: '埋骨之地', desc: '在地牢第2层击杀精英怪"血鸟"。', type: 'kill_elite', targetName: '血鸟', floor: 2, reward: '稀有戒指' },
    { id: 2, title: '黑色荒地', desc: '在地牢第3层击杀 15 只怪物。', type: 'kill_count', target: 15, floor: 3, reward: '500 金币' },
    { id: 3, title: '遗忘之塔', desc: '在地牢第4层击杀"女伯爵"。', type: 'kill_elite', targetName: '女伯爵', floor: 4, reward: '随机符文' },
    { id: 4, title: '屠夫的末日', desc: '在地牢第5层击杀屠夫。', type: 'kill_boss', targetName: '屠夫', floor: 5, reward: '暗金装备' },
    { id: 5, title: '蜘蛛森林', desc: '清除地牢第6层的 20 只怪物。', type: 'kill_count', target: 20, floor: 6, reward: '2 技能点' },
    { id: 6, title: '剥皮丛林', desc: '在地牢第7层击杀精英怪"树头木拳"。', type: 'kill_elite', targetName: '树头木拳', floor: 7, reward: '暗金饰品' },
    { id: 7, title: '憎恨囚牢', desc: '在地牢第8层击杀 25 只怪物。', type: 'kill_count', target: 25, floor: 8, reward: '1000 金币' },
    { id: 8, title: '混沌避难所', desc: '在地牢第9层击杀"暗黑破坏神"。', type: 'kill_elite', targetName: '暗黑破坏神', floor: 9, reward: '传奇装备' },
    { id: 9, title: '世界之石要塞', desc: '在地牢第10层击败巴尔，拯救世界。', type: 'kill_boss', targetName: '巴尔', floor: 10, reward: '终极神装' }
];

// 获取当前或指定索引的任务（支持无限任务）
function getCurrentQuest(index) {
    const idx = (index !== undefined) ? index : player.questIndex;

    // 1. 经典任务 (0-9)
    if (idx < QUEST_DB.length) {
        return QUEST_DB[idx];
    }

    // 2. 无限任务生成 (10+)
    const currentFloor = idx + 1;
    const isBossLevel = (currentFloor % 10 === 0) || (currentFloor % 5 === 0); // 每5层/10层特殊

    // 奖励计算
    let rewardGold = Math.floor(currentFloor * 150 * (1 + Math.random() * 0.2));
    let rewardStr = `${rewardGold} 金币`;

    // 每10层奖励技能点
    if (currentFloor % 10 === 0) {
        rewardStr += " & 1 技能点";
    }
    // Boss层额外奖励装备
    if (isBossLevel) {
        rewardStr += " & 随机装备";
    }

    if (isBossLevel) {
        // Boss任务
        // 简化的Boss名称逻辑
        const bossPool = ['血鸟', '女伯爵', '屠夫', '树头木拳', '暗黑破坏神', '巴尔'];
        const bossName = bossPool[Math.floor(currentFloor / 10) % bossPool.length] || '精英守卫';
        const isTrueBoss = (currentFloor % 10 === 0);

        return {
            id: idx,
            title: `第 ${currentFloor} 层：${isTrueBoss ? '首领挑战' : '精英狩猎'}`,
            desc: `前往地牢第 ${currentFloor} 层，击败强大的 ${bossName}。`,
            type: isTrueBoss ? 'kill_boss' : 'kill_elite',
            targetName: bossName,
            floor: currentFloor,
            reward: rewardStr,
            isGenerated: true
        };
    } else {
        // 杀怪任务
        const targetCount = Math.min(50, 15 + Math.floor((idx - 9) * 2)); // 数量逐渐增加，上限50
        return {
            id: idx,
            title: `第 ${currentFloor} 层：区域清理`,
            desc: `清除地牢第 ${currentFloor} 层的 ${targetCount} 只怪物，确保营地安全。`,
            type: 'kill_count',
            target: targetCount,
            floor: currentFloor,
            reward: rewardStr,
            isGenerated: true
        };
    }
}

// 领取任务奖励（UI直接调用）
function claimQuestReward() {
    if (player.questState !== 2) return;

    const q = getCurrentQuest();
    if (!q) return;

    // 发放奖励
    // 1. 金币 (解析字符串 "1500 金币")
    const goldMatch = q.reward.match(/(\d+)\s*金币/);
    if (goldMatch) {
        addGold(parseInt(goldMatch[1]));
    }
    // 2. 技能点
    if (q.reward.includes('技能点')) {
        player.skillPoints += 1; // 简单处理，无限任务每次最多1点
        showNotification("获得 1 技能点！");
    }
    // 3. 装备
    if (q.reward.includes('装备') || q.reward.includes('戒指') || q.reward.includes('神装')) {
        const item = createItem('戒指', player.lvl);
        if (q.reward.includes('暗金') || q.reward.includes('传奇') || q.reward.includes('神装')) {
            item.rarity = (Math.random() > 0.5) ? 3 : 2; // 稍微给好点
        }
        addItemToInventory(item);
    }
    // 兼容旧的硬编码奖励逻辑（如果是前10个任务）
    if (q.id <= 9) {
        // 这里只是为了保险，实际上上面的通用解析应该能覆盖大部分
        if (q.reward.includes('500 金币') && !goldMatch) addGold(500);
        if (q.reward.includes('1000 金币') && !goldMatch) addGold(1000);
    }

    // 完成任务
    player.questIndex++;
    player.questState = 0; // 重置为"未开始"（或者直接开始？通常是接任务->进行中。这里设为0，updateUI里显示"新任务"）
    player.questProgress = 0;

    // 自动接受下一个任务（为了流畅体验，"永远有任务"）
    player.questState = 1;

    AudioSys.play('levelup'); // 借用一下升级音效，或者 cash 音效
    showNotification(`任务完成！`);

    // 保存并更新UI
    SaveSystem.save();
    updateUI();
    updateQuestTracker();
}

// 第2排：普通怪物帧索引
const MONSTER_FRAMES = {
    'melee': 0,       // 沉沦魔
    'ranged': 1,      // 骷髅弓箭手
    'shaman': 2,      // 沉沦魔巫师
    'zombie': 3,      // 僵尸
    'skeleton': 4,    // 骷髅战士
    'ghost': 5,       // 幽灵鬼魂
    'specter': 6,     // 闪电幽魂
    'mummy': 7,       // 木乃伊
    'vampire': 8      // 吸血鬼
};

// 第3排：BOSS帧索引
const BOSS_FRAMES = {
    'bloodRaven': 0,  // 血鸟
    'countess': 1,    // 女伯爵
    'butcher': 2,     // 屠夫
    'duriel': 3,      // 树头木拳
    'diablo': 4,      // 暗黑破坏神
    'baal': 5         // 巴尔
};

// 根据Boss名称获取frameIndex（用于BOSS_FRAMES）
function getBossFrameIndex(bossName) {
    // 移除"地狱"前缀
    const cleanName = bossName.replace('地狱', '');

    const bossFrameMap = {
        '血鸟': BOSS_FRAMES.bloodRaven,
        '女伯爵': BOSS_FRAMES.countess,
        '屠夫': BOSS_FRAMES.butcher,
        '树头木拳': BOSS_FRAMES.duriel,
        '暗黑破坏神': BOSS_FRAMES.diablo,
        '巴尔': BOSS_FRAMES.baal
    };

    return bossFrameMap[cleanName] || BOSS_FRAMES.bloodRaven; // 默认使用血鸟
}

// 每层对应的 Boss 信息（名称与基础血量）
// 基础Boss配置
const BASE_BOSS_MAP = {
    2: { name: '血鸟', hp: 300, dmg: 25, xp: 1000 },
    4: { name: '女伯爵', hp: 800, dmg: 40, xp: 2000 },
    5: { name: '屠夫', hp: 1050, dmg: 50, xp: 2500 },
    7: { name: '树头木拳', hp: 2150, dmg: 55, xp: 3000 },
    9: { name: '暗黑破坏神', hp: 3840, dmg: 70, xp: 5000 },
    10: { name: '巴尔', hp: 4500, dmg: 80, xp: 8000 }
};

// 获取当前层的BOSS生成信息（支持无限层级）
function getBossSpawnInfo(floor) {
    // 计算周目数 (0: 1-10层, 1: 11-20层, ...)
    const cycle = Math.floor((floor - 1) / 10);
    // 映射到基础层数 (1-10)
    const baseFloor = ((floor - 1) % 10) + 1;

    const config = BASE_BOSS_MAP[baseFloor];
    if (!config) return null;

    // 属性膨胀系数
    // 血量：每周目+150%
    const hpMult = 1 + cycle * 1.5;
    // 伤害：每周目+60%
    const dmgMult = 1 + cycle * 0.6;
    // 经验：每周目+100%
    const xpMult = 1 + cycle * 1.0;

    // 称号前缀
    let prefix = "";
    if (cycle === 1) prefix = "噩梦 ";
    else if (cycle === 2) prefix = "地狱 ";
    else if (cycle >= 3) prefix = "折磨" + (cycle - 2) + " ";

    return {
        name: prefix + config.name,
        originalName: config.name, // 用于查找资源
        hp: Math.floor(config.hp * hpMult),
        dmg: Math.floor(config.dmg * dmgMult),
        xp: Math.floor(config.xp * xpMult),
        speed: 90 + Math.min(cycle * 10, 100) // 速度有上限
    };
}

const player = {
    x: 0, y: 0, radius: 12, color: '#eee', speed: 180, direction: 'front',
    lvl: 1, xp: 0, xpNext: 100, points: 0, skillPoints: 1,
    str: 15, dex: 15, vit: 20, ene: 10,
    floor: 0, kills: 0,
    hp: 100, maxHp: 100, mp: 50, maxMp: 50, damage: [2, 4], armor: 5, gold: 0,
    lifeSteal: 0, attackSpeed: 0, critChance: 0,
    resistances: { fire: 0, cold: 0, lightning: 0, poison: 0 },  // 抗性系统
    elementalDamage: { fire: 0, cold: 0, lightning: 0, poison: 0 },  // 元素伤害
    skills: { fireball: 1, thunder: 0, multishot: 0 }, activeSkill: 'fireball',
    targetX: null, targetY: null, targetItem: null, attacking: false, attackCooldown: 0, attackAnim: 0,
    skillCooldowns: { fireball: 0, thunder: 0, multishot: 0 },
    // 存储当前激活的闪电特效
    activeLightning: null,
    equipment: {
        mainhand: null, offhand: null, body: null, ring: null,
        helm: null, gloves: null, boots: null, belt: null, amulet: null
    },
    // 套装追踪 - 记录当前穿戴的套装件数 { 'tals_set': 3, 'immortal_king': 2 }
    equippedSets: {},
    // 记录每层 Boss 的下次刷新时间戳（毫秒）
    bossRespawn: {},
    inventory: Array(30).fill(null),
    stash: Array(36).fill(null), // 仓库，36个格子
    questIndex: 0, questState: 0, questProgress: 0,
    died: false,
    achievements: {},
    // 自动拾取设置
    autoPickup: {
        gold: true,      // 自动拾取金币
        potion: true,    // 自动拾取药水
        scroll: true     // 自动拾取卷轴
    },
    // 难度系统
    defeatedBaal: false,  // 是否击败巴尔（同时用于解锁地狱模式）
    isInHell: false,      // 当前是否在地狱中
    hellFloor: 1,         // 地狱层数（独立于地牢层数）
    // 传送门层数记忆
    maxFloor: 0,          // 到达过的最高层
    lastFloor: 0,         // 上次回城时的层数
    // 冰冻状态
    frozen: false,
    frozenTimer: 0,
    slowedTimer: 0,        // 减速期时间（冰冻结束后进入）
    freezeImmuneTimer: 0,  // 冰冻免疫时间
    // 中毒状态
    poisoned: false,
    poisonTimer: 0,
    poisonDamage: 0,
    lastPoisonTick: 0,
    // 掉落系统 - 累积幸运机制
    luckAccumulator: 0,       // 累积幸运值（每杀怪没掉好东西+1）
    killsSincePotion: 0,      // 自上次掉落消耗品后的击杀数
    // 天赋商店系统
    talents: [],              // 当前激活的天赋ID数组
    talentShop: [],           // 当前商店刷新的天赋（3个）
    phoenixUsed: false,       // 凤凰天赋是否已使用（每次进入地牢重置）
    highestTalentFloor: 0,        // 普通模式已触发商店的最高层（防止刷商店）
    highestHellTalentFloor: 0,    // 地狱模式已触发商店的最高层
    // 天神赐福系统（永久）
    divineBlessing: {
        pending: 0,           // 待领取次数（0-3）
        obtained: []          // 已获得赐福列表
    },
    lastBlessingLevel: 0,     // 上次触发赐福的等级（防止重复）
    // 每日登录奖励系统
    dailyLogin: {
        lastLoginDate: null,  // 上次登录日期 (YYYY-MM-DD)
        consecutiveDays: 0,   // 连续登录天数
        claimedToday: false   // 今日是否已领取
    },
    // 死亡状态
    isDead: false,        // 是否处于死亡状态
    deathTimer: 0,        // 死亡倒计时（秒）
    lastDamageSource: null, // 最后伤害来源（用于显示死因）
    invincibleTimer: 0,   // 无敌帧计时器
    // 统计数据（用于排行榜）
    stats: {
        totalGold: 0,         // 累计获得金币
        uniqueFound: 0,       // 发现的暗金数量
        setFound: 0,          // 发现的套装数量
        bossKills: 0,         // Boss击杀数
        eliteKills: 0,        // 精英击杀数
        maxKillStreak: 0,     // 最高连杀（不喝药）
        currentStreak: 0      // 当前连杀
    },
    // 个人最佳记录
    personalBest: {
        maxLevel: 1,          // 最高等级
        maxFloor: 0,          // 最高层数（普通）
        maxHellFloor: 0,      // 最高层数（地狱）
        maxKills: 0,          // 最高击杀数
        maxGold: 0,           // 单次最高金币
        fastestBaal: null     // 最快击杀巴尔（秒）
    },
    // 新手引导系统
    tutorial: {
        completed: false,     // 是否已完成引导
        step: 0               // 当前步骤：0=进入地牢, 1=攻击怪物, 2=拾取物品, 3=打开背包, 4=使用技能
    }
};

// ========== 每日登录奖励配置 ==========
const DAILY_LOGIN_REWARDS = [
    { day: 1, icon: '💰', name: '100 金币', type: 'gold', amount: 100 },
    { day: 2, icon: '❤️', name: '治疗药剂 x3', type: 'potion', heal: 50, amount: 3 },
    { day: 3, icon: '⚡', name: '24小时双倍经验', type: 'buff_xp', amount: 24 },
    { day: 4, icon: '💎', name: '300 金币', type: 'gold', amount: 300 },
    { day: 5, icon: '💙', name: '法力药剂 x3', type: 'potion', mana: 30, amount: 3 },
    { day: 6, icon: '📜', name: '回城卷轴 x5', type: 'scroll', amount: 5 },
    { day: 7, icon: '🏆', name: '暗金装备', type: 'unique_item', amount: 1 }
];

// ========== 天神赐福词条池（复用天赋商店属性key，数值约为1/3） ==========
const MAX_BLESSING_STACK = 3;  // 每种赐福最多获得3次

const DIVINE_BLESSING_POOL = [
    // 攻击类（对应天赋商店）
    { id: 'db_flame', name: '烈焰之魂', icon: '🔥', effect: { fireDmgPct: 10 }, rareEffect: { fireDmgPct: 15 } },
    { id: 'db_crit', name: '暴击大师', icon: '🎯', effect: { critChance: 5, critDamage: 10 }, rareEffect: { critChance: 8, critDamage: 15 } },
    { id: 'db_dmg', name: '狂战士', icon: '😡', effect: { dmgPct: 15 }, rareEffect: { dmgPct: 25 } },
    { id: 'db_poison', name: '淬毒之刃', icon: '☠️', effect: { poisonDmgPct: 8 }, rareEffect: { poisonDmgPct: 12 } },
    // 防御类
    { id: 'db_def', name: '铁壁', icon: '🛡️', effect: { def: 25 }, rareEffect: { def: 40 } },
    { id: 'db_ls', name: '吸血鬼', icon: '🧛', effect: { lifeSteal: 3 }, rareEffect: { lifeSteal: 5 } },
    { id: 'db_hpregen', name: '再生', icon: '💚', effect: { hpRegenPct: 0.5 }, rareEffect: { hpRegenPct: 1 } },
    { id: 'db_res', name: '元素护盾', icon: '🌈', effect: { allRes: 8 }, rareEffect: { allRes: 12 } },
    { id: 'db_thorns', name: '荆棘', icon: '🌵', effect: { thornsPct: 6 }, rareEffect: { thornsPct: 10 } },
    // 功能类
    { id: 'db_mana', name: '法力涌动', icon: '🔮', effect: { maxMp: 15, mpRegenPct: 3 }, rareEffect: { maxMp: 25, mpRegenPct: 5 } },  // 从15/25%降到3/5%
    { id: 'db_gold', name: '贪婪', icon: '💰', effect: { goldPct: 15 }, rareEffect: { goldPct: 25 } },
    { id: 'db_drop', name: '寻宝者', icon: '🗝️', effect: { dropRatePct: 10 }, rareEffect: { dropRatePct: 15 } },
    { id: 'db_blood', name: '嗜血', icon: '🩸', effect: { onKillHealPct: 2 }, rareEffect: { onKillHealPct: 3 } }
];

const spriteSheet = new Image();
spriteSheet.src = 'sprites.png?v=4.8';

let spritesLoaded = false;
let processedSpriteSheet = null;

spriteSheet.onload = () => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = spriteSheet.width;
    tempCanvas.height = spriteSheet.height;

    tempCtx.drawImage(spriteSheet, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 如果像 items.png 一样是黑底的，则去除黑色背景
        // 黑色阈值 (R<25, G<25, B<25) - 稍微放宽一点，消除黑边杂色
        if (r < 25 && g < 25 && b < 25) {
            data[i + 3] = 0;
        }
    }

    tempCtx.putImageData(imageData, 0, 0);

    processedSpriteSheet = new Image();
    processedSpriteSheet.onload = () => { spritesLoaded = true; };
    processedSpriteSheet.src = tempCanvas.toDataURL();
};

const SPRITE_CONFIG = {
    frameWidth: 256,
    frameHeight: 341,
    heroRow: 0,
    monsterRow: 1,  // 第2排：普通怪物
    bossRow: 2,     // 第3排：BOSS
    npcRow: 3       // 第4排：NPC
};

// --- Item Sprites ---
const itemSpriteSheet = new Image();
itemSpriteSheet.src = 'items.png';
let itemSpritesLoaded = false;
let processedItemSprites = null; // 去除黑底后的精灵图

itemSpriteSheet.onload = () => {
    // 预处理：去除黑色背景
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = itemSpriteSheet.width;
    tempCanvas.height = itemSpriteSheet.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(itemSpriteSheet, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    // 将黑色/近黑色像素变透明（阈值30）
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        if (r < 30 && g < 30 && b < 30) {
            data[i + 3] = 0; // 设置 alpha 为 0（透明）
        }
    }

    tempCtx.putImageData(imageData, 0, 0);
    processedItemSprites = tempCanvas;
    itemSpritesLoaded = true;
};

const wallTiles = new Image();
wallTiles.src = 'wall_tiles.png';
let wallTilesLoaded = false;
wallTiles.onload = () => { wallTilesLoaded = true; };

function getWallTextureIndex(floor) {
    if (player.isInHell) return 2; // Hell texture
    if (floor >= 9) return 2;      // Hellish levels
    if (floor >= 5) return 1;      // Cave levels
    return 0;                      // Stone levels (1-4)
}

const floorTiles = new Image();
floorTiles.src = 'floor_tiles.png';
let floorTilesLoaded = false;
floorTiles.onload = () => { floorTilesLoaded = true; };

function getFloorTextureIndex(floor) {
    if (floor === 0) return 0;     // Camp (Grass)
    return 1;                      // Stone levels (All dungeons)
}

const ITEM_FRAMES = {
    'gold': { col: 0, row: 0 },
    'potion_health': { col: 1, row: 0 },
    'potion_mana': { col: 2, row: 0 },
    'scroll': { col: 3, row: 0 },
    'weapon': { col: 0, row: 1 }, // sword default
    'axe': { col: 1, row: 1 },
    'staff': { col: 2, row: 1 },
    'bow': { col: 3, row: 1 },
    'helm': { col: 0, row: 2 },
    'armor': { col: 1, row: 2 },
    'gloves': { col: 2, row: 2 },
    'boots': { col: 3, row: 2 },
    'belt': { col: 0, row: 3 },
    'shield': { col: 1, row: 3 },
    'ring': { col: 2, row: 3 },
    'amulet': { col: 3, row: 3 }
};

function getItemSpriteCoords(item) {
    let type = item.type;
    let key = type;

    if (type === 'potion') {
        key = item.heal ? 'potion_health' : 'potion_mana';
    } else if (type === 'weapon') {
        if (item.name.includes('斧')) key = 'axe';
        else if (item.name.includes('弓')) key = 'bow';
        else if (item.name.includes('杖')) key = 'staff';
        else key = 'weapon';
    } else if (type === 'body') {
        key = 'armor';
    } else if (type === 'gold') {
        key = 'gold';
    }

    // Fallback for mapped names
    if (!ITEM_FRAMES[key] && ITEM_FRAMES[type]) key = type;

    return ITEM_FRAMES[key] || ITEM_FRAMES['gold'];
}

function applyItemSpriteToElement(el, item) {
    if (itemSpritesLoaded) {
        const coords = getItemSpriteCoords(item);
        el.innerText = '';
        el.style.backgroundImage = "url('items.png')";
        el.style.backgroundSize = '400% 400%';
        el.style.backgroundPosition = `${coords.col * 33.333}% ${coords.row * 33.333}%`;
        el.style.backgroundRepeat = 'no-repeat';
        // Remove text color as we use image now
        el.style.color = 'transparent';

        // Rarity Border
        const rarityColor = getItemColor(item.rarity);
        el.style.border = `1px solid ${rarityColor}`;
        if (item.rarity >= 3) {
            el.style.boxShadow = `inset 0 0 5px ${rarityColor}`;
        } else {
            el.style.boxShadow = 'none';
        }
    } else {
        el.innerText = item.icon || '?';
        el.style.color = getItemColor(item.rarity);
    }
}

// 成就系统定义
const ACHIEVEMENTS = [
    {
        id: 'kill_fallen_1000',
        name: '沉沦魔克星',
        description: '击杀1000只沉沦魔',
        target: 1000,
        type: 'kill_monster',
        monsterName: '沉沦魔'
    },
    {
        id: 'reach_floor_10',
        name: '地牢征服者',
        description: '到达地牢第10层',
        target: 10,
        type: 'reach_floor'
    },

    {
        id: 'equip_full_set',
        name: '套装大师',
        description: '同时穿戴一套完整套装（6件）',
        target: 6,
        type: 'equip_set'
    },

    {
        id: 'kill_boss_5',
        name: 'BOSS猎人',
        description: '击败5个首领级敌人',
        target: 5,
        type: 'kill_boss'
    },
    {
        id: 'reach_level_30',
        name: '传奇英雄',
        description: '达到等级30',
        target: 30,
        type: 'reach_level'
    },
    {
        id: 'kill_baal',
        name: '世界拯救者',
        description: '击败巴尔',
        target: 1,
        type: 'kill_specific_boss',
        bossName: '巴尔'
    }
];

function getHeroFrame(direction) {
    const frameMap = {
        'left': 0,
        'right': 1,
        'front': 2,
        'back': 3
    };
    const frameX = (frameMap[direction] || 0) * SPRITE_CONFIG.frameWidth;
    const frameY = SPRITE_CONFIG.heroRow * SPRITE_CONFIG.frameHeight;
    return {
        x: frameX,
        y: frameY,
        width: SPRITE_CONFIG.frameWidth,
        height: SPRITE_CONFIG.frameHeight
    };
}

function getNPCFrame(frameIndex) {
    const frameX = frameIndex * SPRITE_CONFIG.frameWidth;
    const frameY = SPRITE_CONFIG.npcRow * SPRITE_CONFIG.frameHeight;
    return {
        x: frameX,
        y: frameY,
        width: SPRITE_CONFIG.frameWidth,
        height: SPRITE_CONFIG.frameHeight
    };
}

function getMonsterFrame(frameIndex) {
    const frameX = frameIndex * SPRITE_CONFIG.frameWidth;
    const frameY = SPRITE_CONFIG.monsterRow * SPRITE_CONFIG.frameHeight;
    return {
        x: frameX,
        y: frameY,
        width: SPRITE_CONFIG.frameWidth,
        height: SPRITE_CONFIG.frameHeight
    };
}

function getBossFrame(frameIndex) {
    const frameX = frameIndex * SPRITE_CONFIG.frameWidth;
    const frameY = SPRITE_CONFIG.bossRow * SPRITE_CONFIG.frameHeight;
    return {
        x: frameX,
        y: frameY,
        width: SPRITE_CONFIG.frameWidth,
        height: SPRITE_CONFIG.frameHeight
    };
}

// 成就追踪系统
function trackAchievement(type, data) {
    ACHIEVEMENTS.forEach(ach => {
        if (ach.type !== type || !player.achievements[ach.id]) return;

        if (player.achievements[ach.id].completed) return;

        let progress = 0;

        switch (type) {
            case 'kill_monster':
                if (data.monsterName === ach.monsterName) {
                    player.achievements[ach.id].progress++;
                    progress = player.achievements[ach.id].progress;
                }
                break;

            case 'reach_floor':
                if (player.floor >= ach.target) {
                    completeAchievement(ach);
                }
                return;




            case 'kill_boss':
                if (data.isBoss || data.isQuestTarget) {
                    player.achievements[ach.id].progress++;
                    progress = player.achievements[ach.id].progress;
                }
                break;

            case 'kill_specific_boss':
                if (data.name === ach.bossName) {
                    player.achievements[ach.id].progress++;
                    progress = player.achievements[ach.id].progress;
                }
                break;

            case 'reach_level':
                if (player.lvl >= ach.target) {
                    completeAchievement(ach);
                }
                return;
        }

        if (progress >= ach.target) {
            completeAchievement(ach);
        }
    });
}

function completeAchievement(achievement) {
    player.achievements[achievement.id].completed = true;
    player.achievements[achievement.id].completedAt = Date.now();

    showNotification(`成就完成：${achievement.name}！`);
    AudioSys.play('quest');

    SaveSystem.save();
}

// 检查套装收藏成就
function checkSetAchievements() {
    // 2. 检查"套装大师"：同时穿戴一套完整套装
    const equipAch = ACHIEVEMENTS.find(a => a.id === 'equip_full_set');
    if (equipAch && player.achievements['equip_full_set']) {
        // 找到穿戴最多的套装件数
        let maxEquipped = 0;
        for (let setId in player.equippedSets) {
            if (player.equippedSets[setId] > maxEquipped) {
                maxEquipped = player.equippedSets[setId];
            }
        }

        // 更新进度（最多6件）
        player.achievements['equip_full_set'].progress = Math.min(maxEquipped, 6);

        // 检查是否完成（穿戴齐6件）
        if (!player.achievements['equip_full_set'].completed && maxEquipped >= 6) {
            completeAchievement(equipAch);
        }
    }
}

function checkNoDeathRun() {
    if (player.floor >= 10) {
        const ach = ACHIEVEMENTS.find(a => a.id === 'no_death_run');
        if (!ach || !player.achievements['no_death_run']) return;

        if (!player.achievements['no_death_run'].completed) {
            completeAchievement(ach);
        }
    }
}

function initAchievements() {
    ACHIEVEMENTS.forEach(ach => {
        if (!player.achievements[ach.id]) {
            player.achievements[ach.id] = {
                progress: 0,
                completed: false
            };
        }
    });
}

const SLOT_MAP = {
    'weapon': 'mainhand', 'armor': 'body', 'helm': 'helm', 'gloves': 'gloves',
    'boots': 'boots', 'belt': 'belt', 'ring': 'ring', 'amulet': 'amulet'
};

const DB_NAME = 'DiabloCloneDB'; const DB_VERSION = 8; let db;

// 自动战斗系统
const AutoBattle = {
    enabled: false,
    settings: {
        useSkill: true,                                     // 优先使用技能
        keepDistance: GAME_CONFIG.AUTO_KEEP_DISTANCE,       // 保持距离（远程战术）
        hpThreshold: GAME_CONFIG.AUTO_POTION_HP_THRESHOLD,  // 喝红药阈值
        mpThreshold: GAME_CONFIG.AUTO_POTION_MP_THRESHOLD,  // 喝蓝药阈值
        emergencyHp: GAME_CONFIG.AUTO_EMERGENCY_HP,         // 紧急回城阈值
        pickupUnique: true,                                 // 自动拾取暗金
        pickupSet: true                                     // 自动拾取套装
    },
    currentTarget: null,
    stuckTimer: 0,               // 卡死检测计时器
    lastPos: { x: 0, y: 0 },
    oscillationDetector: { positions: [], lastCheck: 0 },  // 摇摆检测器
    lastDamagedBy: null,         // 记录最后攻击我的敌人
    lastDamagedTime: 0,          // 最后被攻击时间
    moveDecisionTimer: 0,        // 移动决策计时器
    lastMoveDecision: null,      // 上次的移动决策
    failedPaths: [],             // 记录失败的寻路尝试
    pathCleanupTimer: 0,         // 失败路径清理计时器
    targetFailCount: 0,          // 当前目标的连续失败次数
    lastTargetId: null,          // 上次追击的目标（用于检测目标切换）
    blacklistedTargets: [],      // 被放弃的目标黑名单 [{target, until}]

    // ====== A*寻路系统 ======
    astarCache: {
        path: null,              // 当前缓存的路径 [{x, y}, ...]
        targetX: null,           // 路径目标X
        targetY: null,           // 路径目标Y
        currentIndex: 0,         // 当前路径点索引
        lastUpdateTime: 0        // 上次更新时间
    },

    // A*寻路算法实现
    astarFindPath(startX, startY, goalX, goalY) {
        // 转换为瓦片坐标
        const startCol = Math.floor(startX / TILE_SIZE);
        const startRow = Math.floor(startY / TILE_SIZE);
        const goalCol = Math.floor(goalX / TILE_SIZE);
        const goalRow = Math.floor(goalY / TILE_SIZE);

        // 边界检查
        if (startCol < 0 || startCol >= MAP_WIDTH || startRow < 0 || startRow >= MAP_HEIGHT) return null;
        if (goalCol < 0 || goalCol >= MAP_WIDTH || goalRow < 0 || goalRow >= MAP_HEIGHT) return null;

        // 目标是墙则放弃
        if (mapData[goalRow][goalCol] === 0) return null;

        // 节点类
        class AStarNode {
            constructor(col, row, g, h, parent) {
                this.col = col;
                this.row = row;
                this.g = g;       // 起点到当前节点的实际代价
                this.h = h;       // 当前节点到目标的估计代价(启发式)
                this.f = g + h;   // 总代价
                this.parent = parent;
            }

            equals(other) {
                return this.col === other.col && this.row === other.row;
            }

            key() {
                return `${this.col},${this.row}`;
            }
        }

        // 启发函数：欧几里得距离
        const heuristic = (col, row) => {
            const dx = goalCol - col;
            const dy = goalRow - row;
            return Math.sqrt(dx * dx + dy * dy);
        };

        // 获取邻居节点（8方向）
        const getNeighbors = (node) => {
            const neighbors = [];
            const directions = [
                { dc: -1, dr: 0, cost: 1 },      // 左
                { dc: 1, dr: 0, cost: 1 },       // 右
                { dc: 0, dr: -1, cost: 1 },      // 上
                { dc: 0, dr: 1, cost: 1 },       // 下
                { dc: -1, dr: -1, cost: 1.414 }, // 左上
                { dc: 1, dr: -1, cost: 1.414 },  // 右上
                { dc: -1, dr: 1, cost: 1.414 },  // 左下
                { dc: 1, dr: 1, cost: 1.414 }    // 右下
            ];

            for (let dir of directions) {
                const newCol = node.col + dir.dc;
                const newRow = node.row + dir.dr;

                // 边界检查
                if (newCol < 0 || newCol >= MAP_WIDTH || newRow < 0 || newRow >= MAP_HEIGHT) continue;

                // 墙壁检查
                if (mapData[newRow][newCol] === 0) continue;

                // 对角线移动需要检查两边是否都能通过（防止穿墙）
                if (dir.dc !== 0 && dir.dr !== 0) {
                    if (mapData[node.row][newCol] === 0 || mapData[newRow][node.col] === 0) {
                        continue;
                    }
                }

                neighbors.push({
                    col: newCol,
                    row: newRow,
                    cost: dir.cost
                });
            }

            return neighbors;
        };

        // 开放列表和关闭列表
        const openList = [];
        const closedSet = new Set();
        const gScores = {}; // 记录每个节点的最优g值

        // 起始节点
        const startNode = new AStarNode(startCol, startRow, 0, heuristic(startCol, startRow), null);
        openList.push(startNode);
        gScores[startNode.key()] = 0;

        // 主循环
        let iterations = 0;
        const maxIterations = 2000; // 防止死循环

        while (openList.length > 0 && iterations < maxIterations) {
            iterations++;

            // 找到f值最小的节点
            openList.sort((a, b) => a.f - b.f);
            const current = openList.shift();

            // 到达目标
            if (current.col === goalCol && current.row === goalRow) {
                // 重建路径
                const path = [];
                let node = current;
                while (node !== null) {
                    // 转换回像素坐标（瓦片中心）
                    path.unshift({
                        x: node.col * TILE_SIZE + TILE_SIZE / 2,
                        y: node.row * TILE_SIZE + TILE_SIZE / 2
                    });
                    node = node.parent;
                }

                // 路径简化：移除多余的中间点（保持直线段）
                if (path.length > 2) {
                    const simplified = [path[0]];
                    for (let i = 1; i < path.length - 1; i++) {
                        const prev = simplified[simplified.length - 1];
                        const curr = path[i];
                        const next = path[i + 1];

                        // 检查是否需要转向（方向改变）
                        const dx1 = curr.x - prev.x;
                        const dy1 = curr.y - prev.y;
                        const dx2 = next.x - curr.x;
                        const dy2 = next.y - curr.y;

                        // 方向向量归一化后比较
                        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                        if (len1 > 0 && len2 > 0) {
                            const dot = (dx1 / len1) * (dx2 / len2) + (dy1 / len1) * (dy2 / len2);
                            // dot接近1表示方向相同，可以跳过中间点
                            if (dot < 0.99) { // 允许2度内的偏差
                                simplified.push(curr);
                            }
                        }
                    }
                    simplified.push(path[path.length - 1]);
                    return simplified;
                }

                return path;
            }

            // 加入关闭列表
            closedSet.add(current.key());

            // 检查邻居
            const neighbors = getNeighbors(current);
            for (let neighbor of neighbors) {
                const neighborKey = `${neighbor.col},${neighbor.row}`;

                // 已在关闭列表中则跳过
                if (closedSet.has(neighborKey)) continue;

                // 计算新的g值
                const tentativeG = current.g + neighbor.cost;

                // 检查是否找到更优路径
                if (gScores[neighborKey] === undefined || tentativeG < gScores[neighborKey]) {
                    gScores[neighborKey] = tentativeG;

                    // 创建新节点
                    const h = heuristic(neighbor.col, neighbor.row);
                    const newNode = new AStarNode(neighbor.col, neighbor.row, tentativeG, h, current);

                    // 检查是否已在开放列表中
                    const existingIndex = openList.findIndex(n => n.col === neighbor.col && n.row === neighbor.row);
                    if (existingIndex >= 0) {
                        // 更新现有节点
                        if (newNode.f < openList[existingIndex].f) {
                            openList[existingIndex] = newNode;
                        }
                    } else {
                        // 添加新节点
                        openList.push(newNode);
                    }
                }
            }
        }

        // 未找到路径
        return null;
    },

    // 寻找目标 - 优先近的能看到的，其次远的任意怪
    findTarget() {
        if (!this.enabled || isInTown()) return null;

        let nearestVisible = null;   // 能看到的最近的怪
        let minVisibleDist = Infinity;
        let nearestClose = null;     // 近距离的怪（即使在墙角）
        let minCloseDist = Infinity;
        let nearestAny = null;       // 任意最近的怪（用于绕路）
        let minAnyDist = Infinity;

        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.dead) continue;

            const dist = Math.hypot(e.x - player.x, e.y - player.y);

            // 近距离的怪（<100）：即使在墙角也要打，最高优先
            if (dist < 100 && dist < minCloseDist) {
                nearestClose = e;
                minCloseDist = dist;
            }

            // 能看到的怪：优先选，范围600
            if (dist < 600 && dist < minVisibleDist && hasLineOfSight(player.x, player.y, e.x, e.y)) {
                nearestVisible = e;
                minVisibleDist = dist;
            }

            // 任意怪：范围扩大到1500（整个屏幕），用于绕路追击
            if (dist < 1500 && dist < minAnyDist) {
                nearestAny = e;
                minAnyDist = dist;
            }
        }

        // 优先级：近距离怪 > 能看到的 > 任意怪
        return nearestClose || nearestVisible || nearestAny;
    },

    // 记录被攻击
    onPlayerDamaged(attacker) {
        if (this.enabled && attacker) {
            this.lastDamagedBy = attacker;
            this.lastDamagedTime = Date.now();

            // 显示锁定提示
            //const dist = Math.hypot(attacker.x - player.x, attacker.y - player.y);
            //createFloatingText(player.x, player.y - 50, `🎯 锁定攻击者 (${Math.floor(dist)}m)`, '#ff6666', 1);
        }
    },

    // 决策行动 - 极简版
    decideAction(dt) {
        if (!this.enabled || isInTown()) return;

        // 1. 生存：紧急回城
        const hpPercent = player.hp / player.maxHp;
        if (hpPercent < this.settings.emergencyHp) {
            const hasScroll = player.inventory.some(it => it && it.type === 'scroll');
            if (hasScroll) {
                this.emergencyTownPortal();
                return;
            }
        }

        // 2. 生存：喝药
        if (hpPercent < this.settings.hpThreshold) {
            this.drinkPotion('health');
        }
        if (player.mp / player.maxMp < this.settings.mpThreshold) {
            this.drinkPotion('mana');
        }

        // 3. 拾取物品
        this.autoPickupItems();

        // 4. 选目标：最近的能看到的怪
        this.currentTarget = this.findTarget();

        if (!this.currentTarget) {
            // 没敌人，随机走走探索
            this.stuckTimer += dt;
            if (this.stuckTimer > 1) {
                this.moveToCenter();
                this.stuckTimer = 0;
            }
            return;
        }
        this.stuckTimer = 0;

        // 5. 移动：没在拾取东西就走向目标
        if (player.targetItem === null) {
            const dist = Math.hypot(this.currentTarget.x - player.x, this.currentTarget.y - player.y);
            if (dist > 60) {
                this.moveTowards(this.currentTarget);
            } else {
                player.targetX = null;
                player.targetY = null;
            }
        }

        // 6. 攻击
        this.attackTarget(this.currentTarget);
    },

    // 紧急回城
    emergencyTownPortal() {
        // 紧急回城（调用前已确保有卷轴）
        useQuickItem('scroll');
        createFloatingText(player.x, player.y - 60, '⚠️ 紧急回城！', COLORS.error, 2);
    },

    // 喝药
    drinkPotion(type) {
        let itemName = '';
        if (type === 'health') itemName = CONSUMABLE_NAME.HEALTH_POTION;
        if (type === 'mana') itemName = CONSUMABLE_NAME.MANA_POTION;

        const hasPotion = player.inventory.some(it => it && it.name === itemName);
        if (hasPotion) {
            useQuickItem(type);
        }
    },

    // A*寻路：使用缓存提高性能
    findPathToTarget(targetX, targetY) {
        // 1. 检查是否有视线，有的话直接走过去
        if (hasLineOfSight(player.x, player.y, targetX, targetY)) {
            // 清空缓存
            this.astarCache.path = null;
            this.astarCache.currentIndex = 0;
            return { x: targetX, y: targetY };
        }

        // 2. 检查缓存是否有效
        const now = Date.now();
        const targetChanged = this.astarCache.targetX !== null &&
            (Math.abs(this.astarCache.targetX - targetX) > 80 ||
                Math.abs(this.astarCache.targetY - targetY) > 80);

        const cacheExpired = now - this.astarCache.lastUpdateTime > 2000; // 2秒过期
        const needNewPath = !this.astarCache.path || targetChanged || cacheExpired;

        // 3. 如果需要新路径，运行A*
        if (needNewPath) {
            const newPath = this.astarFindPath(player.x, player.y, targetX, targetY);

            if (newPath && newPath.length > 0) {
                // 缓存新路径
                this.astarCache.path = newPath;
                this.astarCache.targetX = targetX;
                this.astarCache.targetY = targetY;
                this.astarCache.currentIndex = 0;
                this.astarCache.lastUpdateTime = now;

                // 显示调试信息（可选）
                if (window.DEBUG_ASTAR) {
                    console.log(`A* 找到路径: ${newPath.length}个路径点`);
                }
            } else {
                // A*失败，清空缓存，返回null让贪心算法处理
                this.astarCache.path = null;
                this.astarCache.currentIndex = 0;

                // 回退到简单的贪心寻路
                return this.fallbackGreedyPath(targetX, targetY);
            }
        }

        // 4. 使用缓存的路径
        if (this.astarCache.path && this.astarCache.path.length > 0) {
            // 跳过已经到达的路径点
            while (this.astarCache.currentIndex < this.astarCache.path.length) {
                const waypoint = this.astarCache.path[this.astarCache.currentIndex];
                const distToWaypoint = Math.hypot(waypoint.x - player.x, waypoint.y - player.y);

                // 如果距离路径点小于半个瓦片，认为已到达
                if (distToWaypoint < TILE_SIZE * 0.6) {
                    this.astarCache.currentIndex++;
                } else {
                    // 返回当前路径点
                    return { x: waypoint.x, y: waypoint.y };
                }
            }

            // 所有路径点都走完了，清空缓存
            this.astarCache.path = null;
            this.astarCache.currentIndex = 0;
            return { x: targetX, y: targetY };
        }

        // 5. 缓存为空，返回null（让外层决定）
        return null;
    },

    // 回退的贪心寻路（当A*失败时使用）
    fallbackGreedyPath(targetX, targetY) {
        const toTargetAngle = Math.atan2(targetY - player.y, targetX - player.x);
        const stepDist = 80;

        const angles = [
            toTargetAngle,
            toTargetAngle - Math.PI / 4,
            toTargetAngle + Math.PI / 4,
            toTargetAngle - Math.PI / 2,
            toTargetAngle + Math.PI / 2,
            toTargetAngle - Math.PI * 3 / 4,
            toTargetAngle + Math.PI * 3 / 4,
            toTargetAngle + Math.PI  // 反向
        ];

        for (let a of angles) {
            const testX = player.x + Math.cos(a) * stepDist;
            const testY = player.y + Math.sin(a) * stepDist;

            if (!isWall(testX, testY)) {
                return { x: testX, y: testY };
            }
        }

        // 完全被困，返回当前位置
        return { x: player.x, y: player.y };
    },

    // 向目标移动（使用寻路）
    moveTowards(target) {
        const pathPos = this.findPathToTarget(target.x, target.y);

        if (pathPos) {
            // 检查是否寻路成功（不是返回原地）
            const pathDist = Math.hypot(pathPos.x - player.x, pathPos.y - player.y);
            if (pathDist > 20) {
                // 寻路成功，移动到新位置
                player.targetX = pathPos.x;
                player.targetY = pathPos.y;
            } else {
                // 寻路失败，返回原地，尝试强制脱困
                this.escapeFromStuck();
            }
        } else {
            // 无法寻路，清除目标
            player.targetX = null;
            player.targetY = null;
        }

        player.targetItem = null;
    },

    // 从目标后退（智能绕墙）
    retreatFrom(target) {
        const angle = Math.atan2(player.y - target.y, player.x - target.x);
        const retreatDist = 100;

        // 尝试多个后退方向
        const retreatAngles = [
            angle,                    // 正后方
            angle + Math.PI / 6,      // 右后15度
            angle - Math.PI / 6,      // 左后15度
            angle + Math.PI / 3,      // 右后30度
            angle - Math.PI / 3,      // 左后30度
            angle + Math.PI / 2,      // 右侧
            angle - Math.PI / 2,      // 左侧
        ];

        for (let a of retreatAngles) {
            const testX = player.x + Math.cos(a) * retreatDist;
            const testY = player.y + Math.sin(a) * retreatDist;

            // 找到第一个可行走的后退位置
            if (!isWall(testX, testY)) {
                player.targetX = testX;
                player.targetY = testY;
                player.targetItem = null;
                return;
            }
        }

        // 如果所有方向都被墙挡住，尝试向侧面小距离移动
        const sideAngles = [angle + Math.PI / 2, angle - Math.PI / 2];
        for (let a of sideAngles) {
            const testX = player.x + Math.cos(a) * 60;
            const testY = player.y + Math.sin(a) * 60;

            if (!isWall(testX, testY)) {
                player.targetX = testX;
                player.targetY = testY;
                player.targetItem = null;
                return;
            }
        }

        // 实在没办法，原地不动
        player.targetX = null;
        player.targetY = null;
        player.targetItem = null;
    },

    // 向地图中心移动（防卡死）
    moveToCenter() {
        // 随机选择一个不是墙的位置
        let attempts = 0;
        let foundPos = false;

        while (!foundPos && attempts < 20) {
            const randX = (10 + Math.random() * (MAP_WIDTH - 20)) * TILE_SIZE;
            const randY = (10 + Math.random() * (MAP_HEIGHT - 20)) * TILE_SIZE;

            if (!isWall(randX, randY)) {
                player.targetX = randX;
                player.targetY = randY;
                foundPos = true;
            }
            attempts++;
        }

        if (!foundPos) {
            // 实在找不到就用地图中心
            player.targetX = MAP_WIDTH * TILE_SIZE / 2;
            player.targetY = MAP_HEIGHT * TILE_SIZE / 2;
        }

        player.targetItem = null;
    },

    // 脱困函数：卡墙时尝试脱身（智能版）
    escapeFromStuck() {
        // 记录失败位置，避免再次尝试
        this.failedPaths.push({ x: player.x, y: player.y, time: Date.now() });
        if (this.failedPaths.length > 20) {
            this.failedPaths.shift();
        }

        // 重置移动决策计时器，立即重新决策
        this.moveDecisionTimer = 999;

        // 智能脱困：增大脱困距离，避开目标方向
        const escapeDistances = [150, 250];  // 增大距离，跳出困境

        // 计算应避免的角度（如果有目标，避开目标方向）
        let avoidAngle = null;
        if (this.currentTarget) {
            avoidAngle = Math.atan2(this.currentTarget.y - player.y, this.currentTarget.x - player.x);
        }

        // 尝试16个方向
        for (let dist of escapeDistances) {
            const angles = [];
            for (let i = 0; i < 16; i++) {
                angles.push((Math.PI * 2 / 16) * i);
            }

            // 如果有避免角度，排序角度（优先远离目标）
            if (avoidAngle !== null) {
                angles.sort((a, b) => {
                    const distA = Math.abs(((a - avoidAngle + Math.PI) % (2 * Math.PI)) - Math.PI);
                    const distB = Math.abs(((b - avoidAngle + Math.PI) % (2 * Math.PI)) - Math.PI);
                    return distB - distA;  // 距离目标方向越远越优先
                });
            }

            for (let angle of angles) {
                const testX = player.x + Math.cos(angle) * dist;
                const testY = player.y + Math.sin(angle) * dist;

                if (!isWall(testX, testY)) {
                    // 检查是否在失败路径黑名单中
                    const isInBlacklist = this.failedPaths.some(p =>
                        Math.hypot(p.x - testX, p.y - testY) < 80
                    );

                    if (!isInBlacklist) {
                        player.targetX = testX;
                        player.targetY = testY;
                        player.targetItem = null;
                        return;
                    }
                }
            }
        }

        // 所有方向都失败，移动到地图随机位置
        this.moveToCenter();
    },

    // 攻击目标
    attackTarget(target) {
        const dist = Math.hypot(target.x - player.x, target.y - player.y);

        // 设置鼠标位置指向目标（技能需要这个）
        mouse.worldX = target.x;
        mouse.worldY = target.y;

        // 检查视线
        const hasLOS = hasLineOfSight(player.x, player.y, target.x, target.y);

        // 使用技能
        if (this.settings.useSkill) {
            // 有视线：火球/多重优先
            if (hasLOS) {
                const fireballCost = getSkillManaCost('fireball', player.skills.fireball);
                if (player.skills.fireball > 0 && player.skillCooldowns.fireball <= 0 && dist <= 450 && player.mp >= fireballCost) {
                    castSkill('fireball');
                    return;
                }

                const multishotCost = getSkillManaCost('multishot', player.skills.multishot);
                if (player.skills.multishot > 0 && player.skillCooldowns.multishot <= 0 && dist <= 500 && player.mp >= multishotCost) {
                    castSkill('multishot');
                    return;
                }
            }

            // 雷电术：可以隔墙，射程190
            const thunderCost = getSkillManaCost('thunder', player.skills.thunder);
            if (player.skills.thunder > 0 && player.skillCooldowns.thunder <= 0 && dist <= 190 && player.mp >= thunderCost) {
                castSkill('thunder');
                return;
            }
        }

        // 普攻：近战范围内，有视线或距离很近（墙角）
        const canMelee = (hasLOS || dist < 80) && dist < 70;
        if (canMelee && player.attackCooldown <= 0) {
            const baseDmg = player.damage[0] + Math.random() * (player.damage[1] - player.damage[0]);
            const strBonus = player.str * 0.1;
            const totalDmg = Math.floor((baseDmg + strBonus) * (1 + player.attackSpeed / 100));
            takeDamage(target, totalDmg);
            player.attackCooldown = 0.8 / (1 + player.attackSpeed / 100);
            AudioSys.play('hit');
            createSlashEffect(player.x, player.y, target.x, target.y, totalDmg);
            player.attackAnim = 1;

            if (player.lifeSteal > 0) {
                const heal = Math.floor(totalDmg * player.lifeSteal / 100);
                player.hp = Math.min(player.maxHp, player.hp + heal);
            }
        }
    },

    // 自动拾取物品（带优先级）
    autoPickupItems() {
        // 已有拾取目标且仍然有效，不重复设置
        if (player.targetItem) {
            const stillExists = groundItems.includes(player.targetItem);
            const dist = Math.hypot(player.targetItem.x - player.x, player.targetItem.y - player.y);
            if (stillExists && dist < 500) {
                return; // 保持当前目标
            }
            // 目标无效，清除
            player.targetItem = null;
            player.targetX = null;
            player.targetY = null;
        }

        const inventoryFull = player.inventory.filter(it => it !== null).length >= player.inventory.length;

        // 检查能否为物品腾出空间（预判断，不实际丢弃）
        // forSet=true 时为套装腾空间，可以丢弃稀有(黄)装备
        const canMakeRoom = (forSet = false) => {
            for (let i = 0; i < player.inventory.length; i++) {
                const it = player.inventory[i];
                if (!it) continue;
                // 永远不丢：套装、暗金、药水、卷轴
                if (isProtectedItem(it)) continue;
                // 为套装腾空间时，稀有(黄, rarity=3)也可以丢
                if (forSet) return true;
                // 普通情况：只丢蓝装及以下
                if (it.rarity < 3) return true;
            }
            return false;
        };

        // 候选物品列表，按优先级分类
        let setItems = [];      // 套装：最高优先级
        let urgentPotions = []; // 紧急药水（没药时）：次高优先级
        let uniqueItems = [];   // 暗金：高优先级
        let normalItems = [];   // 蓝/黄：普通优先级
        let goldItems = [];     // 金币
        let consumables = [];   // 药水/卷轴

        // 检查是否缺药水
        const hasHealPotion = player.inventory.some(it => it && it.name === CONSUMABLE_NAME.HEALTH_POTION);
        const hasManaPotion = player.inventory.some(it => it && it.name === CONSUMABLE_NAME.MANA_POTION);

        for (let i = 0; i < groundItems.length; i++) {
            const it = groundItems[i];
            if (!it) continue;

            const dist = Math.hypot(it.x - player.x, it.y - player.y);

            // 检查视线（防止尝试拾取墙后面的物品）
            if (!hasLineOfSight(player.x, player.y, it.x, it.y)) continue;

            // 金币：距离600内（贪婪拾取）
            if (it.type === 'gold' && dist < 600) {
                goldItems.push({ item: it, dist });
                continue;
            }

            // 可叠加物品检查（药水/卷轴）
            const canStack = (it.name === CONSUMABLE_NAME.HEALTH_POTION || it.name === CONSUMABLE_NAME.MANA_POTION || it.name === CONSUMABLE_NAME.TOWN_PORTAL) &&
                player.inventory.some(inv => inv && inv.name === it.name);

            // 药水/卷轴
            if (it.name === CONSUMABLE_NAME.HEALTH_POTION && player.autoPickup.potion && dist < 400) {
                if (canStack || !inventoryFull) {
                    // 没有红药时提升优先级
                    if (!hasHealPotion) urgentPotions.push({ item: it, dist });
                    else consumables.push({ item: it, dist });
                }
            }
            else if (it.name === CONSUMABLE_NAME.MANA_POTION && player.autoPickup.potion && dist < 400) {
                // 没有蓝药时，可以丢弃低价值装备腾空间（和套装同等重要）
                if (canStack || !inventoryFull || (!hasManaPotion && canMakeRoom(true))) {
                    if (!hasManaPotion) urgentPotions.push({ item: it, dist });
                    else consumables.push({ item: it, dist });
                }
            }
            else if (it.name === CONSUMABLE_NAME.TOWN_PORTAL && player.autoPickup.scroll && dist < 400) {
                if (canStack || !inventoryFull) consumables.push({ item: it, dist });
            }
            // 套装：距离500内，最高优先级（可丢弃稀有装备腾空间）
            else if (this.settings.pickupSet && it.rarity === 5 && dist < 500) {
                if (!inventoryFull || canMakeRoom(true)) setItems.push({ item: it, dist });
            }
            // 暗金：距离500内，高优先级
            else if (this.settings.pickupUnique && it.rarity === 4 && dist < 500) {
                if (!inventoryFull || canMakeRoom()) uniqueItems.push({ item: it, dist });
            }
            // 稀有(黄)：距离400内
            else if (it.rarity === 3 && dist < 400) {
                if (!inventoryFull || canMakeRoom()) uniqueItems.push({ item: it, dist });
            }
            // 蓝色及以上：距离300内，背包满则跳过
            else if (it.rarity >= 2 && dist < 300) {
                if (!inventoryFull) normalItems.push({ item: it, dist });
            }
        }

        // 检查是否在激烈战斗中（敌人很近才算激烈战斗）
        const inCombat = this.currentTarget && !this.currentTarget.dead;
        const targetDist = inCombat ? Math.hypot(this.currentTarget.x - player.x, this.currentTarget.y - player.y) : Infinity;
        // 激烈战斗：敌人距离150内
        const inHeavyCombat = inCombat && targetDist < 150;

        // 按优先级选择：套装 > 紧急药水 > 暗金/稀有 > 金币 > 药水 > 蓝装
        // 刷宝游戏要贪婪！
        let selected = null;

        // 1. 套装最优先（任何时候都捡）
        if (setItems.length > 0) {
            setItems.sort((a, b) => a.dist - b.dist);
            selected = setItems[0].item;
        }
        // 2. 紧急药水（没药时，激烈战斗中距离150内也捡）
        if (!selected && urgentPotions.length > 0) {
            urgentPotions.sort((a, b) => a.dist - b.dist);
            if (!inHeavyCombat || urgentPotions[0].dist < 150) {
                selected = urgentPotions[0].item;
            }
        }
        // 3. 暗金/稀有（激烈战斗中距离150内也捡）
        if (!selected && uniqueItems.length > 0) {
            uniqueItems.sort((a, b) => a.dist - b.dist);
            if (!inHeavyCombat || uniqueItems[0].dist < 150) {
                selected = uniqueItems[0].item;
            }
        }
        // 4. 金币（激烈战斗中距离100内也捡，否则都捡）
        if (!selected && goldItems.length > 0) {
            goldItems.sort((a, b) => a.dist - b.dist);
            if (!inHeavyCombat || goldItems[0].dist < 100) {
                selected = goldItems[0].item;
            }
        }
        // 5. 药水/卷轴（激烈战斗中距离100内也捡）
        if (!selected && consumables.length > 0) {
            consumables.sort((a, b) => a.dist - b.dist);
            if (!inHeavyCombat || consumables[0].dist < 100) {
                selected = consumables[0].item;
            }
        }
        // 6. 普通装备（蓝/黄）- 激烈战斗中距离80内也捡
        if (!selected && normalItems.length > 0) {
            normalItems.sort((a, b) => a.dist - b.dist);
            if (!inHeavyCombat || normalItems[0].dist < 80) {
                selected = normalItems[0].item;
            }
        }

        if (selected) {
            // 背包满且是重要物品，先丢弃低价值物品
            if (inventoryFull && selected.rarity >= 3) {
                // 套装可以丢弃稀有装备，其他只丢蓝装及以下
                this.dropLowestValueItem(selected.rarity === 5);
            }
            player.targetItem = selected;
            player.targetX = selected.x;
            player.targetY = selected.y;
        }
    },

    // 丢弃背包中最低价值物品
    // forSet=true 时为套装腾空间，可以丢弃稀有(黄)装备
    dropLowestValueItem(forSet = false) {
        let lowestIdx = -1, lowestVal = Infinity;
        for (let i = 0; i < player.inventory.length; i++) {
            const it = player.inventory[i];
            if (!it) continue;
            // 永远不丢：套装、暗金、药水、卷轴
            if (isProtectedItem(it)) continue;
            // 非套装情况：也保护稀有(黄)装备
            if (!forSet && it.rarity >= 3) continue;
            const val = (it.rarity || 0) * 100 + (it.def || 0) + (it.minDmg || 0);
            if (val < lowestVal) { lowestVal = val; lowestIdx = i; }
        }
        if (lowestIdx >= 0) {
            const item = player.inventory[lowestIdx];
            player.inventory[lowestIdx] = null;
            groundItems.push({ ...item, x: player.x, y: player.y, dropTime: Date.now() });
            createFloatingText(player.x, player.y - 40, `丢弃 ${item.name}`, '#888', 1.5);
            return true;
        }
        return false;
    }
};

const AudioSys = {
    ctx: null,
    bgmEl: null,
    bgmUrl: "bg.mp3",
    masterGain: null, sfxGain: null,
    bgmPlaying: false,
    bgmRetryNeeded: false,
    init: function () {
        if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.sfxGain = this.ctx.createGain();

            this.sfxGain.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);

            this.sfxGain.gain.value = Settings.sfx ? 1.0 : 0;

            this.bgmEl = new Audio(this.bgmUrl);
            this.bgmEl.loop = true;
            this.bgmEl.volume = Settings.bgm ? 0.3 : 0;

            // 监听音频结束事件，确保循环播放
            this.bgmEl.addEventListener('ended', () => {
                if (Settings.bgm && this.bgmPlaying) {
                    this.bgmEl.currentTime = 0;
                    this.bgmEl.play().catch(e => console.log("BGM restart failed:", e));
                }
            });
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    startBGM: function () {
        if (this.bgmEl && Settings.bgm && !this.bgmPlaying) {
            console.log("Attempting to start BGM...");
            this.bgmPlaying = true;
            this.bgmEl.play().then(() => {
                console.log("✅ BGM started successfully");
            }).catch(e => {
                console.log("❌ BGM play failed:", e);
                this.bgmPlaying = false;
                // 如果失败，可能是需要更多用户交互，设置标记稍后重试
                this.bgmRetryNeeded = true;
            });
        }
    },
    stopBGM: function () {
        if (this.bgmEl && this.bgmPlaying) {
            this.bgmEl.pause();
            this.bgmPlaying = false;
        }
    },
    resumeBGM: function () {
        if (this.bgmEl && Settings.bgm && !this.bgmPlaying) {
            // 如果有重试标记，先尝试startBGM
            if (this.bgmRetryNeeded) {
                this.bgmRetryNeeded = false;
                this.startBGM();
            } else {
                this.bgmEl.play().then(() => {
                    this.bgmPlaying = true;
                    console.log("✅ BGM resumed successfully");
                }).catch(e => {
                    console.log("❌ BGM resume failed:", e);
                    this.bgmPlaying = false;
                });
            }
        }
    },
    // 在任何用户交互时调用，尝试启动BGM
    tryAutoStartBGM: function () {
        if (this.bgmRetryNeeded && Settings.bgm) {
            console.log("🔄 Auto-retrying BGM start...");
            this.bgmRetryNeeded = false;
            this.startBGM();
        }
    },
    play: function (type) {
        if (!this.ctx) { console.log('AudioSys: No context'); return; }
        if (this.ctx.state === 'suspended') { console.log('AudioSys: Context suspended'); this.ctx.resume(); }

        // console.log('AudioSys playing:', type, 'SFX:', Settings.sfx, 'Gain:', this.sfxGain.gain.value); // Debug

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.sfxGain);

        if (type === 'gold') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(1800, t);
            gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc.start(); osc.stop(t + 0.3);
        } else if (type === 'attack') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(100, t); osc.frequency.linearRampToValueAtTime(50, t + 0.1);
            gain.gain.setValueAtTime(0.1, t); gain.gain.linearRampToValueAtTime(0, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'hit') {
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t);
            gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'quest') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(554, t + 0.2); osc.frequency.setValueAtTime(659, t + 0.4);
            gain.gain.setValueAtTime(0.2, t); gain.gain.setValueAtTime(0, t + 1);
            osc.start(); osc.stop(t + 1);
        } else if (type === 'levelup') {
            [440, 554, 659, 880].forEach((f, i) => {
                let o = this.ctx.createOscillator(); let g = this.ctx.createGain();
                o.connect(g); g.connect(this.sfxGain);
                o.frequency.value = f;
                g.gain.setValueAtTime(0.1, t + i * 0.1); g.gain.linearRampToValueAtTime(0, t + i * 0.1 + 0.3);
                o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.3);
            });
        } else if (type === 'potion') {
            // 咕噜噜的喝药音效 - 使用多个振荡器模拟液体流动声
            [200, 250, 300].forEach((f, i) => {
                let o = this.ctx.createOscillator();
                let g = this.ctx.createGain();
                o.type = 'sine';
                o.connect(g);
                g.connect(this.sfxGain);
                o.frequency.setValueAtTime(f, t + i * 0.05);
                o.frequency.exponentialRampToValueAtTime(f * 0.5, t + i * 0.05 + 0.2);
                g.gain.setValueAtTime(0.08, t + i * 0.05);
                g.gain.exponentialRampToValueAtTime(0.01, t + i * 0.05 + 0.3);
                o.start(t + i * 0.05);
                o.stop(t + i * 0.05 + 0.3);
            });
        } else if (type === 'fireball') {
            // 逼真的火球音效 - 三层叠加：爆发冲击 + 火焰燃烧 + 空气振动

            // 1. 爆发冲击层 - 方波模拟爆炸冲击
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'square';
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.frequency.setValueAtTime(80, t);
            osc1.frequency.exponentialRampToValueAtTime(40, t + 0.2);
            gain1.gain.setValueAtTime(0.3, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc1.start(t);
            osc1.stop(t + 0.3);

            // 2. 火焰燃烧层 - 锯齿波模拟火焰噼啪声
            [120, 150, 180].forEach((f, i) => {
                const osc2 = this.ctx.createOscillator();
                const gain2 = this.ctx.createGain();
                osc2.type = 'sawtooth';
                osc2.connect(gain2);
                gain2.connect(this.sfxGain);
                osc2.frequency.setValueAtTime(f, t + i * 0.03);
                osc2.frequency.exponentialRampToValueAtTime(f * 0.3, t + 0.4);
                gain2.gain.setValueAtTime(0.1 - i * 0.02, t + i * 0.03);
                gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
                osc2.start(t + i * 0.03);
                osc2.stop(t + 0.5);
            });
            // 3. 高频嘶嘶声层 - 正弦波模拟空气振动
            const osc3 = this.ctx.createOscillator();
            const gain3 = this.ctx.createGain();
            osc3.type = 'sine';
            osc3.connect(gain3);
            gain3.connect(this.sfxGain);
            osc3.frequency.setValueAtTime(1000, t);
            osc3.frequency.exponentialRampToValueAtTime(500, t + 0.15);
            gain3.gain.setValueAtTime(0.05, t);
            gain3.gain.linearRampToValueAtTime(0, t + 0.2);
            osc3.start(t);
            osc3.stop(t + 0.2);
        } else if (type === 'arrow') {
            // 箭矢音效 - 风声和撞击声
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        } else if (type === 'thunder') {
            // 雷电音效：白噪声 + 低频震荡
            // 1. 初始的尖锐爆裂声 (高频锯齿波)
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(800, t);
            osc1.frequency.exponentialRampToValueAtTime(100, t + 0.1);
            gain1.gain.setValueAtTime(0.3, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.start(t);
            osc1.stop(t + 0.15);

            // 2. 隆隆的雷声 (低频噪声模拟)
            // 由于 Web Audio API 原生没有白噪声节点，我们用多个低频振荡器模拟
            [60, 80, 100, 120, 150].forEach((f) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square'; // 方波听起来更粗糙，适合模拟雷声
                osc.frequency.setValueAtTime(f + Math.random() * 20, t);
                osc.frequency.linearRampToValueAtTime(f * 0.5, t + 0.5 + Math.random() * 0.5);

                gain.gain.setValueAtTime(0.05, t);
                gain.gain.linearRampToValueAtTime(0.08, t + 0.1); // 渐强
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8 + Math.random() * 0.4); // 漫长的衰减

                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t);
                osc.stop(t + 1.5);
            });
        } else if (type === 'drop_unique') {
            // 暗金掉落音效 - 史诗感的金属共鸣 + 天堂之音
            // 1. 金属撞击声
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, t);
            osc1.frequency.exponentialRampToValueAtTime(440, t + 0.3);
            gain1.gain.setValueAtTime(0.3, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.start(t);
            osc1.stop(t + 0.5);

            // 2. 天堂和弦 (C-E-G-C)
            [523, 659, 784, 1047].forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, t + i * 0.08);
                gain.gain.setValueAtTime(0.15, t + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t + i * 0.08);
                osc.stop(t + 1);
            });

            // 3. 低频共鸣
            const osc3 = this.ctx.createOscillator();
            const gain3 = this.ctx.createGain();
            osc3.type = 'triangle';
            osc3.frequency.setValueAtTime(110, t);
            gain3.gain.setValueAtTime(0.2, t);
            gain3.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
            osc3.connect(gain3);
            gain3.connect(this.sfxGain);
            osc3.start(t);
            osc3.stop(t + 0.6);
        } else if (type === 'drop_set') {
            // 套装掉落音效 - 神秘的绿色能量
            // 1. 神秘的低音脉冲
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(165, t);
            osc1.frequency.linearRampToValueAtTime(220, t + 0.3);
            gain1.gain.setValueAtTime(0.25, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.start(t);
            osc1.stop(t + 0.5);

            // 2. 魔法音阶 (小调神秘感)
            [330, 392, 440, 523].forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, t + i * 0.1);
                gain.gain.setValueAtTime(0.12, t + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t + i * 0.1);
                osc.stop(t + 0.9);
            });
        }
    },
    playFireballExplosion: function (level) {
        if (!this.ctx) { console.log('AudioSys: No context'); return; }
        if (this.ctx.state === 'suspended') { this.ctx.resume(); }

        const t = this.ctx.currentTime;

        // 根据等级计算参数
        const filterFreq = 300 - (level - 5) * 10; // 5级=300Hz, 10级=250Hz
        const volume = 0.3 + (level - 5) * 0.04;   // 5级=0.3, 10级=0.5
        const duration = 0.25 + (level - 5) * 0.02; // 5级=0.25s, 10级=0.35s

        // 第一层：低频轰鸣（主体爆炸声）
        // 使用多个低频方波叠加模拟噪声
        [60, 80, 100, 120, 150].forEach((f) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = 'square';
            osc.frequency.setValueAtTime(f + Math.random() * 10, t);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(filterFreq, t);
            filter.Q.setValueAtTime(1, t);

            gain.gain.setValueAtTime(volume * 0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + duration);
        });

        // 第二层：中频冲击（爆炸瞬间的"砰"）
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(400, t);
        osc2.frequency.exponentialRampToValueAtTime(100, t + 0.05);
        gain2.gain.setValueAtTime(volume * 0.5, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(t);
        osc2.stop(t + 0.08);

        // 第三层：高频碎裂（火焰碎片飞溅）
        [800, 1000, 1200].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, t + i * 0.02);
            osc.frequency.exponentialRampToValueAtTime(f * 0.3, t + 0.1);
            gain.gain.setValueAtTime(volume * 0.08, t + i * 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.02);
            osc.stop(t + 0.15);
        });

        // 等级10添加余波效果
        if (level >= 10) {
            setTimeout(() => {
                const t2 = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                osc.type = 'square';
                osc.frequency.setValueAtTime(80, t2);
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(200, t2);
                gain.gain.setValueAtTime(volume * 0.2, t2);
                gain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.15);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t2);
                osc.stop(t2 + 0.15);
            }, 150);
        }
    },
    toggleSetting: function (key, val) {
        Settings[key] = val;
        if (key === 'bgm' && this.bgmEl) {
            this.bgmEl.volume = val ? 0.3 : 0;
            if (val && !this.bgmPlaying) {
                // 如果开启BGM且当前没有播放，尝试播放
                this.startBGM();
            } else if (!val && this.bgmPlaying) {
                // 如果关闭BGM且当前正在播放，暂停播放
                this.stopBGM();
            }
        }
        if (key === 'sfx' && this.sfxGain) {
            this.sfxGain.gain.setValueAtTime(val ? 1.0 : 0, this.ctx.currentTime);
        }
    }
};

// 自动拾取设置切换
function toggleAutoPickup(itemType) {
    const checkbox = document.getElementById(`chk-auto-${itemType}`);
    player.autoPickup[itemType] = checkbox.checked;
    SaveSystem.save();
    showNotification(`自动拾取${itemType === 'gold' ? '金币' : itemType === 'potion' ? '药水' : '卷轴'}：${checkbox.checked ? '开启' : '关闭'}`);
}

// ========== 属性系统迁移函数 ==========
// 将旧版本的基础属性(str/dex/vit/ene)转换为直接效果属性
function migrateItemStats() {
    let migratedCount = 0;

    // 迁移单个物品
    function migrateItem(item) {
        if (!item || !item.stats) return false;
        let migrated = false;

        // str → dmgPct (×5)
        if (item.stats.str) {
            item.stats.dmgPct = (item.stats.dmgPct || 0) + item.stats.str * 5;
            delete item.stats.str;
            migrated = true;
        }

        // vit → maxHp (×5)
        if (item.stats.vit) {
            item.stats.maxHp = (item.stats.maxHp || 0) + item.stats.vit * 5;
            delete item.stats.vit;
            migrated = true;
        }

        // ene → maxMp (×3)
        if (item.stats.ene) {
            item.stats.maxMp = (item.stats.maxMp || 0) + item.stats.ene * 3;
            delete item.stats.ene;
            migrated = true;
        }

        // dex → def (×1) + critChance (×0.5)
        if (item.stats.dex) {
            item.stats.def = (item.stats.def || 0) + item.stats.dex;
            item.stats.critChance = (item.stats.critChance || 0) + Math.floor(item.stats.dex * 0.5);
            delete item.stats.dex;
            migrated = true;
        }

        // mpRegen 迁移：旧版是固定值(30-100)，新版是百分比(3-10%)
        // 检测：如果 > 20，说明是旧版固定值，除以10转为百分比
        if (item.stats.mpRegen && item.stats.mpRegen > 20) {
            item.stats.mpRegen = Math.round(item.stats.mpRegen / 10);
            migrated = true;
        }

        return migrated;
    }

    // 迁移背包物品
    player.inventory.forEach(item => {
        if (migrateItem(item)) migratedCount++;
    });

    // 迁移仓库物品
    player.stash.forEach(item => {
        if (migrateItem(item)) migratedCount++;
    });

    // 迁移已装备物品
    Object.values(player.equipment).forEach(item => {
        if (migrateItem(item)) migratedCount++;
    });

    if (migratedCount > 0) {
        console.log(`[属性迁移] 已转换 ${migratedCount} 件物品的旧属性`);
        showNotification(`已自动升级 ${migratedCount} 件装备属性`);
    }
}

const SaveSystem = {
    currentSlot: 1,  // 当前使用的存档槽位
    MAX_SLOTS: 3,    // 最大存档数

    init: function () {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('saveData')) db.createObjectStore('saveData', { keyPath: 'id' });
        };
        req.onsuccess = e => {
            db = e.target.result;
            this.migrateOldSave().then(() => {
                this.loadAllSlotsMeta();
            });
        };
        req.onerror = e => { console.error("DB Init Failed", e); };
    },

    // 迁移旧存档到槽位1
    migrateOldSave: async function () {
        return new Promise((resolve) => {
            if (!db) { resolve(); return; }
            const tx = db.transaction(['saveData'], 'readonly');
            const store = tx.objectStore('saveData');

            // 检查是否有旧格式存档
            const oldReq = store.get('player1');
            oldReq.onsuccess = (e) => {
                const oldData = e.target.result;
                if (oldData && !oldData.slotId) {
                    // 旧存档存在且未迁移，迁移到槽位1
                    const newData = { ...oldData, id: 'slot_1', slotId: 1 };
                    const writeTx = db.transaction(['saveData'], 'readwrite');
                    const writeStore = writeTx.objectStore('saveData');
                    writeStore.put(newData);
                    writeStore.delete('player1');  // 删除旧存档
                    writeTx.oncomplete = () => {
                        console.log('[存档迁移] 已将旧存档迁移到槽位1');
                        resolve();
                    };
                } else {
                    resolve();
                }
            };
            oldReq.onerror = () => resolve();
        });
    },

    // 加载所有槽位的元数据（用于显示存档选择界面）
    loadAllSlotsMeta: function () {
        if (!db) return;
        window.saveSlots = [null, null, null];  // 3个槽位

        const tx = db.transaction(['saveData'], 'readonly');
        const store = tx.objectStore('saveData');

        for (let i = 1; i <= this.MAX_SLOTS; i++) {
            const req = store.get(`slot_${i}`);
            req.onsuccess = (e) => {
                if (e.target.result) {
                    const data = e.target.result;
                    const pb = data.personalBest || {};
                    window.saveSlots[i - 1] = {
                        slotId: i,
                        level: data.lvl || 1,
                        kills: data.kills || 0,
                        gold: data.gold || 0,
                        maxFloor: pb.maxFloor || data.floor || 0,
                        maxHellFloor: pb.maxHellFloor || 0,
                        lastPlayed: data.lastPlayed || Date.now(),
                        hasData: true
                    };
                }
                // 当所有槽位都检查完毕后，更新UI
                if (i === this.MAX_SLOTS) {
                    this.updateStartScreenStatus();
                }
            };
        }
    },

    // 更新开始界面状态
    updateStartScreenStatus: function () {
        const statusEl = document.getElementById('save-status');
        const hasAnySave = window.saveSlots && window.saveSlots.some(s => s && s.hasData);
        if (hasAnySave) {
            const filledSlots = window.saveSlots.filter(s => s && s.hasData).length;
            statusEl.innerHTML = `发现 ${filledSlots} 个存档`;
        } else {
            statusEl.innerHTML = '';
        }
    },

    // 保存到当前槽位
    save: function (silent = false) {
        if (!db) return;
        const clean = i => { if (!i) return null; const { el, ...r } = i; return r; };
        const eq = {}; for (let k in player.equipment) eq[k] = clean(player.equipment[k]);
        const data = {
            id: `slot_${this.currentSlot}`,
            slotId: this.currentSlot,
            ...player,
            inventory: player.inventory.map(clean),
            equipment: eq,
            stash: player.stash.map(clean),
            targetItem: clean(player.targetItem),
            townPortal: townPortal,
            settings: Settings,
            autoBattleSettings: AutoBattle.settings,
            lastPlayed: Date.now()
        };
        db.transaction(['saveData'], 'readwrite').objectStore('saveData').put(data);

        if (!silent) showNotification("游戏已保存");
    },

    // 加载指定槽位
    loadSlot: function (slotId) {
        return new Promise((resolve) => {
            if (!db) { resolve(null); return; }
            this.currentSlot = slotId;
            db.transaction(['saveData']).objectStore('saveData').get(`slot_${slotId}`).onsuccess = e => {
                if (e.target.result) {
                    window.pendingLoadData = e.target.result;

                    // Load Settings
                    if (e.target.result.settings) {
                        Object.assign(Settings, e.target.result.settings);
                        document.getElementById('chk-bgm').checked = Settings.bgm;
                        document.getElementById('chk-sfx').checked = Settings.sfx;
                    }
                    resolve(e.target.result);
                } else {
                    window.pendingLoadData = null;
                    resolve(null);
                }
            };
        });
    },

    // 删除指定槽位
    deleteSlot: function (slotId) {
        return new Promise((resolve) => {
            if (!db) { resolve(); return; }
            const tx = db.transaction(['saveData'], 'readwrite');
            tx.objectStore('saveData').delete(`slot_${slotId}`);
            tx.oncomplete = () => {
                if (window.saveSlots) window.saveSlots[slotId - 1] = null;
                resolve();
            };
        });
    },

    // 兼容旧代码的load方法
    load: function () {
        this.loadAllSlotsMeta();
    },

    // 重置当前槽位
    reset: function () {
        if (db) {
            this.deleteSlot(this.currentSlot).then(() => {
                location.reload();
            });
        }
    }
};

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
// 精英怪词缀系统
const ELITE_AFFIXES = [
    {
        id: 'extra_fast',
        name: '额外快速',
        color: '#00ffff',
        description: '移动速度+50%',
        applyStats: (enemy) => {
            enemy.speed *= 1.5;
        }
    },
    {
        id: 'extra_strong',
        name: '额外强壮',
        color: '#ff4400',
        description: '伤害+100%',
        applyStats: (enemy) => {
            enemy.dmg *= 2.0;
        }
    },
    {
        id: 'fire_enchanted',
        name: '火焰强化',
        color: '#ff6600',
        description: '攻击附带火焰伤害，死亡时爆炸',
        applyStats: (enemy) => {
            enemy.elementalDmg = enemy.elementalDmg || {};
            enemy.elementalDmg.fire = Math.floor(enemy.dmg * 0.5);
        },
        onDeath: (enemy) => {
            // 火焰爆炸
            const explosionRadius = 150;
            // 伤害改为15%血量，且上限200
            const explosionDamage = Math.min(enemy.maxHp * 0.15, 200);
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (dist < explosionRadius && player.invincibleTimer <= 0) {
                const dmg = explosionDamage * (1 - dist / explosionRadius);
                const finalDmg = dmg * (1 - player.resistances.fire / 100);
                player.hp -= finalDmg;
                player.lastDamageSource = enemy.name + '的火焰爆炸';
                player.invincibleTimer = 0.3;  // 0.3秒无敌帧
                createDamageNumber(player.x, player.y - 30, Math.floor(finalDmg), '#ff4400');
                showNotification('火焰爆炸！');
                updateUI(); checkPlayerDeath();
            }
            // 爆炸粒子效果
            for (let i = 0; i < 20; i++) {
                createParticle(enemy.x, enemy.y, '#ff4400', 10);
            }
        }
    },
    {
        id: 'cold_enchanted',
        name: '寒冰强化',
        color: '#00aaff',
        description: '攻击附带冰冻效果',
        applyStats: (enemy) => {
            enemy.elementalDmg = enemy.elementalDmg || {};
            enemy.elementalDmg.cold = Math.floor(enemy.dmg * 0.4);
            enemy.freezeOnHit = true;
        }
    },
    {
        id: 'lightning_enchanted',
        name: '闪电强化',
        color: '#ffff00',
        description: '攻击附带闪电伤害',
        applyStats: (enemy) => {
            enemy.elementalDmg = enemy.elementalDmg || {};
            enemy.elementalDmg.lightning = Math.floor(enemy.dmg * 0.6);
        }
    },
    {
        id: 'stone_skin',
        name: '石肤',
        color: '#888888',
        description: '受到伤害减少50%',
        applyStats: (enemy) => {
            enemy.damageReduction = 0.5;
        }
    },
    {
        id: 'magic_resistant',
        name: '魔法抗性',
        color: '#aa00ff',
        description: '技能伤害减免70%',
        applyStats: (enemy) => {
            enemy.magicResist = 0.7;
        }
    },
    {
        id: 'vampiric',
        name: '吸血',
        color: '#cc0000',
        description: '攻击回复生命',
        applyStats: (enemy) => {
            enemy.lifeSteal = 0.5;  // 50%吸血
        }
    },
    {
        id: 'mana_burn',
        name: '法力燃烧',
        color: '#0066ff',
        description: '攻击消耗玩家法力',
        applyStats: (enemy) => {
            enemy.manaBurn = true;
        }
    },
    {
        id: 'cursed',
        name: '诅咒',
        color: '#9900cc',
        description: '降低玩家防御',
        applyStats: (enemy) => {
            enemy.cursed = true;
        }
    },
    {
        id: 'multiple_shot',
        name: '多重射击',
        color: '#ffaa00',
        description: '远程怪物发射3支箭',
        applyStats: (enemy) => {
            if (enemy.ai === 'ranged') {
                enemy.multiShot = 3;
            }
        }
    },
    {
        id: 'spectral_hit',
        name: '幽灵打击',
        color: '#00ffaa',
        description: '无视护甲',
        applyStats: (enemy) => {
            enemy.ignoreArmor = true;
        }
    }
];

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

// 套装系统数据库
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
    }
};

function init() {
    resize(); window.addEventListener('resize', resize);
    initDragging();
    SaveSystem.init();
}
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

function confirmResetSave() {
    // 检查是否有存档
    const statusEl = document.getElementById('save-status');
    // 只要包含"发现存档"字样，就认为有存档
    const hasSave = statusEl && statusEl.innerText.includes('发现存档');

    let message = '⚠️ 警告：此操作将永久删除所有存档数据！\n\n';

    if (hasSave) {
        // 提取存档信息
        const match = statusEl.innerText.match(/发现存档: Lv(\d+) - (.+)/);
        if (match) {
            const level = match[1];
            const location = match[2];
            message += `当前存档：等级 ${level} - ${location}\n\n`;
        }
    }

    message += '是否确定要清除所有存档？\n\n此操作无法撤销！';

    if (confirm(message)) {
        SaveSystem.reset();
    }
}

// ========== 存档选择系统 ==========
let pendingDeleteSlot = null;  // 待删除的槽位

// 显示存档选择面板
function showSlotSelection() {
    const overlay = document.getElementById('slot-selection-overlay');
    const grid = document.getElementById('slot-selection-grid');

    // 渲染3个存档槽位
    grid.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        const slotData = window.saveSlots ? window.saveSlots[i] : null;
        const slotNum = i + 1;

        if (slotData && slotData.hasData) {
            // 有存档的槽位
            const floorText = slotData.maxHellFloor > 0 ? `地狱${slotData.maxHellFloor}层` : `${slotData.maxFloor}层`;
            const lastPlayedText = formatLastPlayed(slotData.lastPlayed);
            const goldText = slotData.gold >= 10000 ? `${(slotData.gold / 10000).toFixed(1)}万` : slotData.gold;

            grid.innerHTML += `
                <div class="slot-card" onclick="selectSlot(${slotNum})">
                    <div class="slot-card-number">#${slotNum}</div>
                    <div class="slot-card-delete" onclick="event.stopPropagation(); showDeleteConfirm(${slotNum})">✕</div>
                    <div class="slot-level">Lv.${slotData.level}</div>
                    <div class="slot-info">
                        <div class="slot-info-row">
                            <span class="slot-info-label">最高</span>
                            <span class="slot-info-value">${floorText}</span>
                        </div>
                        <div class="slot-info-row">
                            <span class="slot-info-label">击杀</span>
                            <span class="slot-info-value">${slotData.kills}</span>
                        </div>
                        <div class="slot-info-row">
                            <span class="slot-info-label">金币</span>
                            <span class="slot-info-value" style="color:#ffd700">${goldText}</span>
                        </div>
                    </div>
                    <div class="slot-last-played">${lastPlayedText}</div>
                </div>
            `;
        } else {
            // 空槽位
            grid.innerHTML += `
                <div class="slot-card empty" onclick="selectSlot(${slotNum})">
                    <div class="slot-card-number">#${slotNum}</div>
                    <div class="slot-empty-icon">+</div>
                    <div class="slot-empty-text">新建角色</div>
                </div>
            `;
        }
    }

    overlay.classList.add('active');
}

// 隐藏存档选择面板
function hideSlotSelection() {
    document.getElementById('slot-selection-overlay').classList.remove('active');
}

// 格式化最后游玩时间
function formatLastPlayed(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return new Date(timestamp).toLocaleDateString('zh-CN');
}

// 选择存档槽位
async function selectSlot(slotNum) {
    hideSlotSelection();
    await SaveSystem.loadSlot(slotNum);
    startGame();
}

// 显示删除确认对话框
function showDeleteConfirm(slotNum) {
    pendingDeleteSlot = slotNum;
    document.getElementById('delete-slot-num').textContent = slotNum;
    document.getElementById('delete-confirm-input').value = '';
    document.getElementById('delete-confirm-btn').disabled = true;
    document.getElementById('delete-slot-confirm').classList.add('active');

    // 监听输入
    const input = document.getElementById('delete-confirm-input');
    input.oninput = () => {
        document.getElementById('delete-confirm-btn').disabled = input.value !== '删除';
    };
    input.focus();
}

// 隐藏删除确认对话框
function hideDeleteConfirm() {
    document.getElementById('delete-slot-confirm').classList.remove('active');
    pendingDeleteSlot = null;
}

// 确认删除存档
async function confirmDeleteSlot() {
    if (!pendingDeleteSlot) return;
    const input = document.getElementById('delete-confirm-input');
    if (input.value !== '删除') return;

    await SaveSystem.deleteSlot(pendingDeleteSlot);
    hideDeleteConfirm();

    // 刷新存档列表
    SaveSystem.loadAllSlotsMeta();
    setTimeout(() => showSlotSelection(), 100);
}

function startGame() {
    AudioSys.init();
    // 启动背景音乐（需要用户交互触发）
    // 延迟一下确保音频上下文完全初始化
    setTimeout(() => {
        AudioSys.startBGM();
    }, 100);
    document.getElementById('start-screen').style.display = 'none';
    if (window.pendingLoadData) {
        Object.assign(player, window.pendingLoadData);
        if (!player.equipment.helm) player.equipment.helm = null;
        if (!player.equipment.gloves) player.equipment.gloves = null;
        if (!player.equipment.boots) player.equipment.boots = null;
        if (!player.equipment.belt) player.equipment.belt = null;
        if (!player.equipment.amulet) player.equipment.amulet = null;

        if (!player.skills) player.skills = { fireball: 1, thunder: 0, multishot: 0 };

        // 向后兼容：套装系统
        if (!player.equippedSets) player.equippedSets = {};

        // 向后兼容：自动拾取设置
        if (!player.autoPickup) {
            player.autoPickup = { gold: true, potion: true, scroll: true };
        }

        if (player.died === undefined) player.died = false; // 初始化死亡标记

        if (!player.achievements) player.achievements = {}; // 初始化成就字段

        // 向后兼容：旧存档没有地狱相关字段，或者已设置为false
        if (player.defeatedBaal === undefined || (player.defeatedBaal === false && window.pendingLoadData)) {
            // 判断条件：已完成所有任务，或到达过第10层，或有相关成就
            const hasCompletedAllQuests = (player.questIndex !== undefined && player.questIndex >= QUEST_DB.length);
            const hasReachedFloor10 = (player.floor >= 10);
            const hasKillBossAchievement = (player.achievements && player.achievements.kill_boss_5 && player.achievements.kill_boss_5.progress >= 5);

            console.log('[地狱模式] 向后兼容检查:', {
                questIndex: player.questIndex,
                floor: player.floor,
                hasKillBoss: hasKillBossAchievement,
                questDBLength: QUEST_DB.length,
                defeatedBaal: player.defeatedBaal
            });

            if (hasCompletedAllQuests || hasReachedFloor10 || hasKillBossAchievement) {
                player.defeatedBaal = true;
                console.log('[地狱模式] 向后兼容：检测到已通关，自动解锁地狱模式');
            } else if (player.defeatedBaal === undefined) {
                player.defeatedBaal = false;
            }
        }

        // 兼容旧存档：如果已击败巴尔但成就未完成，手动完成
        if (player.defeatedBaal && player.achievements && player.achievements['kill_baal'] && !player.achievements['kill_baal'].completed) {
            player.achievements['kill_baal'].progress = 1;
            player.achievements['kill_baal'].completed = true;
            console.log('[成就修复] 检测到已击败巴尔，自动完成"世界拯救者"成就');
        }

        // 初始化成就数据结构
        initAchievements();

        if (player.questIndex === undefined) {
            player.questIndex = 0; player.questState = 0; player.questProgress = 0;
            if (player.quests && player.quests.q2 === 2) player.questIndex = QUEST_DB.length;
        }
        // Cleanup legacy
        if (player.quests) delete player.quests;

        // 确保 thunder 技能已初始化
        if (player.skills.thunder === undefined || isNaN(player.skills.thunder)) {
            player.skills.thunder = 0;
        }
        if (player.skillCooldowns.thunder === undefined) {
            player.skillCooldowns.thunder = 0;
        }

        // 加载仓库数据（如果没有则使用默认空仓库，如果存档是旧版60格则截断为36格）
        if (window.pendingLoadData.stash) {
            // 如果存档是60格，截断为36格
            if (window.pendingLoadData.stash.length === 60) {
                player.stash = window.pendingLoadData.stash.slice(0, 36);
            } else {
                player.stash = window.pendingLoadData.stash;
            }
        } else if (!player.stash) {
            player.stash = Array(36).fill(null);
        }

        if (window.pendingLoadData.townPortal) {
            townPortal = window.pendingLoadData.townPortal;
            // 修复：加载存档时强制验证传送门位置，解决旧存档卡墙问题
            if (townPortal) {
                const fixed = validateAndFixPortalPosition(townPortal.x, townPortal.y);
                townPortal.x = fixed.x;
                townPortal.y = fixed.y;
            }
        }
        if (window.pendingLoadData.autoBattleSettings) {
            Object.assign(AutoBattle.settings, window.pendingLoadData.autoBattleSettings);
            syncAutoBattleUI();
        }
        if (isNaN(player.xp)) player.xp = 0;
        if (isNaN(player.xpNext) || player.xpNext <= 0) player.xpNext = 100 * Math.pow(1.5, player.lvl - 1);
        // 向后兼容：旧存档没有 maxFloor/lastFloor
        if (player.maxFloor === undefined) player.maxFloor = player.floor || 0;
        if (player.lastFloor === undefined) player.lastFloor = player.floor || 0;
        // 向后兼容：旧存档没有掉落系统幸运值
        if (player.luckAccumulator === undefined) player.luckAccumulator = 0;
        if (player.killsSincePotion === undefined) player.killsSincePotion = 0;

        // 向后兼容：旧存档没有天赋系统
        if (!player.talents) player.talents = [];
        if (!player.talentShop) player.talentShop = [];
        if (player.phoenixUsed === undefined) player.phoenixUsed = false;
        if (player.highestTalentFloor === undefined) player.highestTalentFloor = 0;
        if (player.highestHellTalentFloor === undefined) player.highestHellTalentFloor = 0;
        if (player.talentRefreshCount === undefined) player.talentRefreshCount = 0;

        // 向后兼容：旧存档没有天神赐福系统
        if (!player.divineBlessing) player.divineBlessing = { pending: 0, obtained: [] };
        if (player.lastBlessingLevel === undefined) player.lastBlessingLevel = Math.floor(player.lvl / 5) * 5;

        // 向后兼容：旧存档没有每日登录系统
        if (!player.dailyLogin) player.dailyLogin = { lastLoginDate: null, consecutiveDays: 0, claimedToday: false };

        // 向后兼容：旧存档没有统计和个人最佳系统 v4.9
        if (!player.stats) {
            player.stats = {
                totalGold: 0, uniqueFound: 0, setFound: 0,
                bossKills: 0, eliteKills: 0, maxKillStreak: 0, currentStreak: 0
            };
        }
        if (!player.personalBest) {
            player.personalBest = {
                maxLevel: player.lvl || 1,
                maxFloor: player.maxFloor || player.floor || 0,
                maxHellFloor: player.hellFloor || 0,
                maxKills: player.kills || 0,
                maxGold: player.gold || 0,
                fastestBaal: null
            };
        }

        // 向后兼容：旧存档没有新手引导系统，老玩家直接标记为完成
        if (!player.tutorial) {
            player.tutorial = { completed: true, step: 5 };
        }

        // ========== 属性系统迁移 v3.9 ==========
        // 将旧的基础属性(str/dex/vit/ene)转换为直接效果属性
        migrateItemStats();
    }
    else {
        // 新玩家初始装备：白色短剑（无等级需求）
        const starterSword = createItem('短剑', 0);
        starterSword.rarity = 1;  // 强制白色
        starterSword.requirements = null;  // 移除需求限制
        addItemToInventory(starterSword);
        addItemToInventory(createItem('治疗药剂', 0));
        addItemToInventory(createItem('回城卷轴', 0));
        player.floor = 0;

        // 新游戏初始化成就
        player.died = false;
        player.achievements = {};
        initAchievements();
    }

    // 同步自动拾取设置的复选框状态
    document.getElementById('chk-auto-gold').checked = player.autoPickup.gold;
    document.getElementById('chk-auto-potion').checked = player.autoPickup.potion;
    document.getElementById('chk-auto-scroll').checked = player.autoPickup.scroll;

    updateStats(); enterFloor(player.floor, 'start'); renderInventory(); updateStatsUI(); updateSkillsUI(); updateUI(); updateBeltUI(); updateQuestUI(); updateMenuIndicators();
    updateTalentHUD(); // 更新天赋HUD显示
    updateDivineBlessingHUD(); // 更新天神赐福HUD
    checkDailyLogin(); // 检查每日登录奖励
    checkTutorial(); // 检查新手引导
    gameActive = true; gameLoop(0); spawnEnemyTimer();
}

// Revised enterFloor with spawn point logic
function enterFloor(f, spawnAt = 'start') {
    // 根据是否在地狱中更新不同的层数
    if (player.isInHell) {
        player.hellFloor = f;
    } else {
        player.floor = f;
        // 更新最高层记录（仅普通地牢，地狱模式不计入）
        if (f > player.maxFloor) {
            player.maxFloor = f;
        }
    }

    // 更新个人最佳记录
    updatePersonalBest();

    // 提交排行榜（进入新楼层时更新）
    if (typeof OnlineSystem !== 'undefined') {
        OnlineSystem.submitScore({
            level: player.lvl,
            kills: player.kills,
            maxFloor: player.isInHell ? player.hellFloor + 10 : player.floor,
            isHell: player.isInHell
        });
    }

    // 回收所有敌人到对象池
    enemies.forEach(e => EnemyPool.release(e));
    enemies = []; groundItems = []; projectiles = []; npcs = [];

    // 清空A*寻路缓存（新楼层需要重新计算路径）
    if (AutoBattle.astarCache) {
        AutoBattle.astarCache.path = null;
        AutoBattle.astarCache.targetX = null;
        AutoBattle.astarCache.targetY = null;
        AutoBattle.astarCache.currentIndex = 0;
    }

    // 成就追踪：到达楼层
    trackAchievement('reach_floor', { floor: f });

    // 修复：切换楼层/死亡复活时，强制清空地面的物品标签
    document.getElementById('world-labels').innerHTML = '';

    if (f === 0) {
        // 进入罗格营地时，重置地狱状态
        if (player.isInHell) {
            player.isInHell = false;
        }

        // 进入罗格营地时重置天赋（天赋只在一次探险中有效）
        resetTalents();

        document.getElementById('floor-display').innerText = "罗格营地";
        generateTown();
        npcs.push({ x: dungeonEntrance.x - 100, y: dungeonEntrance.y - 100, name: "基格商人", type: "merchant", radius: 20, frameIndex: 1 });
        npcs.push({ x: dungeonEntrance.x + 100, y: dungeonEntrance.y - 50, name: "阿卡拉", type: "healer", radius: 20, quest: 'q1', frameIndex: 2 });
        npcs.push({ x: dungeonEntrance.x, y: dungeonEntrance.y + 100, name: "瓦瑞夫（仓库）", type: "stash", radius: 20, frameIndex: 0 });
        npcs.push({ x: dungeonEntrance.x + 80, y: dungeonEntrance.y + 80, name: "恰西铁匠", type: "blacksmith", radius: 20, frameIndex: 5 });

        // 始终添加地狱守卫，但交互需要条件
        npcs.push({ x: dungeonEntrance.x - 150, y: dungeonEntrance.y + 50, name: "地狱守卫", type: "difficulty", radius: 20, frameIndex: 3 });

        // 洗点师 - 神秘贤者
        npcs.push({ x: dungeonEntrance.x + 150, y: dungeonEntrance.y + 50, name: "神秘贤者", type: "respec", radius: 20, frameIndex: 4 });

        showNotification("欢迎回到罗格营地");

        // ==== Boss 刷新检查 ==== //
        // 罗格营地也可以有BOSS攻城事件（可选），这里暂时保持只检查配置
        const bossInfo = getBossSpawnInfo(f);
        if (bossInfo) {
            const now = Date.now();
            const nextRespawn = player.bossRespawn[f] || 0;
            if (now >= nextRespawn) {
                // 修正：在罗格营地生成演示用BOSS，或者干脆不生成
                // 原逻辑是检查 floorBossMap[f]，这里 f=0
                // 下面的代码其实只会在 f > 0 时更有意义，但保留原意
            }
        }

        // 进入罗格营地时，确保BGM播放
        AudioSys.resumeBGM();

        // 验证传送门位置（如果从地牢返回）
        if (spawnAt === 'portal' && townPortal) {
            const safePortalPos = validateAndFixPortalPosition(townPortal.x, townPortal.y);
            townPortal.x = safePortalPos.x;
            townPortal.y = safePortalPos.y;
        }

        if (spawnAt === 'end') { player.x = dungeonExit.x; player.y = dungeonExit.y + 40; }
        else if (spawnAt === 'portal') { if (townPortal) { player.x = townPortal.x; player.y = townPortal.y + 40; } else { player.x = dungeonEntrance.x; player.y = dungeonEntrance.y; } }
        else { player.x = dungeonEntrance.x; player.y = dungeonEntrance.y; }

        // 更新地狱指示器（确保进入营地时隐藏）
        updateHellIndicator();
    } else {
        // 根据是否在地狱显示不同的层数名称
        const isInHell = player.isInHell || false;
        const displayFloor = isInHell ? player.hellFloor : f;
        document.getElementById('floor-display').innerText = isInHell ? `地狱 ${displayFloor}层` : `地牢 ${displayFloor}层`;

        generateDungeon();

        // 获取当前难度系数（在地狱中始终使用hell难度）
        const difficulty = isInHell ? DIFFICULTY_MODIFIERS.hell : DIFFICULTY_MODIFIERS.normal;

        for (let i = 0; i < 15; i++) {
            let x, y, v = false; while (!v) { x = Math.random() * MAP_WIDTH * TILE_SIZE; y = Math.random() * MAP_HEIGHT * TILE_SIZE; if (!isWall(x, y) && Math.hypot(x - dungeonEntrance.x, y - dungeonEntrance.y) > 300) v = true; }

            // 构建当前层可用的怪物池
            const monsterPool = [
                { type: 'melee', name: '沉沦魔', ai: 'chase', speed: 80, hpMult: 1, dmgMult: 1, weight: 20 }
            ];
            if (f >= 1) monsterPool.push({ type: 'zombie', name: '僵尸', ai: 'chase', speed: 50, hpMult: 1.5, dmgMult: 0.8, weight: 20 });
            if (f >= 2) {
                monsterPool.push({ type: 'ranged', name: '骷髅弓箭手', ai: 'ranged', speed: 70, hpMult: 1, dmgMult: 1, weight: 20 });
                monsterPool.push({ type: 'skeleton', name: '骷髅战士', ai: 'chase', speed: 85, hpMult: 1, dmgMult: 1, weight: 15 });
            }
            if (f >= 3) monsterPool.push({ type: 'shaman', name: '沉沦魔巫师', ai: 'revive', speed: 60, hpMult: 1, dmgMult: 1, weight: 10 });
            if (f >= 4) monsterPool.push({ type: 'ghost', name: '幽灵鬼魂', ai: 'phase', speed: 90, hpMult: 0.6, dmgMult: 1.2, weight: 12 });
            if (f >= 5) monsterPool.push({ type: 'specter', name: '闪电幽魂', ai: 'ranged', speed: 75, hpMult: 1, dmgMult: 1.3, weight: 10 });
            if (f >= 6) monsterPool.push({ type: 'mummy', name: '木乃伊', ai: 'chase', speed: 55, hpMult: 1.3, dmgMult: 0.9, weight: 10 });
            if (f >= 7) monsterPool.push({ type: 'vampire', name: '吸血鬼', ai: 'ranged', speed: 80, hpMult: 1.2, dmgMult: 1.1, weight: 10 });

            // 按权重随机选择怪物
            const totalWeight = monsterPool.reduce((sum, m) => sum + m.weight, 0);
            let rand = Math.random() * totalWeight;
            let selected = monsterPool[0];
            for (const monster of monsterPool) {
                rand -= monster.weight;
                if (rand <= 0) { selected = monster; break; }
            }

            // 基础属性
            let baseHp = 30 + Math.floor(f * f * 5);
            let baseDmg = 5 + f * 2;
            let baseXp = 20 + f * 5;

            if (isInHell) {
                baseHp = 60 + Math.floor(f * f * 10);
                baseDmg = 10 + f * 4;
                baseXp = 40 + f * 10;
            }

            // 应用难度系数和怪物类型倍率
            let hp = Math.floor(baseHp * difficulty.monsterHpMult * selected.hpMult);
            let dmg = Math.floor(baseDmg * difficulty.monsterDmgMult * selected.dmgMult);
            let speed = Math.floor(selected.speed * difficulty.monsterSpeedMult);
            let xpValue = Math.floor(baseXp * difficulty.xpMult);

            const enemy = EnemyPool.acquire({
                x, y, hp, maxHp: hp, dmg, speed, radius: 12,
                dead: false, cooldown: 0,
                name: isInHell ? "地狱" + selected.name : selected.name,
                rarity: Math.random() < 0.1 ? 1 : 0, xpValue: xpValue,
                ai: selected.ai,
                monsterType: selected.type,
                frameIndex: MONSTER_FRAMES[selected.type]
            });

            // 为特殊怪物添加额外属性
            if (selected.type === 'ghost') { enemy.phaseThrough = true; enemy.dodgeChance = 0.3; }
            if (selected.type === 'mummy') { enemy.poisonOnHit = true; enemy.poisonDamage = Math.floor(dmg * 0.3); }
            if (selected.type === 'vampire') { enemy.lifeSteal = 0.2; }

            enemies.push(enemy);
        }
        // 无限层级BOSS生成逻辑
        const bossData = getBossSpawnInfo(f);
        // 检查该层BOSS是否在刷新冷却中
        const now = Date.now();
        const nextRespawn = player.bossRespawn[f] || 0;
        const bossCanSpawn = now >= nextRespawn;

        if (bossData && bossCanSpawn) {
            const currentQ = getCurrentQuest();
            const isQuestTarget = currentQ && player.questState === 1 && currentQ.floor === f;

            // 如果是任务目标，或者单纯是该层对应的BOSS
            let x = dungeonExit.x, y = dungeonExit.y;
            // 不在出口生成，随机找个空地，除非是第5/10层这种守关BOSS
            if ((f % 5) !== 0) {
                let v = false;
                while (!v) {
                    x = Math.random() * MAP_WIDTH * TILE_SIZE;
                    y = Math.random() * MAP_HEIGHT * TILE_SIZE;
                    if (!isWall(x, y)) v = true;
                }
            }

            // 应用难度系数
            let hp = Math.floor(bossData.hp * difficulty.monsterHpMult);
            let dmg = Math.floor(bossData.dmg * difficulty.monsterDmgMult);
            let speed = Math.floor(bossData.speed * difficulty.monsterSpeedMult);
            let xpValue = Math.floor(bossData.xp * difficulty.xpMult);

            // 在地狱模式下，属性额外提升（叠加前面的难度系数）
            if (isInHell) {
                hp = Math.floor(hp * 1.5);
                dmg = Math.floor(dmg * 1.2);
                xpValue = Math.floor(xpValue * 1.5);
            }

            enemies.push(EnemyPool.acquire({
                x, y, hp, maxHp: hp, dmg, speed, radius: 30,
                dead: false, cooldown: 0, name: bossData.name,
                isBoss: true,
                isQuestTarget: isQuestTarget, // 标记是否为任务目标
                xpValue: xpValue,
                ai: 'chase',
                frameIndex: getBossFrameIndex(bossData.originalName),
                // 赋予一些精英词缀
                eliteAffixes: isInHell || f > 10 ? [ELITE_AFFIXES[Math.floor(Math.random() * ELITE_AFFIXES.length)]] : []
            }));

            const noticeText = isQuestTarget ? `警告：发现了 ${bossData.name}！` : `遭遇强敌：${bossData.name}！`;
            showNotification(noticeText);
        }
        showNotification(`进入第 ${f} 层`);

        // 进入地牢时，确保BGM播放（如果之前被暂停）
        AudioSys.resumeBGM();

        // 验证地牢层的传送门位置（如果从罗格营地传送过来）
        if (spawnAt === 'portal' && townPortal) {
            const safeDungeonPos = validateAndFixDungeonPortalPosition(townPortal.x, townPortal.y);
            townPortal.x = safeDungeonPos.x;
            townPortal.y = safeDungeonPos.y;
        }

        if (spawnAt === 'end') { player.x = dungeonExit.x; player.y = dungeonExit.y; }
        else if (spawnAt === 'portal') { if (townPortal) { player.x = townPortal.x; player.y = townPortal.y; } else { player.x = dungeonEntrance.x; player.y = dungeonEntrance.y; } }
        else { player.x = dungeonEntrance.x; player.y = dungeonEntrance.y; }
    }
    player.targetX = null; updateQuestTracker(); SaveSystem.save();
}

function generateTown() {
    mapData = []; visitedMap = [];
    for (let y = 0; y < MAP_HEIGHT; y++) { mapData.push(new Array(MAP_WIDTH).fill(0)); visitedMap.push(new Array(MAP_WIDTH).fill(true)); }
    const cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2); const r = 10;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (Math.hypot(x - cx, y - cy) < r) mapData[y][x] = 1;
    dungeonEntrance = { x: cx * TILE_SIZE, y: cy * TILE_SIZE }; dungeonExit = { x: cx * TILE_SIZE, y: (cy - r + 2) * TILE_SIZE };
}

// 验证并修正传送门位置，确保在罗格营地的有效区域内
function validateAndFixPortalPosition(x, y) {
    // 检查当前位置是否在罗格营地的圆形区域内
    const cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
    const r = 10;
    const tileX = Math.floor(x / TILE_SIZE), tileY = Math.floor(y / TILE_SIZE);
    const distFromCenter = Math.hypot(tileX - cx, tileY - cy);

    // 留出2个格子的安全缓冲距离（避免贴墙导致卡住）
    // r=10 (墙壁), r-1=9 (地板边缘), r-2=8 (安全地板)
    const safeRadius = r - 2;

    // 如果位置在有效区域内，返回原位置
    if (distFromCenter < safeRadius) {
        return { x: x, y: y };
    }

    // 如果位置无效，找到最近的圆形边界上的有效位置
    // 计算从中心到目标位置的方向向量
    const dx = tileX - cx, dy = tileY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
        // 归一化方向向量并缩放到圆形边界内
        const nx = dx / dist, ny = dy / dist;
        const targetX = cx + nx * safeRadius;
        const targetY = cy + ny * safeRadius;

        return {
            x: Math.max(0, Math.min((MAP_WIDTH - 1) * TILE_SIZE, targetX * TILE_SIZE)),
            y: Math.max(0, Math.min((MAP_HEIGHT - 1) * TILE_SIZE, targetY * TILE_SIZE))
        };
    } else {
        // 如果距离为0（就在中心），使用默认的安全位置
        return { x: cx * TILE_SIZE, y: cy * TILE_SIZE };
    }
}

// 验证并修正地牢层的传送门位置，确保不在墙里
function validateAndFixDungeonPortalPosition(x, y) {
    // 首先检查当前位置是否有效（不是墙）
    if (!isWall(x, y)) {
        return { x: x, y: y };
    }

    // 如果位置无效，在附近寻找有效位置
    const searchRadius = 3; // 搜索半径（格子数）
    const centerTileX = Math.floor(x / TILE_SIZE);
    const centerTileY = Math.floor(y / TILE_SIZE);

    // 螺旋搜索，从近到远
    for (let r = 1; r <= searchRadius; r++) {
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                // 只检查边界上的点
                if (Math.abs(dx) === r || Math.abs(dy) === r) {
                    const testTileX = centerTileX + dx;
                    const testTileY = centerTileY + dy;
                    const testX = testTileX * TILE_SIZE;
                    const testY = testTileY * TILE_SIZE;

                    // 检查边界
                    if (testTileX >= 0 && testTileX < MAP_WIDTH && testTileY >= 0 && testTileY < MAP_HEIGHT) {
                        if (!isWall(testX, testY)) {
                            return { x: testX, y: testY };
                        }
                    }
                }
            }
        }
    }

    // 如果还是没找到，使用地牢入口作为后备方案
    return { x: dungeonEntrance.x, y: dungeonEntrance.y };
}

function generateDungeon() {
    mapData = []; visitedMap = [];
    for (let y = 0; y < MAP_HEIGHT; y++) { mapData.push(new Array(MAP_WIDTH).fill(0)); visitedMap.push(new Array(MAP_WIDTH).fill(false)); }
    let floors = 0, target = MAP_WIDTH * MAP_HEIGHT * 0.3;
    let cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
    dungeonEntrance = { x: cx * TILE_SIZE + TILE_SIZE / 2, y: cy * TILE_SIZE + TILE_SIZE / 2 };
    while (floors < target) {
        mapData[cy][cx] = 1; floors++;
        const d = Math.floor(Math.random() * 4);
        if (d === 0) cy--; else if (d === 1) cy++; else if (d === 2) cx--; else cx++;
        if (cx < 1) cx = 1; if (cx > MAP_WIDTH - 2) cx = MAP_WIDTH - 2; if (cy < 1) cy = 1; if (cy > MAP_HEIGHT - 2) cy = MAP_HEIGHT - 2;
        if (mapData[cy][cx] === 0) { mapData[cy][cx] = 1; floors++; }
    }
    let maxD = 0; let sx = Math.floor(dungeonEntrance.x / TILE_SIZE), sy = Math.floor(dungeonEntrance.y / TILE_SIZE);
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) if (mapData[y][x] === 1) { const d = Math.hypot(x - sx, y - sy); if (d > maxD) { maxD = d; dungeonExit.x = x * TILE_SIZE + TILE_SIZE / 2; dungeonExit.y = y * TILE_SIZE + TILE_SIZE / 2; } }
}

function gameLoop(ts) {
    if (!gameActive) return;
    const dt = Math.min((ts - lastTime) / 1000, 0.1); lastTime = ts;
    update(dt); draw();
    autoSaveTimer += dt; if (autoSaveTimer > GAME_CONFIG.AUTO_SAVE_INTERVAL) { SaveSystem.save(); autoSaveTimer = 0; }
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    // 天赋商店打开时暂停游戏（不更新敌人和战斗）
    if (talentShopOpen) return;

    mouse.worldX = mouse.x + camera.x; mouse.worldY = mouse.y + camera.y;
    // 基础生命/法力恢复（大幅降低基础值，装备回复改为百分比加成）
    let hpRegen = 0.5;  // 基础0.5/秒
    let mpRegen = 1.0;  // 基础1/秒（从1.5降低）
    // 再生天赋+天神赐福：每秒额外恢复X%最大生命
    const hpRegenPct = getTalentEffect('hpRegenPct', 0) + (player.hpRegenPct || 0) + (player.hpRegen || 0);
    if (hpRegenPct > 0) {
        hpRegen += player.maxHp * hpRegenPct / 100;
    }
    // 法力涌动天赋+天神赐福+装备：法力恢复+X%（装备mpRegen现在也是百分比）
    const mpRegenPct = getTalentEffect('mpRegenPct', 0) + (player.mpRegenPct || 0) + (player.mpRegen || 0);
    if (mpRegenPct > 0) {
        mpRegen += player.maxMp * mpRegenPct / 100;  // 改为基于最大法力的百分比
    }
    if (player.hp < player.maxHp) player.hp += hpRegen * dt;
    if (player.mp < player.maxMp) player.mp += mpRegen * dt;
    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    if (player.attackAnim > 0) player.attackAnim -= dt * 5;
    if (player.invincibleTimer > 0) player.invincibleTimer -= dt;  // 无敌帧倒计时
    for (let k in player.skillCooldowns) if (player.skillCooldowns[k] > 0) player.skillCooldowns[k] -= dt;

    // 处理死亡倒计时
    if (player.isDead) {
        player.deathTimer -= dt;
        if (player.deathTimer <= 0) {
            // 倒计时结束，执行回城
            player.isDead = false;
            player.deathTimer = 0;
            player.hp = player.maxHp;

            // 重置地狱状态（死亡后回到普通世界）
            const wasInHell = player.isInHell;
            player.isInHell = false;

            // 移除灰度滤镜
            document.getElementById('game-container').classList.remove('dead-filter');

            // 传送回营地
            enterFloor(0);
            if (wasInHell) {
                showNotification('已从地狱返回');
            }
        }
        return; // 死亡时不执行其他更新逻辑
    }

    // 定期清理死亡敌人（每3秒，使用对象池回收）
    cleanupTimer += dt;
    if (cleanupTimer > 3) {
        cleanupTimer = 0;
        // 使用原地过滤算法，避免创建新数组
        let writeIdx = 0;
        for (let readIdx = 0; readIdx < enemies.length; readIdx++) {
            const e = enemies[readIdx];
            // 保留活着的敌人，以及200像素内的尸体（用于复活者AI）
            if (!e.dead || Math.hypot(e.x - player.x, e.y - player.y) < 200) {
                enemies[writeIdx++] = e;
            } else {
                // 回收到对象池
                EnemyPool.release(e);
            }
        }
        enemies.length = writeIdx; // 截断数组

        // 清理过期地面物品
        const now = Date.now();
        const oldCount = groundItems.length;
        groundItems = groundItems.filter(item => {
            if (!item.dropTime) return true; // 没有时间戳的物品保留（兼容旧存档）
            const age = now - item.dropTime;
            // 暗金(4)、套装(5)、金币 永不消失
            if (item.rarity >= 4 || item.type === 'gold') return true;
            // 黄装(3) 5分钟后消失
            if (item.rarity === 3) return age < GAME_CONFIG.ITEM_DESPAWN_RARE;
            // 白/蓝装及其他 2分钟后消失
            return age < GAME_CONFIG.ITEM_DESPAWN_COMMON;
        });
        if (groundItems.length < oldCount) {
            updateWorldLabels(); // 有物品被清理时更新标签
        }
    }

    // 处理冰冻状态（硬控0.5秒 → 减速1.5秒 → 免疫5秒）
    if (player.frozenTimer > 0) {
        player.frozenTimer -= dt;
        if (player.frozenTimer <= 0) {
            player.frozen = false;
            player.slowedTimer = 1.5;  // 进入减速期1.5秒
        }
    }
    // 处理减速期
    if (player.slowedTimer > 0) {
        player.slowedTimer -= dt;
        if (player.slowedTimer <= 0) {
            player.freezeImmuneTimer = 5.0; // 减速结束后5秒免疫
        }
    }
    // 处理冰冻免疫时间
    if (player.freezeImmuneTimer > 0) {
        player.freezeImmuneTimer -= dt;
    }

    // 处理中毒伤害
    if (player.poisoned && player.poisonTimer > 0) {
        player.poisonTimer -= dt;
        // 每0.5秒造成一次毒伤
        if (!player.lastPoisonTick) player.lastPoisonTick = 0;
        player.lastPoisonTick += dt;
        if (player.lastPoisonTick >= 0.5) {
            player.lastPoisonTick = 0;
            const poisonDmg = Math.max(1, Math.floor(player.poisonDamage * (1 - player.resistances.poison / 100)));
            player.hp -= poisonDmg;
            createDamageNumber(player.x, player.y - 20, poisonDmg, '#00ff00');
            checkPlayerDeath();
        }
        if (player.poisonTimer <= 0) {
            player.poisoned = false;
            player.poisonDamage = 0;
        }
    }

    // 自动战斗系统（营地不执行，面板打开时暂停）
    if (AutoBattle.enabled && !player.frozen && player.floor !== 0 && !isAnyPanelOpen()) {
        AutoBattle.decideAction(dt);
    }

    interactionTarget = null;
    const distExit = Math.hypot(player.x - dungeonExit.x, player.y - dungeonExit.y);
    if (distExit < GAME_CONFIG.INTERACTION_RANGE) {
        const isInHell = player.isInHell || false;
        if (player.floor === 0) {
            interactionTarget = { type: 'next', label: '进入地牢 1层' };
        } else {
            if (isInHell) {
                // 在地狱中，出口逻辑
                if (player.hellFloor >= 10) {
                    interactionTarget = { type: 'prev', label: '返回营地' };
                } else {
                    interactionTarget = { type: 'next', label: `进入地狱 ${player.hellFloor + 1}层` };
                }
            } else {
                interactionTarget = { type: 'next', label: `进入地牢 ${player.floor + 1}层` };
            }
        }
    }
    // 入口交互：地牢层数>0 或者在地狱中
    if (player.floor > 0 || player.isInHell) {
        const distEnt = Math.hypot(player.x - dungeonEntrance.x, player.y - dungeonEntrance.y);
        if (distEnt < 60) {
            const isInHell = player.isInHell || false;
            if (isInHell) {
                // 在地狱中，入口逻辑
                if (player.hellFloor === 1) {
                    interactionTarget = { type: 'prev', label: '返回营地' };
                } else {
                    interactionTarget = { type: 'prev', label: `回到地狱 ${player.hellFloor - 1}层` };
                }
            } else {
                const label = player.floor === 1 ? '回到罗格营地' : `回到地牢 ${player.floor - 1}层`;
                interactionTarget = { type: 'prev', label: label };
            }
        }
    }
    // 传送门交互只在普通地牢中有效，地狱中无效
    if (townPortal && townPortal.activeFloor === player.floor && !player.isInHell) {
        const distPortal = Math.hypot(player.x - townPortal.x, player.y - townPortal.y);
        if (distPortal < 60) {
            const label = player.floor === 0 ? '进入传送门' : '回到罗格营地';
            interactionTarget = { type: 'portal', label: label };
        }
    }

    const promptEl = document.getElementById('interaction-msg');
    if (interactionTarget) {
        promptEl.style.display = 'block';
        promptEl.innerHTML = `按 [Enter] ${interactionTarget.label}`;
    } else {
        promptEl.style.display = 'none';
    }

    // 自动拾取系统：金币、药水、卷轴
    for (let i = groundItems.length - 1; i >= 0; i--) {
        let item = groundItems[i];
        const distance = Math.hypot(item.x - player.x, item.y - player.y);

        // 检查是否在拾取范围内（60像素）
        if (distance < 60) {
            let shouldPickup = false;

            // 根据物品类型和设置判断是否拾取
            if (item.type === 'gold' && player.autoPickup.gold) {
                addGold(item.val);
                createDamageNumber(player.x, player.y - 40, `+${item.val} G`, 'gold');
                AudioSys.play('gold');
                shouldPickup = true;
            } else if (item.type === 'potion' && player.autoPickup.potion) {
                if (addItemToInventory(item)) {
                    showNotification(`自动拾取：${item.displayName || item.name}`);
                    shouldPickup = true;
                }
            } else if (item.type === 'scroll' && player.autoPickup.scroll) {
                if (addItemToInventory(item)) {
                    showNotification(`自动拾取：${item.displayName || item.name}`);
                    shouldPickup = true;
                }
            }

            // 如果成功拾取，从地面移除
            if (shouldPickup) {
                if (item.el) item.el.remove();
                groundItems.splice(i, 1);
            }
        }
    }

    if (mouse.leftDown && !isHoveringUI()) {
        const t = getEnemyAtCursor();
        const npc = getNPCAtCursor();
        // NPC交互只在点击瞬间触发一次，避免面板闪烁
        if (npc && Math.hypot(npc.x - player.x, npc.y - player.y) < 60) {
            if (mouse.leftClick) {
                player.targetX = null;
                interactNPC(npc);
                mouse.leftClick = false; // 消费掉点击，避免重复触发
            }
        } else if (t) {
            if (Math.hypot(t.x - player.x, t.y - player.y) < 50) { player.targetX = null; performAttack(t); }
            else { player.targetX = t.x; player.targetY = t.y; }
        } else { player.targetX = mouse.worldX; player.targetY = mouse.worldY; }
    }

    if (player.targetX !== null) {
        const dx = player.targetX - player.x, dy = player.targetY - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
            if (Math.abs(dx) > Math.abs(dy)) {
                player.direction = dx > 0 ? 'right' : 'left';
            } else {
                player.direction = dy > 0 ? 'front' : 'back';
            }
            const speedMultiplier = player.frozen ? 0 : (player.slowedTimer > 0 ? 0.4 : 1.0);  // 冰冻时完全不能动，减速期40%速度
            const move = player.speed * dt * speedMultiplier;
            const nx = player.x + (dx / dist) * move, ny = player.y + (dy / dist) * move;
            if (!isWall(nx, player.y)) player.x = nx;
            if (!isWall(player.x, ny)) player.y = ny;
            if (isWall(nx, ny) && isWall(nx, player.y) && isWall(player.x, ny)) player.targetX = null;
        } else {
            // 到达目标位置
            player.targetX = null;

            // 检查是否有待拾取的物品
            if (player.targetItem) {
                const item = player.targetItem;
                const finalDistance = Math.hypot(item.x - player.x, item.y - player.y);

                // 确保在拾取范围内
                if (finalDistance < 100) {
                    if (item.type === 'gold') {
                        // 拾取金币
                        addGold(item.val);
                        createDamageNumber(player.x, player.y - 40, "+" + item.val + "G", 'gold');
                        AudioSys.play('gold');
                    } else {
                        // 拾取物品到背包
                        if (!addItemToInventory(item)) {
                            // 背包满了，检查是否是高优先级物品（套装、暗金、紧急药水）需要腾空间
                            const isHighPriority = item.rarity >= 4 ||
                                (item.name === CONSUMABLE_NAME.MANA_POTION && !player.inventory.find(i => i && i.name === CONSUMABLE_NAME.MANA_POTION)) ||
                                (item.name === CONSUMABLE_NAME.HEALTH_POTION && !player.inventory.find(i => i && i.name === CONSUMABLE_NAME.HEALTH_POTION));

                            if (isHighPriority && AutoBattle.enabled) {
                                // 尝试丢弃低价值装备腾空间
                                const forSet = item.rarity === 5 || item.name === CONSUMABLE_NAME.MANA_POTION || item.name === CONSUMABLE_NAME.HEALTH_POTION;
                                let dropped = false;
                                for (let i = 0; i < player.inventory.length; i++) {
                                    const it = player.inventory[i];
                                    if (!it) continue;
                                    // 永远不丢：套装、暗金、药水、卷轴
                                    if (isProtectedItem(it)) continue;
                                    // 为高优先级物品腾空间时，稀有(黄)也可以丢
                                    if (forSet || it.rarity < 3) {
                                        // 丢弃这件装备
                                        groundItems.push({ ...it, x: player.x + (Math.random() - 0.5) * 40, y: player.y + (Math.random() - 0.5) * 40 });
                                        player.inventory[i] = null;
                                        showNotification(`丢弃 ${it.displayName || it.name} 腾出空间`);
                                        dropped = true;
                                        break;
                                    }
                                }
                                if (dropped) {
                                    // 再次尝试拾取
                                    if (!addItemToInventory(item)) {
                                        createFloatingText(player.x, player.y - 40, "背包已满！", COLORS.warning, 1.5);
                                        player.targetItem = null;
                                        return;
                                    }
                                } else {
                                    createFloatingText(player.x, player.y - 40, "背包已满！", COLORS.warning, 1.5);
                                    player.targetItem = null;
                                    return;
                                }
                            } else {
                                createFloatingText(player.x, player.y - 40, "背包已满！", COLORS.warning, 1.5);
                                player.targetItem = null;
                                return; // 不要移除地面物品
                            }
                        }
                    }

                    // 从地面移除物品和UI元素
                    groundItems = groundItems.filter(x => x !== item);
                    if (item.el) item.el.remove();
                    updateLabelsPosition();
                }

                player.targetItem = null; // 清除目标物品
            }
        }
    }

    const pc = Math.floor(player.x / TILE_SIZE), pr = Math.floor(player.y / TILE_SIZE);
    for (let y = pr - 8; y <= pr + 8; y++) for (let x = pc - 8; x <= pc + 8; x++) if (y >= 0 && y < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH && mapData[y][x]) visitedMap[y][x] = true;
    camera.x = player.x - canvas.width / 2; camera.y = player.y - canvas.height / 2;

    updateEnemies(dt);

    projectiles.forEach((p, i) => {
        p.life -= dt; p.x += Math.cos(p.angle) * p.speed * dt; p.y += Math.sin(p.angle) * p.speed * dt;
        if (isWall(p.x, p.y)) { p.life = 0; for (let j = 0; j < 3; j++)createParticle(p.x, p.y, '#aaa', 2); }

        // 如果投射物有owner（怪物发射的），检测是否击中玩家
        if (p.owner && p.owner !== player) {
            if (Math.hypot(p.x - player.x, p.y - player.y) < player.radius + 10 && player.invincibleTimer <= 0) {
                const dmg = Math.max(0, p.damage - player.armor * 0.1);
                player.hp -= dmg;
                player.lastDamageSource = p.owner.name + '的远程攻击';
                player.invincibleTimer = 0.3;  // 0.3秒无敌帧
                p.life = 0;
                createDamageNumber(player.x, player.y - 20, Math.floor(dmg), COLORS.damage);
                AudioSys.play('hit');

                // 自动战斗：记录远程攻击者
                AutoBattle.onPlayerDamaged(p.owner);

                updateUI(); checkPlayerDeath();
                for (let j = 0; j < 5; j++)createParticle(p.x, p.y, p.color || '#ff4400');
            }
        } else {
            // 玩家发射的投射物，检测是否击中敌人
            let hitTarget = null;
            enemies.forEach(e => {
                if (!e.dead && e !== p.owner && Math.hypot(p.x - e.x, p.y - e.y) < e.radius + 10) {
                    takeDamage(e, p.damage, true);  // 第三个参数标记为技能伤害
                    p.life = 0;
                    hitTarget = e; // 记录被击中的目标
                    if (p.freeze) { e.frozenTimer = p.freeze; createDamageNumber(e.x, e.y - 40, "冻结!", COLORS.ice); }
                    for (let j = 0; j < 5; j++)createParticle(p.x, p.y, p.color || '#ff4400');
                }
            });

            // 火球爆炸效果（5级以上）
            if (hitTarget && p.type === 'fireball' && player.skills.fireball >= 5) {
                // 播放爆炸音效
                AudioSys.playFireballExplosion(player.skills.fireball);

                // 计算爆炸范围和伤害
                const explosionRadius = 50 + (player.skills.fireball - 5) * 10; // 5级=50, 10级=100
                const explosionDamageRatio = 0.2 + (player.skills.fireball - 5) * 0.04; // 5级=20%, 10级=40%
                const explosionDamage = p.damage * explosionDamageRatio;

                // 对范围内的其他敌人造成伤害
                enemies.forEach(e => {
                    if (!e.dead && e !== hitTarget && Math.hypot(p.x - e.x, p.y - e.y) < explosionRadius) {
                        takeDamage(e, explosionDamage, true);
                    }
                });

                // 创建爆炸粒子效果（橙红色扩散）
                const particleCount = 10 + player.skills.fireball; // 等级越高粒子越多
                // 粒子速度根据爆炸范围动态调整，确保视觉效果与伤害范围匹配
                const baseSpeed = explosionRadius * 1; // 粒子飞行距离约等于爆炸范围
                for (let j = 0; j < particleCount; j++) {
                    const angle = (Math.PI * 2 * j) / particleCount;
                    const speed = baseSpeed * (0.7 + Math.random() * 0.5); // 70%-120% 随机变化
                    const colors = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#ff2200'];
                    const color = colors[Math.floor(Math.random() * colors.length)];
                    particles.push({
                        x: p.x,
                        y: p.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        color: color,
                        life: 0.5 + Math.random() * 0.3,
                        size: 3 + Math.random() * 2
                    });
                }

                // 中心闪光效果（速度也根据爆炸范围调整）
                const flashSpeed = explosionRadius * 0.5; // 闪光速度更小，停留在中心区域
                for (let j = 0; j < 8; j++) {
                    particles.push({
                        x: p.x,
                        y: p.y,
                        vx: (Math.random() - 0.5) * flashSpeed,
                        vy: (Math.random() - 0.5) * flashSpeed,
                        color: '#ffffff',
                        life: 0.2,
                        size: 5
                    });
                }
            }
        }

        if (p.life <= 0) projectiles.splice(i, 1);
    });

    particles.forEach((p, i) => {
        p.life -= dt;
        // 处理不同类型的粒子
        if (p.type === 'drop_beam') {
            // 光柱不移动，只减少生命
        } else if (p.type === 'rising_spark') {
            // 上升光点
            p.y += p.vy * dt;
            p.vy += 50 * dt;  // 轻微减速
        } else {
            // 普通粒子
            if (p.vx) p.x += p.vx * dt;
            if (p.vy) p.y += p.vy * dt;
            if (p.gravity) p.vy += p.gravity * dt;  // 重力
        }
        if (p.life <= 0) particles.splice(i, 1);
    });
    damageNumbers.forEach((d, i) => { d.life -= dt; d.y -= 20 * dt; if (d.life <= 0) damageNumbers.splice(i, 1); });
    slashEffects.forEach((s, i) => { s.life -= dt * 5; if (s.life <= 0) slashEffects.splice(i, 1); });

    // 震屏效果更新
    if (screenShake.duration > 0) {
        screenShake.duration -= dt;
        screenShake.intensity *= 0.9;  // 逐渐减弱
    }

    // 敌人清理已移至定期清理（每3秒），使用对象池回收

    updateUI();
}

function updateEnemies(dt) {
    enemies.forEach(e => {
        if (e.dead) return;
        if (e.frozenTimer > 0) { e.frozenTimer -= dt; return; }
        if (e.cooldown > 0) e.cooldown -= dt;

        const dist = Math.hypot(player.x - e.x, player.y - e.y);

        if (e.ai === 'ranged') {
            if (dist < 150) {
                const dx = e.x - player.x, dy = e.y - player.y;
                const moveX = e.x + (dx / dist) * e.speed * dt;
                const moveY = e.y + (dy / dist) * e.speed * dt;
                if (!isWall(moveX, e.y)) e.x = moveX; if (!isWall(e.x, moveY)) e.y = moveY;
            } else if (dist < 400) {
                if (e.cooldown <= 0) {
                    const angle = Math.atan2(player.y - e.y, player.x - e.x);
                    projectiles.push({
                        x: e.x,
                        y: e.y,
                        angle: angle,
                        speed: 250,
                        life: 2,
                        damage: e.dmg,
                        color: '#ffaa00',
                        owner: e
                    });
                    AudioSys.play('arrow');
                    e.cooldown = 2.0;
                }
            }
        } else if (e.ai === 'revive') {
            if (e.cooldown <= 0) {
                // 复活附近的尸体，但不能复活 Boss
                const body = enemies.find(other => other.dead && !other.isBoss && Math.hypot(other.x - e.x, other.y - e.y) < 200);
                if (body) {
                    body.dead = false; body.hp = body.maxHp;

                    // 调整复活位置，确保离主角有一定距离
                    const distToPlayer = Math.hypot(body.x - player.x, body.y - player.y);
                    if (distToPlayer < 150) {
                        // 如果尸体离主角太近，将复活位置调整到距离主角150-250像素的位置
                        const angle = Math.atan2(body.y - player.y, body.x - player.x);
                        const newDist = 150 + Math.random() * 100; // 150-250像素距离
                        body.x = player.x + Math.cos(angle) * newDist;
                        body.y = player.y + Math.sin(angle) * newDist;

                        // 检查新位置是否是墙，如果是则稍微调整
                        if (isWall(body.x, body.y)) {
                            // 尝试在附近找非墙位置
                            let foundPos = false;
                            for (let angleOffset = 0; angleOffset < Math.PI * 2; angleOffset += Math.PI / 4) {
                                const testX = player.x + Math.cos(angle + angleOffset) * newDist;
                                const testY = player.y + Math.sin(angle + angleOffset) * newDist;
                                if (!isWall(testX, testY)) {
                                    body.x = testX;
                                    body.y = testY;
                                    foundPos = true;
                                    break;
                                }
                            }
                            // 如果还找不到，就使用原位置
                            if (!foundPos) {
                                body.x = player.x + Math.cos(angle) * newDist;
                                body.y = player.y + Math.sin(angle) * newDist;
                            }
                        }
                    }

                    createDamageNumber(body.x, body.y - 20, "复活!", COLORS.revive);
                    e.cooldown = 5.0;
                    return;
                }
            }
            if (dist < 300 && dist > 100) {
                const nx = e.x + ((player.x - e.x) / dist) * e.speed * dt, ny = e.y + ((player.y - e.y) / dist) * e.speed * dt;
                if (!isWall(nx, e.y)) e.x = nx; if (!isWall(e.x, ny)) e.y = ny;
            }
        } else if (e.ai === 'phase') {
            // 幽灵AI：可以穿墙，直线追击玩家
            if (dist < 400 && dist > 35) {
                e.x += ((player.x - e.x) / dist) * e.speed * dt;
                e.y += ((player.y - e.y) / dist) * e.speed * dt;
            }
            if (dist <= 40 && e.cooldown <= 0 && player.invincibleTimer <= 0) {
                let physicalDmg = e.ignoreArmor ? e.dmg : Math.max(1, e.dmg - player.armor * 0.1);
                player.hp -= physicalDmg;
                createDamageNumber(player.x, player.y - 30, Math.floor(physicalDmg), '#ff4444');
                e.cooldown = 1.5;
                AudioSys.play('hit');
            }
        } else {
            // 普通chase AI
            if (dist < 400 && dist > 35) {
                const nx = e.x + ((player.x - e.x) / dist) * e.speed * dt, ny = e.y + ((player.y - e.y) / dist) * e.speed * dt;
                if (!isWall(nx, e.y)) e.x = nx; if (!isWall(e.x, ny)) e.y = ny;
            }
            if (dist <= 40 && e.cooldown <= 0 && player.invincibleTimer <= 0) {
                // 计算物理伤害（受护甲影响）
                let physicalDmg = e.ignoreArmor ? e.dmg : Math.max(1, e.dmg - player.armor * 0.1);

                // 如果敌人有元素伤害，计算元素伤害（受抗性影响）
                let totalDmg = physicalDmg;
                if (e.elementalDmg) {
                    if (e.elementalDmg.fire) {
                        const fireDmg = e.elementalDmg.fire * (1 - player.resistances.fire / 100);
                        totalDmg += Math.max(0, fireDmg);
                    }
                    if (e.elementalDmg.cold) {
                        const coldDmg = e.elementalDmg.cold * (1 - player.resistances.cold / 100);
                        totalDmg += Math.max(0, coldDmg);
                    }
                    if (e.elementalDmg.lightning) {
                        const lightningDmg = e.elementalDmg.lightning * (1 - player.resistances.lightning / 100);
                        totalDmg += Math.max(0, lightningDmg);
                    }
                    if (e.elementalDmg.poison) {
                        const poisonDmg = e.elementalDmg.poison * (1 - player.resistances.poison / 100);
                        totalDmg += Math.max(0, poisonDmg);
                    }
                }

                // 狂战士天赋：受到伤害+20%
                const damageTakenPct = getTalentEffect('damageTakenPct', 0);
                if (damageTakenPct > 0) {
                    totalDmg *= (1 + damageTakenPct / 100);
                }

                player.hp -= totalDmg;
                player.lastDamageSource = e.name;
                player.invincibleTimer = 0.3;  // 0.3秒无敌帧
                e.cooldown = 1.5;
                createDamageNumber(player.x, player.y - 20, Math.floor(totalDmg), COLORS.damage);
                AudioSys.play('hit');

                // 荆棘天赋+天神赐福：反弹伤害
                const thornsPct = getTalentEffect('thornsPct', 0) + (player.thornsPct || 0);
                if (thornsPct > 0 && !e.dead) {
                    const thornsDmg = Math.floor(totalDmg * thornsPct / 100);
                    e.hp -= thornsDmg;
                    createDamageNumber(e.x, e.y - 10, thornsDmg, COLORS.thornsDamage);
                    if (e.hp <= 0) e.dead = true;
                }

                // 自动战斗：记录攻击者，立即反击
                AutoBattle.onPlayerDamaged(e);

                // 吸血效果（吸血鬼或精英词缀）
                if (e.lifeSteal) {
                    const heal = Math.floor(totalDmg * e.lifeSteal);
                    e.hp = Math.min(e.maxHp, e.hp + heal);
                    createDamageNumber(e.x, e.y - 30, "+" + heal, COLORS.green);
                }

                // 中毒效果（木乃伊或精英词缀）
                if (e.poisonOnHit && e.poisonDamage) {
                    player.poisoned = true;
                    player.poisonTimer = 3.0;  // 持续3秒
                    player.poisonDamage = e.poisonDamage;
                    createDamageNumber(player.x, player.y - 45, "中毒!", '#00ff00');
                }

                // 冰冻：硬控玩家（免疫期内无效）
                if (e.freezeOnHit && !(player.freezeImmuneTimer > 0) && !(player.slowedTimer > 0)) {
                    player.frozen = true;
                    player.frozenTimer = 0.5;  // 硬控0.5秒（之后进入1.5秒减速期）
                    createDamageNumber(player.x, player.y - 40, "冰冻!", COLORS.ice);
                }

                // 法力燃烧：消耗玩家法力
                if (e.manaBurn) {
                    const manaBurned = Math.floor(Math.min(player.mp, totalDmg * 0.5));
                    player.mp -= manaBurned;
                    if (manaBurned > 0) {
                        createDamageNumber(player.x, player.y - 50, "-" + manaBurned + " MP", COLORS.manaCost);
                    }
                }

                updateUI(); checkPlayerDeath();
            }
        }
    });
}

// --- Rendering ---
function draw() {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 震屏效果
    let shakeX = 0, shakeY = 0;
    if (screenShake.duration > 0) {
        shakeX = (Math.random() - 0.5) * screenShake.intensity * 2;
        shakeY = (Math.random() - 0.5) * screenShake.intensity * 2;
    }

    ctx.save(); ctx.translate(-Math.floor(camera.x) + shakeX, -Math.floor(camera.y) + shakeY);

    const sc = Math.floor(camera.x / TILE_SIZE), ec = sc + (canvas.width / TILE_SIZE) + 1;
    const sr = Math.floor(camera.y / TILE_SIZE), er = sr + (canvas.height / TILE_SIZE) + 1;
    for (let r = sr - 1; r < er + 1; r++) {
        for (let c = sc - 1; c < ec + 1; c++) {
            if (r >= 0 && r < MAP_HEIGHT && c >= 0 && c < MAP_WIDTH) {
                const x = c * TILE_SIZE, y = r * TILE_SIZE;
                if (mapData[r][c] === 0) {
                    if (wallTilesLoaded) {
                        const wallIndex = getWallTextureIndex(player.floor);

                        // 图片已调整为 120x360 (每个图块 120x120)
                        // 120px 到 40px 是完美的 3倍缩放
                        const tileHeight = wallTiles.height / 3;

                        ctx.drawImage(wallTiles,
                            0, wallIndex * tileHeight, wallTiles.width, tileHeight,
                            x, y, TILE_SIZE, TILE_SIZE
                        );

                        // 阴影
                        //ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        //ctx.fillRect(x, y + TILE_SIZE - 6, TILE_SIZE, 6);
                    } else {
                        ctx.fillStyle = COLORS.wall;
                        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        ctx.fillStyle = '#111';
                        ctx.fillRect(x, y + TILE_SIZE - 10, TILE_SIZE, 10);
                    }
                }
                else {
                    const x = c * TILE_SIZE, y = r * TILE_SIZE;
                    if (floorTilesLoaded) {
                        const floorIndex = getFloorTextureIndex(player.floor);
                        const tileHeight = floorTiles.height / 3;

                        ctx.drawImage(floorTiles,
                            0, floorIndex * tileHeight, floorTiles.width, tileHeight,
                            x, y, TILE_SIZE, TILE_SIZE
                        );

                        // Subtle checkerboard pattern for variety
                        if ((c + r) % 2 === 0) {
                            ctx.fillStyle = 'rgba(0,0,0,0.1)';
                            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        }
                    } else {
                        ctx.fillStyle = ((c + r) % 2 === 0) ? '#151515' : '#1a1a1a';
                        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
    }

    // Render Exits
    if (isInTown()) {
        // 罗格营地：只显示去地牢1层
        ctx.fillStyle = COLORS.exit; ctx.fillRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.strokeStyle = '#4d94ff'; ctx.strokeRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.fillText("去地牢 1层", dungeonExit.x, dungeonExit.y - 20);
    } else if (player.isInHell) {
        // 地狱模式：显示地狱的入口和出口
        ctx.fillStyle = COLORS.exit; ctx.fillRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.strokeStyle = '#4d94ff'; ctx.strokeRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.fillStyle = COLORS.entrance; ctx.fillRect(dungeonEntrance.x - 15, dungeonEntrance.y - 15, 30, 30);
        ctx.strokeStyle = '#ffaa00'; ctx.strokeRect(dungeonEntrance.x - 15, dungeonEntrance.y - 15, 30, 30);

        // 出口标签
        let nextLabel;
        if (player.hellFloor >= 10) {
            nextLabel = "返回罗格营地";
        } else {
            nextLabel = `进入地狱 ${player.hellFloor + 1}层`;
        }
        ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.fillText(nextLabel, dungeonExit.x, dungeonExit.y - 20);

        // 入口标签
        let prevLabel = player.hellFloor === 1 ? "返回罗格营地" : `回到地狱 ${player.hellFloor - 1}层`;
        ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.fillText(prevLabel, dungeonEntrance.x, dungeonEntrance.y - 20);
    } else {
        // 普通地牢：显示地牢的入口和出口
        ctx.fillStyle = COLORS.exit; ctx.fillRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.strokeStyle = '#4d94ff'; ctx.strokeRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.fillStyle = COLORS.entrance; ctx.fillRect(dungeonEntrance.x - 15, dungeonEntrance.y - 15, 30, 30);
        ctx.strokeStyle = '#ffaa00'; ctx.strokeRect(dungeonEntrance.x - 15, dungeonEntrance.y - 15, 30, 30);

        // 入口标签
        let prevLabel = player.floor === 1 ? "去罗格营地" : `去地牢 ${player.floor - 1}层`;
        ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.fillText(prevLabel, dungeonEntrance.x, dungeonEntrance.y - 20);
    }

    // 传送门只在普通地牢中显示，地狱中不显示
    if (townPortal && townPortal.activeFloor === player.floor && !player.isInHell) {
        ctx.fillStyle = COLORS.info; ctx.beginPath(); ctx.arc(townPortal.x, townPortal.y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.stroke();
        let label = player.floor === 0 ? '传送门' : '传送门 (回罗格营地)';
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, townPortal.x, townPortal.y - 20);
    }

    groundItems.forEach(i => {
        // 物品过滤：默认只显示蓝色以上（rarity >= 2），按住Alt显示所有
        // 金币、药水、卷轴始终显示
        const isConsumable = i.type === 'gold' || i.type === 'potion' || i.type === 'scroll';
        if (!isAltPressed && !isConsumable && i.rarity < 2) {
            return; // 跳过低品质物品的渲染
        }

        if (itemSpritesLoaded && processedItemSprites) {
            const coords = getItemSpriteCoords(i);
            const size = 32; // draw size
            const spriteSize = processedItemSprites.width / 4;

            // Draw Item Sprite (使用去除黑底的精灵图)
            ctx.drawImage(processedItemSprites,
                coords.col * spriteSize, coords.row * spriteSize, spriteSize, spriteSize,
                i.x - size / 2, i.y - size / 2, size, size
            );

            // Rarity Name (显示在物品上方)
            if (isAltPressed || i.rarity >= 3) {
                ctx.fillStyle = getItemColor(i.rarity); ctx.textAlign = 'center';
                ctx.font = '12px Cinzel';
                ctx.fillText(i.displayName || i.name, i.x, i.y - 22);
            }
        } else {
            ctx.beginPath(); ctx.fillStyle = getItemColor(i.rarity); ctx.textAlign = 'center';
            ctx.font = '20px serif'; ctx.fillText(i.icon || '📦', i.x, i.y + 7);
        }
        if (i.rarity >= 3) { ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.moveTo(i.x, i.y); ctx.lineTo(i.x - 10, i.y - 100); ctx.lineTo(i.x + 10, i.y - 100); ctx.fill(); ctx.globalAlpha = 1; }
    });

    npcs.forEach(n => {
        if (spritesLoaded && processedSpriteSheet && n.frameIndex !== undefined) {
            const frame = getNPCFrame(n.frameIndex);
            const renderHeight = 52;
            const renderWidth = renderHeight * frame.width / frame.height;
            ctx.drawImage(processedSpriteSheet, frame.x, frame.y, frame.width, frame.height,
                n.x - renderWidth / 2, n.y - renderHeight, renderWidth, renderHeight);
        } else {
            ctx.fillStyle = COLORS.npc; ctx.beginPath(); ctx.arc(n.x, n.y, 15, 0, Math.PI * 2); ctx.fill();
        }

        // Quest Indicators (above name)
        if (n.type === 'healer') {
            if (player.questState === 0) {
                ctx.fillStyle = '#ffff00'; ctx.font = '20px Arial'; ctx.fillText("!", n.x, n.y - 80);
            } else if (player.questState === 2) {
                ctx.fillStyle = '#ffff00'; ctx.font = '20px Arial'; ctx.fillText("?", n.x, n.y - 80);
            }
        }

        // Name (above character)
        ctx.fillStyle = '#fff'; ctx.font = '12px Cinzel'; ctx.textAlign = 'center'; ctx.fillText(n.name, n.x, n.y - 70);
    });

    enemies.forEach(e => {
        if (e.dead) { ctx.fillStyle = '#330000'; ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill(); return; }

        // BOSS脚下光环
        if (e.isBoss) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(e.x, e.y, (e.radius + 5) / 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180, 0, 0, 0.25)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }

        if (spritesLoaded && processedSpriteSheet && e.frameIndex !== undefined) {
            // BOSS使用第3排，普通怪物使用第2排
            const frame = e.isBoss ? getBossFrame(e.frameIndex) : getMonsterFrame(e.frameIndex);
            const renderHeight = e.isBoss ? 44 * 1.5 : 44;  // BOSS 1.5倍大
            const renderWidth = renderHeight * frame.width / frame.height;
            ctx.drawImage(processedSpriteSheet, frame.x, frame.y, frame.width, frame.height,
                e.x - renderWidth / 2, e.y - renderHeight, renderWidth, renderHeight);
        } else {
            ctx.fillStyle = e.frozenTimer > 0 ? COLORS.ice : (e.rarity > 0 ? '#ffaa00' : (e.isBoss ? '#9000cc' : '#880000'));
            if (e.isQuestTarget) ctx.fillStyle = '#ff00aa';
            ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = '#500'; ctx.fillRect(e.x - 15, e.y - e.radius - 8, 30, 4);
        ctx.fillStyle = '#f00'; ctx.fillRect(e.x - 15, e.y - e.radius - 8, 30 * (e.hp / e.maxHp), 4);
        ctx.fillStyle = e.isBoss ? '#f33' : (e.rarity > 0 ? '#fa0' : '#ccc');
        ctx.font = '10px Cinzel';
        ctx.textAlign = 'center';
        ctx.fillText(e.isBoss ? '☠️ ' + e.name : e.name, e.x, e.y - e.radius - 35);

        // 渲染精英词缀
        if (e.eliteAffixes && e.eliteAffixes.length > 0) {
            let yOffset = -45;
            e.eliteAffixes.forEach(affix => {
                ctx.fillStyle = affix.color;
                ctx.font = '9px Cinzel';
                ctx.fillText(affix.name, e.x, e.y - e.radius + yOffset);
                yOffset -= 12;
            });
        }

        // 冰冻怪头顶显示❄️图标警告
        if (e.freezeOnHit) {
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('❄️', e.x, e.y - e.radius - 50);
        }

        // 火焰强化怪头顶显示🔥图标警告
        if (e.eliteAffixes && e.eliteAffixes.some(a => a.id === 'fire_enchanted')) {
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('🔥', e.x + (e.freezeOnHit ? 18 : 0), e.y - e.radius - 50);
        }
    });

    // 绘制雷电特效 (直接在最上层绘制，确保可见)
    if (player.activeLightning && player.activeLightning.life > 0) {
        const l = player.activeLightning;
        ctx.save();
        ctx.beginPath();
        // 遍历点集绘制折线
        if (l.points.length > 0) {
            ctx.moveTo(l.points[0].x, l.points[0].y);
            for (let i = 1; i < l.points.length; i++) {
                ctx.lineTo(l.points[i].x, l.points[i].y);
            }
        }

        // 样式参考：高亮白芯，蓝色光晕
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // 外发光
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#0088ff';

        // 宽线条背景 (蓝色)
        ctx.strokeStyle = '#0088ff';
        ctx.lineWidth = 6;
        ctx.globalAlpha = l.life * 2; // 快速闪烁
        ctx.stroke();

        // 细线条核心 (白色)
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = l.life * 3;
        ctx.stroke();

        ctx.restore();

        // 减少生命值
        l.life -= 0.05; // 持续约 20 帧
    }

    // 显示自动战斗目标
    if (AutoBattle.enabled && AutoBattle.currentTarget && !AutoBattle.currentTarget.dead) {
        const target = AutoBattle.currentTarget;
        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('▼', target.x, target.y - target.radius - 25);
    }

    if (player.targetX !== null) { ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.arc(player.targetX, player.targetY, 5, 0, Math.PI * 2); ctx.stroke(); }
    if (spritesLoaded && processedSpriteSheet) {
        const frame = getHeroFrame(player.direction);
        const renderHeight = 48;
        const renderWidth = renderHeight * frame.width / frame.height;
        const scale = 1 + player.attackAnim * 0.2;
        ctx.save();
        ctx.translate(player.x, player.y - renderHeight / 2);
        ctx.scale(scale, scale);
        ctx.drawImage(processedSpriteSheet, frame.x, frame.y, frame.width, frame.height,
            -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight);
        ctx.restore();
    } else {
        ctx.fillStyle = player.color; ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2); ctx.fill();
    }

    projectiles.forEach(p => {
        ctx.strokeStyle = p.color || '#fa0';
        ctx.fillStyle = p.color || '#fa0';
        ctx.lineWidth = 2;

        // 箭矢投射物（怪物发射）- 画成线条
        if (p.color === '#ffaa00' && p.owner !== player) {
            const len = 15;
            const endX = p.x - Math.cos(p.angle) * len;
            const endY = p.y - Math.sin(p.angle) * len;
            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        } else {
            // 火球等投射物 - 画成圆形
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    particles.forEach((p) => {
        if (p.type === 'lightning') {
            ctx.beginPath();
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let j = 1; j < p.points.length; j++) {
                ctx.lineTo(p.points[j].x, p.points[j].y);
            }
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.width * (p.life / 0.2); // 随时间变细
            ctx.stroke();
            // 闪光效果
            ctx.shadowBlur = 20;
            ctx.shadowColor = p.color;
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (p.type === 'lightning_chain') {
            // 渲染闪电链
            ctx.globalAlpha = p.alpha * (p.life / 0.3);  // 随时间淡出
            ctx.beginPath();
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let j = 1; j < p.points.length; j++) {
                ctx.lineTo(p.points[j].x, p.points[j].y);
            }
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.stroke();
            // 发光效果
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
        } else if (p.type === 'drop_beam') {
            // 渲染掉落光柱
            const fadeIn = Math.min(1, (p.maxLife - p.life) / 0.2);  // 0.2秒淡入
            const fadeOut = Math.min(1, p.life / 0.3);               // 0.3秒淡出
            const alpha = fadeIn * fadeOut;

            // 光柱主体（渐变）
            const gradient = ctx.createLinearGradient(p.x, p.y, p.x, p.y - p.height);
            gradient.addColorStop(0, p.glowColor);
            gradient.addColorStop(0.3, p.color);
            gradient.addColorStop(0.7, p.color);
            gradient.addColorStop(1, 'rgba(255,255,255,0)');

            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = gradient;
            const beamWidth = p.width * (0.8 + 0.2 * Math.sin(Date.now() / 100));  // 脉动效果
            ctx.fillRect(p.x - beamWidth / 2, p.y - p.height, beamWidth, p.height);

            // 发光效果
            ctx.shadowBlur = 30;
            ctx.shadowColor = p.color;
            ctx.fillRect(p.x - beamWidth / 4, p.y - p.height, beamWidth / 2, p.height);
            ctx.shadowBlur = 0;

            // 底部光晕
            ctx.beginPath();
            const glowRadius = p.width * 1.5 * (0.8 + 0.2 * Math.sin(Date.now() / 80));
            const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
            glowGradient.addColorStop(0, p.color);
            glowGradient.addColorStop(0.5, p.glowColor);
            glowGradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glowGradient;
            ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalAlpha = 1.0;
        } else if (p.type === 'rising_spark') {
            // 渲染上升光点
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1.0;
        } else {
            ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        }
    });
    ctx.globalAlpha = 1;

    // 绘制斩击弧
    slashEffects.forEach(s => {
        ctx.strokeStyle = `rgba(255, 255, 255, ${s.life})`;
        ctx.lineWidth = 3 * s.life;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, s.angle - 0.8, s.angle + 0.8);
        ctx.stroke();
    });

    ctx.font = 'bold 16px Arial'; ctx.textAlign = 'center';
    damageNumbers.forEach(d => { ctx.fillStyle = d.color; ctx.fillText(d.val, d.x, d.y); });

    ctx.restore();

    // 死亡提示文字
    if (player.isDead) {
        // 设置 canvas filter 为 none，覆盖父容器的灰度滤镜，确保文字颜色正常
        ctx.filter = 'none';

        // 绘制死亡提示文字
        ctx.save();



        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`你已死亡，灵魂将在 ${Math.ceil(player.deathTimer)} 秒后返回罗格营地`, canvas.width / 2, canvas.height / 2 + 30);
        ctx.restore();
    }

    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 200, canvas.width / 2, canvas.height / 2, canvas.width / 1.2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    updateLabelsPosition();
    drawMinimap();
    updateTutorialBubble();
}

function updateLabelsPosition() {
    groundItems.forEach(i => {
        if (i.el) {
            const sx = i.x - camera.x, sy = i.y - camera.y - 25; // 标签显示在物品上方
            if (sx > 0 && sx < canvas.width && sy > 0 && sy < canvas.height) {
                i.el.style.display = 'block'; i.el.style.left = sx + 'px'; i.el.style.top = sy + 'px';
            } else i.el.style.display = 'none';
        }
    });
}

function drawMinimap() {
    miniCtx.fillStyle = '#000'; miniCtx.fillRect(0, 0, 150, 150);
    const s = 150 / MAP_WIDTH;
    for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
        if (visitedMap[y][x]) {
            miniCtx.fillStyle = mapData[y][x] === 0 ? '#444' : '#111';
            miniCtx.fillRect(x * s, y * s, s, s);
        }
    }
    const ex = Math.floor(dungeonExit.x / TILE_SIZE), ey = Math.floor(dungeonExit.y / TILE_SIZE);
    if (visitedMap[ey][ex]) { miniCtx.fillStyle = COLORS.exit; miniCtx.fillRect(ex * s, ey * s, s, s); }
    const px = player.x / TILE_SIZE * s, py = player.y / TILE_SIZE * s;
    miniCtx.fillStyle = '#0f0'; miniCtx.fillRect(px - 1, py - 1, 3, 3);
    miniCtx.fillStyle = '#f00';
    enemies.forEach(e => { if (!e.dead) { const ex = Math.floor(e.x / TILE_SIZE), ey = Math.floor(e.y / TILE_SIZE); if (ex >= 0 && visitedMap[ey][ex]) miniCtx.fillRect(ex * s, ey * s, 2, 2); } });
}

function interactNPC(npc) {
    if (npc.type === 'merchant') {
        togglePanel('shop');
    } else if (npc.type === 'stash') {
        // 直接显示仓库面板，而不是切换
        const stashPanel = document.getElementById('stash-panel');
        stashPanel.style.display = 'block';
        renderStash();
    } else if (npc.type === 'difficulty') {
        // 地狱守卫 - 进入/返回地狱
        showHellPortalDialog();
    } else if (npc.type === 'respec') {
        // 神秘贤者 - 洗点服务
        showRespecDialog();
    } else if (npc.type === 'blacksmith') {
        togglePanel('blacksmith');
    } else if (npc.type === 'healer') {
        const currentQ = getCurrentQuest();

        if (!currentQ) {
            showDialog(npc.name, "你已经完成了所有任务，真正的英雄！", [{ text: "谢谢", action: closeDialog }]);
            return;
        }

        if (player.questState === 0) {
            showDialog(npc.name, `勇士，我们需要你的帮助。\n\n${currentQ.desc}\n\n奖励: ${currentQ.reward}`,
                [{ text: "接受任务", action: () => { player.questState = 1; player.questProgress = 0; updateQuestUI(); updateQuestTracker(); updateMenuIndicators(); closeDialog(); } }]);
        } else if (player.questState === 1) {
            let progText = "";
            if (currentQ.type === 'kill_count') progText = ` (进度: ${player.questProgress} / ${currentQ.target})`;
            showDialog(npc.name, `任务还没完成。快去！\n${currentQ.desc}${progText}`, [{ text: "好的", action: closeDialog }]);
        } else if (player.questState === 2) {
            showDialog(npc.name, "干得漂亮！这是给你的奖励。",
                [{
                    text: "领取奖励", action: () => {
                        if (currentQ.reward.includes('技能点')) {
                            if (currentQ.reward.includes('2')) {
                                player.skillPoints += 2;
                            } else {
                                player.skillPoints++;
                            }
                        }
                        if (currentQ.reward.includes('金币')) {
                            if (currentQ.reward.includes('1000')) {
                                addGold(1000);
                            } else {
                                addGold(500);
                            }
                        }
                        if (currentQ.reward.includes('装备') || currentQ.reward.includes('戒指') || currentQ.reward.includes('符文') || currentQ.reward.includes('饰品')) {
                            addItemToInventory(createItem('戒指', player.lvl));
                        }
                        if (currentQ.reward.includes('暗金装备') || currentQ.reward.includes('传奇装备') || currentQ.reward.includes('终极神装')) {
                            let item;
                            if (currentQ.reward.includes('暗金')) {
                                item = createItem('戒指', player.lvl);
                                item.rarity = 3; // 稀有
                            } else if (currentQ.reward.includes('传奇')) {
                                item = createItem('戒指', player.lvl);
                                item.rarity = 4; // 暗金
                            } else { // 终极神装
                                item = createItem('戒指', player.lvl);
                                item.rarity = 4;
                                item.displayName = "终极神装";
                            }
                            addItemToInventory(item);
                        }

                        player.questIndex++;
                        player.questState = 0;
                        player.questProgress = 0;

                        updateSkillsUI(); updateQuestUI(); updateQuestTracker(); updateMenuIndicators(); closeDialog(); AudioSys.play('levelup');
                    }
                }]);
        } else {
            player.hp = player.maxHp; player.mp = player.maxMp; showNotification("阿卡拉治愈了你");
        }
    }
}

function showDialog(name, text, options) {
    const box = document.getElementById('dialog-box');
    document.getElementById('dialog-name').innerText = name;
    document.getElementById('dialog-text').innerText = text;
    const optsDiv = document.getElementById('dialog-options');
    optsDiv.innerHTML = '';
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'dialog-btn';
        btn.innerText = opt.text;
        btn.onclick = (e) => {
            e.stopPropagation();
            opt.action();
        };
        btn.onmousedown = (e) => e.stopPropagation();
        optsDiv.appendChild(btn);
    });
    box.style.display = 'block';
}
function closeDialog() { document.getElementById('dialog-box').style.display = 'none'; }

// 洗点对话
function showRespecDialog() {
    const fullCost = player.lvl * 500;
    const statCost = player.lvl * 300;
    const skillCost = player.lvl * 300;

    const dialogText = `年轻的英雄，命运之路充满选择。如果你对自己的能力分配不满意，我可以帮你重塑。

当前等级：${player.lvl}

选择你需要的服务：`;

    const options = [
        {
            text: `完全洗点（${fullCost} 金币）`,
            action: () => {
                if (player.gold < fullCost) {
                    showDialog("神秘贤者", `金币不足！你需要 ${fullCost} 金币才能进行完全洗点。\n\n当前金币：${player.gold}`, [{ text: "知道了", action: closeDialog }]);
                    return;
                }
                player.gold -= fullCost;
                respecPlayer('full');
                AudioSys.play('levelup');
                showDialog("神秘贤者", `✨ 重置成功！✨\n\n所有属性点和技能点已经重置。\n你可以重新规划自己的成长路线了。\n\n消耗：${fullCost} 金币\n剩余金币：${player.gold}`, [{ text: "太好了！", action: closeDialog }]);
            }
        },
        {
            text: `仅重置属性点（${statCost} 金币）`,
            action: () => {
                if (player.gold < statCost) {
                    showDialog("神秘贤者", `金币不足！你需要 ${statCost} 金币才能重置属性点。\n\n当前金币：${player.gold}`, [{ text: "知道了", action: closeDialog }]);
                    return;
                }
                player.gold -= statCost;
                respecPlayer('stats');
                AudioSys.play('levelup');
                showDialog("神秘贤者", `✨ 属性点已重置！✨\n\n力量、敏捷、体力、精力已恢复到初始状态。\n所有属性点已返还。\n\n消耗：${statCost} 金币\n剩余金币：${player.gold}`, [{ text: "太好了！", action: closeDialog }]);
            }
        },
        {
            text: `仅重置技能点（${skillCost} 金币）`,
            action: () => {
                if (player.gold < skillCost) {
                    showDialog("神秘贤者", `金币不足！你需要 ${skillCost} 金币才能重置技能点。\n\n当前金币：${player.gold}`, [{ text: "知道了", action: closeDialog }]);
                    return;
                }
                player.gold -= skillCost;
                respecPlayer('skills');
                AudioSys.play('levelup');
                showDialog("神秘贤者", `✨ 技能点已重置！✨\n\n所有技能已重置（火球术保持1级）。\n技能点已全部返还。\n\n消耗：${skillCost} 金币\n剩余金币：${player.gold}`, [{ text: "太好了！", action: closeDialog }]);
            }
        },
        {
            text: '离开',
            action: closeDialog
        }
    ];

    showDialog("神秘贤者", dialogText, options);
}

// 洗点逻辑
function respecPlayer(type) {
    if (type === 'full' || type === 'stats') {
        // 计算总属性点（每级5点）
        const totalPoints = (player.lvl - 1) * 5;

        // 重置属性到初始值
        player.str = 15;
        player.dex = 15;
        player.vit = 20;
        player.ene = 10;

        // 返还所有属性点
        player.points = totalPoints;
    }

    if (type === 'full' || type === 'skills') {
        // 计算总技能点（升级获得的 + 任务奖励的）
        let totalSkillPoints = player.lvl - 1; // 升级获得的技能点（1级没有技能点，2级开始每级1点）

        // 加上任务奖励的技能点（需要计算已完成的任务）
        const completedQuests = player.questIndex;
        for (let i = 0; i < completedQuests; i++) {
            const quest = getCurrentQuest(i);
            if (quest && quest.reward) {
                if (quest.reward.includes('2 技能点')) {
                    totalSkillPoints += 2;
                } else if (quest.reward.includes('技能点')) {
                    totalSkillPoints += 1;
                }
            }
        }

        // 重置技能等级
        player.skills.fireball = 1; // 火球术保持1级（初始技能）
        player.skills.thunder = 0;
        player.skills.multishot = 0;

        // 返还所有技能点（减去火球术的1点）
        player.skillPoints = totalSkillPoints;
    }

    // 重新计算玩家属性
    updateStats();

    // 更新UI
    updateStatsUI();
    updateSkillsUI();
    updateUI();

    // 播放音效
    AudioSys.play('quest');
}

function showHellPortalDialog() {
    const isInHell = player.isInHell || false;
    const currentFloor = isInHell ? player.hellFloor : player.floor;

    if (isInHell) {
        // 在地狱中，显示返回营地或继续
        showDialog('地狱守卫', `已在地狱第${currentFloor}层。`, [
            {
                text: '返回营地',
                action: () => {
                    exitHell();
                    closeDialog();
                }
            },
            {
                text: '继续探索',
                action: () => {
                    closeDialog();
                }
            }
        ]);
    } else {
        // 检查是否已解锁地狱模式（击败巴尔）
        if (!player.defeatedBaal) {
            showDialog('地狱守卫', "你需要先去击杀10层Boss才能开启地狱模式。", [
                {
                    text: '知道了',
                    action: () => closeDialog()
                }
            ]);
            return;
        }

        // 在地牢或营地中，询问是否进入地狱
        const infoText = `进入地狱模式：\n• 怪物伤害×4，血量×6\n• 获得经验值×5\n• 掉落品质提升至250%\n• 所有抗性-100%\n• 40%怪物有元素免疫`;

        showDialog('地狱守卫', infoText, [
            {
                text: '进入地狱',
                action: () => {
                    enterHell();
                    closeDialog();
                }
            },
            {
                text: '稍后再来',
                action: () => {
                    closeDialog();
                }
            }
        ]);
    }
}

function enterHell() {
    // 进入地狱（如果之前已经进入过，保持进度；否则从第1层开始）
    player.isInHell = true;
    if (!player.hellFloor || player.hellFloor < 1) {
        player.hellFloor = 1;
    }
    showNotification(`已进入地狱第${player.hellFloor}层！`);
    updateHellIndicator();
    enterFloor(player.hellFloor, 'start');  // 从入口进入地狱（start = 入口位置）
}

function exitHell() {
    // 返回营地（地狱守卫在营地，所以总是返回营地）
    player.isInHell = false;
    showNotification('已返回罗格营地');
    updateHellIndicator();
    enterFloor(0, 'end');  // 返回罗格营地
}

function updateHellIndicator() {
    // 在UI中显示当前是否在地狱
    const indicator = document.getElementById('hell-indicator');
    if (indicator) {
        if (player.isInHell) {
            indicator.style.display = 'block';
            indicator.innerText = '地狱';
        } else {
            indicator.style.display = 'none';
        }
    }
}

function updateQuestUI() {
    const list = document.getElementById('quest-list');
    list.innerHTML = '';

    // 显示已完成总数
    const statsDiv = document.createElement('div');
    statsDiv.style.marginBottom = '15px';
    statsDiv.style.color = '#888';
    statsDiv.style.fontSize = '12px';
    statsDiv.style.textAlign = 'center';
    statsDiv.innerText = `已完成任务: ${player.questIndex}`;
    list.appendChild(statsDiv);

    // 获取当前任务
    const q = getCurrentQuest();
    if (!q) return;

    const d = document.createElement('div');
    d.className = 'quest-item';
    d.style.background = 'rgba(0,0,0,0.6)';
    d.style.border = '1px solid #4a3b2a';
    d.style.padding = '15px';

    let statusText = "进行中";
    let colorClass = "";

    if (player.questState === 0) {
        statusText = "新任务";
    } else if (player.questState === 1) {
        statusText = "进行中";
        if (q.type === 'kill_count') {
            const pct = Math.floor((player.questProgress / q.target) * 100);
            statusText += ` ${player.questProgress}/${q.target}`;
            // 进度条
            d.innerHTML += `<div style="width:100%; height:4px; background:#333; margin-top:5px; border-radius:2px;"><div style="width:${pct}%; height:100%; background:#c7b377;"></div></div>`;
        }
    } else if (player.questState === 2) {
        statusText = "可交付 (去找阿卡拉)";
        colorClass = "completed";
    }

    let html = `<div class="quest-title" style="font-size:16px; margin-bottom:8px; color:#c7b377;">${q.title} <span class="quest-status ${colorClass}" style="float:right; font-size:12px;">${statusText}</span></div>`;
    html += `<div style="font-size:13px; color:#ccc; margin-bottom:10px; line-height:1.4;">${q.desc}</div>`;
    html += `<div style="font-size:12px; color:#88ff88; margin-top:5px;">🎁 奖励: ${q.reward}</div>`;

    d.innerHTML = html + (d.innerHTML || '');
    list.appendChild(d);
}

function updateQuestTracker() {
    const el = document.getElementById('quest-tracker');
    el.innerHTML = '';

    const currentQ = getCurrentQuest();
    if (!currentQ || player.questState === 0) return;

    let text = "";
    let titleColor = "#c7b377";

    if (player.questState === 2) {
        text = "任务完成！回去找阿卡拉";
        titleColor = "#0f0";
    } else {
        if (currentQ.type === 'kill_count') {
            text = `进度: ${player.questProgress} / ${currentQ.target}`;
            if (player.floor !== currentQ.floor) text += ` (目标在: 地牢 ${currentQ.floor}层)`;
        } else if (currentQ.type === 'kill_elite' || currentQ.type === 'kill_boss') {
            text = `目标: ${currentQ.targetName}`;
            if (player.floor !== currentQ.floor) text += ` (目标在: 地牢 ${currentQ.floor}层)`;
        }
    }

    el.innerHTML += `<div><span class="tracker-title" style="color:${titleColor}">${currentQ.title}</span><br><span class="tracker-desc">${text}</span></div>`;
}

function renderAchievements() {
    const list = document.getElementById('achievement-list');
    if (!list) return;
    list.innerHTML = '';

    ACHIEVEMENTS.forEach(ach => {
        const progress = player.achievements[ach.id];
        if (!progress) return;

        const div = document.createElement('div');
        div.className = 'achievement-item' + (progress.completed ? ' completed' : '');

        let progressText = '';
        if (ach.type === 'collect_unique_set') {
            const uniqueItems = [];
            Object.values(player.equipment).forEach(item => {
                if (item && item.unique) uniqueItems.push(item);
            });
            progressText = `${uniqueItems.length} / 8 装备栏位`;
        } else if (ach.type === 'reach_floor') {
            progressText = progress.completed ? '已完成' : `当前 ${player.floor} / ${ach.target} 层`;
        } else if (ach.type === 'no_death_floor') {
            progressText = progress.completed ? '已完成' : `未死亡到达第${player.floor}层`;
        } else if (ach.type === 'reach_level') {
            progressText = progress.completed ? '已完成' : `当前等级 ${player.lvl} / ${ach.target}`;
        } else {
            progressText = `${progress.progress || 0} / ${ach.target}`;
        }

        div.innerHTML = `
                    <div class="ach-name">${ach.name}</div>
                    <div class="ach-desc">${ach.description}</div>
                    <div class="ach-progress">${progressText}</div>
                `;
        list.appendChild(div);
    });
}

// New function for indicators
function updateMenuIndicators() {
    document.getElementById('badge-stats').style.display = player.points > 0 ? 'block' : 'none';
    document.getElementById('badge-skills').style.display = player.skillPoints > 0 ? 'block' : 'none';
    document.getElementById('badge-quest').style.display = player.questState === 2 ? 'block' : 'none';
}

function spawnEnemyTimer() {
    setInterval(() => {
        // 计算存活的怪物数量，而不是总的怪物数组长度
        const aliveEnemies = enemies.filter(e => !e.dead).length;
        // 只有在罗格营地才停止刷新怪物（地狱中继续刷新）
        if (!gameActive || aliveEnemies > GAME_CONFIG.MAX_ENEMIES || isInTown()) return;

        let x, y, v = false; while (!v) { x = Math.random() * MAP_WIDTH * TILE_SIZE; y = Math.random() * MAP_HEIGHT * TILE_SIZE; if (!isWall(x, y)) v = true; }
        if (Math.hypot(x - player.x, y - player.y) < GAME_CONFIG.ENEMY_SPAWN_MIN_DISTANCE) return;

        const f = player.floor;
        const hp = 30 + Math.floor(f * f * 5);
        const dmg = 5 + f * 2;
        const xp = 20 + f * 5;

        // 构建当前层可用的怪物池
        const monsterPool = [
            { type: 'melee', name: '沉沦魔', ai: 'chase', speed: 80, hpMult: 1, dmgMult: 1, weight: 20 }
        ];

        // 1层+: 僵尸
        if (f >= 1) {
            monsterPool.push({ type: 'zombie', name: '僵尸', ai: 'chase', speed: 50, hpMult: 1.5, dmgMult: 0.8, weight: 20 });
        }
        // 2层+: 骷髅弓箭手、骷髅战士
        if (f >= 2) {
            monsterPool.push({ type: 'ranged', name: '骷髅弓箭手', ai: 'ranged', speed: 70, hpMult: 1, dmgMult: 1, weight: 20 });
            monsterPool.push({ type: 'skeleton', name: '骷髅战士', ai: 'chase', speed: 85, hpMult: 1, dmgMult: 1, weight: 15 });
        }
        // 3层+: 沉沦魔巫师
        if (f >= 3) {
            monsterPool.push({ type: 'shaman', name: '沉沦魔巫师', ai: 'revive', speed: 60, hpMult: 1, dmgMult: 1, weight: 10 });
        }
        // 4层+: 幽灵鬼魂
        if (f >= 4) {
            monsterPool.push({ type: 'ghost', name: '幽灵鬼魂', ai: 'phase', speed: 90, hpMult: 0.6, dmgMult: 1.2, weight: 12 });
        }
        // 5层+: 闪电幽魂
        if (f >= 5) {
            monsterPool.push({ type: 'specter', name: '闪电幽魂', ai: 'ranged', speed: 75, hpMult: 1, dmgMult: 1.3, weight: 10 });
        }
        // 6层+: 木乃伊
        if (f >= 6) {
            monsterPool.push({ type: 'mummy', name: '木乃伊', ai: 'chase', speed: 55, hpMult: 1.3, dmgMult: 0.9, weight: 10 });
        }
        // 7层+: 吸血鬼
        if (f >= 7) {
            monsterPool.push({ type: 'vampire', name: '吸血鬼', ai: 'ranged', speed: 80, hpMult: 1.2, dmgMult: 1.1, weight: 10 });
        }

        // 按权重随机选择怪物
        const totalWeight = monsterPool.reduce((sum, m) => sum + m.weight, 0);
        let rand = Math.random() * totalWeight;
        let selected = monsterPool[0];
        for (const monster of monsterPool) {
            rand -= monster.weight;
            if (rand <= 0) {
                selected = monster;
                break;
            }
        }

        let type = selected.type;
        let name = selected.name;
        let ai = selected.ai;
        let speed = selected.speed;
        let hpMult = selected.hpMult;
        let dmgMult = selected.dmgMult;

        let frameIndex = MONSTER_FRAMES[type];
        const isElite = Math.random() < GAME_CONFIG.ELITE_SPAWN_RATE;
        let eliteAffixes = [];

        if (isElite) {
            // 精英怪保持原来的外观，只是名字加前缀
            name = `精英${name}`;

            // 为精英怪添加随机词缀（1-2个）
            const affixCount = Math.random() < GAME_CONFIG.DOUBLE_AFFIX_RATE ? 2 : 1;  // 双词缀概率
            const availableAffixes = [...ELITE_AFFIXES];

            for (let i = 0; i < affixCount; i++) {
                const idx = Math.floor(Math.random() * availableAffixes.length);
                const affix = availableAffixes.splice(idx, 1)[0];
                eliteAffixes.push(affix);
            }
        }

        // 应用怪物类型的属性倍率
        const finalHp = Math.floor(hp * hpMult);
        const finalDmg = Math.floor(dmg * dmgMult);

        const enemy = EnemyPool.acquire({
            x, y, hp: finalHp, maxHp: finalHp, dmg: finalDmg, speed, radius: 12,
            dead: false, cooldown: 0, name, rarity: isElite ? 1 : 0, xpValue: xp,
            ai: ai, frameIndex: frameIndex,
            monsterType: type,              // 怪物类型标识
            eliteAffixes: eliteAffixes      // 精英词缀列表
        });

        // 为特殊怪物添加额外属性
        if (type === 'ghost') {
            enemy.phaseThrough = true;      // 穿墙
            enemy.dodgeChance = 0.3;        // 30%闪避
        }
        if (type === 'mummy') {
            enemy.poisonOnHit = true;       // 中毒攻击
            enemy.poisonDamage = Math.floor(finalDmg * 0.3);  // 30%伤害的毒
        }
        if (type === 'vampire') {
            enemy.lifeSteal = 0.2;          // 20%吸血
        }

        // 应用精英词缀效果
        if (eliteAffixes.length > 0) {
            eliteAffixes.forEach(affix => {
                if (affix.applyStats) {
                    affix.applyStats(enemy);
                }
            });
            // 更新生命值上限（因为词缀可能修改了属性）
            enemy.maxHp = enemy.hp;
        }

        enemies.push(enemy);
    }, GAME_CONFIG.ENEMY_SPAWN_INTERVAL);
}

function takeDamage(e, dmg, isSkillDamage = false) {
    // 幽灵闪避检测
    if (e.dodgeChance && Math.random() < e.dodgeChance) {
        createDamageNumber(e.x, e.y - 20, "闪避!", '#aaaaaa');
        return;
    }

    // 处理新的伤害系统：支持物理和元素伤害
    let totalDamage = 0;

    if (typeof dmg === 'number') {
        // 兼容旧代码：纯数值伤害
        totalDamage = dmg;
    } else if (typeof dmg === 'object') {
        // 新伤害系统：包含多种伤害类型
        // 物理伤害（受护甲影响）
        if (dmg.physical) {
            const armorReduction = e.armor ? e.armor * 0.1 : 0;  // 暂时简化：护甲减少10%伤害
            totalDamage += Math.max(1, dmg.physical - armorReduction);
        }

        // 元素伤害（暂时不受抗性影响，因为敌人还没有抗性系统）
        // 将来可以扩展：if (e.resistances) { ... }
        totalDamage += (dmg.fire || 0);
        totalDamage += (dmg.cold || 0);
        totalDamage += (dmg.lightning || 0);
        totalDamage += (dmg.poison || 0);
    }

    // ========== 天赋效果应用 ==========
    // 基础伤害加成天赋
    const talentDmgPct = getTalentEffect('dmgPct', 0);
    if (talentDmgPct > 0) {
        totalDamage *= (1 + talentDmgPct / 100);
    }

    // 处刑者：对低血量敌人伤害加倍
    if (hasTalent('executioner')) {
        const threshold = TALENTS.executioner.effect.executeThreshold;
        if (e.hp / e.maxHp < threshold) {
            totalDamage *= 2;
            createDamageNumber(e.x, e.y - 25, "处刑!", '#ff4444');
        }
    }

    // 赌徒：伤害随机浮动
    if (hasTalent('gambler')) {
        const mult = 0.5 + Math.random() * 1.5; // 0.5 ~ 2.0
        totalDamage *= mult;
        if (mult > 1.5) createDamageNumber(e.x, e.y - 25, "幸运!", '#ffff00');
        else if (mult < 0.7) createDamageNumber(e.x, e.y - 25, "倒霉...", '#888888');
    }

    // 烈焰之魂：附加火焰伤害
    if (hasTalent('flame_soul')) {
        const fireDmg = totalDamage * 0.3;
        totalDamage += fireDmg;
    }

    // 淬毒之刃：附加毒素伤害
    if (hasTalent('poison_blade')) {
        const poisonDmg = totalDamage * 0.25;
        totalDamage += poisonDmg;
    }

    // 应用精英词缀效果
    if (e.eliteAffixes && e.eliteAffixes.length > 0) {
        // 魔法抗性：技能伤害减免70%
        if (isSkillDamage && e.magicResist) {
            totalDamage *= (1 - e.magicResist);
            createDamageNumber(e.x, e.y - 20, "抗性!", '#aa00ff');
        }

        // 石肤：所有伤害减少50%
        if (e.damageReduction) {
            totalDamage *= (1 - e.damageReduction);
        }
    }

    e.hp -= totalDamage;
    createDamageNumber(e.x, e.y, Math.floor(totalDamage), '#fff');
    AudioSys.play('hit');

    if (e.hp <= 0) {
        // 怪物死亡
        e.dead = true;
        player.kills++;
        // 新手引导：步骤5 - 击杀第一只怪物
        if (player.kills === 1) advanceTutorial(5);

        // 更新击杀统计
        player.stats.currentStreak++;
        if (player.stats.currentStreak > player.stats.maxKillStreak) {
            player.stats.maxKillStreak = player.stats.currentStreak;
        }
        if (e.isBoss) player.stats.bossKills++;
        if (e.isElite) player.stats.eliteKills++;

        // ========== 击杀相关天赋效果 ==========
        // 嗜血：击杀恢复生命（天赋+天神赐福）
        const onKillHealPct = getTalentEffect('onKillHealPct', 0) + (player.onKillHealPct || 0);
        if (onKillHealPct > 0) {
            const healAmt = player.maxHp * onKillHealPct / 100;
            player.hp = Math.min(player.maxHp, player.hp + healAmt);
            createDamageNumber(player.x, player.y - 30, `+${Math.floor(healAmt)}`, '#00ff00');
        }

        // 连锁闪电：击杀时电击周围敌人
        if (hasTalent('thunder_chain')) {
            const chainRange = 150;
            const chainDamage = totalDamage * 0.3;
            enemies.forEach(other => {
                if (!other.dead && other !== e) {
                    const dist = Math.hypot(other.x - e.x, other.y - e.y);
                    if (dist < chainRange) {
                        other.hp -= chainDamage;
                        createDamageNumber(other.x, other.y, Math.floor(chainDamage), '#88ffff');
                        // 创建闪电视觉效果
                        particles.push({
                            x: e.x, y: e.y,
                            tx: other.x, ty: other.y,
                            type: 'chain_lightning',
                            life: 0.3
                        });
                        if (other.hp <= 0) other.dead = true;
                    }
                }
            });
        }

        // 触发精英词缀的死亡效果
        if (e.eliteAffixes && e.eliteAffixes.length > 0) {
            e.eliteAffixes.forEach(affix => {
                if (affix.onDeath) {
                    affix.onDeath(e);
                }
            });
        }

        // 追踪BOSS击杀成就
        if (e.isBoss || e.isQuestTarget) {
            trackAchievement('kill_boss', { isBoss: true, isQuestTarget: e.isQuestTarget, name: e.name });
            trackAchievement('kill_specific_boss', { name: e.name });

            // 设置该层 Boss 刷新计时（5 分钟）
            const cooldown = 5 * 60 * 1000;
            player.bossRespawn[player.floor] = Date.now() + cooldown;
        }

        // 计算经验（检查双倍经验buff）
        let xpGain = e.xpValue || 15;
        if (player.xpBuffExpiry && Date.now() < player.xpBuffExpiry) {
            xpGain *= 2;  // 双倍经验
        }
        player.xp += xpGain;
        createDamageNumber(player.x, player.y - 50, "+" + xpGain + " XP", '#4d69cd');
        dropLoot(e);
        checkLevelUp();

        // QUEST LOGIC
        const currentQ = getCurrentQuest();
        if (currentQ && player.questState === 1) {
            let progressMade = false;

            if (currentQ.type === 'kill_count' && player.floor === currentQ.floor) {
                player.questProgress++;
                if (player.questProgress >= currentQ.target) {
                    player.questState = 2;
                    showNotification("任务完成！");
                    AudioSys.play('quest');
                }
                progressMade = true;
            } else if ((currentQ.type === 'kill_elite' || currentQ.type === 'kill_boss') && e.isQuestTarget) {
                player.questState = 2;
                showNotification(`击败了 ${e.name}！`);
                AudioSys.play('quest');
                progressMade = true;

                // 如果是巴尔（第10层BOSS），解锁地狱模式
                if (e.name === '巴尔' && player.floor === 10) {
                    player.defeatedBaal = true;
                    // 显式触发成就（trackAchievement内部已有防重复机制）
                    trackAchievement('kill_baal', { name: e.name });
                    showNotification('地狱之门已开启！');
                    AudioSys.play('quest');
                }
            }

            if (progressMade) { updateQuestTracker(); updateMenuIndicators(); }
        }
    }
}

function showNotification(msg) {
    const el = document.getElementById('notification-area');
    el.innerText = msg; el.style.opacity = 1; setTimeout(() => el.style.opacity = 0, 2000);
}

// ========== 天赋商店系统逻辑 ==========

// 检查玩家是否拥有某个天赋
function hasTalent(talentId) {
    return player.talents.includes(talentId);
}

// 获取天赋效果值
function getTalentEffect(effectKey, defaultValue = 0) {
    let total = defaultValue;
    for (const talentId of player.talents) {
        const talent = TALENTS[talentId];
        if (talent && talent.effect && talent.effect[effectKey] !== undefined) {
            total += talent.effect[effectKey];
        }
    }
    return total;
}

// 随机刷新天赋商店（3个天赋）
function generateTalentShop() {
    const currentFloor = player.isInHell ? player.hellFloor : player.floor;
    const allTalentIds = Object.keys(TALENTS);

    const availableTalents = allTalentIds.filter(id => {
        // 已拥有的排除
        if (player.talents.includes(id)) return false;
        // 传奇天赋只在5层后出现
        if (TALENTS[id].tier === 'legendary' && currentFloor < 5) return false;
        return true;
    });

    // 随机选择3个（或更少，如果可用天赋不足3个）
    const shopTalents = [];
    const shuffled = availableTalents.sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(3, shuffled.length); i++) {
        shopTalents.push(shuffled[i]);
    }

    player.talentShop = shopTalents;
    return shopTalents;
}

// 待进入的下一层信息（天赋商店确认后使用）
let pendingNextFloor = null;
// 天赋商店是否打开（打开时暂停游戏）
let talentShopOpen = false;

// 天赋上限
const MAX_TALENTS = 5;

// 显示天赋商店（在下楼前调用）
// nextFloor: 即将进入的楼层号
// isHell: 是否是地狱模式
function showTalentShop(nextFloor, isHell = false) {
    // 第1层不显示商店（刚从营地出来）
    if (nextFloor === 1 && !isHell) {
        proceedToNextFloor(nextFloor, isHell);
        return;
    }

    // 地狱第1层也不显示（刚进入地狱）
    if (nextFloor === 1 && isHell) {
        proceedToNextFloor(nextFloor, isHell);
        return;
    }

    // 防止反复进出同一层刷商店：只有进入更高的层才触发
    // 地狱和普通模式分开计算
    const highestKey = isHell ? 'highestHellTalentFloor' : 'highestTalentFloor';
    const currentHighest = player[highestKey] || 0;

    if (nextFloor <= currentHighest) {
        // 已经在这一层或更高层触发过商店，直接进入
        proceedToNextFloor(nextFloor, isHell);
        return;
    }

    // 天赋已满，直接进入下一层
    if (player.talents.length >= MAX_TALENTS) {
        proceedToNextFloor(nextFloor, isHell);
        return;
    }

    // 更新最高触发层数
    player[highestKey] = nextFloor;

    // 保存待进入的楼层信息
    pendingNextFloor = { floor: nextFloor, isHell: isHell };

    // 生成商店天赋
    generateTalentShop();

    // 更新UI
    const overlay = document.getElementById('talent-shop-overlay');
    const floorEl = document.getElementById('talent-shop-floor');
    const goldEl = document.getElementById('talent-shop-gold');
    const gridEl = document.getElementById('talent-grid');

    floorEl.innerText = isHell ? `即将进入 地狱${nextFloor}层` : `即将进入 第${nextFloor}层`;
    goldEl.innerText = player.gold;

    // 生成天赋卡片
    gridEl.innerHTML = '';
    for (const talentId of player.talentShop) {
        const talent = TALENTS[talentId];
        if (!talent) continue;

        const isOwned = player.talents.includes(talentId);
        const canAfford = player.gold >= talent.price;

        const card = document.createElement('div');
        card.className = `talent-card tier-${talent.tier}`;
        if (isOwned) card.classList.add('owned');
        if (!canAfford && !isOwned) card.classList.add('cant-afford');

        card.innerHTML = `
            <div class="talent-card-icon">${talent.icon}</div>
            <div class="talent-card-name" style="color: ${TALENT_TIER_COLORS[talent.tier]}">${talent.name}</div>
            <div class="talent-card-desc">${talent.desc}</div>
            <div class="talent-price">${talent.price} 金</div>
        `;

        if (!isOwned) {
            card.onclick = () => buyTalent(talentId);
        }

        gridEl.appendChild(card);
    }

    // 显示商店
    overlay.classList.add('active');
    talentShopOpen = true;  // 暂停游戏

    // 更新刷新费用显示
    const refreshCostEl = document.getElementById('refresh-cost-display');
    if (refreshCostEl) {
        const nextRefreshCost = 30 * Math.pow(2, player.talentRefreshCount || 0);
        refreshCostEl.innerText = `${nextRefreshCost}金`;
    }

    AudioSys.play('pickup');
}

// 确认进入下一层
function proceedToNextFloor(floor, isHell) {
    if (isHell) {
        player.isInHell = true;
        enterFloor(floor, 'start');
    } else {
        enterFloor(floor, 'start');
    }
    // 新手引导：进入第1层时，显示战斗提示（如果已完成城镇教程）
    if (floor === 1 && !isHell && !player.tutorial.completed && player.tutorial.step >= TUTORIAL_TOWN_STEPS.length) {
        setTimeout(() => showTutorialTip(player.tutorial.step), 800);
    }
}

// 购买天赋
function buyTalent(talentId) {
    const talent = TALENTS[talentId];
    if (!talent) return;

    // 检查是否已拥有
    if (player.talents.includes(talentId)) {
        showNotification('你已经拥有这个天赋了！');
        return;
    }

    // 检查金币是否足够
    if (player.gold < talent.price) {
        showNotification('金币不足！');
        AudioSys.play('hit');
        return;
    }

    // 扣除金币
    player.gold -= talent.price;

    // 添加天赋
    player.talents.push(talentId);

    // 播放音效和通知
    AudioSys.play('levelup');
    showNotification(`获得天赋：${talent.name}！`);

    // 更新HUD
    updateTalentHUD();

    // 保存游戏
    SaveSystem.save();

    // 每层只能买1个，买完直接进入下一层
    closeTalentShop();
}

// 刷新天赋商店（花费递增金币：30→60→120→240...）
function refreshTalentShop() {
    const baseRefreshCost = 30;
    const refreshCost = baseRefreshCost * Math.pow(2, player.talentRefreshCount || 0);

    if (player.gold < refreshCost) {
        showNotification(`金币不足！需要 ${refreshCost} 金`);
        AudioSys.play('hit');
        return;
    }

    player.gold -= refreshCost;
    player.talentRefreshCount = (player.talentRefreshCount || 0) + 1;
    generateTalentShop();

    // 重新渲染商店
    const goldEl = document.getElementById('talent-shop-gold');
    const gridEl = document.getElementById('talent-grid');

    goldEl.innerText = player.gold;

    // 生成天赋卡片
    gridEl.innerHTML = '';
    for (const talentId of player.talentShop) {
        const talent = TALENTS[talentId];
        if (!talent) continue;

        const isOwned = player.talents.includes(talentId);
        const canAfford = player.gold >= talent.price;

        const card = document.createElement('div');
        card.className = `talent-card tier-${talent.tier}`;
        if (isOwned) card.classList.add('owned');
        if (!canAfford && !isOwned) card.classList.add('cant-afford');

        card.innerHTML = `
            <div class="talent-card-icon">${talent.icon}</div>
            <div class="talent-card-name" style="color: ${TALENT_TIER_COLORS[talent.tier]}">${talent.name}</div>
            <div class="talent-card-desc">${talent.desc}</div>
            <div class="talent-price">${talent.price} 金</div>
        `;

        if (!isOwned) {
            card.onclick = () => buyTalent(talentId);
        }

        gridEl.appendChild(card);
    }

    // 更新刷新费用显示（显示下次刷新的费用）
    const refreshCostEl = document.getElementById('refresh-cost-display');
    if (refreshCostEl) {
        const nextRefreshCost = 30 * Math.pow(2, player.talentRefreshCount || 0);
        refreshCostEl.innerText = `${nextRefreshCost}金`;
    }

    AudioSys.play('pickup');
}

// 关闭天赋商店并进入下一层
function closeTalentShop() {
    talentShopOpen = false;  // 恢复游戏
    const overlay = document.getElementById('talent-shop-overlay');
    overlay.classList.remove('active');

    // 进入待进入的楼层
    if (pendingNextFloor) {
        proceedToNextFloor(pendingNextFloor.floor, pendingNextFloor.isHell);
        pendingNextFloor = null;
    }
}

// 更新天赋HUD显示
function updateTalentHUD() {
    const hudEl = document.getElementById('talent-hud');
    if (!hudEl) return;

    hudEl.innerHTML = '';

    for (const talentId of player.talents) {
        const talent = TALENTS[talentId];
        if (!talent) continue;

        const icon = document.createElement('div');
        icon.className = `talent-hud-icon tier-${talent.tier}`;
        icon.innerText = talent.icon;
        icon.title = `${talent.name}: ${talent.desc}`;

        hudEl.appendChild(icon);
    }
}

// 重置天赋（回城/死亡时调用）
function resetTalents() {
    player.talents = [];
    player.talentShop = [];
    player.phoenixUsed = false;
    player.highestTalentFloor = 0;      // 普通模式已触发商店的最高层
    player.highestHellTalentFloor = 0;  // 地狱模式已触发商店的最高层
    player.talentRefreshCount = 0;      // 重置刷新次数
    updateTalentHUD();
}

// ========== 天神赐福系统逻辑 ==========
let divineBlessingOpen = false;
let divineBlessingCards = [];

// 更新天神赐福HUD图标（常驻显示）
function updateDivineBlessingHUD() {
    const btn = document.getElementById('btn-divine-blessing');
    if (!btn) return;
    btn.style.display = 'block'; // 始终显示
    const badge = btn.querySelector('.db-count-badge');
    if (player.divineBlessing.pending > 0) {
        // 有待领取：金色动画 + 角标
        btn.classList.add('has-pending');
        badge.style.display = 'inline';
        badge.innerText = player.divineBlessing.pending;
    } else {
        // 无待领取：静止状态，显示已获得数量
        btn.classList.remove('has-pending');
        const obtainedCount = player.divineBlessing.obtained.length;
        if (obtainedCount > 0) {
            badge.style.display = 'inline';
            badge.innerText = obtainedCount;
        } else {
            badge.style.display = 'none';
        }
    }
}

// 生成3张随机赐福卡牌
const BLESSING_RARE_CHANCE = 0.15;   // 基础稀有率 15%
const BLESSING_PITY_THRESHOLD = 5;   // 连续5次普通后保底出稀有

function generateDivineBlessingCards() {
    // 统计每种赐福已获得次数
    const obtainedCount = {};
    for (const b of player.divineBlessing.obtained) {
        obtainedCount[b.id] = (obtainedCount[b.id] || 0) + 1;
    }

    // 过滤掉已达上限的赐福
    const pool = DIVINE_BLESSING_POOL.filter(b =>
        (obtainedCount[b.id] || 0) < MAX_BLESSING_STACK
    );

    const cards = [];
    const availablePool = [...pool];

    // 初始化保底计数器（如果不存在）
    if (typeof player.divineBlessing.normalStreak === 'undefined') {
        player.divineBlessing.normalStreak = 0;
    }

    for (let i = 0; i < 3 && availablePool.length > 0; i++) {
        const idx = Math.floor(Math.random() * availablePool.length);
        const blessing = availablePool.splice(idx, 1)[0];

        // 保底逻辑：连续5次普通后必出稀有
        const streak = player.divineBlessing.normalStreak || 0;
        const isRare = (streak >= BLESSING_PITY_THRESHOLD) || (Math.random() < BLESSING_RARE_CHANCE);

        cards.push({
            ...blessing,
            rarity: isRare ? 1 : 0,
            finalEffect: isRare ? blessing.rareEffect : blessing.effect
        });
    }
    return cards;
}

// 显示天神赐福选择界面
function showDivineBlessingUI() {
    if (player.divineBlessing.pending <= 0) return;
    divineBlessingCards = generateDivineBlessingCards();
    divineBlessingOpen = true;

    const panel = document.getElementById('divine-blessing-panel');
    const gridEl = document.getElementById('divine-blessing-grid');
    gridEl.innerHTML = '';

    for (let i = 0; i < divineBlessingCards.length; i++) {
        const card = divineBlessingCards[i];
        const effectText = Object.entries(card.finalEffect).map(([k, v]) => {
            const names = {
                dmgPct: '伤害', lifeSteal: '生命偷取', critChance: '暴击率', critDamage: '暴击伤害',
                maxHp: '最大生命', def: '护甲', allRes: '全抗', hpRegenPct: '生命回复/秒',
                maxMp: '最大法力', mpRegenPct: '法力回复', fireDmgPct: '火焰伤害',
                poisonDmgPct: '毒素伤害', thornsPct: '荆棘反伤', goldPct: '金币掉落', dropRatePct: '装备掉落',
                onKillHealPct: '击杀回血'
            };
            return `+${v}${k.includes('Pct') || k.includes('Chance') || k === 'allRes' || k === 'lifeSteal' ? '%' : ''} ${names[k] || k}`;
        }).join(', ');

        const cardEl = document.createElement('div');
        cardEl.className = `db-card ${card.rarity === 1 ? 'rare' : 'normal'}`;
        cardEl.innerHTML = `<div class="db-card-icon">${card.icon || '✨'}</div><div class="db-card-name">${card.name}</div><div class="db-card-effect">${effectText}</div>`;
        cardEl.onclick = () => selectDivineBlessing(i);
        gridEl.appendChild(cardEl);
    }

    panel.style.display = 'block';
    panel.style.zIndex = 1000;
}

// 关闭天神赐福界面
function closeDivineBlessingUI() {
    divineBlessingOpen = false;
    document.getElementById('divine-blessing-panel').style.display = 'none';
}

// 选择赐福
function selectDivineBlessing(index) {
    const card = divineBlessingCards[index];
    if (!card) return;

    // 添加到已获得列表
    player.divineBlessing.obtained.push({
        id: card.id,
        name: card.name,
        rarity: card.rarity,
        effect: card.finalEffect,
        level: player.lvl
    });

    // 更新保底计数器
    if (card.rarity === 1) {
        player.divineBlessing.normalStreak = 0;  // 选到稀有，重置计数
    } else {
        player.divineBlessing.normalStreak = (player.divineBlessing.normalStreak || 0) + 1;
    }

    player.divineBlessing.pending--;
    divineBlessingOpen = false;

    closeDivineBlessingUI();

    // 生成效果文字
    const effectNames = {
        dmgPct: '伤害', lifeSteal: '生命偷取', critChance: '暴击率', critDamage: '暴击伤害',
        maxHp: '最大生命', def: '护甲', allRes: '全抗', hpRegenPct: '生命回复/秒',
        maxMp: '最大法力', mpRegenPct: '法力回复', fireDmgPct: '火焰伤害',
        poisonDmgPct: '毒素伤害', thornsPct: '荆棘反伤', goldPct: '金币掉落', dropRatePct: '装备掉落',
        onKillHealPct: '击杀回血'
    };
    const effectText = Object.entries(card.finalEffect).map(([k, v]) => {
        const isPercent = k.includes('Pct') || k.includes('Chance') || k === 'allRes' || k === 'lifeSteal';
        return `+${v}${isPercent ? '%' : ''} ${effectNames[k] || k}`;
    }).join(', ');

    createDamageNumber(player.x, player.y - 70, `${effectText} (永久)`, '#ffd700');
    showNotification(`${card.name}：${effectText} (永久)`);
    AudioSys.play('cash');

    updateStats();
    updateStatsUI();
    updateDivineBlessingHUD();
    SaveSystem.save();

    // 还有待领取的，继续弹出
    if (player.divineBlessing.pending > 0) {
        setTimeout(() => showDivineBlessingUI(), 500);
    }
}

// 获取天神赐福效果值
function getDivineBlessingEffect(effectKey, defaultValue = 0) {
    let total = defaultValue;
    for (const blessing of player.divineBlessing.obtained) {
        if (blessing.effect && blessing.effect[effectKey] !== undefined) {
            total += blessing.effect[effectKey];
        }
    }
    return total;
}

// 赐福按钮点击处理
function onDivineBlessingBtnClick() {
    if (player.divineBlessing.pending > 0) {
        // 已经打开选择界面时不重复触发（防止刷选项）
        if (divineBlessingOpen) return;
        showDivineBlessingUI();
    } else {
        showDivineBlessingListUI();
    }
}

// 显示已获得赐福列表面板
function showDivineBlessingListUI() {
    const panel = document.getElementById('divine-blessing-list-panel');
    const listEl = document.getElementById('divine-blessing-list');
    const summaryEl = document.getElementById('divine-blessing-summary');

    // 效果名称映射
    const effectNames = {
        dmgPct: '伤害', lifeSteal: '生命偷取', critChance: '暴击率', critDamage: '暴击伤害',
        maxHp: '最大生命', def: '护甲', allRes: '全抗', hpRegenPct: '生命回复/秒',
        maxMp: '最大法力', mpRegenPct: '法力回复', fireDmgPct: '火焰伤害',
        poisonDmgPct: '毒素伤害', thornsPct: '荆棘反伤', goldPct: '金币掉落', dropRatePct: '装备掉落',
        onKillHealPct: '击杀回血'
    };

    // 生成列表
    if (player.divineBlessing.obtained.length === 0) {
        listEl.innerHTML = '<div style="color:#888; text-align:center; padding:20px;">暂无赐福<br><span style="font-size:11px;">每5级获得一次赐福机会</span></div>';
    } else {
        listEl.innerHTML = player.divineBlessing.obtained.map(b => {
            const effectText = Object.entries(b.effect).map(([k, v]) => {
                const isPercent = k.includes('Pct') || k.includes('Chance') || k === 'allRes' || k === 'lifeSteal';
                return `+${v}${isPercent ? '%' : ''} ${effectNames[k] || k}`;
            }).join(', ');
            const rarityClass = b.rarity === 1 ? 'rare' : 'normal';
            // 找到对应的图标
            const poolItem = DIVINE_BLESSING_POOL.find(p => p.id === b.id);
            const icon = poolItem ? poolItem.icon : '✨';
            return `<div class="db-list-item ${rarityClass}">
                <span class="db-list-icon">${icon}</span>
                <span class="db-list-name">${b.name}</span>
                <span class="db-list-effect">${effectText}</span>
                <span class="db-list-level">Lv.${b.level}</span>
            </div>`;
        }).join('');
    }

    // 汇总所有效果
    const totals = {};
    for (const b of player.divineBlessing.obtained) {
        for (const [k, v] of Object.entries(b.effect)) {
            totals[k] = (totals[k] || 0) + v;
        }
    }
    if (Object.keys(totals).length > 0) {
        const summaryText = Object.entries(totals).map(([k, v]) => {
            const isPercent = k.includes('Pct') || k.includes('Chance') || k === 'allRes' || k === 'lifeSteal';
            return `<span style="color:#88ff88">+${v}${isPercent ? '%' : ''}</span> ${effectNames[k] || k}`;
        }).join('、');
        summaryEl.innerHTML = `<div style="color:#ffd700; font-size:12px; margin-bottom:5px;">累计加成</div><div style="font-size:11px; color:#ccc; line-height:1.6;">${summaryText}</div>`;
    } else {
        summaryEl.innerHTML = '';
    }

    panel.style.display = 'block';
    panel.style.zIndex = 1000;
}

// 关闭已获得赐福列表面板
function closeDivineBlessingListUI() {
    document.getElementById('divine-blessing-list-panel').style.display = 'none';
}

// ========== 每日登录奖励系统 ==========

// 获取今日日期字符串 (YYYY-MM-DD)
function getTodayDateString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 检查并更新登录状态
function checkDailyLogin() {
    const today = getTodayDateString();
    const login = player.dailyLogin;

    if (login.lastLoginDate === today) {
        // 今天已登录过，不弹窗但可以手动打开查看
        return;
    }

    // 新的一天
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    if (login.lastLoginDate === yesterdayStr) {
        // 连续登录
        login.consecutiveDays = (login.consecutiveDays % 7) + 1;
    } else {
        // 断签，重新开始
        login.consecutiveDays = 1;
    }

    login.lastLoginDate = today;
    login.claimedToday = false;
    SaveSystem.save();

    // 延迟弹出面板，等游戏加载完成
    setTimeout(() => showDailyLoginPanel(), 500);
}

// 显示每日登录面板
function showDailyLoginPanel() {
    const panel = document.getElementById('daily-login-panel');
    const infoEl = document.getElementById('daily-login-info');
    const gridEl = document.getElementById('daily-login-grid');
    const claimBtn = document.getElementById('btn-claim-daily');

    const login = player.dailyLogin;
    const currentDay = login.consecutiveDays || 1;

    infoEl.innerHTML = `连续登录 <span style="font-size:20px;">${currentDay}</span> 天`;

    // 生成7天奖励格子
    gridEl.innerHTML = DAILY_LOGIN_REWARDS.map((reward, idx) => {
        const day = idx + 1;
        let stateClass = '';
        if (day < currentDay) {
            stateClass = 'claimed'; // 已领取
        } else if (day === currentDay) {
            stateClass = login.claimedToday ? 'claimed' : 'current'; // 今日
        } else {
            stateClass = 'locked'; // 未解锁
        }
        const day7Class = day === 7 ? 'day7' : '';
        return `<div class="daily-reward-card ${stateClass} ${day7Class}">
            <div class="daily-reward-day">Day ${day}</div>
            <div class="daily-reward-icon">${reward.icon}</div>
            <div class="daily-reward-name">${reward.name}</div>
            ${stateClass === 'claimed' ? '<div class="daily-reward-check">✓</div>' : ''}
        </div>`;
    }).join('');

    // 更新按钮状态
    if (login.claimedToday) {
        claimBtn.disabled = true;
        claimBtn.innerText = '今日已领取';
    } else {
        claimBtn.disabled = false;
        claimBtn.innerText = '领取奖励';
    }

    panel.style.display = 'block';
    panel.style.zIndex = 1001;
}

// 关闭每日登录面板
function closeDailyLoginPanel() {
    document.getElementById('daily-login-panel').style.display = 'none';
}

// 领取每日奖励
function claimDailyReward() {
    const login = player.dailyLogin;
    if (login.claimedToday) return;

    const currentDay = login.consecutiveDays || 1;
    const reward = DAILY_LOGIN_REWARDS[currentDay - 1];
    if (!reward) return;

    // 发放奖励
    switch (reward.type) {
        case 'gold':
            addGold(reward.amount);
            break;
        case 'potion':
            for (let i = 0; i < reward.amount; i++) {
                if (reward.heal) {
                    addItemToInventory({ type: 'potion', name: '治疗药剂', heal: 50, rarity: 0, stackable: true, count: 1 });
                } else if (reward.mana) {
                    addItemToInventory({ type: 'potion', name: '法力药剂', mana: 30, rarity: 0, stackable: true, count: 1 });
                }
            }
            break;
        case 'scroll':
            for (let i = 0; i < reward.amount; i++) {
                addItemToInventory({ type: 'scroll', name: '回城卷轴', rarity: 0, stackable: true, count: 1 });
            }
            break;
        case 'buff_xp':
            // 24小时双倍经验buff
            player.xpBuffExpiry = Date.now() + reward.amount * 60 * 60 * 1000;  // 小时转毫秒
            showNotification('双倍经验已激活！持续24小时');
            break;
        case 'unique_item':
            // 生成一个随机暗金装备（从BASE_ITEMS中筛选可装备物品）
            const equipableItems = BASE_ITEMS.filter(i => i.type !== 'potion' && i.type !== 'scroll');
            const randomBase = equipableItems[Math.floor(Math.random() * equipableItems.length)];
            const uniqueItem = createItem(randomBase.name, player.lvl);
            uniqueItem.rarity = 4;
            uniqueItem.displayName = "暗金·" + uniqueItem.name;
            uniqueItem.stats.allSkills = (uniqueItem.stats.allSkills || 0) + 1;
            uniqueItem.stats.dmgPct = (uniqueItem.stats.dmgPct || 0) + 50;
            uniqueItem.stats.lifeSteal = (uniqueItem.stats.lifeSteal || 0) + 5;
            addItemToInventory(uniqueItem);
            break;
    }

    login.claimedToday = true;

    // 华丽领取特效
    playDailyRewardEffect(currentDay, reward);

    // 更新UI
    updateUI();
    renderInventory();
    showDailyLoginPanel(); // 刷新面板显示
    SaveSystem.save();
}

// 每日奖励领取特效
function playDailyRewardEffect(day, reward) {
    const isDay7 = day === 7;  // 第7天特殊大奖

    // 1. 震屏效果
    triggerScreenShake(isDay7 ? 12 : 6, isDay7 ? 0.4 : 0.25);

    // 2. 全屏闪光效果
    const flash = document.createElement('div');
    flash.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: ${isDay7 ? 'radial-gradient(circle, rgba(255,215,0,0.8) 0%, rgba(255,165,0,0.4) 50%, transparent 100%)' : 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, transparent 70%)'};
        pointer-events: none; z-index: 9999;
        animation: dailyFlash ${isDay7 ? '0.8s' : '0.5s'} ease-out forwards;
    `;
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), isDay7 ? 800 : 500);

    // 3. 粒子爆发
    const colors = isDay7 ?
        ['#ffd700', '#ffaa00', '#ff8800', '#ffffff', '#ffff00'] :
        ['#87ceeb', '#98fb98', '#dda0dd', '#ffffff'];
    const particleCount = isDay7 ? 40 : 20;

    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 / particleCount) * i + Math.random() * 0.5;
        const speed = 100 + Math.random() * 150;
        particles.push({
            x: player.x,
            y: player.y - 30,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 80,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 0.8 + Math.random() * 0.4,
            size: isDay7 ? 4 + Math.random() * 4 : 2 + Math.random() * 3,
            gravity: 120
        });
    }

    // 4. 上升星星效果（第7天特有）
    if (isDay7) {
        for (let i = 0; i < 15; i++) {
            particles.push({
                type: 'rising_spark',
                x: player.x + (Math.random() - 0.5) * 60,
                y: player.y,
                vy: -180 - Math.random() * 100,
                color: '#ffd700',
                life: 1.2 + Math.random() * 0.5,
                size: 4 + Math.random() * 3
            });
        }
    }

    // 5. 大字浮动文字
    createFloatingText(player.x, player.y - 80, `${reward.icon} ${reward.name}`, isDay7 ? '#ffd700' : '#87ceeb', isDay7 ? 2.5 : 2);

    // 6. 播放音效
    if (isDay7) {
        AudioSys.play('drop_unique');  // 暗金掉落音效
        setTimeout(() => AudioSys.play('levelup'), 300);  // 叠加升级音效
    } else {
        AudioSys.play('quest');  // 任务完成音效
    }

    // 7. 显示通知
    showNotification(`🎁 Day${day} 奖励领取成功：${reward.name}！`);
}

// 显示传送门层数选择对话框
function showPortalFloorChoice(lastFloor, maxFloor) {
    const dialogBox = document.getElementById('dialog-box');
    const dialogName = document.getElementById('dialog-name');
    const dialogText = document.getElementById('dialog-text');
    const dialogOptions = document.getElementById('dialog-options');

    dialogName.innerText = '传送门';
    dialogText.innerText = '选择要前往的层数：';

    dialogOptions.innerHTML = `
        <button class="dialog-btn" onclick="selectPortalFloor(${lastFloor})">第 ${lastFloor} 层 (上次离开)</button>
        <button class="dialog-btn" onclick="selectPortalFloor(${maxFloor})">第 ${maxFloor} 层 (最高记录)</button>
        <button class="dialog-btn" onclick="closeDialog()">取消</button>
    `;

    dialogBox.style.display = 'block';
}

// 选择传送门目标层数
function selectPortalFloor(floor) {
    closeDialog();
    enterFloor(floor, 'portal');
}

// 计算装备需求
function calculateItemRequirements(item, level, rarity) {
    // 药水和卷轴不需要需求
    if (item.type === 'potion' || item.type === 'scroll') {
        return null;
    }

    const requirements = {};

    // 基础等级需求 = 楼层等级
    let levelReq = Math.max(1, level);

    // 根据稀有度增加等级需求
    if (rarity === 2) levelReq += 2;  // 魔法
    if (rarity === 3) levelReq += 5;  // 稀有
    if (rarity === 4) levelReq += 10; // 暗金

    requirements.level = levelReq;

    // 根据装备类型设置力量/敏捷需求
    if (item.type === 'weapon') {
        // 武器：基于伤害值
        if (item.minDmg) {
            const avgDmg = (item.minDmg + item.maxDmg) / 2;
            requirements.str = Math.floor(avgDmg * 2);
            requirements.dex = Math.floor(avgDmg * 1.5);
        }
    } else if (item.type === 'armor' || item.type === 'helm' || item.type === 'gloves' ||
        item.type === 'boots' || item.type === 'belt') {
        // 防具：基于防御值
        if (item.def) {
            requirements.str = Math.floor(item.def * 1.5);
        }
    } else if (item.type === 'ring' || item.type === 'amulet') {
        // 饰品：较低需求
        requirements.str = Math.floor(levelReq / 2);
        requirements.dex = Math.floor(levelReq / 2);
    }

    // 确保需求不为0
    if (requirements.str) requirements.str = Math.max(5, requirements.str);
    if (requirements.dex) requirements.dex = Math.max(5, requirements.dex);

    return requirements;
}

function createItem(baseName, level) {
    let base = BASE_ITEMS.find(i => i.name === baseName) || BASE_ITEMS[Math.floor(Math.random() * BASE_ITEMS.length)];
    let item = { ...base, id: Math.random().toString(36), stats: {}, displayName: base.name, quantity: 1 };

    if (!item.icon) {
        if (item.type === 'weapon') item.icon = '⚔️';
        if (item.type === 'armor') item.icon = '🛡️';
        if (item.type === 'ring') item.icon = '💍';
    }

    if (level > 1) {
        if (item.minDmg) { item.minDmg += level; item.maxDmg += level * 2; }
        if (item.def) item.def += level;
    }
    if (item.type !== 'potion' && item.type !== 'scroll') {
        const rand = Math.random(); item.rarity = rand < 0.05 ? 4 : rand < 0.2 ? 3 : rand < 0.5 ? 2 : 1;
    }
    if (item.rarity >= 2) {
        const p = AFFIXES.prefixes[Math.floor(Math.random() * AFFIXES.prefixes.length)];
        item.displayName = p.name + " " + item.name; item.stats[p.stat] = Math.floor(Math.random() * (p.max - p.min)) + p.min;
    }
    if (item.rarity >= 3) {
        const s = AFFIXES.suffixes[Math.floor(Math.random() * AFFIXES.suffixes.length)];
        item.displayName += s.name; item.stats[s.stat] = (item.stats[s.stat] || 0) + Math.floor(Math.random() * (s.max - s.min)) + s.min;
    }
    if (item.rarity === 4) { item.displayName = "暗金·" + item.name; item.stats.allSkills = 1; item.stats.dmgPct = 50; item.stats.lifeSteal = 5; }

    // 计算并添加装备需求
    const requirements = calculateItemRequirements(item, level || 1, item.rarity);
    if (requirements) {
        item.requirements = requirements;
    }

    return item;
}

// 生成套装物品
function createSetItem(setId, pieceSlot, level) {
    const setData = SET_ITEMS[setId];
    if (!setData || !setData.pieces[pieceSlot]) {
        console.error(`Invalid set item: ${setId} - ${pieceSlot}`);
        return null;
    }

    const pieceData = setData.pieces[pieceSlot];

    // 创建套装物品
    const item = {
        ...pieceData,
        setId: setId,
        setName: setData.name,
        rarity: 5,  // 套装稀有度为5（绿色）
        displayName: pieceData.name,
        id: Math.random().toString(36),
        quantity: 1,
        stats: { ...pieceData.stats }  // 复制属性对象
    };

    // 根据等级提升属性
    if (level > 1) {
        if (item.minDmg) {
            item.minDmg += Math.floor(level * 1.5);
            item.maxDmg += Math.floor(level * 2.5);
        }
        if (item.def) {
            item.def += Math.floor(level * 2);
        }
    }

    // 添加装备需求
    const requirements = calculateItemRequirements(item, level || 1, 5);
    if (requirements) {
        item.requirements = requirements;
    }

    return item;
}

// 随机生成一个套装物品（从所有套装中随机选择）
function generateRandomSetItem(level) {
    const setIds = Object.keys(SET_ITEMS);
    const randomSetId = setIds[Math.floor(Math.random() * setIds.length)];
    const setData = SET_ITEMS[randomSetId];
    const pieceSlots = Object.keys(setData.pieces);
    const randomSlot = pieceSlots[Math.floor(Math.random() * pieceSlots.length)];

    return createSetItem(randomSetId, randomSlot, level);
}

function addItemToInventory(i) {
    if (i.stackable) {
        const existing = player.inventory.find(invItem => invItem && invItem.name === i.name);
        if (existing) { existing.quantity = (existing.quantity || 1) + 1; renderInventory(); updateBeltUI(); AudioSys.play('gold'); return true; }
    }
    const idx = player.inventory.findIndex(x => !x); if (idx < 0) return false; player.inventory[idx] = i; renderInventory(); updateBeltUI(); AudioSys.play('gold');

    // 追踪稀有物品发现
    trackItemFound(i);

    // 检查套装收藏成就
    if (i.setId) {
        checkSetAchievements();
    }

    return true;
}

function createLightningEffect(targetX, targetY) {
    // 闪电效果：从目标正上方落下
    const startX = targetX + (Math.random() - 0.5) * 50;
    const startY = targetY - 250; // 固定从上方 250 像素处落下

    const segments = 8;
    let currentX = startX;
    let currentY = startY;
    const stepY = (targetY - startY) / segments;

    const points = [{ x: startX, y: startY }];

    for (let i = 1; i < segments; i++) {
        currentY += stepY;
        const offset = (Math.random() - 0.5) * 80; // 随机偏移
        currentX += (targetX - currentX) / (segments - i) + offset;
        points.push({ x: currentX, y: currentY });
    }
    points.push({ x: targetX, y: targetY });

    // 设置全局激活的闪电特效
    player.activeLightning = {
        points: points,
        life: 1.0 // 初始生命值
    };

    // 备用视觉：在目标点创建一个爆炸粒子，确保至少能看到击中位置
    createNovaEffect(targetX, targetY, '#ffff00');
}

// 寻找最近的敌人（用于闪电链）
function findNearestEnemy(x, y, maxRange, excludeSet) {
    let nearest = null;
    let minDist = maxRange;

    enemies.forEach(e => {
        if (e.dead || excludeSet.has(e)) return;  // 跳过死亡或已击中的敌人

        const dist = Math.hypot(e.x - x, e.y - y);
        if (dist < minDist) {
            minDist = dist;
            nearest = e;
        }
    });

    return nearest;
}

// 创建闪电链视觉效果（从一个目标到另一个目标）
function createLightningChain(fromX, fromY, toX, toY) {
    const segments = 5;
    const dx = toX - fromX;
    const dy = toY - fromY;

    const points = [{ x: fromX, y: fromY }];

    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const baseX = fromX + dx * t;
        const baseY = fromY + dy * t;

        // 添加随机偏移让闪电看起来更自然
        const offset = (Math.random() - 0.5) * 30;
        const perpX = -dy / Math.hypot(dx, dy);
        const perpY = dx / Math.hypot(dx, dy);

        points.push({
            x: baseX + perpX * offset,
            y: baseY + perpY * offset
        });
    }
    points.push({ x: toX, y: toY });

    // 添加到粒子系统中
    particles.push({
        type: 'lightning_chain',
        points: points,
        life: 0.3,  // 闪电链持续0.3秒
        color: '#ffff00',
        alpha: 1.0
    });
}


function createNovaEffect(x, y, color) {
    const count = 12;
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i;
        const speed = 150;
        particles.push({
            x: x, y: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0.5,
            color: color,
            size: 3,
            type: 'particle'
        });
    }
}

function createDamageNumber(x, y, val, color) { damageNumbers.push({ x, y, val, color, life: 1 }); }
function createSlashEffect(fromX, fromY, toX, toY, damage = 50) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const count = damage < 50 ? 1 : damage < 150 ? 2 : 3;
    const offsets = count === 1 ? [0] : count === 2 ? [-0.5, 0.5] : [-0.7, 0, 0.7];
    offsets.forEach(off => {
        slashEffects.push({
            x: fromX + Math.cos(angle) * 10,
            y: fromY + Math.sin(angle) * 10,
            angle: angle + off,
            radius: 30,
            life: 1.0
        });
    });
}

function createFloatingText(x, y, text, color = '#ffff00', duration = 2) {
    // 创建DOM元素显示浮动文字
    const container = document.getElementById('floating-texts-container');
    if (!container) return;

    const el = document.createElement('div');
    el.className = 'floating-text';
    el.textContent = text;
    el.style.color = color;
    el.style.left = (x - camera.x) + 'px';
    el.style.top = (y - camera.y - 20) + 'px';
    el.style.opacity = '1';

    container.appendChild(el);

    // 使用动画而不是存储在数组中
    let life = 0;
    const speed = 30; // 像素/秒
    const interval = 50; // 更新间隔（毫秒）

    const animate = () => {
        life += interval / 1000;
        const progress = life / duration;

        if (progress >= 1) {
            el.remove();
            return;
        }

        // 向上移动并淡出
        const currentY = y - camera.y - 20 - (life * speed);
        el.style.top = currentY + 'px';
        el.style.opacity = (1 - progress).toString();

        setTimeout(animate, interval);
    };

    animate();
}
function createParticle(x, y, color, size = 3) { particles.push({ x, y, color, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.5, size }); }

// ========== 掉落特效系统 ==========
let screenShake = { intensity: 0, duration: 0 };

// 震屏效果
function triggerScreenShake(intensity = 10, duration = 0.3) {
    screenShake.intensity = intensity;
    screenShake.duration = duration;
}

// 创建掉落光柱特效
function createDropBeam(x, y, rarity) {
    const isUnique = rarity === 4;
    const isSet = rarity === 5;

    if (!isUnique && !isSet) return;

    // 光柱颜色
    const beamColor = isUnique ? '#ffd700' : '#00ff88';
    const glowColor = isUnique ? 'rgba(255, 215, 0, 0.6)' : 'rgba(0, 255, 136, 0.6)';

    // 创建光柱粒子
    particles.push({
        type: 'drop_beam',
        x: x,
        y: y,
        color: beamColor,
        glowColor: glowColor,
        life: 1.5,           // 持续1.5秒
        maxLife: 1.5,
        height: 200,         // 光柱高度
        width: isUnique ? 40 : 30,
        isUnique: isUnique
    });

    // 火花粒子
    const sparkCount = isUnique ? 25 : 15;
    for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 / sparkCount) * i + Math.random() * 0.3;
        const speed = 80 + Math.random() * 120;
        const sparkColor = isUnique ?
            ['#ffd700', '#ffaa00', '#ff8800', '#ffffff'][Math.floor(Math.random() * 4)] :
            ['#00ff88', '#00ffaa', '#88ffcc', '#ffffff'][Math.floor(Math.random() * 4)];

        particles.push({
            x: x,
            y: y - 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 100,  // 向上偏移
            color: sparkColor,
            life: 0.6 + Math.random() * 0.4,
            size: 2 + Math.random() * 3,
            gravity: 150  // 重力效果
        });
    }

    // 上升光点
    for (let i = 0; i < 10; i++) {
        particles.push({
            type: 'rising_spark',
            x: x + (Math.random() - 0.5) * 30,
            y: y,
            vy: -150 - Math.random() * 100,
            color: beamColor,
            life: 1.0 + Math.random() * 0.5,
            size: 3 + Math.random() * 2
        });
    }

    // 播放音效和震屏
    if (isUnique) {
        AudioSys.play('drop_unique');
        triggerScreenShake(8, 0.25);
    } else {
        AudioSys.play('drop_set');
        triggerScreenShake(5, 0.2);
    }
}
function checkPlayerDeath() {
    if (player.hp <= 0) {
        // 凤凰天赋：死亡时复活一次
        if (hasTalent('phoenix') && !player.phoenixUsed) {
            player.phoenixUsed = true;
            player.hp = player.maxHp * 0.5;
            createFloatingText(player.x, player.y - 50, "凤凰涅槃！", '#ff8800', 2);
            AudioSys.play('levelup');
            // 创建复活特效
            for (let i = 0; i < 20; i++) {
                particles.push({
                    x: player.x, y: player.y,
                    color: '#ff8800',
                    vx: (Math.random() - 0.5) * 200,
                    vy: (Math.random() - 0.5) * 200,
                    life: 1,
                    size: 5
                });
            }
            return; // 不执行死亡逻辑
        }

        // 标记玩家曾经死亡
        player.died = true;

        // 设置死亡状态和倒计时
        player.isDead = true;
        player.deathTimer = 5; // 5秒倒计时

        // 添加死亡全屏灰度滤镜
        document.getElementById('game-container').classList.add('dead-filter');

        // 提交排行榜（死亡时更新）
        if (typeof OnlineSystem !== 'undefined') {
            OnlineSystem.submitScore({
                level: player.lvl,
                kills: player.kills,
                maxFloor: player.isInHell ? player.hellFloor + 10 : player.floor,
                isHell: player.isInHell
            });
        }

        // 显示死亡原因
        const deathMsg = player.lastDamageSource ? `被 ${player.lastDamageSource} 击杀` : "你死了！";
        createFloatingText(player.x, player.y - 50, deathMsg, '#ff4444', 3);
        showNotification(deathMsg);
        AudioSys.play('hit'); // 播放死亡音效

        // 关闭自动战斗
        if (AutoBattle.enabled) {
            AutoBattle.enabled = false;
            document.getElementById('auto-battle-btn').classList.remove('active');
            document.getElementById('auto-battle-icon').textContent = '🛡️';
        }
    }
}

function renderStash() {
    const c = document.getElementById('stash-grid');
    c.innerHTML = '';

    player.stash.forEach((item, idx) => {
        const slot = document.createElement('div');
        slot.className = 'bag-slot';

        if (item) {
            // 根据稀有度添加光效 class
            if (item.rarity >= 3 && item.rarity <= 4) slot.classList.add('rarity-unique');
            else if (item.rarity === 5) slot.classList.add('rarity-set');
            else if (item.rarity === 2) slot.classList.add('rarity-rare');

            // 检查装备需求是否满足
            if (item.requirements && !meetsRequirements(item)) {
                slot.classList.add('requirement-not-met');
            }

            applyItemSpriteToElement(slot, item);
            slot.style.display = 'flex';
            slot.style.justifyContent = 'center';
            slot.style.alignItems = 'center';

            if (item.quantity && item.quantity > 1) {
                slot.innerHTML += `<span class="item-count">${item.quantity}</span>`;
            }
            if (item.enhanceLvl > 0) {
                slot.innerHTML += `<span class="enhance-level">+${item.enhanceLvl}</span>`;
            }

            slot.onclick = (e) => {
                e.stopPropagation();
                moveItemFromStash(idx);
            };
            slot.onmouseenter = (e) => showTooltip(item, e);
            slot.onmouseleave = hideTooltip;
            slot.onmousedown = (e) => e.stopPropagation();
        }

        c.appendChild(slot);
    });
}

function moveItemToStash(inventoryIdx) {
    const item = player.inventory[inventoryIdx];
    if (!item) return;

    // 寻找仓库空位
    const stashIdx = player.stash.findIndex(i => !i);
    if (stashIdx === -1) {
        showNotification('仓库已满！');
        return;
    }

    // 移动物品
    player.stash[stashIdx] = item;
    player.inventory[inventoryIdx] = null;

    // 刷新UI
    renderInventory();
    renderStash();
    showNotification(`已将 ${item.displayName || item.name} 存入仓库`);

    // 检查套装收藏成就
    if (item.setId) {
        checkSetAchievements();
    }
}

function moveItemFromStash(stashIdx) {
    const item = player.stash[stashIdx];
    if (!item) return;

    // 寻找背包空位
    const inventoryIdx = player.inventory.findIndex(i => !i);
    if (inventoryIdx === -1) {
        showNotification('背包已满！');
        return;
    }

    // 移动物品
    player.inventory[inventoryIdx] = item;
    player.stash[stashIdx] = null;

    // 刷新UI
    renderInventory();
    renderStash();
    showNotification(`已从仓库取出 ${item.displayName || item.name}`);

    // 检查套装收藏成就
    if (item.setId) {
        checkSetAchievements();
    }
}

function dropLoot(monster) {
    // 成就追踪：击杀沉沦魔
    trackAchievement('kill_monster', { monsterName: monster.name });

    // 成就追踪：击杀BOSS
    if (monster.isBoss || monster.isQuestTarget) {
        trackAchievement('kill_boss', { isBoss: monster.isBoss, isQuestTarget: monster.isQuestTarget });
    }

    const x = monster.x;
    const y = monster.y;
    const f = player.isInHell ? player.hellFloor : player.floor;
    const isBoss = monster.isBoss || monster.isQuestTarget;
    const isElite = monster.rarity > 0;

    // ========== 金币掉落（层数加成） ==========
    let goldBase = 10 + f * 5;  // 基础金币随层数增加
    let goldAmount = Math.floor(goldBase + Math.random() * goldBase);
    if (isBoss) goldAmount *= 3;
    else if (isElite) goldAmount *= 1.5;

    // 贪婪天赋+天神赐福：金币加成
    const greedBonus = getTalentEffect('goldPct', 0) + (player.goldPct || 0);
    if (greedBonus > 0) {
        goldAmount = Math.floor(goldAmount * (1 + greedBonus / 100));
    }

    groundItems.push({
        type: 'gold', val: Math.floor(goldAmount),
        x: x + Math.random() * 20 - 10, y: y + Math.random() * 20 - 10,
        rarity: 0, name: Math.floor(goldAmount) + " 金币", icon: '💰', dropTime: Date.now()
    });

    // ========== 消耗品保底机制 ==========
    player.killsSincePotion = (player.killsSincePotion || 0) + 1;
    if (player.killsSincePotion >= 8 || isBoss) {
        // 每8只怪或击杀BOSS必掉消耗品
        const rand = Math.random();
        let dropItem;
        if (rand < 0.6) {
            dropItem = { type: 'potion', name: '治疗药剂', heal: 50, rarity: 0, stackable: true, count: 1 };
        } else if (rand < 0.88) {
            dropItem = { type: 'potion', name: '法力药剂', mana: 30, rarity: 0, stackable: true, count: 1 };
        } else {
            dropItem = { type: 'scroll', name: '回城卷轴', rarity: 0, stackable: true, count: 1 };
        }
        groundItems.push({
            ...dropItem,
            x: x + Math.random() * 20 - 10,
            y: y + Math.random() * 20 - 10,
            dropTime: Date.now()
        });
        player.killsSincePotion = 0;
    }

    // ========== 装备掉落系统 ==========
    // 层数加成：每层+2%掉落率，+1%品质提升（降低加成幅度）
    const floorDropBonus = Math.min(f * 0.02, 0.25);      // 最高+25%
    const floorQualityBonus = Math.min(f * 0.01, 0.15);   // 最高+15%

    // 累积幸运加成：每次没掉好东西+1，最高50（降低影响）
    const luckBonus = Math.min((player.luckAccumulator || 0) * 0.005, 0.15);  // 最高+15%

    // 寻宝者天赋+天神赐福：掉落率加成
    const treasureHunterBonus = (getTalentEffect('dropRatePct', 0) + (player.dropRatePct || 0)) / 100;

    // 计算最终掉落参数
    let dropChance, dropCount, qualityBonus;

    if (isBoss) {
        dropChance = 1.0;
        dropCount = 2;  // BOSS固定2件
        qualityBonus = 0.20 + floorQualityBonus;  // BOSS基础+20%品质（降低）
    } else if (isElite) {
        dropChance = 0.45 + floorDropBonus + luckBonus + treasureHunterBonus;  // 45%起步（降低）
        dropCount = 1;
        qualityBonus = 0.10 + floorQualityBonus + luckBonus;  // 降低
    } else {
        dropChance = 0.25 + floorDropBonus + luckBonus + treasureHunterBonus;  // 25%起步（降低）
        dropCount = 1;
        qualityBonus = floorQualityBonus + luckBonus;
    }

    let droppedGoodItem = false;  // 是否掉落了好东西（蓝装以上）

    for (let i = 0; i < dropCount; i++) {
        if (Math.random() < dropChance) {
            let item = null;

            // ========== 套装掉落 ==========
            // 套装是稀有物品，大幅降低概率：BOSS 5%, 精英 0.5%, 普通怪 0.1%
            const setBaseChance = isBoss ? 0.05 : (isElite ? 0.005 : 0.001);
            const setFloorBonus = f >= 10 ? 0.01 : 0;  // 10层以上+1%
            const setLuckBonus = luckBonus * 0.05;     // 幸运值影响降到5%
            const setChance = setBaseChance + setFloorBonus + setLuckBonus;
            if (Math.random() < setChance) {
                item = generateRandomSetItem(f);
                if (item) droppedGoodItem = true;
            }

            // ========== 普通装备掉落 ==========
            if (!item) {
                item = createItem(null, f);

                // 品质重roll（应用所有加成）
                const qualityRoll = Math.random();
                const adjustedRoll = qualityRoll - qualityBonus;  // 加成越高，越容易出好东西

                if (isBoss) {
                    // BOSS保底蓝装，降低暗金概率
                    if (adjustedRoll < 0.03) { item.rarity = 4; droppedGoodItem = true; }       // 3%+加成 暗金
                    else if (adjustedRoll < 0.25) { item.rarity = 3; droppedGoodItem = true; }  // 22%+加成 稀有
                    else { item.rarity = 2; droppedGoodItem = true; }                           // 保底魔法
                } else if (isElite) {
                    // 精英怪
                    if (adjustedRoll < 0.015) { item.rarity = 4; droppedGoodItem = true; }      // 1.5% 暗金
                    else if (adjustedRoll < 0.12) { item.rarity = 3; droppedGoodItem = true; }  // 10.5% 稀有
                    else if (adjustedRoll < 0.45) { item.rarity = 2; droppedGoodItem = true; }  // 33% 魔法
                    else item.rarity = 1;
                } else {
                    // 普通怪
                    if (adjustedRoll < 0.005) { item.rarity = 4; droppedGoodItem = true; }      // 0.5% 暗金
                    else if (adjustedRoll < 0.04) { item.rarity = 3; droppedGoodItem = true; }  // 3.5% 稀有
                    else if (adjustedRoll < 0.20) { item.rarity = 2; droppedGoodItem = true; }  // 16% 魔法
                    else item.rarity = 1;
                }

                // 更新显示名称（如果品质被修改）
                if (item.rarity === 4 && !item.displayName.startsWith('暗金')) {
                    item.displayName = "暗金·" + item.name;
                    item.stats.allSkills = (item.stats.allSkills || 0) + 1;
                    item.stats.dmgPct = (item.stats.dmgPct || 0) + 50;
                    item.stats.lifeSteal = (item.stats.lifeSteal || 0) + 5;
                }
            }

            item.x = x + Math.random() * 30 - 15 + i * 20;
            item.y = y + Math.random() * 30 - 15;
            item.dropTime = Date.now();
            groundItems.push(item);

            // 暗金/套装掉落特效
            if (item.rarity === 4 || item.rarity === 5) {
                createDropBeam(item.x, item.y, item.rarity);
            }
        }
    }

    // ========== 更新累积幸运值 ==========
    if (droppedGoodItem) {
        player.luckAccumulator = 0;  // 掉到好东西，重置幸运值
    } else {
        player.luckAccumulator = Math.min((player.luckAccumulator || 0) + 1, 50);  // 没掉好东西，累积+1
    }

    updateWorldLabels();
}

function updateWorldLabels() {
    const c = document.getElementById('world-labels'); c.innerHTML = '';
    groundItems.forEach(i => {
        // 物品过滤：默认只显示蓝色以上（rarity >= 2），按住Alt显示所有
        // 金币、药水、卷轴始终显示
        const isConsumable = i.type === 'gold' || i.type === 'potion' || i.type === 'scroll';
        if (!isAltPressed && !isConsumable && i.rarity < 2) {
            return; // 跳过低品质物品
        }

        const d = document.createElement('div');
        d.className = 'drop-label';
        d.innerText = i.displayName || i.name;
        d.style.color = getItemColor(i.rarity);

        d.onclick = e => {
            e.stopPropagation();

            // 计算玩家与物品的距离
            const distance = Math.hypot(i.x - player.x, i.y - player.y);

            // 检查是否在拾取范围内（100像素）
            if (distance < 100) {
                // 直接拾取
                if (i.type === 'gold') {
                    // 拾取金币
                    addGold(i.val);
                    createDamageNumber(player.x, player.y - 40, "+" + i.val + "G", 'gold');
                    AudioSys.play('gold');
                } else {
                    // 拾取物品到背包
                    if (!addItemToInventory(i)) {
                        createFloatingText(player.x, player.y - 40, "背包已满！", COLORS.warning, 1.5);
                        return;
                    }
                }

                // 从地面移除物品
                groundItems = groundItems.filter(x => x !== i);
                d.remove();
                player.targetItem = null; // 清除目标
            } else {
                // 距离太远，自动走过去拾取
                player.targetX = i.x;
                player.targetY = i.y;
                player.targetItem = i; // 标记要去拾取的物品
                showNotification("自动移动到物品处...");
            }
        };

        i.el = d;
        c.appendChild(d);
    });
}

function getItemColor(r) {
    // 直接使用 getRarityColor 函数
    return getRarityColor(r);
}
function isWall(x, y) { const c = Math.floor(x / TILE_SIZE), r = Math.floor(y / TILE_SIZE); return c < 0 || r < 0 || c >= MAP_WIDTH || r >= MAP_HEIGHT || mapData[r][c] === 0; }

// 检查两点之间是否有墙阻挡
function hasLineOfSight(x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    let x = x1;
    let y = y1;

    while (true) {
        // 检查当前位置是否是墙
        if (isWall(x, y)) return false;

        // 到达目标点
        if (x === x2 && y === y2) break;

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx * TILE_SIZE / 4; // 使用更小步长进行更精确的检查
        }
        if (e2 < dx) {
            err += dx;
            y += sy * TILE_SIZE / 4;
        }

        // 防止无限循环
        if (Math.abs(x - x1) > dx * 2 || Math.abs(y - y1) > dy * 2) break;
    }

    return true;
}

function getEnemyAtCursor() {
    for (let e of enemies) { if (e.dead) continue; if (Math.hypot(e.x - mouse.worldX, e.y - mouse.worldY) < e.radius + 10) return e; }
    return null;
}
function getNPCAtCursor() {
    for (let n of npcs) if (Math.hypot(n.x - mouse.worldX, n.y - mouse.worldY) < n.radius + 10) return n;
    return null;
}

function performAttack(t) {
    if (player.attackCooldown > 0) return;

    // 检查视线 - 如果玩家和目标之间有墙，则不能攻击
    // 但近距离(<50像素)跳过视线检测，允许攻击贴墙角的怪物
    const dist = Math.hypot(t.x - player.x, t.y - player.y);
    if (player.floor > 0 && dist >= 50 && !hasLineOfSight(player.x, player.y, t.x, t.y)) {
        return;
    }

    let dmg = Math.floor(Math.random() * (player.damage[1] - player.damage[0] + 1)) + player.damage[0];
    let isCrit = Math.random() < player.dex * 0.01;
    if (isCrit) {
        dmg *= 2;
        createDamageNumber(t.x, t.y - 40, "暴击!", '#ffff00');
    }

    // 构建伤害对象（包含物理和元素伤害）
    const damageObj = {
        physical: dmg,
        fire: player.elementalDamage.fire,
        lightning: player.elementalDamage.lightning,
        poison: player.elementalDamage.poison
    };

    takeDamage(t, damageObj);
    AudioSys.play('attack');
    createSlashEffect(player.x, player.y, t.x, t.y, dmg);
    player.attackAnim = 1;

    if (player.lifeSteal > 0) {
        let h = Math.ceil(dmg * player.lifeSteal / 100);
        if (h > 0) {
            player.hp = Math.min(player.maxHp, player.hp + h);
            createDamageNumber(player.x, player.y - 40, "+" + h, COLORS.green);
        }
    }
    createParticle(t.x, t.y, '#fff', 5);
    player.attackCooldown = 0.5 / (1 + player.attackSpeed / 100);
}

function castSkill(skillName) {
    // 只有在罗格营地才禁用技能（地狱中可以使用）
    if (isInTown()) return;

    // 检查是否选择了未学习的技能
    if (!player.skills[skillName] || player.skills[skillName] <= 0) {
        const typeNames = { fireball: '火球术', thunder: '雷电术', multishot: '多重射击' };
        showNotification(`技能未学习：${typeNames[skillName] || skillName}`);
        return;
    }

    if (skillName === 'fireball') {
        if (player.mp < 5) {
            createFloatingText(player.x, player.y - 40, '法力不足！(需要 5 法力)', '#4d94ff', 1.5);
            return;
        }
        if (player.skillCooldowns.fireball > 0) return;
        player.mp -= 5; player.skillCooldowns.fireball = 0.5;
        const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
        projectiles.push({
            x: player.x,
            y: player.y,
            angle,
            speed: 600,
            life: 0.5,
            damage: 10 * player.skills.fireball + player.ene,
            owner: player,
            type: 'fireball',
            color: '#ff4400'
        });
        AudioSys.play('fireball');
    } else if (skillName === 'thunder') {
        const cost = 8 + (player.skills.thunder - 1) * 0.5;
        if (player.mp < cost) {
            createFloatingText(player.x, player.y - 60, "法力不足!", '#55aaff');
            return;
        }

        // 获取鼠标指向的敌人
        const target = getEnemyAtCursor();
        if (!target) {
            // 如果没有指向敌人，可以不做任何事，或者给个提示
            // 这里选择不做任何事，或者可以播放一个失败音效
            return;
        }

        // 检查射程 (缩小为 200 像素)
        if (Math.hypot(target.x - player.x, target.y - player.y) > 200) {
            createFloatingText(player.x, player.y - 60, "目标太远!", '#ff5555');
            return;
        }

        player.mp -= cost;
        player.skillCooldowns.thunder = 2; // 2秒冷却

        // 伤害计算：基础伤害 + 技能等级加成
        // 假设每级增加 15 点基础伤害
        const baseDmg = 30 + (player.skills.thunder - 1) * 15;
        // 智力(ene)加成：每点智力增加 2% 伤害
        const dmg = Math.floor(baseDmg * (1 + player.ene * 0.02));

        // 造成闪电伤害（主目标）
        takeDamage(target, { lightning: dmg }, true);

        // 视觉效果：闪电
        createLightningEffect(target.x, target.y);

        // 音效
        AudioSys.play('thunder');

        // ====== 溅射机制 ======
        // Lv1: 无溅射
        // Lv2: 1个跳跃（40%伤害）
        // Lv3: 1个跳跃（50%伤害）
        // Lv5: 2个跳跃（50% → 25%）
        // Lv7: 2个跳跃（50% → 25%），范围增加
        // Lv10: 3个跳跃（60% → 30% → 15%）

        const skillLevel = player.skills.thunder;
        let chainCount = 0;  // 可跳跃次数
        let chainDamageRatios = [];  // 每次跳跃的伤害比例
        let chainRange = 150;  // 溅射搜索范围

        if (skillLevel >= 10) {
            chainCount = 3;
            chainDamageRatios = [0.60, 0.30, 0.15];
        } else if (skillLevel >= 7) {
            chainCount = 2;
            chainDamageRatios = [0.50, 0.25];
            chainRange = 200;  // Lv7+ 范围增加
        } else if (skillLevel >= 5) {
            chainCount = 2;
            chainDamageRatios = [0.50, 0.25];
        } else if (skillLevel >= 3) {
            chainCount = 1;
            chainDamageRatios = [0.50];
        } else if (skillLevel >= 2) {
            chainCount = 1;
            chainDamageRatios = [0.40];
        }

        // 执行闪电链
        if (chainCount > 0) {
            let currentTarget = target;
            const hitTargets = new Set([target]);  // 记录已击中的目标，防止重复

            for (let i = 0; i < chainCount; i++) {
                // 寻找下一个目标
                const nextTarget = findNearestEnemy(currentTarget.x, currentTarget.y, chainRange, hitTargets);

                if (!nextTarget) break;  // 没有找到下一个目标，停止连锁

                // 计算连锁伤害
                const chainDmg = Math.floor(dmg * chainDamageRatios[i]);

                // 造成伤害
                takeDamage(nextTarget, { lightning: chainDmg }, true);

                // 创建闪电链视觉效果（从当前目标到下一个目标）
                createLightningChain(currentTarget.x, currentTarget.y, nextTarget.x, nextTarget.y);

                // 记录已击中
                hitTargets.add(nextTarget);

                // 更新当前目标
                currentTarget = nextTarget;
            }
        }

    } else if (skillName === 'multishot') {
        if (player.mp < 8) {
            createFloatingText(player.x, player.y - 40, '法力不足！(需要 8 法力)', '#4d94ff', 1.5);
            return;
        }
        if (player.skillCooldowns.multishot > 0) return;
        player.mp -= 8; player.skillCooldowns.multishot = 1;
        const base = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
        const cnt = 2 + player.skills.multishot;
        for (let i = 0; i < cnt; i++) {
            const a = base - 0.3 + (0.6 / (cnt - 1)) * i;
            projectiles.push({ x: player.x, y: player.y, angle: a, speed: 500, life: 1, damage: player.damage[0] * 0.8, color: '#ffff00', owner: player });
        }
        AudioSys.play('attack');
    }
}

function spawnBoss(x, y) { enemies.push(EnemyPool.acquire({ x, y, hp: 500, maxHp: 500, dmg: 20, speed: 100, isBoss: true, radius: 30, dead: false, cooldown: 0, xpValue: 5000, name: "屠夫" })); }

// 检查物品需求是否满足
function meetsRequirements(item) {
    if (!item || !item.requirements) return true;
    const req = item.requirements;
    if (req.level && player.lvl < req.level) return false;
    if (req.str && player.str < req.str) return false;
    if (req.dex && player.dex < req.dex) return false;
    return true;
}

function renderInventory() {
    const c = document.getElementById('bag-grid'); c.innerHTML = '';
    player.inventory.forEach((i, idx) => {
        const s = document.createElement('div'); s.className = 'bag-slot';
        if (i) {
            // 根据稀有度添加光效 class
            if (i.rarity >= 3 && i.rarity <= 4) s.classList.add('rarity-unique');
            else if (i.rarity === 5) s.classList.add('rarity-set');
            else if (i.rarity === 2) s.classList.add('rarity-rare');

            // 检查装备需求是否满足（仅对可装备物品）
            if (i.requirements && !meetsRequirements(i)) {
                s.classList.add('requirement-not-met');
            }

            applyItemSpriteToElement(s, i);
            s.style.display = 'flex'; s.style.justifyContent = 'center'; s.style.alignItems = 'center';
            if (i.quantity && i.quantity > 1) {
                s.innerHTML += `<span class="item-count">${i.quantity}</span>`;
            }
            if (i.enhanceLvl > 0) {
                s.innerHTML += `<span class="enhance-level">+${i.enhanceLvl}</span>`;
            }
            s.onclick = (e) => {
                e.stopPropagation();
                // 如果仓库面板打开，点击物品存入仓库
                const stashPanel = document.getElementById('stash-panel');
                const blacksmithPanel = document.getElementById('blacksmith-panel');
                if (stashPanel && stashPanel.style.display === 'block') {
                    moveItemToStash(idx);
                } else if (blacksmithPanel && blacksmithPanel.style.display === 'block') {
                    moveItemToForge(idx);
                } else {
                    useOrEquipItem(idx);
                }
            }
            s.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); dropItemFromInventory(idx); }
            s.onmouseenter = (e) => showTooltip(i, e); s.onmouseleave = hideTooltip;
            s.onmousedown = (e) => e.stopPropagation();
        }
        c.appendChild(s);
    });
    ['mainhand', 'body', 'ring'].forEach(sn => {
        const el = document.getElementById('slot-' + sn), i = player.equipment[sn];
        el.innerHTML = `<span style="color:#333;font-size:10px;position:absolute;bottom:2px;">${sn}</span>`;
        // 清除之前的稀有度 class
        el.classList.remove('rarity-unique', 'rarity-set', 'rarity-rare');
        if (i) {
            // 根据稀有度添加光效 class
            if (i.rarity >= 3 && i.rarity <= 4) el.classList.add('rarity-unique');
            else if (i.rarity === 5) el.classList.add('rarity-set');
            else if (i.rarity === 2) el.classList.add('rarity-rare');

            const ic = document.createElement('div');
            ic.style.width = '100%'; ic.style.height = '100%';
            applyItemSpriteToElement(ic, i);
            ic.style.border = 'none'; // Remove border for inner div as slot has border
            el.style.borderColor = getItemColor(i.rarity); // Set slot border instead
            el.appendChild(ic);
            if (i.enhanceLvl > 0) {
                el.innerHTML += `<span class="enhance-level">+${i.enhanceLvl}</span>`;
            }
            el.onmouseenter = (e) => showTooltip(i, e); el.onmouseleave = hideTooltip;
            el.onmousedown = (e) => e.stopPropagation();
        } else { el.onmouseenter = null; el.onmouseleave = null; }
    });
    // Additional slots
    ['helm', 'gloves', 'boots', 'belt', 'amulet'].forEach(sn => {
        const el = document.getElementById('slot-' + sn);
        if (!el) return;
        const i = player.equipment[sn];
        el.innerHTML = `<span style="color:#333;font-size:8px;position:absolute;bottom:2px;">${sn.substring(0, 3)}</span>`;
        // 清除之前的稀有度 class
        el.classList.remove('rarity-unique', 'rarity-set', 'rarity-rare');
        if (i) {
            // 根据稀有度添加光效 class
            if (i.rarity >= 3 && i.rarity <= 4) el.classList.add('rarity-unique');
            else if (i.rarity === 5) el.classList.add('rarity-set');
            else if (i.rarity === 2) el.classList.add('rarity-rare');

            const ic = document.createElement('div');
            ic.style.width = '100%'; ic.style.height = '100%';
            applyItemSpriteToElement(ic, i);
            ic.style.border = 'none';
            el.style.borderColor = getItemColor(i.rarity);
            el.appendChild(ic);
            if (i.enhanceLvl > 0) {
                el.innerHTML += `<span class="enhance-level">+${i.enhanceLvl}</span>`;
            }
            el.onmouseenter = (e) => showTooltip(i, e); el.onmouseleave = hideTooltip;
            el.onmousedown = (e) => e.stopPropagation();
        } else { el.onmouseenter = null; el.onmouseleave = null; }
    });

    document.getElementById('gold-display').innerText = player.gold;
}

function useOrEquipItem(idx) {
    const item = player.inventory[idx]; if (!item) return;

    const shop = document.getElementById('shop-panel');
    if (shop.style.display === 'block') {
        let val = 50;
        if (item.rarity > 1) val *= item.rarity * 2;
        addGold(val);

        if (item.stackable && item.quantity > 1) {
            item.quantity--;
        } else {
            player.inventory[idx] = null;
        }

        createDamageNumber(player.x, player.y - 40, `+${val} G`, 'gold');
        AudioSys.play('gold');
        renderInventory();
        updateBeltUI();

        // 在物品槽位上显示卖出提示
        showSellTooltip(idx, val);
        return;
    }

    if (item.type === 'potion') {
        if (item.heal) {
            player.hp = Math.min(player.maxHp, player.hp + item.heal);
            player.stats.currentStreak = 0; // 喝红药重置连杀
        }
        if (item.mana) player.mp = Math.min(player.maxMp, player.mp + item.mana);
        AudioSys.play('potion'); // 播放喝药音效

        if (item.quantity > 1) {
            item.quantity--;
        } else {
            player.inventory[idx] = null;
        }
    }
    else if (item.type === 'scroll') {
        // 地狱中无法使用回城卷轴
        if (player.isInHell) {
            showNotification("地狱中无法使用回城卷轴");
            return;
        }
        if (player.floor !== 0) {
            // 记录上次离开的层数
            player.lastFloor = player.floor;
            // 验证并修正传送门位置，确保在罗格营地的安全区域
            const safePortalPos = validateAndFixPortalPosition(player.x, player.y);
            townPortal = { returnFloor: player.floor, x: safePortalPos.x, y: safePortalPos.y, activeFloor: 0 };
            // 清除自动战斗锁定目标，避免箭头残留在城镇
            AutoBattle.currentTarget = null;
            enterFloor(0);
            if (item.quantity > 1) item.quantity--; else player.inventory[idx] = null;
        } else {
            showNotification("你已经在营地了");
        }
    }
    else {
        let s = null;
        if (item.type === 'weapon') s = 'mainhand'; if (item.type === 'armor') s = 'body'; if (item.type === 'ring') s = 'ring';
        if (item.type === 'helm') s = 'helm'; if (item.type === 'gloves') s = 'gloves'; if (item.type === 'boots') s = 'boots';
        if (item.type === 'belt') s = 'belt'; if (item.type === 'amulet') s = 'amulet';

        if (s) {
            // 检查装备需求
            if (item.requirements) {
                const req = item.requirements;
                const failedReqs = [];

                if (req.level && player.lvl < req.level) {
                    failedReqs.push(`等级${req.level}`);
                }
                if (req.str && player.str < req.str) {
                    failedReqs.push(`力量${req.str}`);
                }
                if (req.dex && player.dex < req.dex) {
                    failedReqs.push(`敏捷${req.dex}`);
                }

                // 如果不满足需求，拒绝装备
                if (failedReqs.length > 0) {
                    createFloatingText(player.x, player.y - 40, `需求不足: ${failedReqs.join(', ')}`, '#ff4444', 2);
                    return;
                }
            }

            // 满足需求，执行装备
            const cur = player.equipment[s];
            player.equipment[s] = item;
            player.inventory[idx] = cur;
            updateStats();
        }
    }
    renderInventory(); updateStatsUI(); updateBeltUI();
}

function useQuickItem(type) {
    let targetName = "";
    if (type === 'health') targetName = CONSUMABLE_NAME.HEALTH_POTION;
    if (type === 'mana') targetName = CONSUMABLE_NAME.MANA_POTION;
    if (type === 'scroll') targetName = CONSUMABLE_NAME.TOWN_PORTAL;

    const idx = player.inventory.findIndex(i => i && i.name === targetName);
    if (idx !== -1) {
        useOrEquipItem(idx);
    } else {
        showNotification("没有该物品!");
    }
}

function updateBeltUI() {
    const countItem = (name) => {
        const item = player.inventory.find(i => i && i.name === name);
        return item ? (item.quantity || 1) : 0;
    };
    const updateSlot = (slotId, name, type, heal) => {
        const el = document.getElementById(slotId);
        const count = countItem(name);
        const key = slotId.split('-')[1];

        el.innerHTML = `<span class="belt-key">${key}</span><span class="belt-count" id="count-${type}" style="${type === 'mana' ? 'color:#4d94ff' : ''}">${count}</span>`;

        // 创建图标容器
        const iconDiv = document.createElement('div');
        iconDiv.style.width = '100%';
        iconDiv.style.height = '100%';
        iconDiv.style.position = 'absolute';
        iconDiv.style.top = '0';
        iconDiv.style.left = '0';
        iconDiv.style.zIndex = '0'; // 在文字下方

        // 模拟物品对象用于渲染
        const dummyItem = { type: 'potion', name: name };
        if (type === 'health') dummyItem.heal = true;
        if (type === 'mana') dummyItem.heal = false; // logic in getItemSpriteCoords cares if .heal is truthy
        if (type === 'scroll') dummyItem.type = 'scroll';

        applyItemSpriteToElement(iconDiv, dummyItem);

        // 如果数量为0，变灰
        if (count === 0) {
            iconDiv.style.filter = 'grayscale(100%) opacity(0.3)';
        }

        el.appendChild(iconDiv);
    };

    updateSlot('belt-1', '治疗药剂', 'health', true);
    updateSlot('belt-2', '法力药剂', 'mana', false);
    updateSlot('belt-3', '回城卷轴', 'scroll', false);
}

function gambleItem(type) {
    let cost = 500;
    if (type === 'ring') cost = 800; if (type === 'armor') cost = 400;
    if (player.gold >= cost) {
        player.gold -= cost;
        let rarity = 2;
        if (Math.random() < GAME_CONFIG.GAMBLE_RARE_RATE) rarity = 3; if (Math.random() < GAME_CONFIG.GAMBLE_UNIQUE_RATE) rarity = 4;

        // 从BASE_ITEMS中按类型筛选并随机选择
        const typeMap = { weapon: 'weapon', armor: 'armor', helm: 'helm', gloves: 'gloves', boots: 'boots', belt: 'belt', ring: 'ring', amulet: 'amulet' };
        const candidates = BASE_ITEMS.filter(i => i.type === typeMap[type]);
        const baseName = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)].name : '短剑';

        let item = createItem(baseName, player.lvl);
        item.rarity = rarity;
        if (rarity >= 2) {
            const p = AFFIXES.prefixes[Math.floor(Math.random() * AFFIXES.prefixes.length)];
            item.displayName = p.name + " " + item.name; item.stats[p.stat] = Math.floor(Math.random() * (p.max - p.min)) + p.min;
        }
        if (rarity >= 3) {
            const s = AFFIXES.suffixes[Math.floor(Math.random() * AFFIXES.suffixes.length)];
            item.displayName += s.name; item.stats[s.stat] = (item.stats[s.stat] || 0) + Math.floor(Math.random() * (s.max - s.min)) + s.min;
        }
        if (rarity === 4) { item.displayName = "暗金·" + item.name; item.stats = { allSkills: 1, dmgPct: 50, lifeSteal: 5 }; }

        if (!addItemToInventory(item)) {
            player.gold += cost; // 返还金币
            createFloatingText(player.x, player.y - 40, "背包已满！", COLORS.warning, 1.5);
        } else {
            createDamageNumber(player.x, player.y - 40, `-${cost}G`, 'gold');
            showNotification(`花费 ${cost} G`);
            AudioSys.play('gold');
        }
    } else {
        showNotification("金币不足");
    }
}

// 长按购买系统
let buyHoldInterval = null;
let buyHoldTimeout = null;

function buyItem(type) {
    let cost = 0;
    let itemName = "";
    if (type === 'health') { cost = 50; itemName = CONSUMABLE_NAME.HEALTH_POTION; }
    else if (type === 'mana') { cost = 50; itemName = CONSUMABLE_NAME.MANA_POTION; }
    else if (type === 'scroll') { cost = 100; itemName = CONSUMABLE_NAME.TOWN_PORTAL; }

    if (player.gold >= cost) {
        const item = createItem(itemName, 0);
        if (addItemToInventory(item)) {
            player.gold -= cost;
            createDamageNumber(player.x, player.y - 40, `-${cost}G`, 'gold');
            showNotification(`花费 ${cost} G - 购买 ${itemName}`);
            renderInventory();
            return true;  // 购买成功
        } else {
            createFloatingText(player.x, player.y - 40, "背包已满！", COLORS.warning, 1.5);
            return false;  // 背包满
        }
    } else {
        showNotification("金币不足");
        return false;  // 金币不足
    }
}

// 开始长按购买
function startBuyHold(type, event) {
    if (event) event.preventDefault();  // 阻止默认行为
    buyItem(type);  // 先买一个
    // 延迟300ms后开始连续购买（避免误触）
    buyHoldTimeout = setTimeout(() => {
        buyHoldInterval = setInterval(() => {
            if (!buyItem(type)) {
                stopBuyHold();  // 买不了就停止
            }
        }, 80);  // 每80ms买一个
    }, 300);
}

// 停止长按购买
function stopBuyHold() {
    if (buyHoldTimeout) {
        clearTimeout(buyHoldTimeout);
        buyHoldTimeout = null;
    }
    if (buyHoldInterval) {
        clearInterval(buyHoldInterval);
        buyHoldInterval = null;
    }
}

// 初始化购买按钮的长按事件
function initBuyButtons() {
    document.querySelectorAll('.buy-slot').forEach(slot => {
        const type = slot.dataset.type;
        slot.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startBuyHold(type, e);
        });
        slot.addEventListener('mouseup', stopBuyHold);
        slot.addEventListener('mouseleave', stopBuyHold);
    });
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', initBuyButtons);

function unequipItem(s) {
    const i = player.equipment[s]; if (!i) return;
    if (addItemToInventory(i)) { player.equipment[s] = null; updateStats(); renderInventory(); updateStatsUI(); hideTooltip(); }
}

function dropItemFromInventory(idx) {
    const item = player.inventory[idx];
    if (!item) return;

    // 检查是否在罗格营地（地狱中可以丢弃）
    if (isInTown()) {
        showNotification("在罗格营地不能丢弃物品");
        return;
    }

    // 创建物品副本并设置位置
    const droppedItem = { ...item };
    droppedItem.x = player.x + Math.random() * 40 - 20;
    droppedItem.y = player.y + Math.random() * 40 - 20;
    droppedItem.dropTime = Date.now();

    // 从背包移除物品（处理堆叠）
    if (item.stackable && item.quantity > 1) {
        item.quantity--;
    } else {
        player.inventory[idx] = null;
    }

    // 添加到地面
    groundItems.push(droppedItem);
    updateWorldLabels();
    renderInventory();
    updateBeltUI();
    showNotification(`丢弃了 ${item.displayName || item.name}`);
}

// 计算当前穿戴的套装件数
function calculateEquippedSets() {
    const sets = {};

    // 遍历所有装备槽位
    Object.values(player.equipment).forEach(item => {
        if (item && item.setId) {
            sets[item.setId] = (sets[item.setId] || 0) + 1;
        }
    });

    player.equippedSets = sets;
    return sets;
}

function updateStats() {
    // 基础属性只来自玩家手动分配的点数
    const str = player.str, dex = player.dex, vit = player.vit, ene = player.ene;
    let baseDmg = 2, armor = 0, ls = 0, ias = 0;

    // 重置抗性和元素伤害
    player.resistances = { fire: 0, cold: 0, lightning: 0, poison: 0 };
    player.elementalDamage = { fire: 0, cold: 0, lightning: 0, poison: 0 };

    // 初始化新属性
    let hpRegen = 0, mpRegen = 0, blockChance = 0, reflectDamage = 0;
    let damageReduction = 0, critDamage = 0, allRes = 0, bonusCritChance = 0;
    let dmgPct = 0;  // 百分比伤害加成
    let bonusHp = 0, bonusMp = 0;  // 装备直接加的HP/MP

    Object.values(player.equipment).forEach(i => {
        if (!i) return;
        if (i.stats) {
            // 直接效果属性（不再读取str/dex/vit/ene）
            ls += (i.stats.lifeSteal || 0);
            ias += (i.stats.attackSpeed || 0);
            bonusHp += (i.stats.maxHp || 0);  // 直接加HP
            bonusMp += (i.stats.maxMp || 0);  // 直接加MP

            // 抗性
            player.resistances.fire += (i.stats.fireRes || 0);
            player.resistances.cold += (i.stats.coldRes || 0);
            player.resistances.lightning += (i.stats.lightningRes || 0);
            player.resistances.poison += (i.stats.poisonRes || 0);
            allRes += (i.stats.allRes || 0);

            // 元素伤害
            player.elementalDamage.fire += (i.stats.fireDmg || 0);
            player.elementalDamage.lightning += (i.stats.lightningDmg || 0);
            player.elementalDamage.poison += (i.stats.poisonDmg || 0);

            // 其他特殊效果
            hpRegen += (i.stats.hpRegen || 0);
            mpRegen += (i.stats.mpRegen || 0);
            blockChance += (i.stats.blockChance || 0);
            reflectDamage += (i.stats.reflectDamage || 0);
            damageReduction += (i.stats.damageReduction || 0);
            critDamage += (i.stats.critDamage || 0);
            dmgPct += (i.stats.dmgPct || 0);  // 百分比伤害
            bonusCritChance += (i.stats.critChance || 0);  // 暴击率加成
        }
        if (i.minDmg) baseDmg = i.minDmg;
        if (i.def) armor += i.def;
        // 词缀和套装加的防御
        if (i.stats) armor += (i.stats.def || 0);
    });

    // 应用全能抗性
    if (allRes > 0) {
        player.resistances.fire += allRes;
        player.resistances.cold += allRes;
        player.resistances.lightning += allRes;
        player.resistances.poison += allRes;
    }

    // 抗性上限75%，下限-100%
    player.resistances.fire = Math.max(-100, Math.min(75, player.resistances.fire));
    player.resistances.cold = Math.max(-100, Math.min(75, player.resistances.cold));
    player.resistances.lightning = Math.max(-100, Math.min(75, player.resistances.lightning));
    player.resistances.poison = Math.max(-100, Math.min(75, player.resistances.poison));

    // ========== 套装加成系统 ==========
    // 计算当前穿戴的套装件数
    const equippedSets = calculateEquippedSets();

    // 应用所有已激活的套装加成
    for (let setId in equippedSets) {
        const pieceCount = equippedSets[setId];
        const setData = SET_ITEMS[setId];

        if (!setData) continue;

        // 应用所有已激活的套装加成
        for (let requiredPieces in setData.bonuses) {
            if (pieceCount >= parseInt(requiredPieces)) {
                const bonusStats = setData.bonuses[requiredPieces].stats;

                // 应用套装加成的直接效果（不再使用str/dex/vit/ene）
                ls += (bonusStats.lifeSteal || 0);
                ias += (bonusStats.attackSpeed || 0);
                armor += (bonusStats.def || 0);
                bonusHp += (bonusStats.maxHp || 0);
                bonusMp += (bonusStats.maxMp || 0);

                // 抗性加成
                if (bonusStats.allRes) {
                    player.resistances.fire += bonusStats.allRes;
                    player.resistances.cold += bonusStats.allRes;
                    player.resistances.lightning += bonusStats.allRes;
                    player.resistances.poison += bonusStats.allRes;
                }

                // 元素伤害加成
                player.elementalDamage.fire += (bonusStats.fireDmg || 0);
                player.elementalDamage.lightning += (bonusStats.lightningDmg || 0);
                player.elementalDamage.poison += (bonusStats.poisonDmg || 0);

                // 特殊效果加成
                hpRegen += (bonusStats.hpRegen || 0);
                mpRegen += (bonusStats.mpRegen || 0);
                blockChance += (bonusStats.blockChance || 0);
                reflectDamage += (bonusStats.reflectDamage || 0);
                damageReduction += (bonusStats.damageReduction || 0);
                critDamage += (bonusStats.critDamage || 0);
                bonusCritChance += (bonusStats.critChance || 0);
                dmgPct += (bonusStats.dmgPct || 0);  // 百分比伤害加成
            }
        }
    }

    // 重新应用属性上限（因为套装加成可能改变了抗性）
    player.resistances.fire = Math.max(-100, Math.min(75, player.resistances.fire));
    player.resistances.cold = Math.max(-100, Math.min(75, player.resistances.cold));
    player.resistances.lightning = Math.max(-100, Math.min(75, player.resistances.lightning));
    player.resistances.poison = Math.max(-100, Math.min(75, player.resistances.poison));

    // 重新计算最终属性（包含套装加成）
    const finalDmgMultiplier = 1 + dmgPct / 100;  // 包含装备和套装的百分比加成
    player.damage = [
        Math.floor((baseDmg + Math.floor(str / 5)) * (1 + str * 0.05) * finalDmgMultiplier),
        Math.floor((baseDmg + 3 + Math.floor(str / 5)) * (1 + str * 0.05) * finalDmgMultiplier)
    ];
    player.maxHp = vit * 5 + bonusHp;  // 基础 + 装备/套装加成
    player.maxMp = ene * 3 + bonusMp;  // 基础 + 装备/套装加成
    player.armor = armor + dex;
    player.lifeSteal = ls;
    player.attackSpeed = ias;
    player.critChance = Math.min(100, 5 + dex * 0.5 + bonusCritChance);

    // 更新特殊属性
    player.hpRegen = hpRegen;
    player.mpRegen = mpRegen;
    player.blockChance = blockChance;
    player.reflectDamage = reflectDamage;
    player.damageReduction = damageReduction;
    player.critDamage = critDamage;

    // ========== 天赋效果加成 ==========
    // 吸血鬼天赋：+8%生命偷取
    player.lifeSteal += getTalentEffect('lifeSteal', 0);
    // 暴击大师天赋：+15%暴击率, +30%暴击伤害
    player.critChance = Math.min(100, player.critChance + getTalentEffect('critChance', 0));
    player.critDamage += getTalentEffect('critDamage', 0);
    // 铁壁天赋：+80防御
    player.armor += getTalentEffect('def', 0);
    // 元素护盾天赋：+25%所有抗性
    const talentAllRes = getTalentEffect('allRes', 0);
    if (talentAllRes > 0) {
        player.resistances.fire += talentAllRes;
        player.resistances.cold += talentAllRes;
        player.resistances.lightning += talentAllRes;
        player.resistances.poison += talentAllRes;
    }
    // 法力涌动天赋：+50最大法力
    player.maxMp += getTalentEffect('maxMp', 0);
    // 玻璃大炮天赋：最大生命-30%
    const maxHpPct = getTalentEffect('maxHpPct', 0);
    if (maxHpPct !== 0) {
        player.maxHp = Math.floor(player.maxHp * (1 + maxHpPct / 100));
    }

    // ========== 天神赐福效果加成（永久，复用天赋key） ==========
    player.damage[0] = Math.floor(player.damage[0] * (1 + getDivineBlessingEffect('dmgPct', 0) / 100));
    player.damage[1] = Math.floor(player.damage[1] * (1 + getDivineBlessingEffect('dmgPct', 0) / 100));
    player.lifeSteal += getDivineBlessingEffect('lifeSteal', 0);
    player.critChance = Math.min(100, player.critChance + getDivineBlessingEffect('critChance', 0));
    player.critDamage += getDivineBlessingEffect('critDamage', 0);
    player.armor += getDivineBlessingEffect('def', 0);
    player.maxMp += getDivineBlessingEffect('maxMp', 0);
    // 元素伤害
    player.elementalDamage.fire += getDivineBlessingEffect('fireDmgPct', 0);
    player.elementalDamage.poison += getDivineBlessingEffect('poisonDmgPct', 0);
    // 全抗
    const dbAllRes = getDivineBlessingEffect('allRes', 0);
    if (dbAllRes > 0) {
        player.resistances.fire += dbAllRes;
        player.resistances.cold += dbAllRes;
        player.resistances.lightning += dbAllRes;
        player.resistances.poison += dbAllRes;
    }
    // 生命恢复（百分比）- 与天赋一致
    player.hpRegenPct = (player.hpRegenPct || 0) + getDivineBlessingEffect('hpRegenPct', 0);
    // 法力恢复（百分比）- 与天赋一致
    player.mpRegenPct = (player.mpRegenPct || 0) + getDivineBlessingEffect('mpRegenPct', 0);
    // 荆棘反伤
    player.thornsPct = (player.thornsPct || 0) + getDivineBlessingEffect('thornsPct', 0);
    // 金币掉落
    player.goldPct = (player.goldPct || 0) + getDivineBlessingEffect('goldPct', 0);
    // 装备掉落率
    player.dropRatePct = (player.dropRatePct || 0) + getDivineBlessingEffect('dropRatePct', 0);
    // 击杀回血
    player.onKillHealPct = (player.onKillHealPct || 0) + getDivineBlessingEffect('onKillHealPct', 0);

    // 检查套装成就
    checkSetAchievements();
}

function updateUI() {
    document.getElementById('hp-fill').style.height = Math.max(0, Math.min(100, player.hp / player.maxHp * 100)) + '%';
    document.getElementById('hp-text').innerText = Math.floor(player.hp);
    document.getElementById('mp-fill').style.height = Math.max(0, Math.min(100, player.mp / player.maxMp * 100)) + '%';
    document.getElementById('mp-text').innerText = Math.floor(player.mp);

    // 濒危视觉警告：HP < 20% 时显示红光
    const vignette = document.getElementById('low-hp-vignette');
    if (vignette) {
        const hpPercent = player.hp / player.maxHp;
        if (hpPercent < GAME_CONFIG.LOW_HP_THRESHOLD && player.hp > 0) {
            vignette.classList.add('active');
        } else {
            vignette.classList.remove('active');
        }
    }

    let xpPct = 0;
    if (player.xpNext > 0) {
        xpPct = (player.xp / player.xpNext * 100);
    }
    document.getElementById('xp-fill').style.width = Math.min(100, xpPct) + '%';
    document.getElementById('xp-percentage').innerText = xpPct.toFixed(2) + '%';
    document.getElementById('hud-lvl').innerText = player.lvl;

    updateLabelsPosition();
    updateHellIndicator();  // 更新地狱模式指示器

    document.querySelectorAll('.skill-btn').forEach(b => b.classList.remove('active'));
    if (player.activeSkill === 'attack') document.getElementById('skill-attack').classList.add('active');
    else {
        const btns = document.querySelectorAll('.skill-btn');
        if (player.activeSkill === 'fireball') btns[1].classList.add('active');
        if (player.activeSkill === 'thunder') btns[2].classList.add('active');
        if (player.activeSkill === 'multishot') btns[3].classList.add('active');
    }

    const promptEl = document.getElementById('interaction-msg');
    if (interactionTarget) {
        promptEl.style.display = 'block';
        promptEl.innerHTML = `按 [Enter] ${interactionTarget.label}`;
    } else {
        promptEl.style.display = 'none';
    }

    // 更新技能冷却扇形遮罩
    updateSkillCooldownUI();
}

// 技能最大冷却时间
const SKILL_MAX_CD = {
    fireball: 0.5,
    thunder: 2,
    multishot: 1
};

// 更新技能冷却UI（扇形遮罩）
function updateSkillCooldownUI() {
    const skills = ['fireball', 'thunder', 'multishot'];

    skills.forEach(skill => {
        const cd = player.skillCooldowns[skill];
        const maxCd = SKILL_MAX_CD[skill];
        const sweepEl = document.getElementById(`cd-sweep-${skill}`);
        const timeEl = document.getElementById(`cd-time-${skill}`);

        if (!sweepEl || !timeEl) return;

        if (cd > 0) {
            // 计算剩余百分比（从100%到0%）
            const progress = (cd / maxCd) * 100;
            sweepEl.style.setProperty('--cd-progress', `${progress}%`);
            sweepEl.classList.add('active');
            timeEl.classList.add('active');
            timeEl.textContent = cd.toFixed(1);
        } else {
            sweepEl.classList.remove('active');
            timeEl.classList.remove('active');
            timeEl.textContent = '';
        }
    });
}

// 技能按钮点击效果
function triggerSkillClick(btn) {
    btn.classList.add('clicked');
    setTimeout(() => btn.classList.remove('clicked'), 300);
}

function updateStatsUI() {
    document.getElementById('stat-lvl').innerText = player.lvl; document.getElementById('stat-xp').innerText = `${Math.floor(player.xp)}/${Math.floor(player.xpNext)}`;
    document.getElementById('stat-points').innerText = player.points;
    document.getElementById('stat-str').innerText = player.str; document.getElementById('stat-dex').innerText = player.dex;
    document.getElementById('stat-vit').innerText = player.vit; document.getElementById('stat-ene').innerText = player.ene;

    document.getElementById('stat-hp-val').innerText = Math.floor(player.maxHp);
    document.getElementById('stat-mp-val').innerText = Math.floor(player.maxMp);

    document.getElementById('stat-dmg').innerText = `${player.damage[0]}-${player.damage[1]}`;
    document.getElementById('stat-def').innerText = player.armor;
    document.getElementById('stat-crit').innerText = player.critChance.toFixed(1) + '%';
    document.getElementById('stat-ias').innerText = player.attackSpeed + '%'; document.getElementById('stat-ll').innerText = player.lifeSteal + '%';

    // 更新抗性显示
    const getResColor = (value) => value >= 0 ? (value >= 75 ? '#00ff00' : '#ffff00') : '#ff0000';
    document.getElementById('stat-fire-res').innerText = Math.floor(player.resistances.fire) + '%';
    document.getElementById('stat-fire-res').style.color = getResColor(player.resistances.fire);
    document.getElementById('stat-cold-res').innerText = Math.floor(player.resistances.cold) + '%';
    document.getElementById('stat-cold-res').style.color = getResColor(player.resistances.cold);
    document.getElementById('stat-lightning-res').innerText = Math.floor(player.resistances.lightning) + '%';
    document.getElementById('stat-lightning-res').style.color = getResColor(player.resistances.lightning);
    document.getElementById('stat-poison-res').innerText = Math.floor(player.resistances.poison) + '%';
    document.getElementById('stat-poison-res').style.color = getResColor(player.resistances.poison);
}

function updateSkillsUI() {
    document.getElementById('skill-points').innerText = player.skillPoints;
    document.getElementById('lvl-fireball').innerText = player.skills.fireball;
    document.getElementById('lvl-thunder').innerText = player.skills.thunder; // Changed from frostnova
    document.getElementById('lvl-multishot').innerText = player.skills.multishot;
    document.getElementById('bar-lvl-fireball').innerText = player.skills.fireball;
    document.getElementById('bar-lvl-thunder').innerText = player.skills.thunder; // Changed from frostnova
    document.getElementById('bar-lvl-multishot').innerText = player.skills.multishot;

    // 更新雷电术法力消耗显示
    const thunderCost = getSkillManaCost('thunder', player.skills.thunder);
    const thunderCostEl = document.getElementById('thunder-mana-cost');
    if (thunderCostEl) thunderCostEl.innerText = `法力: ${Math.ceil(thunderCost)}`;
}

function checkLevelUp() {
    while (player.xp >= player.xpNext) {
        player.lvl++;

        // 更新个人最佳等级
        if (player.lvl > player.personalBest.maxLevel) {
            player.personalBest.maxLevel = player.lvl;
        }

        // 成就追踪：达到等级
        trackAchievement('reach_level', { level: player.lvl });

        player.xp -= player.xpNext;
        player.xpNext = Math.floor(player.xpNext * 1.5);
        player.points += 5;
        player.skillPoints += 1;
        player.maxHp += 10;
        player.maxMp += 5;
        player.hp = player.maxHp;
        player.mp = player.maxMp;

        createDamageNumber(player.x, player.y - 70, "升级了!", '#daa520');
        AudioSys.play('levelup');

        // ========== 天神赐福触发检测 ==========
        if (player.lvl % 5 === 0 && player.lvl > player.lastBlessingLevel && player.lvl <= 100) {
            player.lastBlessingLevel = player.lvl;
            if (player.divineBlessing.pending < 3) {
                player.divineBlessing.pending++;
                createDamageNumber(player.x, player.y - 100, "获得天神赐福!", '#ffd700');
                updateDivineBlessingHUD();
            } else {
                createDamageNumber(player.x, player.y - 100, "赐福已满，请先领取", '#ff8800');
            }
        }

        // 提交排行榜
        if (typeof OnlineSystem !== 'undefined') {
            OnlineSystem.submitScore({
                level: player.lvl,
                kills: player.kills,
                maxFloor: player.isInHell ? player.hellFloor + 10 : player.floor,
                isHell: player.isInHell
            });
        }
    }
    updateStatsUI(); updateSkillsUI(); updateMenuIndicators();
    SaveSystem.save();
}

function togglePanel(id) {
    const panelElement = document.getElementById(id + '-panel');
    const isOpening = panelElement.style.display !== 'block';

    if (isOpening) {
        // 打开面板
        panelElement.style.display = 'block';

        // 使用面板管理器动态调整位置和层级
        if (panelManager && panelManager.panels[id]) {
            panelManager.open(id);
        }

        // 根据面板类型调用相应的UI更新函数
        const updateFunctions = {
            'inventory': renderInventory,
            'skills': updateSkillsUI,
            'stats': updateStatsUI,
            'quest': updateQuestUI,
            'achievements': renderAchievements,
            'shop': () => { },
            'stash': () => { },
            'blacksmith': renderBlacksmithPanel
        };

        if (updateFunctions[id]) {
            updateFunctions[id]();
        }
    } else {
        // 关闭面板
        panelElement.style.display = 'none';

        // 隐藏tooltip，避免残留
        hideTooltip();

        // 更新面板管理器状态
        if (panelManager && panelManager.panels[id]) {
            panelManager.close(id);
        }
    }
}
function selectSkill(k) { player.activeSkill = k; updateUI(); }
function addStat(t) { if (player.points > 0) { player[t]++; player.points--; updateStats(); updateStatsUI(); updateMenuIndicators(); } }
function upgradeSkill(t) { if (player.skillPoints > 0) { player.skills[t]++; player.skillPoints--; updateSkillsUI(); updateMenuIndicators(); } }

function isHoveringUI() {
    if (mouse.y > window.innerHeight - 140) return true;
    const panels = ['stats-panel', 'inventory-panel', 'skills-panel', 'shop-panel', 'menu-btns', 'quest-panel', 'achievements-panel', 'dialog-box'];
    for (let id of panels) {
        const el = document.getElementById(id);
        if (el && (el.style.display === 'block' || id === 'menu-btns')) {
            const r = el.getBoundingClientRect();
            if (mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom) return true;
        }
    }
    return false;
}

function showTooltip(item, e) {
    const tt = document.getElementById('tooltip'); tt.style.display = 'block'; tt.style.left = (e.clientX + 15) + 'px'; tt.style.top = (e.clientY + 15) + 'px';
    let html = `<div class="tooltip-title" style="color:${getItemColor(item.rarity)}">${item.displayName || item.name}</div><div class="tooltip-type">${item.type}</div>`;

    // 如果是套装物品，显示套装名称
    if (item.setId && SET_ITEMS[item.setId]) {
        html += `<div style="color:${COLORS.setGreen}; font-size:12px; margin-top:3px;">${SET_ITEMS[item.setId].name}</div>`;
    }

    if (item.quantity > 1) html += `<div class="tooltip-stat">数量: ${item.quantity}</div>`;
    if (item.minDmg) html += `<div class="tooltip-stat">伤害: ${item.minDmg}-${item.maxDmg}</div>`;
    if (item.def) html += `<div class="tooltip-stat">防御: ${item.def}</div>`;
    if (item.heal) html += `<div class="tooltip-stat" style="color:#d00">恢复: ${item.heal}</div>`;
    if (item.stats) {
        for (let [k, v] of Object.entries(item.stats)) {
            let label = k;
            if (k === 'str') label = "力量";
            if (k === 'dex') label = "敏捷";
            if (k === 'vit') label = "体力";
            if (k === 'ene') label = "能量";
            if (k === 'def') label = "防御";
            if (k === 'lifeSteal') label = "%吸血";
            if (k === 'attackSpeed') label = "%攻速";
            if (k === 'dmgPct') label = "%伤害";
            if (k === 'allSkills') label = "所有技能";
            if (k === 'allRes') label = "全抗性";
            if (k === 'fireDmg') label = "火焰伤害";
            if (k === 'lightningDmg') label = "闪电伤害";
            if (k === 'mpRegen') label = "法力恢复";
            if (k === 'hpRegen') label = "生命恢复";
            if (k === 'critDamage') label = "%暴击伤害";
            html += `<div class="tooltip-stat" style="color:#4850b8">+${v} ${label}</div>`;
        }
    }

    // 显示套装加成
    if (item.setId && SET_ITEMS[item.setId]) {
        const setData = SET_ITEMS[item.setId];
        const equippedCount = player.equippedSets[item.setId] || 0;
        const totalPieces = Object.keys(setData.pieces).length;

        html += `<div style="margin-top:8px; border-top:1px solid #20ff20; padding-top:5px;">`;
        html += `<div style="color:${COLORS.setGreen}; font-size:11px; margin-bottom:5px;">套装加成 (${equippedCount}/${totalPieces}):</div>`;

        // 显示所有套装加成（已激活的高亮显示）
        for (let requiredPieces in setData.bonuses) {
            const isActive = equippedCount >= parseInt(requiredPieces);
            const color = isActive ? COLORS.setGreen : '#666';
            const bonus = setData.bonuses[requiredPieces];
            html += `<div style="color:${color}; font-size:11px;">(${requiredPieces}) ${bonus.desc}</div>`;
        }

        html += `</div>`;
    }

    // 显示装备需求
    if (item.requirements) {
        const req = item.requirements;
        html += `<div style="margin-top:5px; border-top:1px solid #444; padding-top:5px;"><div style="color:#888; font-size:11px; margin-bottom:3px;">需求:</div>`;

        if (req.level) {
            const meetsReq = player.lvl >= req.level;
            const color = meetsReq ? '#aaa' : '#ff4444';
            html += `<div class="tooltip-stat" style="color:${color}">等级 ${req.level}</div>`;
        }
        if (req.str) {
            const meetsReq = player.str >= req.str;
            const color = meetsReq ? '#aaa' : '#ff4444';
            html += `<div class="tooltip-stat" style="color:${color}">力量 ${req.str}</div>`;
        }
        if (req.dex) {
            const meetsReq = player.dex >= req.dex;
            const color = meetsReq ? '#aaa' : '#ff4444';
            html += `<div class="tooltip-stat" style="color:${color}">敏捷 ${req.dex}</div>`;
        }

        html += `</div>`;
    }

    tt.innerHTML = html;
}
function hideTooltip() { document.getElementById('tooltip').style.display = 'none'; }

// Input
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', e => {
    // 任何鼠标交互时尝试自动启动BGM
    AudioSys.tryAutoStartBGM();
    if (e.button === 0) {
        mouse.leftDown = true;
        mouse.leftClick = true; // 标记为刚点击（单次触发）
    }
    if (e.button === 2) { mouse.rightDown = true; castSkill(player.activeSkill); advanceTutorial(6); }
});
window.addEventListener('mouseup', e => {
    if (e.button === 0) {
        mouse.leftDown = false;
        mouse.leftClick = false;
    }
});
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', e => {
    // 任何键盘交互时尝试自动启动BGM
    AudioSys.tryAutoStartBGM();

    // Alt键控制物品过滤显示
    if (e.key === 'Alt') {
        isAltPressed = true;
        updateWorldLabels();
    }

    if (e.key === 'c' || e.key === 'C') togglePanel('stats');
    if (e.key === 'i' || e.key === 'I' || e.key === 'b' || e.key === 'B') { togglePanel('inventory'); advanceTutorial(0); }
    if (e.key === 't' || e.key === 'T') togglePanel('skills');
    if (e.key === 'q' || e.key === 'Q') selectSkill('fireball');
    if (e.key === 'w' || e.key === 'W') selectSkill('thunder');
    if (e.key === 'e' || e.key === 'E') selectSkill('multishot');
    if (e.key === 'j' || e.key === 'J') togglePanel('quest');
    if (e.key === 'a' || e.key === 'A') togglePanel('achievements');
    if (e.key === 'f' || e.key === 'F') toggleAutoBattle();

    if (e.key === '1') useQuickItem('health');
    if (e.key === '2') useQuickItem('mana');
    if (e.key === '3') useQuickItem('scroll');

    if (e.key === 'Enter') {
        if (interactionTarget) {
            if (interactionTarget.type === 'next') {
                const isInHell = player.isInHell || false;
                if (isInHell) {
                    // 在地狱中，进入下一层（先显示天赋商店）
                    if (player.hellFloor < 10) {
                        showTalentShop(player.hellFloor + 1, true);
                    }
                } else {
                    // 普通地牢，进入下一层（先显示天赋商店）
                    showTalentShop(player.floor + 1, false);
                }
            }
            else if (interactionTarget.type === 'prev') {
                const isInHell = player.isInHell || false;
                if (isInHell) {
                    // 在地狱中
                    if (player.hellFloor === 1) {
                        // 地狱第1层，返回营地
                        exitHell();
                    } else {
                        // 返回上一层地狱
                        enterFloor(player.hellFloor - 1, 'end');
                    }
                } else {
                    // 普通地牢，返回上一层
                    enterFloor(player.floor - 1, 'end');
                }
            }
            else if (interactionTarget.type === 'portal') {
                if (player.floor === 0) {
                    // 从罗格营地返回地牢时
                    if (townPortal) {
                        const safeDungeonPos = validateAndFixDungeonPortalPosition(townPortal.x, townPortal.y);
                        townPortal.x = safeDungeonPos.x;
                        townPortal.y = safeDungeonPos.y;
                    }
                    // 检查是否需要选择层数
                    if (player.lastFloor > 0 && player.maxFloor > 0 && player.lastFloor !== player.maxFloor) {
                        // 显示选择对话框
                        showPortalFloorChoice(player.lastFloor, player.maxFloor);
                    } else {
                        // 直接传送（lastFloor 和 maxFloor 相同，或只有一个有效）
                        // 优先级：lastFloor > maxFloor > townPortal.returnFloor
                        const targetFloor = player.lastFloor > 0 ? player.lastFloor :
                            (player.maxFloor > 0 ? player.maxFloor : townPortal.returnFloor);
                        enterFloor(targetFloor, 'portal');
                    }
                }
                else enterFloor(0, 'portal');
            }
        } else {
            showNotification("附近没有可互动的目标");
        }
    }
});

// Alt键释放时恢复物品过滤
window.addEventListener('keyup', e => {
    if (e.key === 'Alt') {
        isAltPressed = false;
        updateWorldLabels();
    }
});

// Prevent move on UI clicks
document.querySelectorAll('.sys-btn, .skill-btn, .stat-btn, .gamble-slot, .equip-slot, .bag-slot, .panel, .belt-slot').forEach(el => {
    el.onmousedown = (e) => e.stopPropagation();
});

// --- Dragging Logic ---
function initDragging() {
    let dragObj = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    document.querySelectorAll('.panel-header').forEach(header => {
        header.onmousedown = function (e) {
            e.preventDefault();
            e.stopPropagation();

            dragObj = header.parentElement;

            document.querySelectorAll('.panel').forEach(p => p.style.zIndex = 60);
            dragObj.style.zIndex = 61;

            const rect = dragObj.getBoundingClientRect();
            dragObj.style.left = rect.left + 'px';
            dragObj.style.top = rect.top + 'px';
            dragObj.style.transform = 'none';

            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
        };
    });

    document.addEventListener('mousemove', function (e) {
        if (dragObj) {
            e.preventDefault();
            dragObj.style.left = (e.clientX - dragOffsetX) + 'px';
            dragObj.style.top = (e.clientY - dragOffsetY) + 'px';
        }
    });

    document.addEventListener('mouseup', function () {
        dragObj = null;
    });
}

function updateMenuIndicators() {
    document.getElementById('badge-stats').style.display = player.points > 0 ? 'block' : 'none';
    document.getElementById('badge-skills').style.display = player.skillPoints > 0 ? 'block' : 'none';
    document.getElementById('badge-quest').style.display = player.questState === 2 ? 'block' : 'none';
}

// 在物品槽位上显示卖出提示
function showSellTooltip(idx, val) {
    const bagGrid = document.getElementById('bag-grid');
    if (!bagGrid) return;

    const slots = bagGrid.querySelectorAll('.bag-slot');
    if (idx >= slots.length) return;

    const slot = slots[idx];

    // 创建提示元素
    const tip = document.createElement('div');
    tip.style.position = 'absolute';
    tip.style.left = '0';
    tip.style.top = '0';
    tip.style.width = '100%';
    tip.style.height = '100%';
    tip.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
    tip.style.color = '#ffd700';
    tip.style.display = 'flex';
    tip.style.flexDirection = 'column';
    tip.style.justifyContent = 'center';
    tip.style.alignItems = 'center';
    tip.style.fontSize = '11px';
    tip.style.fontWeight = 'bold';
    tip.style.textAlign = 'center';
    tip.style.padding = '5px';
    tip.style.boxSizing = 'border-box';
    tip.style.zIndex = '1000';
    tip.style.pointerEvents = 'none';
    tip.style.animation = 'fadeOut 2s ease-out forwards';
    tip.innerHTML = `<div>已卖出</div><div style="font-size:13px; margin-top:2px;">+${val}G</div>`;

    // 添加到槽位
    slot.style.position = 'relative';
    slot.appendChild(tip);

    // 2秒后移除提示
    setTimeout(() => {
        if (tip.parentNode) {
            tip.parentNode.removeChild(tip);
        }
    }, 2000);
}

// 修复：恢复智能对比 Tooltip
function showTooltip(item, e) {
    const tt = document.getElementById('tooltip');
    tt.style.display = 'block';

    // 边缘检测防止溢出屏幕
    let left = e.clientX + 15;
    let top = e.clientY + 15;
    if (left + 250 > window.innerWidth) left = e.clientX - 265;
    if (top + 200 > window.innerHeight) top = e.clientY - 200;

    tt.style.left = left + 'px';
    tt.style.top = top + 'px';

    // 查找身上对应部位的装备
    let slot = null;
    // 简单的类型映射，与 useOrEquipItem 逻辑一致
    if (item.type === 'weapon') slot = 'mainhand';
    else if (item.type === 'armor') slot = 'body';
    else if (item.type === 'ring') slot = 'ring';
    else if (item.type === 'helm') slot = 'helm';
    else if (item.type === 'gloves') slot = 'gloves';
    else if (item.type === 'boots') slot = 'boots';
    else if (item.type === 'belt') slot = 'belt';
    else if (item.type === 'amulet') slot = 'amulet';

    const equipped = slot ? player.equipment[slot] : null;
    // 只有当物品在背包或商店，且身上有装备时才显示对比，避免悬停身上装备时自己比自己
    const isComparing = equipped && item !== equipped;

    const diffSpan = (val, eqVal) => {
        if (!isComparing || eqVal === undefined) return "";
        const diff = val - eqVal;
        if (diff > 0) return ` <span style="color:#00ff00; font-size:0.9em;">(+${diff})</span>`;
        if (diff < 0) return ` <span style="color:#ff4444; font-size:0.9em;">(${diff})</span>`;
        return "";
    };

    let html = `<div class="tooltip-title" style="color:${getItemColor(item.rarity)}">${item.displayName || item.name}</div><div class="tooltip-type">${item.type.toUpperCase()}</div>`;

    if (item.quantity > 1) html += `<div class="tooltip-stat">数量: ${item.quantity}</div>`;

    if (item.minDmg) {
        // 计算平均伤害差异
        let dmgDiff = "";
        if (isComparing && equipped.minDmg) {
            const avg = (item.minDmg + item.maxDmg) / 2;
            const eqAvg = (equipped.minDmg + equipped.maxDmg) / 2;
            const d = Math.floor(avg - eqAvg);
            if (d > 0) dmgDiff = ` <span style="color:#00ff00; font-size:0.9em;">(均伤 +${d})</span>`;
            if (d < 0) dmgDiff = ` <span style="color:#ff4444; font-size:0.9em;">(均伤 ${d})</span>`;
        }
        html += `<div class="tooltip-stat">伤害: ${item.minDmg}-${item.maxDmg}${dmgDiff}</div>`;
    }

    if (item.def) html += `<div class="tooltip-stat">防御: ${item.def}${diffSpan(item.def, equipped ? equipped.def : 0)}</div>`;
    if (item.heal) html += `<div class="tooltip-stat" style="color:#d00">恢复: ${item.heal}</div>`;

    if (item.stats) {
        for (let [k, v] of Object.entries(item.stats)) {
            let label = k;
            let color = '#4850b8';  // 默认蓝色
            let prefix = '+';
            let elementClass = '';  // 元素高亮 class

            // 基础属性
            if (k === 'str') label = "力量";
            else if (k === 'dex') label = "敏捷";
            else if (k === 'vit') label = "体力";
            else if (k === 'ene') label = "能量";
            else if (k === 'def') label = "防御";
            else if (k === 'maxHp') { label = "最大生命"; color = '#ff4444'; }
            else if (k === 'maxMp' || k === 'mp') { label = "最大法力"; color = '#4444ff'; }
            else if (k === 'hp') { label = "生命"; color = '#ff4444'; }
            else if (k === 'lifeSteal') label = "%吸血";
            else if (k === 'attackSpeed') label = "%攻速";
            else if (k === 'critChance') { label = "%暴击率"; color = '#ffff00'; }
            else if (k === 'dmgPct') label = "%伤害";
            else if (k === 'allSkills') label = "所有技能";

            // 抗性类
            else if (k === 'fireRes') { label = "🔥火焰抗性"; color = '#ff6644'; elementClass = 'fire-stat'; }
            else if (k === 'coldRes') { label = "❄️冰霜抗性"; color = '#4488ff'; elementClass = 'cold-stat'; }
            else if (k === 'lightningRes') { label = "⚡闪电抗性"; color = '#ffff44'; elementClass = 'lightning-stat'; }
            else if (k === 'poisonRes') { label = "☠️毒素抗性"; color = '#44ff44'; elementClass = 'poison-stat'; }
            else if (k === 'allRes') { label = "所有抗性"; color = '#ffaa44'; }

            // 元素伤害
            else if (k === 'fireDmg') { label = "火焰伤害"; color = '#ff4400'; elementClass = 'fire-stat'; }
            else if (k === 'lightningDmg') { label = "闪电伤害"; color = '#ffff00'; elementClass = 'lightning-stat'; }
            else if (k === 'poisonDmg') { label = "毒素伤害"; color = '#00ff00'; elementClass = 'poison-stat'; }

            // 特殊效果
            else if (k === 'hpRegen') { label = "生命回复/秒"; color = '#ff4444'; }
            else if (k === 'mpRegen') { label = "%法力回复"; color = '#4444ff'; }
            else if (k === 'blockChance') { label = "%格挡几率"; color = '#ffaa00'; }
            else if (k === 'reflectDamage') { label = "%反射伤害"; color = '#ff00ff'; }
            else if (k === 'damageReduction') { label = "%伤害减免"; color = '#aaaaaa'; }
            else if (k === 'critDamage') { label = "%暴击伤害"; color = '#ffff00'; }
            else if (k === 'armorPierce') { label = "%护甲穿透"; color = '#ff8800'; }
            else if (k === 'knockback') { label = "%击退几率"; color = '#88ff88'; }
            else if (k === 'slow') { label = "%减速几率"; color = '#8888ff'; elementClass = 'cold-stat'; }
            else if (k === 'doubleHit') { label = "%连击几率"; color = '#ff88ff'; }
            else if (k === 'attackRating') { label = "攻击等级"; color = '#ffaa00'; }
            else if (k === 'magicFind') { label = "%魔法发现"; color = '#00ffff'; }

            // 对比属性
            let eqStat = 0;
            if (equipped && equipped.stats && equipped.stats[k]) eqStat = equipped.stats[k];

            html += `<div class="tooltip-stat ${elementClass}" style="color:${color}">${prefix}${v} ${label}${diffSpan(v, eqStat)}</div>`;
        }
    }

    // 显示装备需求
    if (item.requirements) {
        const req = item.requirements;
        html += `<div style="margin-top:5px; border-top:1px solid #444; padding-top:5px;"><div style="color:#888; font-size:11px; margin-bottom:3px;">需求:</div>`;

        if (req.level) {
            const meetsReq = player.lvl >= req.level;
            const color = meetsReq ? '#aaa' : '#ff4444';
            html += `<div class="tooltip-stat" style="color:${color}">等级 ${req.level}</div>`;
        }
        if (req.str) {
            const meetsReq = player.str >= req.str;
            const color = meetsReq ? '#aaa' : '#ff4444';
            html += `<div class="tooltip-stat" style="color:${color}">力量 ${req.str}</div>`;
        }
        if (req.dex) {
            const meetsReq = player.dex >= req.dex;
            const color = meetsReq ? '#aaa' : '#ff4444';
            html += `<div class="tooltip-stat" style="color:${color}">敏捷 ${req.dex}</div>`;
        }

        html += `</div>`;
    }

    // 如果是对比状态，显示提示
    if (isComparing) {
        html += `<div style="margin-top:5px; border-top:1px solid #444; padding-top:2px; color:#666; font-size:10px;">正在与已装备物品对比</div>`;
    }

    tt.innerHTML = html;
}

function hideTooltip() { document.getElementById('tooltip').style.display = 'none'; }

// ============= 自动战斗UI交互函数 =============

function toggleAutoBattle() {
    const btn = document.getElementById('auto-battle-btn');
    const icon = document.getElementById('auto-battle-icon');

    // 营地时拒绝开启
    if (!AutoBattle.enabled && isInTown()) {
        showNotification('自动战斗仅在地牢中生效');
        return;
    }

    AutoBattle.enabled = !AutoBattle.enabled;

    if (AutoBattle.enabled) {
        btn.classList.add('active');
        icon.textContent = '⚔️';
        showNotification('自动战斗已开启');
        // 新手引导：步骤7 - 开启自动战斗
        advanceTutorial(7);
    } else {
        btn.classList.remove('active');
        icon.textContent = '🛡️';
        showNotification('自动战斗已关闭');
        AutoBattle.currentTarget = null;
        player.targetX = null;
        player.targetY = null;
    }
}

function updateAutoBattleSettings() {
    AutoBattle.settings.useSkill = document.getElementById('auto-use-skill').checked;
    AutoBattle.settings.keepDistance = parseInt(document.getElementById('auto-keep-distance').value);
    AutoBattle.settings.hpThreshold = parseInt(document.getElementById('auto-hp-threshold').value) / 100;
    AutoBattle.settings.mpThreshold = parseInt(document.getElementById('auto-mp-threshold').value) / 100;
    AutoBattle.settings.emergencyHp = parseInt(document.getElementById('auto-emergency-hp').value) / 100;
    AutoBattle.settings.pickupUnique = document.getElementById('auto-pickup-unique').checked;
    AutoBattle.settings.pickupSet = document.getElementById('auto-pickup-set').checked;
}

function syncAutoBattleUI() {
    const s = AutoBattle.settings;
    document.getElementById('auto-use-skill').checked = s.useSkill;
    document.getElementById('auto-keep-distance').value = s.keepDistance;
    document.getElementById('auto-hp-threshold').value = Math.round(s.hpThreshold * 100);
    document.getElementById('auto-mp-threshold').value = Math.round(s.mpThreshold * 100);
    document.getElementById('auto-emergency-hp').value = Math.round(s.emergencyHp * 100);
    document.getElementById('auto-pickup-unique').checked = s.pickupUnique;
    document.getElementById('auto-pickup-set').checked = s.pickupSet;
    updateDistanceDisplay(); updateHpDisplay(); updateMpDisplay(); updateEmergencyDisplay();
}

function updateDistanceDisplay() {
    const val = document.getElementById('auto-keep-distance').value;
    document.getElementById('distance-display').textContent = val;
}

function updateHpDisplay() {
    const val = document.getElementById('auto-hp-threshold').value;
    document.getElementById('hp-threshold-display').textContent = val + '%';
}

function updateMpDisplay() {
    const val = document.getElementById('auto-mp-threshold').value;
    document.getElementById('mp-threshold-display').textContent = val + '%';
}

function updateEmergencyDisplay() {
    const val = document.getElementById('auto-emergency-hp').value;
    document.getElementById('emergency-display').textContent = val + '%';
}


function switchSettingsTab(tabName) {
    // Hide all contents
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    // Show selected content
    const content = document.getElementById(`tab-${tabName}`);
    if (content) content.style.display = 'block';

    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`tab-btn-${tabName}`);
    if (btn) btn.classList.add('active');
}


// ============= 铁匠铺系统 (Blacksmith System) =============

let forgeState = {
    main: null,
    sub1: null,
    sub2: null
};

function renderBlacksmithPanel() {
    const slots = ['main', 'sub1', 'sub2'];
    let mainItem = forgeState.main;

    // 更新槽位显示
    slots.forEach(slotKey => {
        const item = forgeState[slotKey];
        const elId = slotKey === 'main' ? 'forge-main-slot' : (slotKey === 'sub1' ? 'forge-sub-slot-1' : 'forge-sub-slot-2');
        const el = document.getElementById(elId);

        // 清除旧内容
        el.innerHTML = '';
        el.className = `forge-slot ${slotKey === 'main' ? 'main-slot' : 'sacrifice-slot'}`;
        el.onclick = () => returnItemFromForge(slotKey);

        if (item) {
            el.classList.add('has-item');

            // 创建图标容器
            const iconDiv = document.createElement('div');
            iconDiv.style.width = '100%';
            iconDiv.style.height = '100%';
            applyItemSpriteToElement(iconDiv, item);
            iconDiv.style.border = 'none'; // 移除内部边框，使用槽位边框

            // 稀有度颜色边框
            const color = getItemColor(item.rarity);
            el.style.borderColor = color;
            el.style.boxShadow = `0 0 10px ${color}`;

            // 强化等级角标
            if (item.enhanceLvl > 0) {
                const badge = document.createElement('div');
                badge.className = 'item-count'; // 复用样式
                badge.innerText = `+${item.enhanceLvl}`;
                badge.style.right = '2px';
                badge.style.bottom = '2px';
                el.appendChild(badge);
            }

            el.appendChild(iconDiv);

            // Tooltip
            el.onmouseenter = (e) => showTooltip(item, e);
            el.onmouseleave = hideTooltip;
        } else {
            el.style.borderColor = '#555';
            el.style.boxShadow = 'inset 0 0 10px #000';
            const placeholder = document.createElement('span');
            placeholder.className = 'slot-placeholder';
            placeholder.innerText = slotKey === 'main' ? '装备' : '祭品';
            el.appendChild(placeholder);
            el.onmouseenter = null;
            el.onmouseleave = null;
        }
    });

    // 更新信息显示
    const previewText = document.getElementById('forge-preview-text');
    const costDisplay = document.getElementById('forge-cost-display');
    const btn = document.getElementById('btn-forge-action');
    const goldCostEl = document.getElementById('forge-gold-cost');

    if (mainItem) {
        const currentLvl = mainItem.enhanceLvl || 0;
        const nextLvl = currentLvl + 1;
        const isMaxLevel = currentLvl >= 9;

        if (isMaxLevel) {
            previewText.innerHTML = `<span style="color:#d4af37">已达到最高强化等级 (+9)</span>`;
            costDisplay.style.display = 'none';
            btn.disabled = true;
            btn.classList.remove('highlight-btn');
            btn.innerText = '已满级';
        } else {
            // 计算成功率和花费
            const successRate = Math.max(10, 100 - (currentLvl * 10)); // +0->+1: 100%, +8->+9: 20%
            const goldCost = (currentLvl + 1) * 1000 + (mainItem.rarity * 500); // 随等级和稀有度增加

            // 预览属性提升
            // 假设每次强化提升 10% 基础属性 (防御/伤害)
            const statIncrease = 10;

            let previewHtml = `强化至 <span style="color:#00ff00">+${nextLvl}</span><br>`;
            previewHtml += `成功率: <span style="color:${successRate >= 80 ? '#00ff00' : (successRate >= 50 ? '#ffff00' : '#ff4444')}">${successRate}%</span><br>`;
            previewHtml += `基础属性提升约 ${statIncrease}%`;

            if (currentLvl >= 6) {
                previewHtml += `<br><span style="color:#ff4444; font-size:11px;">⚠️ 失败可能导致强化等级下降</span>`;
            }

            previewText.innerHTML = previewHtml;

            // 更新花费
            goldCostEl.innerText = goldCost;
            costDisplay.style.display = 'block';

            // 检查条件
            const hasMaterials = forgeState.sub1 && forgeState.sub2;
            const canAfford = player.gold >= goldCost;

            if (hasMaterials && canAfford) {
                btn.disabled = false;
                btn.classList.add('highlight-btn');
                btn.innerText = '开始强化';
                btn.onclick = () => forgeItem(successRate, goldCost);
            } else {
                btn.disabled = true;
                btn.classList.remove('highlight-btn');
                btn.innerText = !hasMaterials ? '缺少祭品' : '金币不足';
            }
        }
    } else {
        previewText.innerHTML = `请放入需要强化的装备<br><span style="color:#888; font-size:12px;">(最高可强化至 +9)</span>`;
        costDisplay.style.display = 'none';
        btn.disabled = true;
        btn.classList.remove('highlight-btn');
        btn.innerText = '开始强化';
    }
}

function moveItemToForge(inventoryIdx) {
    const item = player.inventory[inventoryIdx];
    if (!item) return;

    // 装备判定
    const isEquipment = ['weapon', 'helm', 'armor', 'gloves', 'boots', 'belt', 'shield', 'ring', 'amulet'].includes(item.type);
    if (!isEquipment) {
        showNotification("只能强化装备");
        return;
    }

    if (!forgeState.main) {
        // 放入主槽位
        forgeState.main = item;
        player.inventory[inventoryIdx] = null;
        AudioSys.play('gold'); // 借用音效
    } else {
        // 尝试放入祭品槽位
        // 祭品要求：同部位
        if (item.type !== forgeState.main.type) {
            showNotification(`祭品必须是同部位装备 (${forgeState.main.type})`);
            return;
        }
        // 祭品要求：同稀有度 (或者更高? 这里严格要求同稀有度简化逻辑)
        if (item.rarity !== forgeState.main.rarity) {
            showNotification("祭品必须是相同稀有度");
            return;
        }

        if (!forgeState.sub1) {
            forgeState.sub1 = item;
            player.inventory[inventoryIdx] = null;
            AudioSys.play('gold');
        } else if (!forgeState.sub2) {
            forgeState.sub2 = item;
            player.inventory[inventoryIdx] = null;
            AudioSys.play('gold');
        } else {
            showNotification("槽位已满");
            return;
        }
    }

    renderInventory();
    renderBlacksmithPanel();
}

function returnItemFromForge(slotKey) {
    const item = forgeState[slotKey];
    if (!item) return;

    if (addItemToInventory(item)) {
        forgeState[slotKey] = null;

        // 如果取下主装备，祭品也一并退回 (为了防止误操作，或者单纯保留在上面也行？保留着比较方便)
        // 这里选择保留祭品，但渲染时会重新检查

        renderInventory();
        renderBlacksmithPanel();
    } else {
        showNotification("背包已满");
    }
}

function autoFillForgeMaterial() {
    if (!forgeState.main) {
        showNotification("请先放入主装备");
        return;
    }

    const targetType = forgeState.main.type;
    const targetRarity = forgeState.main.rarity;
    let addedCount = 0;

    // 填充sub1
    if (!forgeState.sub1) {
        const idx = player.inventory.findIndex(i => i && i.type === targetType && i.rarity === targetRarity);
        if (idx !== -1) {
            forgeState.sub1 = player.inventory[idx];
            player.inventory[idx] = null;
            addedCount++;
        }
    }

    // 填充sub2
    if (!forgeState.sub2) {
        const idx = player.inventory.findIndex(i => i && i.type === targetType && i.rarity === targetRarity);
        if (idx !== -1) {
            forgeState.sub2 = player.inventory[idx];
            player.inventory[idx] = null;
            addedCount++;
        }
    }

    if (addedCount > 0) {
        renderInventory();
        renderBlacksmithPanel();
        showNotification(`自动填充了 ${addedCount} 个祭品`);
        AudioSys.play('gold');
    } else {
        showNotification("没有找到匹配的祭品");
    }
}

function forgeItem(successRate, cost) {
    if (!forgeState.main || !forgeState.sub1 || !forgeState.sub2) return;
    if (player.gold < cost) return;

    player.gold -= cost;

    // 消耗祭品
    forgeState.sub1 = null;
    forgeState.sub2 = null;

    const mainItem = forgeState.main;
    const roll = Math.random() * 100;
    const isSuccess = roll < successRate;

    const mainSlotEl = document.getElementById('forge-main-slot');

    if (isSuccess) {
        // 成功
        mainItem.enhanceLvl = (mainItem.enhanceLvl || 0) + 1;

        // 提升基础属性
        // 简易实现：直接修 stats 对象里的属性，或者 def/minDmg
        // 注意：这里需要确保只保留整数
        if (mainItem.def) mainItem.def = Math.floor(mainItem.def * 1.1);
        if (mainItem.minDmg) mainItem.minDmg = Math.floor(mainItem.minDmg * 1.1);
        if (mainItem.maxDmg) mainItem.maxDmg = Math.floor(mainItem.maxDmg * 1.1);
        // 对于 stats 里的百分比属性通常不提升，只提升数值类比较合理
        // 但为了爽感，可以微调 stats
        for (let key in mainItem.stats) {
            // 只提升数值较大的属性，避免小数
            if (mainItem.stats[key] > 5) {
                mainItem.stats[key] = Math.ceil(mainItem.stats[key] * 1.05);
            }
        }

        // 更新名称显示
        if (!mainItem.originalName) mainItem.originalName = mainItem.displayName || mainItem.name;
        mainItem.displayName = `${mainItem.originalName} +${mainItem.enhanceLvl}`;

        // 成功特效
        createUIForgeEffect('success');

        mainSlotEl.classList.add('forge-success-anim');
        setTimeout(() => mainSlotEl.classList.remove('forge-success-anim'), 1000);

        // 特效粒子? (简化：用现有的 floating text)
        createFloatingText(player.x, player.y - 60, "强化成功!", '#00ff00', 2);

    } else {
        // 失败
        let msg = "强化失败...";
        // +6及以上失败惩罚：降级
        if ((mainItem.enhanceLvl || 0) >= 6) {
            // 50% 概率降级
            if (Math.random() > 0.5) {
                mainItem.enhanceLvl--;
                // 属性回退？这比较麻烦，简化处理：不回退属性只回退等级数字，或者稍微扣一点
                // 暂时只扣等级数字和一点点属性
                if (mainItem.def) mainItem.def = Math.floor(mainItem.def * 0.95);
                if (mainItem.minDmg) mainItem.minDmg = Math.floor(mainItem.minDmg * 0.95);
                if (mainItem.maxDmg) mainItem.maxDmg = Math.floor(mainItem.maxDmg * 0.95);

                mainItem.displayName = `${mainItem.originalName} +${mainItem.enhanceLvl}`;
                msg += " 等级下降!";
            } else {
                msg += " 物品保留";
            }
        }

        // 失败特效
        createUIForgeEffect('fail');

        mainSlotEl.classList.add('forge-fail-anim');
        setTimeout(() => mainSlotEl.classList.remove('forge-fail-anim'), 1000);
        createFloatingText(player.x, player.y - 60, "强化失败", '#ff4444', 2);
    }

    renderInventory();
    renderBlacksmithPanel();
    updateStats(); // 可能影响已装备物品（如果允许强化身上物品，目前逻辑是必须在背包里，所以不用）
}

// UI粒子特效 (用于强化成功/失败，显示在面板之上)
function createUIForgeEffect(type) {
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2 - 50; // 略微向上偏，对准主槽位
    const container = document.body;

    const count = type === 'success' ? 40 : 20;
    const colors = type === 'success' ?
        ['#ffd700', '#ffaa00', '#ffff00', '#ffffff'] :
        ['#888888', '#555555', '#aaaaaa', '#000000'];

    // 播放音效
    if (type === 'success') {
        AudioSys.play('drop_unique'); // 借用暗金掉落音效
    } else {
        AudioSys.play('hit');
    }

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        const size = Math.random() * 4 + 2;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.position = 'absolute';
        p.style.left = centerX + 'px';
        p.style.top = centerY + 'px';
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.borderRadius = '50%';
        p.style.zIndex = '2000'; // 确保在面板之上
        p.style.pointerEvents = 'none';
        p.style.boxShadow = type === 'success' ? `0 0 ${size * 2}px ${p.style.backgroundColor}` : 'none';

        container.appendChild(p);

        // 动画参数
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 100 + 50; // 速度
        const life = 1.0 + Math.random() * 0.5; // 持续时间

        // CSS transition
        p.style.transition = `all ${life}s ease-out`;

        // 下一帧触发移动
        requestAnimationFrame(() => {
            const destX = centerX + Math.cos(angle) * velocity * 2; // 扩散半径
            const destY = centerY + Math.sin(angle) * velocity * 2 + (type === 'success' ? -100 : 100); // 成功向上飘，失败向下落

            p.style.transform = `translate(${destX - centerX}px, ${destY - centerY}px)`;
            p.style.opacity = '0';
        });

        // 清理
        setTimeout(() => p.remove(), life * 1000);
    }

    // 成功时的额外闪光
    if (type === 'success') {
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.left = '0';
        flash.style.top = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.backgroundColor = 'rgba(255, 215, 0, 0.3)';
        flash.style.zIndex = '1999';
        flash.style.pointerEvents = 'none';
        flash.style.transition = 'opacity 0.5s ease-out';

        container.appendChild(flash);

        requestAnimationFrame(() => {
            flash.style.opacity = '0';
        });

        setTimeout(() => flash.remove(), 500);
    }
}

initDragging();
init();

// ========== 更新公告系统 ==========
const CHANGELOG_MAX_DISPLAY = 30; // 最多显示的版本数

// 检查是否需要显示更新公告
function checkChangelog() {
    if (typeof CHANGELOG === 'undefined' || CHANGELOG.length === 0) return;

    const lastReadVersion = localStorage.getItem('changelog_read_version');
    const currentVersion = CURRENT_VERSION;

    // 如果没有读过 或 有新版本，则自动弹出
    if (!lastReadVersion || lastReadVersion !== currentVersion) {
        showChangelogPanel();
    }
}

// 显示更新公告面板
function showChangelogPanel() {
    const panel = document.getElementById('changelog-panel');
    const content = document.getElementById('changelog-content');

    if (!panel || !content) return;

    // 清空并加载最多10条
    content.innerHTML = '';
    const displayCount = Math.min(CHANGELOG_MAX_DISPLAY, CHANGELOG.length);

    for (let i = 0; i < displayCount; i++) {
        const item = CHANGELOG[i];
        const div = document.createElement('div');
        div.className = 'changelog-item';

        const highlightsHtml = item.highlights
            .map(h => `<li>${h}</li>`)
            .join('');

        div.innerHTML = `
            <div class="changelog-version">
                <span class="changelog-version-num">v${item.version}</span>
                <span class="changelog-version-title">${item.title}</span>
            </div>
            <ul class="changelog-highlights">${highlightsHtml}</ul>
        `;
        content.appendChild(div);
    }

    panel.style.display = 'flex';
}

// 关闭更新公告面板
function closeChangelogPanel() {
    const panel = document.getElementById('changelog-panel');
    if (panel) {
        panel.style.display = 'none';
    }

    // 记录已读版本
    if (typeof CURRENT_VERSION !== 'undefined') {
        localStorage.setItem('changelog_read_version', CURRENT_VERSION);
    }
}

// 在页面加载完成后检查是否需要显示公告
document.addEventListener('DOMContentLoaded', () => {
    // 延迟检查，等待首屏加载完成
    setTimeout(checkChangelog, 500);
});

// ========== 新手引导系统 ==========
// 城镇气泡引导（步骤0-4）
const TUTORIAL_TOWN_STEPS = [
    { id: 0, target: 'inventory-btn', text: '按 I 打开背包，装备武器', isUI: true },
    { id: 1, target: 'merchant', text: '在这里买卖装备和药水' },
    { id: 2, target: 'healer', text: '找她接取任务' },
    { id: 3, target: 'stash', text: '存放你的装备' },
    { id: 4, target: 'exit', text: '点击进入地牢' }
];
// 战斗引导（步骤5-8，顶部提示）
const TUTORIAL_BATTLE_STEPS = [
    { id: 5, text: '点击怪物进行物理攻击', key: null },
    { id: 6, text: '右键点击敌人释放火球术', key: '右键' },
    { id: 7, text: '按 F 开启自动战斗，解放双手', key: 'F' }
];

// 获取城镇引导目标的世界坐标
function getTutorialTargetPos(targetType) {
    if (targetType === 'exit') {
        return { x: dungeonExit.x, y: dungeonExit.y };
    }
    const npc = npcs.find(n => n.type === targetType);
    if (npc) return { x: npc.x, y: npc.y };
    return null;
}

// 更新城镇气泡位置（每帧调用）
function updateTutorialBubble() {
    if (player.tutorial.completed) return;
    if (player.tutorial.step >= TUTORIAL_TOWN_STEPS.length) return;
    if (player.floor !== 0) return; // 只在城镇显示

    const step = TUTORIAL_TOWN_STEPS[player.tutorial.step];
    if (!step) return;

    let bubble = document.getElementById('tutorial-bubble');
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'tutorial-bubble';
        bubble.innerHTML = `
            <span class="bubble-text"></span>
            <button class="bubble-btn">知道了</button>
            <div class="bubble-arrow"></div>
        `;
        // 阻止事件冒泡，防止触发游戏点击
        bubble.onmousedown = (e) => e.stopPropagation();
        bubble.onclick = (e) => e.stopPropagation();
        // 按钮点击事件
        bubble.querySelector('.bubble-btn').onclick = (e) => {
            e.stopPropagation();
            advanceTutorial(player.tutorial.step);
        };
        document.querySelector('.ui-layer').appendChild(bubble);
    }

    // UI元素定位（如物品按钮）
    if (step.isUI) {
        const btnId = step.target === 'inventory-btn' ? 'btn-inventory' : step.target;
        const btn = document.getElementById(btnId);
        if (!btn) return;

        const rect = btn.getBoundingClientRect();
        // 气泡在按钮左边，箭头指向右边
        const screenX = rect.left - 10;
        const screenY = rect.top + rect.height / 2;

        bubble.querySelector('.bubble-text').textContent = step.text;
        bubble.style.left = screenX + 'px';
        bubble.style.top = screenY + 'px';
        bubble.style.display = 'block';
        bubble.classList.add('arrow-right');  // 箭头朝右
        bubble.classList.remove('arrow-down');
        return;
    }

    // 世界坐标定位（NPC、出口等）
    const targetPos = getTutorialTargetPos(step.target);
    if (!targetPos) return;

    // 转换为屏幕坐标
    const screenX = targetPos.x - camera.x;
    // NPC名字在 y-70，气泡在名字上方需要-160；地牢入口需要-100
    const yOffset = (step.target === 'exit') ? -100 : -160;
    const screenY = targetPos.y - camera.y + yOffset;

    bubble.querySelector('.bubble-text').textContent = step.text;
    bubble.style.left = screenX + 'px';
    bubble.style.top = screenY + 'px';
    bubble.style.display = 'block';
    bubble.classList.remove('arrow-right', 'arrow-down');  // 默认箭头朝下指向NPC
}

// 隐藏城镇气泡
function hideTutorialBubble() {
    const bubble = document.getElementById('tutorial-bubble');
    if (bubble) bubble.style.display = 'none';
}

// 显示战斗引导提示（顶部）
function showTutorialTip(step) {
    if (player.tutorial.completed) return;
    if (step !== player.tutorial.step) return;

    // 城镇引导用气泡，不用顶部提示
    if (step < TUTORIAL_TOWN_STEPS.length) return;

    const battleStep = TUTORIAL_BATTLE_STEPS.find(s => s.id === step);
    if (!battleStep) return;

    let el = document.getElementById('tutorial-tip');
    if (!el) {
        el = document.createElement('div');
        el.id = 'tutorial-tip';
        document.querySelector('.ui-layer').appendChild(el);
    }

    el.innerHTML = `<span class="tutorial-text">${battleStep.text}</span>${battleStep.key ? `<span class="tutorial-key">${battleStep.key}</span>` : ''}`;
    el.style.display = 'flex';
    el.style.opacity = '0';
    setTimeout(() => el.style.opacity = '1', 50);
}

// 隐藏顶部引导提示
function hideTutorialTip() {
    const el = document.getElementById('tutorial-tip');
    if (el) {
        el.style.opacity = '0';
        setTimeout(() => el.style.display = 'none', 300);
    }
}

// 完成当前引导步骤，进入下一步
function advanceTutorial(completedStep) {
    if (player.tutorial.completed) return;
    if (completedStep !== player.tutorial.step) return;

    hideTutorialTip();
    hideTutorialBubble();
    player.tutorial.step++;

    const totalSteps = TUTORIAL_TOWN_STEPS.length + TUTORIAL_BATTLE_STEPS.length;
    if (player.tutorial.step >= totalSteps) {
        player.tutorial.completed = true;
        showNotification('🎉 教程完成！祝你冒险愉快！');
    } else if (player.tutorial.step >= TUTORIAL_TOWN_STEPS.length && player.floor > 0) {
        // 进入战斗引导阶段，且已在地牢中，显示顶部提示
        setTimeout(() => showTutorialTip(player.tutorial.step), 800);
    }
    // 城镇气泡会在 updateTutorialBubble 中自动更新
}

// 检查并启动引导（在 startGame 后调用）
function checkTutorial() {
    if (player.tutorial.completed) return;
    // 如果玩家已经有进度（击杀数>0 或 层数>0），标记为完成
    if (player.kills > 0 || player.floor > 0 || player.maxFloor > 0) {
        player.tutorial.completed = true;
        return;
    }
    // 新玩家，城镇气泡会在 updateTutorialBubble 中自动显示
}
