// ========== enemy-system.js - 敌人系统模块 ==========
// 包含怪物帧配置、Boss配置、精英怪词缀、Boss技能及特性逻辑
// 依赖全局变量：player, enemies, projectiles, EnemyPool, AudioSys, particles, damageNumbers, slowMotion
// 依赖全局函数：createLevelUpBeam, triggerScreenShake, createDamageNumber, updateUI, checkPlayerDeath, createParticle, showNotification, isWall

// ========== 帧配置 ==========

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

// ========== Boss 工具函数 ==========

function syncBossSkillVisual(boss, action, duration) {
  if (typeof setMonsterFacingToward === 'function') {
    setMonsterFacingToward(boss, player.x, player.y, duration);
  }
  if (typeof triggerMonsterAction === 'function') {
    triggerMonsterAction(boss, action, duration);
  }
}

function spawnBossTelegraph(effectId, x, y, scale = 1, rotation = 0) {
  if (typeof spawnVfxEffect === 'function') {
    spawnVfxEffect(effectId, x, y, scale, rotation);
  }
}

function startBossSkillWindup(boss, skillId, cooldown, data = {}) {
  const windup = data.windup || 0.45;
  boss.pendingSkill = { id: skillId, timer: windup, data };
  boss.skillCd = cooldown;
  syncBossSkillVisual(boss, 'cast', windup);
  spawnBossTelegraph('bossCastBurst', boss.x, boss.y, 1, 0);

  if (data.telegraph === 'circle') {
    const radius = data.radius || 150;
    spawnBossTelegraph('telegraphCircle', boss.x, boss.y, Math.max(0.75, radius / 80), 0);
  } else if (data.telegraph === 'cone') {
    spawnBossTelegraph('telegraphCone', boss.x, boss.y, Math.max(0.8, (data.range || 200) / 180), data.angle || 0);
  } else if (data.telegraph === 'line') {
    spawnBossTelegraph('telegraphLine', boss.x, boss.y, Math.max(0.8, (data.range || 220) / 210), data.angle || 0);
  }
}

function updateBossPendingSkill(boss, dt) {
  if (!boss.pendingSkill) return false;

  boss.pendingSkill.timer -= dt;
  if (boss.pendingSkill.timer > 0) return true;

  const pending = boss.pendingSkill;
  boss.pendingSkill = null;

  if (boss.dead || player.dead) return true;

  if (pending.id === 'fireNova') {
    bossFireNova(boss, pending.data.radius, pending.data.damage);
  } else if (pending.id === 'groundSlam') {
    bossGroundSlam(boss);
  } else if (pending.id === 'summonMinions') {
    bossSummonMinions(boss);
  } else if (pending.id === 'breathAttack') {
    bossBreathAttack(boss, pending.data.angle);
  } else if (pending.id === 'tentacleAttack') {
    bossTentacleAttack(boss, pending.data.angle);
  }

  return true;
}

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
  2: { name: '血鸟', hp: 400, dmg: 30, xp: 1000 },
  4: { name: '女伯爵', hp: 1000, dmg: 50, xp: 2000 },
  5: { name: '屠夫', hp: 1400, dmg: 65, xp: 2500 },
  7: { name: '树头木拳', hp: 2800, dmg: 75, xp: 3000 },
  9: { name: '暗黑破坏神', hp: 5000, dmg: 95, xp: 5000 },
  10: { name: '巴尔', hp: 6000, dmg: 120, xp: 8000 }
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
    speed: 90 + Math.min(cycle * 10, 100), // 速度有上限
    cycle: cycle // 返回周目数，用于技能解锁
  };
}

// ========== Boss 配置与特性 ==========

