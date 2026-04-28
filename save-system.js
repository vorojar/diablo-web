// ========== save-system.js - 存档系统模块 ==========
// 从 game.js 拆分出来，负责 IndexedDB 存档管理

// IndexedDB 配置
const DB_NAME = 'DiabloCloneDB';
const DB_VERSION = 8;
let db;

// 存档数据版本（用于数据迁移）
const SAVE_DATA_VERSION = 2;  // v2: 新增统一伤害系统、护甲公式改进

// ========== 属性系统迁移函数 ==========
// 将旧版本的基础属性(str/dex/vit/ene)转换为直接效果属性
function migrateItemStats() {
  let migratedCount = 0;

  // 迁移单个物品
  function migrateItem(item) {
    if (!item || !item.stats) return false;
    let migrated = false;

    // str → dmgPct (×5)
    if (item.stats.str) {
      item.stats.dmgPct = (item.stats.dmgPct || 0) + item.stats.str * 5;
      delete item.stats.str;
      migrated = true;
    }

    // vit → maxHp (×5)
    if (item.stats.vit) {
      item.stats.maxHp = (item.stats.maxHp || 0) + item.stats.vit * 5;
      delete item.stats.vit;
      migrated = true;
    }

    // ene → maxMp (×3)
    if (item.stats.ene) {
      item.stats.maxMp = (item.stats.maxMp || 0) + item.stats.ene * 3;
      delete item.stats.ene;
      migrated = true;
    }

    // dex → def + critChance
    if (item.stats.dex) {
      item.stats.def = (item.stats.def || 0) + item.stats.dex;
      item.stats.critChance = (item.stats.critChance || 0) + item.stats.dex * 0.5;
      delete item.stats.dex;
      migrated = true;
    }

    // mpRegen 迁移：旧版是固定值(30-100)，新版是百分比(3-10%)
    // 检测：如果 > 20，说明是旧版固定值，除以10转为百分比
    if (item.stats.mpRegen && item.stats.mpRegen > 20) {
      item.stats.mpRegen = Math.round(item.stats.mpRegen / 10);
      migrated = true;
    }

    return migrated;
  }

  // 迁移背包物品
  player.inventory.forEach(item => {
    if (migrateItem(item)) migratedCount++;
  });

  // 迁移仓库物品
  player.stash.forEach(item => {
    if (migrateItem(item)) migratedCount++;
  });

  // 迁移已装备物品
  Object.values(player.equipment).forEach(item => {
    if (migrateItem(item)) migratedCount++;
  });

  if (migratedCount > 0) {
    console.log(`[属性迁移] 已转换 ${migratedCount} 件物品的旧属性`);
    showNotification(`已自动升级 ${migratedCount} 件装备属性`);
  }
}

