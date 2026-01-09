// ========== item-system.js - 物品系统模块 ==========
// 包含物品生成、使用、装备、掉落及管理逻辑
// 依赖全局变量：player, enemies, groundItems, SET_ITEMS, BASE_ITEMS, AFFIXES, AudioSys, particles, damageNumbers
// 依赖全局函数：updateUI, renderInventory, renderStash, updateBeltUI, showNotification, trackAchievement, getTalentEffect, triggerScreenShake

// ========== 掉落位置修正工具函数 ==========
// 确保物品掉落位置在可行走的瓦片上，避免A*寻路失败
function ensureValidDropPosition(x, y) {
    const col = Math.floor(x / TILE_SIZE);
    const row = Math.floor(y / TILE_SIZE);

    // 如果在地图内且是墙，找最近的地板
    if (col >= 0 && col < MAP_WIDTH && row >= 0 && row < MAP_HEIGHT && mapData[row][col] === 0) {
        // 在3x3范围内找地板
        for (let radius = 1; radius <= 3; radius++) {
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    const nr = row + dr;
                    const nc = col + dc;
                    if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && mapData[nr][nc] !== 0) {
                        // 返回该瓦片的中心位置
                        return {
                            x: nc * TILE_SIZE + TILE_SIZE / 2,
                            y: nr * TILE_SIZE + TILE_SIZE / 2
                        };
                    }
                }
            }
        }
    }
    // 原位置没问题，直接返回
    return { x, y };
}

// ========== 物品视觉配置 ==========

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
  if (typeof itemSpritesLoaded !== 'undefined' && itemSpritesLoaded) {
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
    if (item.rarity >= RARITY.RARE) {
      el.style.boxShadow = `inset 0 0 5px ${rarityColor}`;
    } else {
      el.style.boxShadow = 'none';
    }
  } else {
    // Fallback text
    el.innerText = item.icon || '📦';
    el.style.backgroundImage = 'none';
    el.style.color = getItemColor(item.rarity);
    el.style.border = `1px solid ${getItemColor(item.rarity)}`;
    el.style.boxShadow = 'none';
  }
}

function getItemColor(r) {
  if (typeof getRarityColor !== 'undefined') {
    return getRarityColor(r);
  }
  // Fallback if constants.js not loaded (should not happen)
  return '#ffffff';
}

// 统计追踪：记录稀有物品发现
function trackItemFound(item) {
  if (!item) return;
  if (item.rarity === RARITY.UNIQUE) { // UNIQUE
    player.stats.uniqueFound++;
  } else if (item.rarity === RARITY.SET) { // SET
    player.stats.setFound++;
  }
}

// ========== 物品生成逻辑 ==========

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
  if (rarity === RARITY.MAGIC) levelReq += 2;  // 魔法
  if (rarity === RARITY.RARE) levelReq += 5;  // 稀有
  if (rarity === RARITY.UNIQUE) levelReq += 10; // 暗金
  if (rarity === RARITY.SET) levelReq += 5;  // 套装（需求低于暗金）

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
    const rand = Math.random(); item.rarity = rand < 0.05 ? RARITY.UNIQUE : rand < 0.2 ? RARITY.RARE : rand < 0.5 ? RARITY.MAGIC : RARITY.NORMAL;
  }
  if (item.rarity >= RARITY.MAGIC) {
    const p = AFFIXES.prefixes[Math.floor(Math.random() * AFFIXES.prefixes.length)];
    item.displayName = p.name + " " + item.name; item.stats[p.stat] = Math.floor(Math.random() * (p.max - p.min)) + p.min;
  }
  if (item.rarity >= RARITY.RARE) {
    const s = AFFIXES.suffixes[Math.floor(Math.random() * AFFIXES.suffixes.length)];
    item.displayName += s.name; item.stats[s.stat] = (item.stats[s.stat] || 0) + Math.floor(Math.random() * (s.max - s.min)) + s.min;
  }
  if (item.rarity === RARITY.UNIQUE) { item.displayName = "暗金·" + item.name; item.stats.allSkills = 1; item.stats.dmgPct = 50; item.stats.lifeSteal = 5; }

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
    setPieceKey: pieceSlot,  // 添加部件槽位标识，用于图鉴追踪
    setName: setData.name,
    rarity: RARITY.SET,  // 套装稀有度为5（绿色）
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
  const requirements = calculateItemRequirements(item, level || 1, RARITY.SET);
  if (requirements) {
    item.requirements = requirements;
  }

  return item;
}