// Boss 词缀预设表 - 每个 Boss 有固定的战斗风格
const BOSS_AFFIX_PRESETS = {
  '血鸟': {
    ai: 'ranged',           // 远程 AI
    affixes: ['multiple_shot'],  // 多重射击
    bossTraits: {
      multiShot: 5,       // 5 支箭（精英怪只有 3 支）
      poisonOnHit: true,  // 箭矢附带中毒
      poisonDamage: 0.3   // 中毒伤害 = 30% 基础伤害
    }
  },
  '女伯爵': {
    ai: 'specter',          // 穿墙远程 AI（可传送）
    affixes: ['fire_enchanted'],
    bossTraits: {
      canTeleport: true,      // 可传送
      teleportCooldown: 5,    // 传送冷却 5 秒
      fireNovaOnTeleport: true // 传送后释放火焰新星
    }
  },
  '屠夫': {
    ai: 'vampire',          // 吸血鬼突进 AI
    affixes: ['vampiric', 'extra_strong'],
    bossTraits: {
      dashDistance: 250,  // 突进距离更远
      enrageThreshold: 0.3, // 30% 血量进入狂暴
      enrageSpeedMult: 1.5, // 狂暴速度 +50%
      enrageDmgMult: 1.3    // 狂暴伤害 +30%
    }
  },
  '树头木拳': {
    ai: 'chase',
    affixes: ['stone_skin'],
    bossTraits: {
      canSummon: true,    // 可召唤小怪
      summonCooldown: 12, // 召唤冷却
      summonCount: 2,     // 召唤数量
      groundSlam: true,   // 地震波攻击
      slamCooldown: 6,    // 地震波冷却
      slamRadius: 180     // 地震波范围
    }
  },
  '暗黑破坏神': {
    ai: 'chase',
    affixes: ['lightning_enchanted', 'fire_enchanted'],
    bossTraits: {
      breathAttack: true,     // 吐息攻击
      breathCooldown: 4,      // 吐息冷却
      breathAngle: 60,        // 吐息角度
      breathRange: 220        // 吐息范围
    }
  },
  '巴尔': {
    ai: 'chase',
    affixes: ['cold_enchanted'],
    bossTraits: {
      freezeRadius: 150,      // 冰冻范围更大
      freezeDuration: 1.0,    // 冰冻时间更长
      tentacleAttack: true,   // 触手攻击
      tentacleCooldown: 6,    // 触手冷却
      tentacleCount: 4        // 触手数量
    }
  }
};

// Boss 词缀强化系数（Boss 的词缀效果比精英怪强）
const BOSS_AFFIX_MULTIPLIERS = {
  fire_enchanted: { fireDmgMult: 1.5, explosionMult: 2.0 },  // 火焰伤害 1.5 倍，爆炸 2 倍
  cold_enchanted: { coldDmgMult: 1.5, freezeTime: 0.8 },     // 冰冻伤害 1.5 倍，冰冻 0.8 秒
  lightning_enchanted: { lightningDmgMult: 1.5 },
  vampiric: { lifeStealMult: 1.0 },       // 吸血 50% -> 50%（保持）
  stone_skin: { reductionMult: 1.2 },     // 减伤 50% -> 60%
  multiple_shot: { arrowCount: 5 },       // 箭矢 3 -> 5
  extra_strong: { dmgMult: 2.5 }          // 伤害 2x -> 2.5x
};

// 应用 Boss 特殊属性
function applyBossTraits(boss, bossName, baseDmg) {
  const traits = boss.bossTraits || {};

  // 基础属性调整
  if (traits.canTeleport) boss.canTeleport = true;
  if (traits.multiShot) boss.multiShot = traits.multiShot;
  if (traits.poisonOnHit) {
    boss.poisonOnHit = true;
    boss.poisonDamage = (traits.poisonDamage || 0.3) * baseDmg;
  }

  // 技能冷却初始化
  if (traits.teleportCooldown) boss.teleportCdMax = traits.teleportCooldown;
  if (traits.summonCooldown) boss.summonCdMax = traits.summonCooldown;
  if (traits.slamCooldown) boss.slamCdMax = traits.slamCooldown;
  if (traits.breathCooldown) boss.breathCdMax = traits.breathCooldown;
  if (traits.tentacleCooldown) boss.tentacleCdMax = traits.tentacleCooldown;

  // 定制属性
  if (bossName.includes('树头木拳')) boss.slamRadius = traits.slamRadius;
  if (bossName.includes('屠夫')) boss.dashDistance = traits.dashDistance;
  if (bossName.includes('暗黑破坏神')) {
    boss.breathAngle = traits.breathAngle;
    boss.breathRange = traits.breathRange;
  }
  if (bossName.includes('巴尔')) boss.tentacleCount = traits.tentacleCount;

  // 初始冷却随机化（避免同时释放）
  boss.skillCd = 2 + Math.random() * 2;
}

