const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const gameSource = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const audioSource = fs.readFileSync(path.join(root, 'audio.js'), 'utf8');
const itemsSource = fs.readFileSync(path.join(root, 'items-data.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

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

function assertContains(text, pattern, message) {
    const ok = pattern instanceof RegExp ? pattern.test(text) : text.includes(pattern);
    if (!ok) throw new Error(message);
}

assertContains(itemsSource, /name: '木棒'[\s\S]*weaponClass: 'club'/, 'FAIL: BASE_ITEMS should define starter wooden club.');
assertContains(itemsSource, /name: '短剑'[\s\S]*weaponClass: 'sword'/, 'FAIL: short sword should have sword weaponClass.');
assertContains(itemsSource, /name: '巨斧'[\s\S]*weaponClass: 'axe'/, 'FAIL: axe should have axe weaponClass.');
assertContains(gameSource, "createItem('木棒', 0)", 'FAIL: new players should start with a wooden club, not a short sword.');
assertContains(gameSource, 'AudioSys.play(getMeleeSwingSoundId());', 'FAIL: melee swing sound should come from equipped weapon class.');
assertContains(gameSource, 'function getMeleeHitSoundId(', 'FAIL: melee hit feedback should come from equipped weapon class.');
assertContains(gameSource, "getMeleeHitSoundId('hit')", 'FAIL: blocked melee hit should use weapon-aware hit sound.');
assertContains(gameSource, "getMeleeHitSoundId('kill')", 'FAIL: melee kill sound should use weapon-aware hit sound.');
assertContains(gameSource, 'drawHeroSprite(ctx, source, frame, px, py - renderHeight', 'FAIL: player should still render through drawHeroSprite.');
assertContains(gameSource, 'getHeroEquipmentVisualState()', 'FAIL: player rendering should read equipment visual state.');
assertContains(gameSource, 'function eraseHeroBakedShield(', 'FAIL: equipment render pass should erase baked shield when offhand is empty.');
assertContains(gameSource, 'eraseHeroBakedShield(buffer.ctx, buffer.width, buffer.height, frame, visualState);', 'FAIL: hero render pass should apply shield erasing.');
assertContains(audioSource, "type === 'melee_club_swing'", 'FAIL: audio should include wooden club swing branch.');
assertContains(audioSource, "type === 'melee_club_hit'", 'FAIL: audio should include wooden club hit branch.');
assertContains(audioSource, "type === 'melee_unarmed_hit'", 'FAIL: audio should include unarmed hit branch.');
assertContains(audioSource, "type === 'melee_unarmed_swing'", 'FAIL: audio should include unarmed swing branch.');
assertContains(audioSource, "type === 'melee_sword_swing'", 'FAIL: audio should include explicit sword swing branch.');
assertContains(audioSource, "playSfxAsset('swordSwing')", 'FAIL: sword swing should still use the real sword asset.');
assertContains(indexSource, 'audio.js?v=202605080430', 'FAIL: index.html should bump audio.js cache version.');
assertContains(indexSource, 'items-data.js?v=202605080430', 'FAIL: index.html should bump items-data.js cache version.');
assertContains(indexSource, 'game.js?v=202605080430', 'FAIL: index.html should bump game.js cache version.');

const context = {
    console,
    player: {
        equipment: {
            mainhand: null,
            body: null,
            helm: null,
            gloves: null,
            boots: null,
            belt: null
        }
    }
};
vm.createContext(context);
vm.runInContext([
    extractFunction(gameSource, 'getItemWeaponClass'),
    extractFunction(gameSource, 'getEquippedWeaponClass'),
    extractFunction(gameSource, 'getMeleeSwingSoundId'),
    extractFunction(gameSource, 'getMeleeHitSoundId'),
    extractFunction(gameSource, 'hasVisibleArmorEquipped'),
    extractFunction(gameSource, 'getHeroEquipmentVisualState'),
    extractFunction(gameSource, 'getMeleeAttackVisualProfile'),
    `globalThis.getItemWeaponClass = getItemWeaponClass;`,
    `globalThis.getEquippedWeaponClass = getEquippedWeaponClass;`,
    `globalThis.getMeleeSwingSoundId = getMeleeSwingSoundId;`,
    `globalThis.getMeleeHitSoundId = getMeleeHitSoundId;`,
    `globalThis.hasVisibleArmorEquipped = hasVisibleArmorEquipped;`,
    `globalThis.getHeroEquipmentVisualState = getHeroEquipmentVisualState;`,
    `globalThis.getMeleeAttackVisualProfile = getMeleeAttackVisualProfile;`
].join('\n'), context);

if (context.getEquippedWeaponClass() !== 'unarmed') {
    throw new Error('FAIL: empty mainhand should be unarmed.');
}
if (context.getMeleeSwingSoundId() !== 'melee_unarmed_swing') {
    throw new Error('FAIL: empty mainhand should not play sword swing.');
}
if (context.getMeleeHitSoundId('hit') !== 'melee_unarmed_hit') {
    throw new Error('FAIL: empty mainhand should not play sword hit.');
}
let state = context.getHeroEquipmentVisualState();
if (state.armorState !== 'novice' || !state.hideBakedSword || state.drawClub) {
    throw new Error(`FAIL: empty gear should render novice unarmed state, got ${JSON.stringify(state)}.`);
}
if (!state.hideBakedShield) {
    throw new Error(`FAIL: empty offhand should hide the baked shield, got ${JSON.stringify(state)}.`);
}
if (context.getMeleeAttackVisualProfile().style !== 'unarmed') {
    throw new Error('FAIL: empty mainhand should use unarmed impact visuals.');
}

context.player.equipment.mainhand = { name: '木棒', type: 'weapon', weaponClass: 'club' };
if (context.getEquippedWeaponClass() !== 'club' || context.getMeleeSwingSoundId() !== 'melee_club_swing') {
    throw new Error('FAIL: wooden club should use club sound profile.');
}
if (context.getMeleeHitSoundId('hit') !== 'melee_club_hit' || context.getMeleeHitSoundId('kill') !== 'melee_club_kill') {
    throw new Error('FAIL: wooden club should use club hit and kill feedback.');
}
state = context.getHeroEquipmentVisualState();
if (!state.hideBakedSword || !state.hideBakedShield || !state.drawClub || state.weaponClass !== 'club') {
    throw new Error(`FAIL: wooden club should hide baked sword and draw club, got ${JSON.stringify(state)}.`);
}

context.player.equipment.mainhand = { name: '短剑', type: 'weapon' };
if (context.getItemWeaponClass(context.player.equipment.mainhand) !== 'sword') {
    throw new Error('FAIL: legacy short sword without weaponClass should infer sword class.');
}
if (context.getMeleeSwingSoundId() !== 'melee_sword_swing') {
    throw new Error('FAIL: short sword should play sword swing.');
}
if (context.getMeleeHitSoundId('crit') !== 'melee_sword_crit') {
    throw new Error('FAIL: short sword crit should play sword crit feedback.');
}

context.player.equipment.body = { name: '皮甲', type: 'armor' };
state = context.getHeroEquipmentVisualState();
if (state.armorState !== 'armored') {
    throw new Error(`FAIL: equipped armor should leave armored hero look, got ${JSON.stringify(state)}.`);
}
context.player.equipment.offhand = { name: '木盾', type: 'shield' };
state = context.getHeroEquipmentVisualState();
if (state.hideBakedShield) {
    throw new Error(`FAIL: equipped offhand should keep baked shield visible, got ${JSON.stringify(state)}.`);
}

console.log('PASS: starter gear visual audio');