// 随机生成一个套装物品（从所有套装中随机选择）
function generateRandomSetItem(level) {
  const setIds = Object.keys(SET_ITEMS).filter(id => id !== 'abyss_conqueror');
  const randomSetId = setIds[Math.floor(Math.random() * setIds.length)];
  const setData = SET_ITEMS[randomSetId];
  const pieceSlots = Object.keys(setData.pieces);
  const randomSlot = pieceSlots[Math.floor(Math.random() * pieceSlots.length)];

  return createSetItem(randomSetId, randomSlot, level);
}

// ========== 背包与仓库管理 ==========

function addItemToInventory(i) {
  if (i.stackable) {
    const existing = player.inventory.find(invItem => invItem && invItem.name === i.name);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
      renderInventory();
      updateBeltUI();
      AudioSys.play('gold');
      return true;
    }
  }
  const idx = player.inventory.findIndex(x => !x);
  if (idx < 0) return false;
  player.inventory[idx] = i;

  renderInventory();
  updateBeltUI();
  AudioSys.play('gold');

  // 追踪稀有物品发现
  trackItemFound(i);

  // 检查套装收藏成就和图鉴发现
  if (i.setId) {
    if (typeof discoverSetPiece !== 'undefined') discoverSetPiece(i);
    if (typeof checkSetAchievements !== 'undefined') checkSetAchievements();
  }

  // 每日任务：拾取装备（排除消耗品）
  if (typeof DailyQuestSystem !== 'undefined' && i.type !== 'potion' && i.type !== 'scroll' && i.type !== 'gold') {
    DailyQuestSystem.updateProgress('collect_item', 1);
  }

  return true;
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
    if (typeof checkSetAchievements !== 'undefined') checkSetAchievements();
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
    if (typeof checkSetAchievements !== 'undefined') checkSetAchievements();
  }
}

// ========== 物品使用与装备 ==========

function useOrEquipItem(idx) {
  const item = player.inventory[idx]; if (!item) return;

  const shop = document.getElementById('shop-panel');
  if (shop.style.display === 'block') {
    let val = 50;
    if (item.rarity > RARITY.NORMAL) val *= item.rarity * 2;
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
    if (typeof showSellTooltip !== 'undefined') showSellTooltip(idx, val);
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
      if (typeof portalRitual !== 'undefined') {
        portalRitual.active = true;
        portalRitual.phase = 0;
        portalRitual.timer = PORTAL_RITUAL_DURATIONS.casting;
        portalRitual.returnFloor = player.floor;
        portalRitual.scrollIdx = idx;
        portalRitual.flashAlpha = 0;
      }

      // 消耗卷轴
      if (item.quantity > 1) item.quantity--; else player.inventory[idx] = null;

      // 立刻触发光柱效果和音效（不等施法完成）
      if (typeof createPortalBeam !== 'undefined') createPortalBeam(player.x, player.y);
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
      if (typeof updateStats !== 'undefined') updateStats();
    }
  }
  renderInventory();
  if (typeof updateStatsUI !== 'undefined') updateStatsUI();
  updateBeltUI();
}

function useQuickItem(type) {
  let targetName = "";
  if (typeof CONSUMABLE_NAME !== 'undefined') {
    if (type === 'health') targetName = CONSUMABLE_NAME.HEALTH_POTION;
    if (type === 'mana') targetName = CONSUMABLE_NAME.MANA_POTION;
    if (type === 'scroll') targetName = CONSUMABLE_NAME.TOWN_PORTAL;
  } else {
    // Fallback hardcoded values
    if (type === 'health') targetName = '治疗药剂';
    if (type === 'mana') targetName = '法力药剂';
    if (type === 'scroll') targetName = '回城卷轴';
  }

  const idx = player.inventory.findIndex(i => i && i.name === targetName);
  if (idx !== -1) {
    useOrEquipItem(idx);
  } else {
    showNotification("没有该物品!");
  }
}

// ========== 掉落系统 ==========

