// 面板管理系统
const panelManager = {
    panels: {
        'stats': { id: 'stats-panel', group: 'left', top: 10, baseTop: 10, opened: false, zIndex: 0 },
        'achievements': { id: 'achievements-panel', group: 'left', top: 10, baseTop: 10, opened: false, zIndex: 0 },
        'quest': { id: 'quest-panel', group: 'left', top: 15, baseTop: 15, opened: false, zIndex: 0 },
        'inventory': { id: 'inventory-panel', group: 'right', top: 10, baseTop: 10, opened: false, zIndex: 0 },
        'stash': { id: 'stash-panel', group: 'right', top: 15, baseTop: 15, opened: false, zIndex: 0 },
        'skills': { id: 'skills-panel', group: 'center', top: 15, baseTop: 15, opened: false, zIndex: 0, left: 340 },
        'shop': { id: 'shop-panel', group: 'center', top: 10, baseTop: 10, opened: false, zIndex: 0 }
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
    exit: '#0055aa', entrance: '#aa5500'
};

let gameActive = false;
let lastTime = 0;
let particles = [];
let damageNumbers = [];
let enemies = [];
let groundItems = [];
let projectiles = [];
let npcs = [];
let autoSaveTimer = 0;
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
    'melee': 0,
    'ranged': 1,
    'shaman': 2,
    'elite': 3,
    'boss': 3
};

// 每层对应的 Boss 信息（名称与基础血量）
// 示例：第5层屠夫，第10层巴尔
const floorBossMap = {
    5: { name: '屠夫', hp: 2000 },
    10: { name: '巴尔', hp: 5000 }
};

const player = {
    x: 0, y: 0, radius: 12, color: '#eee', speed: 180, direction: 'front',
    lvl: 1, xp: 0, xpNext: 100, points: 0, skillPoints: 1,
    str: 15, dex: 15, vit: 20, ene: 10,
    floor: 0,
    hp: 100, maxHp: 100, mp: 50, maxMp: 50, damage: [2, 4], armor: 5, gold: 0,
    lifeSteal: 0, attackSpeed: 0, critChance: 0,
    resistances: { fire: 0, cold: 0, lightning: 0, poison: 0 },  // 抗性系统
    elementalDamage: { fire: 0, cold: 0, lightning: 0, poison: 0 },  // 元素伤害
    skills: { fireball: 1, frostnova: 0, multishot: 0 }, activeSkill: 'fireball',
    targetX: null, targetY: null, targetItem: null, attacking: false, attackCooldown: 0,
    skillCooldowns: { fireball: 0, frostnova: 0, multishot: 0 },
    equipment: {
        mainhand: null, offhand: null, body: null, ring: null,
        helm: null, gloves: null, boots: null, belt: null, amulet: null
    },
    // 记录每层 Boss 的下次刷新时间戳（毫秒）
    bossRespawn: {},
    // 是否已经首次击败巴尔（用于成就计数）
    firstKillBaal: false,
    inventory: Array(30).fill(null),
    stash: Array(36).fill(null), // 仓库，36个格子
    questIndex: 0, questState: 0, questProgress: 0,
    portalTimer: 0,
    died: false,
    achievements: {},
    // 难度系统
    difficulty: 'normal',  // normal/hell (已废弃，改为isInHell)
    defeatedBaal: false,  // 是否击败巴尔
    unlockedHell: false,  // 是否解锁地狱模式
    isInHell: false,      // 当前是否在地狱中
    hellFloor: 1          // 地狱层数（独立于地牢层数）
};

