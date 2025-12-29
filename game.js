// ========== game.js - 主游戏逻辑 ==========
// 常量定义已移至 constants.js

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
    // 每日任务：收集金币
    if (typeof DailyQuestSystem !== 'undefined') {
        DailyQuestSystem.updateProgress('collect_gold', amount);
    }
    // 成就追踪：累计金币
    trackAchievement('total_gold', { amount });
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
        'achievements': { id: 'achievements-panel', group: 'center', top: 50, baseTop: 50, opened: false, zIndex: 0 },
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

        // 对于center组但没有left属性的面板（如成就面板），保留CSS居中设置
        if (panel.group === 'center' && !panel.left) {
            // 不修改位置，让CSS的transform居中生效
            return newTop;
        }

        element.style.top = newTop + '%';

        // 对于中间组的面板,水平错开
        if (panel.group === 'center' && panel.left) {
            const centerOffset = (openedInGroup % 2) * 50 - 25; // 左右错开
            element.style.left = (panel.left + centerOffset) + 'px';
        }

        // 小屏适配：小屏幕让CSS居中生效，不做位置调整
        if (window.innerWidth < 768) return newTop;

        // 大屏确保面板在可视区域内
        requestAnimationFrame(() => {
            const rect = element.getBoundingClientRect();
            const padding = 10;
            // 右边超出
            if (rect.right > window.innerWidth - padding) {
                element.style.left = Math.max(padding, window.innerWidth - rect.width - padding) + 'px';
                element.style.right = 'auto';
            }
            // 底部超出
            if (rect.bottom > window.innerHeight - padding) {
                element.style.top = Math.max(padding, window.innerHeight - rect.height - padding) + 'px';
            }
            // 左边超出
            if (rect.left < padding) {
                element.style.left = padding + 'px';
                element.style.right = 'auto';
            }
        });

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

// DOM 缓存对象
const cachedUI = {
    // Orbs
    hpFill: null, hpGhostFill: null, hpText: null, hpOrb: null,
    mpFill: null, mpGhostFill: null, mpText: null, mpOrb: null,
    // XP & Level
    xpFill: null, xpPercentage: null, hudLvl: null, hudGold: null, floorDisplay: null,
    // Indicators & FX
    lowHpVignette: null, hellIndicator: null, comboHud: null, comboCount: null, comboTimerFill: null,
    // Container
    worldLabels: null, notificationArea: null, floatingTexts: null,
    talentHud: null, tooltip: null, uiLayer: null,
    // Skills Bar
    skillBtns: {},
    cdSweeps: {},
    cdTimes: {},
    // Menu Badges
    badges: { stats: null, skills: null, quest: null },
    // Settings & System
    chkAutoGold: null, chkAutoPotion: null, chkAutoScroll: null,
    chkJuice: null,
    selectGraphicsQuality: null,
    saveStatus: null
};

// 初始化 UI 缓存
function initUICache() {
    // Orbs
    cachedUI.hpFill = document.getElementById('hp-fill');
    cachedUI.hpGhostFill = document.getElementById('hp-ghost-fill');
    cachedUI.hpText = document.getElementById('hp-text');
    cachedUI.hpOrb = document.getElementById('health-orb');
    cachedUI.mpFill = document.getElementById('mp-fill');
    cachedUI.mpGhostFill = document.getElementById('mp-ghost-fill');
    cachedUI.mpText = document.getElementById('mp-text');
    cachedUI.mpOrb = document.getElementById('mana-orb');

    // XP & Level & Info
    cachedUI.xpFill = document.getElementById('xp-fill');
    cachedUI.xpPercentage = document.getElementById('xp-percentage');
    cachedUI.hudLvl = document.getElementById('hud-lvl');
    // 多处金币显示列表
    cachedUI.goldDisplays = [
        document.getElementById('gold-display'),
        document.getElementById('shop-gold-display'),
        document.getElementById('stash-gold-display'),
        document.getElementById('forge-gold-display'),
        document.getElementById('talent-shop-gold')
    ].filter(el => el !== null);
    cachedUI.floorDisplay = document.getElementById('floor-display');

    // Indicators
    cachedUI.lowHpVignette = document.getElementById('low-hp-vignette');
    cachedUI.hellIndicator = document.getElementById('hell-indicator');
    cachedUI.comboHud = document.getElementById('combo-hud');
    cachedUI.comboCount = document.getElementById('combo-count');
    cachedUI.comboTimerFill = document.getElementById('combo-timer-fill');

    // Containers
    cachedUI.worldLabels = document.getElementById('world-labels');
    cachedUI.notificationArea = document.getElementById('notification-area');
    cachedUI.floatingTexts = document.getElementById('floating-texts-container');
    cachedUI.talentHud = document.getElementById('talent-hud');
    cachedUI.tooltip = document.getElementById('tooltip');
    cachedUI.uiLayer = document.querySelector('.ui-layer');

    // Skills
    const skills = ['fireball', 'thunder', 'multishot'];
    skills.forEach(s => {
        cachedUI.skillBtns[s] = document.getElementById(`skill-${s}`);
        cachedUI.cdSweeps[s] = document.getElementById(`cd-sweep-${s}`);
        cachedUI.cdTimes[s] = document.getElementById(`cd-time-${s}`);
    });

    // Badges
    cachedUI.badges.stats = document.getElementById('badge-stats');
    cachedUI.badges.skills = document.getElementById('badge-skills');
    cachedUI.badges.quest = document.getElementById('badge-quest');

    // Settings
    cachedUI.chkAutoGold = document.getElementById('chk-auto-gold');
    cachedUI.chkAutoPotion = document.getElementById('chk-auto-potion');
    cachedUI.chkAutoScroll = document.getElementById('chk-auto-scroll');
    cachedUI.chkJuice = document.getElementById('chk-juice');
    cachedUI.selectGraphicsQuality = document.getElementById('select-graphics-quality');
    cachedUI.saveStatus = document.getElementById('save-status');
}

let gameActive = false;
let lastTime = 0;
let particles = [];
let damageNumbers = [];
let slashEffects = [];
let enemies = [];
let groundItems = [];
let projectiles = [];
let npcs = [];
// bloodSplats 已废弃，血迹现在直接绘制到离屏Canvas (bloodCanvas)
let destructibles = []; // 场景可破坏物体

// 地图缓存系统（离屏Canvas优化）
let mapCacheCanvas = null;
let mapCacheCtx = null;
let mapCacheValid = false;  // 缓存是否有效

// 回城仪式状态
let portalRitual = {
    active: false,       // 是否正在施法
    phase: 0,            // 0=施法, 1=光效, 2=白闪, 3=淡入
    timer: 0,            // 当前阶段计时
    returnFloor: 0,      // 要返回的层数
    scrollIdx: -1,       // 消耗的卷轴索引
    flashAlpha: 0        // 白闪透明度
};

const PORTAL_RITUAL_DURATIONS = {
    casting: 1.0,    // 施法读条时间
    effect: 0.4,     // 光效时间
    flash: 0.3,      // 白闪时间
    fadeIn: 0.5      // 淡入时间
};

// 飞行拾取粒子数组（类《幸存者》吸入效果）
let flyingPickups = [];

// 升级特效状态
let levelUpEffect = {
    active: false,
    timer: 0,
    flashAlpha: 0,
    newLevel: 0
};

// 慢动作状态（Boss死亡时触发）
let slowMotion = {
    active: false,
    timer: 0,
    scale: 1.0  // 时间缩放倍率
};

// 连击计数器（纯Game Juice视觉反馈）
let combo = {
    count: 0,
    timer: 0,
    maxTimer: 2.5, // 连击窗口时间
    scale: 1,      // 视觉缩放（跳动效果）
    shake: 0,      // 视觉抖动
    active: false  // 是否显示
};

// ========== Game Juice 系统 (打击感与反馈) ==========
const Juice = {
    hitStopTimer: 0,

    // 触发打击感核心逻辑
    // entity: 受击者, isCrit: 是否暴击, isKill: 是否击杀
    hit: function (entity, isCrit, isKill) {
        if (!player.juiceEnabled) return; // 检查开关
        const isMobile = /Mobi|Android|iPhone/i.test(navigator.userAgent);

        // 1. 顿帧 (Hit Stop) - 产生卡肉感
        // 只有暴击或重要时刻才顿帧，普通攻击保持连贯
        if (isCrit || isKill) {
            this.hitStopTimer = isKill ? 0.06 : 0.03;
            if (isMobile) this.hitStopTimer *= 0.7; // 移动端稍微短一点，防止误判为卡顿
        }

        // 2. 震屏 (Screen Shake)
        let intensity = isCrit ? 10 : 4;
        if (isKill) intensity += 6;
        if (isMobile) intensity *= 0.4; // 移动端减弱视觉震动，保护视力

        if (intensity > 2) {
            triggerScreenShake(intensity, 0.15);
        }

        // 3. 触感反馈 (Mobile Vibrate)
        if (isMobile && navigator.vibrate) {
            if (isKill) navigator.vibrate(15);
            else if (isCrit) navigator.vibrate(8);
        }

        // 4. 受击实体视觉反馈 (Squash & Stretch)
        if (entity) {
            entity.juiceScale = 0.85; // 瞬间压缩
            entity.juiceScaleTimer = 0.2; // 0.2秒恢复
        }
    },

    // 更新 Juice 系统时间
    update: function (dt) {
        if (this.hitStopTimer > 0) {
            this.hitStopTimer -= dt;
            if (this.hitStopTimer < 0) this.hitStopTimer = 0;
            return true; // 正在顿帧，告诉主循环暂停逻辑更新
        }
        return false;
    }
};

// 增加连击数
function addCombo(amount = 1) {
    if (combo.count === 0) {
        combo.active = true;
    }
    combo.count += amount;
    combo.timer = combo.maxTimer;
    combo.scale = 1.5; // 击中时弹跳
    // 成就追踪：最大连击
    trackAchievement('max_combo', { combo: combo.count });
}


// --- 性能优化：通用对象池管理 ---
const ParticlePool = {
    _pool: [],
    acquire(props) {
        const p = this._pool.pop() || {};
        return Object.assign(p, props);
    },
    release(p) {
        if (this._pool.length < 500) {
            // 清理物理属性，防止复用污染
            p.z = undefined; p.vz = undefined; p.vx = undefined; p.vy = undefined;
            p.gravity = undefined; p.type = undefined; p.canBake = undefined; p.size = 3;
            this._pool.push(p);
        }
    }
};

const DamageNumberPool = {
    _pool: [],
    acquire(props) {
        const d = this._pool.pop() || {};
        return Object.assign(d, props);
    },
    release(d) {
        if (this._pool.length < 100) this._pool.push(d);
    }
};

// --- 性能优化：地表血迹离屏层 ---
let bloodCanvas = null;
let bloodCtx = null;

function initBloodCanvas() {
    if (!bloodCanvas) {
        bloodCanvas = document.createElement('canvas');
        bloodCanvas.width = MAP_WIDTH * TILE_SIZE;
        bloodCanvas.height = MAP_HEIGHT * TILE_SIZE;
        bloodCtx = bloodCanvas.getContext('2d');
    }
    clearBloodCanvas();
}

function clearBloodCanvas() {
    if (bloodCtx) bloodCtx.clearRect(0, 0, bloodCanvas.width, bloodCanvas.height);
}

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
            hitFlashTimer: 0,  // 受击闪白计时器
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
let townPortalSpot = { x: 0, y: 0 }; // 营地固定传送门位置（地牢入口右侧）
let interactionTarget = null;

// 获取传送门应显示的位置（营地使用固定位置，地牢使用实际位置）
function getPortalDisplayPosition() {
    if (!townPortal) return null;
    if (player.floor === 0) {
        // 营地：使用固定位置
        return { x: townPortalSpot.x, y: townPortalSpot.y };
    } else {
        // 地牢：使用实际传送门位置
        return { x: townPortal.x, y: townPortal.y };
    }
}

const mouse = { x: 0, y: 0, worldX: 0, worldY: 0, leftDown: false, rightDown: false };
const camera = { x: 0, y: 0 };

// 任务标题和描述从 FLOOR_NAMES 动态获取，保持数据源统一
const QUEST_DB = [
    { id: 0, get title() { return getFloorName(1); }, get desc() { return `清除第1层「${getFloorName(1)}」的 10 只怪物。`; }, type: 'kill_count', target: 10, floor: 1, reward: '1 技能点' },
    { id: 1, get title() { return getFloorName(2); }, get desc() { return `在第2层「${getFloorName(2)}」击杀精英怪"血鸟"。`; }, type: 'kill_elite', targetName: '血鸟', floor: 2, reward: '稀有戒指' },
    { id: 2, get title() { return getFloorName(3); }, get desc() { return `在第3层「${getFloorName(3)}」击杀 15 只怪物。`; }, type: 'kill_count', target: 15, floor: 3, reward: '500 金币' },
    { id: 3, get title() { return getFloorName(4); }, get desc() { return `在第4层「${getFloorName(4)}」击杀"女伯爵"。`; }, type: 'kill_elite', targetName: '女伯爵', floor: 4, reward: '随机符文' },
    { id: 4, get title() { return getFloorName(5); }, get desc() { return `在第5层「${getFloorName(5)}」击杀屠夫。`; }, type: 'kill_boss', targetName: '屠夫', floor: 5, reward: '暗金装备' },
    { id: 5, get title() { return getFloorName(6); }, get desc() { return `清除第6层「${getFloorName(6)}」的 20 只怪物。`; }, type: 'kill_count', target: 20, floor: 6, reward: '2 技能点' },
    { id: 6, get title() { return getFloorName(7); }, get desc() { return `在第7层「${getFloorName(7)}」击杀精英怪"树头木拳"。`; }, type: 'kill_elite', targetName: '树头木拳', floor: 7, reward: '暗金饰品' },
    { id: 7, get title() { return getFloorName(8); }, get desc() { return `在第8层「${getFloorName(8)}」击杀 25 只怪物。`; }, type: 'kill_count', target: 25, floor: 8, reward: '1000 金币' },
    { id: 8, get title() { return getFloorName(9); }, get desc() { return `在第9层「${getFloorName(9)}」击杀"暗黑破坏神"。`; }, type: 'kill_elite', targetName: '暗黑破坏神', floor: 9, reward: '传奇装备' },
    { id: 9, get title() { return getFloorName(10); }, get desc() { return `在第10层「${getFloorName(10)}」击败巴尔，拯救世界。`; }, type: 'kill_boss', targetName: '巴尔', floor: 10, reward: '终极神装' }
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

    const floorName = getFloorName(currentFloor);
    if (isBossLevel) {
        // Boss任务
        // 简化的Boss名称逻辑
        const bossPool = ['血鸟', '女伯爵', '屠夫', '树头木拳', '暗黑破坏神', '巴尔'];
        const bossName = bossPool[Math.floor(currentFloor / 10) % bossPool.length] || '精英守卫';
        const isTrueBoss = (currentFloor % 10 === 0);

        return {
            id: idx,
            title: floorName,
            desc: `在第${currentFloor}层「${floorName}」击败强大的 ${bossName}。`,
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
            title: floorName,
            desc: `清除第${currentFloor}层「${floorName}」的 ${targetCount} 只怪物。`,
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
// 第2排：普通怪物帧索引 (已移至 enemy-system.js)

// 应用 Boss 特殊属性
// 应用 Boss 特殊属性 (已移至 enemy-system.js)

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
    stash: Array(36).fill(null), // 仓库，基础36格
    stashLevel: 0, // 仓库扩建等级（0-3），每级+6格
    questIndex: 0, questState: 0, questProgress: 0,
    died: false,
    achievements: {},
    // 自动拾取设置
    autoPickup: {
        gold: true,      // 自动拾取金币
        potion: true,    // 自动拾取药水
        scroll: true     // 自动拾取卷轴
    },
    // 打击感设置
    juiceEnabled: false, // 默认关闭打击感增强
    // 画质设置
    graphicsQuality: 'high',  // 'high'=华丽特效, 'low'=性能优先
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
    lightningOverloadTimer: 0, // 闪电过载视觉计时器
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
    },
    // 离线收益系统
    lastOnlineTime: null,     // 上次在线时间戳（用于计算离线时长）
    offlineRewardsClaimed: false  // 离线收益是否已领取（初始为false，第一次进入游戏后会被设置为true）
};

// UI 视觉状态（用于平滑动画与脏检查）
let uiDisplayState = {
    hp: 100, hpGhost: 100, mp: 50, mpGhost: 50, xpPct: 0, lvl: -1, gold: -1,
    lastHp: -1, lastHpGhost: -1, lastMp: -1, lastMpGhost: -1, lastXpPct: -1,
    activeSkill: '',
    lastLowHpState: null,
    lastPoisonedState: null,
    lastFrozenState: null,
    lastOverloadedState: null,
    dirty: true
};

// UI 平滑渲染引擎
// UI 平滑渲染引擎
function updateSmoothUI(dt) {
    // --- Combo HUD ---
    if (cachedUI.comboHud) {
        if (combo.active && combo.count > 1) {
            cachedUI.comboHud.classList.add('active');
            cachedUI.comboCount.innerText = combo.count;
            const pct = (combo.timer / combo.maxTimer) * 100;
            cachedUI.comboTimerFill.style.width = pct + '%';
            cachedUI.comboCount.style.transform = (combo.scale > 1) ? `scale(${combo.scale})` : 'scale(1)';
        } else {
            cachedUI.comboHud.classList.remove('active');
        }
    }

    // --- Smooth Logic ---
    const targetHp = (player.hp / player.maxHp) * 100;
    if (Math.abs(uiDisplayState.hp - targetHp) > 0.01) uiDisplayState.hp += (targetHp - uiDisplayState.hp) * dt * 8;
    else uiDisplayState.hp = targetHp;

    if (uiDisplayState.hpGhost > uiDisplayState.hp) uiDisplayState.hpGhost += (uiDisplayState.hp - uiDisplayState.hpGhost) * dt * 2.5;
    else uiDisplayState.hpGhost = uiDisplayState.hp;

    const targetMp = (player.mp / player.maxMp) * 100;
    if (Math.abs(uiDisplayState.mp - targetMp) > 0.01) uiDisplayState.mp += (targetMp - uiDisplayState.mp) * dt * 8;
    else uiDisplayState.mp = targetMp;

    if (uiDisplayState.mpGhost > uiDisplayState.mp) uiDisplayState.mpGhost += (uiDisplayState.mp - uiDisplayState.mpGhost) * dt * 2.5;
    else uiDisplayState.mpGhost = uiDisplayState.mp;

    const targetXp = player.xpNext > 0 ? (player.xp / player.xpNext * 100) : 0;
    if (Math.abs(uiDisplayState.xpPct - targetXp) > 0.01) uiDisplayState.xpPct += (targetXp - uiDisplayState.xpPct) * dt * 5;
    else uiDisplayState.xpPct = targetXp;

    // --- Granular DOM Implementation ---
    if (Math.abs(uiDisplayState.hp - uiDisplayState.lastHp) > 0.001) {
        uiDisplayState.lastHp = uiDisplayState.hp;
        if (cachedUI.hpFill) cachedUI.hpFill.style.height = uiDisplayState.hp + '%';
        if (cachedUI.hpText) cachedUI.hpText.innerText = Math.max(0, Math.floor(player.hp));
    }
    if (Math.abs(uiDisplayState.hpGhost - uiDisplayState.lastHpGhost) > 0.001) {
        uiDisplayState.lastHpGhost = uiDisplayState.hpGhost;
        if (cachedUI.hpGhostFill) cachedUI.hpGhostFill.style.height = uiDisplayState.hpGhost + '%';
    }
    if (Math.abs(uiDisplayState.mp - uiDisplayState.lastMp) > 0.001) {
        uiDisplayState.lastMp = uiDisplayState.mp;
        if (cachedUI.mpFill) cachedUI.mpFill.style.height = uiDisplayState.mp + '%';
        if (cachedUI.mpText) cachedUI.mpText.innerText = Math.max(0, Math.floor(player.mp));
    }
    if (Math.abs(uiDisplayState.mpGhost - uiDisplayState.lastMpGhost) > 0.001) {
        uiDisplayState.lastMpGhost = uiDisplayState.mpGhost;
        if (cachedUI.mpGhostFill) cachedUI.mpGhostFill.style.height = uiDisplayState.mpGhost + '%';
    }
    if (Math.abs(uiDisplayState.xpPct - uiDisplayState.lastXpPct) > 0.001) {
        uiDisplayState.lastXpPct = uiDisplayState.xpPct;
        if (cachedUI.xpFill) cachedUI.xpFill.style.width = Math.min(100, uiDisplayState.xpPct) + '%';
        if (cachedUI.xpPercentage) cachedUI.xpPercentage.innerText = uiDisplayState.xpPct.toFixed(2) + '%';
    }

    if (uiDisplayState.gold !== player.gold) {
        const oldGold = (uiDisplayState.gold === -1) ? player.gold : uiDisplayState.gold;
        uiDisplayState.gold = player.gold;

        cachedUI.goldDisplays.forEach(el => {
            if (el) {
                // 如果元素可见，则播放滚动动画；否则直接更新文字
                if (el.offsetParent !== null) {
                    GSAPAnims.countUp(el, oldGold, player.gold, 0.8);
                    // 伴随一个小缩放脉冲
                    if (el.parentElement) GSAPAnims.pulse(el.parentElement, 1.05);
                } else {
                    el.innerText = player.gold.toLocaleString();
                }
            }
        });
    }

    if (uiDisplayState.lvl !== player.lvl) {
        uiDisplayState.lvl = player.lvl;
        if (cachedUI.hudLvl) {
            cachedUI.hudLvl.innerText = player.lvl;
            GSAPAnims.pulse(cachedUI.hudLvl.parentElement, 1.2);
        }
    }

    if (uiDisplayState.activeSkill !== player.activeSkill) {
        uiDisplayState.activeSkill = player.activeSkill;
        if (cachedUI.skillBtns.fireball) {
            for (let k in cachedUI.skillBtns) if (cachedUI.skillBtns[k]) cachedUI.skillBtns[k].classList.remove('active');
            const currentSkill = (player.activeSkill === 'attack') ? 'fireball' : player.activeSkill;
            if (cachedUI.skillBtns[currentSkill]) cachedUI.skillBtns[currentSkill].classList.add('active');
        }
    }

    // 中毒视觉同步
    if (uiDisplayState.lastPoisonedState !== player.poisoned) {
        uiDisplayState.lastPoisonedState = player.poisoned;
        if (cachedUI.hpOrb) {
            if (player.poisoned) cachedUI.hpOrb.classList.add('poisoned');
            else cachedUI.hpOrb.classList.remove('poisoned');
        }
    }

    // 冰冻/减速视觉同步
    const isChilled = (player.frozen || player.slowedTimer > 0);
    if (uiDisplayState.lastFrozenState !== isChilled) {
        uiDisplayState.lastFrozenState = isChilled;
        if (cachedUI.hpOrb) {
            if (isChilled) cachedUI.hpOrb.classList.add('chilled');
            else cachedUI.hpOrb.classList.remove('chilled', 'frozen');
        }
    }

    // 闪电过载视觉同步
    const isOverloaded = (player.lightningOverloadTimer > 0);
    if (uiDisplayState.lastOverloadedState !== isOverloaded) {
        uiDisplayState.lastOverloadedState = isOverloaded;
        if (cachedUI.mpOrb) {
            if (isOverloaded) cachedUI.mpOrb.classList.add('overloaded');
            else cachedUI.mpOrb.classList.remove('overloaded');
        }
    }

    // 濒危视觉警告脏检查
    const hpPercent = player.hp / player.maxHp;
    const isLowHp = hpPercent < 0.2 && player.hp > 0;
    if (uiDisplayState.lastLowHpState !== isLowHp) {
        uiDisplayState.lastLowHpState = isLowHp;
        if (cachedUI.lowHpVignette) {
            if (isLowHp) cachedUI.lowHpVignette.classList.add('active');
            else cachedUI.lowHpVignette.classList.remove('active');
        }
    }

    // --- Throttled Updates (10Hz) ---
    const now = Date.now();
    if (!uiDisplayState.lastThrottleTime || now - uiDisplayState.lastThrottleTime > 100) {
        uiDisplayState.lastThrottleTime = now;
        updateLabelsPosition();
        updateBuffIndicators();
        updateSkillCooldownUI();
        updateHellIndicator();
    }
}

// ========== 每日登录奖励配置 ==========
const DAILY_LOGIN_REWARDS = [
    { day: 1, icon: '💰', name: '200 金币', type: 'gold', amount: 200 },
    { day: 2, icon: '💰', name: '12小时双倍金币', type: 'buff_gold', amount: 12 },
    { day: 3, icon: '⚡', name: '24小时双倍经验', type: 'buff_xp', amount: 24 },
    { day: 4, icon: '⚡', name: '24小时双倍经验', type: 'buff_xp', amount: 24 },
    { day: 5, icon: '🎁', name: '24小时双倍掉落', type: 'buff_drop', amount: 24 },
    { day: 6, icon: '⚡', name: '24小时双倍经验', type: 'buff_xp', amount: 24 },
    { day: 7, icon: '🔥', name: '24小时三倍经验 + 套装装备', type: 'buff_xp_triple', amount: 24 }
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
spriteSheet.src = 'sprites.png?v=5.9';

let spritesLoaded = false;
let processedSpriteSheet = null;
const TintCache = {
    white: null,  // 受击闪白
    ice: null,    // 冰封/减速
    poison: null, // 中毒
    lightning: null // 闪电过载
};

// 生成染色版本精灵图（使用 filter 预处理，获得高质量视觉效果且不增加运行时负担）
function createTintedSpriteSheet(source, filterStr) {
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    ctx.filter = filterStr;
    ctx.drawImage(source, 0, 0);
    return canvas;
}

spriteSheet.onload = () => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = spriteSheet.width;
    tempCanvas.height = spriteSheet.height;
    tempCtx.drawImage(spriteSheet, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 25 && data[i + 1] < 25 && data[i + 2] < 25) data[i + 3] = 0;
    }
    tempCtx.putImageData(imageData, 0, 0);

    // 将普通 Image 对象改为 Canvas 对象，方便 TintCache 引用
    processedSpriteSheet = document.createElement('canvas');
    processedSpriteSheet.width = tempCanvas.width;
    processedSpriteSheet.height = tempCanvas.height;
    processedSpriteSheet.getContext('2d').drawImage(tempCanvas, 0, 0);

    // 预热 TintCache：使用与原版运行时滤镜完全一致的参数，确保视觉真实
    TintCache.white = createTintedSpriteSheet(processedSpriteSheet, 'brightness(500%) sepia(100%) saturate(0%)');
    TintCache.ice = createTintedSpriteSheet(processedSpriteSheet, 'sepia(100%) saturate(150%) hue-rotate(180deg) brightness(120%)');
    TintCache.poison = createTintedSpriteSheet(processedSpriteSheet, 'sepia(100%) saturate(300%) hue-rotate(80deg) brightness(80%)');
    TintCache.lightning = createTintedSpriteSheet(processedSpriteSheet, 'brightness(300%) saturate(50%)');

    spritesLoaded = true;
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
itemSpriteSheet.src = 'items.png?v=5.2';
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

// 程序化墙壁细节绘制 (使用 Sprite Sheet)
// 程序化墙壁细节绘制 (使用 Sprite Sheet)
// 返回是否成功绘制了 Sprite
function drawBiomeWallDetails(ctx, x, y, size, type, seed) {
    if (envSpritesLoaded && processedEnvSprites) {
        // 使用伪随机数决定画什么
        const hash = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
        const rand = hash - Math.floor(hash);

        // 10% 概率替换为装饰物，90% 保持原有墙壁
        if (rand < 0.1) {
            // 每个群系现在有 2 行变体 (共16种)
            let startRow = 6; // Default Misc (Rows 6-7)
            if (type === 'forest') startRow = 0;
            else if (type === 'ice') startRow = 2;
            else if (type === 'fire') startRow = 4;

            // 随机选择该群系的 2 行中的一行
            const row = startRow + (Math.floor(rand * 1000) % 2);

            // 随机选择该行的某一列 (0-7)
            const col = Math.floor(rand * 100) % 8;

            // 绘制贴图 - 修正裁切问题
            // 为了防止切到边缘或隔壁的图，我们向内收缩 5%
            const paddingX = envCellWidth * 0.05;
            const paddingY = envCellHeight * 0.05;

            // 源矩形 (在 Sprite Sheet 上的位置)
            const sx = col * envCellWidth + paddingX;
            const sy = row * envCellHeight + paddingY;
            const sw = envCellWidth - 2 * paddingX;
            const sh = envCellHeight - 2 * paddingY;

            // 目标尺寸
            // 保持宽高比
            const ratio = sw / sh;
            let drawH = size * 1.1; // 高度设为格子的 1.1 倍 (原 1.5)
            let drawW = drawH * ratio; // 宽度自适应

            // 居中偏移
            const offsetX = (size - drawW) / 2;
            const offsetY = (size - drawH) + 2; // 微调底部对齐

            ctx.drawImage(processedEnvSprites,
                sx, sy, sw, sh,
                x + offsetX, y + offsetY, drawW, drawH
            );
            return true;
        }
        return false;
    }
    return false;
}

// 加载环境装饰贴图 (Environment Sprites)
const envSpriteSheet = new Image();
envSpriteSheet.src = 'environment_sprites.png?v=5.2';

let envSpritesLoaded = false;
let processedEnvSprites = null;
let envCellWidth = 0;
let envCellHeight = 0;

envSpriteSheet.onload = () => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = envSpriteSheet.width;
    tempCanvas.height = envSpriteSheet.height;

    tempCtx.drawImage(envSpriteSheet, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 去除白色背景 (适应新生成的 Sprite Sheet)
        // 同时也去除了白色的网格线
        if (r > 200 && g > 200 && b > 200) {
            data[i + 3] = 0;
        }
    }

    tempCtx.putImageData(imageData, 0, 0);

    processedEnvSprites = new Image();
    processedEnvSprites.onload = () => {
        envSpritesLoaded = true;
        // 计算单个格子的尺寸 (8列 x 8行)
        // 之前是 4 行，现在 V3 是 8 行，必须除以 8，否则会一次切到两行图
        envCellWidth = processedEnvSprites.width / 8;
        envCellHeight = processedEnvSprites.height / 8;
        // 资源加载完成后重新生成地图缓存
        if (gameActive && mapData.length > 0) generateMapCache();
    };
    processedEnvSprites.src = tempCanvas.toDataURL();
};

// --- Destructible Sprites ---
const destructibleSpriteSheet = new Image();
destructibleSpriteSheet.src = 'destructibles_sprites.png?v=202512211022';
let destructiblesLoaded = false;
let processedDestructibleSprites = null;

destructibleSpriteSheet.onload = () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = destructibleSpriteSheet.width;
    tempCanvas.height = destructibleSpriteSheet.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(destructibleSpriteSheet, 0, 0);

    const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const data = imageData.data;
    // 去除白色背景 (阈值220)
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 220 && data[i + 1] > 220 && data[i + 2] > 220) data[i + 3] = 0;
    }
    tempCtx.putImageData(imageData, 0, 0);
    processedDestructibleSprites = tempCanvas;
    // 计算格尺寸 (3行 x 2列)
    DESTRUCTIBLE_CONFIG.cellWidth = processedDestructibleSprites.width / 2;
    DESTRUCTIBLE_CONFIG.cellHeight = processedDestructibleSprites.height / 3;
    destructiblesLoaded = true;
};

const DESTRUCTIBLE_CONFIG = {
    cellWidth: 0,
    cellHeight: 0,
    types: [
        { name: 'barrel', row: 0, color: '#8b4513' }, // 木桶
        { name: 'crate', row: 1, color: '#a0522d' },  // 木箱
        { name: 'urn', row: 2, color: '#696969' }     // 陶罐
    ]
};

