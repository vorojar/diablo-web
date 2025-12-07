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
    white: '#ffffff', blue: '#4850b8', yellow: '#ffff00', gold: '#908858', red: '#c23b22', green: '#00ff00',
    ice: '#00ccff', floor: '#0c0c0c', floorAlt: '#080808', wall: '#2C2C2C', townFloor: '#1a1a1a',
    exit: '#0055aa', entrance: '#aa5500', setGreen: '#20ff20'  // 套装绿色
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

const MONSTER_FRAMES = {
    'melee': 0,      // 沉沦魔
    'ranged': 1,     // 骷髅弓箭手
    'shaman': 2,     // 黑暗萨满
    'elite': 3,      // 精英怪物
    'bloodRaven': 4, // Boss: 血鸟
    'countess': 5,   // Boss: 女伯爵
    'butcher': 6,    // Boss: 屠夫
    'duriel': 7,     // Boss: 树头木拳
    'diablo': 8,     // Boss: 暗黑破坏神
    'baal': 9        // Boss: 巴尔
};

// 根据Boss名称获取frameIndex
function getBossFrameIndex(bossName) {
    // 移除"地狱"前缀
    const cleanName = bossName.replace('地狱', '');

    const bossFrameMap = {
        '血鸟': MONSTER_FRAMES.bloodRaven,
        '女伯爵': MONSTER_FRAMES.countess,
        '屠夫': MONSTER_FRAMES.butcher,
        '树头木拳': MONSTER_FRAMES.duriel,
        '暗黑破坏神': MONSTER_FRAMES.diablo,
        '巴尔': MONSTER_FRAMES.baal
    };

    return bossFrameMap[cleanName] || MONSTER_FRAMES.elite; // 默认使用精英怪物图像
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
    // 冰冻状态
    frozen: false,
    frozenTimer: 0,
    freezeImmuneTimer: 0  // 冰冻免疫时间
};

const spriteSheet = new Image();
spriteSheet.src = 'sprites.png?v=3.5';

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
    monsterRow: 1,
    npcRow: 2
};