// 更新 Boss 技能逻辑 (在 gameLoop 中调用)
function updateBossSkills(boss, dt) {
  if (player.dead) return;
  if (updateBossPendingSkill(boss, dt)) return;

  // 屠夫狂暴逻辑
  if (boss.name.includes('屠夫') && !boss.enraged) {
    if (boss.hp < boss.maxHp * 0.3) {
      boss.enraged = true;
      boss.speed *= 1.5;
      boss.dmg *= 1.3;
      showNotification(`${boss.name} 进入狂暴状态！`);
      createParticle(boss.x, boss.y, '#ff0000', 20);
      boss.color = '#ff0000'; // 变红
    }
  }

  // 技能通用冷却
  if (boss.skillCd > 0) {
    boss.skillCd -= dt;
    return;
  }

  const dist = Math.hypot(player.x - boss.x, player.y - boss.y);

  // 女伯爵瞬移
  if (boss.canTeleport && dist > 250) { // 玩家太远时瞬移
    boss.x = player.x + (Math.random() - 0.5) * 100;
    boss.y = player.y + (Math.random() - 0.5) * 100;
    createParticle(boss.x, boss.y, '#ff4400', 10); // 出现特效
    if (boss.bossTraits && boss.bossTraits.fireNovaOnTeleport) {
      startBossSkillWindup(boss, 'fireNova', boss.teleportCdMax || 5, {
        telegraph: 'circle',
        radius: 150,
        damage: boss.dmg * 0.8
      });
    } else {
      boss.skillCd = boss.teleportCdMax || 5;
    }
    showNotification(`${boss.name} 使用了瞬移！`);
    return;
  }

  // 树头木拳地震波
  if (boss.bossTraits && boss.bossTraits.groundSlam && dist < 120) {
    startBossSkillWindup(boss, 'groundSlam', boss.slamCdMax || 6, {
      telegraph: 'circle',
      radius: boss.slamRadius || 150
    });
    return;
  }

  // 树头木拳召唤
  if (boss.bossTraits && boss.bossTraits.canSummon && Math.random() < 0.3) {
    startBossSkillWindup(boss, 'summonMinions', boss.summonCdMax || 12);
    return;
  }

  // 暗黑破坏神吐息
  if (boss.bossTraits && boss.bossTraits.breathAttack && dist < 200 && dist > 50) {
    const angleToPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);
    startBossSkillWindup(boss, 'breathAttack', boss.breathCdMax || 4, {
      telegraph: 'cone',
      angle: angleToPlayer,
      range: boss.breathRange || 200
    });
    return;
  }

  // 巴尔触手
  if (boss.bossTraits && boss.bossTraits.tentacleAttack) {
    const angleToPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);
    startBossSkillWindup(boss, 'tentacleAttack', boss.tentacleCdMax || 6, {
      telegraph: 'line',
      angle: angleToPlayer,
      range: 240
    });
    return;
  }
}

// ========== Boss 技能具体实现 ==========

// Boss 技能：火焰新星
function bossFireNova(boss, radius, damage) {
  syncBossSkillVisual(boss, 'attack', 0.45);

  const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
  if (dist < radius && player.invincibleTimer <= 0) {
    const fireDmg = damage * (1 - player.resistances.fire / 100);
    player.hp -= fireDmg;
    player.lastDamageSource = boss.name + '的火焰新星';
    player.invincibleTimer = 0.3;
    createDamageNumber(player.x, player.y - 30, Math.floor(fireDmg), '#ff4400');
    updateUI(); checkPlayerDeath();
  }
  // 火焰粒子效果
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2;
    createParticle(boss.x + Math.cos(angle) * radius * 0.7, boss.y + Math.sin(angle) * radius * 0.7, '#ff4400', 8);
  }
  showNotification(`${boss.name} 释放了火焰新星！`);
}

// Boss 技能：地震波
function bossGroundSlam(boss) {
  syncBossSkillVisual(boss, 'attack', 0.55);

  const radius = boss.slamRadius || 150;
  const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
  if (dist < radius && player.invincibleTimer <= 0) {
    const slamDmg = boss.dmg * 0.8;
    player.hp -= slamDmg;
    player.lastDamageSource = boss.name + '的地震波';
    player.invincibleTimer = 0.5;
    player.slowedTimer = 1.0; // 减速 1 秒
    createDamageNumber(player.x, player.y - 30, Math.floor(slamDmg), '#8b4513');
    updateUI(); checkPlayerDeath();
  }
  // 地震粒子
  for (let i = 0; i < 25; i++) {
    const angle = (i / 25) * Math.PI * 2;
    const r = radius * (0.3 + Math.random() * 0.7);
    createParticle(boss.x + Math.cos(angle) * r, boss.y + Math.sin(angle) * r, '#8b4513', 6);
  }
  showNotification(`${boss.name} 释放了地震波！`);
  AudioSys.play('hit');
}