const SaveSystem = {
  currentSlot: 1,  // 当前使用的存档槽位
  MAX_SLOTS: 3,    // 最大存档数
  isReady: false,  // IndexedDB是否初始化完成

  init: function () {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('saveData')) database.createObjectStore('saveData', { keyPath: 'id' });
    };
    req.onsuccess = e => {
      db = e.target.result;
      this.migrateOldSave().then(() => {
        this.loadAllSlotsMeta();
        // 标记为就绪，激活开始按钮
        this.setReady();
      });
    };
    req.onerror = e => {
      console.error("DB Init Failed", e);
      // 即使失败也标记为就绪（允许新建角色）
      this.setReady();
    };
  },

  // 设置存档系统就绪状态
  setReady: function () {
    this.isReady = true;
    this.tryActivateStartButton();
    console.log('[存档系统] 初始化完成');
  },

  // 尝试激活开始按钮（需要本地存档和云同步都就绪）
  tryActivateStartButton: function () {
    const cloudReady = typeof CloudSync !== 'undefined' ? CloudSync.isReady : true;
    if (!this.isReady || !cloudReady) return;

    const startBtn = document.querySelector('.start-btn');
    if (startBtn) {
      startBtn.classList.remove('disabled');
      startBtn.disabled = false;
    }
  },

  // 迁移旧存档到槽位1
  migrateOldSave: async function () {
    return new Promise((resolve) => {
      if (!db) { resolve(); return; }
      const tx = db.transaction(['saveData'], 'readonly');
      const store = tx.objectStore('saveData');

      // 检查是否有旧格式存档
      const oldReq = store.get('player1');
      oldReq.onsuccess = (e) => {
        const oldData = e.target.result;
        if (oldData && !oldData.slotId) {
          // 旧存档存在且未迁移，迁移到槽位1
          const newData = { ...oldData, id: 'slot_1', slotId: 1 };
          const writeTx = db.transaction(['saveData'], 'readwrite');
          const writeStore = writeTx.objectStore('saveData');
          writeStore.put(newData);
          writeStore.delete('player1');  // 删除旧存档
          writeTx.oncomplete = () => {
            console.log('[存档迁移] 已将旧存档迁移到槽位1');
            resolve();
          };
        } else {
          resolve();
        }
      };
      oldReq.onerror = () => resolve();
    });
  },

  // 加载所有槽位的元数据（用于显示存档选择界面）
  loadAllSlotsMeta: function () {
    if (!db) return;
    window.saveSlots = [null, null, null];  // 3个槽位

    const tx = db.transaction(['saveData'], 'readonly');
    const store = tx.objectStore('saveData');

    for (let i = 1; i <= this.MAX_SLOTS; i++) {
      const req = store.get(`slot_${i}`);
      req.onsuccess = (e) => {
        if (e.target.result) {
          const data = e.target.result;
          const pb = data.personalBest || {};
          window.saveSlots[i - 1] = {
            slotId: i,
            level: data.lvl || 1,
            kills: data.kills || 0,
            gold: data.gold || 0,
            maxFloor: pb.maxFloor || data.floor || 0,
            maxHellFloor: pb.maxHellFloor || 0,
            lastPlayed: data.lastPlayed || Date.now(),
            hasData: true
          };
        }
        // 当所有槽位都检查完毕后，更新UI
        if (i === this.MAX_SLOTS) {
          this.updateStartScreenStatus();
        }
      };
    }
  },

  // 更新开始界面状态
  updateStartScreenStatus: function () {
    const statusEl = document.getElementById('save-status');
    const hasAnySave = window.saveSlots && window.saveSlots.some(s => s && s.hasData);
    if (hasAnySave) {
      const filledSlots = window.saveSlots.filter(s => s && s.hasData).length;
      statusEl.innerHTML = `发现 ${filledSlots} 个存档`;
    } else {
      statusEl.innerHTML = '';
    }
  },

  // 保存到当前槽位
  save: function (silent = false) {
    if (!db) return Promise.resolve(false);
    const clean = i => { if (!i) return null; const { el, ...r } = i; return r; };
    const eq = {}; for (let k in player.equipment) eq[k] = clean(player.equipment[k]);

    // 更新在线时间（用于离线收益计算）
    player.lastOnlineTime = Date.now();

    // 同时写入 localStorage（同步，可靠）作为备份
    localStorage.setItem(`lastOnlineTime_slot${this.currentSlot}`, player.lastOnlineTime.toString());

    const data = {
      id: `slot_${this.currentSlot}`,
      slotId: this.currentSlot,
      saveVersion: SAVE_DATA_VERSION,  // 存档版本号，用于数据迁移
      ...player,
      inventory: player.inventory.map(clean),
      equipment: eq,
      stash: player.stash.map(clean),
      targetItem: clean(player.targetItem),
      townPortal: townPortal,
      settings: Settings,
      autoBattleSettings: AutoBattle.settings,
      lastPlayed: Date.now()
    };
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(['saveData'], 'readwrite');
        tx.objectStore('saveData').put(data);
        tx.oncomplete = () => {
          // 自动同步到云端（静默、防抖），确保本地事务完成后再触发
          if (typeof CloudSync !== 'undefined' && CloudSync.isBound) {
            CloudSync.uploadSlotDebounced(this.currentSlot);
          }
          resolve(true);
        };
        tx.onerror = () => {
          console.error('[存档系统] 保存失败:', tx.error);
          if (!silent && typeof showNotification === 'function') {
            showNotification('存档失败，请检查浏览器存储权限');
          }
          resolve(false);
        };
        tx.onabort = () => {
          console.error('[存档系统] 保存中止:', tx.error);
          resolve(false);
        };
      } catch (e) {
        console.error('[存档系统] 保存异常:', e);
        if (!silent && typeof showNotification === 'function') {
          showNotification('存档失败，请检查浏览器存储权限');
        }
        resolve(false);
      }
    });

    // 静默存档，不显示提示（原：if (!silent) showNotification("游戏已保存");）
  },

  // 加载指定槽位
  loadSlot: function (slotId) {
    return new Promise((resolve) => {
      if (!db) { resolve(null); return; }
      this.currentSlot = slotId;
      db.transaction(['saveData']).objectStore('saveData').get(`slot_${slotId}`).onsuccess = e => {
        if (e.target.result) {
          window.pendingLoadData = e.target.result;

          // Load Settings
          if (e.target.result.settings) {
            Object.assign(Settings, e.target.result.settings);
            document.getElementById('chk-bgm').checked = Settings.bgm;
            document.getElementById('chk-sfx').checked = Settings.sfx;
          }
          resolve(e.target.result);
        } else {
          window.pendingLoadData = null;
          resolve(null);
        }
      };
    });
  },

  // 删除指定槽位
  deleteSlot: function (slotId) {
    return new Promise((resolve) => {
      if (!db) { resolve(); return; }
      const tx = db.transaction(['saveData'], 'readwrite');
      tx.objectStore('saveData').delete(`slot_${slotId}`);
      tx.oncomplete = () => {
        if (window.saveSlots) window.saveSlots[slotId - 1] = null;
        resolve();
      };
    });
  },

  // 兼容旧代码的load方法
  load: function () {
    this.loadAllSlotsMeta();
  },

  // 重置当前槽位
  reset: function () {
    if (db) {
      this.deleteSlot(this.currentSlot).then(() => {
        location.reload();
      });
    }
  }
};