const DestructibleSystem = {
    update: function (dt) {
        // 移除破碎超过 5 秒的物体
        const now = Date.now();
        for (let i = destructibles.length - 1; i >= 0; i--) {
            const d = destructibles[i];
            if (d.broken && d.brokenTime && now - d.brokenTime > 5000) {
                destructibles.splice(i, 1);
            }
        }
    },

    draw: function (ctx) {
        if (!destructiblesLoaded || !processedDestructibleSprites) return;

        destructibles.forEach(d => {
            // 视口剔除
            if (d.x < camera.x - 100 || d.x > camera.x + canvas.width + 100 ||
                d.y < camera.y - 120 || d.y > camera.y + canvas.height + 100) return;

            const sw = DESTRUCTIBLE_CONFIG.cellWidth;
            const sh = DESTRUCTIBLE_CONFIG.cellHeight;
            const sx = d.broken ? sw : 0;
            const sy = d.type.row * sh;

            // 再次增大尺寸，使其更加饱满
            const drawW = 42;
            const drawH = Math.round(drawW * (sh / sw));
            const rx = Math.round(d.x - drawW / 2);
            const ry = Math.round(d.y - drawH + 12); // 微调底部锚点

            ctx.drawImage(processedDestructibleSprites, sx, sy, sw, sh, rx, ry, drawW, drawH);
        });
    },

    break: function (d) {
        if (d.broken) return;
        d.broken = true;
        d.brokenTime = Date.now(); // 记录破碎时间

        // 震屏
        triggerScreenShake(3, 0.1);

        // 碎裂粒子
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 40 + Math.random() * 80;
            createSimpleParticle(d.x, d.y, d.type.color, speed, angle);
        }

        // 掉落逻辑
        const rand = Math.random();
        const f = player.isInHell ? player.hellFloor : player.floor;
        if (rand < 0.2) { // 20% 爆金币
            let goldAmount = Math.floor((5 + f * 2) * (0.8 + Math.random() * 0.4));
            groundItems.push({
                type: 'gold', val: Math.floor(goldAmount),
                x: d.x, y: d.y, z: 0,
                vx: (Math.random() - 0.5) * 80,
                vy: (Math.random() - 0.5) * 80,
                vz: 120 + Math.random() * 60,
                bounces: 1,
                soundLand: 'land_gold',
                rarity: 0, name: Math.floor(goldAmount) + " 金币", icon: '💰', dropTime: Date.now()
            });
        } else if (rand < 0.3) { // 10% 爆药水/卷轴
            const pRand = Math.random();
            let dropItem;
            if (pRand < 0.5) dropItem = { type: 'potion', name: '治疗药剂', heal: 50, rarity: 0, stackable: true, count: 1 };
            else if (pRand < 0.85) dropItem = { type: 'potion', name: '法力药剂', mana: 30, rarity: 0, stackable: true, count: 1 };
            else dropItem = { type: 'scroll', name: '回城卷轴', rarity: 0, stackable: true, count: 1 };

            groundItems.push({
                ...dropItem,
                x: d.x, y: d.y, z: 0,
                vx: (Math.random() - 0.5) * 60,
                vy: (Math.random() - 0.5) * 60,
                vz: 110 + Math.random() * 70,
                bounces: 1,
                soundLand: dropItem.type === 'potion' || dropItem.type === 'scroll' ? 'land_soft' : 'land_hard',
                dropTime: Date.now()
            });
        }

        // 音效
        AudioSys.play('land_hard');
    },

    checkMeleeCollision: function (x, y, range) {
        const rSq = range * range;
        destructibles.forEach(d => {
            if (!d.broken) {
                const dx = d.x - x, dy = d.y - y;
                if (dx * dx + dy * dy < rSq) {
                    this.break(d);
                }
            }
        });
    }
};

function createSimpleParticle(x, y, color, speed, angle) {
    const p = ParticlePool.acquire();
    p.x = x; p.y = y; p.z = 5 + Math.random() * 10;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.vz = 50 + Math.random() * 50;
    p.life = 0.5 + Math.random() * 0.5;
    p.color = color;
    p.size = 2 + Math.random() * 2;
    p.gravity = 600;
    p.canBake = true;
    particles.push(p);
}

const wallTiles = new Image();
wallTiles.src = 'wall_tiles.png?v=5.2';
let wallTilesLoaded = false;
wallTiles.onload = () => {
    wallTilesLoaded = true;
    // 资源加载完成后重新生成地图缓存
    if (gameActive && mapData.length > 0) generateMapCache();
};

function getBiomeStyle(floor) {
    if (floor === 0) return null; // Camp uses default
    if (player.isInHell) return { tint: 'rgba(200, 50, 0, 0.4)', type: 'fire', ice: false };

    // 1-10: 迷雾森林 (绿色, 潮湿)
    if (floor <= 10) return { tint: 'rgba(50, 200, 80, 0.25)', type: 'forest', ice: false };
    // 11-20: 冰封废墟 (蓝色, 滑)
    if (floor <= 20) return { tint: 'rgba(100, 220, 255, 0.35)', type: 'ice', ice: true };
    // 21+: 熔岩炼狱 (红色)
    return { tint: 'rgba(255, 80, 20, 0.3)', type: 'fire', ice: false };
}

function getWallTextureIndex(floor) {
    if (player.isInHell) return 2;
    // 复用现有的3张墙壁贴图来配合色调
    if (floor <= 10) return 0; // 石墙适合森林
    if (floor <= 20) return 1; // 洞穴墙适合冰窟
    return 2;                  // 地狱墙适合熔岩
}

const floorTiles = new Image();
floorTiles.src = 'floor_tiles.png?v=5.2';
let floorTilesLoaded = false;
floorTiles.onload = () => {
    floorTilesLoaded = true;
    // 资源加载完成后重新生成地图缓存
    if (gameActive && mapData.length > 0) generateMapCache();
};

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
        el.style.backgroundImage = "url('items.png?v=5.2')";
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

// 成就系统定义 - 按类别分组
// 类别: kill(击杀) explore(探索) collect(收集) combat(战斗) economy(经济) growth(成长)
const ACHIEVEMENTS = [
    // ===== 击杀类 (kill) =====
    {
        id: 'kill_fallen_100',
        name: '沉沦魔猎手',
        description: '击杀100只沉沦魔',
        target: 100,
        type: 'kill_monster',
        monsterName: '沉沦魔',
        category: 'kill',
        icon: '🗡️',
        points: 5
    },
    {
        id: 'kill_fallen_1000',
        name: '沉沦魔克星',
        description: '击杀1000只沉沦魔',
        target: 1000,
        type: 'kill_monster',
        monsterName: '沉沦魔',
        category: 'kill',
        icon: '⚔️',
        points: 15
    },
    {
        id: 'kill_boss_5',
        name: 'BOSS猎人',
        description: '击败5个首领级敌人',
        target: 5,
        type: 'kill_boss',
        category: 'kill',
        icon: '👹',
        points: 10
    },
    {
        id: 'kill_boss_20',
        name: 'BOSS终结者',
        description: '击败20个首领级敌人',
        target: 20,
        type: 'kill_boss',
        category: 'kill',
        icon: '💀',
        points: 25
    },
    {
        id: 'kill_boss_50',
        name: 'BOSS毁灭者',
        description: '击败50个首领级敌人',
        target: 50,
        type: 'kill_boss',
        category: 'kill',
        icon: '☠️',
        points: 50
    },
    {
        id: 'kill_elite_30',
        name: '精英猎人',
        description: '击杀30只精英怪物',
        target: 30,
        type: 'kill_elite',
        category: 'kill',
        icon: '🔱',
        points: 15
    },
    {
        id: 'kill_baal',
        name: '世界拯救者',
        description: '击败巴尔',
        target: 1,
        type: 'kill_specific_boss',
        bossName: '巴尔',
        category: 'kill',
        icon: '🌍',
        points: 30
    },

    // ===== 探索类 (explore) =====
    {
        id: 'reach_floor_5',
        name: '初探地牢',
        get description() { return `到达第5层「${getFloorName(5)}」`; },
        target: 5,
        type: 'reach_floor',
        category: 'explore',
        icon: '🚪',
        points: 5
    },
    {
        id: 'reach_floor_10',
        name: '地牢征服者',
        get description() { return `到达第10层「${getFloorName(10)}」`; },
        target: 10,
        type: 'reach_floor',
        category: 'explore',
        icon: '🏔️',
        points: 15
    },
    {
        id: 'reach_floor_20',
        name: '深渊探险家',
        get description() { return `到达第20层「${getFloorName(20)}」`; },
        target: 20,
        type: 'reach_floor',
        category: 'explore',
        icon: '🌋',
        points: 25
    },
    {
        id: 'reach_floor_30',
        name: '无尽追寻者',
        get description() { return `到达第30层「${getFloorName(30)}」`; },
        target: 30,
        type: 'reach_floor',
        category: 'explore',
        icon: '🌌',
        points: 40
    },
    {
        id: 'enter_hell',
        name: '地狱行者',
        description: '进入地狱模式',
        target: 1,
        type: 'enter_hell',
        category: 'explore',
        icon: '🔥',
        points: 20
    },

    // ===== 收集类 (collect) =====
    {
        id: 'collect_unique_1',
        name: '暗金初见',
        description: '获得1件暗金装备',
        target: 1,
        type: 'collect_unique',
        category: 'collect',
        icon: '✨',
        points: 5
    },
    {
        id: 'collect_unique_10',
        name: '暗金收藏家',
        description: '累计获得10件暗金装备',
        target: 10,
        type: 'collect_unique',
        category: 'collect',
        icon: '💎',
        points: 20
    },
    {
        id: 'collect_set_1',
        name: '套装初识',
        description: '获得1件套装装备',
        target: 1,
        type: 'collect_set_item',
        category: 'collect',
        icon: '🟢',
        points: 10
    },
    {
        id: 'collect_set_10',
        name: '套装收藏家',
        description: '累计获得10件套装装备',
        target: 10,
        type: 'collect_set_item',
        category: 'collect',
        icon: '🎁',
        points: 30
    },
    {
        id: 'equip_full_set',
        name: '套装大师',
        description: '同时穿戴一套完整套装（6件）',
        target: 6,
        type: 'equip_set',
        category: 'collect',
        icon: '👑',
        points: 50
    },

    // ===== 战斗类 (combat) =====
    {
        id: 'total_damage_100k',
        name: '伤害输出者',
        description: '累计造成10万点伤害',
        target: 100000,
        type: 'total_damage',
        category: 'combat',
        icon: '💥',
        points: 10
    },
    {
        id: 'total_damage_1m',
        name: '战场收割者',
        description: '累计造成100万点伤害',
        target: 1000000,
        type: 'total_damage',
        category: 'combat',
        icon: '⚡',
        points: 30
    },
    {
        id: 'crit_count_100',
        name: '暴击新手',
        description: '触发100次暴击',
        target: 100,
        type: 'crit_count',
        category: 'combat',
        icon: '💢',
        points: 10
    },
    {
        id: 'crit_count_1000',
        name: '暴击大师',
        description: '触发1000次暴击',
        target: 1000,
        type: 'crit_count',
        category: 'combat',
        icon: '🔥',
        points: 25
    },
    {
        id: 'combo_50',
        name: '连击达人',
        description: '达成50连击',
        target: 50,
        type: 'max_combo',
        category: 'combat',
        icon: '🎯',
        points: 20
    },
    {
        id: 'use_skill_500',
        name: '技能练习生',
        description: '使用技能500次',
        target: 500,
        type: 'skill_use',
        category: 'combat',
        icon: '🔮',
        points: 15
    },

    // ===== 经济类 (economy) =====
    {
        id: 'gold_10k',
        name: '小康之家',
        description: '累计获得1万金币',
        target: 10000,
        type: 'total_gold',
        category: 'economy',
        icon: '💰',
        points: 5
    },
    {
        id: 'gold_100k',
        name: '富甲一方',
        description: '累计获得10万金币',
        target: 100000,
        type: 'total_gold',
        category: 'economy',
        icon: '💵',
        points: 15
    },
    {
        id: 'gold_1m',
        name: '亿万富翁',
        description: '累计获得100万金币',
        target: 1000000,
        type: 'total_gold',
        category: 'economy',
        icon: '🏆',
        points: 40
    },
    {
        id: 'enhance_5',
        name: '铁匠学徒',
        description: '将装备强化至+5',
        target: 5,
        type: 'max_enhance',
        category: 'economy',
        icon: '🔨',
        points: 15
    },
    {
        id: 'enhance_9',
        name: '铁匠大师',
        description: '将装备强化至+9',
        target: 9,
        type: 'max_enhance',
        category: 'economy',
        icon: '⚒️',
        points: 50
    },

    // ===== 成长类 (growth) =====
    {
        id: 'reach_level_10',
        name: '冒险新秀',
        description: '达到等级10',
        target: 10,
        type: 'reach_level',
        category: 'growth',
        icon: '⭐',
        points: 5
    },
    {
        id: 'reach_level_30',
        name: '传奇英雄',
        description: '达到等级30',
        target: 30,
        type: 'reach_level',
        category: 'growth',
        icon: '🌟',
        points: 20
    },
    {
        id: 'reach_level_50',
        name: '不朽战神',
        description: '达到等级50',
        target: 50,
        type: 'reach_level',
        category: 'growth',
        icon: '👼',
        points: 40
    },
    {
        id: 'buy_talent_30',
        name: '天赋收集者',
        description: '购买30个天赋',
        target: 30,
        type: 'talent_bought',
        category: 'growth',
        icon: '📚',
        points: 15
    },
    {
        id: 'blessing_10',
        name: '赐福宠儿',
        description: '获得10次天神赐福',
        target: 10,
        type: 'blessing_count',
        category: 'growth',
        icon: '🌈',
        points: 20
    }
];

// 成就类别配置（统一使用金色调）
const ACHIEVEMENT_CATEGORIES = {
    kill: { name: '击杀', color: '#c7b377' },
    explore: { name: '探索', color: '#c7b377' },
    collect: { name: '收集', color: '#c7b377' },
    combat: { name: '战斗', color: '#c7b377' },
    economy: { name: '经济', color: '#c7b377' },
    growth: { name: '成长', color: '#c7b377' }
};

// 计算成就统计
function getAchievementStats() {
    let completed = 0, total = ACHIEVEMENTS.length, points = 0, maxPoints = 0;
    ACHIEVEMENTS.forEach(ach => {
        maxPoints += ach.points || 0;
        if (player.achievements[ach.id]?.completed) {
            completed++;
            points += ach.points || 0;
        }
    });
    return { completed, total, points, maxPoints };
}