const spriteSheet = new Image();
spriteSheet.src = 'sprites.png';

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

        if (r > 240 && g > 240 && b > 240) {
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
        id: 'all_unique_equipment',
        name: '暗金收藏家',
        description: '收集全套暗金装备',
        target: 1,
        type: 'collect_unique_set'
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

            case 'collect_unique_set':
                checkAllUniqueEquipment();
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

function checkAllUniqueEquipment() {
    const uniqueItems = [];
    Object.values(player.equipment).forEach(item => {
        if (item && item.unique) uniqueItems.push(item);
    });

    const ach = ACHIEVEMENTS.find(a => a.id === 'all_unique_equipment');
    if (!ach || !player.achievements['all_unique_equipment']) return;

    if (uniqueItems.length >= 8 && !player.achievements['all_unique_equipment'].completed) {
        completeAchievement(ach);
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
        if (!this.ctx) return;
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
            townPortal: townPortal,
            settings: Settings // Save settings
        };
        db.transaction(['saveData'], 'readwrite').objectStore('saveData').put(data);
        showNotification("游戏已保存");
    },
    load: function () {
        if (!db) return;
        db.transaction(['saveData']).objectStore('saveData').get('player1').onsuccess = e => {
            if (e.target.result) {
                window.pendingLoadData = e.target.result;
                const f = e.target.result.floor === 0 ? "罗格营地" : `地牢 ${e.target.result.floor}层`;
                document.getElementById('save-status').innerText = `发现存档: Lv${e.target.result.lvl} - ${f}`;

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
        dropQualityMult: 1,
        resistancePenalty: 0,
        immuneChance: 0,
        doubleImmuneChance: 0
    },
    hell: {
        monsterHpMult: 6,
        monsterDmgMult: 4,
        monsterSpeedMult: 1.3,
        xpMult: 5,
        dropQualityMult: 3.5,  // 150%提升 = 原250%
        resistancePenalty: -100,
        immuneChance: 0.6,     // 60%怪物有至少一种免疫（包括物理）
        doubleImmuneChance: 0.4  // 40%怪物有双重免疫
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
        { name: '寒冰的', stat: 'coldDmg', min: 5, max: 20 },
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

function init() {
    resize(); window.addEventListener('resize', resize);
    initDragging();
    SaveSystem.init();
}
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

function confirmResetSave() {
    // 检查是否有存档
    const statusEl = document.getElementById('save-status');
    const hasSave = statusEl && statusEl.innerText !== '正在检查存档...' && statusEl.innerText !== '未发现存档';

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

        if (!player.skills) player.skills = { fireball: 1, frostnova: 0, multishot: 0 };

        if (player.died === undefined) player.died = false; // 初始化死亡标记

        if (!player.achievements) player.achievements = {}; // 初始化成就字段

        // 向后兼容：旧存档没有地狱相关字段，或者已设置为false
        if (player.unlockedHell === undefined || (player.unlockedHell === false && window.pendingLoadData)) {
            // 判断条件：已完成所有任务，或到达过第10层，或有相关成就
            const hasCompletedAllQuests = (player.questIndex !== undefined && player.questIndex >= QUEST_DB.length);
            const hasReachedFloor10 = (player.floor >= 10);
            const hasKillBossAchievement = (player.achievements && player.achievements.kill_boss_5 && player.achievements.kill_boss_5.progress >= 5);

            console.log('[地狱模式] 向后兼容检查:', {
                questIndex: player.questIndex,
                floor: player.floor,
                hasKillBoss: hasKillBossAchievement,
                questDBLength: QUEST_DB.length,
                unlockedHell: player.unlockedHell
            });

            if (hasCompletedAllQuests || hasReachedFloor10 || hasKillBossAchievement) {
                player.unlockedHell = true;
                player.defeatedBaal = true;
                console.log('[地狱模式] 向后兼容：检测到已通关，自动解锁地狱模式');
            } else if (player.unlockedHell === undefined) {
                player.unlockedHell = false;
                player.defeatedBaal = false;
            }
        }

        // 初始化成就数据结构
        initAchievements();

        if (player.questIndex === undefined) {
            player.questIndex = 0; player.questState = 0; player.questProgress = 0;
            if (player.quests && player.quests.q2 === 2) player.questIndex = QUEST_DB.length;
        }
        // Cleanup legacy
        if (player.quests) delete player.quests;

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

        if (window.pendingLoadData.townPortal) townPortal = window.pendingLoadData.townPortal;
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
    updateStats(); enterFloor(player.floor, 'start'); renderInventory(); updateStatsUI(); updateSkillsUI(); updateUI(); updateBeltUI(); updateQuestUI(); updateMenuIndicators();
    gameActive = true; gameLoop(0); spawnEnemyTimer();
}

// Revised enterFloor with spawn point logic
function enterFloor(f, spawnAt = 'start') {
    player.floor = f; enemies = []; groundItems = []; projectiles = []; npcs = [];

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
        npcs.push({ x: dungeonEntrance.x - 100, y: dungeonEntrance.y - 100, name: "基格", type: "merchant", radius: 20, frameIndex: 0 });
        npcs.push({ x: dungeonEntrance.x + 100, y: dungeonEntrance.y - 50, name: "阿卡拉", type: "healer", radius: 20, quest: 'q1', frameIndex: 1 });
        npcs.push({ x: dungeonEntrance.x, y: dungeonEntrance.y + 100, name: "瓦瑞夫", type: "stash", radius: 20, frameIndex: 2 });

        // 始终添加地狱守卫，但交互需要条件
        npcs.push({ x: dungeonEntrance.x - 150, y: dungeonEntrance.y + 50, name: "地狱守卫", type: "difficulty", radius: 20, frameIndex: 3 });

        showNotification("欢迎回到罗格营地");

        // ==== Boss 刷新检查 ==== //
        const bossInfo = floorBossMap[f];
        if (bossInfo) {
            const now = Date.now();
            const nextRespawn = player.bossRespawn[f] || 0;
            if (now >= nextRespawn) {
                // 简单创建 Boss 对象，后续可根据实际需求完善属性
                const boss = {
                    name: bossInfo.name,
                    isBoss: true,
                    hp: bossInfo.hp,
                    maxHp: bossInfo.hp,
                    damage: [10, 20], // 示例伤害范围
                    armor: 10,
                    radius: 20,
                    x: dungeonEntrance.x + 200,
                    y: dungeonEntrance.y,
                    dead: false
                };
                enemies.push(boss);
                console.log(`[Boss] ${bossInfo.name} 已在第 ${f} 层生成`);
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
        const currentQ = QUEST_DB[player.questIndex];
        if (currentQ && player.questState === 1 && currentQ.floor === f) {
            if (currentQ.type === 'kill_elite' || currentQ.type === 'kill_boss') {
                let x = dungeonExit.x, y = dungeonExit.y;
                if (f !== 5 && f !== 10) { let v = false; while (!v) { x = Math.random() * MAP_WIDTH * TILE_SIZE; y = Math.random() * MAP_HEIGHT * TILE_SIZE; if (!isWall(x, y)) v = true; } }

                // 增强BOSS血量和伤害，使其更有挑战性
                let hp, dmg, speed, xpValue, bossName;

                if (currentQ.id === 1) {
                    // 第一个BOSS（相对弱一些）
                    hp = 300;
                    dmg = 25;
                    speed = 90;
                    xpValue = 1000;
                    bossName = isInHell ? `地狱${currentQ.targetName}` : currentQ.targetName;
                } else if (currentQ.id === 3) {
                    // 第5层BOSS
                    hp = 800;
                    dmg = 40;
                    speed = 100;
                    xpValue = 2000;
                    bossName = isInHell ? `地狱${currentQ.targetName}` : currentQ.targetName;
                } else if (currentQ.id === 9) {
                    // 巴尔 - 在地狱中变成地狱巴尔
                    hp = 1500;
                    dmg = 60;
                    speed = 110;
                    xpValue = 5000;
                    bossName = isInHell ? '地狱巴尔' : currentQ.targetName;
                } else {
                    // 根据楼层动态计算BOSS属性
                    const baseHp = 150 + f * f * 25; // 基础血量增加
                    const multiplier = 1 + (f / 10); // 随楼层递增的倍数
                    hp = Math.floor(baseHp * multiplier);
                    dmg = 20 + f * 3; // 伤害成长更高
                    speed = 90 + Math.floor(f / 3); // 速度也随楼层增加
                    xpValue = 1500 + f * 300;
                    bossName = isInHell ? `地狱${currentQ.targetName}` : currentQ.targetName;
                }

                // 确保BOSS至少有最低强度
                hp = Math.max(hp, 300);
                dmg = Math.max(dmg, 25);

                // 应用难度系数
                hp = Math.floor(hp * difficulty.monsterHpMult);
                dmg = Math.floor(dmg * difficulty.monsterDmgMult);
                speed = Math.floor(speed * difficulty.monsterSpeedMult);
                xpValue = Math.floor(xpValue * difficulty.xpMult);

                enemies.push({
                    x, y, hp, maxHp: hp, dmg, speed, radius: 30, // 增大碰撞半径
                    dead: false, cooldown: 0, name: bossName,
                    isBoss: true, isQuestTarget: true, xpValue: xpValue, // 增加经验值
                    ai: 'chase', frameIndex: MONSTER_FRAMES.boss
                });
                showNotification(`警告：发现了 ${currentQ.targetName}！`);
            }
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
    player.targetX = null; player.portalTimer = 1.0; updateQuestTracker(); SaveSystem.save();
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

    // 如果位置在有效区域内，返回原位置
    if (distFromCenter < r) {
        return { x: x, y: y };
    }

    // 如果位置无效，找到最近的圆形边界上的有效位置
    // 计算从中心到目标位置的方向向量
    const dx = tileX - cx, dy = tileY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > 0) {
        // 归一化方向向量并缩放到圆形边界内
        const nx = dx / dist, ny = dy / dist;
        const targetX = cx + nx * (r - 1); // r-1 确保在边界内
        const targetY = cy + ny * (r - 1);

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
    for (let k in player.skillCooldowns) if (player.skillCooldowns[k] > 0) player.skillCooldowns[k] -= dt;
    if (player.portalTimer > 0) player.portalTimer -= dt;

    // 处理冰冻状态
    if (player.frozenTimer > 0) {
        player.frozenTimer -= dt;
        if (player.frozenTimer <= 0) {
            player.frozen = false;
        }
    }

    interactionTarget = null;
    const distExit = Math.hypot(player.x - dungeonExit.x, player.y - dungeonExit.y);
    if (distExit < 60) {
        const isInHell = player.isInHell || false;
        if (player.floor === 0) {
            interactionTarget = { type: 'next', label: '进入地牢 1层' };
        } else {
            // 在地狱中，显示返回营地而不是继续深入
            if (isInHell) {
                interactionTarget = { type: 'prev', label: '返回营地' };
            } else {
                interactionTarget = { type: 'next', label: `进入地牢 ${player.floor + 1}层` };
            }
        }
    }
    if (player.floor > 0) {
        const distEnt = Math.hypot(player.x - dungeonEntrance.x, player.y - dungeonEntrance.y);
        if (distEnt < 60) {
            const label = player.floor === 1 ? '回到罗格营地' : `回到地牢 ${player.floor - 1}层`;
            interactionTarget = { type: 'prev', label: label };
        }
    }
    if (townPortal && townPortal.activeFloor === player.floor) {
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

    for (let i = groundItems.length - 1; i >= 0; i--) {
        let item = groundItems[i];
        if (item.type === 'gold' && Math.hypot(item.x - player.x, item.y - player.y) < 60) {
            player.gold += item.val;
            createDamageNumber(player.x, player.y - 40, `+${item.val} G`, 'gold');
            AudioSys.play('gold');
            if (item.el) item.el.remove();
            groundItems.splice(i, 1);
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
                updateUI(); checkPlayerDeath();
                for (let j = 0; j < 5; j++)createParticle(p.x, p.y, p.color || '#ff4400');
            }
        } else {
            // 玩家发射的投射物，检测是否击中敌人
            enemies.forEach(e => {
                if (!e.dead && e !== p.owner && Math.hypot(p.x - e.x, p.y - e.y) < e.radius + 10) {
                    takeDamage(e, p.damage, true);  // 第三个参数标记为技能伤害
                    p.life = 0;
                    if (p.freeze) { e.frozenTimer = p.freeze; createDamageNumber(e.x, e.y - 40, "冻结!", COLORS.ice); }
                    for (let j = 0; j < 5; j++)createParticle(p.x, p.y, p.color || '#ff4400');
                }
            });
        }

        if (p.life <= 0) projectiles.splice(i, 1);
    });

    particles.forEach((p, i) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.life <= 0) particles.splice(i, 1) });
    damageNumbers.forEach((d, i) => { d.life -= dt; d.y -= 20 * dt; if (d.life <= 0) damageNumbers.splice(i, 1); });

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

                // 应用精英词缀的攻击效果
                if (e.eliteAffixes && e.eliteAffixes.length > 0) {
                    // 吸血：恢复生命
                    if (e.lifeSteal) {
                        const heal = Math.floor(totalDmg * e.lifeSteal);
                        e.hp = Math.min(e.maxHp, e.hp + heal);
                        createDamageNumber(e.x, e.y - 30, "+" + heal, COLORS.green);
                    }

                    // 冰冻：减速玩家
                    if (e.freezeOnHit) {
                        player.frozen = true;
                        player.frozenTimer = 2.0;  // 冰冻2秒
                        createDamageNumber(player.x, player.y - 40, "冰冻!", COLORS.ice);
                    }

                    // 法力燃烧：消耗玩家法力
                    if (e.manaBurn) {
                        const manaBurned = Math.min(player.mp, Math.floor(totalDmg * 0.5));
                        player.mp -= manaBurned;
                        createDamageNumber(player.x, player.y - 50, "-" + manaBurned + " MP", '#0066ff');
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
                if (mapData[r][c] === 0) { ctx.fillStyle = COLORS.wall; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); ctx.fillStyle = '#111'; ctx.fillRect(x, y + TILE_SIZE - 10, TILE_SIZE, 10); }
                else { ctx.fillStyle = ((c + r) % 2 === 0) ? '#151515' : '#1a1a1a'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); }
            }
        }
    }

    // Render Exits
    if (player.floor === 0) {
        ctx.fillStyle = COLORS.exit; ctx.fillRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.strokeStyle = '#4d94ff'; ctx.strokeRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.fillText("去地牢 1层", dungeonExit.x, dungeonExit.y - 20);
    } else {
        ctx.fillStyle = COLORS.exit; ctx.fillRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.strokeStyle = '#4d94ff'; ctx.strokeRect(dungeonExit.x - 15, dungeonExit.y - 15, 30, 30);
        ctx.fillStyle = COLORS.entrance; ctx.fillRect(dungeonEntrance.x - 15, dungeonEntrance.y - 15, 30, 30);
        ctx.strokeStyle = '#ffaa00'; ctx.strokeRect(dungeonEntrance.x - 15, dungeonEntrance.y - 15, 30, 30);
        let prevLabel = player.floor === 1 ? "去罗格营地" : `去地牢 ${player.floor - 1}层`;
        ctx.fillStyle = '#aaa'; ctx.textAlign = 'center'; ctx.fillText(prevLabel, dungeonEntrance.x, dungeonEntrance.y - 20);
    }

    if (townPortal && townPortal.activeFloor === player.floor) {
        ctx.fillStyle = '#4d94ff'; ctx.beginPath(); ctx.arc(townPortal.x, townPortal.y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.stroke();
        let label = player.floor === 0 ? `传送门 (去往 ${townPortal.returnFloor}层)` : "传送门 (回罗格营地)";
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(label, townPortal.x, townPortal.y - 20);
    }

    groundItems.forEach(i => {
        ctx.beginPath(); ctx.fillStyle = getItemColor(i.rarity); ctx.textAlign = 'center';
        ctx.font = '20px serif'; ctx.fillText(i.icon || '📦', i.x, i.y + 7);
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

    if (player.targetX !== null) { ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.arc(player.targetX, player.targetY, 5, 0, Math.PI * 2); ctx.stroke(); }
    if (spritesLoaded && processedSpriteSheet) {
        const frame = getHeroFrame(player.direction);
        const renderHeight = 48;
        const renderWidth = renderHeight * frame.width / frame.height;
        ctx.drawImage(processedSpriteSheet, frame.x, frame.y, frame.width, frame.height,
            player.x - renderWidth / 2, player.y - renderHeight, renderWidth, renderHeight);
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

    particles.forEach(p => { ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;

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
        if (!player.defeatedBaal && !player.unlockedHell) {
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
    // 进入地狱
    player.isInHell = true;
    player.hellFloor = 1;
    showNotification('已进入地狱！');
    updateHellIndicator();
    enterFloor(1, 'end');  // 从地狱第1层开始
}

function exitHell() {
    // 返回地牢
    player.isInHell = false;
    showNotification('已返回普通地牢');
    updateHellIndicator();
    enterFloor(player.floor || 1, 'end');  // 返回原来的地牢层数
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
        if (!gameActive || aliveEnemies > 20 || player.floor === 0) return;

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
                    player.unlockedHell = true;
                    // 标记首次击败巴尔，用于成就统计
                    if (!player.firstKillBaal) {
                        player.firstKillBaal = true;
                        // 成就已在 kill_baal 中处理，这里仅标记
                    }
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

function addItemToInventory(i) {
    if (i.stackable) {
        const existing = player.inventory.find(invItem => invItem && invItem.name === i.name);
        if (existing) { existing.quantity = (existing.quantity || 1) + 1; renderInventory(); updateBeltUI(); AudioSys.play('gold'); return true; }
    }
    const idx = player.inventory.findIndex(x => !x); if (idx < 0) return false; player.inventory[idx] = i; renderInventory(); updateBeltUI(); AudioSys.play('gold'); return true;
}

function createDamageNumber(x, y, val, color) { damageNumbers.push({ x, y, val, color, life: 1 }); }
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
            slot.innerText = item.icon || ITEM_TYPES[item.type.toUpperCase()].icon;
            slot.style.color = getItemColor(item.rarity);
            slot.style.display = 'flex';
            slot.style.justifyContent = 'center';
            slot.style.alignItems = 'center';
            slot.style.fontSize = '24px';

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
    const f = player.floor;

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
        icon: '💰'
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
            const item = createItem(null, f);

            // BOSS掉落更高品质
            if (monster.isBoss || monster.isQuestTarget) {
                // 重新roll一次稀有度，提高稀有度概率
                const qualityRoll = Math.random();
                if (qualityRoll < 0.4) item.rarity = 3; // 40%概率稀有
                else if (qualityRoll < 0.7) item.rarity = 2; // 30%概率魔法
            }

            item.x = x + Math.random() * 30 - 15 + i * 20; // 分散掉落位置
            item.y = y + Math.random() * 30 - 15;
            groundItems.push(item);
        }
    }

    updateWorldLabels();
}

function updateWorldLabels() {
    const c = document.getElementById('world-labels'); c.innerHTML = '';
    groundItems.forEach(i => {
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

function getItemColor(r) { return r === 0 ? COLORS.white : r === 1 ? COLORS.white : r === 2 ? COLORS.blue : r === 3 ? COLORS.yellow : COLORS.gold; }
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
        cold: player.elementalDamage.cold,
        lightning: player.elementalDamage.lightning,
        poison: player.elementalDamage.poison
    };

    takeDamage(t, damageObj);
    AudioSys.play('attack');

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

function castSkill(type) {
    if (player.floor === 0) return;

    // 检查是否选择了未学习的技能
    if (!player.skills[type] || player.skills[type] <= 0) {
        const typeNames = { fireball: '火球术', frostnova: '霜之新星', multishot: '多重射击' };
        showNotification(`技能未学习：${typeNames[type] || type}`);
        return;
    }

    if (type === 'fireball') {
        if (player.mp < 5) {
            createFloatingText(player.x, player.y - 40, '法力不足！(需要 5 法力)', '#4d94ff', 1.5);
            return;
        }
        if (player.skillCooldowns.fireball > 0) return;
        player.mp -= 5; player.skillCooldowns.fireball = 0.5;
        const angle = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
        projectiles.push({ x: player.x, y: player.y, angle, speed: 450, life: 0.5, damage: 10 * player.skills.fireball + player.ene, owner: player });
        AudioSys.play('attack');
    } else if (type === 'frostnova') {
        if (player.mp < 15) {
            createFloatingText(player.x, player.y - 40, '法力不足！(需要 15 法力)', '#4d94ff', 1.5);
            return;
        }
        if (player.skillCooldowns.frostnova > 0) return;
        player.mp -= 15; player.skillCooldowns.frostnova = 4;
        for (let i = 0; i < 360; i += 15) projectiles.push({ x: player.x, y: player.y, angle: i * Math.PI / 180, speed: 300, life: 0.4, damage: 5 * player.skills.frostnova, color: COLORS.ice, freeze: 2, owner: player });
        AudioSys.play('fireball');
    } else if (type === 'multishot') {
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

function renderInventory() {
    const c = document.getElementById('bag-grid'); c.innerHTML = '';
    player.inventory.forEach((i, idx) => {
        const s = document.createElement('div'); s.className = 'bag-slot';
        if (i) {
            s.innerText = i.icon || ITEM_TYPES[i.type.toUpperCase()].icon; s.style.color = getItemColor(i.rarity); s.style.display = 'flex'; s.style.justifyContent = 'center'; s.style.alignItems = 'center'; s.style.fontSize = '24px';
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
        if (i) {
            const ic = document.createElement('div'); ic.innerText = i.icon || ITEM_TYPES[i.type.toUpperCase()].icon; ic.style.fontSize = '30px'; ic.style.color = getItemColor(i.rarity);
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
        if (i) {
            const ic = document.createElement('div'); ic.innerText = i.icon; ic.style.fontSize = '24px'; ic.style.color = getItemColor(i.rarity);
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
        if (player.floor !== 0) {
            // 验证并修正传送门位置，确保在罗格营地的安全区域
            const safePortalPos = validateAndFixPortalPosition(player.x, player.y);
            townPortal = { returnFloor: player.floor, x: safePortalPos.x, y: safePortalPos.y, activeFloor: 0 };
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
    document.getElementById('count-health').innerText = countItem('治疗药剂');
    document.getElementById('count-mana').innerText = countItem('法力药剂');
    document.getElementById('count-scroll').innerText = countItem('回城卷轴');
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

    // 检查是否在罗格营地
    if (player.floor === 0) {
        showNotification("在罗格营地不能丢弃物品");
        return;
    }

    // 创建物品副本并设置位置
    const droppedItem = { ...item };
    droppedItem.x = player.x + Math.random() * 40 - 20;
    droppedItem.y = player.y + Math.random() * 40 - 20;

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

function updateStats() {
    let str = player.str, dex = player.dex, vit = player.vit, ene = player.ene;
    // Fixed: Stats scaling fix (Str 5%, Dex 1 Armor + 0.5% Crit)
    let baseDmg = 2, armor = 0, ls = 0, ias = 0;

    // 重置抗性和元素伤害
    player.resistances = { fire: 0, cold: 0, lightning: 0, poison: 0 };
    player.elementalDamage = { fire: 0, cold: 0, lightning: 0, poison: 0 };

    // 初始化新属性
    let hpRegen = 0, mpRegen = 0, blockChance = 0, reflectDamage = 0;
    let damageReduction = 0, critDamage = 0, allRes = 0;

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
            player.elementalDamage.cold += (i.stats.coldDmg || 0);
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

    // 检查暗金装备成就
    checkAllUniqueEquipment();
}

function updateUI() {
    document.getElementById('hp-fill').style.height = Math.max(0, Math.min(100, player.hp / player.maxHp * 100)) + '%';
    document.getElementById('hp-text').innerText = Math.floor(player.hp);
    document.getElementById('mp-fill').style.height = Math.max(0, Math.min(100, player.mp / player.maxMp * 100)) + '%';
    document.getElementById('mp-text').innerText = Math.floor(player.mp);

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
        if (player.activeSkill === 'frostnova') btns[2].classList.add('active');
        if (player.activeSkill === 'multishot') btns[3].classList.add('active');
    }

    const promptEl = document.getElementById('interaction-msg');
    if (interactionTarget) {
        promptEl.style.display = 'block';
        promptEl.innerHTML = `按 [Enter] ${interactionTarget.label}`;
    } else {
        promptEl.style.display = 'none';
    }
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
    document.getElementById('lvl-frostnova').innerText = player.skills.frostnova;
    document.getElementById('lvl-multishot').innerText = player.skills.multishot;
    document.getElementById('bar-lvl-fireball').innerText = player.skills.fireball;
    document.getElementById('bar-lvl-frostnova').innerText = player.skills.frostnova;
    document.getElementById('bar-lvl-multishot').innerText = player.skills.multishot;
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
            if (k === 'def') label = "防御";
            if (k === 'lifeSteal') label = "%吸血";
            if (k === 'attackSpeed') label = "%攻速";
            if (k === 'dmgPct') label = "%伤害";
            if (k === 'allSkills') label = "所有技能";
            html += `<div class="tooltip-stat" style="color:#4850b8">+${v} ${label}</div>`;
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
    if (e.key === 'c' || e.key === 'C') togglePanel('stats');
    if (e.key === 'i' || e.key === 'I' || e.key === 'b' || e.key === 'B') togglePanel('inventory');
    if (e.key === 't' || e.key === 'T') togglePanel('skills');
    if (e.key === 'q' || e.key === 'Q') selectSkill('fireball');
    if (e.key === 'w' || e.key === 'W') selectSkill('frostnova');
    if (e.key === 'e' || e.key === 'E') selectSkill('multishot');
    if (e.key === 'j' || e.key === 'J') togglePanel('quest');
    if (e.key === 'a' || e.key === 'A') togglePanel('achievements');

    if (e.key === '1') useQuickItem('health');
    if (e.key === '2') useQuickItem('mana');
    if (e.key === '3') useQuickItem('scroll');

    if (e.key === 'Enter') {
        if (interactionTarget) {
            if (interactionTarget.type === 'next') {
                const isInHell = player.isInHell || false;
                if (isInHell && player.floor > 0) {
                    // 在地狱中，"next"表示返回营地
                    exitHell();
                } else {
                    // 普通地牢，正常进入下一层
                    enterFloor(player.floor + 1, 'start');
                }
            }
            else if (interactionTarget.type === 'prev') {
                const isInHell = player.isInHell || false;
                if (isInHell) {
                    // 在地狱中，返回营地
                    exitHell();
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
            else if (k === 'fireRes') { label = "🔥火焰抗性"; color = '#ff6644'; }
            else if (k === 'coldRes') { label = "❄️冰霜抗性"; color = '#4488ff'; }
            else if (k === 'lightningRes') { label = "⚡闪电抗性"; color = '#ffff44'; }
            else if (k === 'poisonRes') { label = "☠️毒素抗性"; color = '#44ff44'; }
            else if (k === 'allRes') { label = "所有抗性"; color = '#ffaa44'; }

            // 元素伤害
            else if (k === 'fireDmg') { label = "火焰伤害"; color = '#ff4400'; }
            else if (k === 'coldDmg') { label = "冰霜伤害"; color = '#00aaff'; }
            else if (k === 'lightningDmg') { label = "闪电伤害"; color = '#ffff00'; }
            else if (k === 'poisonDmg') { label = "毒素伤害"; color = '#00ff00'; }

            // 特殊效果
            else if (k === 'hpRegen') { label = "生命回复/秒"; color = '#ff4444'; }
            else if (k === 'mpRegen') { label = "%法力回复"; color = '#4444ff'; }
            else if (k === 'blockChance') { label = "%格挡几率"; color = '#ffaa00'; }
            else if (k === 'reflectDamage') { label = "%反射伤害"; color = '#ff00ff'; }
            else if (k === 'damageReduction') { label = "%伤害减免"; color = '#aaaaaa'; }
            else if (k === 'critDamage') { label = "%暴击伤害"; color = '#ffff00'; }
            else if (k === 'armorPierce') { label = "%护甲穿透"; color = '#ff8800'; }
            else if (k === 'knockback') { label = "%击退几率"; color = '#88ff88'; }
            else if (k === 'slow') { label = "%减速几率"; color = '#8888ff'; }
            else if (k === 'doubleHit') { label = "%连击几率"; color = '#ff88ff'; }
            else if (k === 'attackRating') { label = "攻击等级"; color = '#ffaa00'; }
            else if (k === 'magicFind') { label = "%魔法发现"; color = '#00ffff'; }

            // 对比属性
            let eqStat = 0;
            if (equipped && equipped.stats && equipped.stats[k]) eqStat = equipped.stats[k];

            html += `<div class="tooltip-stat" style="color:${color}">${prefix}${v} ${label}${diffSpan(v, eqStat)}</div>`;
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

initDragging();
init();
