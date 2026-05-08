const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

function extractFunction(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`FAIL: missing function ${name}`);
    const bodyStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    throw new Error(`FAIL: unterminated function ${name}`);
}

function assertContains(text, pattern, message) {
    const ok = pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
    if (!ok) throw new Error(message);
}

function assertNoGameplayMutation(body, name) {
    const forbidden = ['takeDamage(', 'player.mp', 'skillCooldowns', 'dropLoot(', 'grantXp('];
    for (const token of forbidden) {
        if (body.includes(token)) {
            throw new Error(`FAIL: ${name} must be visual-only, but contains ${token}.`);
        }
    }
}

const tier = extractFunction('getSkillVisualGrowthTier');
assertContains(tier, 'level >= 10', 'FAIL: skill visual growth should have a high tier at level 10.');
assertContains(tier, 'level >= 5', 'FAIL: skill visual growth should have a first growth tier at level 5.');

const fireball = extractFunction('emitFireballVisualGrowth');
assertContains(fireball, "spawnVfxEffect('fireballImpact'", 'FAIL: fireball growth must reuse the existing fireball impact sheet.');
assertContains(fireball, 'skill_ground_glow', 'FAIL: fireball growth should add ground fire-rain glow anchors.');
assertContains(fireball, 'gravity: 130', 'FAIL: fireball growth should read as falling fire rain.');
assertNoGameplayMutation(fireball, 'emitFireballVisualGrowth');

const thunder = extractFunction('emitThunderVisualGrowth');
assertContains(thunder, 'createLightningChain(', 'FAIL: thunder growth must form a chain-electric web.');
assertContains(thunder, 'skill_impact_ring', 'FAIL: thunder growth should add a web pulse ring.');
assertNoGameplayMutation(thunder, 'emitThunderVisualGrowth');

const lightningChain = extractFunction('createLightningChain');
assertContains(lightningChain, 'if (dist < 1) return;', 'FAIL: lightning chain should guard zero-distance links to avoid NaN particles.');

const arrowTrail = extractFunction('createArrowCurtainTrail');
assertContains(arrowTrail, 'p.visualTier', 'FAIL: arrow curtain trail should be gated by projectile visualTier.');
assertContains(arrowTrail, 'skill_impact_ray', 'FAIL: arrow curtain trail should be blade-like ray streaks, not soft dust.');

const multishot = extractFunction('emitMultishotVisualGrowth');
assertContains(multishot, "emitSkillImpactBurst('multishot'", 'FAIL: multishot growth should keep the current impact language.');
assertContains(multishot, 'skill_impact_ray', 'FAIL: multishot growth should create arrow curtain linework.');
assertNoGameplayMutation(multishot, 'emitMultishotVisualGrowth');

assertContains(source, "visualTier: getSkillVisualGrowthTier('fireball')", 'FAIL: fireball projectiles should carry visual growth tier.');
assertContains(source, "visualTier: getSkillVisualGrowthTier('multishot')", 'FAIL: multishot projectiles should carry visual growth tier.');
assertContains(source, 'p.visualTier = undefined;', 'FAIL: projectile pool release should clear visualTier.');
assertContains(source, 'createArrowCurtainTrail(p, pConfig);', 'FAIL: multishot projectiles should emit arrow-curtain trails during flight.');
assertContains(source, 'emitFireballVisualGrowth(p.x, p.y, p.angle, p.visualTier', 'FAIL: fireball impacts should trigger fire-rain growth visuals.');
assertContains(source, "emitThunderVisualGrowth(target, nearbyTargets, getSkillVisualGrowthTier('thunder'));", 'FAIL: thunder impacts should trigger chain-web growth visuals.');
assertContains(source, 'emitMultishotVisualGrowth(p.x, p.y, p.angle, p.visualTier', 'FAIL: multishot impacts should trigger arrow-curtain growth visuals.');