function getHeroFrame(direction) {
    // 如果正在摆摊，使用坐姿帧（索引 4）
    if (typeof MarketSystem !== 'undefined' && MarketSystem.isStalling) {
        const frameX = 4 * SPRITE_CONFIG.frameWidth; // sit = 4
        const frameY = SPRITE_CONFIG.heroRow * SPRITE_CONFIG.frameHeight;
        return {
            x: frameX,
            y: frameY,
            width: SPRITE_CONFIG.frameWidth,
            height: SPRITE_CONFIG.frameHeight
        };
    }

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
function trackAchievement(type, data = {}) {
    ACHIEVEMENTS.forEach(ach => {
        if (ach.type !== type || !player.achievements[ach.id]) return;
        if (player.achievements[ach.id].completed) return;

        let progress = player.achievements[ach.id].progress || 0;
        let shouldCheck = false;

        switch (type) {
            case 'kill_monster':
                if (data.monsterName === ach.monsterName) {
                    player.achievements[ach.id].progress = ++progress;
                    shouldCheck = true;
                }
                break;

            case 'kill_boss':
                if (data.isBoss || data.isQuestTarget) {
                    player.achievements[ach.id].progress = ++progress;
                    shouldCheck = true;
                }
                break;

            case 'kill_elite':
                if (data.isElite) {
                    player.achievements[ach.id].progress = ++progress;
                    shouldCheck = true;
                }
                break;

            case 'kill_specific_boss':
                if (data.name === ach.bossName) {
                    player.achievements[ach.id].progress = ++progress;
                    shouldCheck = true;
                }
                break;

            case 'reach_floor':
                if (player.floor >= ach.target) {
                    completeAchievement(ach);
                }
                return;

            case 'reach_level':
                if (player.lvl >= ach.target) {
                    completeAchievement(ach);
                }
                return;

            case 'enter_hell':
                player.achievements[ach.id].progress = 1;
                completeAchievement(ach);
                return;

            case 'collect_unique':
                player.achievements[ach.id].progress = ++progress;
                shouldCheck = true;
                break;

            case 'collect_set_item':
                player.achievements[ach.id].progress = ++progress;
                shouldCheck = true;
                break;

            case 'total_damage':
                player.achievements[ach.id].progress = (progress + (data.damage || 0));
                shouldCheck = true;
                break;

            case 'crit_count':
                player.achievements[ach.id].progress = ++progress;
                shouldCheck = true;
                break;

            case 'max_combo':
                if ((data.combo || 0) > progress) {
                    player.achievements[ach.id].progress = data.combo;
                    shouldCheck = true;
                }
                break;

            case 'skill_use':
                player.achievements[ach.id].progress = ++progress;
                shouldCheck = true;
                break;

            case 'total_gold':
                player.achievements[ach.id].progress = (progress + (data.amount || 0));
                shouldCheck = true;
                break;

            case 'max_enhance':
                if ((data.level || 0) > progress) {
                    player.achievements[ach.id].progress = data.level;
                    shouldCheck = true;
                }
                break;

            case 'talent_bought':
                player.achievements[ach.id].progress = ++progress;
                shouldCheck = true;
                break;

            case 'blessing_count':
                player.achievements[ach.id].progress = ++progress;
                shouldCheck = true;
                break;
        }

        if (shouldCheck && player.achievements[ach.id].progress >= ach.target) {
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
    stuckTimer: 0,               // 无目标时的卡死检测计时器
    stuckPosTimer: 0,            // 位置位移卡死检测计时器
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
        let goalCol = Math.floor(goalX / TILE_SIZE);
        let goalRow = Math.floor(goalY / TILE_SIZE);

        // 边界检查
        if (startCol < 0 || startCol >= MAP_WIDTH || startRow < 0 || startRow >= MAP_HEIGHT) return null;
        if (goalCol < 0 || goalCol >= MAP_WIDTH || goalRow < 0 || goalRow >= MAP_HEIGHT) return null;

        // 目标是墙则尝试找附近最近的可行走瓦片
        if (mapData[goalRow][goalCol] === 0) {
            let found = false;
            // 搜索半径逐渐扩大
            for (let radius = 1; radius <= 3 && !found; radius++) {
                for (let dr = -radius; dr <= radius && !found; dr++) {
                    for (let dc = -radius; dc <= radius && !found; dc++) {
                        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue; // 只检查外圈
                        const nr = goalRow + dr;
                        const nc = goalCol + dc;
                        if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && mapData[nr][nc] !== 0) {
                            goalRow = nr;
                            goalCol = nc;
                            found = true;
                        }
                    }
                }
            }
            if (!found) return null; // 附近没有可行走的瓦片
        }

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

            const dx = e.x - player.x, dy = e.y - player.y;
            const distSq = dx * dx + dy * dy;

            // 近距离的怪（<100）：即使在墙角也要打，最高优先
            if (distSq < 10000 && distSq < minCloseDist * minCloseDist) {
                nearestClose = e;
                minCloseDist = Math.sqrt(distSq); // 这里需要实际距离，但由于判定频率低且已排除非近距离怪，影响较小
            }

            // 能看到的怪：优先选，范围600
            if (distSq < 360000 && distSq < minVisibleDist * minVisibleDist && hasLineOfSight(player.x, player.y, e.x, e.y)) {
                nearestVisible = e;
                minVisibleDist = Math.sqrt(distSq);
            }

            // 任意怪：范围扩大到1500（整个屏幕），用于绕路追击
            if (distSq < 2250000 && distSq < minAnyDist * minAnyDist) { // 1500^2 = 2250000
                nearestAny = e;
                minAnyDist = Math.sqrt(distSq);
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

        // 0. 物理位置卡死检测
        const moveDist = Math.hypot(player.x - this.lastPos.x, player.y - this.lastPos.y);

        // 如果有拾取目标，检测是否在接近目标
        if (player.targetItem) {
            const distToItem = Math.hypot(player.x - player.targetItem.x, player.y - player.targetItem.y);
            // 如果距离物品很近但拾取不了，或者长时间没接近物品，放弃
            if (distToItem < 50 && moveDist < 5) {
                this.stuckPosTimer += dt;
            } else if (moveDist < 10) {
                // 在移动但移动很慢（可能在绕路或卡住）
                this.stuckPosTimer += dt * 0.5;
            } else {
                this.stuckPosTimer = Math.max(0, this.stuckPosTimer - dt);
            }

            if (this.stuckPosTimer > 2) {
                this.blacklistedTargets.push({ target: player.targetItem, until: Date.now() + 30000 });
                createFloatingText(player.x, player.y - 70, "无法到达，放弃", "#ffaa00", 1.5);
                player.targetItem = null;
                player.targetX = null;
                player.targetY = null;
                this.stuckPosTimer = 0;
            }
        } else if (moveDist < 2) {
            this.stuckPosTimer += dt;
            if (this.stuckPosTimer > 3) {
                this.escapeFromStuck();
                this.stuckPosTimer = 0;
            }
        } else {
            this.stuckPosTimer = 0;
        }
        this.lastPos = { x: player.x, y: player.y };

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
            const tdx = this.currentTarget.x - player.x;
            const tdy = this.currentTarget.y - player.y;
            if (tdx * tdx + tdy * tdy > 3600) { // 60^2 = 3600
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
        const inventoryFull = player.inventory.filter(it => it !== null).length >= player.inventory.length;

        // 检查能否为物品腾出空间（只要背包里有比目标稀有度低的物品就可以腾位）
        const canMakeRoom = (targetRarity) => {
            // 只有装备（稀有度>=2）才考虑腾位
            if (targetRarity < 2) return false;
            for (let i = 0; i < player.inventory.length; i++) {
                const it = player.inventory[i];
                if (!it) continue;
                // 药水、卷轴不丢
                if (it.type === 'potion' || it.type === 'scroll') continue;
                // 如果背包里的物品稀有度低于目标，就可以腾位
                if (it.rarity < targetRarity) return true;
            }
            return false;
        };

        // 候选物品列表
        let setItems = [];      // 套装：最高优先级
        let urgentPotions = []; // 紧急药水
        let uniqueItems = [];   // 暗金/稀有
        let goldItems = [];     // 金币
        let consumables = [];   // 药水/卷轴
        let normalItems = [];   // 蓝/黄

        const hasHealPotion = player.inventory.some(it => it && it.name === CONSUMABLE_NAME.HEALTH_POTION);
        const hasManaPotion = player.inventory.some(it => it && it.name === CONSUMABLE_NAME.MANA_POTION);

        for (let i = 0; i < groundItems.length; i++) {
            const it = groundItems[i];
            if (!it) continue;

            // 过滤黑名单物品
            if (this.blacklistedTargets.some(b => b.target === it && Date.now() < b.until)) continue;

            const dist = Math.hypot(it.x - player.x, it.y - player.y);
            if (it.dropTime && Date.now() - it.dropTime < 3000) continue; // 刚丢弃的物品不捡

            // 视线检查：普通物品需要视线；极品物品（套装/暗金/金币）如果距离近即便没视线也要捡（可能在拐角）
            const isSuperRare = it.rarity >= 4 || it.type === 'gold';
            if (!isSuperRare && !hasLineOfSight(player.x, player.y, it.x, it.y)) continue;
            // 即便没视线，极品物品距离也有限制（防止全图跑）
            if (isSuperRare && dist > 800) continue;

            // 分类
            if (it.type === 'gold' && player.autoPickup.gold && dist < 600) {
                goldItems.push({ item: it, dist, priority: 1 }); // 金币优先级提升至与套装相同
            } else if (it.rarity === 5 && dist < 500) {
                if (!inventoryFull || canMakeRoom(5)) setItems.push({ item: it, dist, priority: 1 });
            } else if (it.rarity === 4 && dist < 500) {
                if (!inventoryFull || canMakeRoom(4)) uniqueItems.push({ item: it, dist, priority: 3 });
            } else if (it.rarity === 3 && dist < 400) {
                if (!inventoryFull || canMakeRoom(3)) uniqueItems.push({ item: it, dist, priority: 4 });
            } else if ((it.name === CONSUMABLE_NAME.HEALTH_POTION || it.name === CONSUMABLE_NAME.MANA_POTION)) {
                if (player.autoPickup.potion && dist < 400) {
                    const needUrgent = (it.name === CONSUMABLE_NAME.HEALTH_POTION && !hasHealPotion) || (it.name === CONSUMABLE_NAME.MANA_POTION && !hasManaPotion);
                    if (needUrgent) urgentPotions.push({ item: it, dist, priority: 2 });
                    else consumables.push({ item: it, dist, priority: 6 });
                }
            } else if (it.name === CONSUMABLE_NAME.TOWN_PORTAL && player.autoPickup.scroll && dist < 400) {
                consumables.push({ item: it, dist, priority: 6 });
            } else if (it.rarity >= 2 && dist < 300 && !inventoryFull) {
                normalItems.push({ item: it, dist, priority: 7 });
            }
        }

        // 优先级决断逻辑
        let bestCandidate = null;
        const candidates = [...setItems, ...urgentPotions, ...uniqueItems, ...goldItems, ...consumables, ...normalItems];
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
            bestCandidate = candidates[0].item;
            bestCandidate.prioValue = candidates[0].priority;
        }

        // 激烈战斗判定
        const pX = player.x, pY = player.y;
        const inHeavyCombat = enemies.some(e => {
            if (e.dead) return false;
            const dx = e.x - pX, dy = e.y - pY;
            return dx * dx + dy * dy < 6400; // 80^2 = 6400
        });

        // 如果当前已有目标，检查是否需要切换
        if (player.targetItem) {
            const oldExists = groundItems.includes(player.targetItem);
            const oldPrio = player.targetItem.prioValue || 99;
            const oldDist = Math.hypot(player.targetItem.x - player.x, player.targetItem.y - player.y);

            // 切换条件：旧目标消失，或新目标优先级更高，或同优先级但距离近50%以上
            const shouldSwitch = !oldExists ||
                (bestCandidate && bestCandidate.prioValue < oldPrio) ||
                (bestCandidate && bestCandidate.prioValue === oldPrio && bestCandidate.dist < oldDist * 0.5);

            if (shouldSwitch) {
                // 切换到新目标
                player.targetItem = null;
            } else {
                // 保持旧目标，除非旧目标在激烈战斗中且不够重要
                if (inHeavyCombat && oldPrio > 3 && Math.hypot(player.targetItem.x - player.x, player.targetItem.y - player.y) > 100) {
                    player.targetItem = null; // 战斗中暂缓低优先级拾取
                } else {
                    // 保持旧目标，但需要持续更新路径点（用于 A* 寻路）
                    const item = player.targetItem;
                    if (hasLineOfSight(player.x, player.y, item.x, item.y)) {
                        player.targetX = item.x;
                        player.targetY = item.y;
                    } else {
                        const pathPoint = this.findPathToTarget(item.x, item.y);
                        if (pathPoint) {
                            player.targetX = pathPoint.x;
                            player.targetY = pathPoint.y;
                        } else {
                            // 找不到路，放弃
                            this.blacklistedTargets.push({ target: item, until: Date.now() + 30000 });
                            player.targetItem = null;
                            player.targetX = null;
                            player.targetY = null;
                        }
                    }
                    return;
                }
            }
        }

        // 选择最合适的捡取目标
        let selected = bestCandidate;
        if (selected && inHeavyCombat) {
            // 激烈战斗中，只允许捡套装(1)、紧急药水(2)或已经在脚下的东西
            if (selected.prioValue > 2 && Math.hypot(selected.x - player.x, selected.y - player.y) > 150) {
                selected = null;
            }
        }

        if (selected) {
            if (inventoryFull && selected.rarity >= 3) {
                this.dropLowestValueItem(selected.rarity);
            }

            // 检查是否有视线，决定移动方式
            if (hasLineOfSight(player.x, player.y, selected.x, selected.y)) {
                // 有视线，直接走过去
                player.targetItem = selected;
                player.targetX = selected.x;
                player.targetY = selected.y;
            } else {
                // 没有视线，使用 A* 寻路
                const pathPoint = this.findPathToTarget(selected.x, selected.y);
                if (pathPoint) {
                    player.targetItem = selected;
                    player.targetX = pathPoint.x;
                    player.targetY = pathPoint.y;
                } else {
                    // A* 找不到路，放弃这个物品，加入黑名单 30 秒
                    this.blacklistedTargets.push({ target: selected, until: Date.now() + 30000 });
                    player.targetItem = null;
                    player.targetX = null;
                    player.targetY = null;
                }
            }
            selected.prioValue = selected.prioValue; // 记录优先级用于下次对比
        }
    },

    // 丢弃背包中最低价值物品（用于给更高稀有度的物品腾位）
    dropLowestValueItem(targetRarity) {
        let lowestIdx = -1, lowestVal = Infinity;
        for (let i = 0; i < player.inventory.length; i++) {
            const it = player.inventory[i];
            if (!it) continue;
            // 药水、卷轴不丢
            if (it.type === 'potion' || it.type === 'scroll') continue;
            // 只有比目标稀有度低的物品才会被丢弃
            if (it.rarity < targetRarity) {
                const val = (it.rarity || 0) * 1000 + (it.def || 0) + (it.minDmg || 0);
                if (val < lowestVal) { lowestVal = val; lowestIdx = i; }
            }
        }
        if (lowestIdx >= 0) {
            const item = player.inventory[lowestIdx];
            player.inventory[lowestIdx] = null;
            groundItems.push({ ...item, x: player.x, y: player.y, dropTime: Date.now() });
            createFloatingText(player.x, player.y - 40, `丢弃 ${item.name}`, '#888', 1.5);
            return true;
        }
        return false;
    },


};

// 自动拾取设置切换
function toggleAutoPickup(itemType) {
    let checkbox = null;
    if (itemType === 'gold') checkbox = cachedUI.chkAutoGold;
    else if (itemType === 'potion') checkbox = cachedUI.chkAutoPotion;
    else if (itemType === 'scroll') checkbox = cachedUI.chkAutoScroll;

    if (!checkbox) return;
    player.autoPickup[itemType] = checkbox.checked;
    SaveSystem.save();
    showNotification(`自动拾取${itemType === 'gold' ? '金币' : itemType === 'potion' ? '药水' : '卷轴'}：${checkbox.checked ? '开启' : '关闭'}`);
}

// 画质设置切换
function toggleGraphicsQuality() {
    if (!cachedUI.selectGraphicsQuality) return;
    const val = cachedUI.selectGraphicsQuality.value;
    player.graphicsQuality = val;
    document.body.classList.toggle('high-quality', val === 'high');
    SaveSystem.save();
    showNotification(`特效质量：${val === 'high' ? '华丽特效' : '性能优先'}`);
}

// ========== 离线收益系统 ==========
const OfflineRewards = {
    // 配置常量
    MAX_OFFLINE_HOURS: 8,        // 最大离线时长（小时）
    MIN_OFFLINE_MINUTES: 5,      // 最小离线时长（分钟）
    EFFICIENCY: 0.5,             // 离线效率（在线的50%）

    // 每小时基础收益（1层时）
    BASE_GOLD_PER_HOUR: 600,
    BASE_XP_PER_HOUR: 80,

    // 装备掉落概率（每小时）
    MAGIC_DROP_CHANCE: 0.15,     // 蓝装 15%/小时
    RARE_DROP_CHANCE: 0.03,      // 黄装 3%/小时

    // 装备转金币价值
    MAGIC_TO_GOLD: 50,
    RARE_TO_GOLD: 150,

    // 计算楼层系数（无限楼层适配）
    getFloorMultiplier(floor) {
        // 1-10层：1.0 + 层×0.1 = 1.1 ~ 2.0
        // 11-20层：2.0 + (层-10)×0.08 = 2.08 ~ 2.8
        // 21-30层：2.8 + (层-20)×0.06 = 2.86 ~ 3.4
        // 31+层：3.4 + (层-30)×0.04，封顶5.0
        if (floor <= 10) {
            return 1.0 + floor * 0.1;
        } else if (floor <= 20) {
            return 2.0 + (floor - 10) * 0.08;
        } else if (floor <= 30) {
            return 2.8 + (floor - 20) * 0.06;
        } else {
            return Math.min(5.0, 3.4 + (floor - 30) * 0.04);
        }
    },

    // 计算离线收益
    calculate(lastOnlineTime, maxFloor) {
        const now = Date.now();
        const offlineMs = now - lastOnlineTime;
        const offlineMinutes = offlineMs / 60000;

        // 离线时间不足5分钟，无收益
        if (offlineMinutes < this.MIN_OFFLINE_MINUTES) {
            return null;
        }

        // 限制最大离线时长
        const cappedHours = Math.min(offlineMinutes / 60, this.MAX_OFFLINE_HOURS);

        // 使用历史最高普通楼层（不计地狱）
        const effectiveFloor = maxFloor || 1;

        const floorMult = this.getFloorMultiplier(effectiveFloor);

        // 计算金币和经验
        const gold = Math.floor(this.BASE_GOLD_PER_HOUR * cappedHours * floorMult * this.EFFICIENCY);
        const xp = Math.floor(this.BASE_XP_PER_HOUR * cappedHours * floorMult * this.EFFICIENCY);

        // 计算装备掉落数量
        const magicRolls = cappedHours * this.MAGIC_DROP_CHANCE;
        const rareRolls = cappedHours * this.RARE_DROP_CHANCE;

        // 使用概率累积生成装备数量
        let magicCount = Math.floor(magicRolls);
        if (Math.random() < (magicRolls - magicCount)) magicCount++;

        let rareCount = Math.floor(rareRolls);
        if (Math.random() < (rareRolls - rareCount)) rareCount++;

        // 生成装备列表
        const items = [];
        const itemLevel = Math.max(1, effectiveFloor);

        for (let i = 0; i < rareCount; i++) {
            items.push(this.generateOfflineItem(itemLevel, 3)); // 黄装
        }
        for (let i = 0; i < magicCount; i++) {
            items.push(this.generateOfflineItem(itemLevel, 2)); // 蓝装
        }

        return {
            offlineMinutes: Math.floor(offlineMinutes),
            cappedHours: cappedHours,
            gold: gold,
            xp: xp,
            items: items,
            floor: effectiveFloor
        };
    },

    // 生成离线装备
    generateOfflineItem(level, rarity) {
        const types = ['weapon', 'armor', 'helm', 'gloves', 'boots', 'belt', 'ring', 'amulet'];
        // 名称必须与 BASE_ITEMS 完全匹配，否则 createItem 会随机选择物品（可能选中药水/卷轴）
        const typeNames = ['短剑', '皮甲', '皮帽', '皮手套', '皮靴', '轻扣带', '铜戒指', '护身符'];
        const typeIdx = Math.floor(Math.random() * types.length);

        const item = createItem(typeNames[typeIdx], level);
        item.rarity = rarity;

        // 根据稀有度重新生成属性
        if (rarity >= 2) {
            const p = AFFIXES.prefixes[Math.floor(Math.random() * AFFIXES.prefixes.length)];
            item.displayName = p.name + " " + item.name;
            item.stats[p.stat] = Math.floor(Math.random() * (p.max - p.min)) + p.min;
        }
        if (rarity >= 3) {
            const s = AFFIXES.suffixes[Math.floor(Math.random() * AFFIXES.suffixes.length)];
            item.displayName += s.name;
            item.stats[s.stat] = (item.stats[s.stat] || 0) + Math.floor(Math.random() * (s.max - s.min)) + s.min;
        }

        return item;
    },

    // 领取离线收益
    claim(rewards) {
        if (!rewards) return { success: false };

        // 1. 发放金币
        addGold(rewards.gold);

        // 2. 发放经验
        const oldLvl = player.lvl;
        player.xp += rewards.xp;
        while (player.xp >= player.xpNext) {
            player.xp -= player.xpNext;
            player.lvl++;
            player.points += 5;
            player.skillPoints += 1;
            player.xpNext = Math.floor(100 * Math.pow(1.15, player.lvl - 1));
        }
        const leveledUp = player.lvl > oldLvl;

        // 3. 发放装备（背包满则转金币）
        let itemsReceived = 0;
        let itemsConverted = 0;
        let convertedGold = 0;

        for (const item of rewards.items) {
            const emptySlot = player.inventory.findIndex(x => !x);
            if (emptySlot >= 0) {
                player.inventory[emptySlot] = item;
                itemsReceived++;
                trackItemFound(item);
            } else {
                // 背包满，转化为金币
                const goldValue = item.rarity === 3 ? this.RARE_TO_GOLD : this.MAGIC_TO_GOLD;
                addGold(goldValue);
                itemsConverted++;
                convertedGold += goldValue;
            }
        }

        // 标记已领取
        player.offlineRewardsClaimed = true;
        player.lastOnlineTime = Date.now();

        // 更新UI
        updateStats();
        updateUI();
        renderInventory();

        return {
            success: true,
            itemsReceived,
            itemsConverted,
            convertedGold,
            leveledUp,
            newLevel: player.lvl
        };
    },

    // 显示离线收益面板
    showPanel(rewards) {
        if (!rewards) return;

        const overlay = document.getElementById('offline-rewards-overlay');
        if (!overlay) return;

        // 格式化离线时间
        let timeText;
        if (rewards.offlineMinutes < 60) {
            timeText = `${rewards.offlineMinutes} 分钟`;
        } else {
            const hours = Math.floor(rewards.offlineMinutes / 60);
            const mins = rewards.offlineMinutes % 60;
            timeText = mins > 0 ? `${hours} 小时 ${mins} 分钟` : `${hours} 小时`;
        }

        // 如果超过8小时，显示提示
        if (rewards.cappedHours >= this.MAX_OFFLINE_HOURS) {
            timeText += ` <span style="color:#888;">(最多计算${this.MAX_OFFLINE_HOURS}小时)</span>`;
        }

        const floorText = `第${rewards.floor}层`;

        // 装备列表HTML
        let itemsHtml = '';
        if (rewards.items.length > 0) {
            itemsHtml = '<div class="offline-items">';
            for (const item of rewards.items) {
                const color = item.rarity === 3 ? '#ffff00' : '#4d94ff';
                itemsHtml += `<div class="offline-item" style="color:${color};">${item.displayName}</div>`;
            }
            itemsHtml += '</div>';
        } else {
            itemsHtml = '<div class="offline-items-empty">无装备掉落</div>';
        }

        document.getElementById('offline-time-text').innerHTML = timeText;
        document.getElementById('offline-floor-text').innerText = floorText;
        document.getElementById('offline-gold-text').innerText = rewards.gold.toLocaleString();
        document.getElementById('offline-xp-text').innerText = rewards.xp.toLocaleString();
        document.getElementById('offline-items-container').innerHTML = itemsHtml;

        // 存储待领取的奖励
        window.pendingOfflineRewards = rewards;

        overlay.classList.add('active');
        AudioSys.play('levelup');
    },

    // 关闭面板并领取
    claimAndClose() {
        const rewards = window.pendingOfflineRewards;
        if (!rewards) return;

        const result = this.claim(rewards);

        // 播放领取音效
        AudioSys.play('coins');

        // 显示飘字效果（金币和经验）
        const baseY = player.y - 40;
        let delay = 0;

        // 金币飘字（金色）
        setTimeout(() => {
            createDamageNumber(player.x, baseY, `+${rewards.gold.toLocaleString()} G`, '#ffd700', true);
        }, delay);
        delay += 200;

        // 经验飘字（青色）
        setTimeout(() => {
            createDamageNumber(player.x, baseY - 20, `+${rewards.xp.toLocaleString()} XP`, '#00ffff', true);
        }, delay);
        delay += 200;

        // 装备数量飘字（如果有）
        if (result.itemsReceived > 0) {
            setTimeout(() => {
                createDamageNumber(player.x, baseY - 40, `+${result.itemsReceived} 装备`, '#ff88ff', true);
            }, delay);
            delay += 200;
        }

        // 升级特效
        if (result.leveledUp) {
            setTimeout(() => {
                createDamageNumber(player.x, baseY - 60, `升级! Lv.${result.newLevel}`, '#ffff00', true);
                AudioSys.play('levelup');
                // 升级光效
                for (let i = 0; i < 20; i++) {
                    particles.push({
                        x: player.x, y: player.y,
                        vx: (Math.random() - 0.5) * 200,
                        vy: -Math.random() * 150 - 50,
                        life: 1, maxLife: 1,
                        color: '#ffd700', size: 4
                    });
                }
            }, delay);
        }

        // 显示领取结果通知
        let msg = `离线收益已领取！`;
        if (result.itemsConverted > 0) {
            msg += `\n${result.itemsConverted}件装备因背包已满转化为${result.convertedGold}金币`;
        }
        if (result.leveledUp) {
            msg += `\n恭喜升级到 Lv.${result.newLevel}！`;
        }
        showNotification(msg);

        // 关闭面板
        document.getElementById('offline-rewards-overlay').classList.remove('active');
        window.pendingOfflineRewards = null;

        // 保存
        SaveSystem.save();
    }
};

// 领取离线收益（UI调用）
function claimOfflineRewards() {
    OfflineRewards.claimAndClose();
}

// 检查离线收益（游戏启动时调用）
function checkOfflineRewards() {
    // 使用 startGame() 开头缓存的离线时间（在 enterFloor 触发 save 之前读取的）
    const cachedTime = _cachedOfflineTime;
    _cachedOfflineTime = null;

    // 优先使用缓存的时间（这是关闭浏览器时保存的真实离线时间）
    if (cachedTime) {
        player.lastOnlineTime = cachedTime;
    }

    // 新玩家或没有上次在线时间记录，初始化
    if (!player.lastOnlineTime) {
        player.lastOnlineTime = Date.now();
        player.offlineRewardsClaimed = true;
        return;
    }

    // 计算离线收益（只使用普通楼层，不计地狱）
    const maxFloor = player.personalBest ? player.personalBest.maxFloor : (player.maxFloor || 1);
    const rewards = OfflineRewards.calculate(player.lastOnlineTime, maxFloor);

    if (rewards) {
        player.offlineRewardsClaimed = false;
        // 延迟显示，避免与每日登录面板冲突
        setTimeout(() => {
            const dailyPanel = document.getElementById('daily-login-panel');
            if (dailyPanel && dailyPanel.style.display !== 'none') {
                const checkInterval = setInterval(() => {
                    if (dailyPanel.style.display === 'none') {
                        clearInterval(checkInterval);
                        OfflineRewards.showPanel(rewards);
                    }
                }, 500);
            } else {
                OfflineRewards.showPanel(rewards);
            }
        }, 500);
    } else {
        player.offlineRewardsClaimed = true;
    }
}

// 精英怪词缀系统（含回调函数，保留在主文件）
// 精英怪词缀系统 (已移至 enemy-system.js)

function init() {
    resize(); window.addEventListener('resize', resize);
    initUICache();
    initDragging();
    SaveSystem.init();

    // 页面关闭前保存在线时间（用于离线收益计算）
    // 注意：IndexedDB 是异步的，beforeunload 中可能写入失败
    // 所以用 localStorage 保存时间戳（同步写入，100%可靠）
    window.addEventListener('beforeunload', () => {
        // 【重要】只有游戏真正开始后才保存，避免在首页刷新时覆盖存档
        if (!gameActive) return;

        const now = Date.now();
        // 用 localStorage 保存关键时间戳（同步，可靠）
        if (SaveSystem.currentSlot) {
            localStorage.setItem(`lastOnlineTime_slot${SaveSystem.currentSlot}`, now.toString());
        }
        // IndexedDB 保存作为备份（可能失败）
        player.lastOnlineTime = now;
        if (db && SaveSystem.currentSlot) {
            const clean = i => { if (!i) return null; const { el, ...r } = i; return r; };
            const eq = {}; for (let k in player.equipment) eq[k] = clean(player.equipment[k]);

            const data = {
                id: `slot_${SaveSystem.currentSlot}`,
                slotId: SaveSystem.currentSlot,
                ...player,
                inventory: player.inventory.map(clean),
                equipment: eq,
                stash: player.stash.map(clean),
                targetItem: clean(player.targetItem),
                townPortal: townPortal,
                settings: Settings,
                autoBattleSettings: AutoBattle.settings,
                lastPlayed: now,
                mapData: null,
                enemies: null,
                particles: null,
                projectiles: null,
                damageNumbers: null
            };

            const tx = db.transaction(['saveData'], 'readwrite');
            tx.objectStore('saveData').put(data);
        }
    });
}
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }

async function confirmResetSave() {
    // 检查是否有存档
    const hasSave = cachedUI.saveStatus && cachedUI.saveStatus.innerText.includes('发现存档');

    let message = '⚠️ 警告：此操作将永久删除所有存档数据！\n\n';

    if (hasSave) {
        // 提取存档信息
        const match = cachedUI.saveStatus.innerText.match(/发现存档: Lv(\d+) - (.+)/);
        if (match) {
            const level = match[1];
            const location = match[2];
            message += `当前存档：等级 ${level} - ${location}\n\n`;
        }
    }

    message += '是否确定要清除所有存档？\n\n此操作无法撤销！';

    const confirmed = await OnlineSystem.showConfirm(message, '重置确认');
    if (confirmed) {
        SaveSystem.reset();
    }
}

// ========== 存档选择系统 ==========
let pendingDeleteSlot = null;  // 待删除的槽位

// 显示存档选择面板
async function showSlotSelection() {
    // 防御性检查：存档系统未就绪时不允许操作
    if (!SaveSystem.isReady) {
        console.warn('[存档系统] 尚未初始化完成，请稍候...');
        return;
    }

    // 新用户检测：必须先选择开始方式
    if (typeof OnlineSystem !== 'undefined' && !OnlineSystem.nickname) {
        CloudSync.showNewUserDialog();
        return;
    }

    // 多设备检测（已绑定云同步的用户）
    if (typeof OnlineSystem !== 'undefined' && OnlineSystem.userId) {
        const check = await OnlineSystem.checkOtherDeviceOnline();
        if (check.online) {
            const confirmed = await OnlineSystem.showConfirm('检测到其他设备正在游戏中。\n\n继续登录将踢掉该设备，是否继续？', '登录提示');
            if (!confirmed) {
                return;
            }
            // 接管会话
            await OnlineSystem.takeoverSession(check.recordId);
        }
    }

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

    // 进入游戏时建立在线状态（心跳、Realtime 订阅）
    if (typeof OnlineSystem !== 'undefined' && OnlineSystem.nickname) {
        await OnlineSystem.startOnline();
    }

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

// 用于保存离线时间戳（在 enterFloor 调用 save 之前读取）
let _cachedOfflineTime = null;

function startGame() {
    // 在任何 SaveSystem.save() 调用之前，先读取 localStorage 中的离线时间
    const localStorageKey = `lastOnlineTime_slot${SaveSystem.currentSlot}`;
    const localStorageTime = localStorage.getItem(localStorageKey);
    if (localStorageTime) {
        _cachedOfflineTime = parseInt(localStorageTime);
    }

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

        // 向后兼容：画质设置
        if (!player.graphicsQuality) {
            player.graphicsQuality = 'high';
        }
        document.body.classList.toggle('high-quality', player.graphicsQuality === 'high');

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

        // 加载仓库扩建等级
        player.stashLevel = window.pendingLoadData.stashLevel || 0;

        // 加载仓库数据，根据扩建等级调整大小
        const expectedSize = STASH_BASE_SIZE + player.stashLevel * STASH_EXPAND_PER_LEVEL;
        if (window.pendingLoadData.stash) {
            // 如果存档是旧版60格，截断为当前应有大小
            if (window.pendingLoadData.stash.length === 60) {
                player.stash = window.pendingLoadData.stash.slice(0, expectedSize);
            } else {
                player.stash = window.pendingLoadData.stash;
            }
            // 确保数组大小正确
            while (player.stash.length < expectedSize) {
                player.stash.push(null);
            }
        } else if (!player.stash) {
            player.stash = Array(expectedSize).fill(null);
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
        if (isNaN(player.xpNext) || player.xpNext <= 0) player.xpNext = 100 * Math.pow(1.38, player.lvl - 1);
        // v4.8 存档迁移：修正旧版本(1.5倍率)过高的经验需求，保持进度比例
        const expectedXpNext = Math.floor(100 * Math.pow(1.38, player.lvl - 1));
        if (player.xpNext > expectedXpNext * 1.5) {
            const progress = player.xp / player.xpNext;  // 保存当前进度比例
            console.log(`[存档迁移] xpNext 从 ${player.xpNext} 修正为 ${expectedXpNext}，进度 ${(progress * 100).toFixed(1)}%`);
            player.xpNext = expectedXpNext;
            player.xp = Math.floor(expectedXpNext * progress);  // 按比例缩放xp
        }
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

        // 向后兼容：旧存档没有离线收益系统
        if (player.lastOnlineTime === undefined) player.lastOnlineTime = null;
        if (player.offlineRewardsClaimed === undefined) player.offlineRewardsClaimed = true;

        // ========== 属性系统迁移 v3.9 ==========
        // 将旧的基础属性(str/dex/vit/ene)转换为直接效果属性
        migrateItemStats();
    }
    else {
        // 新玩家初始装备
        const starterSword = createItem('短剑', 0);
        starterSword.rarity = 1;  // 强制白色
        starterSword.requirements = null;  // 移除需求限制
        addItemToInventory(starterSword);  // 1. 武器
        addItemToInventory(createItem('治疗药剂', 0));  // 2. 1红
        addItemToInventory(createItem('法力药剂', 0));  // 3. 蓝1
        addItemToInventory(createItem('法力药剂', 0));  // 4. 蓝2
        addItemToInventory(createItem('法力药剂', 0));  // 5. 蓝3
        addItemToInventory(createItem('回城卷轴', 0));  // 6. 回城
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

    // 同步画质设置的选择框状态
    document.getElementById('select-graphics-quality').value = player.graphicsQuality || 'high';

    updateStats(); enterFloor(player.floor, 'start'); renderInventory(); updateStatsUI(); updateSkillsUI(); updateUI(); updateBeltUI(); updateQuestUI(); updateMenuIndicators();
    updateTalentHUD(); // 更新天赋HUD显示
    updateDivineBlessingHUD(); // 更新天神赐福HUD
    checkDailyLogin(); // 检查每日登录奖励
    checkOfflineRewards(); // 检查离线收益
    checkTutorial(); // 检查新手引导
    // 初始化每日任务系统
    if (typeof DailyQuestSystem !== 'undefined') {
        DailyQuestSystem.checkAndReset();
    }
    updateQuestTracker(); // 更新任务追踪器（包含每日任务）
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
            maxFloor: player.isInHell ? (player.maxHellFloor || player.hellFloor) + 10 : player.maxFloor,
            isHell: player.isInHell,
            gold: player.gold || 0
        });
    }

    // 回收所有敌人到对象池
    enemies.forEach(e => EnemyPool.release(e));
    enemies = []; groundItems = []; projectiles = []; npcs = [];
    destructibles = []; // 清空可破坏物体

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

        // 初始化摆摊系统
        if (typeof MarketSystem !== 'undefined') {
            MarketSystem.init();
        }

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
        const floorName = getFloorName(displayFloor, isInHell);
        document.getElementById('floor-display').innerText = `${displayFloor}层 ${floorName}`;

        generateDungeon();

        // 获取当前难度系数（在地狱中始终使用hell难度）
        const difficulty = isInHell ? DIFFICULTY_MODIFIERS.hell : DIFFICULTY_MODIFIERS.normal;

        // 怪物数量随层数增长：1层少，10层后固定
        const enemyScale = Math.min(1, 0.4 + f * 0.06);
        const enemyCount = Math.floor(GAME_CONFIG.INITIAL_ENEMIES * enemyScale);
        for (let i = 0; i < enemyCount; i++) {
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
            if (f >= 5) monsterPool.push({ type: 'specter', name: '闪电幽魂', ai: 'specter', speed: 70, hpMult: 0.8, dmgMult: 1.4, weight: 10 });
            if (f >= 6) monsterPool.push({ type: 'mummy', name: '木乃伊', ai: 'chase', speed: 55, hpMult: 1.3, dmgMult: 0.9, weight: 10 });
            if (f >= 7) monsterPool.push({ type: 'vampire', name: '吸血鬼', ai: 'vampire', speed: 60, hpMult: 1.2, dmgMult: 1.3, weight: 10 });

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
            let baseXp = 20 + f * 5 + Math.floor(f * f * 0.2);

            if (isInHell) {
                baseHp = 60 + Math.floor(f * f * 10);
                baseDmg = 10 + f * 4;
                baseXp = 40 + f * 10 + Math.floor(f * f * 0.4);
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

            // 获取 Boss 预设配置
            const bossPreset = BOSS_AFFIX_PRESETS[bossData.originalName] || { ai: 'chase', affixes: [], bossTraits: {} };

            // 构建词缀列表（从预设中获取）
            const bossAffixes = bossPreset.affixes.map(affixId =>
                ELITE_AFFIXES.find(a => a.id === affixId)
            ).filter(Boolean);

            // 噩梦+ 额外随机一个词缀
            if (bossData.cycle >= 1) {
                const extraAffix = ELITE_AFFIXES[Math.floor(Math.random() * ELITE_AFFIXES.length)];
                if (!bossAffixes.find(a => a.id === extraAffix.id)) {
                    bossAffixes.push(extraAffix);
                }
            }

            const bossEnemy = EnemyPool.acquire({
                x, y, hp, maxHp: hp, dmg, speed, radius: 30,
                dead: false, cooldown: 0, name: bossData.name,
                isBoss: true,
                isQuestTarget: isQuestTarget,
                xpValue: xpValue,
                ai: bossPreset.ai,  // 使用预设 AI
                frameIndex: getBossFrameIndex(bossData.originalName),
                eliteAffixes: bossAffixes,
                // Boss 特殊属性
                bossTraits: { ...bossPreset.bossTraits },
                bossCooldowns: {},  // 技能冷却计时器
                enraged: false      // 狂暴状态
            });

            // 应用 Boss 特殊属性
            applyBossTraits(bossEnemy, bossData.originalName, dmg);

            enemies.push(bossEnemy);

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

    // 生成地图缓存（离屏Canvas优化）
    generateMapCache();
}

function generateTown() {
    mapData = []; visitedMap = [];
    for (let y = 0; y < MAP_HEIGHT; y++) { mapData.push(new Array(MAP_WIDTH).fill(0)); visitedMap.push(new Array(MAP_WIDTH).fill(true)); }
    const cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
    const r = 10;           // 主区域半径
    const marketExtend = 8; // 集市区向右延伸格数

    // 生成主圆形区域 (NPC区)
    for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
            if (Math.hypot(x - cx, y - cy) < r) mapData[y][x] = 1;
        }
    }

    // 生成集市区 (右侧椭圆延伸)
    const marketCx = cx + r - 2;  // 集市中心偏右
    const marketRx = marketExtend; // 水平半径
    const marketRy = r - 2;        // 垂直半径（略小于主区域）
    for (let y = cy - marketRy; y <= cy + marketRy; y++) {
        for (let x = marketCx; x <= marketCx + marketRx; x++) {
            // 椭圆判定
            const dx = (x - marketCx) / marketRx;
            const dy = (y - cy) / marketRy;
            if (dx * dx + dy * dy < 1) mapData[y][x] = 1;
        }
    }

    dungeonEntrance = { x: cx * TILE_SIZE, y: cy * TILE_SIZE };
    dungeonExit = { x: cx * TILE_SIZE, y: (cy - r + 2) * TILE_SIZE };
    // 固定传送门位置：地牢入口右侧
    townPortalSpot = { x: dungeonExit.x + 80, y: dungeonExit.y };
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
    let cx = Math.floor(MAP_WIDTH / 2), cy = Math.floor(MAP_HEIGHT / 2);
    dungeonEntrance = { x: cx * TILE_SIZE + TILE_SIZE / 2, y: cy * TILE_SIZE + TILE_SIZE / 2 };

    // 辅助函数：挖掘2x2区域（走廊加宽，防止自动战斗卡住）
    const carve = (x, y) => {
        for (let dy = 0; dy <= 1; dy++) {
            for (let dx = 0; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy;
                if (nx >= 1 && nx < MAP_WIDTH - 1 && ny >= 1 && ny < MAP_HEIGHT - 1) {
                    mapData[ny][nx] = 1;
                }
            }
        }
    };

    // 地图大小随层数增长：1层最小，10层后固定最大
    const currentFloor = player.isInHell ? player.hellFloor : player.floor;
    const floorScale = Math.min(1, 0.4 + currentFloor * 0.06);  // 1层40%，10层100%
    const iterations = Math.floor(MAP_WIDTH * MAP_HEIGHT * 0.2 * floorScale);
    for (let i = 0; i < iterations; i++) {
        carve(cx, cy);
        const d = Math.floor(Math.random() * 4);
        if (d === 0) cy -= 2; else if (d === 1) cy += 2; else if (d === 2) cx -= 2; else cx += 2;
        if (cx < 2) cx = 2; if (cx > MAP_WIDTH - 3) cx = MAP_WIDTH - 3;
        if (cy < 2) cy = 2; if (cy > MAP_HEIGHT - 3) cy = MAP_HEIGHT - 3;
    }
    let maxD = 0;
    let sx = Math.floor(dungeonEntrance.x / TILE_SIZE), sy = Math.floor(dungeonEntrance.y / TILE_SIZE);
    for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (mapData[y][x] === 1) {
                const d = Math.hypot(x - sx, y - sy);
                if (d > maxD) {
                    maxD = d;
                    dungeonExit.x = x * TILE_SIZE + TILE_SIZE / 2;
                    dungeonExit.y = y * TILE_SIZE + TILE_SIZE / 2;
                }
            }
        }
    }

    // 放置可破坏物体 (确保在地图生成完成后调用)
    seedDestructibles();
}

function seedDestructibles() {
    destructibles = [];
    // 罗格营地不生成可破坏物体
    if (player.floor === 0) return;
    const count = 15 + Math.floor(Math.random() * 20); // 每层15-35个
    for (let i = 0; i < count; i++) {
        let x, y, v = false;
        let attempts = 0;
        while (!v && attempts < 50) {
            const tx = Math.floor(Math.random() * MAP_WIDTH);
            const ty = Math.floor(Math.random() * MAP_HEIGHT);
            if (mapData[ty][tx] === 1) {
                // 检查是否离入口/出口太近
                const dx = tx * TILE_SIZE + 16 - dungeonEntrance.x;
                const dy = ty * TILE_SIZE + 16 - dungeonEntrance.y;
                if (dx * dx + dy * dy > 10000) { // 100px away
                    const typeIdx = Math.floor(Math.random() * DESTRUCTIBLE_CONFIG.types.length);
                    destructibles.push({
                        x: tx * TILE_SIZE + 16,
                        y: ty * TILE_SIZE + 16,
                        type: DESTRUCTIBLE_CONFIG.types[typeIdx],
                        broken: false,
                        radius: 12,
                        hp: 1
                    });
                    v = true;
                }
            }
            attempts++;
        }
    }
}