// 创建掉落光柱特效 (从 game.js 移来)
function createDropBeam(x, y, rarity) {
  const isUnique = rarity === RARITY.UNIQUE;
  const isSet = rarity === RARITY.SET;

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
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 100 + Math.random() * 50,
      color: sparkColor,
      life: 1.0 + Math.random() * 0.5,
      size: 3 + Math.random() * 4,
      gravity: 200
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

  const validPos = ensureValidDropPosition(x, y);
  groundItems.push({
    type: 'gold', val: Math.floor(goldAmount),
    x: validPos.x, y: validPos.y, z: 0,
    vx: (Math.random() - 0.5) * 150,
    vy: (Math.random() - 0.5) * 150,
    vz: 150 + Math.random() * 100,
    bounces: 2,
    soundLand: 'land_gold',
    rarity: RARITY.COMMON, name: Math.floor(goldAmount) + " 金币", icon: '💰', dropTime: Date.now()
  });

  // ========== 消耗品保底机制 ==========
  player.killsSincePotion = (player.killsSincePotion || 0) + 1;
  if (player.killsSincePotion >= 8 || isBoss) {
    // 每8只怪或击杀BOSS必掉消耗品
    const rand = Math.random();
    let dropItem;
    if (rand < 0.6) {
      dropItem = { type: 'potion', name: '治疗药剂', heal: 50, rarity: RARITY.COMMON, stackable: true, count: 1 };
    } else if (rand < 0.88) {
      dropItem = { type: 'potion', name: '法力药剂', mana: 30, rarity: RARITY.COMMON, stackable: true, count: 1 };
    } else {
      dropItem = { type: 'scroll', name: '回城卷轴', rarity: RARITY.COMMON, stackable: true, count: 1 };
    }
    const validPos = ensureValidDropPosition(x, y);
    groundItems.push({
      ...dropItem,
      x: validPos.x, y: validPos.y, z: 0,
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
          if (adjustedRoll < 0.05) { item.rarity = RARITY.UNIQUE; droppedGoodItem = true; }       // 5%+加成 暗金
          else if (adjustedRoll < 0.35) { item.rarity = RARITY.RARE; droppedGoodItem = true; }  // 30%+加成 稀有
          else { item.rarity = RARITY.MAGIC; droppedGoodItem = true; }                           // 保底魔法
        } else if (isElite) {
          // 精英怪
          if (adjustedRoll < 0.015) { item.rarity = RARITY.UNIQUE; droppedGoodItem = true; }      // 1.5% 暗金
          else if (adjustedRoll < 0.12) { item.rarity = RARITY.RARE; droppedGoodItem = true; }  // 10.5% 稀有
          else if (adjustedRoll < 0.45) { item.rarity = RARITY.MAGIC; droppedGoodItem = true; }  // 33% 魔法
          else item.rarity = RARITY.NORMAL;
        } else {
          // 普通怪
          if (adjustedRoll < 0.005) { item.rarity = RARITY.UNIQUE; droppedGoodItem = true; }      // 0.5% 暗金
          else if (adjustedRoll < 0.04) { item.rarity = RARITY.RARE; droppedGoodItem = true; }  // 3.5% 稀有
          else if (adjustedRoll < 0.20) { item.rarity = RARITY.MAGIC; droppedGoodItem = true; }  // 16% 魔法
          else item.rarity = RARITY.NORMAL;
        }

        // 更新显示名称（如果品质被修改）
        if (item.rarity === RARITY.UNIQUE && !item.displayName.startsWith('暗金')) {
          item.displayName = "暗金·" + item.name;
          item.stats.allSkills = (item.stats.allSkills || 0) + 1;
          item.stats.dmgPct = (item.stats.dmgPct || 0) + 50;
          item.stats.lifeSteal = (item.stats.lifeSteal || 0) + 5;
        }
      }

      // 物理掉落初速度
      const angle = (Math.PI * 2 / dropCount) * i + (Math.random() * 0.5 - 0.25);
      const speed = 80 + Math.random() * 60;

      const validPos = ensureValidDropPosition(x, y);
      item.x = validPos.x;
      item.y = validPos.y;
      item.z = 0;
      item.vx = Math.cos(angle) * speed;
      item.vy = Math.sin(angle) * speed;
      item.vz = (item.rarity >= RARITY.UNIQUE ? 200 : 150) + Math.random() * 50;
      item.bounces = 2;
      item.soundLand = 'land_hard';
      item.dropTime = Date.now();
      groundItems.push(item);

      // 暗金/套装掉落特效和成就追踪
      if (item.rarity === RARITY.UNIQUE || item.rarity === RARITY.SET) {
        createDropBeam(item.x, item.y, item.rarity);
        // 成就追踪：收集暗金/套装
        if (item.rarity === RARITY.UNIQUE) trackAchievement('collect_unique');
        if (item.rarity === RARITY.SET) trackAchievement('collect_set_item');
      }
    }
  }

  // ========== BOSS额外掉落（金币堆+药水+回城卷轴） ==========
  if (isBoss) {
    // 金币堆数：3-5堆，每堆数量根据楼层递增
    // 修正逻辑
    const coinStacks = 3 + Math.floor(Math.random() * 3); // 3-5堆
    for (let i = 0; i < coinStacks; i++) {
      let goldAmount;
      if (f <= 10) goldAmount = 100 + Math.floor(Math.random() * 200); // 1-10层：100-300
      else if (f <= 20) goldAmount = 300 + Math.floor(Math.random() * 300); // 11-20层：300-600
      else goldAmount = 500 + Math.floor(Math.random() * 500); // 21层+：500-1000

      const angle = (Math.PI * 2 / coinStacks) * i + (Math.random() * 0.5 - 0.25);
      const speed = 60 + Math.random() * 40;

      const validPos = ensureValidDropPosition(x, y);
      groundItems.push({
        type: 'gold', val: Math.floor(goldAmount),
        x: validPos.x, y: validPos.y, z: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: 120 + Math.random() * 80,
        bounces: 2,
        soundLand: 'land_gold',
        rarity: RARITY.COMMON, name: Math.floor(goldAmount) + " 金币", icon: '💰', dropTime: Date.now()
      });
    }
    // 药水：红蓝各1-2瓶
    const healthPotionCount = 1 + Math.floor(Math.random() * 2); // 1-2瓶
    const manaPotionCount = 1 + Math.floor(Math.random() * 2); // 1-2瓶

    for (let i = 0; i < healthPotionCount; i++) {
      const angle = (Math.PI * 2 / healthPotionCount) * i + (Math.random() * 0.5 - 0.25);
      const speed = 40 + Math.random() * 40;
      const validPos = ensureValidDropPosition(x + Math.cos(angle) * speed, y + Math.sin(angle) * speed);
      groundItems.push({
        type: 'potion', name: '治疗药剂', heal: 50, rarity: RARITY.COMMON, stackable: true, count: 1,
        x: validPos.x, y: validPos.y, z: 0,
        vx: (Math.random() - 0.5) * 80,
        vy: (Math.random() - 0.5) * 80,
        vz: 100 + Math.random() * 50,
        bounces: 2,
        soundLand: 'land_soft',
        dropTime: Date.now()
      });
    }

    for (let i = 0; i < manaPotionCount; i++) {
      const angle = (Math.PI * 2 / manaPotionCount) * i + (Math.random() * 0.5 - 0.25);
      const speed = 40 + Math.random() * 40;
      const validPos = ensureValidDropPosition(x + Math.cos(angle) * speed, y + Math.sin(angle) * speed);
      groundItems.push({
        type: 'potion', name: '法力药剂', mana: 30, rarity: RARITY.COMMON, stackable: true, count: 1,
        x: validPos.x, y: validPos.y, z: 0,
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
      const angle = (Math.PI * 2 / scrollCount) * i + (Math.random() * 0.5 - 0.25);
      const speed = 40 + Math.random() * 40;
      const validPos = ensureValidDropPosition(x + Math.cos(angle) * speed, y + Math.sin(angle) * speed);
      groundItems.push({
        type: 'scroll', name: '回城卷轴', rarity: RARITY.COMMON, stackable: true, count: 1,
        x: validPos.x, y: validPos.y, z: 0,
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
    player.luckAccumulator = 0;
  } else {
    player.luckAccumulator = Math.min((player.luckAccumulator || 0) + 1, 50);
  }

  if (typeof updateWorldLabels !== 'undefined') updateWorldLabels();
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
