const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'auto-battle.js'), 'utf8');

let damageCalls = 0;
let movedTowardTarget = false;

const context = {
    console,
    Date,
    Math,
    Map,
    WeakMap,
    Error,
    Number,
    GAME_CONFIG: {
        AUTO_KEEP_DISTANCE: 150,
        AUTO_POTION_HP_THRESHOLD: 0.3,
        AUTO_POTION_MP_THRESHOLD: 0.2,
        AUTO_EMERGENCY_HP: 0.15,
        PLAYER_MELEE_NO_LOS_RANGE: 50
    },
    player: {
        x: 0,
        y: 0,
        radius: 15,
        hp: 100,
        maxHp: 100,
        mp: 100,
        maxMp: 100,
        floor: 1,
        frozen: false,
        targetItem: null,
        targetX: null,
        targetY: null,
        inventory: [],
        skills: { fireball: 0, multishot: 0, thunder: 0 },
        skillCooldowns: { fireball: 0, multishot: 0, thunder: 0 },
        damage: [10, 10],
        str: 0,
        attackSpeed: 0,
        attackCooldown: 0,
        lifeSteal: 0
    },
    enemies: [],
    groundItems: [],
    mouse: { worldX: 0, worldY: 0 },
    isInTown: () => false,
    getSkillManaCost: () => 9999,
    castSkill: () => { throw new Error('simulation should not cast skills'); },
    performAttack: () => { damageCalls += 1; },
    takeDamage: () => { damageCalls += 1; },
    AudioSys: { play: () => {} },
    createSlashEffect: () => {},
    useQuickItem: () => {},
    createFloatingText: () => {},
    updateAutoBattleFeeHUD: () => {}
};

vm.createContext(context);
vm.runInContext(`${source}\nglobalThis.AutoBattle = AutoBattle;`, context);

const boss = { x: 80, y: 0, radius: 30, dead: false };
context.enemies.push(boss);
context.AutoBattle.enabled = true;
context.AutoBattle.currentTarget = boss;
context.AutoBattle.lastPos = { x: context.player.x, y: context.player.y };
context.AutoBattle.hasCachedLineOfSightTo = () => true;
context.AutoBattle.findTarget = () => boss;
context.AutoBattle.autoPickupItems = () => {};
context.AutoBattle.moveTowards = () => {
    movedTowardTarget = true;
    context.player.targetX = boss.x;
    context.player.targetY = boss.y;
};

const engageDistance = context.AutoBattle.getMeleeEngageDistance(boss);
if (engageDistance !== 80) {
    throw new Error(`FAIL: expected Boss engage distance 80, got ${engageDistance}`);
}

context.AutoBattle.decideAction(0.016);

if (movedTowardTarget) {
    throw new Error('FAIL: exact Boss engage boundary should not keep chasing the Boss center.');
}
if (context.player.targetX !== null || context.player.targetY !== null) {
    throw new Error('FAIL: exact Boss engage boundary should clear movement target before attacking.');
}
if (damageCalls !== 1) {
    throw new Error(`FAIL: exact Boss engage boundary should attack once, got ${damageCalls}.`);
}

console.log('PASS: auto battle Boss engage simulation');