// 生成地图缓存（离屏Canvas优化，避免每帧重复绘制静态地图）
function generateMapCache() {
    const fullWidth = MAP_WIDTH * TILE_SIZE;
    const fullHeight = MAP_HEIGHT * TILE_SIZE;

    // 创建或重用离屏Canvas
    if (!mapCacheCanvas) {
        mapCacheCanvas = document.createElement('canvas');
        mapCacheCanvas.width = fullWidth;
        mapCacheCanvas.height = fullHeight;
        mapCacheCtx = mapCacheCanvas.getContext('2d');
    }

    const cctx = mapCacheCtx;
    cctx.clearRect(0, 0, fullWidth, fullHeight);

    // 初始化血迹离屏层
    initBloodCanvas();

    // 获取当前层群系样式
    const biome = getBiomeStyle(player.floor);

    // 绘制整个地图到缓存
    for (let r = 0; r < MAP_HEIGHT; r++) {
        for (let c = 0; c < MAP_WIDTH; c++) {
            const x = c * TILE_SIZE, y = r * TILE_SIZE;

            if (mapData[r][c] === 0) {
                // 墙壁
                let drawnSprite = false;

                if (biome && envSpritesLoaded && processedEnvSprites) {
                    // 先画地板底色
                    if (floorTilesLoaded) {
                        const floorIndex = getFloorTextureIndex(player.floor);
                        const tileHeight = floorTiles.height / 3;
                        cctx.drawImage(floorTiles, 0, floorIndex * tileHeight, floorTiles.width, tileHeight, x, y, TILE_SIZE, TILE_SIZE);
                    } else {
                        cctx.fillStyle = '#151515';
                        cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                    }
                    // 地板色调叠加
                    cctx.fillStyle = biome.tint;
                    cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

                    // 绘制 Sprite
                    drawnSprite = drawBiomeWallDetails(cctx, x, y, TILE_SIZE, biome.type, r * 1000 + c);
                }

                if (!drawnSprite) {
                    if (wallTilesLoaded) {
                        const wallIndex = getWallTextureIndex(player.floor);
                        const tileHeight = wallTiles.height / 3;
                        cctx.drawImage(wallTiles, 0, wallIndex * tileHeight, wallTiles.width, tileHeight, x, y, TILE_SIZE, TILE_SIZE);
                        if (biome) {
                            cctx.fillStyle = biome.tint;
                            cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        }
                    } else {
                        cctx.fillStyle = COLORS.wall;
                        cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        if (biome) {
                            cctx.fillStyle = biome.tint;
                            cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                        }
                        cctx.fillStyle = '#111';
                        cctx.fillRect(x, y + TILE_SIZE - 10, TILE_SIZE, 10);
                    }
                }
            } else {
                // 地板
                if (floorTilesLoaded) {
                    const floorIndex = getFloorTextureIndex(player.floor);
                    const tileHeight = floorTiles.height / 3;
                    cctx.drawImage(floorTiles, 0, floorIndex * tileHeight, floorTiles.width, tileHeight, x, y, TILE_SIZE, TILE_SIZE);

                    // 棋盘格
                    if ((c + r) % 2 === 0) {
                        cctx.fillStyle = 'rgba(0,0,0,0.1)';
                        cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                    }

                    if (biome) {
                        cctx.fillStyle = biome.tint;
                        cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

                        // 冰面反光效果
                        if (biome.type === 'ice' && (c + r) % 3 === 0) {
                            cctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                            cctx.beginPath();
                            cctx.moveTo(x + 10, y + TILE_SIZE - 10);
                            cctx.lineTo(x + TILE_SIZE - 10, y + 10);
                            cctx.lineTo(x + TILE_SIZE - 5, y + 15);
                            cctx.lineTo(x + 15, y + TILE_SIZE - 5);
                            cctx.fill();
                        }
                    }
                } else {
                    cctx.fillStyle = ((c + r) % 2 === 0) ? '#151515' : '#1a1a1a';
                    cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                    if (biome) {
                        cctx.fillStyle = biome.tint;
                        cctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }
    }

    // 只有当必要的贴图都加载完成时才标记缓存有效
    // 否则会显示黑屏（缓存内容为空）
    const texturesReady = floorTilesLoaded && wallTilesLoaded;
    mapCacheValid = texturesReady;
}

function gameLoop(ts) {
    if (!gameActive) return;
    let dt = Math.min((ts - lastTime) / 1000, 0.1);
    lastTime = ts;

    // Juice 顿帧逻辑优先处理
    if (Juice.update(dt)) {
        // 顿帧期间不更新物理逻辑，但继续渲染
        draw();
        requestAnimationFrame(gameLoop);
        return;
    }

    // 应用慢动作时间缩放
    if (slowMotion.active) {
        dt *= slowMotion.scale;
        slowMotion.timer -= 1 / 60; // 使用真实时间倒计时
        if (slowMotion.timer <= 0) {
            slowMotion.active = false;
            slowMotion.scale = 1.0;
        }
    }

    update(dt); draw();
    autoSaveTimer += dt; if (autoSaveTimer > GAME_CONFIG.AUTO_SAVE_INTERVAL) { SaveSystem.save(true); autoSaveTimer = 0; }  // 静默自动存档
    requestAnimationFrame(gameLoop);
}
// Main Update Loop
function update(dt) {
    // 地面物品物理系统 (Physics Loot)
    groundItems.forEach(i => {
        if (i.z > 0 || i.vz !== 0) {
            i.z += i.vz * dt;
            i.vz -= 800 * dt; // Gravity
            i.x += (i.vx || 0) * dt;
            i.y += (i.vy || 0) * dt;

            // 落地碰撞检测
            if (i.z <= 0) {
                i.z = 0;
                if (Math.abs(i.vz) > 20) {
                    i.vz = -i.vz * 0.4; // Bounce
                    if (i.vx) i.vx *= 0.6; // Friction
                    if (i.vy) i.vy *= 0.6;

                } else {
                    i.vz = 0;
                    i.vx = 0;
                    i.vy = 0;
                }
            }
        }
    });

    // 天赋商店打开时暂停游戏（不更新敌人和战斗）
    if (talentShopOpen) return;

    // 连击计时器更新
    if (combo.active) {
        combo.timer -= dt;
        if (combo.timer <= 0) {
            combo.active = false;
            combo.count = 0;
        }
        // 视觉缩放恢复
        if (combo.scale > 1) {
            combo.scale -= dt * 2;
            if (combo.scale < 1) combo.scale = 1;
        }
    }


    mouse.worldX = mouse.x + camera.x; mouse.worldY = mouse.y + camera.y;
    updateSmoothUI(dt); // 每帧更新平滑UI数据并渲染重要指标
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
    // 更新低血量音效
    AudioSys.updateLowHpEffect(dt, player.hp / player.maxHp);

    // 处理回城仪式
    if (portalRitual.active) {
        portalRitual.timer -= dt;

        // 施法期间无敌
        player.invincibleTimer = 0.5;

        if (portalRitual.phase === 0) {
            // 施法阶段（光柱已在开始时触发）
            if (portalRitual.timer <= 0) {
                portalRitual.phase = 1;
                portalRitual.timer = PORTAL_RITUAL_DURATIONS.effect;
            }
        } else if (portalRitual.phase === 1) {
            // 光效阶段
            if (portalRitual.timer <= 0) {
                portalRitual.phase = 2;
                portalRitual.timer = PORTAL_RITUAL_DURATIONS.flash;
                portalRitual.flashAlpha = 1.0;
            }
        } else if (portalRitual.phase === 2) {
            // 白闪阶段 - 执行实际传送
            if (portalRitual.timer <= PORTAL_RITUAL_DURATIONS.flash * 0.5 && portalRitual.returnFloor >= 0) {
                // 在白闪最亮时切换场景
                player.lastFloor = player.floor;
                const safePortalPos = validateAndFixPortalPosition(player.x, player.y);
                townPortal = { returnFloor: player.floor, x: safePortalPos.x, y: safePortalPos.y, activeFloor: 0 };
                AutoBattle.currentTarget = null;
                // 使用 'portal' 参数，使玩家出现在传送门位置
                enterFloor(0, 'portal');
                portalRitual.returnFloor = -1; // 标记已传送
            }
            if (portalRitual.timer <= 0) {
                portalRitual.phase = 3;
                portalRitual.timer = PORTAL_RITUAL_DURATIONS.fadeIn;
                AudioSys.playPortalArrive();
            }
        } else if (portalRitual.phase === 3) {
            // 淡入阶段
            portalRitual.flashAlpha = portalRitual.timer / PORTAL_RITUAL_DURATIONS.fadeIn;
            if (portalRitual.timer <= 0) {
                portalRitual.active = false;
                portalRitual.flashAlpha = 0;
            }
        }

        // 施法期间继续更新粒子效果（让光柱动起来）
        particles.forEach((p, i) => {
            p.life -= dt;
            if (p.type === 'drop_beam') {
                // 光柱不移动，只减少生命
            } else if (p.type === 'rising_spark') {
                p.y += p.vy * dt;
                p.vy += 50 * dt;
            } else {
                if (p.vx) p.x += p.vx * dt;
                if (p.vy) p.y += p.vy * dt;
                if (p.gravity) p.vy += p.gravity * dt;
            }
            if (p.life <= 0) particles.splice(i, 1);
        });

        // 施法期间不更新其他游戏逻辑
        if (portalRitual.phase < 3) return;
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

    // 环境氛围粒子生成 (Biome Atmosphere) - 每帧检查
    const currentBiome = getBiomeStyle(player.floor);
    if (currentBiome && Math.random() < 0.2) { // 20%概率每帧
        const spawnX = camera.x + Math.random() * canvas.width;
        const spawnY = camera.y + Math.random() * canvas.height;

        if (currentBiome.type === 'forest') {
            // 森林孢子/萤火虫
            particles.push({
                x: spawnX, y: spawnY,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20,
                life: 3 + Math.random() * 2,
                color: Math.random() < 0.7 ? '#aaff88' : '#ffffaa',
                size: 1 + Math.random() * 2,
                alpha: 0.6,
                maxAlpha: 0.6
            });
        } else if (currentBiome.type === 'fire') {
            // 熔岩余烬 (向上飘)
            particles.push({
                x: spawnX, y: spawnY,
                vx: (Math.random() - 0.5) * 30,
                vy: -30 - Math.random() * 30,
                life: 1.5 + Math.random(),
                color: Math.random() < 0.6 ? '#ff4400' : '#ffaa00',
                size: 2 + Math.random() * 2,
                alpha: 0.8,
                maxAlpha: 0.8
            });
        }
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

            // 套装(5) 10分钟后消失
            if (item.rarity === 5) return age < GAME_CONFIG.ITEM_DESPAWN_SET;

            // 金币 和 暗金(4) 3分钟后消失
            if (item.type === 'gold' || item.rarity === 4) return age < GAME_CONFIG.ITEM_DESPAWN_UNIQUE;

            // 黄装(3) 2分钟后消失
            if (item.rarity === 3) return age < GAME_CONFIG.ITEM_DESPAWN_RARE;

            // 白/蓝装及其他 1分钟后消失
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

    // 处理闪电过载视觉计时器
    if (player.lightningOverloadTimer > 0) {
        player.lightningOverloadTimer -= dt;
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
            createDamageNumber(player.x, player.y - 20, poisonDmg, COLORS.poison); // 绿色数字
            checkPlayerDeath();
        }
        if (player.poisonTimer <= 0) {
            player.poisoned = false;
            player.poisonDamage = 0;
        }
    }

    // 自动战斗系统（营地不执行）
    if (AutoBattle.enabled && !player.frozen && player.floor !== 0) {
        AutoBattle.decideAction(dt);
    }

    interactionTarget = null;
    const distExit = Math.hypot(player.x - dungeonExit.x, player.y - dungeonExit.y);
    if (distExit < GAME_CONFIG.INTERACTION_RANGE) {
        const isInHell = player.isInHell || false;
        if (player.floor === 0) {
            interactionTarget = { type: 'next', label: `进入 ${getFloorName(1)}` };
        } else {
            if (isInHell) {
                // 在地狱中，出口逻辑
                if (player.hellFloor >= 10) {
                    interactionTarget = { type: 'prev', label: '返回营地' };
                } else {
                    interactionTarget = { type: 'next', label: `进入 ${getFloorName(player.hellFloor + 1, true)}` };
                }
            } else {
                interactionTarget = { type: 'next', label: `进入 ${getFloorName(player.floor + 1)}` };
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
                    interactionTarget = { type: 'prev', label: `回到 ${getFloorName(player.hellFloor - 1, true)}` };
                }
            } else {
                const label = player.floor === 1 ? '回到罗格营地' : `回到 ${getFloorName(player.floor - 1)}`;
                interactionTarget = { type: 'prev', label: label };
            }
        }
    }
    // 传送门交互只在普通地牢中有效，地狱中无效
    if (townPortal && townPortal.activeFloor === player.floor && !player.isInHell) {
        const portalPos = getPortalDisplayPosition();
        if (portalPos) {
            const distPortal = Math.hypot(player.x - portalPos.x, player.y - portalPos.y);
            if (distPortal < 60) {
                const label = player.floor === 0 ? '进入传送门' : '回到罗格营地';
                interactionTarget = { type: 'portal', label: label };
            }
        }
    }

    // 自动拾取系统：金币、药水、卷轴（吸入效果）
    const pickupMultiplier = typeof getTalentEffect !== 'undefined' ? getTalentEffect('pickupRange', 1) : 1;
    const pickupRange = 80 * pickupMultiplier;

    for (let i = groundItems.length - 1; i >= 0; i--) {
        let item = groundItems[i];
        const distance = Math.hypot(item.x - player.x, item.y - player.y);

        // 检查是否在拾取范围内
        if (distance < pickupRange) {
            let shouldPickup = false;
            let pickupType = null;

            // 根据物品类型和设置判断是否拾取
            if (item.type === 'gold' && player.autoPickup.gold) {
                shouldPickup = true;
                pickupType = 'gold';
            } else if (item.type === 'potion' && player.autoPickup.potion) {
                shouldPickup = true;
                pickupType = 'potion';
            } else if (item.type === 'scroll' && player.autoPickup.scroll) {
                shouldPickup = true;
                pickupType = 'scroll';
            }

            // 如果应该拾取，创建飞行粒子而不是立即拾取
            if (shouldPickup) {
                createFlyingPickup(item, pickupType);
                if (item.el) item.el.remove();
                groundItems.splice(i, 1);
            }
        }
    }

    // 更新飞行拾取粒子 (逻辑已移至 createFlyingPickup 中的 GSAP 驱动)
    // 此处无需再手动更新坐标，GSAP 会在每一帧自动修改 fp.x 和 fp.y

    if (mouse.leftDown && !isHoveringUI()) {
        const t = getEnemyAtCursor();
        const d = getDestructibleAtCursor();
        const npc = getNPCAtCursor();

        // 摊位点击检测（仅在罗格营地）
        if (mouse.leftClick && isInTown() && typeof MarketSystem !== 'undefined') {
            const stallPoint = MarketSystem.getStallAtPosition(mouse.worldX, mouse.worldY);
            if (stallPoint) {
                // 检查距离
                const distToStall = Math.hypot(stallPoint.x - player.x, stallPoint.y - player.y);
                if (distToStall < 80) {
                    MarketSystem.onStallClick(stallPoint);
                    mouse.leftClick = false;
                    player.targetX = null;
                    return; // 阻止后续处理
                } else {
                    // 走向摊位
                    player.targetX = stallPoint.x;
                    player.targetY = stallPoint.y;
                    mouse.leftClick = false;
                    return;
                }
            }
        }

        // NPC交互只在点击瞬间触发一次，避免面板闪烁
        if (npc && Math.hypot(npc.x - player.x, npc.y - player.y) < 60) {
            if (mouse.leftClick) {
                player.targetX = null;
                interactNPC(npc);
                mouse.leftClick = false; // 消费掉点击，避免重复触发
            }
        } else if (mouse.leftClick && interactionTarget && isClickOnInteraction()) {
            // 点击在出口/入口/传送门上时才触发
            handleInteraction();
            player.targetX = null;
            mouse.leftClick = false;
        } else if (t) {
            if (Math.hypot(t.x - player.x, t.y - player.y) < 50) { player.targetX = null; performAttack(t); }
            else { player.targetX = t.x; player.targetY = t.y; }
        } else if (d) {
            // 点击可破坏物体：走向并破坏
            const dist = Math.hypot(d.x - player.x, d.y - player.y);
            if (dist < 60) {
                player.targetX = null;
                if (player.attackCooldown <= 0) {
                    DestructibleSystem.break(d);
                    player.attackAnim = 1;
                    player.attackCooldown = 0.4; // 短暂冷却
                    AudioSys.play('hit');
                }
            } else {
                player.targetX = d.x;
                player.targetY = d.y;
            }
        } else { player.targetX = mouse.worldX; player.targetY = mouse.worldY; }
    }


    // 摆摊时禁止移动，或者摆摊面板打开时也禁止
    if (typeof MarketSystem !== 'undefined' && (MarketSystem.isStalling || MarketSystem.isPanelOpen)) {
        player.targetX = null;
        player.targetY = null;
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
                                const forSet = item.rarity === 5;
                                let dropped = false;
                                for (let i = 0; i < player.inventory.length; i++) {
                                    const it = player.inventory[i];
                                    if (!it) continue;
                                    // 套装永远不丢
                                    if (it.rarity === 5) continue;
                                    // 药水、卷轴永远不丢
                                    if (it.type === 'potion' || it.type === 'scroll') continue;
                                    // 为套装腾空间时，暗金(4)和稀有(3)也可以丢
                                    if (forSet && it.rarity >= 3) {
                                        groundItems.push({ ...it, x: player.x + (Math.random() - 0.5) * 40, y: player.y + (Math.random() - 0.5) * 40 });
                                        player.inventory[i] = null;
                                        showNotification(`丢弃 ${it.displayName || it.name} 腾出空间`);
                                        dropped = true;
                                        break;
                                    }
                                    // 非套装情况：暗金不丢，只丢蓝装及以下
                                    if (!forSet && it.rarity < 3) {
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
                                    return; // 不要移除地面物品
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

    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        p.life -= dt; p.x += Math.cos(p.angle) * p.speed * dt; p.y += Math.sin(p.angle) * p.speed * dt;

        // 火球拖尾粒子（概率根据画质动态调整）
        const pConfig = getParticleConfig();
        if (p.type === 'fireball' && Math.random() < pConfig.fireballTrail) {
            const trailColors = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00'];
            particles.push({
                x: p.x + (Math.random() - 0.5) * 10,
                y: p.y + (Math.random() - 0.5) * 10,
                vx: -Math.cos(p.angle) * 30 + (Math.random() - 0.5) * 40,
                vy: -Math.sin(p.angle) * 30 + (Math.random() - 0.5) * 40 - 20,
                color: trailColors[Math.floor(Math.random() * trailColors.length)],
                life: 0.3 + Math.random() * 0.2,
                size: 3 + Math.random() * 3,
                gravity: -30  // 火焰向上飘
            });
        }

        // 多重射击拖尾粒子（概率根据画质动态调整）
        if (p.type === 'multishot' && Math.random() < pConfig.multishotTrail) {
            const trailColors = ['#aaff00', '#88ff44', '#ffff00', '#ccff88'];
            particles.push({
                x: p.x + (Math.random() - 0.5) * 6,
                y: p.y + (Math.random() - 0.5) * 6,
                vx: -Math.cos(p.angle) * 20 + (Math.random() - 0.5) * 20,
                vy: -Math.sin(p.angle) * 20 + (Math.random() - 0.5) * 20,
                color: trailColors[Math.floor(Math.random() * trailColors.length)],
                life: 0.15 + Math.random() * 0.1,
                size: 1.5 + Math.random() * 2,
                gravity: 0
            });
        }

        if (isWall(p.x, p.y)) { p.life = 0; for (let j = 0; j < 3; j++)createParticle(p.x, p.y, '#aaa', 2); }

        if (p.owner && p.owner !== player) {
            const dx = p.x - player.x, dy = p.y - player.y;
            if (dx * dx + dy * dy < (player.radius + 10) ** 2 && player.invincibleTimer <= 0) {
                const dmg = Math.max(0, p.damage - player.armor * 0.1);
                player.hp -= dmg;
                player.lastDamageSource = p.owner.name + '的远程攻击';
                player.invincibleTimer = 0.3;  // 0.3秒无敌帧
                p.life = 0;
                createDamageNumber(player.x, player.y - 20, Math.floor(dmg), COLORS.damage);
                combo.active = false; combo.count = 0; // 被击中连击中断
                AudioSys.play('hit');
                // 已移除玩家被击中震屏，优化性能

                // 自动战斗：记录远程攻击者
                AutoBattle.onPlayerDamaged(p.owner);

                updateUI(); checkPlayerDeath();
                for (let j = 0; j < 5; j++)createParticle(p.x, p.y, p.color || '#ff4400');
            }
        } else {
            // 玩家发射的投射物，检测是否击中敌人
            let hitTarget = null;
            for (let e of enemies) {
                if (!e.dead && e !== p.owner) {
                    const dx = p.x - e.x, dy = p.y - e.y;
                    if (dx * dx + dy * dy < (e.radius + 10) ** 2) {
                        takeDamage(e, p.damage, true);
                        p.life = 0;
                        hitTarget = e;
                        addCombo(1);
                        if (p.freeze) { e.frozenTimer = p.freeze; createDamageNumber(e.x, e.y - 40, "冻结!", COLORS.ice); }
                        for (let j = 0; j < 5; j++) createParticle(p.x, p.y, p.color || '#ff4400');
                        break;
                    }
                }
            }

            // 检测可破坏物体碰撞
            if (!hitTarget) {
                for (let d of destructibles) {
                    if (!d.broken) {
                        const dx = p.x - d.x, dy = p.y - d.y;
                        if (dx * dx + dy * dy < (d.radius + 10) ** 2) {
                            DestructibleSystem.break(d);
                            p.life = 0;
                            hitTarget = d; // 标记为已击中物体
                            break;
                        }
                    }
                }
            }

            // 火球爆炸效果（5级以上）
            if (hitTarget && p.type === 'fireball' && player.skills.fireball >= 5) {
                // 播放爆炸音效
                AudioSys.playFireballExplosion(player.skills.fireball);

                // 计算爆炸范围和伤害
                const explosionRadius = 50 + (player.skills.fireball - 5) * 10; // 5级=50, 10级=100
                const explosionDamageRatio = 0.2 + (player.skills.fireball - 5) * 0.04; // 5级=20%, 10级=40%
                const explosionDamage = p.damage * explosionDamageRatio;

                // 对范围内的其他敌人造成伤害
                const rSq = explosionRadius * explosionRadius;
                enemies.forEach(e => {
                    const dx = p.x - e.x, dy = p.y - e.y;
                    if (!e.dead && e !== hitTarget && dx * dx + dy * dy < rSq) {
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
    }

    // 粒子物理更新与回收
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;

        if (p.type === 'rising_spark') {
            p.y += p.vy * dt;
            p.vy += 50 * dt;
        } else if (p.type === 'impact') {
            // 高级物理粒子 (带 Z 轴)
            p.x += (p.vx || 0) * dt;
            p.y += (p.vy || 0) * dt;
            if (p.z !== undefined) {
                p.z += (p.vz || 0) * dt;
                p.vz -= (p.gravity || 800) * dt;

                // 落地检测
                if (p.z <= 0) {
                    p.z = 0;
                    if (Math.abs(p.vz) > 30) {
                        p.vz = -p.vz * 0.3; // 反弹
                        p.vx *= 0.6; p.vy *= 0.6; // 摩擦
                    } else {
                        // 彻底落地
                        p.vz = 0; p.vx = 0; p.vy = 0;

                        // 性能核心：烘焙到静态血迹层 (使用原有有机血迹风格)
                        if (p.canBake && bloodCtx) {
                            const splatSize = p.size * (1.5 + Math.random());
                            drawSplatToCtx(bloodCtx, p.x, p.y, splatSize, p.color, 0.5 + Math.random() * 0.3);
                            p.life = 0; // 标记回收
                        }
                    }
                }
            }
        } else if (p.type !== 'drop_beam') {
            if (p.vx) p.x += p.vx * dt;
            if (p.vy) p.y += p.vy * dt;
            if (p.gravity) p.vy += p.gravity * dt;
        }

        if (p.life <= 0) {
            ParticlePool.release(p);
            particles.splice(i, 1);
        }
    }

    // 粒子数量上限强制回收
    const maxP = getParticleConfig().maxParticles;
    while (particles.length > maxP) {
        ParticlePool.release(particles.shift());
    }

    // 伤害数字物理更新与回收
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
        const d = damageNumbers[i];
        d.life -= dt;

        if (d.vx !== undefined) {
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.vy += d.gravity * dt;
        } else {
            d.y -= 20 * dt;
        }

        // --- DOM 同步逻辑 (High Quality Mode) ---
        if (d.isHTML && d.el) {
            d.flickerTimer = (d.flickerTimer || 0) + dt;
            let drawX = d.x - camera.x;
            let drawY = d.y - camera.y;

            if (d.isLightning && Math.floor(d.flickerTimer * 20) % 2 === 0) {
                drawX += (Math.random() - 0.5) * 15;
                drawY += (Math.random() - 0.5) * 15;
            }

            // 应用位移 (相对于初始放置位置的偏移)
            d.el.style.transform = `translate(${drawX - d.sx}px, ${drawY - d.sy}px)`;

            // 应用缩放效果
            let scale = 1;
            if (d.isPoison) scale = 0.8 + d.life * 0.2;
            else if (d.isIce) scale = 1.1 - (d.maxLife - d.life) * 0.2;
            else if (d.isLightning) scale = 1.2 + Math.sin(d.flickerTimer * 40) * 0.2;
            else scale = 1 + d.life * 0.1;

            d.el.style.transform += ` scale(${scale})`;
            d.el.style.opacity = d.life > 0.4 ? 1 : d.life / 0.4;
        }

        if (d.life <= 0) {
            if (d.isHTML && d.el) d.el.remove();
            DamageNumberPool.release(d);
            damageNumbers.splice(i, 1);
        }
    }

    slashEffects.forEach((s, i) => { s.life -= dt * 5; if (s.life <= 0) slashEffects.splice(i, 1); });

    // 震屏效果更新
    if (screenShake.duration > 0) {
        screenShake.duration -= dt;
        screenShake.intensity *= 0.9;  // 逐渐减弱
    }

    // 升级特效更新
    if (levelUpEffect.active) {
        levelUpEffect.timer -= dt;
        levelUpEffect.flashAlpha -= dt * 1.2;  // 渐渐消失
        if (levelUpEffect.timer <= 0) {
            levelUpEffect.active = false;
            levelUpEffect.flashAlpha = 0;
        }
    }

    // 敌人清理已移至定期清理（每3秒），使用对象池回收

    // 更新可破坏物体
    DestructibleSystem.update(dt);

    updateUI();
}

function updateEnemies(dt) {
    enemies.forEach(e => {
        if (e.dead) return;
        if (e.hitFlashTimer > 0) e.hitFlashTimer -= dt; // 更新受击闪白

        // Juice 视觉恢复逻辑
        if (e.juiceScaleTimer > 0) {
            e.juiceScaleTimer -= dt;
            // 平滑恢复到 1.0
            e.juiceScale += (1.0 - e.juiceScale) * 0.2;
            if (e.juiceScaleTimer <= 0) e.juiceScale = 1.0;
        }

        // 处理中毒伤害 (DOT)
        if (e.poisoned && e.poisonTimer > 0) {
            e.poisonTimer -= dt;
            if (!e.lastPoisonTick) e.lastPoisonTick = 0;
            e.lastPoisonTick += dt;
            if (e.lastPoisonTick >= 0.5) {
                e.lastPoisonTick = 0;
                const pDmg = Math.max(1, Math.floor(e.poisonDamagePerTick || 1));
                e.hp -= pDmg;
                createDamageNumber(e.x, e.y, pDmg, COLORS.poison);
                if (e.hp <= 0) e.dead = true;
            }
            if (e.poisonTimer <= 0) e.poisoned = false;
        }

        if (e.frozenTimer > 0) { e.frozenTimer -= dt; return; }
        if (e.slowedTimer > 0) e.slowedTimer -= dt;
        if (e.lightningOverloadTimer > 0) e.lightningOverloadTimer -= dt;
        if (e.cooldown > 0) e.cooldown -= dt;

        // Boss 技能冷却更新
        if (e.isBoss && e.bossCooldowns) {
            for (const key in e.bossCooldowns) {
                if (!key.endsWith('Max') && e.bossCooldowns[key] > 0) {
                    e.bossCooldowns[key] -= dt;
                }
            }
            // Boss 技能逻辑
            updateBossSkills(e, dt);
        }

        const speedMultiplier = e.slowedTimer > 0 ? 0.4 : 1.0;
        const currentSpeed = e.speed * speedMultiplier;

        const dx = player.x - e.x, dy = player.y - e.y;
        const distSq = dx * dx + dy * dy;

        if (e.ai === 'ranged') {
            const hasLOS = hasLineOfSight(e.x, e.y, player.x, player.y);
            if (distSq < 22500 && hasLOS) {
                // 太近了，后退 (150^2 = 22500)
                const dist = Math.sqrt(distSq);
                const moveX = e.x - (dx / dist) * currentSpeed * dt;
                const moveY = e.y - (dy / dist) * currentSpeed * dt;
                if (!isWall(moveX, e.y)) e.x = moveX; if (!isWall(e.x, moveY)) e.y = moveY;
            } else if (distSq < 160000 && hasLOS) {
                // 有视线才能射击 (400^2 = 160000)
                // 有视线才能射击
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
            } else if (distSq < 160000 && !hasLOS) { // 400^2 = 160000
                // 没有视线，尝试靠近
                const dist = Math.sqrt(distSq);
                const nx = e.x + (dx / dist) * currentSpeed * dt;
                const ny = e.y + (dy / dist) * currentSpeed * dt;
                if (!isWall(nx, e.y)) e.x = nx;
                if (!isWall(e.x, ny)) e.y = ny;
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
            if (distSq < 90000 && distSq > 10000) { // 300^2=90000, 100^2=10000
                const dist = Math.sqrt(distSq);
                const nx = e.x + (dx / dist) * currentSpeed * dt, ny = e.y + (dy / dist) * currentSpeed * dt;
                if (!isWall(nx, e.y)) e.x = nx; if (!isWall(e.x, ny)) e.y = ny;
            }
        } else if (e.ai === 'phase') {
            // 幽灵AI：可以穿墙，直线追击玩家
            if (distSq < 160000 && distSq > 1225) { // 400^2=160000, 35^2=1225
                const dist = Math.sqrt(distSq);
                e.x += (dx / dist) * currentSpeed * dt;
                e.y += (dy / dist) * currentSpeed * dt;
            }
            if (distSq <= 1600 && e.cooldown <= 0 && player.invincibleTimer <= 0) { // 40^2 = 1600
                let physicalDmg = e.ignoreArmor ? e.dmg : Math.max(1, e.dmg - player.armor * 0.1);
                player.hp -= physicalDmg;
                createDamageNumber(player.x, player.y - 30, Math.floor(physicalDmg), '#ff4444');
                combo.active = false; combo.count = 0; // 被击中连击中断
                e.cooldown = 1.5;
                AudioSys.play('hit');
            }
        } else if (e.ai === 'vampire') {
            // 吸血鬼AI：突进攻击 + 吸血
            if (!e.dashCooldown) e.dashCooldown = 0;
            if (e.dashCooldown > 0) e.dashCooldown -= dt;

            // 正在突进中
            if (e.isDashing) {
                e.dashTimer -= dt;
                if (e.dashTimer <= 0) {
                    e.isDashing = false;
                }
                // 突进移动（快速接近目标位置）
                const dashSpeed = 600;
                const dx = e.dashTargetX - e.x;
                const dy = e.dashTargetY - e.y;
                const dashDist = Math.hypot(dx, dy);
                if (dashDist > 5) {
                    e.x += (dx / dashDist) * dashSpeed * dt;
                    e.y += (dy / dashDist) * dashSpeed * dt;
                    // 突进时创建红色残影
                    if (Math.random() < 0.5) {
                        particles.push({
                            x: e.x, y: e.y,
                            vx: (Math.random() - 0.5) * 20,
                            vy: (Math.random() - 0.5) * 20,
                            life: 0.3,
                            maxLife: 0.3,
                            color: '#aa0000',
                            size: 15,
                            type: 'vampire_trail'
                        });
                    }
                }
                // 突进到达后攻击
                if (dashDist <= 40 && e.cooldown <= 0 && player.invincibleTimer <= 0) {
                    let physicalDmg = e.ignoreArmor ? e.dmg : Math.max(1, e.dmg - player.armor * 0.1);
                    player.hp -= physicalDmg;
                    createDamageNumber(player.x, player.y - 30, Math.floor(physicalDmg), '#ff4444');
                    // 吸血效果
                    const healAmount = Math.floor(physicalDmg * (e.lifeSteal || 0.2));
                    if (healAmount > 0) {
                        e.hp = Math.min(e.maxHp, e.hp + healAmount);
                        createDamageNumber(e.x, e.y - 30, '+' + healAmount, '#00ff00');
                        // 吸血粒子效果
                        for (let i = 0; i < 5; i++) {
                            particles.push({
                                x: player.x + (Math.random() - 0.5) * 30,
                                y: player.y + (Math.random() - 0.5) * 30,
                                vx: (e.x - player.x) * 2 + (Math.random() - 0.5) * 50,
                                vy: (e.y - player.y) * 2 + (Math.random() - 0.5) * 50,
                                life: 0.4,
                                maxLife: 0.4,
                                color: '#ff0000',
                                size: 6,
                                type: 'lifesteal'
                            });
                        }
                    }
                    combo.active = false; combo.count = 0;
                    e.cooldown = 1.5;
                    e.isDashing = false;
                    AudioSys.play('hit');
                }
            } else {
                // 非突进状态
                if (distSq < 40000 && distSq > 1600 && e.dashCooldown <= 0) { // 200^2=40000, 40^2=1600
                    // 发动突进！
                    e.isDashing = true;
                    e.dashTimer = 0.3; // 突进持续0.3秒
                    e.dashTargetX = player.x;
                    e.dashTargetY = player.y;
                    e.dashCooldown = 3.0; // 3秒突进冷却
                    AudioSys.play('swing');
                } else if (distSq < 160000 && distSq > 10000) { // 400^2=160000, 100^2=10000
                    // 缓慢靠近
                    const dist = Math.sqrt(distSq);
                    const nx = e.x + (dx / dist) * currentSpeed * dt;
                    const ny = e.y + (dy / dist) * currentSpeed * dt;
                    if (!isWall(nx, e.y)) e.x = nx;
                    if (!isWall(e.x, ny)) e.y = ny;
                } else if (distSq <= 1600 && e.cooldown <= 0 && player.invincibleTimer <= 0) { // 40^2 = 1600
                    // 近身普通攻击
                    let physicalDmg = e.ignoreArmor ? e.dmg : Math.max(1, e.dmg - player.armor * 0.1);
                    player.hp -= physicalDmg;
                    createDamageNumber(player.x, player.y - 30, Math.floor(physicalDmg), '#ff4444');
                    const healAmount = Math.floor(physicalDmg * (e.lifeSteal || 0.2));
                    if (healAmount > 0) {
                        e.hp = Math.min(e.maxHp, e.hp + healAmount);
                        createDamageNumber(e.x, e.y - 30, '+' + healAmount, '#00ff00');
                    }
                    combo.active = false; combo.count = 0;
                    e.cooldown = 1.5;
                    AudioSys.play('hit');
                }
            }
        } else if (e.ai === 'specter') {
            // 闪电幽魂AI：穿墙移动 + 远程闪电球 + 保持距离
            const hasLOS = hasLineOfSight(e.x, e.y, player.x, player.y);
            if (distSq < 14400 && hasLOS) { // 120^2 = 14400
                // 太近了，后退（可穿墙）
                const dist = Math.sqrt(distSq);
                e.x -= (dx / dist) * currentSpeed * dt;
                e.y -= (dy / dist) * currentSpeed * dt;
            } else if (distSq < 122500 && hasLOS) { // 350^2 = 122500
                // 有视线才能发射闪电球
                if (e.cooldown <= 0) {
                    const angle = Math.atan2(player.y - e.y, player.x - e.x);
                    projectiles.push({
                        x: e.x,
                        y: e.y,
                        angle: angle,
                        speed: 280,
                        life: 2,
                        damage: e.dmg,
                        color: '#66ccff',
                        owner: e,
                        type: 'lightning_ball'  // 闪电球类型
                    });
                    // 发射音效（轻柔版）
                    AudioSys.play('specter_bolt');
                    e.cooldown = 1.8;
                }
            } else if (distSq < 202500) { // 450^2 = 202500
                // 靠近玩家（可穿墙）- 无视线时也会穿墙过来
                const dist = Math.sqrt(distSq);
                e.x += (dx / dist) * currentSpeed * dt;
                e.y += (dy / dist) * currentSpeed * dt;
            }
        } else {
            // 普通chase AI
            if (distSq < 160000 && distSq > 1225) { // 400^2=160000, 35^2=1225
                const dist = Math.sqrt(distSq);
                const nx = e.x + (dx / dist) * currentSpeed * dt, ny = e.y + (dy / dist) * currentSpeed * dt;
                if (!isWall(nx, e.y)) e.x = nx; if (!isWall(e.x, ny)) e.y = ny;
            }
            if (distSq <= 1600 && e.cooldown <= 0 && player.invincibleTimer <= 0) { // 40^2 = 1600
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
                        if (lightningDmg > 0) {
                            totalDmg += lightningDmg;
                            player.lightningOverloadTimer = 0.5; // 0.5秒视觉过载
                        }
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
                // 触发受击反馈：血球震动
                if (cachedUI.hpOrb) GSAPAnims.shake(cachedUI.hpOrb, 8);

                player.lastDamageSource = e.name;
                player.invincibleTimer = 0.3;  // 0.3秒无敌帧
                e.cooldown = 1.5;
                createDamageNumber(player.x, player.y - 20, Math.floor(totalDmg), COLORS.damage);
                combo.active = false; combo.count = 0; // 被击中连击中断
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
                    if (!player.poisoned) {
                        createDamageNumber(player.x, player.y - 45, "中毒!", COLORS.poison);
                    }
                    player.poisoned = true;
                    player.poisonTimer = Math.max(player.poisonTimer || 0, 3.0);
                    player.poisonDamage = Math.max(player.poisonDamage || 0, e.poisonDamage);
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

    // 使用离屏Canvas缓存绘制地图（性能优化：从每帧5000+次ctx调用降为1次）
    let mapDrawn = false;
    if (mapCacheValid && mapCacheCanvas) {
        // 计算源区域（从缓存中裁剪的区域）
        const cacheW = mapCacheCanvas.width;
        const cacheH = mapCacheCanvas.height;

        // 源坐标（缓存中的位置），需要限制在有效范围内
        const srcX = Math.max(0, Math.floor(camera.x));
        const srcY = Math.max(0, Math.floor(camera.y));

        // 目标坐标（画布上的位置）
        const dstX = Math.max(0, -Math.floor(camera.x));
        const dstY = Math.max(0, -Math.floor(camera.y));

        // 绘制宽高
        const drawW = Math.min(canvas.width - dstX, cacheW - srcX);
        const drawH = Math.min(canvas.height - dstY, cacheH - srcY);

        if (drawW > 0 && drawH > 0) {
            ctx.drawImage(mapCacheCanvas, srcX, srcY, drawW, drawH, srcX, srcY, drawW, drawH);
            mapDrawn = true;
        }
    }

    // 缓存无效或绘制失败时的后备方案
    if (!mapDrawn) {
        const sc = Math.floor(camera.x / TILE_SIZE), ec = sc + (canvas.width / TILE_SIZE) + 1;
        const sr = Math.floor(camera.y / TILE_SIZE), er = sr + (canvas.height / TILE_SIZE) + 1;

        for (let r = sr - 1; r < er + 1; r++) {
            for (let c = sc - 1; c < ec + 1; c++) {
                if (r >= 0 && r < MAP_HEIGHT && c >= 0 && c < MAP_WIDTH) {
                    const x = c * TILE_SIZE, y = r * TILE_SIZE;
                    if (mapData[r][c] === 0) {
                        ctx.fillStyle = COLORS.wall;
                        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
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
        drawDungeonExit(dungeonExit.x, dungeonExit.y, `去 ${getFloorName(1)}`);
    } else if (player.isInHell) {
        // 地狱模式：显示地狱的入口和出口
        const nextHellFloor = player.hellFloor + 1;
        let exitLabel = player.hellFloor >= 10 ? "返回罗格营地" : `去 ${getFloorName(nextHellFloor, true)}`;
        drawDungeonExit(dungeonExit.x, dungeonExit.y, exitLabel);

        const prevHellFloor = player.hellFloor - 1;
        let entranceLabel = player.hellFloor === 1 ? "返回罗格营地" : `回 ${getFloorName(prevHellFloor, true)}`;
        drawDungeonEntrance(dungeonEntrance.x, dungeonEntrance.y, entranceLabel);
    } else {
        // 普通地牢：显示地牢的入口和出口
        const nextFloor = player.floor + 1;
        let exitLabel = `去 ${getFloorName(nextFloor)}`;
        drawDungeonExit(dungeonExit.x, dungeonExit.y, exitLabel);

        const prevFloor = player.floor - 1;
        let entranceLabel = player.floor === 1 ? "去罗格营地" : `回 ${getFloorName(prevFloor)}`;
        drawDungeonEntrance(dungeonEntrance.x, dungeonEntrance.y, entranceLabel);
    }

    // 传送门只在普通地牢中显示，地狱中不显示
    if (townPortal && townPortal.activeFloor === player.floor && !player.isInHell) {
        const portalPos = getPortalDisplayPosition();
        if (portalPos) {
            let label = player.floor === 0 ? '传送门' : '传送门 (回罗格营地)';
            drawPortal(portalPos.x, portalPos.y, label);
        }
    }

    npcs.forEach(n => {
        const nx = Math.round(n.x);
        const ny = Math.round(n.y);
        if (spritesLoaded && processedSpriteSheet && n.frameIndex !== undefined) {
            const frame = getNPCFrame(n.frameIndex);
            const renderHeight = 52;
            const renderWidth = renderHeight * frame.width / frame.height;
            ctx.drawImage(processedSpriteSheet, frame.x, frame.y, frame.width, frame.height,
                nx - renderWidth / 2, ny - renderHeight, renderWidth, renderHeight);
        } else {
            ctx.fillStyle = COLORS.npc; ctx.beginPath(); ctx.arc(nx, ny, 15, 0, Math.PI * 2); ctx.fill();
        }

        // Quest Indicators (above name)
        if (n.type === 'healer') {
            if (player.questState === 0) {
                ctx.fillStyle = '#ffff00'; ctx.font = '20px Arial'; ctx.fillText("!", nx, ny - 80);
            } else if (player.questState === 2) {
                ctx.fillStyle = '#ffff00'; ctx.font = '20px Arial'; ctx.fillText("?", nx, ny - 80);
            }
        }

        // Name (above character)
        ctx.fillStyle = '#fff'; ctx.font = '12px Cinzel'; ctx.textAlign = 'center'; ctx.fillText(n.name, nx, ny - 70);
    });

    // 渲染摊位（仅在罗格营地）
    if (isInTown() && typeof MarketSystem !== 'undefined') {
        MarketSystem.drawStalls(ctx);
    }

    // 渲染离屏血迹层（原本几百个对象循环，现在恒定 1 次 drawImage）
    if (bloodCanvas) {
        const sx = Math.max(0, camera.x);
        const sy = Math.max(0, camera.y);
        const sw = Math.min(bloodCanvas.width - sx, canvas.width);
        const sh = Math.min(bloodCanvas.height - sy, canvas.height);
        if (sw > 0 && sh > 0) {
            ctx.drawImage(bloodCanvas, sx, sy, sw, sh, sx, sy, sw, sh);
        }
    }

    // 渲染可破坏物体
    DestructibleSystem.draw(ctx);

    enemies.forEach(e => {
        if (e.dead) return;
        // 视口剔除
        if (e.x < camera.x - 100 || e.x > camera.x + canvas.width + 100 ||
            e.y < camera.y - 120 || e.y > camera.y + canvas.height + 100) return;

        const rx = Math.round(e.x);
        const ry = Math.round(e.y);

        // BOSS脚下光环
        if (e.isBoss) {
            ctx.beginPath(); ctx.arc(rx, ry, (e.radius + 5) / 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(180, 0, 0, 0.25)'; ctx.fill();
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
        }

        if (spritesLoaded && processedSpriteSheet && e.frameIndex !== undefined) {
            const frame = e.isBoss ? getBossFrame(e.frameIndex) : getMonsterFrame(e.frameIndex);
            const renderHeight = e.isBoss ? 66 : 44;
            const renderWidth = renderHeight * frame.width / frame.height;

            // 确定绘制源（消除 ctx.filter）
            let source = processedSpriteSheet;
            if (e.hitFlashTimer > 0) source = TintCache.white;
            else if (e.frozenTimer > 0 || e.slowedTimer > 0) source = TintCache.ice;
            else if (e.poisonTimer > 0) source = TintCache.poison;
            else if (e.lightningOverloadTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) source = TintCache.lightning;

            ctx.save();
            ctx.translate(rx, ry);
            // 应用 Juice 缩放 (受击挤压效果)
            const juiceScale = e.juiceScale || 1.0;
            ctx.scale(juiceScale, 1.0 / juiceScale); // 保持体积一致性 (Squash and Stretch)

            ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height,
                -renderWidth / 2, -renderHeight, renderWidth, renderHeight);
            ctx.restore();
        } else {
            // 优先级：受击闪白 > 冰冻 > 精英/Boss/普通颜色
            if (e.hitFlashTimer > 0) {
                ctx.fillStyle = '#ffffff'; // 受击闪白
            } else {
                ctx.fillStyle = e.frozenTimer > 0 ? COLORS.ice : (e.rarity > 0 ? '#ffaa00' : (e.isBoss ? '#9000cc' : '#880000'));
            }
            if (e.isQuestTarget) ctx.fillStyle = '#ff00aa';
            ctx.beginPath(); ctx.arc(rx, ry, e.radius, 0, Math.PI * 2); ctx.fill();
        }

        ctx.fillStyle = '#500'; ctx.fillRect(rx - 15, ry - e.radius - 8, 30, 4);
        ctx.fillStyle = '#f00'; ctx.fillRect(rx - 15, ry - e.radius - 8, 30 * (e.hp / e.maxHp), 4);
        ctx.fillStyle = e.isBoss ? '#f33' : (e.rarity > 0 ? '#fa0' : '#ccc');
        ctx.font = '10px Cinzel';
        ctx.textAlign = 'center';
        ctx.fillText(e.isBoss ? '☠️ ' + e.name : e.name, rx, ry - e.radius - 35);

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
        setGlow(ctx, 15, '#0088ff');

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
    const px = Math.round(player.x);
    const py = Math.round(player.y);

    if (spritesLoaded && processedSpriteSheet) {
        const frame = getHeroFrame(player.direction);
        const renderHeight = 48;
        const renderWidth = renderHeight * frame.width / frame.height;
        const scale = 1 + player.attackAnim * 0.2;

        let source = processedSpriteSheet;
        if (player.frozen || player.slowedTimer > 0) source = TintCache.ice;
        else if (player.poisoned) source = TintCache.poison;
        else if (player.lightningOverloadTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) source = TintCache.lightning;

        if (typeof MarketSystem !== 'undefined' && MarketSystem.isStalling) {
            ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height,
                px - renderWidth / 2, py - renderHeight / 2, renderWidth, renderHeight);
        } else if (scale === 1) {
            ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height,
                px - renderWidth / 2, py - renderHeight, renderWidth, renderHeight);
        } else {
            ctx.save();
            ctx.translate(px, py - renderHeight / 2);
            ctx.scale(scale, scale);
            ctx.drawImage(source, frame.x, frame.y, frame.width, frame.height,
                -renderWidth / 2, -renderHeight / 2, renderWidth, renderHeight);
            ctx.restore();
        }
    } else {
        ctx.fillStyle = player.color; ctx.beginPath(); ctx.arc(px, py, player.radius, 0, Math.PI * 2); ctx.fill();
    }

    projectiles.forEach(p => {
        // 视口剔除
        if (p.x < camera.x - 50 || p.x > camera.x + canvas.width + 50 ||
            p.y < camera.y - 50 || p.y > camera.y + canvas.height + 50) return;

        ctx.strokeStyle = p.color || '#fa0';
        ctx.fillStyle = p.color || '#fa0';
        ctx.lineWidth = 2;

        if (p.type === 'multishot') {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle);
            ctx.fillStyle = '#aaff00';
            ctx.beginPath();
            ctx.moveTo(8, 0); ctx.lineTo(-12, -2); ctx.lineTo(-8, 0); ctx.lineTo(-12, 2);
            ctx.closePath(); ctx.fill();
            ctx.restore();
        } else if (p.color === '#ffaa00' && p.owner !== player) {
            const len = 15;
            ctx.beginPath();
            ctx.moveTo(p.x - Math.cos(p.angle) * len, p.y - Math.sin(p.angle) * len);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
        } else {
            ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
        }
    });

    particles.forEach((p) => {
        // 视口剔除
        if (p.x < camera.x - 100 || p.x > camera.x + canvas.width + 100 ||
            p.y < camera.y - 120 || p.y > camera.y + canvas.height + 100) return;

        if (p.type === 'lightning') {
            ctx.beginPath();
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let j = 1; j < p.points.length; j++) ctx.lineTo(p.points[j].x, p.points[j].y);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.width * (p.life / 0.2);
            ctx.stroke();
            setGlow(ctx, 20, p.color);
            ctx.stroke();
            clearGlow(ctx);
        } else if (p.type === 'lightning_chain') {
            // 渲染闪电链（增强版）
            const alpha = p.life / (p.maxLife || 0.3);

            ctx.beginPath();
            ctx.moveTo(p.points[0].x, p.points[0].y);
            for (let j = 1; j < p.points.length; j++) {
                ctx.lineTo(p.points[j].x, p.points[j].y);
            }

            // 外层发光（蓝色光晕）
            ctx.globalAlpha = alpha * 0.5;
            ctx.strokeStyle = p.glowColor || '#88ccff';
            ctx.lineWidth = (p.lineWidth || 2) + 6;
            setGlow(ctx, 25, p.glowColor || '#88ccff');
            ctx.stroke();

            // 中层（主体颜色）
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = p.color;
            ctx.lineWidth = (p.lineWidth || 2) + 2;
            setGlow(ctx, 15, p.color);
            ctx.stroke();

            // 内核（白色高亮，主闪电才有）
            if (p.isMain) {
                ctx.globalAlpha = alpha;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = p.lineWidth || 2;
                setGlow(ctx, 8, '#ffffff');
                ctx.stroke();
            }

            clearGlow(ctx);
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

            // 发光效果（关键特效，强制开启）
            setGlow(ctx, 30, p.color, true);
            ctx.fillRect(p.x - beamWidth / 4, p.y - p.height, beamWidth / 2, p.height);
            clearGlow(ctx);

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
            setGlow(ctx, 10, p.color);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
            clearGlow(ctx);
            ctx.globalAlpha = 1.0;
        } else if (p.type === 'impact') {
            // 击中喷溅粒子 (带高度和阴影)
            if (p.z > 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.beginPath();
                ctx.ellipse(p.x, p.y, p.size, p.size / 2, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            // 飞行中也使用椭圆，更有动态感
            ctx.ellipse(p.x, p.y - (p.z || 0), p.size * 1.2, p.size * 0.8, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = p.color; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y - (p.z || 0), p.size, 0, Math.PI * 2); ctx.fill();
        }
    });
    ctx.globalAlpha = 1;

    // 绘制飞行拾取粒子（吸入效果）
    flyingPickups.forEach(fp => {
        ctx.save();
        const progress = fp.progress || 0;
        const alpha = 1 - progress * 0.3; // 渐变透明
        const scale = 1 + progress * 0.5; // 逐渐放大

        // 外发光
        setGlow(ctx, 15, fp.color);

        // 拖尾效果
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = fp.color;
        ctx.beginPath();
        ctx.arc(fp.startX + (fp.x - fp.startX) * 0.3, fp.startY + (fp.y - fp.startY) * 0.3, fp.size * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.arc(fp.startX + (fp.x - fp.startX) * 0.6, fp.startY + (fp.y - fp.startY) * 0.6, fp.size * 0.7, 0, Math.PI * 2);
        ctx.fill();

        // 主体
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(fp.x, fp.y, fp.size * scale, 0, Math.PI * 2);
        ctx.fill();

        // 内核高光
        clearGlow(ctx);
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = alpha * 0.8;
        ctx.beginPath();
        ctx.arc(fp.x, fp.y - fp.size * 0.3, fp.size * 0.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    });

    // 绘制斩击弧
    slashEffects.forEach(s => {
        const alpha = s.life;
        const color = s.color || '#ffffff';

        // 暴击时添加外发光
        if (s.isCrit) {
            setGlow(ctx, 15, '#ffdd00');
        }

        // 根据颜色解析RGB用于alpha渐变
        if (color === '#ffdd00') {
            ctx.strokeStyle = `rgba(255, 221, 0, ${alpha})`;
        } else {
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        }

        ctx.lineWidth = (s.isCrit ? 5 : 3) * alpha;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, s.angle - 0.8, s.angle + 0.8);
        ctx.stroke();

        // 清除发光效果
        clearGlow(ctx);
    });

    // 渲染墙壁遮挡修复 (Occlusion Fix)
    // 极简方案：在实体绘制完成后，将实体下方一行(r+1)的墙壁重新绘制一遍，以实现遮挡
    if (mapCacheCanvas) {
        const occlusionTiles = new Set();
        const collectOcclusion = (obj) => {
            const r = Math.floor(obj.y / TILE_SIZE), c = Math.floor(obj.x / TILE_SIZE);
            for (let dx = -1; dx <= 1; dx++) {
                if (mapData[r + 1] && mapData[r + 1][c + dx] === 0) {
                    occlusionTiles.add(`${c + dx},${r + 1}`);
                }
            }
        };
        enemies.forEach(e => { if (!e.dead) collectOcclusion(e); });
        collectOcclusion(player);
        occlusionTiles.forEach(key => {
            const [c, r] = key.split(',').map(Number);
            const tx = c * TILE_SIZE, ty = r * TILE_SIZE;
            ctx.drawImage(mapCacheCanvas, tx, ty, TILE_SIZE, TILE_SIZE, tx, ty, TILE_SIZE, TILE_SIZE);
        });
    }

    // 渲染地面物品 (放在遮挡修复后，防止闪烁)
    groundItems.forEach(i => {
        // 视口剔除 (Culling)
        if (i.x < camera.x - 100 || i.x > camera.x + canvas.width + 100 ||
            i.y < camera.y - 100 || i.y > camera.y + canvas.height + 100) return;

        const isConsumable = i.type === 'gold' || i.type === 'potion' || i.type === 'scroll';
        if (!isAltPressed && !isConsumable && i.rarity < 2) return;

        const rx = Math.round(i.x);
        const ry = Math.round(i.y);
        const rz = Math.round(i.z || 0);

        if (itemSpritesLoaded && processedItemSprites) {
            const coords = getItemSpriteCoords(i);
            const size = 32;
            const spriteSize = processedItemSprites.width / 4;

            // 绘制阴影
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(rx, ry, i.z > 0 ? 8 : 10, i.z > 0 ? 4 : 5, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.drawImage(processedItemSprites,
                coords.col * spriteSize, coords.row * spriteSize, spriteSize, spriteSize,
                rx - size / 2, ry - rz - size / 2, size, size
            );

            if (isAltPressed || i.rarity >= 3) {
                ctx.fillStyle = getItemColor(i.rarity); ctx.textAlign = 'center';
                ctx.font = '12px Cinzel';
                ctx.fillText(i.displayName || i.name, rx, ry - rz - 22);
            }
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(rx, ry, 10, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath(); ctx.fillStyle = getItemColor(i.rarity); ctx.textAlign = 'center';
            ctx.font = '20px serif'; ctx.fillText(i.icon || '📦', rx, ry - rz + 7);
        }
        if (i.rarity >= 4) {
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = getItemColor(i.rarity);
            ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 10, ry - 100); ctx.lineTo(rx + 10, ry - 100); ctx.fill();
            ctx.globalAlpha = 1;
        }
    });

    ctx.textAlign = 'center';
    damageNumbers.forEach(d => {
        // 动态字体大小
        const size = d.fontSize || 16;
        ctx.font = `bold ${size}px Arial`;
        ctx.fillStyle = d.color;
        ctx.fillText(d.val, d.x, d.y);
    });

    ctx.restore();

    // 死亡提示文字
    if (player.isDead) {
        // 设置 canvas filter 为 none，覆盖父容器的灰度滤镜，确保文字颜色正常
        ctx.filter = 'none';

        // 绘制死亡提示文字
        ctx.save();



        clearGlow(ctx);
        ctx.fillStyle = '#fff';
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`你已死亡，灵魂将在 ${Math.ceil(player.deathTimer)} 秒后返回罗格营地`, canvas.width / 2, canvas.height / 2 + 30);
        ctx.restore();
    }

    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 200, canvas.width / 2, canvas.height / 2, canvas.width / 1.2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 回城仪式视觉效果
    if (portalRitual.active) {
        ctx.save();

        if (portalRitual.phase === 0) {
            // 施法阶段：只显示读条
            const progress = 1 - (portalRitual.timer / PORTAL_RITUAL_DURATIONS.casting);

            // 读条UI
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(canvas.width / 2 - 100, canvas.height - 80, 200, 20);
            ctx.fillStyle = '#6699ff';
            ctx.fillRect(canvas.width / 2 - 98, canvas.height - 78, 196 * progress, 16);
            ctx.fillStyle = '#fff';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('传送中...', canvas.width / 2, canvas.height - 65);

        } else if (portalRitual.phase === 1) {
            // 光效阶段：粒子系统已处理，这里只保留空处理
        }

        // 白闪覆盖层（phase 2 和 3）
        if (portalRitual.flashAlpha > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${portalRitual.flashAlpha})`;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.restore();
    }

    // 升级特效：金色闪光覆盖层
    if (levelUpEffect.active && levelUpEffect.flashAlpha > 0) {
        ctx.save();
        // 金色径向渐变闪光
        const gradient = ctx.createRadialGradient(
            canvas.width / 2, canvas.height / 2, 0,
            canvas.width / 2, canvas.height / 2, canvas.width * 0.8
        );
        gradient.addColorStop(0, `rgba(255, 215, 0, ${levelUpEffect.flashAlpha * 0.6})`);
        gradient.addColorStop(0.5, `rgba(255, 180, 0, ${levelUpEffect.flashAlpha * 0.3})`);
        gradient.addColorStop(1, `rgba(255, 150, 0, 0)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
    }

    // 连击计数器渲染 (HUD) - 已移动至 DOM 渲染（updateSmoothUI），此处保留逻辑以供非平滑模式或以后扩展
    /*
    if (combo.active && combo.count > 1) {
        ... (已注销，因为 DOM 渲染效果更好且无锯齿)
    }
    */

    updateLabelsPosition();
    drawMinimap();
    updateTutorialBubble();
}

function updateLabelsPosition() {
    groundItems.forEach(i => {
        if (i.el) {
            const sx = i.x - camera.x, sy = i.y - camera.y - (i.z || 0) - 25; // 标签跟随物理运动
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
            miniCtx.fillStyle = mapData[y][x] === 0 ? '#777' : '#333';
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
            showDialog('地狱守卫', `你需要先去击杀第10层「${getFloorName(10)}」的Boss才能开启地狱模式。`, [
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
    // 成就追踪：进入地狱
    trackAchievement('enter_hell');
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
    if (cachedUI.hellIndicator) {
        if (player.isInHell) {
            cachedUI.hellIndicator.style.display = 'block';
            cachedUI.hellIndicator.innerText = '地狱';
        } else {
            cachedUI.hellIndicator.style.display = 'none';
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

    // 每日任务区域
    if (typeof DailyQuestSystem !== 'undefined') {
        DailyQuestSystem.updateUI();
    }
}

function updateQuestTracker() {
    const el = document.getElementById('quest-tracker');
    if (!el) return;

    // 使用独立子容器，避免与每日任务互相干扰
    let mainTracker = document.getElementById('main-quest-tracker');
    if (!mainTracker) {
        mainTracker = document.createElement('div');
        mainTracker.id = 'main-quest-tracker';
        el.insertBefore(mainTracker, el.firstChild);
    }

    // 主任务追踪
    const currentQ = getCurrentQuest();
    if (!currentQ || player.questState === 0) {
        mainTracker.innerHTML = '';
    } else {
        let text = "";
        let titleColor = "#c7b377";

        if (player.questState === 2) {
            text = "任务完成！回去找阿卡拉";
            titleColor = "#0f0";
        } else {
            if (currentQ.type === 'kill_count') {
                text = `进度: ${player.questProgress} / ${currentQ.target}`;
                if (player.floor !== currentQ.floor) text += ` (目标在: 第${currentQ.floor}层「${getFloorName(currentQ.floor)}」)`;
            } else if (currentQ.type === 'kill_elite' || currentQ.type === 'kill_boss') {
                text = `目标: ${currentQ.targetName}`;
                if (player.floor !== currentQ.floor) text += ` (目标在: 第${currentQ.floor}层「${getFloorName(currentQ.floor)}」)`;
            }
        }

        mainTracker.innerHTML = `<div><span class="tracker-title" style="color:${titleColor}">${currentQ.title}</span><br><span class="tracker-desc">${text}</span></div>`;
    }

    // 每日任务追踪器（始终更新，独立于主任务）
    if (typeof DailyQuestSystem !== 'undefined') {
        DailyQuestSystem.updateTracker();
    }
}

function renderAchievements() {
    const list = document.getElementById('achievement-list');
    if (!list) return;
    list.innerHTML = '';

    // 统计信息
    const stats = getAchievementStats();

    // 统计头部
    const header = document.createElement('div');
    header.className = 'ach-header';
    header.innerHTML = `
        <div class="ach-stats">
            <span class="ach-completed">完成 ${stats.completed}/${stats.total}</span>
            <span class="ach-points">成就点 ${stats.points}/${stats.maxPoints}</span>
        </div>
        <div class="ach-tabs" id="ach-tabs"></div>
    `;
    list.appendChild(header);

    // 类别标签
    const tabsContainer = header.querySelector('#ach-tabs');
    const currentFilter = list.dataset.filter || 'all';

    // 全部标签
    const allTab = document.createElement('span');
    allTab.className = 'ach-tab' + (currentFilter === 'all' ? ' active' : '');
    allTab.textContent = '全部';
    allTab.onclick = () => { list.dataset.filter = 'all'; renderAchievements(); };
    tabsContainer.appendChild(allTab);

    // 各类别标签 - 使用纯文字
    Object.keys(ACHIEVEMENT_CATEGORIES).forEach(cat => {
        const catInfo = ACHIEVEMENT_CATEGORIES[cat];
        const tab = document.createElement('span');
        tab.className = 'ach-tab' + (currentFilter === cat ? ' active' : '');
        tab.style.color = currentFilter === cat ? catInfo.color : '';
        tab.textContent = catInfo.name;  // 使用中文名而非emoji
        tab.onclick = () => { list.dataset.filter = cat; renderAchievements(); };
        tabsContainer.appendChild(tab);
    });

    // 成就列表容器
    const listContainer = document.createElement('div');
    listContainer.className = 'ach-list-container';
    list.appendChild(listContainer);

    // 筛选并渲染成就
    const filteredAch = ACHIEVEMENTS.filter(ach =>
        currentFilter === 'all' || ach.category === currentFilter
    );

    filteredAch.forEach(ach => {
        const progress = player.achievements[ach.id];
        if (!progress) return;

        const isCompleted = progress.completed;
        const catInfo = ACHIEVEMENT_CATEGORIES[ach.category] || {};

        const div = document.createElement('div');
        div.className = 'achievement-item' + (isCompleted ? ' completed' : '');

        // 计算进度百分比
        let currentProgress = progress.progress || 0;
        let progressPercent = Math.min(100, Math.floor((currentProgress / ach.target) * 100));

        // 进度文本
        let progressText = '';
        if (isCompleted) {
            progressText = '✓ 已完成';
        } else if (ach.type === 'reach_floor') {
            progressText = `${player.floor}/${ach.target}层`;
            progressPercent = Math.min(100, Math.floor((player.floor / ach.target) * 100));
        } else if (ach.type === 'reach_level') {
            progressText = `Lv.${player.lvl}/${ach.target}`;
            progressPercent = Math.min(100, Math.floor((player.lvl / ach.target) * 100));
        } else if (ach.type === 'total_damage' || ach.type === 'total_gold') {
            // 大数值格式化
            const formatNum = n => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : n;
            progressText = `${formatNum(currentProgress)}/${formatNum(ach.target)}`;
        } else {
            progressText = `${currentProgress}/${ach.target}`;
        }

        div.innerHTML = `
            <div class="ach-content">
                <div class="ach-name">${ach.name} <span class="ach-pts">+${ach.points || 0}</span></div>
                <div class="ach-desc">${ach.description}</div>
                <div class="ach-bar-container">
                    <div class="ach-bar" style="width:${progressPercent}%;background:${isCompleted ? '#4a4' : catInfo.color || '#666'}"></div>
                </div>
                <div class="ach-progress-text">${progressText}</div>
            </div>
        `;
        // 添加左侧色条
        div.style.borderLeftColor = catInfo.color || '#666';
        listContainer.appendChild(div);
    });
}

// New function for indicators
function updateMenuIndicators() {
    document.getElementById('badge-stats').style.display = player.points > 0 ? 'block' : 'none';
    document.getElementById('badge-skills').style.display = player.skillPoints > 0 ? 'block' : 'none';
    // 任务红点：主线任务可交付 或 每日任务有可领取奖励
    const hasMainQuestReward = player.questState === 2;
    const hasDailyReward = typeof DailyQuestSystem !== 'undefined' && DailyQuestSystem.hasClaimableReward();
    document.getElementById('badge-quest').style.display = (hasMainQuestReward || hasDailyReward) ? 'block' : 'none';
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
            monsterPool.push({ type: 'specter', name: '闪电幽魂', ai: 'specter', speed: 70, hpMult: 0.8, dmgMult: 1.4, weight: 10 });
        }
        // 6层+: 木乃伊
        if (f >= 6) {
            monsterPool.push({ type: 'mummy', name: '木乃伊', ai: 'chase', speed: 55, hpMult: 1.3, dmgMult: 0.9, weight: 10 });
        }
        // 7层+: 吸血鬼
        if (f >= 7) {
            monsterPool.push({ type: 'vampire', name: '吸血鬼', ai: 'vampire', speed: 60, hpMult: 1.2, dmgMult: 1.3, weight: 10 });
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
            dead: false, cooldown: 0, hitFlashTimer: 0, name, rarity: isElite ? 1 : 0, xpValue: xp,
            ai: ai, frameIndex: frameIndex,
            monsterType: type,              // 怪物类型标识
            eliteAffixes: eliteAffixes,     // 精英词缀列表
            isElite: isElite                // 精英怪标记
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
    const isCrit = typeof dmg === 'object' && dmg.isCrit;
    const angle = Math.atan2(e.y - player.y, e.x - player.x);

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
            createDamageNumber(e.x, e.y - 25, "处刑!", '#ff4444', angle);
        }
    }

    // 赌徒：伤害随机浮动
    if (hasTalent('gambler')) {
        const mult = 0.5 + Math.random() * 1.5; // 0.5 ~ 2.0
        totalDamage *= mult;
        if (mult > 1.5) createDamageNumber(e.x, e.y - 25, "幸运!", '#ffff00', angle);
        else if (mult < 0.7) createDamageNumber(e.x, e.y - 25, "倒霉...", '#888888', angle);
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
            createDamageNumber(e.x, e.y - 20, "抗性!", '#aa00ff', angle);
        }

        // 石肤：所有伤害减少50%
        if (e.damageReduction) {
            totalDamage *= (1 - e.damageReduction);
        }
    }

    e.hp -= totalDamage;
    e.hitFlashTimer = 0.1; // 触发受击闪白

    // 成就追踪：累计伤害和暴击
    trackAchievement('total_damage', { damage: Math.floor(totalDamage) });
    if (isCrit) trackAchievement('crit_count');

    // 击退逻辑 (Micro-Knockback)
    const kbForce = isCrit ? 12 : 6;
    const nx = e.x + Math.cos(angle) * kbForce;
    const ny = e.y + Math.sin(angle) * kbForce;
    if (typeof isWall !== 'undefined') {
        if (!isWall(nx, e.y)) e.x = nx;
        if (!isWall(e.x, ny)) e.y = ny;
    } else {
        e.x = nx; e.y = ny;
    }

    // 击中粒子 (Impact Particles)
    let particleColor = '#ff3333';
    if (e.frozenTimer > 0 || e.slowedTimer > 0) particleColor = '#33ccff';
    else if (e.poisonTimer > 0) particleColor = '#33ff33';
    else if (e.lightningOverloadTimer > 0) particleColor = '#ffff33';

    if (typeof createImpactParticles !== 'undefined') {
        createImpactParticles(e.x, e.y, particleColor, isCrit ? 8 : 4);
    }

    // 触发打击感
    Juice.hit(e, isCrit, false);

    // 检测近战可能波及的可破坏物体
    DestructibleSystem.checkMeleeCollision(e.x, e.y, 40);

    // 元素状态处理
    if (typeof dmg === 'object') {
        if (dmg.cold > 0) {
            // 冰霜：减速/冰冻效果已经在各技能中处理，此处补充视觉计时
            e.slowedTimer = Math.max(e.slowedTimer || 0, 2.0);
        }
        if (dmg.lightning > 0) {
            // 闪电：设置过载视觉
            e.lightningOverloadTimer = 0.5;
        }
    }

    // 淬毒之刃引发中毒 DOT
    if (hasTalent('poison_blade')) {
        const poisonVal = (typeof dmg === 'object' && dmg.poison) ? dmg.poison : (totalDamage * 0.2);
        if (poisonVal > 0) {
            if (!e.poisoned) {
                createDamageNumber(e.x, e.y - 25, "中毒!", COLORS.poison, angle);
            }
            e.poisoned = true;
            e.poisonTimer = 3.0; // 3秒中毒
            e.poisonDamagePerTick = poisonVal * 0.5; // 每跳伤害
        }
    }

    // 根据主导属性选择伤害颜色
    let dmgColor = '#fff';
    if (typeof dmg === 'object') {
        if (dmg.poison > (dmg.physical || 0)) dmgColor = COLORS.poison;
        else if (dmg.cold > (dmg.physical || 0)) dmgColor = COLORS.ice;
        else if (dmg.lightning > (dmg.physical || 0)) dmgColor = COLORS.lightning;
        else if (dmg.fire > (dmg.physical || 0)) dmgColor = COLORS.fire;
    }

    createDamageNumber(e.x, e.y, Math.floor(totalDamage), dmgColor, angle);

    // 层次感打击音效触发
    if (e.hp <= 0) {
        AudioSys.play('hit_kill');
    } else if (isCrit) {
        AudioSys.play('hit_crit');
    } else {
        AudioSys.play('hit');
    }

    if (e.hp <= 0) {
        // 怪物死亡 - 强烈的果汁感
        e.dead = true;
        Juice.hit(e, false, true); // 击杀反馈

        // 创建地面血迹
        createBloodSplat(e.x, e.y, e.radius);

        player.kills++;
        // 新手引导：步骤5 - 击杀第一只怪物
        if (player.kills === 1) advanceTutorial(5);

        // 每日任务：击杀怪物
        if (typeof DailyQuestSystem !== 'undefined') {
            DailyQuestSystem.updateProgress('kill', 1);
        }

        // 更新击杀统计
        player.stats.currentStreak++;
        if (player.stats.currentStreak > player.stats.maxKillStreak) {
            player.stats.maxKillStreak = player.stats.currentStreak;
        }
        if (e.isBoss) {
            player.stats.bossKills++;
            // Boss死亡特效：慢动作 + 爆炸粒子 + 巨型伤害数字
            triggerBossDeathEffect(e, totalDamage);
            // 全服公告：击杀Boss
            if (typeof OnlineSystem !== 'undefined') {
                OnlineSystem.announce('boss_kill', e.name);
            }
            // 每日任务：击杀Boss
            if (typeof DailyQuestSystem !== 'undefined') {
                DailyQuestSystem.updateProgress('kill_boss', 1);
            }
        }
        if (e.isElite) {
            player.stats.eliteKills++;
            // 精英怪死亡特效：比普通怪华丽，比Boss轻
            triggerEliteDeathEffect(e, totalDamage);
            // 每日任务：击杀精英怪
            if (typeof DailyQuestSystem !== 'undefined') {
                DailyQuestSystem.updateProgress('kill_elite', 1);
            }
        }

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
                        const chainAngle = Math.atan2(other.y - e.y, other.x - e.x);
                        createDamageNumber(other.x, other.y, Math.floor(chainDamage), '#88ffff', chainAngle);
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

        // 计算经验（检查双倍/三倍经验buff + 等级差系数）
        let xpGain = e.xpValue || 15;

        // 等级差经验系数：鼓励玩家打匹配等级的怪物
        const currentFloor = player.isInHell ? player.hellFloor : player.floor;
        const monsterLevel = currentFloor * 2;  // 怪物等级 ≈ 层数 × 2
        const levelDiff = player.lvl - monsterLevel;
        let levelMultiplier = 1;
        if (levelDiff > 5) {
            // 玩家比怪物高5级以上，经验骤降（每级-15%，最低10%）
            levelMultiplier = Math.max(0.1, 1 - (levelDiff - 5) * 0.15);
        } else if (levelDiff < -5) {
            // 玩家比怪物低5级以上，经验略增（每级+5%，最高130%）
            levelMultiplier = Math.min(1.3, 1 + Math.abs(levelDiff + 5) * 0.05);
        }
        xpGain *= levelMultiplier;

        // 双倍/三倍经验buff
        let xpMultiplier = 1;
        if (player.xpBuffTripleExpiry && Date.now() < player.xpBuffTripleExpiry) {
            xpMultiplier = 3;  // 三倍经验优先
        } else if (player.xpBuffExpiry && Date.now() < player.xpBuffExpiry) {
            xpMultiplier = 2;  // 双倍经验
        }
        xpGain *= xpMultiplier;
        player.xp += xpGain;
        createDamageNumber(player.x, player.y - 50, "+" + Math.floor(xpGain) + " XP", '#4d69cd');
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
    if (cachedUI.notificationArea) {
        cachedUI.notificationArea.innerText = msg;
        cachedUI.notificationArea.style.opacity = 1;
        setTimeout(() => {
            if (cachedUI.notificationArea) cachedUI.notificationArea.style.opacity = 0;
        }, 2000);
    }
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
    // 每日任务：通关楼层（进入下一层说明通关了当前层）
    if (typeof DailyQuestSystem !== 'undefined' && floor > 1) {
        DailyQuestSystem.updateProgress('clear_floor', 1);
    }

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

    // 成就追踪：购买天赋
    trackAchievement('talent_bought');

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

    // 只移除天赋图标，保留buff图标
    hudEl.querySelectorAll('.talent-hud-icon:not(.buff-hud-icon)').forEach(el => el.remove());

    for (const talentId of player.talents) {
        const talent = TALENTS[talentId];
        if (!talent) continue;

        const icon = document.createElement('div');
        icon.className = `talent-hud-icon tier-${talent.tier}`;
        icon.innerText = talent.icon;
        icon.style.cursor = 'default'; // 不显示手形指针

        // 鼠标悬停显示详细信息
        icon.addEventListener('mouseenter', (e) => {
            const tooltip = document.getElementById('tooltip');
            const tierColors = { normal: '#888', rare: '#4850b8', epic: '#a335ee', legendary: '#ff8000' };
            const tierColor = tierColors[talent.tier] || '#888';
            tooltip.innerHTML = `<div style="color:${tierColor}; font-weight:bold; margin-bottom:4px;">${talent.icon} ${talent.name}</div>
                <div style="color:#88ff88;">${talent.desc}</div>`;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 10) + 'px';
            tooltip.style.top = (e.clientY + 10) + 'px';
        });
        icon.addEventListener('mouseleave', () => {
            document.getElementById('tooltip').style.display = 'none';
        });
        icon.addEventListener('mousemove', (e) => {
            const tooltip = document.getElementById('tooltip');
            tooltip.style.left = (e.clientX + 10) + 'px';
            tooltip.style.top = (e.clientY + 10) + 'px';
        });
        // 阻止点击穿透到游戏画布
        icon.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

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
    // 成就追踪：获得赐福
    trackAchievement('blessing_count');
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
            return `<span style="color:#88ff88">+${v}${isPercent ? '%' : ''} ${effectNames[k] || k}`;
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
            showNotification(`双倍经验已激活！持续${reward.amount}小时`);
            break;
        case 'buff_gold':
            // 双倍金币buff
            player.goldBuffExpiry = Date.now() + reward.amount * 60 * 60 * 1000;
            showNotification(`双倍金币已激活！持续${reward.amount}小时`);
            break;
        case 'buff_drop':
            // 双倍掉落buff
            player.dropBuffExpiry = Date.now() + reward.amount * 60 * 60 * 1000;
            showNotification(`双倍掉落已激活！持续${reward.amount}小时`);
            break;
        case 'buff_xp_triple':
            // 三倍经验buff + 套装装备
            player.xpBuffTripleExpiry = Date.now() + reward.amount * 60 * 60 * 1000;
            showNotification(`🔥 三倍经验已激活！持续${reward.amount}小时`);
            // 生成一件随机套装装备
            const setItem = generateRandomSetItem(Math.max(player.lvl, 10));
            if (setItem) {
                addItemToInventory(setItem);
                showNotification(`🏆 获得套装：${setItem.displayName || setItem.name}`);
            }
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

    // 延迟1.5秒后自动关闭面板
    setTimeout(() => closeDailyLoginPanel(), 1500);
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

    // 构建层数列表：lastFloor优先，maxFloor次之，其他倒序
    let floors = [];

    // 1. 上次所在层（如果 > 1）
    if (lastFloor > 1) {
        floors.push({ floor: lastFloor, label: `${lastFloor}层 ${getFloorName(lastFloor)} (上次)` });
    }

    // 2. 最高层（如果不等于上次所在层且 > 1）
    if (maxFloor > 1 && maxFloor !== lastFloor) {
        floors.push({ floor: maxFloor, label: `${maxFloor}层 ${getFloorName(maxFloor)} (最高)` });
    }

    // 3. 其他层倒序（排除已添加的和1层）
    for (let i = maxFloor; i >= 2; i--) {
        if (i !== lastFloor && i !== maxFloor) {
            floors.push({ floor: i, label: `${i}层 ${getFloorName(i)}` });
        }
    }

    // 生成按钮HTML
    let buttonsHtml = '<div class="portal-floor-list">';
    floors.forEach(f => {
        buttonsHtml += `<button class="dialog-btn portal-floor-btn" onclick="selectPortalFloor(${f.floor})">${f.label}</button>`;
    });
    buttonsHtml += '</div>';
    buttonsHtml += '<button class="dialog-btn" onclick="closeDialog()">取消</button>';

    dialogOptions.innerHTML = buttonsHtml;
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
    const effectiveLevel = Math.max(1, level);

    // 基础等级需求 = 楼层等级
    let levelReq = effectiveLevel;

    // 根据稀有度增加等级需求
    if (rarity === 2) levelReq += 2;  // 魔法
    if (rarity === 3) levelReq += 5;  // 稀有
    if (rarity === 4) levelReq += 10; // 暗金
    if (rarity === 5) levelReq += 5;  // 套装（需求低于暗金）

    requirements.level = levelReq;

    // 需求上限：确保装备在掉落层级时玩家能够装备
    // 公式：level × 8 + 15，5层时约55，10层约95，适合合理的属性分配
    const strCap = effectiveLevel * 8 + 15;
    const dexCap = effectiveLevel * 6 + 10;

    // 根据装备类型设置力量/敏捷需求
    if (item.type === 'weapon') {
        // 武器：基于伤害值
        if (item.minDmg) {
            const avgDmg = (item.minDmg + item.maxDmg) / 2;
            requirements.str = Math.min(Math.floor(avgDmg * 2), strCap);
            requirements.dex = Math.min(Math.floor(avgDmg * 1.5), dexCap);
        }
    } else if (item.type === 'armor' || item.type === 'helm' || item.type === 'gloves' ||
        item.type === 'boots' || item.type === 'belt') {
        // 防具：基于防御值
        if (item.def) {
            requirements.str = Math.min(Math.floor(item.def * 1.5), strCap);
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

    // 每日任务：拾取装备（排除消耗品）
    if (typeof DailyQuestSystem !== 'undefined' && i.type !== 'potion' && i.type !== 'scroll' && i.type !== 'gold') {
        DailyQuestSystem.updateProgress('collect_item', 1);
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

// 创建闪电链视觉效果（增强版：分叉 + 白色闪光 + 残影）
function createLightningChain(fromX, fromY, toX, toY) {
    const segments = 8;  // 更多分段让闪电更细腻
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy);

    const points = [{ x: fromX, y: fromY }];

    for (let i = 1; i < segments; i++) {
        const t = i / segments;
        const baseX = fromX + dx * t;
        const baseY = fromY + dy * t;

        // 添加随机偏移让闪电看起来更自然
        const offset = (Math.random() - 0.5) * 40;  // 增大偏移
        const perpX = -dy / dist;
        const perpY = dx / dist;

        points.push({
            x: baseX + perpX * offset,
            y: baseY + perpY * offset
        });
    }
    points.push({ x: toX, y: toY });

    // 主闪电
    particles.push({
        type: 'lightning_chain',
        points: points,
        life: 0.25,
        maxLife: 0.25,
        color: '#ffffff',  // 主体白色
        glowColor: '#88ccff',  // 外发光蓝色
        lineWidth: 3,
        isMain: true
    });

    // 电弧残影（稍微延迟消失）
    particles.push({
        type: 'lightning_chain',
        points: points.map(p => ({ x: p.x, y: p.y })),
        life: 0.4,
        maxLife: 0.4,
        color: '#4488ff',  // 残影蓝色
        glowColor: '#2244aa',
        lineWidth: 2,
        isMain: false
    });

    // 分叉闪电（从中间点分出）
    const branchChance = 0.4;  // 40%概率产生分叉
    for (let i = 2; i < points.length - 2; i++) {
        if (Math.random() < branchChance) {
            const branchLength = 30 + Math.random() * 50;
            const branchAngle = (Math.random() - 0.5) * Math.PI * 0.8;  // 随机角度
            const baseAngle = Math.atan2(dy, dx);

            const branchPoints = [{ x: points[i].x, y: points[i].y }];
            const branchSegments = 3;

            for (let j = 1; j <= branchSegments; j++) {
                const t = j / branchSegments;
                const angle = baseAngle + branchAngle;
                branchPoints.push({
                    x: points[i].x + Math.cos(angle) * branchLength * t + (Math.random() - 0.5) * 15,
                    y: points[i].y + Math.sin(angle) * branchLength * t + (Math.random() - 0.5) * 15
                });
            }

            particles.push({
                type: 'lightning_chain',
                points: branchPoints,
                life: 0.15,
                maxLife: 0.15,
                color: '#aaddff',
                glowColor: '#4488cc',
                lineWidth: 1.5,
                isMain: false
            });
        }
    }

    // 命中点火花
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 60;
        particles.push({
            x: toX,
            y: toY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: '#88ccff',
            life: 0.3 + Math.random() * 0.2,
            size: 2 + Math.random() * 2,
            gravity: 50
        });
    }
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

// 创建伤害数字（高性能版本：支持对象池与中央物理驱动）
function createDamageNumber(x, y, val, color, angle = null) {
    const isCrit = color === COLORS.critical || val === "暴击!" || (typeof val === 'string' && (val.includes('!') || val.includes('Crit')));
    const isGold = color === 'gold' || (typeof val === 'string' && val.includes(' G'));

    // 物理参数预计算
    let vx = 0, vy = 0, gravity = 400, life = 1.0;
    const isPoison = color === COLORS.poison || color === '#00ff00' || color === 'poison';
    const isIce = color === COLORS.ice || color === '#00ccff' || color === 'ice';
    const isLightning = color === COLORS.lightning || color === '#ffff00' || color === 'lightning';

    if (isPoison) {
        vx = (Math.random() - 0.5) * 60; vy = -40 - Math.random() * 30; gravity = 150; life = 0.8;
    } else if (isIce) {
        vx = (Math.random() - 0.5) * 20; vy = -20 - Math.random() * 10; gravity = 50; life = 1.2;
    } else if (isLightning) {
        vx = (Math.random() - 0.5) * 300; vy = -180 - Math.random() * 120; gravity = 800; life = 0.6;
    } else {
        if (angle !== null) {
            const speed = isCrit ? 150 : 80;
            vx = Math.cos(angle) * speed + (Math.random() - 0.5) * 50;
            vy = Math.sin(angle) * speed - 100;
        } else {
            vx = (Math.random() - 0.5) * (isCrit ? 200 : 100);
            vy = isCrit ? -250 : -150;
        }
        gravity = isCrit ? 600 : 400;
    }

    // 高级排版渲染 (DOM Mode)
    if (player.graphicsQuality === 'high' && cachedUI.floatingTexts) {
        const div = document.createElement('div');
        const className = isCrit ? 'dmg-crit' : (isGold ? 'dmg-gold' : 'dmg-normal');
        div.className = `damage-number ${className}`;
        div.innerText = val;
        if (!isCrit && !isGold) div.style.color = color;

        // 记录初始屏幕坐标
        const screenX = x - camera.x;
        const screenY = y - camera.y;
        div.style.left = screenX + 'px';
        div.style.top = screenY + 'px';
        cachedUI.floatingTexts.appendChild(div);

        // 如果是暴击，触发 GSAP 特效弹出
        if (isCrit) GSAPAnims.critPop(div);

        damageNumbers.push(DamageNumberPool.acquire({
            x, y, val, color, isHTML: true, el: div,
            vx, vy, gravity, life, maxLife: life,
            sx: screenX, sy: screenY,
            isLightning, isPoison, isIce, isCrit, flickerTimer: 0
        }));
    } else {
        // 基础渲染 (Canvas Mode)
        damageNumbers.push(DamageNumberPool.acquire({
            x, y, val, color,
            life: isCrit ? 1.0 : 0.8,
            vx, vy, gravity,
            fontSize: isCrit ? 24 : 16
        }));
    }
}

// 触发震屏
function createSlashEffect(fromX, fromY, toX, toY, damage = 50, isCrit = false) {
    const angle = Math.atan2(toY - fromY, toX - fromX);

    // 暴击时更多斩击弧、更大半径
    let count = damage < 50 ? 1 : damage < 150 ? 2 : 3;
    if (isCrit) count = Math.min(count + 2, 5);  // 暴击增加2条，最多5条

    const getOffsets = (n) => {
        if (n === 1) return [0];
        if (n === 2) return [-0.5, 0.5];
        if (n === 3) return [-0.7, 0, 0.7];
        if (n === 4) return [-0.9, -0.3, 0.3, 0.9];
        return [-1.0, -0.5, 0, 0.5, 1.0];
    };

    const offsets = getOffsets(count);
    offsets.forEach(off => {
        slashEffects.push({
            x: fromX + Math.cos(angle) * 10,
            y: fromY + Math.sin(angle) * 10,
            angle: angle + off,
            radius: isCrit ? 45 : 30,  // 暴击更大半径
            life: 1.0,
            isCrit: isCrit,  // 标记暴击，用于渲染
            color: isCrit ? '#ffdd00' : '#ffffff'  // 暴击金色，普通白色
        });
    });
}

function createFloatingText(x, y, text, color = '#ffff00', duration = 2) {
    // 创建DOM元素显示浮动文字
    if (!cachedUI.floatingTexts) return;

    const el = document.createElement('div');
    el.className = 'floating-text';
    el.textContent = text;
    el.style.color = color;
    el.style.left = (x - camera.x) + 'px';
    el.style.top = (y - camera.y - 20) + 'px';
    el.style.opacity = '1';

    cachedUI.floatingTexts.appendChild(el);

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
// 画质相关的粒子配置
const PARTICLE_CONFIG = {
    high: { maxParticles: 200, fireballTrail: 0.6, multishotTrail: 0.4 },
    low: { maxParticles: 100, fireballTrail: 0.25, multishotTrail: 0.15 }
};

function getParticleConfig() {
    return PARTICLE_CONFIG[player.graphicsQuality] || PARTICLE_CONFIG.high;
}

function createParticle(x, y, color, size = 3) {
    const maxParticles = getParticleConfig().maxParticles;
    if (particles.length >= maxParticles) return;  // 超出上限不创建
    particles.push(ParticlePool.acquire({ x, y, color, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 100, life: 0.5, size }));
}

function createImpactParticles(x, y, color, count = 5) {
    const maxP = getParticleConfig().maxParticles;
    for (let i = 0; i < count; i++) {
        if (particles.length >= maxP) break;
        const angle = Math.random() * Math.PI * 2;
        const speed = 40 + Math.random() * 80;
        particles.push(ParticlePool.acquire({
            x: x, y: y, z: 5 + Math.random() * 5,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            vz: 80 + Math.random() * 80,
            color: color || '#ff0000',
            life: 0.6 + Math.random() * 0.4,
            size: 1.5 + Math.random() * 1.5,
            gravity: 800,
            type: 'impact',
            canBake: color === '#ff3333' // 只有红血可以烘焙到地面
        }));
    }
}

// ========== 掉落特效系统 ==========
let screenShake = { intensity: 0, duration: 0 };

// 画质感知的 shadowBlur 设置
// force=true 时强制设置（用于Boss死亡、暗金掉落等关键特效）
function setGlow(ctx, blur, color, force = false) {
    if (player.graphicsQuality === 'high' || force) {
        // Canvas 的 shadowBlur 是性能杀手，仅在极高画质且非极多对象时开启
        // 我们通过简单判断粒子或物品数量来动态降级
        if (particles.length > 50 && !force) return;
        ctx.shadowBlur = blur;
        ctx.shadowColor = color;
    }
}

function clearGlow(ctx) {
    ctx.shadowBlur = 0;
}

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

// 创建传送门光柱特效（复用掉落光柱样式，蓝色主题）
function createPortalBeam(x, y) {
    // 光柱颜色：蓝紫色主题
    const beamColor = '#6699ff';
    const glowColor = 'rgba(100, 150, 255, 0.6)';

    // 创建光柱粒子
    particles.push({
        type: 'drop_beam',
        x: x,
        y: y,
        color: beamColor,
        glowColor: glowColor,
        life: 1.2,           // 持续1.2秒
        maxLife: 1.2,
        height: 250,         // 光柱更高
        width: 50,
        isUnique: true       // 使用更亮的效果
    });

    // 火花粒子（蓝色系）
    const sparkCount = 30;
    for (let i = 0; i < sparkCount; i++) {
        const angle = (Math.PI * 2 / sparkCount) * i + Math.random() * 0.3;
        const speed = 100 + Math.random() * 150;
        const sparkColor = ['#6699ff', '#88aaff', '#aaccff', '#ffffff'][Math.floor(Math.random() * 4)];

        particles.push({
            x: x,
            y: y - 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 120,  // 向上偏移
            color: sparkColor,
            life: 0.8 + Math.random() * 0.4,
            size: 2 + Math.random() * 4,
            gravity: 120  // 重力效果
        });
    }

    // 上升光点
    for (let i = 0; i < 15; i++) {
        particles.push({
            type: 'rising_spark',
            x: x + (Math.random() - 0.5) * 40,
            y: y,
            vy: -180 - Math.random() * 120,
            color: beamColor,
            life: 1.0 + Math.random() * 0.5,
            size: 3 + Math.random() * 3
        });
    }
}

// 创建飞行拾取粒子（类《幸存者》吸入效果）
function createFlyingPickup(item, type) {
    const startX = item.x;
    const startY = item.y;

    // 控制点：先向外飞再弧线吸入
    const dirX = startX - player.x;
    const dirY = startY - player.y;
    const dist = Math.hypot(dirX, dirY);

    // 控制点1：向外+向上抛
    const controlX1 = startX + (dirX / dist) * 40 + (Math.random() - 0.5) * 60;
    const controlY1 = startY - 50 - Math.random() * 30;

    // 控制点2：靠近玩家
    const controlX2 = player.x + (Math.random() - 0.5) * 30;
    const controlY2 = player.y - 40;

    // 颜色
    let color = '#ffd700'; // 默认金色
    if (type === 'potion') {
        color = item.heal ? '#ff4444' : '#4499ff'; // 红药/蓝药
    } else if (type === 'scroll') {
        color = '#aaaaff';
    }

    const fp = {
        type: type,
        item: item,
        value: item.val || 0,
        x: startX,
        y: startY,
        startX: startX,
        startY: startY,
        controlX1: controlX1,
        controlY1: controlY1,
        controlX2: controlX2,
        controlY2: controlY2,
        progress: 0,
        color: color,
        size: type === 'gold' ? 4 : 6
    };

    flyingPickups.push(fp);

    // 调用 GSAP 驱动飞行实现
    GSAPAnims.lootFly(fp, player, () => {
        // 飞行结束后的奖励逻辑
        if (fp.type === 'gold') {
            addGold(fp.value);
            createDamageNumber(player.x, player.y - 40, `+${fp.value} G`, 'gold');
            AudioSys.play('gold');
        } else if (fp.type === 'potion' || fp.type === 'scroll') {
            if (addItemToInventory(fp.item)) {
                showNotification(`拾取：${fp.item.displayName || fp.item.name}`);
            }
        }
        // 从数组中移除
        const idx = flyingPickups.indexOf(fp);
        if (idx !== -1) flyingPickups.splice(idx, 1);
    });
}

// 触发升级特效
function triggerLevelUpEffect(newLevel) {
    levelUpEffect.active = true;
    levelUpEffect.timer = 1.5; // 1.5秒特效持续时间
    levelUpEffect.flashAlpha = 0.8;
    levelUpEffect.newLevel = newLevel;

    // 震屏
    triggerScreenShake(10, 0.4);

    // 音效
    AudioSys.play('levelup');

    // 创建金色光柱
    createLevelUpBeam(player.x, player.y);

    // 创建大量金色粒子爆发
    const particleCount = 40;
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 / particleCount) * i + Math.random() * 0.2;
        const speed = 150 + Math.random() * 200;
        const sparkColor = ['#ffd700', '#ffaa00', '#ffcc44', '#ffffff'][Math.floor(Math.random() * 4)];

        particles.push({
            x: player.x,
            y: player.y - 20,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 80,
            color: sparkColor,
            life: 1.0 + Math.random() * 0.5,
            size: 3 + Math.random() * 4,
            gravity: 100
        });
    }

    // 创建上升的星星
    for (let i = 0; i < 15; i++) {
        particles.push({
            type: 'rising_spark',
            x: player.x + (Math.random() - 0.5) * 60,
            y: player.y,
            vy: -200 - Math.random() * 150,
            color: '#ffd700',
            life: 1.2 + Math.random() * 0.5,
            size: 4 + Math.random() * 3
        });
    }

    // 显示升级文字
    createDamageNumber(player.x, player.y - 80, `🎉 Lv.${newLevel} 🎉`, '#ffd700');
}

// 创建升级光柱（金色版本）
function createLevelUpBeam(x, y) {
    const beamColor = '#ffd700';
    const glowColor = 'rgba(255, 215, 0, 0.6)';

    particles.push({
        type: 'drop_beam',
        x: x,
        y: y,
        color: beamColor,
        glowColor: glowColor,
        life: 1.5,
        maxLife: 1.5,
        height: 300,
        width: 60,
        isUnique: true
    });
}

// Boss死亡特效：慢动作 + 爆炸粒子 + 巨型伤害数字
// Boss死亡特效：慢动作 + 爆炸粒子 + 巨型伤害数字 (已移至 enemy-system.js)

// 精英怪死亡特效：比普通怪华丽，比Boss轻
function triggerEliteDeathEffect(elite, damage) {
    // 轻微慢动作（比Boss短）
    slowMotion.active = true;
    slowMotion.timer = 0.3;  // 0.3秒慢动作
    slowMotion.scale = 0.4;  // 40%速度

    // 中等震屏
    triggerScreenShake(12, 0.3);

    // 音效 (已取消)
    // AudioSys.play('quest');

    // 大伤害数字（紫色，中等大小）
    damageNumbers.push({
        x: elite.x,
        y: elite.y - 40,
        val: `⚔ ${Math.floor(damage)} ⚔`,
        color: '#aa44ff',
        life: 1.8,
        fontSize: 32,
        vx: (Math.random() - 0.5) * 20,
        vy: -60,
        gravity: 50
    });

    // 精英名字提示
    damageNumbers.push({
        x: elite.x,
        y: elite.y - 70,
        val: `${elite.name} 已击杀`,
        color: '#ffaa00',
        life: 2.0,
        fontSize: 18,
        vx: 0,
        vy: -20,
        gravity: 0
    });

    // 紫色爆炸粒子（比Boss少）
    const particleCount = 25;
    for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 / particleCount) * i + Math.random() * 0.3;
        const speed = 120 + Math.random() * 180;
        const sparkColor = ['#aa44ff', '#cc66ff', '#ff88ff', '#ffffff'][Math.floor(Math.random() * 4)];

        particles.push({
            x: elite.x,
            y: elite.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 60,
            color: sparkColor,
            life: 0.8 + Math.random() * 0.5,
            size: 3 + Math.random() * 4,
            gravity: 100
        });
    }

    // 紫色光柱（比Boss矮）
    particles.push({
        type: 'drop_beam',
        x: elite.x,
        y: elite.y,
        color: '#aa44ff',
        glowColor: 'rgba(170, 68, 255, 0.5)',
        life: 0.8,
        maxLife: 0.8,
        height: 200,
        width: 40,
        isUnique: false
    });

    // 上升光点
    for (let i = 0; i < 10; i++) {
        particles.push({
            type: 'rising_spark',
            x: elite.x + (Math.random() - 0.5) * 40,
            y: elite.y,
            vy: -150 - Math.random() * 100,
            color: ['#aa44ff', '#cc66ff', '#ffaaff'][Math.floor(Math.random() * 3)],
            life: 0.8 + Math.random() * 0.4,
            size: 3 + Math.random() * 3
        });
    }
}

// ========== 传送门和地牢入口/出口渲染 ==========

// 绘制传送门（蓝紫色旋转能量漩涡）
function drawPortal(x, y, label) {
    const time = Date.now() / 1000;
    const baseRadius = 18;

    // 外层光晕（脉动）
    const pulseScale = 1 + Math.sin(time * 3) * 0.15;
    const glowRadius = baseRadius * 1.8 * pulseScale;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    gradient.addColorStop(0, 'rgba(100, 150, 255, 0.4)');
    gradient.addColorStop(0.5, 'rgba(80, 100, 200, 0.2)');
    gradient.addColorStop(1, 'rgba(60, 80, 180, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // 外层旋转环（逆时针）
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-time * 1.5);
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 / 6) * i;
        const arcStart = angle - 0.3;
        const arcEnd = angle + 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 1.2, arcStart, arcEnd);
        ctx.stroke();
    }
    ctx.restore();

    // 内层旋转环（顺时针）
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 2.5);
    ctx.strokeStyle = 'rgba(180, 120, 255, 0.8)';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * 2 / 4) * i;
        const arcStart = angle - 0.4;
        const arcEnd = angle + 0.4;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius * 0.7, arcStart, arcEnd);
        ctx.stroke();
    }
    ctx.restore();

    // 中心能量核心
    const coreGradient = ctx.createRadialGradient(x, y, 0, x, y, baseRadius * 0.5);
    coreGradient.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    coreGradient.addColorStop(0.5, 'rgba(150, 200, 255, 0.6)');
    coreGradient.addColorStop(1, 'rgba(100, 150, 255, 0)');
    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(x, y, baseRadius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    // 漂浮能量粒子（向中心汇聚）
    for (let i = 0; i < 5; i++) {
        const particleAngle = time * 2 + (Math.PI * 2 / 5) * i;
        const particleRadius = baseRadius * (0.8 + Math.sin(time * 4 + i) * 0.3);
        const px = x + Math.cos(particleAngle) * particleRadius;
        const py = y + Math.sin(particleAngle) * particleRadius;
        const pSize = 2 + Math.sin(time * 5 + i * 2) * 1;

        ctx.fillStyle = `rgba(200, 220, 255, ${0.6 + Math.sin(time * 3 + i) * 0.3})`;
        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fill();
    }

    // 标签
    ctx.fillStyle = '#aaddff';
    ctx.font = '12px Cinzel';
    ctx.textAlign = 'center';
    setGlow(ctx, 8, '#4488ff');
    ctx.fillText(label, x, y - 28);
    clearGlow(ctx);
}

// 绘制地牢出口（下行漩涡 - 蓝色）
function drawDungeonExit(x, y, label) {
    const time = Date.now() / 1000;
    const size = 20;

    // 外层发光
    const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 1.5);
    glowGradient.addColorStop(0, 'rgba(60, 120, 200, 0.4)');
    glowGradient.addColorStop(0.7, 'rgba(40, 80, 160, 0.15)');
    glowGradient.addColorStop(1, 'rgba(20, 40, 80, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
    ctx.fill();

    // 下行阶梯效果（三层矩形）
    const pulseOffset = Math.sin(time * 2) * 2;
    ctx.fillStyle = '#1a3355';
    ctx.fillRect(x - size, y - size / 2 + pulseOffset, size * 2, size / 3);
    ctx.fillStyle = '#2a4466';
    ctx.fillRect(x - size * 0.7, y - size / 6 + pulseOffset, size * 1.4, size / 3);
    ctx.fillStyle = '#3a5577';
    ctx.fillRect(x - size * 0.4, y + size / 6 + pulseOffset, size * 0.8, size / 3);

    // 边框发光
    ctx.strokeStyle = `rgba(80, 150, 255, ${0.6 + Math.sin(time * 3) * 0.3})`;
    ctx.lineWidth = 2;
    setGlow(ctx, 10, '#4488ff');
    ctx.strokeRect(x - size, y - size / 2 + pulseOffset, size * 2, size);
    clearGlow(ctx);

    // 中心下箭头
    ctx.fillStyle = `rgba(100, 180, 255, ${0.7 + Math.sin(time * 4) * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.6 + pulseOffset);
    ctx.lineTo(x - 6, y + pulseOffset);
    ctx.lineTo(x + 6, y + pulseOffset);
    ctx.closePath();
    ctx.fill();

    // 标签
    ctx.fillStyle = '#88ccff';
    ctx.font = '12px Cinzel';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - size - 8);
}

// 绘制地牢入口（上行拱门 - 金色）
function drawDungeonEntrance(x, y, label) {
    const time = Date.now() / 1000;
    const size = 18;

    // 外层暖色发光
    const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, size * 1.6);
    glowGradient.addColorStop(0, 'rgba(200, 150, 50, 0.35)');
    glowGradient.addColorStop(0.6, 'rgba(180, 120, 40, 0.15)');
    glowGradient.addColorStop(1, 'rgba(100, 80, 30, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // 拱门形状
    const pulseScale = 1 + Math.sin(time * 2.5) * 0.05;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulseScale, pulseScale);

    // 拱门主体
    ctx.fillStyle = '#3d2a1a';
    ctx.beginPath();
    ctx.moveTo(-size, size * 0.6);
    ctx.lineTo(-size, -size * 0.3);
    ctx.arc(0, -size * 0.3, size, Math.PI, 0, false);
    ctx.lineTo(size, size * 0.6);
    ctx.closePath();
    ctx.fill();

    // 拱门内部（光亮）
    const innerGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.7);
    innerGradient.addColorStop(0, 'rgba(255, 220, 150, 0.8)');
    innerGradient.addColorStop(0.7, 'rgba(255, 180, 80, 0.4)');
    innerGradient.addColorStop(1, 'rgba(200, 120, 50, 0.2)');
    ctx.fillStyle = innerGradient;
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, size * 0.5);
    ctx.lineTo(-size * 0.6, -size * 0.2);
    ctx.arc(0, -size * 0.2, size * 0.6, Math.PI, 0, false);
    ctx.lineTo(size * 0.6, size * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // 边框发光
    ctx.strokeStyle = `rgba(255, 200, 100, ${0.5 + Math.sin(time * 3) * 0.3})`;
    ctx.lineWidth = 2;
    setGlow(ctx, 8, '#ffaa44');
    ctx.beginPath();
    ctx.moveTo(x - size, y + size * 0.6);
    ctx.lineTo(x - size, y - size * 0.3);
    ctx.arc(x, y - size * 0.3, size, Math.PI, 0, false);
    ctx.lineTo(x + size, y + size * 0.6);
    ctx.stroke();
    clearGlow(ctx);

    // 上箭头指示
    ctx.fillStyle = `rgba(255, 220, 120, ${0.6 + Math.sin(time * 4) * 0.3})`;
    const arrowY = y - size * 0.5 + Math.sin(time * 3) * 3;
    ctx.beginPath();
    ctx.moveTo(x, arrowY - 8);
    ctx.lineTo(x - 5, arrowY);
    ctx.lineTo(x + 5, arrowY);
    ctx.closePath();
    ctx.fill();

    // 标签
    ctx.fillStyle = '#ffcc88';
    ctx.font = '12px Cinzel';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - size - 12);
}

// 绘制有机血迹/喷溅的通用工具函数
function drawSplatToCtx(targetCtx, x, y, radius, baseColor, alpha) {
    targetCtx.save();
    targetCtx.translate(x, y);
    targetCtx.rotate(Math.random() * Math.PI * 2);
    // 随机拉伸，模拟液体喷溅的不规则感
    targetCtx.scale(0.8 + Math.random() * 0.4, 0.6 + Math.random() * 0.4);

    const gradient = targetCtx.createRadialGradient(0, 0, 0, 0, 0, radius);
    if (baseColor === '#ff3333' || baseColor === COLORS.poison) {
        // 针对不同属性使用对应的深浅渐变
        const darkColor = baseColor === '#ff3333' ? 'rgba(80, 0, 0, 0)' : 'rgba(0, 50, 0, 0)';
        const midColor = baseColor === '#ff3333' ? `rgba(140, 0, 0, ${alpha})` : `rgba(0, 140, 0, ${alpha})`;
        gradient.addColorStop(0, midColor);
        gradient.addColorStop(1, darkColor);
    } else {
        gradient.addColorStop(0, baseColor);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
    }

    targetCtx.fillStyle = gradient;
    targetCtx.beginPath();
    targetCtx.ellipse(0, 0, radius, radius * 0.7, 0, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.restore();
}

// 创建地面血迹 (优化：直接写入离屏画布，并减少垃圾回收)
function createBloodSplat(x, y, size) {
    if (!bloodCtx) return;
    const splatCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < splatCount; i++) {
        const sx = x + (Math.random() - 0.5) * size * 2;
        const sy = y + (Math.random() - 0.5) * size * 2;
        const radius = (size * 0.5) + Math.random() * size;
        drawSplatToCtx(bloodCtx, sx, sy, radius, '#ff3333', 0.4 + Math.random() * 0.3);
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
                maxFloor: player.isInHell ? (player.maxHellFloor || player.hellFloor) + 10 : player.maxFloor,
                isHell: player.isInHell,
                gold: player.gold || 0
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

// 仓库扩建费用配置
const STASH_EXPAND_COSTS = [1000, 5000, 20000];
const STASH_BASE_SIZE = 36;
const STASH_EXPAND_PER_LEVEL = 6;
const STASH_MAX_LEVEL = 3;

// 获取当前仓库大小
function getStashSize() {
    return STASH_BASE_SIZE + (player.stashLevel || 0) * STASH_EXPAND_PER_LEVEL;
}

// 获取下次扩建费用（已满级返回null）
function getStashExpandCost() {
    if (player.stashLevel >= STASH_MAX_LEVEL) return null;
    return STASH_EXPAND_COSTS[player.stashLevel];
}

// 扩建仓库
function expandStash() {
    const cost = getStashExpandCost();
    if (cost === null) {
        showNotification('仓库已达最大容量！');
        return;
    }
    if (player.gold < cost) {
        showNotification(`金币不足！需要 ${cost} G`);
        return;
    }

    player.gold -= cost;
    player.stashLevel++;

    // 扩展仓库数组
    const newSize = getStashSize();
    while (player.stash.length < newSize) {
        player.stash.push(null);
    }

    // 扣钱数字提示 + 声音（使用 DOM 元素，层级高于面板）
    createFloatingText(player.x, player.y - 40, `-${cost}G`, '#ffd700', 1.5);
    AudioSys.play('gold');

    showNotification(`仓库扩建成功！当前容量: ${newSize} 格`);
    renderStash();
    updateUI();

    // 同时更新物品面板的金币显示
    document.getElementById('gold-display').innerText = player.gold;
}

function renderStash() {
    const c = document.getElementById('stash-grid');
    c.innerHTML = '';

    const stashSize = getStashSize();
    const cols = 6 + (player.stashLevel || 0); // 基础6列，每级+1列

    // 更新面板宽度（小屏幕让CSS控制，大屏幕用JS计算）
    const panel = document.getElementById('stash-panel');
    if (window.innerWidth >= 768) {
        const stashWidth = cols * 50 + 40;
        const embeddedBagWidth = 6 * 40 + 40; // 6列内嵌背包
        panel.style.width = Math.max(stashWidth, embeddedBagWidth) + 'px';
    }

    // 更新grid列数
    c.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    // 确保stash数组足够大
    while (player.stash.length < stashSize) {
        player.stash.push(null);
    }

    // 更新容量显示
    const sizeInfo = document.getElementById('stash-size-info');
    if (sizeInfo) {
        const usedSlots = player.stash.filter(i => i !== null).length;
        sizeInfo.textContent = `(${usedSlots}/${stashSize})`;
    }

    // 更新扩建按钮
    const expandBtn = document.getElementById('stash-expand-btn');
    if (expandBtn) {
        const cost = getStashExpandCost();
        if (cost === null) {
            expandBtn.style.display = 'none';
        } else {
            expandBtn.style.display = 'block';
            const canAfford = player.gold >= cost;
            expandBtn.innerHTML = `🔨 扩建 +${STASH_EXPAND_PER_LEVEL}格 <span style="color:${canAfford ? '#ffd700' : '#f66'}">${cost} G</span>`;
            expandBtn.className = 'stash-expand-btn' + (canAfford ? '' : ' disabled');
        }
    }

    for (let idx = 0; idx < stashSize; idx++) {
        const item = player.stash[idx];
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
            bindItemTooltip(slot, item);
            slot.onmousedown = (e) => e.stopPropagation();
        }

        c.appendChild(slot);
    }

    // 渲染内嵌背包
    renderEmbeddedBag('stash');
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
    hideTooltip();
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
    hideTooltip();
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
        trackAchievement('kill_specific_boss', { name: monster.name.replace('地狱', '') });
    }

    const x = monster.x;
    const y = monster.y;
    const f = player.isInHell ? player.hellFloor : player.floor;
    const isBoss = monster.isBoss || monster.isQuestTarget;
    const isElite = monster.rarity > 0;

    // 成就追踪：击杀精英
    if (isElite && !isBoss) {
        trackAchievement('kill_elite', { isElite: true });
    }

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

    // 双倍金币buff
    if (player.goldBuffExpiry && Date.now() < player.goldBuffExpiry) {
        goldAmount *= 2;
    }

    groundItems.push({
        type: 'gold', val: Math.floor(goldAmount),
        x: x, y: y, z: 0,
        vx: (Math.random() - 0.5) * 150,
        vy: (Math.random() - 0.5) * 150,
        vz: 150 + Math.random() * 100,
        bounces: 2,
        soundLand: 'land_gold',
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
            x: x, y: y, z: 0,
            vx: (Math.random() - 0.5) * 100,
            vy: (Math.random() - 0.5) * 100,
            vz: 120 + Math.random() * 80,
            bounces: 2,
            soundLand: dropItem.type === 'potion' || dropItem.type === 'scroll' ? 'land_soft' : 'land_hard',
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
    let treasureHunterBonus = (getTalentEffect('dropRatePct', 0) + (player.dropRatePct || 0)) / 100;

    // 双倍掉落buff
    if (player.dropBuffExpiry && Date.now() < player.dropBuffExpiry) {
        treasureHunterBonus += 1.0;  // 额外+100%掉落率
    }

    // BOSS掉落装备数量根据楼层递增：1-10层3件，11-20层4件，21层+5件
    let bossEquipmentCount = 3;
    if (f > 20) bossEquipmentCount = 5;
    else if (f > 10) bossEquipmentCount = 4;

    // 计算最终掉落参数
    let dropChance, dropCount, qualityBonus;

    if (isBoss) {
        dropChance = 1.0;
        dropCount = bossEquipmentCount;  // BOSS根据楼层掉落3-5件装备
        qualityBonus = 0.30 + floorQualityBonus;  // BOSS基础+30%品质
    } else if (isElite) {
        dropChance = 0.45 + floorDropBonus + luckBonus + treasureHunterBonus;  // 45%起步
        dropCount = 1;
        qualityBonus = 0.10 + floorQualityBonus + luckBonus;
    } else {
        dropChance = 0.25 + floorDropBonus + luckBonus + treasureHunterBonus;  // 25%起步
        dropCount = 1;
        qualityBonus = floorQualityBonus + luckBonus;
    }

    let droppedGoodItem = false;  // 是否掉落了好东西（蓝装以上）

    for (let i = 0; i < dropCount; i++) {
        if (Math.random() < dropChance) {
            let item = null;

            // ========== 套装掉落 ==========
            // 套装掉落概率：BOSS 8%, 精英 0.5%, 普通怪 0.1%（提升BOSS套装掉落）
            const setBaseChance = isBoss ? 0.08 : (isElite ? 0.005 : 0.001);
            const setFloorBonus = f >= 10 ? 0.01 : 0;  // 10层以上+1%
            const setLuckBonus = luckBonus * 0.05;     // 幸运值影响降到5%
            const setChance = setBaseChance + setFloorBonus + setLuckBonus;
            if (Math.random() < setChance) {
                item = generateRandomSetItem(f);
                if (item) {
                    droppedGoodItem = true;
                    // 全服公告：获得套装
                    if (typeof OnlineSystem !== 'undefined') {
                        OnlineSystem.announce('set_drop', item.displayName || item.name);
                    }
                }
            }

            // ========== 普通装备掉落 ==========
            if (!item) {
                item = createItem(null, f);

                // 品质重roll（应用所有加成）
                const qualityRoll = Math.random();
                const adjustedRoll = qualityRoll - qualityBonus;  // 加成越高，越容易出好东西

                if (isBoss) {
                    // BOSS保底蓝装，提高暗金概率（匹配加强后的难度）
                    if (adjustedRoll < 0.05) { item.rarity = 4; droppedGoodItem = true; }       // 5%+加成 暗金
                    else if (adjustedRoll < 0.35) { item.rarity = 3; droppedGoodItem = true; }  // 30%+加成 稀有
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

            // 物理掉落初速度
            const angle = (Math.PI * 2 / dropCount) * i + (Math.random() * 0.5 - 0.25);
            const speed = 80 + Math.random() * 60;

            item.x = x;
            item.y = y;
            item.z = 0;
            item.vx = Math.cos(angle) * speed;
            item.vy = Math.sin(angle) * speed;
            item.vz = (item.rarity >= 4 ? 200 : 150) + Math.random() * 50;
            item.bounces = 2;
            item.soundLand = 'land_hard';
            item.dropTime = Date.now();
            groundItems.push(item);

            // 暗金/套装掉落特效和成就追踪
            if (item.rarity === 4 || item.rarity === 5) {
                createDropBeam(item.x, item.y, item.rarity);
                // 成就追踪：收集暗金/套装
                if (item.rarity === 4) trackAchievement('collect_unique');
                if (item.rarity === 5) trackAchievement('collect_set_item');
            }
        }
    }

    // ========== BOSS额外掉落（金币堆+药水+回城卷轴） ==========
    if (isBoss) {
        // 金币堆数：3-5堆，每堆数量根据楼层递增
        const coinStacks = 3 + Math.floor(Math.random() * 3); // 3-5堆
        for (let i = 0; i < coinStacks; i++) {
            let goldAmount;
            if (f <= 10) goldAmount = 100 + Math.floor(Math.random() * 200); // 1-10层：100-300
            else if (f <= 20) goldAmount = 300 + Math.floor(Math.random() * 300); // 11-20层：300-600
            else goldAmount = 500 + Math.floor(Math.random() * 500); // 21层+：500-1000

            const angle = (Math.PI * 2 / coinStacks) * i + (Math.random() * 0.5 - 0.25);
            const speed = 60 + Math.random() * 40;

            groundItems.push({
                type: 'gold', val: Math.floor(goldAmount),
                x: x, y: y, z: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                vz: 120 + Math.random() * 80,
                bounces: 2,
                soundLand: 'land_gold',
                rarity: 0, name: Math.floor(goldAmount) + " 金币", icon: '💰', dropTime: Date.now()
            });
        }

        // 药水：红蓝各1-2瓶
        const healthPotionCount = 1 + Math.floor(Math.random() * 2); // 1-2瓶
        const manaPotionCount = 1 + Math.floor(Math.random() * 2); // 1-2瓶

        for (let i = 0; i < healthPotionCount; i++) {
            groundItems.push({
                type: 'potion', name: '治疗药剂', heal: 50, rarity: 0, stackable: true, count: 1,
                x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 60, z: 0,
                vx: (Math.random() - 0.5) * 80,
                vy: (Math.random() - 0.5) * 80,
                vz: 100 + Math.random() * 50,
                bounces: 2,
                soundLand: 'land_soft',
                dropTime: Date.now()
            });
        }

        for (let i = 0; i < manaPotionCount; i++) {
            groundItems.push({
                type: 'potion', name: '法力药剂', mana: 30, rarity: 0, stackable: true, count: 1,
                x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 60, z: 0,
                vx: (Math.random() - 0.5) * 80,
                vy: (Math.random() - 0.5) * 80,
                vz: 100 + Math.random() * 50,
                bounces: 2,
                soundLand: 'land_soft',
                dropTime: Date.now()
            });
        }

        // 回城卷轴：1-2个
        const scrollCount = 1 + Math.floor(Math.random() * 2); // 1-2个
        for (let i = 0; i < scrollCount; i++) {
            groundItems.push({
                type: 'scroll', name: '回城卷轴', rarity: 0, stackable: true, count: 1,
                x: x + (Math.random() - 0.5) * 80, y: y + (Math.random() - 0.5) * 80, z: 0,
                vx: (Math.random() - 0.5) * 100,
                vy: (Math.random() - 0.5) * 100,
                vz: 120 + Math.random() * 80,
                bounces: 2,
                soundLand: 'land_soft',
                dropTime: Date.now()
            });
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
    if (!cachedUI.worldLabels) return;
    cachedUI.worldLabels.innerHTML = '';
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
        cachedUI.worldLabels.appendChild(d);
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

function getDestructibleAtCursor() {
    const range = 25;
    if (!destructibles) return null;
    for (let d of destructibles) {
        if (!d.broken && Math.hypot(mouse.worldX - d.x, mouse.worldY - d.y) < range + 10) {
            return d;
        }
    }
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

    // 增加连击
    addCombo(1);

    let dmg = Math.floor(Math.random() * (player.damage[1] - player.damage[0] + 1)) + player.damage[0];

    // 使用实际暴击率（player.critChance 是百分比）
    let isCrit = Math.random() * 100 < player.critChance;
    if (isCrit) {
        // 暴击伤害加成
        const critMultiplier = 2 + (player.critDamage || 0) / 100;
        dmg = Math.floor(dmg * critMultiplier);

        // 已移除暴击慢动作，优化性能（原：0.1秒50%速度）

        // 已移除暴击震屏，优化性能

        // 大伤害数字（金色+大字体）
        damageNumbers.push({
            x: t.x,
            y: t.y - 25,
            val: `💥 ${dmg}!`,
            color: '#ffdd00',
            life: 1.5,
            fontSize: 28,
            vx: (Math.random() - 0.5) * 80,
            vy: -180,
            gravity: 200
        });

        // 暴击粒子爆发（金色+白色）
        for (let i = 0; i < 12; i++) {
            const angle = (Math.PI * 2 / 12) * i + Math.random() * 0.3;
            const speed = 120 + Math.random() * 100;
            const color = ['#ffdd00', '#ffffff', '#ffaa00', '#ff8800'][Math.floor(Math.random() * 4)];
            particles.push({
                x: t.x,
                y: t.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 50,
                color: color,
                life: 0.4 + Math.random() * 0.3,
                size: 3 + Math.random() * 3,
                gravity: 150
            });
        }

        // 暴击专属音效
        AudioSys.play('quest');  // 借用任务完成音效，比较响亮
    }
    // 已移除普通攻击震屏，优化性能

    // 构建伤害对象（包含物理和元素伤害）
    const damageObj = {
        physical: dmg,
        fire: player.elementalDamage.fire,
        lightning: player.elementalDamage.lightning,
        poison: player.elementalDamage.poison
    };

    takeDamage(t, damageObj, false, isCrit);  // 传递isCrit参数
    AudioSys.play('attack');
    createSlashEffect(player.x, player.y, t.x, t.y, dmg, isCrit);  // 传递isCrit给斩击效果
    player.attackAnim = 1;

    if (player.lifeSteal > 0) {
        let h = Math.ceil(dmg * player.lifeSteal / 100);
        if (h > 0) {
            player.hp = Math.min(player.maxHp, player.hp + h);
            createDamageNumber(player.x, player.y - 40, "+" + h, COLORS.green);
        }
    }
    // 暴击时更多粒子
    const particleCount = isCrit ? 8 : 1;
    for (let i = 0; i < particleCount; i++) {
        createParticle(t.x + (Math.random() - 0.5) * 20, t.y + (Math.random() - 0.5) * 20, isCrit ? '#ffdd00' : '#fff', isCrit ? 4 : 5);
    }
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
            if (cachedUI.mpOrb) GSAPAnims.shake(cachedUI.mpOrb, 5);
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
        // 每日任务和成就：使用技能
        if (typeof DailyQuestSystem !== 'undefined') {
            DailyQuestSystem.updateProgress('use_skill', 1);
        }
        trackAchievement('skill_use');
    } else if (skillName === 'thunder') {
        const cost = 8 + (player.skills.thunder - 1) * 0.5;
        if (player.mp < cost) {
            createFloatingText(player.x, player.y - 60, "法力不足!", '#55aaff');
            if (cachedUI.mpOrb) GSAPAnims.shake(cachedUI.mpOrb, 5);
            return;
        }
        if (player.skillCooldowns.thunder > 0) return;

        // 获取鼠标指向的敌人或物体
        const target = getEnemyAtCursor() || getDestructibleAtCursor();
        if (!target) {
            return;
        }

        // 检查射程 (缩小为 200 像素)
        if (Math.hypot(target.x - player.x, target.y - player.y) > 200) {
            createFloatingText(player.x, player.y - 60, "目标太远!", '#ff5555');
            return;
        }

        player.mp -= cost;
        player.skillCooldowns.thunder = 2; // 2秒冷却

        // 如果击中可破坏物体
        if (target.broken !== undefined) {
            DestructibleSystem.break(target);
            createLightningEffect(target.x, target.y);
            AudioSys.play('thunder');
            if (typeof DailyQuestSystem !== 'undefined') DailyQuestSystem.updateProgress('use_skill', 1);
            return;
        }

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
        // 每日任务和成就：使用技能
        if (typeof DailyQuestSystem !== 'undefined') {
            DailyQuestSystem.updateProgress('use_skill', 1);
        }
        trackAchievement('skill_use');

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
            if (cachedUI.mpOrb) GSAPAnims.shake(cachedUI.mpOrb, 5);
            return;
        }
        if (player.skillCooldowns.multishot > 0) return;
        player.mp -= 8; player.skillCooldowns.multishot = 1;
        // 每日任务和成就：使用技能
        if (typeof DailyQuestSystem !== 'undefined') {
            DailyQuestSystem.updateProgress('use_skill', 1);
        }
        trackAchievement('skill_use');
        const base = Math.atan2(mouse.worldY - player.y, mouse.worldX - player.x);
        const cnt = 2 + player.skills.multishot;

        // 发射特效：光芒扩散
        for (let i = 0; i < 12; i++) {
            const angle = base + (Math.random() - 0.5) * 0.8;
            const speed = 100 + Math.random() * 100;
            particles.push({
                x: player.x,
                y: player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: ['#ffff00', '#aaff00', '#88ff44'][Math.floor(Math.random() * 3)],
                life: 0.2 + Math.random() * 0.15,
                size: 2 + Math.random() * 2,
                gravity: 0
            });
        }

        for (let i = 0; i < cnt; i++) {
            const a = base - 0.3 + (0.6 / (cnt - 1)) * i;
            projectiles.push({
                x: player.x, y: player.y, angle: a, speed: 500, life: 1,
                damage: player.damage[0] * 0.8, color: '#aaff00', owner: player,
                type: 'multishot'  // 标记类型用于拖尾粒子
            });
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
            bindItemTooltip(s, i);
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
            bindItemTooltip(el, i);
            el.onmousedown = (e) => e.stopPropagation();
        } else { el.onmouseenter = null; el.onmouseleave = null; el.ontouchstart = null; }
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
            bindItemTooltip(el, i);
            el.onmousedown = (e) => e.stopPropagation();
        } else { el.onmouseenter = null; el.onmouseleave = null; el.ontouchstart = null; }
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
        // 每日任务：使用药水
        if (typeof DailyQuestSystem !== 'undefined') {
            DailyQuestSystem.updateProgress('use_potion', 1);
        }

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
            // 启动回城仪式
            portalRitual.active = true;
            portalRitual.phase = 0;
            portalRitual.timer = PORTAL_RITUAL_DURATIONS.casting;
            portalRitual.returnFloor = player.floor;
            portalRitual.scrollIdx = idx;
            portalRitual.flashAlpha = 0;

            // 消耗卷轴
            if (item.quantity > 1) item.quantity--; else player.inventory[idx] = null;

            // 立刻触发光柱效果和音效（不等施法完成）
            createPortalBeam(player.x, player.y);
            AudioSys.playPortalOpen();
            triggerScreenShake(4, 0.2);

            showNotification("正在施法回城...");
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
        return player.inventory.filter(i => i && i.name === name).reduce((sum, i) => sum + (i.quantity || 1), 0);
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
    else if (type === 'xp_scroll') {
        // 双倍经验卷轴：直接使用，不进背包
        cost = 1000;
        if (player.gold < cost) {
            showNotification("金币不足");
            return false;
        }
        player.gold -= cost;
        const duration = 1 * 60 * 60 * 1000; // 1小时
        const now = Date.now();
        if (player.xpBuffExpiry && now < player.xpBuffExpiry) {
            // 已有buff，延长时间
            player.xpBuffExpiry += duration;
            showNotification('⚡ 双倍经验延长1小时！');
        } else {
            // 无buff，新增
            player.xpBuffExpiry = now + duration;
            showNotification('⚡ 双倍经验已激活！持续1小时');
        }
        createDamageNumber(player.x, player.y - 40, `-${cost}G`, 'gold');
        AudioSys.play('gold');
        updateBuffIndicators();
        renderInventory();
        renderEmbeddedBag('shop');
        return true;
    }

    if (player.gold >= cost) {
        const item = createItem(itemName, 0);
        if (addItemToInventory(item)) {
            player.gold -= cost;
            createDamageNumber(player.x, player.y - 40, `-${cost}G`, 'gold');
            showNotification(`花费 ${cost} G - 购买 ${itemName}`);
            renderInventory();
            renderEmbeddedBag('shop');
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
        // 鼠标事件（桌面端）
        slot.addEventListener('mousedown', (e) => {
            e.preventDefault();
            startBuyHold(type, e);
        });
        slot.addEventListener('mouseup', stopBuyHold);
        slot.addEventListener('mouseleave', stopBuyHold);

        // 触摸事件（移动端）
        slot.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startBuyHold(type, e);
        }, { passive: false });
        slot.addEventListener('touchend', stopBuyHold);
        slot.addEventListener('touchcancel', stopBuyHold);
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
    // 基础 UI 现在由 updateSmoothUI 每帧或节流平稳渲染，此处仅作为触发脏检查或处理极低频逻辑
    uiDisplayState.dirty = true;
}

// 更新增益buff指示器（追加到天赋HUD区域）
let lastBuffState = ''; // 用于检测buff状态是否变化
function updateBuffIndicators() {
    if (!cachedUI.talentHud) return;

    const now = Date.now();

    // 构建当前buff状态字符串（用于检测变化）
    const currentState = [
        player.xpBuffTripleExpiry > now ? 'triple' : '',
        player.xpBuffExpiry > now ? 'xp' : '',
        player.goldBuffExpiry > now ? 'gold' : '',
        player.dropBuffExpiry > now ? 'drop' : ''
    ].join(',');

    // 只在buff状态变化时才重建图标
    const existingIcons = cachedUI.talentHud.getElementsByClassName('buff-hud-icon');
    if (existingIcons.length > 0 && currentState === lastBuffState) {
        const timeSpans = cachedUI.talentHud.getElementsByClassName('buff-time-text');
        let spanIdx = 0;

        // 再次获取最新的时间数据用于更新文字
        const updatedBuffs = [];
        if (player.xpBuffTripleExpiry && now < player.xpBuffTripleExpiry) {
            updatedBuffs.push(formatBuffTime(Math.ceil((player.xpBuffTripleExpiry - now) / 1000 / 60)).short);
        } else if (player.xpBuffExpiry && now < player.xpBuffExpiry) {
            updatedBuffs.push(formatBuffTime(Math.ceil((player.xpBuffExpiry - now) / 1000 / 60)).short);
        }
        if (player.goldBuffExpiry && now < player.goldBuffExpiry) {
            updatedBuffs.push(formatBuffTime(Math.ceil((player.goldBuffExpiry - now) / 1000 / 60)).short);
        }
        if (player.dropBuffExpiry && now < player.dropBuffExpiry) {
            updatedBuffs.push(formatBuffTime(Math.ceil((player.dropBuffExpiry - now) / 1000 / 60)).short);
        }

        updatedBuffs.forEach((timeStr, i) => {
            if (timeSpans[i]) timeSpans[i].textContent = timeStr;
        });
        return;
    }
    lastBuffState = currentState;

    // 移除之前的buff图标
    Array.from(existingIcons).forEach(el => el.remove());

    const buffs = [];

    // 检查各种buff
    if (player.xpBuffTripleExpiry && now < player.xpBuffTripleExpiry) {
        const remaining = Math.ceil((player.xpBuffTripleExpiry - now) / 1000 / 60);
        const time = formatBuffTime(remaining);
        buffs.push({ icon: '🔥', name: '三倍经验', timeShort: time.short, timeFull: time.full, color: '#ff6600' });
    } else if (player.xpBuffExpiry && now < player.xpBuffExpiry) {
        const remaining = Math.ceil((player.xpBuffExpiry - now) / 1000 / 60);
        const time = formatBuffTime(remaining);
        buffs.push({ icon: '⚡', name: '双倍经验', timeShort: time.short, timeFull: time.full, color: '#ffff00' });
    }

    if (player.goldBuffExpiry && now < player.goldBuffExpiry) {
        const remaining = Math.ceil((player.goldBuffExpiry - now) / 1000 / 60);
        const time = formatBuffTime(remaining);
        buffs.push({ icon: '💰', name: '双倍金币', timeShort: time.short, timeFull: time.full, color: '#ffd700' });
    }

    if (player.dropBuffExpiry && now < player.dropBuffExpiry) {
        const remaining = Math.ceil((player.dropBuffExpiry - now) / 1000 / 60);
        const time = formatBuffTime(remaining);
        buffs.push({ icon: '🎁', name: '双倍掉落', timeShort: time.short, timeFull: time.full, color: '#88ff88' });
    }

    // 追加buff图标到天赋HUD
    buffs.forEach(b => {
        const icon = document.createElement('div');
        icon.className = 'buff-hud-icon';
        icon.style.cssText = `
            box-sizing: border-box;
            width: 32px;
            height: 32px;
            background: rgba(20, 20, 25, 0.9);
            border: 2px solid ${b.color};
            border-radius: 5px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            cursor: default;
            position: relative;
        `;
        icon.innerHTML = `${b.icon}<span class="buff-time-text" style="font-size:7px; color:${b.color}; position:absolute; bottom:0px; white-space:nowrap;">${b.timeShort}</span>`;

        // 鼠标悬停显示详细信息
        icon.addEventListener('mouseenter', (e) => {
            if (cachedUI.tooltip) {
                cachedUI.tooltip.innerHTML = `<div style="color:${b.color}; font-weight:bold; margin-bottom:4px;">${b.icon} ${b.name}</div>
                    <div style="color:#aaa;">剩余时间: ${b.timeFull}</div>`;
                cachedUI.tooltip.style.display = 'block';
                cachedUI.tooltip.style.left = (e.clientX + 10) + 'px';
                cachedUI.tooltip.style.top = (e.clientY + 10) + 'px';
            }
        });
        icon.addEventListener('mouseleave', () => {
            if (cachedUI.tooltip) cachedUI.tooltip.style.display = 'none';
        });
        icon.addEventListener('mousemove', (e) => {
            if (cachedUI.tooltip) {
                cachedUI.tooltip.style.left = (e.clientX + 10) + 'px';
                cachedUI.tooltip.style.top = (e.clientY + 10) + 'px';
            }
        });
        // 阻止点击穿透到游戏画布
        icon.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        cachedUI.talentHud.appendChild(icon);
    });
}

// 格式化buff剩余时间（短格式用于图标，长格式用于tooltip）
function formatBuffTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    // 短格式（图标显示）
    let short;
    if (hours > 0) {
        short = mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
    } else {
        short = `${mins}m`;
    }

    // 长格式（tooltip显示）
    let full;
    if (hours > 0) {
        full = mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
    } else {
        full = `${mins}分钟`;
    }

    return { short, full };
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
        const sweepEl = cachedUI.cdSweeps[skill];
        const timeEl = cachedUI.cdTimes[skill];

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

    // 禁用未学习的技能
    const skills = ['fireball', 'thunder', 'multishot'];
    const qKeys = ['Q', 'W', 'E'];

    skills.forEach((skill, index) => {
        const skillBtn = document.getElementById(`skill-${skill}`);
        if (skillBtn) {
            if (player.skills[skill] === 0) {
                // 未学习的技能
                skillBtn.classList.add('disabled');
                skillBtn.title = `按 ${qKeys[index]} 学习此技能`;
            } else {
                // 已学习的技能
                skillBtn.classList.remove('disabled');
                skillBtn.title = '';
            }
        }
    });
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

        // 全服公告：等级里程碑（10/20/30...）
        if (player.lvl % 10 === 0 && typeof OnlineSystem !== 'undefined') {
            OnlineSystem.announce('level_milestone', String(player.lvl));
        }

        player.xp -= player.xpNext;
        player.xpNext = Math.floor(player.xpNext * 1.38);
        player.points += 5;
        player.skillPoints += 1;
        player.maxHp += 10;
        player.maxMp += 5;
        player.hp = player.maxHp;
        player.mp = player.maxMp;

        // 触发华丽升级特效
        triggerLevelUpEffect(player.lvl);

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
                maxFloor: player.isInHell ? (player.maxHellFloor || player.hellFloor) + 10 : player.maxFloor,
                isHell: player.isInHell,
                gold: player.gold || 0
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
        // 使用 GSAP 播放弹入动画
        GSAPAnims.panelIn(panelElement, 'bottom');

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
            'shop': () => renderEmbeddedBag('shop'),
            'stash': renderStash,
            'blacksmith': () => { renderBlacksmithPanel(); renderEmbeddedBag('blacksmith'); }
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
function selectSkill(k) {
    // 检查技能是否已学习
    if (player.skills[k] === 0) {
        showNotification(`技能还未学习！打开技能面板(T)升级`);
        return;
    }
    player.activeSkill = k;
    updateUI();
}

function addStat(t) {
    if (player.points > 0) {
        player[t]++;
        player.points--;
        AudioSys.play('click');  // 加点音效
        updateStats();
        updateStatsUI();
        updateMenuIndicators();
    }
}
function upgradeSkill(t) {
    if (player.skillPoints > 0) {
        player.skills[t]++;
        player.skillPoints--;
        AudioSys.play('click');  // 加点音效
        updateSkillsUI();
        updateMenuIndicators();
    }
}


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

// ========== 物品详情 Tooltip 系统 ==========
// 长按检测配置
const LONG_PRESS_DURATION = 400; // 400ms 触发长按
let longPressTimer = null;
let tooltipLocked = false;  // tooltip 是否被锁定（手机长按后锁定，需要手动关闭）

// 属性key到标签的映射
function getStatLabel(k) {
    const map = {
        str: "力量", dex: "敏捷", vit: "体力", ene: "能量", def: "防御",
        maxHp: "生命", maxMp: "法力", hp: "生命", mp: "法力",
        lifeSteal: "吸血%", attackSpeed: "攻速%", critChance: "暴击%", critDamage: "暴伤%",
        dmgPct: "伤害%", allSkills: "技能",
        fireRes: "火抗", coldRes: "冰抗", lightningRes: "电抗", poisonRes: "毒抗", allRes: "全抗",
        fireDmg: "火伤", coldDmg: "冰伤", lightningDmg: "电伤", poisonDmg: "毒伤",
        hpRegen: "生命/秒", mpRegen: "法力%", blockChance: "格挡%",
        reflectDamage: "反伤%", damageReduction: "减伤%",
        armorPierce: "穿透%", knockback: "击退%", slow: "减速%",
        doubleHit: "连击%", attackRating: "命中", magicFind: "MF%"
    };
    return map[k] || k;
}

// 生成单个物品的属性 HTML（用于对比视图的单列）
function generateItemStatsHTML(item) {
    let lines = [];

    if (item.minDmg) {
        const avg = Math.floor((item.minDmg + item.maxDmg) / 2);
        lines.push({ label: '伤害', value: avg, display: `${item.minDmg}-${item.maxDmg}` });
    }
    if (item.def) {
        lines.push({ label: '防御', value: item.def, display: `+${item.def}` });
    }
    if (item.stats) {
        for (let [k, v] of Object.entries(item.stats)) {
            lines.push({ label: getStatLabel(k), value: v, display: `+${v}`, key: k });
        }
    }
    return lines;
}

// 生成 tooltip 内容（统一的内容生成函数，支持装备对比）
function generateTooltipHTML(item, showCloseBtn = false) {
    // 查找身上对应部位的装备
    let slot = null;
    if (item.type === 'weapon') slot = 'mainhand';
    else if (item.type === 'armor') slot = 'body';
    else if (item.type === 'ring') slot = 'ring';
    else if (item.type === 'helm') slot = 'helm';
    else if (item.type === 'gloves') slot = 'gloves';
    else if (item.type === 'boots') slot = 'boots';
    else if (item.type === 'belt') slot = 'belt';
    else if (item.type === 'amulet') slot = 'amulet';

    const equipped = slot ? player.equipment[slot] : null;
    const isComparing = equipped && item !== equipped;

    let html = '';

    // 关闭按钮（手机端用）
    if (showCloseBtn) {
        html += `<div class="tooltip-close" onclick="hideTooltip()">×</div>`;
    }

    // ========== 对比模式：两列并排 ==========
    if (isComparing) {
        html += `<div class="tooltip-compare">`;

        // 左列：查看中的物品
        html += `<div class="tooltip-col tooltip-col-left">`;
        html += `<div class="tooltip-col-header">查看中</div>`;
        html += `<div class="tooltip-title" style="color:${getItemColor(item.rarity)}">${item.displayName || item.name}</div>`;
        if (item.setId && SET_ITEMS[item.setId]) {
            html += `<div style="color:${COLORS.setGreen}; font-size:10px;">${SET_ITEMS[item.setId].name}</div>`;
        }

        const itemStats = generateItemStatsHTML(item);
        const equippedStats = generateItemStatsHTML(equipped);

        // 合并所有属性标签
        const allLabels = new Set();
        itemStats.forEach(s => allLabels.add(s.label));
        equippedStats.forEach(s => allLabels.add(s.label));

        // 左列属性（带差值显示）
        for (let label of allLabels) {
            const stat = itemStats.find(s => s.label === label);
            const eqStat = equippedStats.find(s => s.label === label);
            if (stat) {
                let diffClass = '';
                let diffText = '';
                if (eqStat) {
                    const diff = stat.value - eqStat.value;
                    if (diff > 0) {
                        diffClass = 'stat-better';
                        diffText = ` <span class="stat-diff">(+${diff})</span>`;
                    } else if (diff < 0) {
                        diffClass = 'stat-worse';
                        diffText = ` <span class="stat-diff">(${diff})</span>`;
                    }
                } else {
                    diffClass = 'stat-better';  // 对方没有，我有，更好
                    diffText = ` <span class="stat-diff">(+${stat.value})</span>`;
                }
                html += `<div class="tooltip-stat ${diffClass}">${stat.display} ${label}${diffText}</div>`;
            } else {
                // 我没有，对方有
                const eqVal = eqStat ? eqStat.value : 0;
                html += `<div class="tooltip-stat stat-worse">- ${label} <span class="stat-diff">(-${eqVal})</span></div>`;
            }
        }
        html += `</div>`;

        // 右列：已装备的物品
        html += `<div class="tooltip-col tooltip-col-right">`;
        html += `<div class="tooltip-col-header">已装备</div>`;
        html += `<div class="tooltip-title" style="color:${getItemColor(equipped.rarity)}">${equipped.displayName || equipped.name}</div>`;
        if (equipped.setId && SET_ITEMS[equipped.setId]) {
            html += `<div style="color:${COLORS.setGreen}; font-size:10px;">${SET_ITEMS[equipped.setId].name}</div>`;
        }

        // 右列属性
        for (let label of allLabels) {
            const stat = itemStats.find(s => s.label === label);
            const eqStat = equippedStats.find(s => s.label === label);
            if (eqStat) {
                html += `<div class="tooltip-stat">${eqStat.display} ${label}</div>`;
            } else {
                html += `<div class="tooltip-stat stat-missing">- ${label}</div>`;
            }
        }
        html += `</div>`;

        html += `</div>`;  // .tooltip-compare

        // 装备需求（放在对比区域下方）
        if (item.requirements) {
            const req = item.requirements;
            html += `<div class="tooltip-req">`;
            if (req.level) {
                const ok = player.lvl >= req.level;
                html += `<span style="color:${ok ? '#888' : '#f44'}">Lv${req.level}</span> `;
            }
            if (req.str) {
                const ok = player.str >= req.str;
                html += `<span style="color:${ok ? '#888' : '#f44'}">力${req.str}</span> `;
            }
            if (req.dex) {
                const ok = player.dex >= req.dex;
                html += `<span style="color:${ok ? '#888' : '#f44'}">敏${req.dex}</span>`;
            }
            html += `</div>`;
        }

    } else {
        // ========== 普通模式：单列显示 ==========
        html += `<div class="tooltip-title" style="color:${getItemColor(item.rarity)}">${item.displayName || item.name}</div>`;
        html += `<div class="tooltip-type">${item.type.toUpperCase()}</div>`;

        if (item.setId && SET_ITEMS[item.setId]) {
            html += `<div style="color:${COLORS.setGreen}; font-size:12px; margin-top:3px;">${SET_ITEMS[item.setId].name}</div>`;
        }

        if (item.quantity > 1) html += `<div class="tooltip-stat">数量: ${item.quantity}</div>`;
        if (item.minDmg) html += `<div class="tooltip-stat">伤害: ${item.minDmg}-${item.maxDmg}</div>`;
        if (item.def) html += `<div class="tooltip-stat">防御: +${item.def}</div>`;
        if (item.heal) html += `<div class="tooltip-stat" style="color:#d00">恢复: ${item.heal}</div>`;

        if (item.stats) {
            for (let [k, v] of Object.entries(item.stats)) {
                html += `<div class="tooltip-stat" style="color:#4850b8">+${v} ${getStatLabel(k)}</div>`;
            }
        }

        // 套装加成
        if (item.setId && SET_ITEMS[item.setId]) {
            const setData = SET_ITEMS[item.setId];
            const equippedCount = player.equippedSets[item.setId] || 0;
            const totalPieces = Object.keys(setData.pieces).length;

            html += `<div style="margin-top:8px; border-top:1px solid #20ff20; padding-top:5px;">`;
            html += `<div style="color:${COLORS.setGreen}; font-size:11px; margin-bottom:5px;">套装 (${equippedCount}/${totalPieces}):</div>`;
            for (let req in setData.bonuses) {
                const active = equippedCount >= parseInt(req);
                html += `<div style="color:${active ? COLORS.setGreen : '#666'}; font-size:11px;">(${req}) ${setData.bonuses[req].desc}</div>`;
            }
            html += `</div>`;
        }

        // 装备需求
        if (item.requirements) {
            const req = item.requirements;
            html += `<div style="margin-top:5px; border-top:1px solid #444; padding-top:5px; color:#888; font-size:11px;">`;
            if (req.level) {
                const ok = player.lvl >= req.level;
                html += `<span style="color:${ok ? '#888' : '#f44'}">等级${req.level}</span> `;
            }
            if (req.str) {
                const ok = player.str >= req.str;
                html += `<span style="color:${ok ? '#888' : '#f44'}">力量${req.str}</span> `;
            }
            if (req.dex) {
                const ok = player.dex >= req.dex;
                html += `<span style="color:${ok ? '#888' : '#f44'}">敏捷${req.dex}</span>`;
            }
            html += `</div>`;
        }
    }

    return html;
}

// 显示 tooltip（电脑端 hover 用，跟随鼠标）
function showTooltip(item, e) {
    if (tooltipLocked || !cachedUI.tooltip) return;  // 如果被锁定（手机长按中），不响应 hover

    const tt = cachedUI.tooltip;
    tt.style.display = 'block';
    tt.style.transform = 'none';  // 重置 transform

    // 边缘检测防止溢出屏幕
    let left = e.clientX + 15;
    let top = e.clientY + 15;
    if (left + 250 > window.innerWidth) left = e.clientX - 265;
    if (top + 200 > window.innerHeight) top = e.clientY - 200;

    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
    tt.innerHTML = generateTooltipHTML(item, false);
}

// 显示 tooltip（手机端长按用，居中显示）
function showTooltipAtCenter(item) {
    if (!cachedUI.tooltip) return;
    const tt = cachedUI.tooltip;
    tt.style.display = 'block';
    tt.style.left = '50%';
    tt.style.top = '35%';
    tt.style.transform = 'translate(-50%, -50%)';
    tt.classList.add('locked');  // 允许点击关闭按钮
    tt.innerHTML = generateTooltipHTML(item, true);
    tooltipLocked = true;
}

// 隐藏 tooltip
function hideTooltip() {
    if (!cachedUI.tooltip) return;
    const tt = cachedUI.tooltip;
    tt.style.display = 'none';
    tt.style.transform = 'none';
    tt.classList.remove('locked');
    tooltipLocked = false;
    clearTimeout(longPressTimer);
}

// 绑定物品 tooltip 事件（统一绑定函数，同时支持电脑 hover 和手机长按）
function bindItemTooltip(element, item) {
    // 电脑端：hover
    element.onmouseenter = (e) => showTooltip(item, e);
    element.onmouseleave = () => { if (!tooltipLocked) hideTooltip(); };

    // 手机端：长按
    element.ontouchstart = (e) => {
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
            e.preventDefault();
            showTooltipAtCenter(item);
        }, LONG_PRESS_DURATION);
    };
    element.ontouchend = element.ontouchcancel = () => {
        clearTimeout(longPressTimer);
    };
    element.ontouchmove = () => {
        clearTimeout(longPressTimer);  // 移动时取消长按
    };
}

// 点击其他区域关闭 tooltip（手机端用）
document.addEventListener('touchstart', (e) => {
    if (tooltipLocked && !e.target.closest('#tooltip')) {
        hideTooltip();
    }
}, { passive: true });

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

// ============= 移动端触摸事件映射 =============
const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ('ontouchstart' in window);

// 触摸状态管理
const touchState = {
    activeTouchId: null,      // 当前活动的触摸ID
    startX: 0,                // 触摸起始X
    startY: 0,                // 触摸起始Y
    startTime: 0,             // 触摸起始时间
    isTap: false,             // 是否为点击（非滑动）
    isLongPress: false,       // 是否为长按
    longPressTimer: null,     // 长按检测定时器
    lastTapTime: 0,           // 上次点击时间（用于双击检测）
    TAP_THRESHOLD: 10,        // 位移阈值：小于此值认为是点击
    LONG_PRESS_DELAY: 500     // 长按触发时间（毫秒）
};

// 获取canvas相对于视口的位置
function getTouchPosition(touch) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: touch.clientX,
        y: touch.clientY,
        // 相对于canvas的位置（如果需要）
        canvasX: touch.clientX - rect.left,
        canvasY: touch.clientY - rect.top
    };
}

// 触摸开始
function handleTouchStart(e) {
    // 检查是否点击在UI元素上
    if (e.target !== canvas && !e.target.closest('#gameCanvas')) {
        return; // 允许UI元素正常处理触摸
    }

    e.preventDefault();

    const touch = e.changedTouches[0];
    const pos = getTouchPosition(touch);

    touchState.activeTouchId = touch.identifier;
    touchState.startX = pos.x;
    touchState.startY = pos.y;
    touchState.startTime = Date.now();
    touchState.isTap = true;
    touchState.isLongPress = false;

    // 更新鼠标位置（触摸映射）
    mouse.x = pos.x;
    mouse.y = pos.y;
    mouse.leftDown = true;
    mouse.leftClick = true;

    // 尝试启动BGM
    AudioSys.tryAutoStartBGM();

    // 设置长按检测
    clearTimeout(touchState.longPressTimer);
    touchState.longPressTimer = setTimeout(() => {
        if (touchState.isTap && touchState.activeTouchId !== null) {
            touchState.isLongPress = true;
            // 长按行为：释放当前技能（模拟右键）
            castSkill(player.activeSkill);
            advanceTutorial(6);
        }
    }, touchState.LONG_PRESS_DELAY);
}

// 触摸移动
function handleTouchMove(e) {
    if (touchState.activeTouchId === null) return;

    e.preventDefault();

    // 找到匹配的触摸点
    let touch = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchState.activeTouchId) {
            touch = e.changedTouches[i];
            break;
        }
    }
    if (!touch) return;

    const pos = getTouchPosition(touch);

    // 检查移动距离，判断是否仍为点击
    const dx = pos.x - touchState.startX;
    const dy = pos.y - touchState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > touchState.TAP_THRESHOLD) {
        touchState.isTap = false;
        clearTimeout(touchState.longPressTimer);
    }

    // 更新鼠标位置
    mouse.x = pos.x;
    mouse.y = pos.y;
}

// 触摸结束
function handleTouchEnd(e) {
    e.preventDefault();

    // 找到匹配的触摸点
    let touch = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === touchState.activeTouchId) {
            touch = e.changedTouches[i];
            break;
        }
    }

    clearTimeout(touchState.longPressTimer);

    if (touch) {
        const pos = getTouchPosition(touch);
        mouse.x = pos.x;
        mouse.y = pos.y;

        // 双击检测（用于技能释放）
        const now = Date.now();
        if (touchState.isTap && now - touchState.lastTapTime < 300) {
            // 双击：释放技能
            castSkill(player.activeSkill);
            advanceTutorial(6);
        }
        touchState.lastTapTime = now;
    }

    // 重置状态
    mouse.leftDown = false;
    mouse.leftClick = false;
    touchState.activeTouchId = null;
}

// 触摸取消
function handleTouchCancel(e) {
    clearTimeout(touchState.longPressTimer);
    mouse.leftDown = false;
    mouse.leftClick = false;
    touchState.activeTouchId = null;
}

// 绑定触摸事件到canvas
if (isMobileDevice) {
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: false });

    // 移动端样式优化
    document.body.style.touchAction = 'none';  // 禁用默认手势
    document.body.style.userSelect = 'none';   // 禁用文本选择
    document.body.style.webkitUserSelect = 'none';
    document.body.style.webkitTouchCallout = 'none';

    console.log('📱 移动端触摸控制已启用');
}

window.addEventListener('keydown', e => {
    // 任何键盘交互时尝试自动启动BGM
    AudioSys.tryAutoStartBGM();

    // 聊天输入框聚焦时，禁用游戏快捷键
    if (window.chatInputFocused) return;

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
        handleInteraction();
    }
});

// 检测鼠标是否点击在交互目标（出口/入口/传送门）上
function isClickOnInteraction() {
    const clickRange = 25; // 点击判定范围
    // 检测出口
    if (Math.hypot(mouse.worldX - dungeonExit.x, mouse.worldY - dungeonExit.y) < clickRange) return true;
    // 检测入口
    if (Math.hypot(mouse.worldX - dungeonEntrance.x, mouse.worldY - dungeonEntrance.y) < clickRange) return true;
    // 检测传送门（使用显示位置）
    if (townPortal && townPortal.activeFloor === player.floor) {
        const portalPos = getPortalDisplayPosition();
        if (portalPos && Math.hypot(mouse.worldX - portalPos.x, mouse.worldY - portalPos.y) < clickRange) return true;
    }
    return false;
}

// 处理交互（进入出口/入口/传送门）
function handleInteraction() {
    if (!interactionTarget) return false;
    if (interactionTarget.type === 'next') {
        const isInHell = player.isInHell || false;
        if (isInHell) {
            if (player.hellFloor < 10) {
                showTalentShop(player.hellFloor + 1, true);
            }
        } else {
            showTalentShop(player.floor + 1, false);
        }
    }
    else if (interactionTarget.type === 'prev') {
        const isInHell = player.isInHell || false;
        if (isInHell) {
            if (player.hellFloor === 1) {
                exitHell();
            } else {
                enterFloor(player.hellFloor - 1, 'end');
            }
        } else {
            enterFloor(player.floor - 1, 'end');
        }
    }
    else if (interactionTarget.type === 'portal') {
        if (player.floor === 0) {
            if (townPortal) {
                const safeDungeonPos = validateAndFixDungeonPortalPosition(townPortal.x, townPortal.y);
                townPortal.x = safeDungeonPos.x;
                townPortal.y = safeDungeonPos.y;
            }
            if (player.maxFloor > 2) {
                // 有多个选项时显示选择界面
                showPortalFloorChoice(player.lastFloor || player.maxFloor, player.maxFloor);
            } else if (player.maxFloor === 2) {
                // 只有第2层可选，直接进入
                enterFloor(2, 'portal');
            } else {
                // maxFloor <= 1，直接进入1层
                enterFloor(1, 'portal');
            }
        }
        else enterFloor(0, 'portal');
    }
    return true;
}

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

    function startDrag(header, clientX, clientY) {
        dragObj = header.parentElement;
        document.querySelectorAll('.panel').forEach(p => p.style.zIndex = 60);
        dragObj.style.zIndex = 61;

        const rect = dragObj.getBoundingClientRect();
        dragObj.style.left = rect.left + 'px';
        dragObj.style.top = rect.top + 'px';
        dragObj.style.transform = 'none';

        dragOffsetX = clientX - rect.left;
        dragOffsetY = clientY - rect.top;
    }

    function moveDrag(clientX, clientY) {
        if (!dragObj) return;
        // 边界检测
        const maxX = window.innerWidth - 50;
        const maxY = window.innerHeight - 50;
        const newX = Math.max(0, Math.min(clientX - dragOffsetX, maxX));
        const newY = Math.max(0, Math.min(clientY - dragOffsetY, maxY));
        dragObj.style.left = newX + 'px';
        dragObj.style.top = newY + 'px';
    }

    function endDrag() {
        dragObj = null;
    }

    document.querySelectorAll('.panel-header').forEach(header => {
        // 鼠标事件（小屏幕也禁用拖拽）
        header.onmousedown = function (e) {
            if (window.innerWidth < 768) return;
            e.preventDefault();
            e.stopPropagation();
            startDrag(header, e.clientX, e.clientY);
        };
        // 触摸事件（小屏幕禁用拖拽）
        header.ontouchstart = function (e) {
            if (window.innerWidth < 768) {
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const touch = e.touches[0];
            startDrag(header, touch.clientX, touch.clientY);
        };
    });

    // 鼠标移动
    document.addEventListener('mousemove', function (e) {
        if (dragObj) {
            e.preventDefault();
            moveDrag(e.clientX, e.clientY);
        }
    });

    // 触摸移动（小屏幕禁用）
    document.addEventListener('touchmove', function (e) {
        if (window.innerWidth < 768) return;
        if (dragObj) {
            e.preventDefault();
            const touch = e.touches[0];
            moveDrag(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    // 鼠标释放
    document.addEventListener('mouseup', endDrag);
    // 触摸结束
    document.addEventListener('touchend', endDrag);
    document.addEventListener('touchcancel', endDrag);
}

function updateMenuIndicators() {
    if (cachedUI.badges.stats) cachedUI.badges.stats.style.display = player.points > 0 ? 'block' : 'none';
    if (cachedUI.badges.skills) cachedUI.badges.skills.style.display = player.skillPoints > 0 ? 'block' : 'none';
    // 任务红点：主线任务完成 或 每日任务有可领取奖励
    const hasMainQuestReward = player.questState === 2;
    const hasDailyQuestReward = typeof DailyQuestSystem !== 'undefined' && DailyQuestSystem.hasClaimableReward();
    if (cachedUI.badges.quest) cachedUI.badges.quest.style.display = (hasMainQuestReward || hasDailyQuestReward) ? 'block' : 'none';
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

    // 同步打击感设置
    player.juiceEnabled = document.getElementById('chk-juice').checked;
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
    document.getElementById('chk-juice').checked = player.juiceEnabled || false;
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
            bindItemTooltip(el, item);
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

            let previewHtml = `强化至 <span style="color:#00ff00">+${nextLvl}</span> · 成功率 <span style="color:${successRate >= 80 ? '#00ff00' : (successRate >= 50 ? '#ffff00' : '#ff4444')}">${successRate}%</span><br>`;
            previewHtml += `属性提升 ${statIncrease}%`;

            if (currentLvl >= 6) {
                previewHtml += ` · <span style="color:#ff4444;">⚠失败可能降级</span>`;
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
        previewText.innerHTML = `请放入需要强化的装备 <span style="color:#888;">(最高 +9)</span><div style="color:#666; font-size:10px; margin-top:4px;">同部位同稀有度祭品 · 成功提升属性 · +6以上有失败风险</div>`;
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

    hideTooltip();
    renderInventory();
    renderBlacksmithPanel();
    renderEmbeddedBag('blacksmith');
}

function returnItemFromForge(slotKey) {
    const item = forgeState[slotKey];
    if (!item) return;

    if (addItemToInventory(item)) {
        forgeState[slotKey] = null;

        // 如果取下主装备，祭品也一并退回 (为了防止误操作，或者单纯保留在上面也行？保留着比较方便)
        // 这里选择保留祭品，但渲染时会重新检查

        hideTooltip();
        renderInventory();
        renderBlacksmithPanel();
        renderEmbeddedBag('blacksmith');
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

        // 全服公告：强化成功
        if (typeof OnlineSystem !== 'undefined') {
            OnlineSystem.announce('enhance_success', mainItem.displayName);
        }

        // 成就追踪：最高强化等级
        trackAchievement('max_enhance', { level: mainItem.enhanceLvl });

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

        // 日期格式化：2025-12-14 → 12-14
        const dateStr = item.date ? ` (${item.date.slice(5)})` : '';

        div.innerHTML = `
            <div class="changelog-version">
                <span class="changelog-version-num">v${item.version}${dateStr}</span>
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
    { id: 4, target: 'exit', text: '这里是地牢入口' }
];
// 战斗引导（步骤5-7，顶部提示）- 根据设备类型返回不同提示
function getTutorialBattleSteps() {
    if (isMobileDevice) {
        return [
            { id: 5, text: '点击怪物进行攻击', key: null },
            { id: 6, text: '长按屏幕释放技能', key: '长按' },
            { id: 7, text: '点击 ⚔️ 按钮开启自动战斗', key: null }
        ];
    }
    return [
        { id: 5, text: '点击怪物进行物理攻击', key: null },
        { id: 6, text: '右键点击敌人释放火球术', key: '右键' },
        { id: 7, text: '按 F 开启自动战斗，解放双手', key: 'F' }
    ];
}

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
    if (!bubble && cachedUI.uiLayer) {
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
        cachedUI.uiLayer.appendChild(bubble);
    }

    if (!bubble) return;

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

// 显示战斗引导提示（顶部或气泡）
function showTutorialTip(step) {
    if (player.tutorial.completed) return;
    if (step !== player.tutorial.step) return;

    // 城镇引导用气泡，不用顶部提示
    if (step < TUTORIAL_TOWN_STEPS.length) return;

    const battleStep = getTutorialBattleSteps().find(s => s.id === step);
    if (!battleStep) return;

    // 步骤7（自动战斗）使用气泡指向按钮
    if (step === 7) {
        showAutoBattleTutorialBubble(battleStep.text);
        return;
    }

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

// 显示自动战斗引导气泡（指向按钮）
function showAutoBattleTutorialBubble(text) {
    let bubble = document.getElementById('tutorial-bubble');
    if (!bubble) {
        bubble = document.createElement('div');
        bubble.id = 'tutorial-bubble';
        bubble.innerHTML = `
            <span class="bubble-text"></span>
            <button class="bubble-btn">知道了</button>
            <div class="bubble-arrow"></div>
        `;
        bubble.onmousedown = (e) => e.stopPropagation();
        bubble.onclick = (e) => e.stopPropagation();
        bubble.querySelector('.bubble-btn').onclick = (e) => {
            e.stopPropagation();
            advanceTutorial(player.tutorial.step);
        };
        document.querySelector('.ui-layer').appendChild(bubble);
    }

    const btn = document.querySelector('.auto-battle-btn');
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    // 气泡在按钮左边，箭头指向右边
    const screenX = rect.left - 10;
    const screenY = rect.top + rect.height / 2;

    bubble.querySelector('.bubble-text').textContent = text;
    bubble.style.left = screenX + 'px';
    bubble.style.top = screenY + 'px';
    bubble.style.display = 'block';
    bubble.classList.add('arrow-right');
    bubble.classList.remove('arrow-down');
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

    const totalSteps = TUTORIAL_TOWN_STEPS.length + getTutorialBattleSteps().length;
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

// ========== 内嵌背包系统 ==========
// 渲染内嵌背包（用于商店/仓库/锻造面板）
function renderEmbeddedBag(panelType) {
    const gridId = {
        'shop': 'shop-embedded-bag',
        'stash': 'stash-embedded-bag',
        'blacksmith': 'forge-embedded-bag',
        'stall': 'stall-inventory-grid'
    }[panelType];

    const grid = document.getElementById(gridId);
    if (!grid) return;

    grid.innerHTML = '';

    player.inventory.forEach((item, idx) => {
        const slot = document.createElement('div');
        slot.className = 'embedded-bag-slot';

        if (item) {
            // 稀有度样式
            if (item.rarity >= 3 && item.rarity <= 4) slot.classList.add('rarity-unique');
            else if (item.rarity === 5) slot.classList.add('rarity-set');
            else if (item.rarity === 2) slot.classList.add('rarity-rare');

            applyItemSpriteToElement(slot, item);

            // 数量/强化等级标签
            if (item.quantity && item.quantity > 1) {
                slot.innerHTML += `<span class="item-count">${item.quantity}</span>`;
            }
            if (item.enhanceLvl > 0) {
                slot.innerHTML += `<span class="enhance-level">+${item.enhanceLvl}</span>`;
            }

            // 点击事件
            slot.onclick = (e) => {
                e.stopPropagation();
                handleEmbeddedBagClick(panelType, idx);
            };

            // 绑定tooltip
            bindItemTooltip(slot, item);
        }

        grid.appendChild(slot);
    });

    // 更新金币显示（所有内嵌背包面板）
    const goldDisplayIds = {
        'shop': 'shop-gold-display',
        'stash': 'stash-gold-display',
        'forge': 'forge-gold-display',
        'market': 'market-gold-display'
    };
    const goldDisplayId = goldDisplayIds[panelType];
    if (goldDisplayId) {
        const goldDisplay = document.getElementById(goldDisplayId);
        if (goldDisplay) goldDisplay.textContent = '金币: ' + player.gold;
    }
}

// 处理内嵌背包物品点击
function handleEmbeddedBagClick(panelType, idx) {
    const item = player.inventory[idx];
    if (!item) return;

    switch (panelType) {
        case 'shop':
            // 售卖物品
            sellItemFromInventory(idx);
            break;
        case 'stash':
            // 存入仓库
            moveItemToStash(idx);
            break;
        case 'blacksmith':
            // 添加到锻造槽
            moveItemToForge(idx);
            break;
        case 'stall':
            // 上架到摊位
            if (typeof MarketSystem !== 'undefined') {
                MarketSystem.addToShelf(idx);
            }
            break;
    }

    // 隐藏tooltip
    hideTooltip();

    // 刷新内嵌背包显示
    renderEmbeddedBag(panelType);
}

// 从背包售卖物品（用于商店面板）
function sellItemFromInventory(idx) {
    const item = player.inventory[idx];
    if (!item) return;

    // 计算售价
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
}

// ========== 一键整理功能 ==========
// 物品类型排序优先级
const SLOT_SORT_ORDER = {
    'mainhand': 0, 'helm': 1, 'body': 2, 'offhand': 3,
    'gloves': 4, 'belt': 5, 'boots': 6, 'ring': 7, 'amulet': 8,
    'potion': 10, 'scroll': 11
};

// 获取物品排序键值
function getItemSortKey(item) {
    if (!item) return { type: 999, rarity: 0, enhance: 0, name: '' };

    // 消耗品
    if (item.type === 'potion') return { type: 10, rarity: 0, enhance: 0, name: item.name };
    if (item.type === 'scroll') return { type: 11, rarity: 0, enhance: 0, name: item.name };

    // 装备
    const slotOrder = SLOT_SORT_ORDER[item.slot] ?? 9;
    const rarity = item.rarity ?? 0;
    const enhance = item.enhanceLevel ?? 0;

    return { type: slotOrder, rarity, enhance, name: item.name || '' };
}

// 物品比较函数
function compareItems(a, b) {
    const keyA = getItemSortKey(a);
    const keyB = getItemSortKey(b);

    // 1. 按类型/槽位排序
    if (keyA.type !== keyB.type) return keyA.type - keyB.type;

    // 2. 同类型按稀有度降序（稀有度高的在前）
    if (keyA.rarity !== keyB.rarity) return keyB.rarity - keyA.rarity;

    // 3. 同稀有度按强化等级降序
    if (keyA.enhance !== keyB.enhance) return keyB.enhance - keyA.enhance;

    // 4. 按名称排序
    return keyA.name.localeCompare(keyB.name);
}

// 整理背包
function sortInventory() {
    // 提取所有非空物品
    const items = player.inventory.filter(item => item !== null);

    // 排序
    items.sort(compareItems);

    // 重新填充背包
    const size = player.inventory.length;
    player.inventory = [];
    for (let i = 0; i < size; i++) {
        player.inventory[i] = items[i] || null;
    }

    renderInventory();
    showNotification('背包已整理');
    AudioSys.play('gold');
}

// 整理仓库
function sortStash() {
    // 提取所有非空物品
    const items = player.stash.filter(item => item !== null);

    // 排序
    items.sort(compareItems);

    // 重新填充仓库
    const size = player.stash.length;
    player.stash = [];
    for (let i = 0; i < size; i++) {
        player.stash[i] = items[i] || null;
    }

    renderStash();
    showNotification('仓库已整理');
    AudioSys.play('gold');
}
