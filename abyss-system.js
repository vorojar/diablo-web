// ========== abyss-system.js - 深渊挑战系统 ==========
// 负责深渊模式的核心逻辑：状态管理、积分计算、周重置、天赋奖励

const AbyssSystem = {
  // 状态
  isActive: false,       // 是否在深渊中
  currentFloor: 0,       // 当前深渊层数
  startTime: 0,          // 本次挑战开始时间
  score: 0,              // 当前积分
  currentChampion: null, // 本周王者昵称
  selectedContracts: [], // 已选择的契约ID
  totalMultiplier: 1.0,  // 总积分倍率


  // 配置
  BASE_LEVEL: 50,        // 积分计算基准等级
  MIN_LEVEL: 20,         // 进入门槛

  // 契约配置
  CONTRACTS: {
    'low_hp': { name: '贫血契约', icon: '🩸', desc: '最大生命降低 30%', multiplier: 0.3 },
    'glass_cannon': { name: '脆皮契约', icon: '🛡️', desc: '防御力降低 50%', multiplier: 0.4 },
    'slow_motion': { name: '慢速契约', icon: '👣', desc: '移动速度降低 20%', multiplier: 0.2 },
    'elemental_curse': { name: '元素契约', icon: '🔥', desc: '全抗性降低 40%', multiplier: 0.5 },
    'vampire_bane': { name: '绝愈契约', icon: '💉', desc: '生命偷取无效', multiplier: 0.4 }
  },

  // 赛区配置
  BRACKETS: [
    { id: 'rookie', name: '新秀赛', range: [20, 30], icon: '🌱' },
    { id: 'elite', name: '精英赛', range: [31, 50], icon: '⚔️' },
    { id: 'peak', name: '巅峰赛', range: [51, 999], icon: '🔥' }
  ],
  currentLeaderboardBracket: null, // 当前查看的赛区ID


  // 初始化
  init() {
    this.checkWeeklyReset();
    this.updatePlayerTitle(); // 启动时更新称号
  },

  // 根据排名更新玩家称号（同时同步服务器最佳记录）
  updatePlayerTitle() {
    if (typeof OnlineSystem === 'undefined' || !OnlineSystem.getAbyssLeaderboard) return;

    // 获取我对应的赛区范围
    const myBracket = this.BRACKETS.find(b => player.lvl >= b.range[0] && player.lvl <= b.range[1]) || this.BRACKETS[this.BRACKETS.length - 1];

    OnlineSystem.getAbyssLeaderboard((data) => {
      if (data.error) return;

      // 同步我的最佳记录（从服务器获取）
      const myRecord = data.list.find(r => r.isSelf);
      if (myRecord) {
        const localScore = parseInt(localStorage.getItem('abyss_best_score') || '0');
        // 如果服务器分数更高，同步到本地
        if (myRecord.score > localScore) {
          localStorage.setItem('abyss_best_score', myRecord.score);
          localStorage.setItem('abyss_best_floor', myRecord.floor);
          console.log(`[Abyss] 从${myBracket.name}同步最佳记录:`, myRecord.score, '分', myRecord.floor, '层');
        }
      }

      // 获取本赛区王者（第1名）
      if (data.list.length > 0) {
        this.currentChampion = data.list[0].name;
      } else {
        this.currentChampion = null;
      }

      // 注意：这里的 data.myRank 是该赛区内的排名
      const rank = data.myRank;

      if (rank <= 0) {
        player.abyssTitle = null;
        localStorage.setItem('abyss_last_rank', 0);
        return;
      }

      // 保存赛区排名用于周结算
      localStorage.setItem('abyss_last_rank', rank);

      // 根据赛区排名更新分赛区称号
      if (rank === 1) {
        player.abyssTitle = `${myBracket.name}王`;
      } else if (rank <= 3) {
        player.abyssTitle = `${myBracket.name}领主`;
      } else if (rank <= 10) {
        player.abyssTitle = `${myBracket.name}精英`;
      } else if (rank <= 50) {
        player.abyssTitle = `${myBracket.name}行者`;
      } else {
        player.abyssTitle = null;
      }

      console.log(`[Abyss] ${myBracket.name}称号更新:`, player.abyssTitle, '排名:', rank);
    }, myBracket.range[0], myBracket.range[1]);
  },

  // 检查周重置（每周一 00:00）
  checkWeeklyReset() {
    const now = new Date();
    const lastReset = parseInt(localStorage.getItem('abyss_last_reset') || '0');

    // 获取本周一 00:00 的时间戳
    const day = now.getDay() || 7; // 周日是0，改为7
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - day + 1);
    const resetTime = monday.getTime();

    if (lastReset < resetTime) {
      // 需要重置
      console.log("[Abyss] 执行深渊周重置...");

      // 发放上周奖励（根据存储的排名）
      const lastRank = parseInt(localStorage.getItem('abyss_last_rank') || '0');
      if (lastRank > 0 && lastRank <= 50) {
        this.distributeWeeklyReward(lastRank);
      }

      // 重置记录
      localStorage.setItem('abyss_last_reset', resetTime);
      localStorage.setItem('abyss_best_floor', 0);
      localStorage.setItem('abyss_best_score', 0);
      localStorage.setItem('abyss_last_rank', 0);
    }
  },

  // 发放周榜奖励
  distributeWeeklyReward(rank) {
    const setData = SET_ITEMS['abyss_conqueror'];
    if (!setData) return;

    const pieceKeys = Object.keys(setData.pieces);
    let rewardPieceKeys = [];

    if (rank === 1) rewardPieceKeys = pieceKeys;
    else if (rank <= 3) rewardPieceKeys = this.shuffleArray([...pieceKeys]).slice(0, 3);
    else if (rank <= 10) rewardPieceKeys = this.shuffleArray([...pieceKeys]).slice(0, 2);
    else if (rank <= 50) rewardPieceKeys = this.shuffleArray([...pieceKeys]).slice(0, 1);

    // 空间检查：背包 + 仓库的空闲格数
    const freeInventorySlots = player.inventory.filter(slot => !slot).length;
    const freeStashSlots = player.stash.filter(slot => !slot).length;
    const totalFreeSlots = freeInventorySlots + freeStashSlots;

    if (totalFreeSlots < rewardPieceKeys.length) {
      // 空间不足，弹出警告面板，不清除状态
      this.showRewardPanel(rank, `🎒 空间不足！需要 ${rewardPieceKeys.length} 个空位`, [], true);
      return;
    }

    // 空间充足，开始发放
    const receivedItems = [];
    rewardPieceKeys.forEach(pieceKey => {
      const piece = setData.pieces[pieceKey];
      const item = this.createSetItem('abyss_conqueror', pieceKey, piece);
      if (item) {
        // 优先背包，其次仓库
        if (!addItemToInventory(item)) {
          const stashIdx = player.stash.findIndex(slot => !slot);
          if (stashIdx !== -1) player.stash[stashIdx] = item;
        }
        receivedItems.push(piece.name);
      }
    });

    // 成功领取，清除榜单记录防止重复领取
    localStorage.setItem('abyss_last_rank', 0);
    // 记录本次结算时间戳，防止同周内重复触发
    const now = new Date();
    const day = now.getDay() || 7;
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - day + 1);
    localStorage.setItem('abyss_last_reset', monday.getTime());

    // 显示成功面板
    const rewardTitle = rank === 1 ? '🔥 恭喜！上周深渊第1名，获得全套深渊征服者套装！' :
      rank <= 3 ? '⚔️ 上周深渊前3名，获得3件深渊征服者套装！' :
        rank <= 10 ? '💀 上周深渊前10名，获得2件深渊征服者套装！' :
          '🌑 上周深渊前50名，获得1件深渊征服者套装！';

    this.showRewardPanel(rank, rewardTitle, receivedItems, false);
  },

  // 显示周结算奖励面板
  showRewardPanel(rank, title, items, isFull = false) {
    const old = document.getElementById('abyss-reward-panel');
    if (old) old.remove();

    const titleIcon = isFull ? '⚠️' : (rank === 1 ? '👑' : rank <= 3 ? '⚔️' : rank <= 10 ? '💀' : '🌑');
    const titleColor = isFull ? '#ff4444' : (rank === 1 ? '#ffcc00' : rank <= 3 ? '#ff6666' : rank <= 10 ? '#aa66ff' : '#888888');

    let contentHtml = '';
    if (isFull) {
      contentHtml = `
        <div style="background: rgba(100,0,0,0.3); border: 1px solid #f44; border-radius: 8px; padding: 20px; margin: 15px 0; color: #ff9999; line-height: 1.6;">
          ${title}<br>请清理背包或仓库后再找<b>深渊守卫</b>领取！
        </div>
      `;
    } else {
      const itemsHtml = items.map(name =>
        `<div style="background: rgba(0,100,0,0.2); border: 1px solid #4a4; border-radius: 4px; padding: 8px 12px; margin: 5px 0; color: #88ff88;">
          🎁 ${name}
        </div>`
      ).join('');
      contentHtml = `
        <div style="font-size: 14px; color: #ffcc00; margin-bottom: 20px;">${title}</div>
        <div style="background: rgba(30,30,30,0.8); border: 1px solid #444; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <div style="color: #aaa; font-size: 12px; margin-bottom: 10px;">已存入背包/仓库：</div>
          ${itemsHtml}
        </div>
      `;
    }

    const html = `
      <div class="panel-header">
        ${titleIcon} 深渊锦标赛结算 ${titleIcon}
        <div class="panel-close" onclick="AbyssSystem.closeRewardPanel()"></div>
      </div>
      <div class="panel-content" style="padding: 25px; text-align: center;">
        <div style="font-size: 20px; color: ${titleColor}; margin-bottom: 15px;">
          🏆 上周排名: 第 ${rank} 名
        </div>
        ${contentHtml}
        <div style="margin-top: 20px;">
          <button class="abyss-btn" style="width: 100%;" 
            onclick="AbyssSystem.closeRewardPanel()">
            ${isFull ? '去腾空间' : '✨ 确定'}
          </button>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.id = 'abyss-reward-panel';
    div.className = 'panel active';
    div.style.cssText = 'position:fixed; top:50%; left:50%; width:320px; z-index:3000; box-shadow: 0 0 50px rgba(255,100,100,0.5);';
    div.innerHTML = html;
    document.body.appendChild(div);

    // 弹入动画
    if (typeof GSAPAnims !== 'undefined') {
      GSAPAnims.panelIn(div, 'center');
    }

    // 播放音效
    if (typeof AudioSys !== 'undefined') {
      AudioSys.play('levelup');
    }
  },

  // 关闭奖励面板
  closeRewardPanel() {
    const el = document.getElementById('abyss-reward-panel');
    if (!el) return;
    if (typeof GSAPAnims !== 'undefined') {
      GSAPAnims.panelOut(el, () => el.remove());
    } else {
      el.remove();
    }
  },

  // 创建套装物品
  createSetItem(setId, pieceKey, pieceData) {
    return {
      id: `${setId}_${pieceKey}_${Date.now()}`,
      name: pieceData.name,
      icon: pieceData.icon,
      type: pieceData.type,
      rarity: 'set',
      setId: setId,
      setPieceKey: pieceKey,
      def: pieceData.def || 0,
      minDmg: pieceData.minDmg || 0,
      maxDmg: pieceData.maxDmg || 0,
      stats: { ...pieceData.stats },
      level: player.lvl
    };
  },

  // 数组洗牌
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  // 进入深渊
  enter() {
    if (player.lvl < this.MIN_LEVEL) {
      showNotification(`等级不足！需要 ${this.MIN_LEVEL} 级才能挑战深渊`);
      return;
    }

    this.isActive = true;
    this.currentFloor = 1;
    this.startTime = Date.now();
    this.score = 0;

    // 应用选中的契约统计倍率
    this.calculateMultiplier();


    // 设置玩家状态
    player.isInHell = true; // 复用地狱标识，用于怪物强度
    player.hellFloor = 1;

    // 禁用自动战斗
    if (typeof AutoBattle !== 'undefined') {
      AutoBattle.enabled = false;
    }

    // 切换场景
    enterFloor(1); // 复用现有的进入楼层逻辑

    // 播放音效和提示
    AudioSys.play('hell_enter');
    showNotification("🔥以此身躯，挑战深渊！禁自动战斗！", 5000);

    // 更新UI
    if (typeof updateWorldLabels !== 'undefined') updateWorldLabels();
  },

  // 离开深渊（死亡或放弃）
  exit(isDeath = false) {
    if (!this.isActive) return;

    const duration = (Date.now() - this.startTime) / 1000;
    this.calculateScore(duration);

    // 记录最佳成绩
    const bestScore = parseInt(localStorage.getItem('abyss_best_score') || '0');
    console.log('[Abyss] 本次得分:', this.score, '历史最高:', bestScore);

    if (this.score > bestScore) {
      localStorage.setItem('abyss_best_score', this.score);
      localStorage.setItem('abyss_best_floor', this.currentFloor);
      console.log('[Abyss] 新纪录！准备上传...');

      // 提交分数到云端
      if (typeof OnlineSystem !== 'undefined' && OnlineSystem.submitAbyssScore) {
        OnlineSystem.submitAbyssScore(this.score, this.currentFloor);
        // 延迟更新称号（等待服务器响应）
        setTimeout(() => this.updatePlayerTitle(), 1500);
      } else {
        console.warn('[Abyss] OnlineSystem.submitAbyssScore 未定义！');
      }
    } else {
      console.log('[Abyss] 未打破记录，不上传');
    }

    // 显示结算面板
    this.showResultPanel(isDeath, duration);

    // 重置状态
    this.isActive = false;
    player.isInHell = false;

    // 返回营地
    if (typeof enterFloor === 'function') {
      enterFloor(0, 'end');
      // 设置玩家位置在深渊守卫附近（dungeonEntrance.x - 150, dungeonEntrance.y + 50）
      if (typeof dungeonEntrance !== 'undefined') {
        player.x = dungeonEntrance.x - 120;
        player.y = dungeonEntrance.y + 80;
      }
    }
    if (typeof updateHellIndicator === 'function') {
      updateHellIndicator();
    }

    // 关键：重置契约并刷新属性，确保回到营地后数值完全恢复原状
    this.selectedContracts = [];
    if (typeof updateStats === 'function') updateStats();
    if (typeof updateStatsUI === 'function') updateStatsUI();
  },

  // 计算积分
  // 挑战分 = 到达层数 × 100 + (基准等级 - 实际等级) × 50 - 用时秒数 × 0.1
  calculateScore(durationSeconds) {
    const floorScore = this.currentFloor * 100;
    const levelBonus = Math.max(0, (this.BASE_LEVEL - player.lvl) * 50);
    const timePenalty = Math.floor(durationSeconds * 0.1);

    // 基础积分
    let baseScore = floorScore + levelBonus - timePenalty;
    if (baseScore < 0) baseScore = 0;

    // 应用契约倍率
    this.score = Math.floor(baseScore * this.totalMultiplier);

    console.log('[Abyss] 积分计算详情:');
    console.log('  基础积分:', baseScore);
    console.log('  契约倍率: x' + this.totalMultiplier.toFixed(2));
    console.log('  最终总分:', this.score);

    return this.score;
  },

  // 计算当前总倍率
  calculateMultiplier() {
    let m = 1.0;
    this.selectedContracts.forEach(id => {
      const c = this.CONTRACTS[id];
      if (c) m += c.multiplier;
    });
    this.totalMultiplier = m;
    return m;
  },

  // 切换契约选择
  toggleContract(id) {
    const idx = this.selectedContracts.indexOf(id);
    if (idx >= 0) {
      this.selectedContracts.splice(idx, 1);
    } else {
      this.selectedContracts.push(id);
    }
    this.updateContractUI();

    // 立即刷新属性，让玩家看到实时反馈（如血量下降）
    if (typeof updateStats === 'function') updateStats();
    if (typeof updateStatsUI === 'function') updateStatsUI();
  },

  // 更新契约面板UI内容
  updateContractUI() {
    const listEl = document.getElementById('contract-list');
    if (!listEl) return;

    let html = '';
    for (let id in this.CONTRACTS) {
      const c = this.CONTRACTS[id];
      const selected = this.selectedContracts.includes(id);
      html += `
        <div class="contract-item ${selected ? 'selected' : ''}" onmousedown="event.stopPropagation(); AbyssSystem.toggleContract('${id}')">
          <div class="contract-icon">${c.icon}</div>
          <div class="contract-info">
            <div class="contract-name">${c.name}</div>
            <div class="contract-desc">${c.desc}</div>
          </div>
          <div class="contract-multiplier">+${(c.multiplier * 100).toFixed(0)}%</div>
        </div>
      `;
    }
    listEl.innerHTML = html;

    const m = this.calculateMultiplier();
    const mEl = document.getElementById('total-multiplier-val');
    if (mEl) mEl.innerText = m.toFixed(2);
  },

  // 显示契约选择面板
  showContractPanel() {
    console.log('[Abyss] Opening contract panel...');
    try {
      this.closeEntrancePanel();
      this.selectedContracts = []; // 每次进入前重置选择

      let panel = document.getElementById('abyss-contract-panel');
      if (panel) panel.remove();

      panel = document.createElement('div');
      panel.id = 'abyss-contract-panel';
      panel.className = 'panel active';
      panel.onmousedown = (e) => e.stopPropagation();
      panel.style.cssText = 'position:fixed; top:50%; left:50%; width:320px; z-index:2500;';

      panel.innerHTML = `
      <div class="panel-header">
        📜 签订深渊契约
        <div class="panel-close" onclick="AbyssSystem.closeContractPanel()"></div>
      </div>
      <div class="panel-content" style="padding:20px;">
        <div style="color:#aaa; font-size:12px; margin-bottom:15px; text-align:center;">
          难度越高，积分倍率越高。挑战极速冲榜！
        </div>
        
        <div id="contract-list" class="contract-list-scroll">
          <!-- 契约项列表 -->
        </div>

        <div style="margin: 15px 0; padding:10px; background:rgba(0,0,0,0.3); border:1px solid #444; border-radius:4px; display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#aaa;">当前总倍率:</span>
          <span style="color:#ffcc00; font-size:20px; font-weight:bold;">x<span id="total-multiplier-val">1.00</span></span>
        </div>

        <button class="abyss-btn" style="width:100%; margin-top: 10px;" onclick="AbyssSystem.enter(); AbyssSystem.closeContractPanel(true)">
          🔥 签订契约并开启挑战
        </button>
      </div>
    `;
      document.body.appendChild(panel);
      this.updateContractUI();

      // 弹入动画
      if (typeof GSAPAnims !== 'undefined') {
        GSAPAnims.panelIn(panel, 'center');
      }
    } catch (e) {
      console.error('[Abyss] Error in showContractPanel:', e);
    }
  },

  // 关闭契约面板并重置（取消选择）
  closeContractPanel(isStarting = false) {
    const el = document.getElementById('abyss-contract-panel');
    if (el) {
      if (typeof GSAPAnims !== 'undefined') {
        GSAPAnims.panelOut(el, () => el.remove());
      } else {
        el.remove();
      }
    }
    if (!isStarting) {
      this.selectedContracts = []; // 清空选择
      // 立即刷新属性（恢复状态）
      if (typeof updateStats === 'function') updateStats();
      if (typeof updateStatsUI === 'function') updateStatsUI();
    }
  },

  // 完成当前层（到达下一层入口）
  onFloorComplete() {
    // 强制弹出天赋商店（免费模式）
    if (typeof showTalentShop !== 'undefined') {
      showTalentShop(this.currentFloor + 1, true, true); // true = 免费模式
    } else {
      // 如果没有天赋系统，直接进下一层
      this.proceedToNextFloor();
    }
  },

  // 实际进入下一层（选完天赋后调用）
  proceedToNextFloor() {
    this.currentFloor++;
    player.hellFloor = this.currentFloor;

    // 播放过层音效
    AudioSys.play('portal');

    // 进入新楼层
    enterFloor(player.floor + 1); // 这里的参数其实在深渊模式下不影响生成的层数，主要触发重绘

    showNotification(`深渊第 ${this.currentFloor} 层`);

    // 保存进度
    // (目前设计一命通关，暂不存)
  },

  // 打开排行榜
  openLeaderboard() {
    // 检查OnlineSystem
    if (typeof OnlineSystem === 'undefined' || !OnlineSystem.getAbyssLeaderboard) {
      showNotification('排行榜系统暂未连接');
      return;
    }

    // 创建或获取面板
    let panel = document.getElementById('abyss-leaderboard-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'abyss-leaderboard-panel';
      panel.className = 'panel';
      panel.style.cssText = 'position:fixed; top:50%; left:50%; width:320px; z-index:2100;';
      panel.innerHTML = `
            <div class="panel-header">🏆 深渊排行榜 <div class="panel-close" onclick="AbyssSystem.closeLeaderboard()"></div></div>
            
            <!-- 赛区切换页签 -->
            <div class="leaderboard-tabs" id="lb-bracket-tabs">
                ${this.BRACKETS.map(b => `
                    <div class="lb-tab" id="tab-${b.id}" onclick="AbyssSystem.switchBracket('${b.id}')">
                        ${b.icon} ${b.name}
                    </div>
                `).join('')}
            </div>

            <div class="lb-my-rank" id="lb-my-rank-container">
                <div>
                    <div style="color:#aaa; font-size:12px;" id="lb-bracket-title">我的排名</div>
                    <div style="color:#fff; font-size:16px;" id="lb-my-rank-val">加载中...</div>
                </div>
                <!-- 殿堂记录 Banner -->
                <div id="lb-bracket-rank" style="background: linear-gradient(90deg, #530, #840); padding: 5px 15px; border-radius: 4px; border:1px solid #d80; display:none;">
                    👑 赛区第 <span id="lb-bracket-val" style="color:#ff0; font-size:18px; font-weight:bold;">1</span> 名
                </div>
            </div>
            <div class="lb-list" id="lb-container" style="flex:1; overflow-y:auto; padding:10px;">
                <div style="text-align:center; padding:50px;">加载中...</div>
            </div>
          `;
      document.body.appendChild(panel);
    }

    panel.classList.add('active');

    // 弹入动画
    if (typeof GSAPAnims !== 'undefined') {
      GSAPAnims.panelIn(panel, 'center');
    }

    // 默认打开玩家当前等级所属的赛区
    if (!this.currentLeaderboardBracket) {
      const playerBracket = this.BRACKETS.find(b => player.lvl >= b.range[0] && player.lvl <= b.range[1]) || this.BRACKETS[this.BRACKETS.length - 1];
      this.currentLeaderboardBracket = playerBracket.id;
    }

    this.switchBracket(this.currentLeaderboardBracket);
  },

  // 切换赛区
  switchBracket(bracketId) {
    this.currentLeaderboardBracket = bracketId;
    const bracket = this.BRACKETS.find(b => b.id === bracketId);
    if (!bracket) return;

    // 更新页签样式
    this.BRACKETS.forEach(b => {
      const tab = document.getElementById(`tab-${b.id}`);
      if (tab) tab.classList.toggle('active', b.id === bracketId);
    });

    // 拉取数据
    const container = document.getElementById('lb-container');
    container.innerHTML = '<div style="text-align:center; padding:50px; color:#666;">⏳ 正在穿越位面...</div>';

    document.getElementById('lb-bracket-title').innerText = `${bracket.name}·我的排名`;

    OnlineSystem.getAbyssLeaderboard((data) => {
      const myRankEl = document.getElementById('lb-my-rank-val');
      const bracketEl = document.getElementById('lb-bracket-rank');
      const bracketVal = document.getElementById('lb-bracket-val');

      // 更新我的信息
      if (data.myRank > 0) {
        myRankEl.innerHTML = `#${data.myRank} <span style="color:#fa0; font-size:14px;">(${localStorage.getItem('abyss_best_score')}分)</span>`;
      } else {
        myRankEl.innerText = "暂无成绩";
      }

      // 渲染列表
      if (data.list.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:50px; color:#666;">该赛区空谷幽兰，暂无高手<br><span style="font-size:12px; color:#444;">(${bracket.range[0]}-${bracket.range[1]}级)</span></div>`;
        return;
      }

      container.innerHTML = data.list.map(item => `
        <div class="lb-item ${item.isSelf ? 'self' : ''}">
            <div class="lb-item-rank ${item.rank <= 3 ? 'top' + item.rank : ''}">${item.rank}</div>
            <div class="lb-item-info">
                <div class="lb-item-name">${item.name} <span style="color:#666; font-size:11px;">Lv.${item.lvl}</span></div>
            </div>
            <div style="text-align:right">
                <div class="lb-item-score">${item.score}</div>
                <div class="lb-item-floor">深渊第${item.floor}层</div>
            </div>
        </div>
      `).join('');
    }, bracket.range[0], bracket.range[1]);
  },

  closeLeaderboard() {
    const panel = document.getElementById('abyss-leaderboard-panel');
    if (panel) {
      if (typeof GSAPAnims !== 'undefined') {
        GSAPAnims.panelOut(panel, () => panel.remove());
      } else {
        panel.remove();
      }
    }
  },

  // 显示结算面板
  showResultPanel(isDeath, duration) {
    // 简易弹窗，后续可优化为专用UI
    const timeStr = Math.floor(duration / 60) + "分" + Math.floor(duration % 60) + "秒";
    const title = isDeath ? "💀 挑战失败" : "🏳️ 挑战结束";

    // 构建HTML
    const html = `
      <div class="panel-header" style="color:${isDeath ? '#f44' : '#fff'}">${title}</div>
    <div class="panel-content" style="padding:20px; text-align:center;">
      <div style="font-size:18px; margin-bottom:10px;">到达层数: <span style="color:#fb0">${this.currentFloor} 层</span></div>
      <div style="font-size:14px; color:#aaa; margin-bottom:10px;">耗时: ${timeStr}</div>
      <div style="font-size:24px; color:#0f0; margin:15px 0;">积分: ${this.score}</div>
      <div style="font-size:12px; color:#888;">(每周一 00:00 重置)</div>
      <div class="panel-btn-group" style="margin-top:20px;">
        <button onclick="AbyssSystem.backToTown()" class="abyss-btn" style="width: 100%;">返回营地</button>
      </div>
    </div>
`;

    // 使用标准 Panel 结构
    const div = document.createElement('div');
    div.id = 'abyss-result-panel';
    div.className = 'panel active'; // Use common panel class
    div.style.cssText = 'position:fixed; top:50%; left:50%; width:320px; z-index:2000;';
    div.innerHTML = html;
    document.body.appendChild(div);

    // 弹入动画
    if (typeof GSAPAnims !== 'undefined') {
      GSAPAnims.panelIn(div, 'center');
    }
  },

  backToTown() {
    const el = document.getElementById('abyss-result-panel');
    if (el) {
      if (typeof GSAPAnims !== 'undefined') {
        GSAPAnims.panelOut(el, () => el.remove());
      } else {
        el.remove();
      }
    }

    // 返回营地
    player.isInHell = false;
    player.floor = 0;
    enterFloor(0);
    player.hp = player.maxHp;
    player.mp = player.maxMp;
    SaveSystem.save();
  },

  // 显示入口面板
  showEntrancePanel() {
    // 检查等级
    if (player.lvl < this.MIN_LEVEL) {
      showDialog('深渊守卫', `你的力量还不足以挑战深渊。达到 ${this.MIN_LEVEL} 级后再来吧。`, [{ text: '知道了', action: () => closeDialog() }]);
      return;
    }

    // 先移除旧的
    const old = document.getElementById('abyss-entrance-panel');
    if (old) old.remove();

    // 计算倒计时（到下周一00:00）
    const now = new Date();
    const day = now.getDay(); // 0=周日, 1=周一, ...
    const daysUntilMonday = day === 0 ? 1 : (8 - day); // 周日=1天, 周一=7天, 周二=6天, ...
    const nextMonday = new Date(now);
    nextMonday.setHours(0, 0, 0, 0);
    nextMonday.setDate(now.getDate() + daysUntilMonday);
    const diff = nextMonday.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    const bestFloor = localStorage.getItem('abyss_best_floor') || 0;
    const bestScore = localStorage.getItem('abyss_best_score') || 0;
    const currentRank = localStorage.getItem('abyss_last_rank') || '-';

    const html = `
      <div class="panel-header">🔥 深渊挑战 <div class="panel-close" onclick="AbyssSystem.closeEntrancePanel()"></div></div>
    <div class="panel-content" style="padding: 20px;">
      <div class="abyss-info-row">
        <span class="abyss-info-label">本周最佳:</span>
        <span class="abyss-info-value">第${bestFloor}层 (${bestScore}分)</span>
      </div>
      <div class="abyss-info-row">
        <span class="abyss-info-label">当前排名:</span>
        <span class="abyss-info-value" style="color: #ff8800;">${currentRank === '-' ? '暂无记录' : '第' + currentRank + '名'}</span>
      </div>

      <div class="abyss-time-left">
        ⏱️ 本周剩余: ${days}天 ${hours}小时
      </div>

      <div style="background: rgba(100,30,30,0.3); border: 1px solid #633; border-radius: 6px; padding: 12px; margin: 15px 0;">
        <div style="color: #ffcc00; font-size: 14px; text-align: center; margin-bottom: 10px;">🏆 周榜奖励预览</div>
        <div style="font-size: 12px; line-height: 1.8; color: #ccc;">
          <div>🥇 <span style="color:#ff4400;">第1名</span> → <span style="color:#00ff88;">全套深渊征服者</span> + 称号「深渊魔王」</div>
          <div>🥈 <span style="color:#cc2222;">第2-3名</span> → 3件套装 + 称号「深渊领主」</div>
          <div>🥉 <span style="color:#9933ff;">第4-10名</span> → 2件套装 + 称号「深渊使者」</div>
          <div>🌑 <span style="color:#888;">第11-50名</span> → 1件套装 + 称号「深渊行者」</div>
        </div>
      </div>

      <div style="background: rgba(50,50,80,0.3); border: 1px solid #446; border-radius: 4px; padding: 8px; margin-bottom: 15px;">
        <div style="color: #88aaff; font-size: 11px; text-align: center;">
          ⚖️ 公平竞技：深渊征服者套装效果在挑战中禁用
        </div>
      </div>

      <div class="abyss-btn-group">
        <button class="abyss-btn" onclick="AbyssSystem.showContractPanel()">💀 立即挑战</button>
        <button class="abyss-btn" onclick="AbyssSystem.openLeaderboard()">🏆 查看排行榜</button>
      </div>
    </div>
`;

    const div = document.createElement('div');
    div.id = 'abyss-entrance-panel';
    div.className = 'panel active';
    div.style.cssText = 'position:fixed; top:50%; left:50%; width:320px; z-index:2000;';
    div.innerHTML = html;
    document.body.appendChild(div);

    // 弹入动画
    if (typeof GSAPAnims !== 'undefined') {
      GSAPAnims.panelIn(div, 'center');
    }
  },

  closeEntrancePanel() {
    const el = document.getElementById('abyss-entrance-panel');
    if (!el) return;

    if (typeof GSAPAnims !== 'undefined') {
      GSAPAnims.panelOut(el, () => el.remove());
    } else {
      el.remove();
    }
  },

  // 更新HUD (每一帧调用)
  updateHUD() {
    const floorDisplay = document.getElementById('floor-display');
    const questTracker = document.getElementById('quest-tracker');

    if (!this.isActive) {
      const hud = document.getElementById('abyss-hud');
      if (hud && hud.style.display !== 'none') hud.style.display = 'none';
      // 恢复显示楼层和任务
      if (floorDisplay) floorDisplay.style.display = '';
      if (questTracker) questTracker.style.display = '';
      return;
    }

    // 隐藏原有的楼层显示和任务追踪器（避免重叠）
    if (floorDisplay) floorDisplay.style.display = 'none';
    if (questTracker) questTracker.style.display = 'none';

    let hud = document.getElementById('abyss-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'abyss-hud';
      hud.className = 'active';
      hud.innerHTML = `
        <div class="abyss-hud-floor"></div>
            <div class="abyss-hud-time"></div>
            <div class="abyss-hud-warning">💀 禁用自动战斗</div>
`;
      document.body.appendChild(hud);
    }
    hud.style.display = 'block';

    const duration = (Date.now() - this.startTime) / 1000;
    const min = Math.floor(duration / 60).toString().padStart(2, '0');
    const sec = Math.floor(duration % 60).toString().padStart(2, '0');

    hud.querySelector('.abyss-hud-floor').innerText = `深渊 第${this.currentFloor} 层`;
    hud.querySelector('.abyss-hud-time').innerText = `⏱ ${min}:${sec} `;
  }
};