// --- Item Sprites ---
const itemSpriteSheet = new Image();
itemSpriteSheet.src = 'items.png';
let itemSpritesLoaded = false;
itemSpriteSheet.onload = () => { itemSpritesLoaded = true; };

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
        id: 'collect_full_set',
        name: '套装收藏家',
        description: '收集任意一套完整套装（6件）',
        target: 6,
        type: 'collect_set'
    },
    {
        id: 'equip_full_set',
        name: '套装大师',
        description: '同时穿戴一套完整套装（6件）',
        target: 6,
        type: 'equip_set'
    },
    {
        id: 'no_death_floor10',
        name: '钢铁意志',
        description: '从未死亡到达第10层',
        target: 10,
        type: 'no_death_floor'
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


            case 'no_death_floor':
                if (player.floor >= ach.target && !player.died) {
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
    // 1. 检查"套装收藏家"：收集任意一套完整套装（包括背包和仓库）
    const collectAch = ACHIEVEMENTS.find(a => a.id === 'collect_full_set');
    if (collectAch && player.achievements['collect_full_set']) {
        // 统计每个套装收集的件数
        const setItemCounts = {};

        // 检查装备栏
        Object.values(player.equipment).forEach(item => {
            if (item && item.setId) {
                setItemCounts[item.setId] = (setItemCounts[item.setId] || 0) + 1;
            }
        });

        // 检查背包
        player.inventory.forEach(item => {
            if (item && item.setId) {
                setItemCounts[item.setId] = (setItemCounts[item.setId] || 0) + 1;
            }
        });

        // 检查仓库
        player.stash.forEach(item => {
            if (item && item.setId) {
                setItemCounts[item.setId] = (setItemCounts[item.setId] || 0) + 1;
            }
        });

        // 找到收集最多的套装件数
        let maxCollected = 0;
        for (let setId in setItemCounts) {
            if (setItemCounts[setId] > maxCollected) {
                maxCollected = setItemCounts[setId];
            }
        }

        // 更新进度（最多6件）
        player.achievements['collect_full_set'].progress = Math.min(maxCollected, 6);

        // 检查是否完成（收集齐6件）
        if (!player.achievements['collect_full_set'].completed && maxCollected >= 6) {
            completeAchievement(collectAch);
        }
    }

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
        useSkill: true,          // 优先使用技能
        keepDistance: 150,       // 保持距离（远程战术）
        hpThreshold: 0.3,        // 喝红药阈值 (30%)
        mpThreshold: 0.2,        // 喝蓝药阈值 (20%)
        emergencyHp: 0.15,       // 紧急回城阈值 (15%)
        pickupUnique: true,      // 自动拾取暗金
        pickupSet: true          // 自动拾取套装
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

    // 快速寻找最近的敌人（优化性能）
    findTarget() {
        if (!this.enabled || player.floor === 0) return null;

        // 清理过期的黑名单
        const now = Date.now();
        this.blacklistedTargets = this.blacklistedTargets.filter(entry => entry.until > now);

        // 检查目标是否在黑名单中
        const isBlacklisted = (enemy) => {
            return this.blacklistedTargets.some(entry => entry.target === enemy);
        };

        // 优先反击最近攻击我的敌人（即使超出正常搜索范围）
        // 但如果当前目标快死了（血量<30%），坚持打死它再切换
        const currentTargetLowHp = this.currentTarget &&
            !this.currentTarget.dead &&
            (this.currentTarget.hp / this.currentTarget.maxHp) < 0.3;

        if (!currentTargetLowHp && this.lastDamagedBy && !this.lastDamagedBy.dead && !isBlacklisted(this.lastDamagedBy)) {
            const timeSinceAttacked = Date.now() - this.lastDamagedTime;
            if (timeSinceAttacked < 5000) { // 5秒内被攻击，优先反击（延长时间）
                const dist = Math.hypot(this.lastDamagedBy.x - player.x, this.lastDamagedBy.y - player.y);
                // 即使敌人很远，只要在800像素内就锁定（弓箭手可能在远处）
                if (dist < 800) {
                    return this.lastDamagedBy;
                }
            }
        }

        let nearestEnemy = null;
        let minDist = Infinity;

        // 快速遍历，不做复杂计算
        for (let i = 0; i < enemies.length; i++) {
            const e = enemies[i];
            if (e.dead) continue;

            // 跳过黑名单中的敌人
            if (isBlacklisted(e)) continue;

            const dist = Math.hypot(e.x - player.x, e.y - player.y);

            // 扩大搜索范围到600像素（应对远程敌人）
            if (dist < 600 && dist < minDist) {
                nearestEnemy = e;
                minDist = dist;
            }
        }

        return nearestEnemy;
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

    // 决策行动（优化版）
    decideAction(dt) {
        if (!this.enabled || player.floor === 0) return;

        // 0. 定期清理失败路径记录（每5秒清空，避免过时数据）
        this.pathCleanupTimer += dt;
        if (this.pathCleanupTimer > 5) {
            this.failedPaths = [];
            this.pathCleanupTimer = 0;
        }

        // 1. 实时卡墙检测（包括静止和摇摆两种情况）
        const posChanged = Math.hypot(player.x - this.lastPos.x, player.y - this.lastPos.y);

        // 1a. 静止检测
        if (posChanged < 10) {  // 提高阈值到10像素，排除原地微动
            // 位置几乎没变化，可能卡墙了
            this.stuckTimer += dt;
            if (this.stuckTimer > 0.5) {  // 卡住超过0.5秒
                // 尝试脱困：随机移动到附近空地
                this.escapeFromStuck();
                this.stuckTimer = 0;
                this.lastPos = { x: player.x, y: player.y };
                return;
            }
        } else {
            // 位置有变化，重置卡墙计时器
            this.stuckTimer = 0;
            this.lastPos = { x: player.x, y: player.y };
        }

        // 1b. 摇摆检测（每0.2秒检查一次）
        this.oscillationDetector.lastCheck += dt;
        if (this.oscillationDetector.lastCheck > 0.2) {
            this.oscillationDetector.lastCheck = 0;
            this.oscillationDetector.positions.push({ x: player.x, y: player.y });

            // 保留最近5个位置
            if (this.oscillationDetector.positions.length > 5) {
                this.oscillationDetector.positions.shift();
            }

            // 如果5个位置的平均移动距离很小，判定为摇摆
            if (this.oscillationDetector.positions.length === 5) {
                // 如果正在攻击范围内的目标，不触发摇摆检测（站桩攻击是正常行为）
                if (this.currentTarget && !this.currentTarget.dead) {
                    const distToTarget = Math.hypot(this.currentTarget.x - player.x, this.currentTarget.y - player.y);
                    const attackRange = 60; // 近战攻击范围
                    if (distToTarget <= attackRange) {
                        // 正在近战攻击，跳过摇摆检测
                        this.oscillationDetector.positions = [];
                        return;
                    }
                }

                const avgX = this.oscillationDetector.positions.reduce((sum, p) => sum + p.x, 0) / 5;
                const avgY = this.oscillationDetector.positions.reduce((sum, p) => sum + p.y, 0) / 5;
                const maxDist = Math.max(...this.oscillationDetector.positions.map(p =>
                    Math.hypot(p.x - avgX, p.y - avgY)
                ));

                // 【问题9修复】增加摇摆检测阈值（30px→50px），减少窄走廊误判
                if (maxDist < 50) {
                    this.targetFailCount++;
                    //createFloatingText(player.x, player.y - 70, `⚠️ 摇摆卡墙 (${this.targetFailCount}/3)`, '#ff8800', 1.5);

                    // 连续失败3次，放弃当前目标
                    if (this.targetFailCount >= 3) {
                        //createFloatingText(player.x, player.y - 80, '❌ 放弃当前目标，寻找新路线', '#ff4444', 2);

                        // 【问题10修复】缩短黑名单时间（10秒→5秒），允许更快重试
                        if (this.currentTarget) {
                            this.blacklistedTargets.push({
                                target: this.currentTarget,
                                until: Date.now() + 5000  // 黑名单持续5秒
                            });
                        }

                        this.currentTarget = null;  // 清空目标
                        this.targetFailCount = 0;
                        this.lastTargetId = null;
                        this.oscillationDetector.positions = [];
                        this.moveToCenter();  // 移动到随机位置
                        return;
                    }

                    this.escapeFromStuck();
                    this.oscillationDetector.positions = [];
                    return;
                }
            }
        }

        // 2. 紧急回城
        const hpPercent = player.hp / player.maxHp;
        if (hpPercent < this.settings.emergencyHp) {
            this.emergencyTownPortal();
            return;
        }

        // 3. 生存优先：喝药
        if (hpPercent < this.settings.hpThreshold) {
            this.drinkPotion('health');
        }

        const mpPercent = player.mp / player.maxMp;
        if (mpPercent < this.settings.mpThreshold) {
            this.drinkPotion('mana');
        }

        // 3. 拾取附近的物品（优先级高）
        this.autoPickupItems();

        // 4. 寻找目标（保持锁定：已有有效目标时不切换）
        const isBlacklisted = (e) => this.blacklistedTargets.some(entry => entry.target === e);
        const currentValid = this.currentTarget &&
            !this.currentTarget.dead &&
            !isBlacklisted(this.currentTarget) &&
            Math.hypot(this.currentTarget.x - player.x, this.currentTarget.y - player.y) < 800;

        if (!currentValid) {
            this.currentTarget = this.findTarget();
        }

        // 检测目标是否切换，切换则重置失败计数
        if (this.currentTarget !== this.lastTargetId) {
            this.targetFailCount = 0;
            this.lastTargetId = this.currentTarget;
        }

        if (!this.currentTarget) {
            // 没有敌人，探索地图
            this.stuckTimer += dt;
            if (this.stuckTimer > 0.5) {  // 缩短等待时间从3秒到0.5秒
                this.moveToCenter();
                this.stuckTimer = 0;
            }
            return;
        }

        this.stuckTimer = 0;
        const dist = Math.hypot(this.currentTarget.x - player.x, this.currentTarget.y - player.y);

        // 检查是否有视线
        const canSeeTarget = hasLineOfSight(player.x, player.y, this.currentTarget.x, this.currentTarget.y);

        // 雷电术可以隔墙使用，但射程只有200（留10像素余地）
        const hasThunder = player.skills.thunder > 0;
        const thunderRange = 190;
        const canUseThunder = hasThunder && dist <= thunderRange;

        // 5. 移动决策稳定性（每0.1秒更新一次移动决策，更快响应）
        this.moveDecisionTimer += dt;
        const shouldUpdateMove = this.moveDecisionTimer > 0.1;

        // 如果有拾取目标，优先去拾取，跳过战斗移动逻辑（但仍然攻击）
        const skipMoveForPickup = player.targetItem !== null;

        if (shouldUpdateMove && !skipMoveForPickup) {
            this.moveDecisionTimer = 0;

            // 决定移动策略
            const hasRangedSkill = player.skills.fireball > 0 || player.skills.thunder > 0 || player.skills.multishot > 0;

            // 【问题6修复】检测法力是否足以支持远程战斗
            let canAffordRangedSkills = true;
            if (hasRangedSkill && this.settings.useSkill) {
                // 计算最低技能消耗
                let minMpCost = Infinity;
                if (player.skills.thunder > 0) {
                    minMpCost = Math.min(minMpCost, 15 + (player.skills.thunder - 1) * 2);
                }
                if (player.skills.fireball > 0) {
                    minMpCost = Math.min(minMpCost, 10);
                }
                if (player.skills.multishot > 0) {
                    minMpCost = Math.min(minMpCost, 10);
                }
                // 如果法力不足以释放任何技能，强制使用近战模式
                canAffordRangedSkills = player.mp >= minMpCost;
            }

            if (hasRangedSkill && this.settings.useSkill && canAffordRangedSkills) {
                // 远程模式（添加滞后区间防止抖动）
                if (dist < 60) {
                    // 太近，后退
                    this.lastMoveDecision = 'retreat';
                    this.retreatFrom(this.currentTarget);
                } else if (dist > 480) {
                    // 太远，追击（提高阈值到480，应对远程敌人）
                    this.lastMoveDecision = 'chase';
                    this.moveTowards(this.currentTarget);
                } else if (this.lastMoveDecision === 'chase' && dist > 380) {
                    // 维持追击状态，直到进入更近的范围（滞后效应）
                    this.moveTowards(this.currentTarget);
                } else if (!canSeeTarget) {
                    // 被墙挡住，检查是否能用雷电术
                    const thunderCost = 15 + (player.skills.thunder - 1) * 2;
                    const canReallyUseThunder = canUseThunder &&
                        player.skillCooldowns.thunder <= 0 &&
                        player.mp >= thunderCost;

                    if (canReallyUseThunder) {
                        // 可以用雷电术隔墙攻击，站定不动
                        this.lastMoveDecision = 'thunder_attack';
                        player.targetX = null;
                        player.targetY = null;
                    } else {
                        // 无法使用雷电术（CD中/法力不足/距离太远），绕墙
                        this.lastMoveDecision = 'navigate';
                        this.moveTowards(this.currentTarget);
                    }
                } else {
                    // 距离合适，缓慢靠近
                    this.lastMoveDecision = 'approach';
                    const moveAngle = Math.atan2(this.currentTarget.y - player.y, this.currentTarget.x - player.x);
                    player.targetX = player.x + Math.cos(moveAngle) * 40;
                    player.targetY = player.y + Math.sin(moveAngle) * 40;
                }
            } else {
                // 近战模式（添加滞后区间） - 无技能或法力不足时使用
                if (dist > 250) {
                    // 太远，冲锋（提高阈值，以便追击远程敌人）
                    this.lastMoveDecision = 'chase';
                    this.moveTowards(this.currentTarget);
                } else if (this.lastMoveDecision === 'chase' && dist > 180) {
                    // 维持冲锋，直到足够近（滞后效应）
                    this.moveTowards(this.currentTarget);
                } else if (!canSeeTarget) {
                    // 看不见，绕墙
                    this.lastMoveDecision = 'navigate';
                    this.moveTowards(this.currentTarget);
                } else if (dist < 80) {
                    // 近战范围内，停止移动
                    this.lastMoveDecision = 'attack';
                    player.targetX = null;
                    player.targetY = null;
                } else {
                    // 距离合适，缓慢靠近
                    this.lastMoveDecision = 'approach';
                    const moveAngle = Math.atan2(this.currentTarget.y - player.y, this.currentTarget.x - player.x);
                    player.targetX = player.x + Math.cos(moveAngle) * 30;
                    player.targetY = player.y + Math.sin(moveAngle) * 30;
                }
            }
        }

        // 无论如何都尝试攻击
        this.attackTarget(this.currentTarget);
    },

    // 紧急回城
    emergencyTownPortal() {
        // 使用回城卷轴
        const scrollCount = player.inventory.filter(it => it && it.type === 'scroll').length;
        if (scrollCount > 0) {
            useQuickItem('scroll');
            createFloatingText(player.x, player.y - 60, '⚠️ 紧急回城！', '#ff0000', 2);
        } else {
            createFloatingText(player.x, player.y - 60, '没有回城卷轴！', '#ff8888', 1.5);
        }
    },

    // 喝药
    drinkPotion(type) {
        let itemName = '';
        if (type === 'health') itemName = '治疗药剂';
        if (type === 'mana') itemName = '法力药剂';

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

        // 计算可用技能的最低法力消耗
        let minMpRequired = Infinity;
        if (this.settings.useSkill) {
            if (player.skills.thunder > 0) {
                const thunderCost = 15 + (player.skills.thunder - 1) * 2;
                minMpRequired = Math.min(minMpRequired, thunderCost);
            }
            if (player.skills.multishot > 0) {
                minMpRequired = Math.min(minMpRequired, 10);
            }
            if (player.skills.fireball > 0) {
                minMpRequired = Math.min(minMpRequired, 10);
            }
        }

        // 法力不足以释放任何技能，直接使用物理攻击
        const noManaForSkills = player.mp < minMpRequired;

        // 优先使用技能（如果有法力）
        if (this.settings.useSkill && !noManaForSkills) {
            // 雷电术：可以隔墙使用！射程190（实际200，留余地）
            if (player.skills.thunder > 0 && player.skillCooldowns.thunder <= 0 && dist <= 190) {
                const cost = 15 + (player.skills.thunder - 1) * 2;
                if (player.mp >= cost) {
                    castSkill('thunder');
                    return;
                }
            }

            // 以下技能需要视线
            if (hasLOS) {
                // 多重射击：远程范围攻击
                if (player.skills.multishot > 0 && player.skillCooldowns.multishot <= 0 && dist <= 500 && player.mp >= 10) {
                    castSkill('multishot');
                    return;
                }

                // 火球术：中程单体伤害
                if (player.skills.fireball > 0 && player.skillCooldowns.fireball <= 0 && dist <= 450 && player.mp >= 10) {
                    castSkill('fireball');
                    return;
                }
            }
        }

        // 技能CD中、法力不足或已禁用技能，使用普通攻击
        // 近距离(<100px)无需视线检测，可以攻击墙角的怪物
        // 远距离需要视线
        const canMeleeAttack = (dist < 60) || (hasLOS && dist < 80);

        if (canMeleeAttack && player.attackCooldown <= 0) {
            const baseDmg = player.damage[0] + Math.random() * (player.damage[1] - player.damage[0]);
            const strBonus = player.str * 0.1;
            const totalDmg = Math.floor((baseDmg + strBonus) * (1 + player.attackSpeed / 100));
            takeDamage(target, totalDmg);
            player.attackCooldown = 0.8 / (1 + player.attackSpeed / 100);
            AudioSys.play('hit');
            createSlashEffect(player.x, player.y, target.x, target.y, totalDmg);
            player.attackAnim = 1;

            // 生命偷取
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
                if (it.isSet || it.rarity >= 4 || it.name === '治疗药剂' || it.name === '法力药剂' || it.name === '回城卷轴') continue;
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
        const hasHealPotion = player.inventory.some(it => it && it.name === '治疗药剂');
        const hasManaPotion = player.inventory.some(it => it && it.name === '法力药剂');

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
            const canStack = (it.name === '治疗药剂' || it.name === '法力药剂' || it.name === '回城卷轴') &&
                player.inventory.some(inv => inv && inv.name === it.name);

            // 药水/卷轴
            if (it.name === '治疗药剂' && player.autoPickup.potion && dist < 400) {
                if (canStack || !inventoryFull) {
                    // 没有红药时提升优先级
                    if (!hasHealPotion) urgentPotions.push({ item: it, dist });
                    else consumables.push({ item: it, dist });
                }
            }
            else if (it.name === '法力药剂' && player.autoPickup.potion && dist < 400) {
                if (canStack || !inventoryFull) {
                    // 没有蓝药时提升优先级
                    if (!hasManaPotion) urgentPotions.push({ item: it, dist });
                    else consumables.push({ item: it, dist });
                }
            }
            else if (it.name === '回城卷轴' && player.autoPickup.scroll && dist < 400) {
                if (canStack || !inventoryFull) consumables.push({ item: it, dist });
            }
            // 套装：距离500内，最高优先级（可丢弃稀有装备腾空间）
            else if (this.settings.pickupSet && it.isSet && dist < 500) {
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
            if (inventoryFull && (selected.isSet || selected.rarity >= 3)) {
                // 套装可以丢弃稀有装备，其他只丢蓝装及以下
                this.dropLowestValueItem(selected.isSet);
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
            if (it.isSet || it.rarity >= 4 || it.name === '治疗药剂' || it.name === '法力药剂' || it.name === '回城卷轴') continue;
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

const SaveSystem = {
    init: function () {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('saveData')) db.createObjectStore('saveData', { keyPath: 'id' });
        };
        req.onsuccess = e => { db = e.target.result; this.load(); };
        req.onerror = e => { console.error("DB Init Failed", e); };
    },
    save: function () {
        if (!db) return;
        const clean = i => { if (!i) return null; const { el, ...r } = i; return r; };
        const eq = {}; for (let k in player.equipment) eq[k] = clean(player.equipment[k]);
        const data = {
            id: 'player1', ...player,
            inventory: player.inventory.map(clean),
            equipment: eq,
            stash: player.stash.map(clean), // 保存仓库
            targetItem: clean(player.targetItem), // 清理targetItem的DOM元素引用
            townPortal: townPortal,
            settings: Settings,
            autoBattleSettings: AutoBattle.settings
        };
        db.transaction(['saveData'], 'readwrite').objectStore('saveData').put(data);
        showNotification("游戏已保存");
    },
    load: function () {
        if (!db) return;
        db.transaction(['saveData']).objectStore('saveData').get('player1').onsuccess = e => {
            if (e.target.result) {
                window.pendingLoadData = e.target.result;
                // 修复：正确显示地狱模式状态
                let f;
                if (e.target.result.floor === 0) {
                    f = "罗格营地";
                } else if (e.target.result.isInHell) {
                    f = `地狱 ${e.target.result.hellFloor || 1}层`;
                } else {
                    f = `地牢 ${e.target.result.floor}层`;
                }
                const statusEl = document.getElementById('save-status');
                statusEl.innerHTML = `发现存档: Lv${e.target.result.lvl} - ${f} <span onclick="confirmResetSave()" style="color: #ff4444; text-decoration: underline; cursor: pointer; margin-left: 10px; font-size: 11px;">清除存档</span>`;

                // Load Settings
                if (e.target.result.settings) {
                    Object.assign(Settings, e.target.result.settings);
                    document.getElementById('chk-bgm').checked = Settings.bgm;
                    document.getElementById('chk-sfx').checked = Settings.sfx;
                }
            }
        };
    },
    reset: function () { if (db) db.transaction(['saveData'], 'readwrite').objectStore('saveData').delete('player1'); location.reload(); }
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
            const explosionDamage = enemy.maxHp * 0.3;
            const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
            if (dist < explosionRadius) {
                const dmg = explosionDamage * (1 - dist / explosionRadius);
                player.hp -= dmg * (1 - player.resistances.fire / 100);
                createDamageNumber(player.x, player.y - 30, Math.floor(dmg), '#ff4400');
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
        { name: '野蛮的', stat: 'str', min: 3, max: 8 },
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
        // 基础属性
        { name: '之熊', stat: 'vit', min: 5, max: 10 },
        { name: '之鹰', stat: 'dex', min: 5, max: 10 },
        { name: '之吸血', stat: 'lifeSteal', min: 3, max: 6 },
        { name: '之急速', stat: 'attackSpeed', min: 5, max: 10 },
        { name: '之力量', stat: 'str', min: 3, max: 6 },
        // 抗性类
        { name: '之抗火', stat: 'fireRes', min: 10, max: 25 },
        { name: '之抗冰', stat: 'coldRes', min: 10, max: 25 },
        { name: '之抗电', stat: 'lightningRes', min: 10, max: 25 },
        { name: '之抗毒', stat: 'poisonRes', min: 10, max: 25 },
        { name: '之守护', stat: 'allRes', min: 5, max: 12 },
        // 特殊效果
        { name: '之再生', stat: 'hpRegen', min: 3, max: 10 },
        { name: '之冥想', stat: 'mpRegen', min: 30, max: 100 },
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
                stats: { ene: 10, mpRegen: 50, allRes: 10 }
            },
            body: {
                name: "塔拉夏的外袍",
                icon: '🛡️',
                type: 'armor',
                def: 120,
                stats: { vit: 10, ene: 15, allRes: 15 }
            },
            amulet: {
                name: "塔拉夏的裁决",
                icon: '📿',
                type: 'amulet',
                stats: { ene: 15, fireDmg: 25, lightningDmg: 25 }
            },
            mainhand: {
                name: "塔拉夏的永恒权杖",
                icon: '⚔️',
                type: 'weapon',
                minDmg: 15,
                maxDmg: 35,
                stats: { ene: 20, fireDmg: 40 }
            },
            belt: {
                name: "塔拉夏的束带",
                icon: '🎗️',
                type: 'belt',
                def: 10,
                stats: { ene: 10, maxMp: 30, fireDmg: 15 }
            },
            gloves: {
                name: "塔拉夏的灵巧",
                icon: '🧤',
                type: 'gloves',
                def: 8,
                stats: { ene: 12, attackSpeed: 20, lightningDmg: 20 }
            }
        },
        bonuses: {
            2: {
                desc: "+50 全抗性",
                stats: { allRes: 50 }
            },
            4: {
                desc: "法力恢复速度 +100%，能量 +20",
                stats: { mpRegen: 100, ene: 20 }
            },
            6: {
                desc: "火焰伤害 +200，法力回复 +50%，暴击率 +10%",
                stats: { fireDmg: 200, mpRegen: 50, critChance: 10 }
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
                stats: { str: 10, vit: 10 }
            },
            body: {
                name: "不朽之王的灵魂牢笼",
                icon: '🛡️',
                type: 'armor',
                def: 200,
                stats: { str: 15, vit: 20, def: 50 }
            },
            boots: {
                name: "不朽之王的践踏",
                icon: '👢',
                type: 'boots',
                def: 15,
                stats: { str: 10, vit: 10 }
            },
            mainhand: {
                name: "不朽之王的石碎器",
                icon: '🪓',
                type: 'weapon',
                minDmg: 30,
                maxDmg: 60,
                stats: { str: 25, dmgPct: 50 }
            },
            belt: {
                name: "不朽之王的细节",
                icon: '🥋',
                type: 'belt',
                def: 18,
                stats: { str: 12, vit: 15, def: 25 }
            },
            gloves: {
                name: "不朽之王的钢铁之握",
                icon: '🧤',
                type: 'gloves',
                def: 12,
                stats: { str: 15, attackSpeed: 15, dmgPct: 30 }
            }
        },
        bonuses: {
            2: {
                desc: "+100 最大生命",
                stats: { vit: 20 }
            },
            4: {
                desc: "生命偷取 +10%，攻击速度 +30%",
                stats: { lifeSteal: 10, attackSpeed: 30 }
            },
            6: {
                desc: "物理伤害 +300%，防御 +150，力量 +30",
                stats: { dmgPct: 300, def: 150, str: 30 }
            }
        }
    },

    'shadow_dancer': {
        name: "暗影舞者",
        description: "刺客专属套装，强化敏捷和暴击",
        pieces: {
            helm: {
                name: "暗影舞者的面罩",
                icon: '🪖',
                type: 'helm',
                def: 12,
                stats: { dex: 15, attackSpeed: 10 }
            },
            body: {
                name: "暗影舞者的披风",
                icon: '🛡️',
                type: 'armor',
                def: 80,
                stats: { dex: 20, attackSpeed: 15 }
            },
            gloves: {
                name: "暗影舞者的利爪",
                icon: '🧤',
                type: 'gloves',
                def: 8,
                stats: { dex: 15, attackSpeed: 20 }
            },
            boots: {
                name: "暗影舞者的迅捷",
                icon: '👢',
                type: 'boots',
                def: 10,
                stats: { dex: 15, attackSpeed: 15 }
            },
            belt: {
                name: "暗影舞者的束缚",
                icon: '🎗️',
                type: 'belt',
                def: 9,
                stats: { dex: 12, attackSpeed: 12, critDamage: 20 }
            },
            amulet: {
                name: "暗影舞者的徽记",
                icon: '📿',
                type: 'amulet',
                stats: { dex: 18, critDamage: 30, dmgPct: 25 }
            }
        },
        bonuses: {
            2: {
                desc: "攻击速度 +30%",
                stats: { attackSpeed: 30 }
            },
            4: {
                desc: "暴击伤害 +75%，敏捷 +20",
                stats: { critDamage: 75, dex: 20 }
            },
            6: {
                desc: "敏捷 +40，伤害 +150%，暴击率 +15%",
                stats: { dex: 40, dmgPct: 150, critChance: 15 }
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
    }
    else {
        addItemToInventory(createItem('短剑', 0)); addItemToInventory(createItem('治疗药剂', 0)); addItemToInventory(createItem('回城卷轴', 0));
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
    gameActive = true; gameLoop(0); spawnEnemyTimer();
}

// Revised enterFloor with spawn point logic
function enterFloor(f, spawnAt = 'start') {
    // 根据是否在地狱中更新不同的层数
    if (player.isInHell) {
        player.hellFloor = f;
    } else {
        player.floor = f;
    }
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

        document.getElementById('floor-display').innerText = "罗格营地";
        generateTown();
        npcs.push({ x: dungeonEntrance.x - 100, y: dungeonEntrance.y - 100, name: "基格", type: "merchant", radius: 20, frameIndex: 1 });
        npcs.push({ x: dungeonEntrance.x + 100, y: dungeonEntrance.y - 50, name: "阿卡拉", type: "healer", radius: 20, quest: 'q1', frameIndex: 2 });
        npcs.push({ x: dungeonEntrance.x, y: dungeonEntrance.y + 100, name: "瓦瑞夫", type: "stash", radius: 20, frameIndex: 0 });

        // 始终添加地狱守卫，但交互需要条件
        npcs.push({ x: dungeonEntrance.x - 150, y: dungeonEntrance.y + 50, name: "地狱守卫", type: "difficulty", radius: 20, frameIndex: 3 });

        // 洗点师 - 神秘贤者
        // frameIndex: 1 = 临时使用阿卡拉图像（当前）
        // frameIndex: 4 = 使用自定义图像（添加sprites.png后改为4）
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

            // 在地狱中，生成更强大的怪物
            let baseHp = 30 + Math.floor(f * f * 5);
            let baseDmg = 5 + f * 2;
            let baseSpeed = 80;
            let baseXp = 20 + f * 5;

            if (isInHell) {
                // 在地狱中，怪物基础属性也更强
                baseHp = 60 + Math.floor(f * f * 10);
                baseDmg = 10 + f * 4;
                baseSpeed = 100;
                baseXp = 40 + f * 10;
            }

            // 应用难度系数
            let hp = Math.floor(baseHp * difficulty.monsterHpMult);
            let dmg = Math.floor(baseDmg * difficulty.monsterDmgMult);
            let speed = Math.floor(baseSpeed * difficulty.monsterSpeedMult);
            let xpValue = Math.floor(baseXp * difficulty.xpMult);

            enemies.push({
                x, y, hp, maxHp: hp, dmg, speed, radius: 12,
                dead: false, cooldown: 0, name: isInHell ? "地狱沉沦魔" : "沉沦魔",
                rarity: Math.random() < 0.1 ? 1 : 0, xpValue: xpValue,
                frameIndex: MONSTER_FRAMES.melee
            });
        }
        // 无限层级BOSS生成逻辑
        const bossData = getBossSpawnInfo(f);
        if (bossData) {
            const currentQ = QUEST_DB[player.questIndex];
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

            enemies.push({
                x, y, hp, maxHp: hp, dmg, speed, radius: 30,
                dead: false, cooldown: 0, name: bossData.name,
                isBoss: true,
                isQuestTarget: isQuestTarget, // 标记是否为任务目标
                xpValue: xpValue,
                ai: 'chase',
                frameIndex: getBossFrameIndex(bossData.originalName),
                // 赋予一些精英词缀
                eliteAffixes: isInHell || f > 10 ? [ELITE_AFFIXES[Math.floor(Math.random() * ELITE_AFFIXES.length)]] : []
            });

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
    autoSaveTimer += dt; if (autoSaveTimer > 30) { SaveSystem.save(); autoSaveTimer = 0; }
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    mouse.worldX = mouse.x + camera.x; mouse.worldY = mouse.y + camera.y;
    if (player.hp < player.maxHp) player.hp += 0.5 * dt; if (player.mp < player.maxMp) player.mp += 1.5 * dt;
    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    if (player.attackAnim > 0) player.attackAnim -= dt * 5;
    for (let k in player.skillCooldowns) if (player.skillCooldowns[k] > 0) player.skillCooldowns[k] -= dt;

    // 定期清理死亡敌人（每10秒）
    cleanupTimer += dt;
    if (cleanupTimer > 10) {
        cleanupTimer = 0;
        enemies = enemies.filter(e => !e.dead);

        // 清理过期地面物品
        const now = Date.now();
        const oldCount = groundItems.length;
        groundItems = groundItems.filter(item => {
            if (!item.dropTime) return true; // 没有时间戳的物品保留（兼容旧存档）
            const age = now - item.dropTime;
            // 暗金(4)、套装(5)、金币 永不消失
            if (item.rarity >= 4 || item.isSet || item.type === 'gold') return true;
            // 黄装(3) 5分钟后消失
            if (item.rarity === 3) return age < 5 * 60 * 1000;
            // 白/蓝装及其他 2分钟后消失
            return age < 2 * 60 * 1000;
        });
        if (groundItems.length < oldCount) {
            updateWorldLabels(); // 有物品被清理时更新标签
        }
    }

    // 处理冰冻状态
    if (player.frozenTimer > 0) {
        player.frozenTimer -= dt;
        if (player.frozenTimer <= 0) {
            player.frozen = false;
            player.freezeImmuneTimer = 3.0; // 冰冻结束后3秒免疫
        }
    }
    // 处理冰冻免疫时间
    if (player.freezeImmuneTimer > 0) {
        player.freezeImmuneTimer -= dt;
    }

    // 自动战斗系统（营地不执行，面板打开时暂停）
    if (AutoBattle.enabled && !player.frozen && player.floor !== 0 && !isAnyPanelOpen()) {
        AutoBattle.decideAction(dt);
    }

    interactionTarget = null;
    const distExit = Math.hypot(player.x - dungeonExit.x, player.y - dungeonExit.y);
    if (distExit < 60) {
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
            const label = player.floor === 0 ? `传送至地牢 ${townPortal.returnFloor}层` : '回到罗格营地';
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
                player.gold += item.val;
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
        if (npc && Math.hypot(npc.x - player.x, npc.y - player.y) < 60) {
            player.targetX = null; interactNPC(npc);
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
            const speedMultiplier = player.frozen ? 0.3 : 1.0;  // 冰冻时速度降至30%
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
                        player.gold += item.val;
                        createDamageNumber(player.x, player.y - 40, "+" + item.val + "G", 'gold');
                        AudioSys.play('gold');
                    } else {
                        // 拾取物品到背包
                        if (!addItemToInventory(item)) {
                            createFloatingText(player.x, player.y - 40, "背包已满！", '#ff4444', 1.5);
                            player.targetItem = null;
                            return; // 不要移除地面物品
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
            if (Math.hypot(p.x - player.x, p.y - player.y) < player.radius + 10) {
                player.hp -= Math.max(0, p.damage - player.armor * 0.1);
                p.life = 0;
                createDamageNumber(player.x, player.y - 20, Math.floor(p.damage), '#ff0000');
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

    particles.forEach((p, i) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) particles.splice(i, 1) });
    damageNumbers.forEach((d, i) => { d.life -= dt; d.y -= 20 * dt; if (d.life <= 0) damageNumbers.splice(i, 1); });
    slashEffects.forEach((s, i) => { s.life -= dt * 5; if (s.life <= 0) slashEffects.splice(i, 1); });

    // 定期清理死亡的怪物，防止数组无限增长
    enemies = enemies.filter(e => !e.dead || (e.dead && Math.hypot(e.x - player.x, e.y - player.y) < 500));

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
                const body = enemies.find(other => other.dead && Math.hypot(other.x - e.x, other.y - e.y) < 200);
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

                    createDamageNumber(body.x, body.y - 20, "复活!", '#ff00ff');
                    e.cooldown = 5.0;
                    return;
                }
            }
            if (dist < 300 && dist > 100) {
                const nx = e.x + ((player.x - e.x) / dist) * e.speed * dt, ny = e.y + ((player.y - e.y) / dist) * e.speed * dt;
                if (!isWall(nx, e.y)) e.x = nx; if (!isWall(e.x, ny)) e.y = ny;
            }
        } else {
            if (dist < 400 && dist > 35) {
                const nx = e.x + ((player.x - e.x) / dist) * e.speed * dt, ny = e.y + ((player.y - e.y) / dist) * e.speed * dt;
                if (!isWall(nx, e.y)) e.x = nx; if (!isWall(e.x, ny)) e.y = ny;
            }
            if (dist <= 40 && e.cooldown <= 0) {
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

                player.hp -= totalDmg;
                e.cooldown = 1.5;
                createDamageNumber(player.x, player.y - 20, Math.floor(totalDmg), '#ff0000');
                AudioSys.play('hit');

                // 自动战斗：记录攻击者，立即反击
                AutoBattle.onPlayerDamaged(e);

                // 应用精英词缀的攻击效果
                if (e.eliteAffixes && e.eliteAffixes.length > 0) {
                    // 吸血：恢复生命
                    if (e.lifeSteal) {
                        const heal = Math.floor(totalDmg * e.lifeSteal);
                        e.hp = Math.min(e.maxHp, e.hp + heal);
                        createDamageNumber(e.x, e.y - 30, "+" + heal, COLORS.green);
                    }

                    // 冰冻：减速玩家（免疫期内无效）
                    if (e.freezeOnHit && !(player.freezeImmuneTimer > 0)) {
                        player.frozen = true;
                        player.frozenTimer = 2.0;  // 冰冻2秒
                        createDamageNumber(player.x, player.y - 40, "冰冻!", COLORS.ice);
                    }

                    // 法力燃烧：消耗玩家法力
                    if (e.manaBurn) {
                        const manaBurned = Math.floor(Math.min(player.mp, totalDmg * 0.5));
                        player.mp -= manaBurned;
                        if (manaBurned > 0) {
                            createDamageNumber(player.x, player.y - 50, "-" + manaBurned + " MP", '#0066ff');
                        }
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
    ctx.save(); ctx.translate(-camera.x, -camera.y);

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
                        ctx.fillStyle = 'rgba(0,0,0,0.5)';
                        ctx.fillRect(x, y + TILE_SIZE - 6, TILE_SIZE, 6);
                    } else {
                        ctx.fillStyle = COLORS.wall;
                        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        ctx.fillStyle = '#111';
                        ctx.fillRect(x, y + TILE_SIZE - 10, TILE_SIZE, 10);
                    }
                }
                else { ctx.fillStyle = ((c + r) % 2 === 0) ? '#151515' : '#1a1a1a'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); }
            }
        }
    }

    // Render Exits
    if (player.floor === 0 && !player.isInHell) {
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
        ctx.fillStyle = '#4d94ff'; ctx.beginPath(); ctx.arc(townPortal.x, townPortal.y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.stroke();
        let label = player.floor === 0 ? `传送门 (去往 ${townPortal.returnFloor}层)` : "传送门 (回罗格营地)";
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, townPortal.x, townPortal.y - 20);
    }

    groundItems.forEach(i => {
        // 物品过滤：默认只显示蓝色以上（rarity >= 2），按住Alt显示所有
        // 金币、药水、卷轴始终显示
        const isConsumable = i.type === 'gold' || i.type === 'potion' || i.type === 'scroll';
        if (!isAltPressed && !isConsumable && i.rarity < 2) {
            return; // 跳过低品质物品的渲染
        }

        if (itemSpritesLoaded) {
            const coords = getItemSpriteCoords(i);
            const size = 32; // draw size
            const spriteSize = itemSpriteSheet.width / 4;

            // Draw Item Sprite
            ctx.drawImage(itemSpriteSheet,
                coords.col * spriteSize, coords.row * spriteSize, spriteSize, spriteSize,
                i.x - size / 2, i.y - size / 2, size, size
            );

            // Rarity Name
            if (isAltPressed || i.rarity >= 3) {
                ctx.fillStyle = getItemColor(i.rarity); ctx.textAlign = 'center';
                ctx.font = '12px Cinzel';
                ctx.fillText(i.displayName || i.name, i.x, i.y - 20);
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
            ctx.fillStyle = '#00ff00'; ctx.beginPath(); ctx.arc(n.x, n.y, 15, 0, Math.PI * 2); ctx.fill();
        }

        // Quest Indicators (above name)
        if (n.type === 'healer') {
            if (player.questState === 0 && player.questIndex < QUEST_DB.length) {
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

        if (spritesLoaded && processedSpriteSheet && e.frameIndex !== undefined) {
            const frame = getMonsterFrame(e.frameIndex);
            const renderHeight = 44;
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
        ctx.fillText(e.name, e.x, e.y - e.radius - 35);

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

    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 200, canvas.width / 2, canvas.height / 2, canvas.width / 1.2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    updateLabelsPosition();
    drawMinimap();
}

function updateLabelsPosition() {
    groundItems.forEach(i => {
        if (i.el) {
            const sx = i.x - camera.x, sy = i.y - camera.y;
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
    } else if (npc.type === 'healer') {
        const currentQ = QUEST_DB[player.questIndex];

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
                                player.gold += 1000;
                            } else {
                                player.gold += 500;
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
            const quest = QUEST_DB[i];
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

    QUEST_DB.forEach((q, idx) => {
        if (idx > player.questIndex) return;

        const d = document.createElement('div');
        d.className = 'quest-item';

        let statusText = "未开始";
        let colorClass = "";

        if (idx < player.questIndex) {
            statusText = "已完成"; colorClass = "completed";
        } else {
            if (player.questState === 0) statusText = "待接受";
            else if (player.questState === 1) {
                statusText = "进行中";
                if (q.type === 'kill_count') statusText += ` (${player.questProgress}/${q.target})`;
            }
            else if (player.questState === 2) { statusText = "可交付"; colorClass = "completed"; }
        }

        d.innerHTML = `<div class="quest-title">${q.title} <span class="quest-status ${colorClass}">(${statusText})</span></div><div style="font-size:12px; color:#aaa;">${q.desc}</div><div style="font-size:12px; color:#gold;">奖励: ${q.reward}</div>`;
        list.appendChild(d);
    });
}

function updateQuestTracker() {
    const el = document.getElementById('quest-tracker');
    el.innerHTML = '';

    const currentQ = QUEST_DB[player.questIndex];
    if (!currentQ || player.questState === 0) return;

    let text = "";
    let titleColor = "#c7b377";

    if (player.questState === 2) {
        text = "回去找阿卡拉";
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
        if (!gameActive || aliveEnemies > 20 || (player.floor === 0 && !player.isInHell)) return;

        let x, y, v = false; while (!v) { x = Math.random() * MAP_WIDTH * TILE_SIZE; y = Math.random() * MAP_HEIGHT * TILE_SIZE; if (!isWall(x, y)) v = true; }
        if (Math.hypot(x - player.x, y - player.y) < 300) return;

        const f = player.floor;
        const hp = 30 + Math.floor(f * f * 5);
        const dmg = 5 + f * 2;
        const xp = 20 + f * 5;

        const rand = Math.random();
        let type = 'melee';
        let name = '沉沦魔';
        let ai = 'chase';
        let speed = 80;

        if (f >= 2 && rand < 0.3) { type = 'ranged'; name = '骷髅弓箭手'; ai = 'ranged'; speed = 70; }
        if (f >= 3 && rand < 0.1) { type = 'shaman'; name = '沉沦魔巫师'; ai = 'revive'; speed = 60; }

        let frameIndex = MONSTER_FRAMES[type];
        const isElite = Math.random() < 0.1;
        let eliteAffixes = [];

        if (isElite || type === 'elite' || type === 'boss') {
            frameIndex = MONSTER_FRAMES.elite;
            name = isElite ? `精英${name}` : name;

            // 为精英怪添加随机词缀（1-2个）
            if (isElite) {
                const affixCount = Math.random() < 0.3 ? 2 : 1;  // 30%概率获得2个词缀
                const availableAffixes = [...ELITE_AFFIXES];

                for (let i = 0; i < affixCount; i++) {
                    const idx = Math.floor(Math.random() * availableAffixes.length);
                    const affix = availableAffixes.splice(idx, 1)[0];
                    eliteAffixes.push(affix);
                }
            }
        }

        const enemy = {
            x, y, hp, maxHp: hp, dmg, speed, radius: 12,
            dead: false, cooldown: 0, name, rarity: isElite ? 1 : 0, xpValue: xp,
            ai: ai, frameIndex: frameIndex,
            eliteAffixes: eliteAffixes  // 精英词缀列表
        };

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
    }, 2000);
}

function takeDamage(e, dmg, isSkillDamage = false) {
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
        }

        const xpGain = e.xpValue || 15; player.xp += xpGain; createDamageNumber(player.x, player.y - 50, "+" + xpGain + " XP", '#4d69cd');
        dropLoot(e);
        checkLevelUp();

        // QUEST LOGIC
        const currentQ = QUEST_DB[player.questIndex];
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
                    // 设置该层 Boss 刷新计时（默认 5 分钟）
                    const cooldown = 5 * 60 * 1000;
                    player.bossRespawn[player.floor] = Date.now() + cooldown;
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
    if (item.rarity === 4) { item.displayName = "暗金·" + item.name; item.stats.allSkills = 1; item.stats.str = 10; item.stats.lifeSteal = 5; }

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
function checkPlayerDeath() {
    if (player.hp <= 0) {
        // 标记玩家曾经死亡
        player.died = true;
        createFloatingText(player.x, player.y - 50, "你死了！灵魂回到了罗格营地", '#ff4444', 3);
        player.hp = player.maxHp;
        player.gold = Math.floor(player.gold / 2);

        // 关闭自动战斗
        if (AutoBattle.enabled) {
            AutoBattle.enabled = false;
            document.getElementById('auto-battle-btn').classList.remove('active');
            document.getElementById('auto-battle-icon').textContent = '🛡️';
        }

        // 重置地狱状态（死亡后回到普通世界）
        const wasInHell = player.isInHell;
        player.isInHell = false;

        // 延迟1秒后传送回营地，让玩家看到死亡提示
        setTimeout(() => {
            enterFloor(0);
            if (wasInHell) {
                showNotification('已从地狱返回');
            }
        }, 1000);
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
    // 修复：地狱模式下使用hellFloor而不是floor
    const f = player.isInHell ? player.hellFloor : player.floor;

    // 基础金币掉落
    let goldAmount = Math.floor(Math.random() * 50) + 10;
    if (monster.isBoss || monster.isQuestTarget) {
        goldAmount *= 3; // BOSS掉落3倍金币
    } else if (monster.rarity > 0) {
        goldAmount *= 1.5; // 精英怪掉落1.5倍金币
    }
    groundItems.push({
        type: 'gold',
        val: goldAmount,
        x: x + Math.random() * 20 - 10,
        y: y + Math.random() * 20 - 10,
        rarity: 0,
        name: goldAmount + " 金币",
        icon: '💰',
        dropTime: Date.now()
    });

    // 物品掉落
    let dropChance = 0.4; // 基础掉落概率
    let dropCount = 1; // 基础掉落数量

    if (monster.isBoss || monster.isQuestTarget) {
        dropChance = 1.0; // BOSS必定掉落
        dropCount = 2 + Math.floor(f / 3); // BOSS至少掉落2件，每3层加1件
    } else if (monster.rarity > 0) {
        dropChance = 0.7; // 精英怪高概率掉落
    }

    for (let i = 0; i < dropCount; i++) {
        if (Math.random() < dropChance) {
            let item;

            // 套装物品掉落机制
            if (monster.isBoss || monster.isQuestTarget) {
                // BOSS有15%概率掉落套装物品
                const setDropChance = f >= 5 ? 0.15 : 0.08;  // 5层以后提高套装掉落率
                if (Math.random() < setDropChance) {
                    item = generateRandomSetItem(f);
                    if (item) {
                        console.log(`BOSS dropped SET item: ${item.displayName}`);
                    }
                }
            } else if (monster.rarity > 0) {
                // 精英怪有5%概率掉落套装物品
                if (Math.random() < 0.05) {
                    item = generateRandomSetItem(f);
                    if (item) {
                        console.log(`Elite dropped SET item: ${item.displayName}`);
                    }
                }
            }

            // 如果没有掉落套装物品，则掉落普通物品
            if (!item) {
                item = createItem(null, f);

                // BOSS掉落更高品质
                if (monster.isBoss || monster.isQuestTarget) {
                    // 重新roll一次稀有度，提高稀有度概率
                    const qualityRoll = Math.random();
                    if (qualityRoll < 0.4) item.rarity = 3; // 40%概率稀有
                    else if (qualityRoll < 0.7) item.rarity = 2; // 30%概率魔法
                }
            }

            item.x = x + Math.random() * 30 - 15 + i * 20; // 分散掉落位置
            item.y = y + Math.random() * 30 - 15;
            item.dropTime = Date.now();
            groundItems.push(item);
        }
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
                    player.gold += i.val;
                    createDamageNumber(player.x, player.y - 40, "+" + i.val + "G", 'gold');
                    AudioSys.play('gold');
                } else {
                    // 拾取物品到背包
                    if (!addItemToInventory(i)) {
                        createFloatingText(player.x, player.y - 40, "背包已满！", '#ff4444', 1.5);
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
    // r=0:普通白, r=1:白色, r=2:蓝色, r=3:黄色稀有, r=4:暗金, r=5:套装绿色
    return r === 0 ? COLORS.white : r === 1 ? COLORS.white : r === 2 ? COLORS.blue : r === 3 ? COLORS.yellow : r === 5 ? COLORS.setGreen : COLORS.gold;
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
    if (player.floor > 0 && !hasLineOfSight(player.x, player.y, t.x, t.y)) {
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
    if (player.floor === 0 && !player.isInHell) return;

    // 检查是否选择了未学习的技能
    if (!player.skills[skillName] || player.skills[skillName] <= 0) {
        const typeNames = { fireball: '火球术', thunder: '雷电术', multishot: '多重射击' };
        showNotification(`技能未学习：${typeNames[skillName] || skillName}`);
        return;
    }

    if (skillName === 'fireball') {
        if (player.mp < 10) {
            createFloatingText(player.x, player.y - 40, '法力不足！(需要 10 法力)', '#4d94ff', 1.5);
            return;
        }
        if (player.skillCooldowns.fireball > 0) return;
        player.mp -= 10; player.skillCooldowns.fireball = 0.5;
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
        const cost = 15 + (player.skills.thunder - 1) * 2;
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
        if (player.mp < 10) {
            createFloatingText(player.x, player.y - 40, '法力不足！(需要 10 法力)', '#4d94ff', 1.5);
            return;
        }
        if (player.skillCooldowns.multishot > 0) return;
        player.mp -= 10; player.skillCooldowns.multishot = 1;
        const base = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
        const cnt = 2 + player.skills.multishot;
        for (let i = 0; i < cnt; i++) {
            const a = base - 0.3 + (0.6 / (cnt - 1)) * i;
            projectiles.push({ x: player.x, y: player.y, angle: a, speed: 500, life: 1, damage: player.damage[0] * 0.8, color: '#ffff00', owner: player });
        }
        AudioSys.play('attack');
    }
}

function spawnBoss(x, y) { enemies.push({ x, y, hp: 500, maxHp: 500, dmg: 20, speed: 100, isBoss: true, radius: 30, dead: false, cooldown: 0, xpValue: 5000, name: "屠夫" }); }

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
            s.onclick = (e) => {
                e.stopPropagation();
                // 如果仓库面板打开，点击物品存入仓库
                const stashPanel = document.getElementById('stash-panel');
                if (stashPanel.style.display === 'block') {
                    moveItemToStash(idx);
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
    ['mainhand', 'offhand', 'body', 'ring'].forEach(sn => {
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
            el.appendChild(ic); el.onmouseenter = (e) => showTooltip(i, e); el.onmouseleave = hideTooltip;
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
            el.appendChild(ic); el.onmouseenter = (e) => showTooltip(i, e); el.onmouseleave = hideTooltip;
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
        player.gold += val;

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
        if (item.heal) player.hp = Math.min(player.maxHp, player.hp + item.heal);
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
    if (type === 'health') targetName = '治疗药剂';
    if (type === 'mana') targetName = '法力药剂';
    if (type === 'scroll') targetName = '回城卷轴';

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
        if (Math.random() < 0.3) rarity = 3; if (Math.random() < 0.05) rarity = 4;

        let baseName = type === 'weapon' ? '短剑' : (type === 'armor' ? '布甲' : '铜戒指');
        if (type === 'weapon' && Math.random() > 0.5) baseName = '巨斧';
        if (type === 'armor' && Math.random() > 0.5) baseName = '皮甲';
        if (type === 'helm') baseName = '皮帽'; if (type === 'gloves') baseName = '皮手套';
        if (type === 'boots') baseName = '皮靴'; if (type === 'belt') baseName = '轻扣带'; if (type === 'amulet') baseName = '护身符';

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
        if (rarity === 4) { item.displayName = "暗金·" + item.name; item.stats = { allSkills: 1, str: 10, lifeSteal: 5 }; }

        if (!addItemToInventory(item)) {
            player.gold += cost; // 返还金币
            createFloatingText(player.x, player.y - 40, "背包已满！", '#ff4444', 1.5);
        } else {
            createDamageNumber(player.x, player.y - 40, `-${cost}G`, 'gold');
            showNotification(`花费 ${cost} G`);
            AudioSys.play('gold');
        }
    } else {
        showNotification("金币不足");
    }
}

function buyItem(type) {
    let cost = 0;
    let itemName = "";
    if (type === 'health') { cost = 50; itemName = '治疗药剂'; }
    else if (type === 'mana') { cost = 50; itemName = '法力药剂'; }
    else if (type === 'scroll') { cost = 100; itemName = '回城卷轴'; }

    if (player.gold >= cost) {
        const item = createItem(itemName, 0);
        if (addItemToInventory(item)) {
            player.gold -= cost;
            createDamageNumber(player.x, player.y - 40, `-${cost}G`, 'gold');
            showNotification(`花费 ${cost} G - 购买 ${itemName}`);
            renderInventory();
        } else {
            createFloatingText(player.x, player.y - 40, "背包已满！", '#ff4444', 1.5);
        }
    } else {
        showNotification("金币不足");
    }
}

function unequipItem(s) {
    const i = player.equipment[s]; if (!i) return;
    if (addItemToInventory(i)) { player.equipment[s] = null; updateStats(); renderInventory(); updateStatsUI(); hideTooltip(); }
}

function dropItemFromInventory(idx) {
    const item = player.inventory[idx];
    if (!item) return;

    // 检查是否在罗格营地（地狱中可以丢弃）
    if (player.floor === 0 && !player.isInHell) {
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
    let str = player.str, dex = player.dex, vit = player.vit, ene = player.ene;
    // Fixed: Stats scaling fix (Str 5%, Dex 1 Armor + 0.5% Crit)
    let baseDmg = 2, armor = 0, ls = 0, ias = 0;

    // 重置抗性和元素伤害
    player.resistances = { fire: 0, cold: 0, lightning: 0, poison: 0 };
    player.elementalDamage = { fire: 0, cold: 0, lightning: 0, poison: 0 };

    // 初始化新属性
    let hpRegen = 0, mpRegen = 0, blockChance = 0, reflectDamage = 0;
    let damageReduction = 0, critDamage = 0, allRes = 0, bonusCritChance = 0;

    Object.values(player.equipment).forEach(i => {
        if (!i) return;
        if (i.stats) {
            str += (i.stats.str || 0);
            vit += (i.stats.vit || 0);
            dex += (i.stats.dex || 0);
            ls += (i.stats.lifeSteal || 0);
            ias += (i.stats.attackSpeed || 0);

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
        }
        if (i.minDmg) baseDmg = i.minDmg;
        if (i.def) armor += i.def;
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

    // New Formula
    player.damage = [
        Math.floor((baseDmg + Math.floor(str / 5)) * (1 + str * 0.05)),
        Math.floor((baseDmg + 3 + Math.floor(str / 5)) * (1 + str * 0.05))
    ];
    player.maxHp = vit * 5;
    player.maxMp = ene * 3;
    player.armor = armor + dex; // 1 Dex = 1 Armor
    player.lifeSteal = ls;
    player.attackSpeed = ias;
    player.critChance = Math.min(100, 5 + dex * 0.5); // 5% Base + 0.5% per Dex

    // 保存新属性到player对象（供后续使用）
    player.hpRegen = hpRegen;
    player.mpRegen = mpRegen;
    player.blockChance = blockChance;
    player.reflectDamage = reflectDamage;
    player.damageReduction = damageReduction;
    player.critDamage = critDamage;

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

                // 应用套装加成的属性
                str += (bonusStats.str || 0);
                vit += (bonusStats.vit || 0);
                dex += (bonusStats.dex || 0);
                ene += (bonusStats.ene || 0);
                ls += (bonusStats.lifeSteal || 0);
                ias += (bonusStats.attackSpeed || 0);
                armor += (bonusStats.def || 0);

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

                // 百分比加成（需要重新计算）
                if (bonusStats.dmgPct) {
                    baseDmg = Math.floor(baseDmg * (1 + bonusStats.dmgPct / 100));
                }
            }
        }
    }

    // 重新应用属性上限（因为套装加成可能改变了抗性）
    player.resistances.fire = Math.max(-100, Math.min(75, player.resistances.fire));
    player.resistances.cold = Math.max(-100, Math.min(75, player.resistances.cold));
    player.resistances.lightning = Math.max(-100, Math.min(75, player.resistances.lightning));
    player.resistances.poison = Math.max(-100, Math.min(75, player.resistances.poison));

    // 重新计算最终属性（包含套装加成）
    player.damage = [
        Math.floor((baseDmg + Math.floor(str / 5)) * (1 + str * 0.05)),
        Math.floor((baseDmg + 3 + Math.floor(str / 5)) * (1 + str * 0.05))
    ];
    player.maxHp = vit * 5;
    player.maxMp = ene * 3;
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
        if (hpPercent < 0.2 && player.hp > 0) {
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
    const thunderCost = 15 + Math.max(0, player.skills.thunder - 1) * 2;
    const thunderCostEl = document.getElementById('cost-thunder');
    if (thunderCostEl) thunderCostEl.innerText = `法力: ${thunderCost}`;
}

function checkLevelUp() {
    while (player.xp >= player.xpNext) {
        player.lvl++;

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
            'stash': () => { }
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
    if (e.button === 0) mouse.leftDown = true;
    if (e.button === 2) { mouse.rightDown = true; castSkill(player.activeSkill); }
});
window.addEventListener('mouseup', e => { if (e.button === 0) mouse.leftDown = false; });
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
    if (e.key === 'i' || e.key === 'I' || e.key === 'b' || e.key === 'B') togglePanel('inventory');
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
                    // 在地狱中，进入下一层
                    if (player.hellFloor < 10) {
                        enterFloor(player.hellFloor + 1, 'start');
                    }
                } else {
                    // 普通地牢，正常进入下一层
                    enterFloor(player.floor + 1, 'start');
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
                    // 从罗格营地返回地牢时，验证传送门位置
                    if (townPortal) {
                        const safeDungeonPos = validateAndFixDungeonPortalPosition(townPortal.x, townPortal.y);
                        townPortal.x = safeDungeonPos.x;
                        townPortal.y = safeDungeonPos.y;
                    }
                    enterFloor(townPortal.returnFloor, 'portal');
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
            else if (k === 'def') label = "防御";
            else if (k === 'lifeSteal') label = "%吸血";
            else if (k === 'attackSpeed') label = "%攻速";
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
    if (!AutoBattle.enabled && player.floor === 0) {
        showNotification('自动战斗仅在地牢中生效');
        return;
    }

    AutoBattle.enabled = !AutoBattle.enabled;

    if (AutoBattle.enabled) {
        btn.classList.add('active');
        icon.textContent = '⚔️';
        showNotification('自动战斗已开启');
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

initDragging();
init();