// Boss 技能：召唤小怪
function bossSummonMinions(boss) {
  syncBossSkillVisual(boss, 'attack', 0.65);

  const count = boss.summonCount || 2;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const spawnDist = 60 + Math.random() * 40;
    let x = boss.x + Math.cos(angle) * spawnDist;
    let y = boss.y + Math.sin(angle) * spawnDist;

    // 避免在墙里生成
    if (isWall(x, y)) continue;

    const minion = EnemyPool.acquire({
      x, y,
      hp: Math.floor(boss.maxHp * 0.1),
      maxHp: Math.floor(boss.maxHp * 0.1),
      dmg: Math.floor(boss.dmg * 0.4),
      speed: 100,
      radius: 12,
      dead: false,
      cooldown: 0,
      name: '召唤物',
      ai: 'chase',
      xpValue: 20,
      frameIndex: 0, // 使用骷髅帧
      isSummon: true // 标记为召唤物，不计入击杀数
    });
    enemies.push(minion);
    // 召唤特效
    for (let j = 0; j < 5; j++) createParticle(x, y, '#00ff00', 5);
  }
  showNotification(`${boss.name} 召唤了援军！`);
}

// Boss 技能：吐息攻击（扇形）
function bossBreathAttack(boss, lockedAngle) {
  syncBossSkillVisual(boss, 'attack', 0.6);

  const range = boss.breathRange || 200;
  const halfAngle = (boss.breathAngle || 60) * Math.PI / 360; // 转为弧度的一半
  const angleToPlayer = typeof lockedAngle === 'number' ? lockedAngle : Math.atan2(player.y - boss.y, player.x - boss.x);

  const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
  if (dist < range && player.invincibleTimer <= 0) {
    // 检查玩家是否在扇形范围内
    const playerAngle = Math.atan2(player.y - boss.y, player.x - boss.x);
    let angleDiff = Math.abs(playerAngle - angleToPlayer);
    if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;

    if (angleDiff <= halfAngle) {
      const breathDmg = boss.dmg * 1.2 * (1 - player.resistances.lightning / 100);
      player.hp -= breathDmg;
      player.lastDamageSource = boss.name + '的吐息';
      player.invincibleTimer = 0.4;
      createDamageNumber(player.x, player.y - 30, Math.floor(breathDmg), '#ffff00');
      updateUI(); checkPlayerDeath();
    }
  }

  // 吐息粒子（扇形）
  for (let i = 0; i < 15; i++) {
    const a = angleToPlayer + (Math.random() - 0.5) * halfAngle * 2;
    const r = range * (0.3 + Math.random() * 0.7);
    createParticle(boss.x + Math.cos(a) * r, boss.y + Math.sin(a) * r, '#ffff00', 6);
  }
  showNotification(`${boss.name} 喷吐了闪电吐息！`);
  AudioSys.play('thunder');
}

// Boss 技能：触手攻击
function bossTentacleAttack(boss, lockedAngle) {
  syncBossSkillVisual(boss, 'attack', 0.5);

  const count = boss.tentacleCount || 4;
  const baseAngle = typeof lockedAngle === 'number' ? lockedAngle : Math.atan2(player.y - boss.y, player.x - boss.x);

  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i - (count - 1) / 2) * 0.3; // 扇形分布
    // 创建触手投射物
    projectiles.push({
      x: boss.x,
      y: boss.y,
      angle: angle,
      speed: 180,
      life: 1.5,
      damage: boss.dmg * 0.6,
      color: '#9966ff',
      owner: boss,
      type: 'tentacle',
      isTentacle: true // 标记为触手
    });
  }
  // 触手粒子
  for (let i = 0; i < 10; i++) createParticle(boss.x, boss.y, '#9966ff', 5);
  showNotification(`${boss.name} 释放了触手！`);
}

