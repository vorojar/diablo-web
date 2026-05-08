const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const gameSource = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

function extractFunction(source, name) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`FAIL: missing function ${name}`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`FAIL: unterminated function ${name}`);
}

const functionNames = [
    'getPhysicalSweepTier',
    'getPhysicalSweepConfig',
    'getPhysicalGrowthVisualProfile',
    'getAngleDelta',
    'canPhysicalSweepReachEnemy',
    'getPhysicalSweepTargets',
    'createPhysicalSweepEffect',
    'emitPhysicalGrowthVisuals',
    'triggerPhysicalSweep'
];

const calls = [];
const context = {
    console,
    Math,
    Date,
    GAME_CONFIG: {
        PHYSICAL_SWEEP_TIER1_LEVEL: 6,
        PHYSICAL_SWEEP_TIER1_STR: 35,
        PHYSICAL_SWEEP_TIER2_LEVEL: 12,
        PHYSICAL_SWEEP_TIER2_STR: 60,
        PHYSICAL_SWEEP_TIER3_LEVEL: 20,
        PHYSICAL_SWEEP_TIER3_STR: 90,
        PHYSICAL_SWEEP_PRESSURE_RADIUS: 170,
        PHYSICAL_SWEEP_TRIGGER_ENEMIES: 3,
        PHYSICAL_SWEEP_TIER1_RANGE: 118,
        PHYSICAL_SWEEP_TIER2_RANGE: 142,
        PHYSICAL_SWEEP_TIER3_RANGE: 168,
        PHYSICAL_SWEEP_TIER1_ARC: 2.35,
        PHYSICAL_SWEEP_TIER2_ARC: 3.35,
        PHYSICAL_SWEEP_TIER3_ARC: 4.7,
        PHYSICAL_SWEEP_TIER1_MAX_TARGETS: 2,
        PHYSICAL_SWEEP_TIER2_MAX_TARGETS: 4,
        PHYSICAL_SWEEP_TIER3_MAX_TARGETS: 6,
        PHYSICAL_SWEEP_TIER1_DAMAGE_RATIO: 0.45,
        PHYSICAL_SWEEP_TIER2_DAMAGE_RATIO: 0.6,
        PHYSICAL_SWEEP_TIER3_DAMAGE_RATIO: 0.75,
        PLAYER_MELEE_NO_LOS_RANGE: 50
    },
    player: {
        x: 0,
        y: 0,
        lvl: 1,
        str: 15,
        floor: 1,
        elementalDamage: { fire: 0, lightning: 0, poison: 0 }
    },
    enemies: [],
    slashEffects: [],
    particles: [],
    COLORS: { critical: '#ffff00', damage: '#ff0000' },
    getPlayerVisualProfile: () => ({ trail: '#ffffff' }),
    hasLineOfSight: () => true,
    getParticleConfig: () => ({ maxParticles: 500 }),
    ParticlePool: { acquire: props => ({ ...props }) },
    takeDamage: (target, damage, isSkillDamage) => {
        calls.push({ target: target.name, damage, isSkillDamage });
    },
    createDamageNumber: () => {},
    createParticle: () => {}
};

vm.createContext(context);
const extracted = functionNames.map(name => extractFunction(gameSource, name)).join('\n');
vm.runInContext(`${extracted}
globalThis.getPhysicalSweepTier = getPhysicalSweepTier;
globalThis.getPhysicalSweepTargets = getPhysicalSweepTargets;
globalThis.triggerPhysicalSweep = triggerPhysicalSweep;`, context);

if (context.getPhysicalSweepTier() !== 0) {
    throw new Error('FAIL: low-level physical attack should not unlock sweep.');
}

context.player.lvl = 12;
context.player.str = 62;
if (context.getPhysicalSweepTier() !== 2) {
    throw new Error(`FAIL: level 12 / strength 62 should unlock tier 2 sweep, got ${context.getPhysicalSweepTier()}.`);
}

const primary = { name: 'primary', x: 70, y: 0, radius: 12, dead: false };
const frontA = { name: 'frontA', x: 95, y: 35, radius: 12, dead: false };
const frontB = { name: 'frontB', x: 105, y: -45, radius: 12, dead: false };
const behind = { name: 'behind', x: -80, y: 0, radius: 12, dead: false };
const far = { name: 'far', x: 260, y: 0, radius: 12, dead: false };
context.enemies.push(primary, frontA, frontB, behind, far);

const targets = context.getPhysicalSweepTargets(primary, 0, 2);
const targetNames = targets.map(t => t.name).join(',');
if (targetNames !== 'frontA,frontB') {
    throw new Error(`FAIL: tier 2 sweep should hit only forward secondary targets, got ${targetNames}.`);
}

context.triggerPhysicalSweep(primary, 100, false, 0);
const callNames = calls.map(c => c.target).join(',');
if (callNames !== 'frontA,frontB') {
    throw new Error(`FAIL: sweep damage should apply to secondary targets only, got ${callNames}.`);
}
if (calls.some(c => c.damage.physical !== 60 || c.isSkillDamage !== false)) {
    throw new Error(`FAIL: tier 2 sweep should deal 60 physical non-skill damage, got ${JSON.stringify(calls)}.`);
}
if (context.slashEffects.length < 3) {
    throw new Error('FAIL: sweep should emit multiple blade arcs.');
}
if (!context.slashEffects.every(s => s.isSweep && s.arcWidth >= 0.46 && s.arcWidth <= 0.86 && s.lineWidth >= 2.2 && s.lineWidth <= 4.2)) {
    throw new Error(`FAIL: sweep slash effects should reuse the original slim blade standard, got ${JSON.stringify(context.slashEffects)}.`);
}
if (!context.slashEffects.some(s => s.alphaScale < 0.9)) {
    throw new Error('FAIL: sweep should layer semi-transparent blade arcs instead of drawing a thick solid fan.');
}
if (!context.slashEffects.some(s => s.growthStyle === 'whirlwind')) {
    throw new Error('FAIL: tier 2 physical growth should add whirlwind blade layers.');
}

calls.length = 0;
primary.dead = true;
context.triggerPhysicalSweep(primary, 100, false, 0);
if (calls.map(c => c.target).join(',') !== 'frontA,frontB') {
    throw new Error('FAIL: sweep should still resolve when the primary target dies from the opening hit.');
}
primary.dead = false;

calls.length = 0;
context.enemies.splice(0, context.enemies.length, primary, frontA);
context.triggerPhysicalSweep(primary, 100, false, 0);
if (calls.length !== 0) {
    throw new Error('FAIL: sweep should not trigger unless the player is under multi-enemy pressure.');
}

calls.length = 0;
context.player.lvl = 20;
context.player.str = 92;
const tier3A = { name: 'tier3A', x: 92, y: 28, radius: 12, dead: false };
const tier3B = { name: 'tier3B', x: 96, y: -34, radius: 12, dead: false };
const tier3C = { name: 'tier3C', x: 132, y: 4, radius: 12, dead: false };
context.enemies.splice(0, context.enemies.length, primary, tier3A, tier3B, tier3C);
context.triggerPhysicalSweep(primary, 120, true, 0);
if (!context.particles.some(p => p.growthStyle === 'earthsplit' && p.type === 'skill_impact_ray')) {
    throw new Error('FAIL: tier 3 physical growth should emit earthsplit ground rays.');
}
if (!context.slashEffects.some(s => s.growthStyle === 'halfmoon') || !context.slashEffects.some(s => s.growthStyle === 'whirlwind')) {
    throw new Error('FAIL: physical growth should preserve halfmoon and whirlwind layers before earthsplit.');
}

console.log('PASS: physical sweep behavior');