const runtimeContext = {
    console,
    Math,
    Set,
    player: { skills: { fireball: 1, thunder: 0, multishot: 0 } },
    enemies: [],
    particles: [],
    vfxEffects: [],
    SKILL_IMPACT_PALETTES: {
        fireball: { core: '#fff3b0', main: '#ff6a18', glow: 'rgba(255, 82, 20, 0.34)', ember: '#ffbb55', ring: '#ff8a2a' },
        thunder: { core: '#ffffff', main: '#92e8ff', glow: 'rgba(95, 210, 255, 0.32)', ember: '#dff8ff', ring: '#66cfff' },
        multishot: { core: '#ffffcc', main: '#baff42', glow: 'rgba(178, 255, 68, 0.24)', ember: '#f7ff88', ring: '#d8ff5a' }
    },
    ParticlePool: { acquire: props => ({ ...props }) },
    getParticleConfig: () => ({ maxParticles: 500 }),
    spawnVfxEffect: (effectId, x, y, scale, rotation) => {
        runtimeContext.vfxEffects.push({ effectId, x, y, scale, rotation });
    },
    emitSkillImpactBurst: (type, x, y, angle, power) => {
        runtimeContext.particles.push({ type: 'burst_probe', skill: type, x, y, angle, power });
    }
};
vm.createContext(runtimeContext);
vm.runInContext([
    tier,
    extractFunction('getSkillVisualNearbyEnemies'),
    fireball,
    lightningChain,
    thunder,
    arrowTrail,
    multishot,
    `globalThis.getSkillVisualGrowthTier = getSkillVisualGrowthTier;`,
    `globalThis.emitFireballVisualGrowth = emitFireballVisualGrowth;`,
    `globalThis.createLightningChain = createLightningChain;`,
    `globalThis.emitThunderVisualGrowth = emitThunderVisualGrowth;`,
    `globalThis.createArrowCurtainTrail = createArrowCurtainTrail;`,
    `globalThis.emitMultishotVisualGrowth = emitMultishotVisualGrowth;`
].join('\n'), runtimeContext);

runtimeContext.player.skills.fireball = 4;
if (runtimeContext.getSkillVisualGrowthTier('fireball') !== 0) {
    throw new Error('FAIL: fireball level 4 should not unlock visual growth.');
}
runtimeContext.player.skills.fireball = 5;
if (runtimeContext.getSkillVisualGrowthTier('fireball') !== 1) {
    throw new Error('FAIL: fireball level 5 should unlock tier 1 visual growth.');
}
runtimeContext.player.skills.fireball = 10;
if (runtimeContext.getSkillVisualGrowthTier('fireball') !== 2) {
    throw new Error('FAIL: fireball level 10 should unlock tier 2 visual growth.');
}

runtimeContext.emitFireballVisualGrowth(100, 100, 0, 2);
if (runtimeContext.vfxEffects.filter(fx => fx.effectId === 'fireballImpact').length < 5) {
    throw new Error('FAIL: tier 2 fireball should spawn multiple fire-rain impact sheets.');
}
if (!runtimeContext.particles.some(p => p.type === 'skill_ground_glow') || !runtimeContext.particles.some(p => p.gravity === 130)) {
    throw new Error('FAIL: fireball growth should emit both ground glow and falling fire particles.');
}

runtimeContext.particles.length = 0;
runtimeContext.createLightningChain(1, 1, 1, 1);
if (runtimeContext.particles.length !== 0) {
    throw new Error('FAIL: zero-distance lightning chain should emit no particles.');
}

runtimeContext.enemies = [
    { name: 'a', x: 140, y: 100, dead: false },
    { name: 'b', x: 98, y: 150, dead: false },
    { name: 'far', x: 500, y: 500, dead: false }
];
runtimeContext.emitThunderVisualGrowth({ name: 'target', x: 100, y: 100, dead: false }, [], 2);
const chainParticles = runtimeContext.particles.filter(p => p.type === 'lightning_chain');
if (chainParticles.length === 0) {
    throw new Error('FAIL: thunder growth should emit lightning chain particles.');
}
if (chainParticles.some(p => p.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) {
    throw new Error('FAIL: thunder growth should never emit NaN lightning points.');
}

runtimeContext.particles.length = 0;
runtimeContext.createArrowCurtainTrail({ type: 'multishot', visualTier: 2, x: 120, y: 100, angle: 0 }, { multishotTrail: 999 });
if (!runtimeContext.particles.some(p => p.type === 'skill_impact_ray')) {
    throw new Error('FAIL: arrow curtain trail should emit ray particles.');
}

runtimeContext.particles.length = 0;
runtimeContext.emitMultishotVisualGrowth(150, 100, 0, 2);
if (!runtimeContext.particles.some(p => p.type === 'burst_probe' && p.skill === 'multishot')) {
    throw new Error('FAIL: multishot growth should reuse impact burst language.');
}
if (runtimeContext.particles.filter(p => p.type === 'skill_impact_ray').length < 9) {
    throw new Error('FAIL: tier 2 multishot should emit a wide arrow curtain.');
}

console.log('PASS: skill visual growth contract');