// Boss死亡特效：慢动作 + 爆炸粒子 + 巨型伤害数字
function triggerBossDeathEffect(boss, damage) {
  // 启动慢动作
  slowMotion.active = true;
  slowMotion.timer = 0.8;  // 0.8秒慢动作
  slowMotion.scale = 0.15; // 15%速度（非常慢）

  // 强力震屏
  triggerScreenShake(20, 0.6);

  // 播放专属音效（可以复用暗金掉落音效，更史诗）
  AudioSys.play('drop_unique');

  // 巨型伤害数字（红色，更大）
  damageNumbers.push({
    x: boss.x,
    y: boss.y - 50,
    val: `💀 ${Math.floor(damage)} 💀`,
    color: '#ff0000',
    life: 2.5,
    fontSize: 48, // 巨大字体
    vx: (Math.random() - 0.5) * 30,
    vy: -80,
    gravity: 60
  });

  // Boss名字显示
  damageNumbers.push({
    x: boss.x,
    y: boss.y - 100,
    val: `⚔️ ${boss.name} 已被击败 ⚔️`,
    color: '#ffd700',
    life: 3.0,
    fontSize: 28, // 修正为匹配 game.js
    vx: 0,
    vy: -30,      // 修正为匹配 game.js
    gravity: 0    // 修正为匹配 game.js
  });

  // 大量爆炸粒子
  const particleCount = 60;
  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 / particleCount) * i + Math.random() * 0.3;
    const speed = 200 + Math.random() * 300;
    const sparkColor = ['#ff4400', '#ff8800', '#ffcc00', '#ffffff', '#ff0000'][Math.floor(Math.random() * 5)];

    particles.push({
      x: boss.x,
      y: boss.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 100,
      color: sparkColor,
      life: 1.5 + Math.random() * 1.0,
      size: 4 + Math.random() * 6,
      gravity: 150
    });
  }

  // 创建红色光柱
  particles.push({
    type: 'drop_beam',
    x: boss.x,
    y: boss.y,
    color: '#ff4400',
    glowColor: 'rgba(255, 68, 0, 0.6)',
    life: 1.5,
    maxLife: 1.5,
    height: 400,
    width: 80,
    isUnique: true
  });

  // 上升火焰
  for (let i = 0; i < 20; i++) {
    particles.push({
      type: 'rising_spark',
      x: boss.x + (Math.random() - 0.5) * 80,
      y: boss.y,
      vy: -250 - Math.random() * 200,
      color: ['#ff4400', '#ff8800', '#ffcc00'][Math.floor(Math.random() * 3)],
      life: 1.5 + Math.random() * 0.5,
      size: 5 + Math.random() * 4
    });
  }
}

// ========== 精英怪词缀系统 ==========

const ELITE_AFFIXES = [
  {
    id: 'extra_fast',
    name: '额外快速',
    color: '#00ffff',
    icon: 'speed',
    threatTag: 'mobility',
    description: '移动速度+50%',
    applyStats: (enemy) => {
      enemy.speed *= 1.5;
    }
  },
  {
    id: 'extra_strong',
    name: '额外强壮',
    color: '#ff4400',
    icon: 'power',
    threatTag: 'burst',
    description: '伤害+100%',
    applyStats: (enemy) => {
      enemy.dmg *= 2.0;
    }
  },
  {
    id: 'fire_enchanted',
    name: '火焰强化',
    color: '#ff6600',
    icon: 'fire',
    threatTag: 'elemental',
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
    icon: 'cold',
    threatTag: 'control',
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
    icon: 'lightning',
    threatTag: 'elemental',
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
    icon: 'armor',
    threatTag: 'defense',
    description: '受到伤害减少50%',
    applyStats: (enemy) => {
      enemy.damageReduction = 0.5;
    }
  },
  {
    id: 'magic_resistant',
    name: '魔法抗性',
    color: '#aa00ff',
    icon: 'resist',
    threatTag: 'defense',
    description: '技能伤害减免70%',
    applyStats: (enemy) => {
      enemy.magicResist = 0.7;
    }
  },
  {
    id: 'vampiric',
    name: '吸血',
    color: '#cc0000',
    icon: 'leech',
    threatTag: 'sustain',
    description: '攻击回复生命',
    applyStats: (enemy) => {
      enemy.lifeSteal = 0.5;  // 50%吸血
    }
  },
  {
    id: 'mana_burn',
    name: '法力燃烧',
    color: '#0066ff',
    icon: 'mana',
    threatTag: 'resource',
    description: '攻击消耗玩家法力',
    applyStats: (enemy) => {
      enemy.manaBurn = true;
    }
  },
  {
    id: 'cursed',
    name: '诅咒',
    color: '#9900cc',
    icon: 'curse',
    threatTag: 'debuff',
    description: '降低玩家防御',
    applyStats: (enemy) => {
      enemy.cursed = true;
      enemy.curseArmorBreak = 0.25;
      enemy.curseDamageTakenMult = 1.2;
      enemy.curseDuration = 3.0;
    }
  },
  {
    id: 'multiple_shot',
    name: '多重射击',
    color: '#ffaa00',
    icon: 'volley',
    threatTag: 'projectile',
    description: '远程怪物发射3支箭',
    applyStats: (enemy) => {
      enemy.multiShot = 3;
      if (enemy.ai !== 'ranged') enemy.scatterVolley = true;
    }
  },
  {
    id: 'spectral_hit',
    name: '幽灵打击',
    color: '#00ffaa',
    icon: 'spectral',
    threatTag: 'pierce',
    description: '无视护甲',
    applyStats: (enemy) => {
      enemy.ignoreArmor = true;
    }
  }
];
