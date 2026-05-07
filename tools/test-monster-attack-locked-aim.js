const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'game.js'), 'utf8');

function extractFunction(name) {
    const start = source.indexOf(`function ${name}`);
    if (start === -1) throw new Error(`FAIL: missing function ${name}`);
    const braceStart = source.indexOf('{', start);
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        if (source[i] === '}') depth--;
        if (depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`FAIL: unterminated function ${name}`);
}

const context = {
    console,
    Math,
    Error,
    scheduledMonsterAttacks: [],
    player: { x: 300, y: 0, isDead: false },
    enemies: [],
    spawnMonsterAttackTelegraph: () => {},
    triggerMonsterAction: () => {}
};

vm.createContext(context);
vm.runInContext(`
${extractFunction('directionFromDelta')}
${extractFunction('setMonsterFacingToward')}
${extractFunction('createMonsterAttackAim')}
${extractFunction('startMonsterAttack')}
${extractFunction('processScheduledMonsterAttacks')}
`, context);

const attacker = { x: 0, y: 0, dead: false };
context.enemies.push(attacker);

let resolvedAim = null;
context.startMonsterAttack(attacker, {
    duration: 0.42,
    impactDelay: 0.18,
    targetX: context.player.x,
    targetY: context.player.y,
    resolve: (_attacker, aim) => {
        resolvedAim = aim;
    }
});

context.player.x = 0;
context.player.y = 300;
context.processScheduledMonsterAttacks(0.2);

if (!resolvedAim) {
    throw new Error('FAIL: scheduled monster attack should pass the locked aim to the impact resolver.');
}
if (resolvedAim.targetX !== 300 || resolvedAim.targetY !== 0) {
    throw new Error(`FAIL: monster attack aim changed during windup: ${JSON.stringify(resolvedAim)}`);
}
if (resolvedAim.angle !== 0) {
    throw new Error(`FAIL: monster attack should keep the original firing angle, got ${resolvedAim.angle}`);
}

console.log('PASS: monster attacks keep locked aim through windup');
