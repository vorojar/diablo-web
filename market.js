// ========== 摆摊系统 (Market System) ==========
// 版本: v1.0
// 功能: 玩家摆摊、离线挂摊、实时交易

// ========== 可配置常量 ==========
const MARKET_CONFIG = {
  TAX_RATE: 0.05,                          // 交易税率 5%
  MAX_STALLS: 5,                           // 最大摊位数
  MAX_SLOTS: 10,                           // 每个摊位最大格子数
  STALL_FEE_PER_HOUR: 500,                 // 摊位费：每小时500金币
  MIN_STALL_HOURS: 1,                      // 最短摆摊时长：1小时
  MAX_STALL_HOURS: 10,                     // 最长摆摊时长：10小时
  STALL_NAME_MAX_LENGTH: 10,               // 摊位名最大长度
  MIN_PRICE: 1,                            // 最低标价
  MAX_PRICE: 999999999,                    // 最高标价

  // 摊位坐标 (相对于 dungeonEntrance 的偏移)
  STALL_POSITIONS: [
    { x: 420, y: -120 },  // 摊位1: 外侧上
    { x: 455, y: 0 },     // 摊位2: 外侧中
    { x: 420, y: 120 },   // 摊位3: 外侧下
    { x: 315, y: -62 },   // 摊位4: 内侧上
    { x: 315, y: 62 }     // 摊位5: 内侧下
  ]
};

// ========== 摆摊系统核心对象 ==========
const MarketSystem = {
  // 状态
  stalls: [],              // 所有摊位数据 (从服务器同步)
  localStallId: null,      // 当前玩家自己的摊位 ID
  isStalling: false,       // 是否正在摆摊
  isPanelOpen: false,      // 摆摊设置面板是否打开
  stallStartTime: null,    // 摆摊开始时间
  realtimeSubscribed: false,
  initialized: false,
  expirationCheckTimer: null,
  buyLocks: new Set(),

  // 当前操作的摊位索引 (用于 UI)
  currentStallIndex: -1,
  setupItems: [],          // 摆摊设置面板中的商品 [{item, price}, ...]

  // ========== 初始化 ==========
  init() {
    this.createUI();
    this.loadStalls();
    if (!this.initialized) {
      this.subscribeStalls();
      this.startExpirationCheck(); // 定时检查摊位过期
      this.initialized = true;
    }
    this.checkPendingSales(); // 检查未领取的销售收益
    console.log('[摆摊系统] 初始化完成');
  },

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  parseItems(items) {
    if (!items) return [];
    if (Array.isArray(items)) return items;
    try {
      const parsed = JSON.parse(items);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[摆摊系统] 物品数据解析失败:', e);
      return [];
    }
  },

  // ========== UI 创建 ==========
  createRequestId(prefix = 'market') {
    const userId = OnlineSystem?.userId || 'anonymous';
    return `${prefix}-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  },

  isHookNotInstalled(error) {
    const status = error?.status || error?.response?.status || error?.data?.status;
    const text = `${error?.message || ''} ${error?.data?.message || ''}`.toLowerCase();
    return status === 404 || text.includes('not found') || text.includes('404');
  },

  getPbErrorMessage(error, fallbackMessage) {
    return error?.data?.message || error?.response?.message || error?.message || fallbackMessage;
  },

  async tryServerPurchase(stall, slotData, itemIndex, totalPrice, emptySlot) {
    if (typeof pb?.send !== 'function') return 'missing';

    const targetEmptySlot = player.inventory[emptySlot] === null
      ? emptySlot
      : player.inventory.findIndex(i => i === null);
    if (targetEmptySlot === -1) {
      showNotification('背包已满', 'warning');
      return 'handled';
    }

    try {
      const response = await pb.send('/api/market/purchase', {
        method: 'POST',
        body: {
          stallId: stall.id,
          itemIndex,
          itemId: slotData.item?.id || '',
          expectedPrice: slotData.price,
          expectedTotal: totalPrice,
          buyerId: OnlineSystem?.userId || 'anonymous',
          buyerName: OnlineSystem?.nickname || '匿名玩家',
          requestId: this.createRequestId('buy')
        }
      });

      const purchasedItem = response?.item || slotData.item;
      const chargedGold = Number(response?.totalPrice ?? totalPrice);
      const itemName = purchasedItem?.name || slotData.item?.name || '商品';

      if (player.gold < chargedGold) {
        showNotification(`金币不足，需要 ${chargedGold}G`, 'warning');
        return 'handled';
      }

      player.gold -= chargedGold;
      player.inventory[targetEmptySlot] = purchasedItem;

      showNotification(`购买成功: ${itemName} (-${chargedGold}G)`, 'success');
      if (typeof AudioSys !== 'undefined') AudioSys.play('gold');
      updateStats();
      renderInventory();
      this.closeViewPanel();
      SaveSystem?.save();
      this.loadStalls();
      return 'handled';
    } catch (e) {
      if (this.isHookNotInstalled(e)) {
        console.warn('[摆摊系统] PocketBase 原子购买接口未安装，降级使用旧购买流程');
        return 'missing';
      }

      console.error('[摆摊系统] 原子购买失败:', e);
      showNotification(this.getPbErrorMessage(e, '购买失败'), 'error');
      this.closeViewPanel();
      this.loadStalls();
      return 'handled';
    }
  },

  async tryServerClaimSales(sales) {
    if (typeof pb?.send !== 'function') return 'missing';

    try {
      const response = await pb.send('/api/market/claim-sales', {
        method: 'POST',
        body: {
          saleIds: sales.map(sale => sale.id),
          sellerId: OnlineSystem?.userId || 'anonymous',
          requestId: this.createRequestId('claim')
        }
      });

      const claimedGold = Number(response?.totalGold || 0);
      const claimedCount = Number(response?.claimedCount || 0);
      this.applyClaimedSales(claimedGold, claimedCount);
      return 'handled';
    } catch (e) {
      if (this.isHookNotInstalled(e)) {
        console.warn('[摆摊系统] PocketBase 原子领取接口未安装，降级使用旧领取流程');
        return 'missing';
      }

      console.error('[摆摊系统] 原子领取失败:', e);
      showNotification(this.getPbErrorMessage(e, '领取失败'), 'error');
      return 'handled';
    }
  },

  applyClaimedSales(claimedGold, claimedCount) {
    if (claimedCount <= 0 || claimedGold <= 0) return;

    player.gold += claimedGold;

    const btn = document.getElementById('claim-sales-btn');
    if (btn) btn.remove();

    showNotification(`✅ 领取成功: +${claimedGold}G`, 'success');
    if (typeof AudioSys !== 'undefined') AudioSys.play('gold');
    updateStats();
    renderInventory();
    SaveSystem?.save();
  },

  createUI() {
    // 摆摊设置面板
    if (!document.getElementById('stall-setup-panel')) {
      const setupPanel = document.createElement('div');
      setupPanel.id = 'stall-setup-panel';
      setupPanel.className = 'panel';
      setupPanel.style.display = 'none';
      setupPanel.onmousedown = (e) => e.stopPropagation();
      setupPanel.innerHTML = this.getSetupPanelHTML();
      document.querySelector('.ui-layer')?.appendChild(setupPanel);
    }

    // 查看摊位面板
    if (!document.getElementById('stall-view-panel')) {
      const viewPanel = document.createElement('div');
      viewPanel.id = 'stall-view-panel';
      viewPanel.className = 'panel';
      viewPanel.style.display = 'none';
      viewPanel.onmousedown = (e) => e.stopPropagation();
      viewPanel.innerHTML = this.getViewPanelHTML();
      document.querySelector('.ui-layer')?.appendChild(viewPanel);
    }

    // 定价弹窗
    if (!document.getElementById('stall-price-dialog')) {
      const priceDialog = document.createElement('div');
      priceDialog.id = 'stall-price-dialog';
      priceDialog.className = 'stall-price-overlay';
      priceDialog.style.display = 'none';
      priceDialog.onmousedown = (e) => e.stopPropagation();
      priceDialog.innerHTML = `
        <div class="stall-price-box">
          <div class="stall-price-title">设置售价</div>
          <div class="stall-price-item" id="stall-price-item-name">物品名</div>
          <div class="stall-price-input-row">
            <input type="number" id="stall-price-input" min="1" placeholder="输入金币数">
            <span class="stall-price-unit">G</span>
          </div>
          <div class="stall-price-actions">
            <button class="stall-btn primary" onclick="MarketSystem.confirmPrice()">确定</button>
            <button class="stall-btn" onclick="MarketSystem.cancelPrice()">取消</button>
          </div>
        </div>
      `;
      document.querySelector('.ui-layer')?.appendChild(priceDialog);
    }

    // 为动态创建的面板绑定拖动事件
    this.bindPanelDrag('stall-setup-panel');
    this.bindPanelDrag('stall-view-panel');

    // 绑定输入框事件，防止触发游戏快捷键
    const stopPropagation = (e) => e.stopPropagation();

    // 1. 摊位名称输入框 (稍后绑定，因为是 innerHTML 插入的)
    // 2. 价格输入框
    const priceInput = document.getElementById('stall-price-input');
    if (priceInput) {
      priceInput.addEventListener('keydown', stopPropagation);
      priceInput.addEventListener('keyup', stopPropagation);
    }
  },

  // 绑定面板拖动事件
  bindPanelDrag(panelId) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const header = panel.querySelector('.panel-header');
    if (!header || header._dragBound) return;

    header._dragBound = true;

    let dragOffset = { x: 0, y: 0 };
    let isDragging = false;

    const startDrag = (clientX, clientY) => {
      if (window.innerWidth < 768) return; // 小屏幕禁用拖拽

      isDragging = true;
      document.querySelectorAll('.panel').forEach(p => p.style.zIndex = 60);
      panel.style.zIndex = 61;

      const rect = panel.getBoundingClientRect();
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.transform = 'none';

      dragOffset.x = clientX - rect.left;
      dragOffset.y = clientY - rect.top;
    };

    const moveDrag = (clientX, clientY) => {
      if (!isDragging) return;
      const maxX = window.innerWidth - 50;
      const maxY = window.innerHeight - 50;
      panel.style.left = Math.max(0, Math.min(clientX - dragOffset.x, maxX)) + 'px';
      panel.style.top = Math.max(0, Math.min(clientY - dragOffset.y, maxY)) + 'px';
    };

    const endDrag = () => {
      isDragging = false;
    };

    // 鼠标事件
    header.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      startDrag(e.clientX, e.clientY);
    };

    document.addEventListener('mousemove', (e) => {
      if (isDragging) moveDrag(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', endDrag);

    // 触摸事件
    header.ontouchstart = (e) => {
      e.stopPropagation();
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
    };

    document.addEventListener('touchmove', (e) => {
      if (isDragging) {
        const touch = e.touches[0];
        moveDrag(touch.clientX, touch.clientY);
      }
    });

    document.addEventListener('touchend', endDrag);
  },

  // 摆摊设置面板 HTML（垂直布局，适配手机）
  getSetupPanelHTML() {
    // 生成时长选项
    let durationOptions = '';
    for (let h = MARKET_CONFIG.MIN_STALL_HOURS; h <= MARKET_CONFIG.MAX_STALL_HOURS; h++) {
      const fee = h * MARKET_CONFIG.STALL_FEE_PER_HOUR;
      durationOptions += `<option value="${h}">${h}小时 - ${fee}G</option>`;
    }

    return `
            <div class="panel-close" onclick="MarketSystem.closeSetupPanel()"></div>
            <div class="panel-header">🛒 摆摊</div>
            <div class="stall-name-row">
                <label>摊位名称:</label>
                <input type="text" id="stall-name-input" maxlength="${MARKET_CONFIG.STALL_NAME_MAX_LENGTH}" placeholder="最多${MARKET_CONFIG.STALL_NAME_MAX_LENGTH}字">
            </div>
            <div class="stall-section-title">摊位货架 (${MARKET_CONFIG.MAX_SLOTS}格) <span style="color:#888;font-size:10px;">点击移除</span></div>
            <div id="stall-shelf-grid" class="stall-shelf-grid"></div>
            <div class="stall-duration-row">
                <label>摆摊时长:</label>
                <select id="stall-duration-select" onchange="MarketSystem.updateFeeDisplay()">
                    ${durationOptions}
                </select>
                <span class="stall-tax-notice">💡 税率 ${MARKET_CONFIG.TAX_RATE * 100}%</span>
            </div>
            <div class="stall-setup-footer">
                <button id="stall-start-btn" class="stall-btn primary" onclick="MarketSystem.startStall()">开始营业 -${MARKET_CONFIG.STALL_FEE_PER_HOUR}G</button>
            </div>
            <!-- 内嵌背包 -->
            <div class="embedded-bag-section">
                <div class="embedded-bag-header">📦 背包 <span style="color:#888;font-size:11px;">(点击上架)</span> <span id="market-gold-display" style="color:gold; float:right;">金币: 0</span></div>
                <div id="stall-inventory-grid" class="embedded-bag-grid"></div>
            </div>
        `;
  },

  // 更新按钮费用显示
  updateFeeDisplay() {
    const select = document.getElementById('stall-duration-select');
    const btn = document.getElementById('stall-start-btn');
    if (select && btn) {
      const hours = parseInt(select.value);
      const fee = hours * MARKET_CONFIG.STALL_FEE_PER_HOUR;
      btn.textContent = `开始营业 -${fee}G`;
    }
  },

  // 查看摊位面板 HTML
  getViewPanelHTML() {
    return `
            <div class="panel-close" onclick="MarketSystem.closeViewPanel()"></div>
            <div class="panel-header" id="stall-view-header">🛒 摊位</div>
            <div id="stall-view-content" class="stall-view-content"></div>
        `;
  },

  // ========== 摊位数据加载 ==========
  async loadStalls() {
    if (typeof pb === 'undefined') {
      console.warn('[摆摊系统] PocketBase 未加载');
      return;
    }

    try {
      // 获取所有未过期的摊位
      const now = new Date().toISOString().replace('T', ' ');
      const records = await pb.collection('market_stalls').getList(1, MARKET_CONFIG.MAX_STALLS, {
        filter: `expires_at >= "${now}"`,
        sort: 'stall_index'
      });

      this.stalls = records.items || [];
      console.log('[摆摊系统] 加载摊位:', this.stalls.length);

      // 检查是否有自己的摊位
      if (typeof OnlineSystem !== 'undefined' && OnlineSystem.userId) {
        const myStall = this.stalls.find(s => s.user_id === OnlineSystem.userId);
        if (myStall) {
          this.localStallId = myStall.id;
          this.isStalling = true;
          this.currentStallIndex = myStall.stall_index;
          this.stallStartTime = new Date(myStall.created).getTime();

          // 移动玩家到摊位位置
          const stallPos = this.getStallWorldPosition(myStall.stall_index);
          if (stallPos && typeof player !== 'undefined') {
            player.x = stallPos.x;
            player.y = stallPos.y;
            player.target = null; // 清除移动目标
          }

          // 显示收摊按钮
          this.showCloseStallButton();
          showNotification(`正在摆摊: ${myStall.stall_name}`, 'info');
        }
      }
    } catch (e) {
      console.error('[摆摊系统] 加载摊位失败:', e);
    }
  },

  // 获取摊位世界坐标
  getStallWorldPosition(stallIndex) {
    if (typeof dungeonEntrance === 'undefined') return null;
    const pos = MARKET_CONFIG.STALL_POSITIONS[stallIndex];
    if (!pos) return null;
    return {
      x: dungeonEntrance.x + pos.x,
      y: dungeonEntrance.y + pos.y
    };
  },

  // 显示收摊按钮
  showCloseStallButton() {
    // 检查是否已存在
    if (document.getElementById('close-stall-btn')) return;

    const container = document.createElement('div');
    container.id = 'close-stall-container';
    container.className = 'close-stall-container';

    const btn = document.createElement('button');
    btn.id = 'close-stall-btn';
    btn.className = 'close-stall-btn';
    btn.innerHTML = '收摊';
    btn.onclick = (e) => {
      e.stopPropagation();
      MarketSystem.closeStall();
    };

    const timer = document.createElement('div');
    timer.id = 'stall-timer';
    timer.className = 'stall-timer';

    container.appendChild(btn);
    container.appendChild(timer);
    document.body.appendChild(container);

    // 启动位置更新和倒计时
    this.updateCloseButtonPosition();
    this.startStallTimer();
  },

  // 启动摊位倒计时
  startStallTimer() {
    if (this._stallTimerInterval) clearInterval(this._stallTimerInterval);

    this._stallTimerInterval = setInterval(() => {
      this.updateStallTimer();
    }, 1000);

    this.updateStallTimer(); // 立即更新一次
  },

  // 更新摊位倒计时显示
  updateStallTimer() {
    const timer = document.getElementById('stall-timer');
    if (!timer || !this.isStalling || !this.localStallId) {
      if (this._stallTimerInterval) {
        clearInterval(this._stallTimerInterval);
        this._stallTimerInterval = null;
      }
      return;
    }

    const myStall = this.stalls.find(s => s.id === this.localStallId);
    if (!myStall) return;

    const expiresAt = new Date(myStall.expires_at.replace(' ', 'T'));
    const now = new Date();
    const remainingMs = expiresAt - now;

    if (remainingMs <= 0) {
      timer.textContent = '已过期';
      timer.style.color = '#ff4444';
      return;
    }

    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);

    if (minutes < 5) {
      timer.style.color = '#ff8800';
    } else {
      timer.style.color = '#aaa';
    }

    timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  },

  // 更新收摊按钮位置（跟随玩家头顶）
  updateCloseButtonPosition() {
    const container = document.getElementById('close-stall-container');
    if (!container || !this.isStalling) return;

    if (typeof player !== 'undefined' && typeof camera !== 'undefined') {
      const screenX = player.x - camera.x;
      const screenY = player.y - camera.y - 70; // 玩家头顶上方

      // 使用 transform 定位减少重排
      container.style.transform = `translate(${screenX}px, ${screenY}px) translateX(-50%)`;
    }

    // 持续更新
    requestAnimationFrame(() => this.updateCloseButtonPosition());
  },

  // 隐藏收摊按钮
  hideCloseStallButton() {
    const container = document.getElementById('close-stall-container');
    if (container) container.remove();

    if (this._stallTimerInterval) {
      clearInterval(this._stallTimerInterval);
      this._stallTimerInterval = null;
    }
  },

  // ========== 实时订阅 ==========
  async subscribeStalls() {
    if (typeof pb === 'undefined') return;
    if (this.realtimeSubscribed) return;

    try {
      await pb.collection('market_stalls').subscribe('*', (e) => {
        if (e.action === 'create') {
          // 新摊位
          const existingIndex = this.stalls.findIndex(s => s.id === e.record.id);
          if (existingIndex === -1) {
            this.stalls.push(e.record);
          }
        } else if (e.action === 'update') {
          // 更新摊位
          const index = this.stalls.findIndex(s => s.id === e.record.id);
          if (index !== -1) {
            this.stalls[index] = e.record;

            // 如果玩家当前正在查看此摊位，即时刷新UI
            if (this.currentViewStall && this.currentViewStall.id === e.record.id) {
              this.openViewPanel({ stall: e.record });
            }
          }
        } else if (e.action === 'delete') {
          // 删除摊位
          this.stalls = this.stalls.filter(s => s.id !== e.record.id);

          // 如果玩家当前正在查看此摊位，关闭面板
          if (this.currentViewStall && this.currentViewStall.id === e.record.id) {
            this.closeViewPanel();
            showNotification('该摊位已关闭', 'info');
          }

          // 如果是自己的摊位被删除（商品售罄）
          if (this.localStallId === e.record.id) {
            this.localStallId = null;
            this.isStalling = false;
            this.stallStartTime = null;
            this.currentStallIndex = -1;
            this.hideCloseStallButton();
            showNotification('🎉 商品已全部售罄！', 'success');
          }
        }
      });
      this.realtimeSubscribed = true;
      console.log('[摆摊系统] Realtime 订阅成功');

      // 订阅销售记录，当有新销售时实时通知卖家
      await pb.collection('market_sales').subscribe('*', (e) => {
        if (e.action === 'create') {
          // 新销售记录，检查是否是卖给自己的
          if (e.record.seller_id === OnlineSystem?.userId && !e.record.claimed) {
            showNotification(`💰 ${e.record.buyer_name} 购买了 ${e.record.item_name}！+${e.record.price}G 待领取`, 'success');
            if (typeof AudioSys !== 'undefined') AudioSys.play('gold');

            // 发送销售公告
            if (typeof OnlineSystem !== 'undefined' && e.record.item_name) {
              OnlineSystem.announce('item_sold', e.record.item_name, e.record.price);
            }

            // 刷新领取按钮
            this.checkPendingSales();
          }
        }
      });

    } catch (e) {
      console.warn('[摆摊系统] Realtime 订阅失败:', e);
    }
  },

  // ========== 摊位过期检查 ==========
  startExpirationCheck() {
    if (this.expirationCheckTimer) return;
    // 每分钟检查一次
    this.expirationCheckTimer = setInterval(() => {
      this.checkExpiration();
      this.performMarketGC();
    }, 60000);
    // 立即检查一次
    setTimeout(() => {
      this.checkExpiration();
      this.performMarketGC();
    }, 3000);
  },

  // 市场垃圾清理 (机会性清理)
  performMarketGC() {
    if (typeof OnlineSystem === 'undefined' || !OnlineSystem.gc) return;

    // 1. 清理过期超过 48 小时的僵尸摊位 (弃坑玩家)
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString().replace('T', ' ');
    OnlineSystem.gc('market_stalls', `expires_at < "${fortyEightHoursAgo}"`, 3);

    // 2. 清理超过 15 天未领取的销售收益 (按用户要求保留 15 天)
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString().replace('T', ' ');
    OnlineSystem.gc('market_sales', `created < "${fifteenDaysAgo}"`, 5);
  },

  checkExpiration() {
    if (!this.isStalling || !this.localStallId) return;

    const myStall = this.stalls.find(s => s.id === this.localStallId);
    if (!myStall) return;

    const expiresAt = new Date(myStall.expires_at.replace(' ', 'T'));
    const now = new Date();

    if (now >= expiresAt) {
      // 已过期，自动收摊
      this.handleExpiredStall(myStall);
    } else {
      // 计算剩余时间，如果小于5分钟则提醒
      const remainingMs = expiresAt - now;
      const remainingMinutes = Math.floor(remainingMs / 60000);

      if (remainingMinutes <= 5 && remainingMinutes > 0 && !this._expirationWarned) {
        this._expirationWarned = true;
        showNotification(`⏰ 摊位将在 ${remainingMinutes} 分钟后过期`, 'warning');
      }
    }
  },

  async handleExpiredStall(stall) {
    showNotification('⏰ 摊位已过期，自动收摊中...', 'warning');

    // 返还商品
    const items = this.parseItems(stall.items);
    for (const slotData of items) {
      if (slotData && slotData.item) {
        if (!addItemToInventory(slotData.item)) {
          groundItems.push({
            x: player.x + Math.random() * 40 - 20,
            y: player.y + Math.random() * 40 - 20,
            item: slotData.item
          });
        }
      }
    }

    // 尝试删除服务器记录
    try {
      await pb.collection('market_stalls').delete(stall.id);
    } catch (e) {
      // 可能已被服务器清理
    }

    // 清理本地状态
    this.stalls = this.stalls.filter(s => s.id !== stall.id);
    this.localStallId = null;
    this.isStalling = false;
    this.stallStartTime = null;
    this.currentStallIndex = -1;
    this._expirationWarned = false;
    this.hideCloseStallButton();

    showNotification('✅ 已自动收摊，商品已返还', 'success');
    renderInventory();
    SaveSystem?.save();
  },

  // ========== 检查未领取的销售收益 ==========
  async checkPendingSales() {
    if (typeof pb === 'undefined' || typeof OnlineSystem === 'undefined' || !OnlineSystem.userId) {
      return;
    }

    try {
      const records = await pb.collection('market_sales').getList(1, 50, {
        filter: `seller_id = "${OnlineSystem.userId}" && claimed = false`,
        sort: '-created'
      });

      if (records.items.length > 0) {
        const totalGold = records.items.reduce((sum, r) => sum + r.price, 0);

        // 显示领取提示
        setTimeout(() => {
          this.showSalesNotification(records.items, totalGold);
        }, 1000);
      }
    } catch (e) {
      console.warn('[摆摊系统] 检查销售收益失败:', e);
    }
  },

  // 显示销售收益通知
  showSalesNotification(sales, totalGold) {
    showNotification(`💰 您有 ${sales.length} 件商品已售出，共 ${totalGold}G 待领取！`, 'success');

    // 保存待领取列表
    this.pendingSales = sales;
    this.pendingGold = totalGold;

    // 显示领取按钮
    this.showClaimSalesButton(totalGold);
  },

  // 显示领取收益按钮
  showClaimSalesButton(totalGold) {
    // 移除旧按钮
    const oldBtn = document.getElementById('claim-sales-btn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.id = 'claim-sales-btn';
    btn.className = 'claim-sales-btn';
    btn.innerHTML = `💰 领取 ${totalGold}G`;
    btn.onclick = (e) => {
      e.stopPropagation();
      MarketSystem.openSalesPanel();
    };
    // 阻止点击穿透导致玩家移动
    btn.onmousedown = (e) => e.stopPropagation();
    btn.ontouchstart = (e) => e.stopPropagation();
    document.body.appendChild(btn);
  },

  // 打开销售明细面板
  openSalesPanel() {
    // 创建面板（如果不存在）
    let panel = document.getElementById('sales-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'sales-panel';
      panel.className = 'panel';
      panel.onmousedown = (e) => e.stopPropagation();
      document.querySelector('.ui-layer')?.appendChild(panel);
    }

    const sales = this.pendingSales || [];
    const totalGold = this.pendingGold || 0;

    let listHtml = '';
    for (const sale of sales) {
      const time = new Date(sale.created).toLocaleString('zh-CN', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      listHtml += `
        <div class="sales-row">
          <span class="sales-item">${this.escapeHtml(sale.item_name)}</span>
          <span class="sales-buyer">${this.escapeHtml(sale.buyer_name)}</span>
          <span class="sales-price">+${sale.price}G</span>
          <span class="sales-time">${time}</span>
        </div>
      `;
    }

    panel.innerHTML = `
      <div class="panel-close" onclick="MarketSystem.closeSalesPanel()"></div>
      <div class="panel-header">💰 摆摊收益明细</div>
      <div class="sales-list">${listHtml || '<div class="sales-empty">暂无销售记录</div>'}</div>
      <div class="sales-total">
        <span>总计: ${sales.length} 件</span>
        <span class="sales-total-gold">${totalGold}G</span>
      </div>
      <button class="stall-btn primary sales-claim-all" onclick="MarketSystem.claimAllSales()">领取全部</button>
    `;

    // 绑定拖动（在 innerHTML 设置后，确保 panel-header 存在）
    this.bindPanelDrag('sales-panel');

    panel.style.display = 'block';
  },

  // 关闭销售明细面板
  closeSalesPanel() {
    const panel = document.getElementById('sales-panel');
    if (panel) panel.style.display = 'none';
  },

  // 领取全部收益
  async claimAllSales() {
    const sales = this.pendingSales || [];
    if (sales.length === 0) return;

    await this.claimSales(sales);
    this.closeSalesPanel();
  },

  // 领取销售收益
  async claimSales(sales) {
    if (typeof pb === 'undefined' || typeof player === 'undefined') return;

    const serverResult = await this.tryServerClaimSales(sales);
    if (serverResult === 'handled') return;

    let claimedCount = 0;
    let claimedGold = 0;

    for (const sale of sales) {
      try {
        // 直接删除记录，不再保留 claimed = true 的数据
        await pb.collection('market_sales').delete(sale.id);
        claimedCount++;
        claimedGold += Number(sale.price || 0);
      } catch (e) {
        console.warn('[摆摊系统] 领取失败:', sale.id, e);
      }
    }

    // 隐藏按钮
    const btn = document.getElementById('claim-sales-btn');
    if (btn) btn.remove();

    if (claimedCount > 0) {
      player.gold += claimedGold;
      showNotification(`✅ 领取成功: +${claimedGold}G`, 'success');
      if (typeof AudioSys !== 'undefined') AudioSys.play('gold');
      updateStats();
      renderInventory();
      SaveSystem?.save();
    }
  },

  // ========== 获取摊位交互点 ==========
  getStallInteractionPoints() {
    if (typeof dungeonEntrance === 'undefined') return [];

    return MARKET_CONFIG.STALL_POSITIONS.map((pos, index) => ({
      index,
      x: dungeonEntrance.x + pos.x,
      y: dungeonEntrance.y + pos.y,
      stall: this.stalls.find(s => s.stall_index === index) || null
    }));
  },

  // ========== 检测点击摊位 ==========
  getStallAtPosition(worldX, worldY) {
    const points = this.getStallInteractionPoints();
    const clickRange = 30;

    for (const point of points) {
      if (Math.hypot(worldX - point.x, worldY - point.y) < clickRange) {
        return point;
      }
    }
    return null;
  },

  // ========== 点击摊位处理 ==========
  onStallClick(stallPoint) {
    if (!stallPoint) return;

    if (stallPoint.stall) {
      // 有人摆摊，打开查看面板
      this.openViewPanel(stallPoint);
    } else {
      // 空摊位，打开设置面板并绑定玩家点击的具体位置
      this.openSetupPanel(stallPoint.index);
    }
  },

  // ========== 打开摆摊设置面板 ==========
  openSetupPanel(stallIndex = -1) {
    if (this.isStalling) {
      showNotification('你已经在摆摊了', 'warning');
      return;
    }

    this.currentStallIndex = Number.isInteger(stallIndex) ? stallIndex : -1;
    this.setupItems = [];

    const panel = document.getElementById('stall-setup-panel');
    if (!panel) return;

    // 停止玩家移动
    if (typeof player !== 'undefined') {
      player.target = null;
    }

    panel.style.display = 'block';
    this.isPanelOpen = true;

    // 绑定输入框事件阻止冒泡
    const nameInput = document.getElementById('stall-name-input');
    if (nameInput) {
      nameInput.onkeydown = (e) => e.stopPropagation();
      nameInput.onkeyup = (e) => e.stopPropagation();
    }

    this.renderSetupPanel();
  },

  // 关闭设置面板
  closeSetupPanel() {
    const panel = document.getElementById('stall-setup-panel');
    if (panel) panel.style.display = 'none';
    this.isPanelOpen = false;

    // 返还未上架的物品到背包
    for (const item of this.setupItems) {
      if (item && item.item) {
        addItemToInventory(item.item);
      }
    }
    this.setupItems = [];
    this.currentStallIndex = -1;
    renderInventory();
  },

  // 渲染设置面板
  renderSetupPanel() {
    // 获取已上架物品的背包索引
    const shelfInvIndexes = new Set();
    for (const slotData of this.setupItems) {
      if (slotData && slotData.invIndex !== undefined) {
        shelfInvIndexes.add(slotData.invIndex);
      }
    }

    // 自定义渲染背包（标记已上架物品）
    const grid = document.getElementById('stall-inventory-grid');
    if (grid && typeof player !== 'undefined') {
      grid.innerHTML = '';
      player.inventory.forEach((item, idx) => {
        const slot = document.createElement('div');
        slot.className = 'embedded-bag-slot';

        if (item) {
          // 检查是否已上架
          if (shelfInvIndexes.has(idx)) {
            slot.classList.add('stall-on-shelf');
            slot.innerHTML = '<span style="color:#888;font-size:10px;">已上架</span>';
          } else {
            // 稀有度样式
            if (item.rarity >= 3 && item.rarity <= 4) slot.classList.add('rarity-unique');
            else if (item.rarity === 5) slot.classList.add('rarity-set');
            else if (item.rarity === 2) slot.classList.add('rarity-rare');

            if (typeof applyItemSpriteToElement === 'function') {
              applyItemSpriteToElement(slot, item);
            }

            // 点击事件（消耗品不可上架）
            if (item.type !== 'potion' && item.type !== 'scroll') {
              slot.onclick = (e) => {
                e.stopPropagation();
                MarketSystem.addToShelf(idx);
              };
            } else {
              slot.style.opacity = '0.5';
              slot.style.cursor = 'not-allowed';
            }

            if (typeof bindItemTooltip === 'function') {
              bindItemTooltip(slot, item);
            }
          }
        }

        grid.appendChild(slot);
      });

      // 更新金币显示
      const goldDisplay = document.getElementById('market-gold-display');
      if (goldDisplay) goldDisplay.textContent = '金币: ' + player.gold;
    }

    // 渲染货架（横挢10格）
    const shelfGrid = document.getElementById('stall-shelf-grid');
    if (shelfGrid) {
      shelfGrid.innerHTML = '';
      for (let i = 0; i < MARKET_CONFIG.MAX_SLOTS; i++) {
        const slotData = this.setupItems[i];
        const slot = document.createElement('div');
        slot.className = 'stall-shelf-slot';

        if (slotData && slotData.item) {
          const item = slotData.item;
          const color = getRarityColor(item.rarity);
          slot.classList.add('has-item');
          slot.style.borderColor = color;
          slot.onclick = () => MarketSystem.removeFromShelf(i);

          // 使用精灵图渲染
          if (typeof applyItemSpriteToElement === 'function') {
            applyItemSpriteToElement(slot, item);
          }

          // 价格标签
          const priceLabel = document.createElement('span');
          priceLabel.className = 'stall-item-price';
          priceLabel.textContent = slotData.price + 'G';
          slot.appendChild(priceLabel);

          // 绑定 tooltip
          if (typeof bindItemTooltip === 'function') {
            bindItemTooltip(slot, item);
          }
        } else {
          slot.classList.add('empty');
          slot.textContent = '+';
        }

        shelfGrid.appendChild(slot);
      }
    }

    // 更新按钮状态
    const startBtn = document.getElementById('stall-start-btn');
    if (startBtn) {
      const hasItems = this.setupItems.some(s => s && s.item);
      startBtn.disabled = !hasItems;
    }
  },

  // 添加物品到货架
  addToShelf(invIndex) {
    if (typeof player === 'undefined') return;

    const item = player.inventory[invIndex];
    if (!item) return;

    // 只禁止消耗品上架（药水、卷轴）
    if (item.type === 'potion' || item.type === 'scroll') {
      showNotification('消耗品不可出售', 'warning');
      return;
    }

    // 找到空的货架格子
    let emptySlot = -1;
    for (let i = 0; i < MARKET_CONFIG.MAX_SLOTS; i++) {
      if (!this.setupItems[i]) {
        emptySlot = i;
        break;
      }
    }

    if (emptySlot === -1) {
      showNotification('货架已满', 'warning');
      return;
    }

    // 保存临时状态，打开定价弹窗
    this.pendingItem = { invIndex, item, emptySlot };
    this.showPriceDialog(item);
  },

  // 显示定价弹窗
  showPriceDialog(item) {
    const dialog = document.getElementById('stall-price-dialog');
    const itemName = document.getElementById('stall-price-item-name');
    const priceInput = document.getElementById('stall-price-input');

    if (!dialog) return;

    // 计算建议售价（基于稀有度，比商人买价高一些）
    let suggestedPrice = 50;
    if (item.rarity > 1) suggestedPrice *= item.rarity * 2;
    suggestedPrice = Math.floor(suggestedPrice * 1.5); // 比商人收购价高50%

    const color = getRarityColor(item.rarity);
    itemName.innerHTML = `<span style="color:${color}">${this.escapeHtml(item.name)}</span>`;
    priceInput.value = suggestedPrice;
    dialog.style.display = 'flex';

    // 自动聚焦输入框
    setTimeout(() => priceInput.focus(), 100);
  },

  // 确认定价
  confirmPrice() {
    const priceInput = document.getElementById('stall-price-input');
    const priceNum = parseInt(priceInput?.value);

    if (isNaN(priceNum) || priceNum < MARKET_CONFIG.MIN_PRICE || priceNum > MARKET_CONFIG.MAX_PRICE) {
      showNotification(`价格必须在 ${MARKET_CONFIG.MIN_PRICE} ~ ${MARKET_CONFIG.MAX_PRICE} 之间`, 'warning');
      return;
    }

    if (!this.pendingItem) return;

    const { invIndex, item, emptySlot } = this.pendingItem;

    // 验证物品是否仍在背包中
    const currentItem = player.inventory[invIndex];
    if (!currentItem || currentItem.id !== item.id) {
      showNotification('物品已不在背包中', 'warning');
      this.closePriceDialog();
      this.renderSetupPanel();
      return;
    }

    // 验证该物品是否已被上架（防止重复上架）
    const alreadyShelf = this.setupItems.some(s => s && s.item && s.item.id === item.id);
    if (alreadyShelf) {
      showNotification('该物品已在货架上', 'warning');
      this.closePriceDialog();
      return;
    }

    // 注意：不从背包移除，只记录索引，防止刷新页面丢失物品
    this.setupItems[emptySlot] = { item, price: priceNum, invIndex };

    // 关闭弹窗，清除临时状态
    this.closePriceDialog();

    this.renderSetupPanel();
  },

  // 取消定价
  cancelPrice() {
    this.closePriceDialog();
  },

  // 关闭定价弹窗
  closePriceDialog() {
    const dialog = document.getElementById('stall-price-dialog');
    if (dialog) dialog.style.display = 'none';
    this.pendingItem = null;
  },

  // 从货架移除物品
  removeFromShelf(shelfIndex) {
    const slotData = this.setupItems[shelfIndex];
    if (!slotData || !slotData.item) return;

    // 物品还在背包中，只需清除货架记录
    this.setupItems[shelfIndex] = null;
    this.renderSetupPanel();

    // 强制隐藏 tooltip (如果有全局函数则调用，否则操作 DOM)
    if (typeof hideTooltip === 'function') {
      hideTooltip();
    } else {
      const tt = document.getElementById('tooltip');
      if (tt) tt.style.display = 'none';
    }
  },

  // ========== 开始摆摊 ==========
  async startStall() {
    const stallName = document.getElementById('stall-name-input')?.value.trim() || '摊位';
    const itemsToSell = this.setupItems.filter(s => s && s.item);

    if (itemsToSell.length === 0) {
      showNotification('请先添加商品', 'warning');
      return;
    }

    // 读取选择的摆摊时长
    const durationSelect = document.getElementById('stall-duration-select');
    const hours = durationSelect ? parseInt(durationSelect.value) : 1;
    const stallFee = hours * MARKET_CONFIG.STALL_FEE_PER_HOUR;
    const durationMs = hours * 60 * 60 * 1000;

    // 检查金币是否足够
    if (typeof player === 'undefined' || player.gold < stallFee) {
      showNotification(`金币不足，需要 ${stallFee}G`, 'warning');
      return;
    }

    if (typeof pb === 'undefined' || typeof OnlineSystem === 'undefined' || !OnlineSystem.userId) {
      showNotification('网络未连接', 'error');
      return;
    }

    // 实时获取最新摊位数据，查找空位
    await this.loadStalls();
    const occupiedIndices = this.stalls.map(s => s.stall_index);
    let assignedIndex = -1;

    if (this.currentStallIndex >= 0) {
      if (occupiedIndices.includes(this.currentStallIndex)) {
        showNotification('该摊位已被占用，请重新选择', 'warning');
        this.loadStalls();
        return;
      }
      assignedIndex = this.currentStallIndex;
    } else {
      for (let i = 0; i < MARKET_CONFIG.STALL_POSITIONS.length; i++) {
        if (!occupiedIndices.includes(i)) {
          assignedIndex = i;
          break;
        }
      }
    }

    if (assignedIndex === -1) {
      showNotification('摊位已满，请稍后再试', 'warning');
      return;
    }

    this.currentStallIndex = assignedIndex;

    try {
      // 先扣除摊位费
      player.gold -= stallFee;

      // PocketBase DateTime 格式: "2006-01-02 15:04:05.000Z"
      const expiresAt = new Date(Date.now() + durationMs)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 23) + 'Z';

      const requestData = {
        user_id: OnlineSystem.userId,
        nickname: OnlineSystem.nickname || '匿名',
        stall_index: assignedIndex,
        stall_name: stallName,
        items: itemsToSell.map(s => ({
          item: s.item,
          price: s.price
        })),
        expires_at: expiresAt
      };

      const record = await pb.collection('market_stalls').create(requestData);

      // 上传成功后，才真正从背包移除物品（用 item.id 查找，防止索引错位）
      for (const slotData of itemsToSell) {
        const realIndex = player.inventory.findIndex(inv => inv && inv.id === slotData.item.id);
        if (realIndex !== -1) {
          player.inventory[realIndex] = null;
        }
      }

      this.localStallId = record.id;
      this.isStalling = true;
      this.stallStartTime = Date.now();
      this.stalls.push(record);

      // 移动玩家到摊位位置
      const stallPos = this.getStallWorldPosition(this.currentStallIndex);
      if (stallPos && typeof player !== 'undefined') {
        player.x = stallPos.x;
        player.y = stallPos.y;
        player.target = null;
      }

      // 清空临时数据（保留 currentStallIndex）
      this.setupItems = [];

      // 关闭面板
      document.getElementById('stall-setup-panel').style.display = 'none';
      this.isPanelOpen = false;

      // 显示收摊按钮
      this.showCloseStallButton();

      // 保存游戏，防止物品丢失
      renderInventory();
      if (typeof SaveSystem !== 'undefined') SaveSystem.save();

      showNotification('🛒 开始营业！点击"收摊"结束', 'success');
      if (typeof AudioSys !== 'undefined') AudioSys.play('levelup');
      console.log('[摆摊系统] 开始摆摊:', record.id);

      // 发送摆摊公告
      if (typeof OnlineSystem !== 'undefined' && stallName) {
        OnlineSystem.announce('stall_open', stallName);
      }

    } catch (e) {
      console.error('[摆摊系统] 开始摆摊失败:', e);

      // 退还摊位费
      player.gold += stallFee;

      // 显示详细错误信息
      let errorMsg = e.message || '未知错误';
      if (e.data && e.data.data) {
        // PocketBase 字段验证错误
        const fieldErrors = Object.entries(e.data.data)
          .map(([k, v]) => `${k}: ${v.message || v}`)
          .join(', ');
        errorMsg = fieldErrors || errorMsg;
      }
      showNotification('摆摊失败: ' + errorMsg, 'error');

      // 物品还在背包，不需要返还
      this.setupItems = [];
    }
  },

  // ========== 收摊 ==========
  async closeStall() {
    if (!this.localStallId) return;

    try {
      // 获取当前摊位数据
      const stallData = this.stalls.find(s => s.id === this.localStallId);

      if (stallData) {
        // 返还未售出的物品
        const items = this.parseItems(stallData.items);

        for (const slotData of items) {
          if (slotData && slotData.item) {
            if (!addItemToInventory(slotData.item)) {
              // 背包满了，掉落到地上
              groundItems.push({
                x: player.x + Math.random() * 40 - 20,
                y: player.y + Math.random() * 40 - 20,
                item: slotData.item
              });
            }
          }
        }
      }

      // 删除服务器记录（忽略404错误）
      try {
        await pb.collection('market_stalls').delete(this.localStallId);
      } catch (deleteErr) {
        // 404 表示记录已不存在，不是真正的错误
        if (deleteErr.status !== 404) {
          throw deleteErr;
        }
      }

      this.stalls = this.stalls.filter(s => s.id !== this.localStallId);
      this.localStallId = null;
      this.isStalling = false;
      this.stallStartTime = null;
      this.currentStallIndex = -1;

      // 隐藏收摊按钮
      this.hideCloseStallButton();

      showNotification('已收摊，商品已返还', 'success');
      renderInventory();

    } catch (e) {
      console.error('[摆摊系统] 收摊失败:', e);

      // 即使失败也强制清理本地状态
      this.stalls = this.stalls.filter(s => s.id !== this.localStallId);
      this.localStallId = null;
      this.isStalling = false;
      this.stallStartTime = null;
      this.currentStallIndex = -1;
      this.hideCloseStallButton();

      showNotification('已收摊', 'info');
    }
  },

  // ========== 打开查看摊位面板 ==========
  openViewPanel(stallPoint) {
    const stall = stallPoint.stall;
    if (!stall) return;

    this.currentViewStall = stall; // 保存当前查看的摊位

    const panel = document.getElementById('stall-view-panel');
    const header = document.getElementById('stall-view-header');
    const content = document.getElementById('stall-view-content');

    if (!panel || !content) return;

    header.innerHTML = `🛒 ${this.escapeHtml(stall.stall_name)} <span style="color:#888">(${this.escapeHtml(stall.nickname)})</span>`;

    // 解析商品数据
    const items = this.parseItems(stall.items);

    // 清空并使用 DOM 方式渲染
    content.innerHTML = '';

    if (items.length === 0) {
      content.innerHTML = '<div class="stall-empty-notice">摊位空空如也</div>';
      panel.style.display = 'block';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'stall-view-grid';

    for (let i = 0; i < items.length; i++) {
      const slotData = items[i];
      if (!slotData || !slotData.item) continue;

      const item = slotData.item;
      const color = getRarityColor(item.rarity);
      const taxAmount = Math.ceil(slotData.price * MARKET_CONFIG.TAX_RATE);

      const row = document.createElement('div');
      row.className = 'stall-view-item';

      // 物品图标
      const iconBox = document.createElement('div');
      iconBox.className = 'stall-view-icon';
      iconBox.style.borderColor = color;
      if (typeof applyItemSpriteToElement === 'function') {
        applyItemSpriteToElement(iconBox, item);
      }
      if (typeof bindItemTooltip === 'function') {
        bindItemTooltip(iconBox, item);
      }
      row.appendChild(iconBox);

      // 物品信息
      const info = document.createElement('div');
      info.className = 'stall-view-info';
      info.innerHTML = `
        <div class="stall-view-name" style="color:${color}">${this.escapeHtml(item.name)}</div>
        <div class="stall-view-price">${slotData.price}G <span class="stall-tax">+${taxAmount}G税</span></div>
      `;
      row.appendChild(info);

      // 购买按钮
      const buyBtn = document.createElement('button');
      buyBtn.className = 'stall-buy-btn';

      const isMyStall = (stall.user_id === OnlineSystem?.userId);

      if (isMyStall) {
        buyBtn.textContent = '我的';
        buyBtn.disabled = true;
        buyBtn.style.opacity = '0.5';
        buyBtn.style.cursor = 'default';
        buyBtn.style.background = '#555';
      } else {
        buyBtn.textContent = '购买';
        buyBtn.onclick = (e) => {
          e.stopPropagation();
          MarketSystem.buyItem(stall.id, i);
        };
      }
      row.appendChild(buyBtn);

      grid.appendChild(row);
    }

    content.appendChild(grid);
    panel.style.display = 'block';
  },

  // 关闭查看面板
  closeViewPanel() {
    const panel = document.getElementById('stall-view-panel');
    if (panel) panel.style.display = 'none';
  },

  // ========== 购买商品 ==========
  async buyItem(stallId, itemIndex) {
    if (typeof pb === 'undefined' || typeof player === 'undefined') return;

    try {
      // 重新获取最新摊位数据
      const stall = await pb.collection('market_stalls').getOne(stallId);

      // 禁止购买自己的
      if (stall.user_id === OnlineSystem?.userId) {
        showNotification('不能购买自己的商品', 'warning');
        return;
      }

      const items = this.parseItems(stall.items);
      const slotData = items[itemIndex];

      if (!slotData || !slotData.item) {
        showNotification('商品已售出', 'warning');
        this.closeViewPanel();
        return;
      }

      const taxAmount = Math.ceil(slotData.price * MARKET_CONFIG.TAX_RATE);
      const totalPrice = slotData.price + taxAmount;

      // 检查金币
      if (player.gold < totalPrice) {
        showNotification(`金币不足，需要 ${totalPrice}G`, 'warning');
        return;
      }

      // 检查背包空间
      const emptySlot = player.inventory.findIndex(i => i === null);
      if (emptySlot === -1) {
        showNotification('背包已满', 'warning');
        return;
      }

      // 显示购买确认弹窗
      this.showBuyConfirmDialog(stall, slotData, itemIndex, totalPrice, taxAmount, emptySlot);

    } catch (e) {
      console.error('[摆摊系统] 获取商品失败:', e);
      showNotification('获取商品信息失败', 'error');
    }
  },

  // 显示购买确认弹窗
  showBuyConfirmDialog(stall, slotData, itemIndex, totalPrice, taxAmount, emptySlot) {
    // 创建弹窗（如果不存在）
    let dialog = document.getElementById('buy-confirm-dialog');
    if (!dialog) {
      dialog = document.createElement('div');
      dialog.id = 'buy-confirm-dialog';
      dialog.className = 'stall-price-overlay';
      dialog.onmousedown = (e) => e.stopPropagation();
      document.querySelector('.ui-layer')?.appendChild(dialog);
    }

    const item = slotData.item;
    const color = getRarityColor(item.rarity);

    dialog.innerHTML = `
      <div class="stall-price-box buy-confirm-box">
        <div class="stall-price-title">确认购买</div>
        <div class="buy-confirm-item" style="color:${color}">${this.escapeHtml(item.name)}</div>
        <div class="buy-confirm-price">
          <div>售价: ${slotData.price}G</div>
          <div class="buy-confirm-tax">+ 税费: ${taxAmount}G</div>
          <div class="buy-confirm-total">= 总计: ${totalPrice}G</div>
        </div>
        <div class="stall-price-actions">
          <button class="stall-btn primary" id="buy-confirm-yes">确认购买</button>
          <button class="stall-btn" id="buy-confirm-no">取消</button>
        </div>
      </div>
    `;

    dialog.style.display = 'flex';

    // 绑定按钮事件
    document.getElementById('buy-confirm-yes').onclick = () => {
      dialog.style.display = 'none';
      this.executeBuy(stall, slotData, itemIndex, totalPrice, emptySlot);
    };
    document.getElementById('buy-confirm-no').onclick = () => {
      dialog.style.display = 'none';
    };
  },

  // 执行购买
  async executeBuy(stall, slotData, itemIndex, totalPrice, emptySlot) {
    const serverResult = await this.tryServerPurchase(stall, slotData, itemIndex, totalPrice, emptySlot);
    if (serverResult === 'handled') return;
    return this.executeLegacyBuy(stall, slotData, itemIndex, totalPrice, emptySlot);
  },

  async executeLegacyBuy(stall, slotData, itemIndex, totalPrice, emptySlot) {
    const lockKey = `${stall.id}:${slotData.item?.id || itemIndex}`;
    if (this.buyLocks.has(lockKey)) {
      showNotification('购买处理中，请稍候', 'warning');
      return;
    }
    this.buyLocks.add(lockKey);
    let lockAcquired = false;
    let purchaseCompleted = false;
    let lockToken = null;

    try {
      // 重新获取最新数据防止商品已售
      const latestStall = await pb.collection('market_stalls').getOne(stall.id);
      const items = this.parseItems(latestStall.items);
      const latestSlot = items[itemIndex];

      if (!latestSlot || latestSlot.item?.id !== slotData.item.id) {
        showNotification('商品已售出', 'warning');
        this.closeViewPanel();
        return;
      }

      const taxAmount = Math.ceil(latestSlot.price * MARKET_CONFIG.TAX_RATE);
      const latestTotalPrice = latestSlot.price + taxAmount;
      if (latestTotalPrice !== totalPrice) {
        showNotification('商品价格已变化，请重新确认', 'warning');
        this.closeViewPanel();
        return;
      }
      if (player.gold < latestTotalPrice) {
        showNotification(`金币不足，需要 ${latestTotalPrice}G`, 'warning');
        return;
      }

      const buyerId = OnlineSystem?.userId || 'anonymous';
      lockToken = `${buyerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const lockedItems = items.map((entry, idx) => {
        if (idx !== itemIndex || !entry) return entry;
        return { ...entry, lockedBy: buyerId, lockToken, lockedAt: Date.now() };
      });

      await pb.collection('market_stalls').update(stall.id, { items: lockedItems });

      const lockedStall = await pb.collection('market_stalls').getOne(stall.id);
      const lockedLatestItems = this.parseItems(lockedStall.items);
      const lockedSlot = lockedLatestItems[itemIndex];
      if (!lockedSlot || lockedSlot.item?.id !== slotData.item.id || lockedSlot.lockToken !== lockToken) {
        showNotification('商品正在被其他玩家购买，请稍后重试', 'warning');
        this.closeViewPanel();
        return;
      }
      lockAcquired = true;

      const targetEmptySlot = player.inventory[emptySlot] === null
        ? emptySlot
        : player.inventory.findIndex(i => i === null);
      if (targetEmptySlot === -1) {
        showNotification('背包已满', 'warning');
        return;
      }

      const finalItems = lockedLatestItems.filter((_, idx) => idx !== itemIndex);

      if (finalItems.length === 0) {
        await pb.collection('market_stalls').delete(stall.id);
        this.closeViewPanel();
      } else {
        await pb.collection('market_stalls').update(stall.id, { items: finalItems });
      }
      purchaseCompleted = true;

      // 扣除金币
      player.gold -= totalPrice;

      // 添加到背包
      player.inventory[targetEmptySlot] = lockedSlot.item;

      // 创建销售记录（给卖家的收益）
      try {
        await pb.collection('market_sales').create({
          seller_id: stall.user_id,
          buyer_id: buyerId,
          buyer_name: OnlineSystem?.nickname || '匿名玩家',
          item_name: lockedSlot.item.name,
          price: latestSlot.price,
          claimed: false
        });
      } catch (saleErr) {
        console.warn('[摆摊系统] 创建销售记录失败:', saleErr);
      }

      showNotification(`购买成功: ${lockedSlot.item.name} (-${totalPrice}G)`, 'success');
      if (typeof AudioSys !== 'undefined') AudioSys.play('gold');

      updateStats();
      renderInventory();
      this.closeViewPanel();
      SaveSystem?.save();

    } catch (e) {
      console.error('[摆摊系统] 购买失败:', e);
      showNotification('购买失败: ' + e.message, 'error');
    } finally {
      if (lockAcquired && !purchaseCompleted && lockToken) {
        try {
          const lockedStall = await pb.collection('market_stalls').getOne(stall.id);
          const lockedItems = this.parseItems(lockedStall.items);
          const lockedSlot = lockedItems[itemIndex];
          if (lockedSlot?.lockToken === lockToken) {
            const restoredItems = lockedItems.map((entry, idx) => {
              if (idx !== itemIndex || !entry) return entry;
              const { lockedBy, lockToken: _lockToken, lockedAt, ...restored } = entry;
              return restored;
            });
            await pb.collection('market_stalls').update(stall.id, { items: restoredItems });
          }
        } catch (unlockErr) {
          console.warn('[摆摊系统] 释放购买锁失败:', unlockErr);
        }
      }
      this.buyLocks.delete(lockKey);
    }
  },

  // ========== 渲染摊位到游戏世界 ==========
  drawStalls(ctx) {
    const points = this.getStallInteractionPoints();

    for (const point of points) {
      // 注意：draw() 函数已经做了 ctx.translate(-camera.x, -camera.y)
      // 所以这里直接使用世界坐标，不需要再减去 camera 偏移
      if (point.stall) {
        // 有人摆摊：绘制摊主（但如果是自己的摊位就跳过，因为玩家已在渲染）
        if (point.stall.user_id !== OnlineSystem?.userId) {
          this.drawStallOwner(ctx, point.x, point.y, point.stall);
        } else {
          // 只绘制自己摊位的名称气泡（底座 + 气泡，不绘制摊主精灵）
          this.drawStallNameBubble(ctx, point.x, point.y, point.stall);
        }
      } else {
        // 空摊位：绘制底座 + "空"字标识
        this.drawStallBase(ctx, point.x, point.y, point.index, true);
      }
    }
  },

  // 绘制摊位底座（空摊位和有人摊位共用）
  // isEmpty: true 显示"空"字，false 不显示
  drawStallBase(ctx, x, y, index, isEmpty = true) {
    ctx.save();

    // 地面投影
    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.beginPath();
    ctx.ellipse(x, y + 24, 42, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    // 摊位地毯
    const rug = ctx.createLinearGradient(x, y - 4, x, y + 30);
    rug.addColorStop(0, '#5a261f');
    rug.addColorStop(1, '#2b1511');
    ctx.fillStyle = rug;
    ctx.beginPath();
    ctx.roundRect(x - 35, y + 2, 70, 30, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 180, 96, 0.26)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 29, y + 8, 58, 16);

    // 木质货台
    const wood = ctx.createLinearGradient(x, y - 12, x, y + 24);
    wood.addColorStop(0, '#765034');
    wood.addColorStop(0.55, '#4a2f1d');
    wood.addColorStop(1, '#24140b');
    ctx.fillStyle = wood;
    ctx.beginPath();
    ctx.roundRect(x - 31, y - 11, 62, 34, 5);
    ctx.fill();

    // 顶棚布帘
    const canopy = ctx.createLinearGradient(x, y - 36, x, y - 16);
    canopy.addColorStop(0, isEmpty ? '#4b3a30' : '#8f2f2b');
    canopy.addColorStop(1, isEmpty ? '#2a211d' : '#4a1714');
    ctx.fillStyle = canopy;
    ctx.beginPath();
    ctx.roundRect(x - 36, y - 38, 72, 18, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 205, 126, 0.25)';
    ctx.stroke();

    // 支柱
    ctx.strokeStyle = '#2a170d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 28, y - 22);
    ctx.lineTo(x - 26, y + 22);
    ctx.moveTo(x + 28, y - 22);
    ctx.lineTo(x + 26, y + 22);
    ctx.stroke();

    // 木纹和商品色块
    ctx.strokeStyle = 'rgba(255, 210, 140, 0.20)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x - 23, y - 4 + i * 8);
      ctx.lineTo(x + 23, y - 6 + i * 8);
      ctx.stroke();
    }
    if (!isEmpty) {
      ctx.fillStyle = '#d8b064';
      ctx.fillRect(x - 18, y - 4, 8, 6);
      ctx.fillStyle = '#7aa6ff';
      ctx.fillRect(x + 3, y - 5, 7, 7);
      ctx.fillStyle = '#8ed16f';
      ctx.fillRect(x + 15, y + 2, 6, 5);
    }

    // 空摊位显示"空"字和编号
    if (isEmpty) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';
      ctx.beginPath();
      ctx.roundRect(x - 20, y - 1, 40, 18, 4);
      ctx.fill();
      ctx.fillStyle = '#b9a27a';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('空', x, y + 8);

      ctx.fillStyle = '#75634a';
      ctx.font = '10px Arial';
      ctx.fillText(`#${index + 1}`, x, y + 32);
    }

    ctx.restore();
  },

  // 绘制摊主
  drawStallOwner(ctx, x, y, stall) {
    // 先绘制木质底座（不显示"空"字）
    this.drawStallBase(ctx, x, y, 0, false);

    // 摊主 (使用坐姿精灵图，第一排第5帧 frame index 4)
    // 使用与 game.js 玩家绘制相同的参数，保持视觉一致性
    if (typeof processedSpriteSheet !== 'undefined' && processedSpriteSheet && typeof SPRITE_CONFIG !== 'undefined') {
      const frame = {
        x: 4 * SPRITE_CONFIG.frameWidth, // sit = 4 (第5帧)
        y: SPRITE_CONFIG.heroRow * SPRITE_CONFIG.frameHeight,
        width: SPRITE_CONFIG.frameWidth,
        height: SPRITE_CONFIG.frameHeight
      };

      // 与 game.js 保持一致的渲染参数
      const renderHeight = 48;
      const renderWidth = renderHeight * frame.width / frame.height;
      ctx.drawImage(
        processedSpriteSheet,
        frame.x, frame.y, frame.width, frame.height,
        x - renderWidth / 2, y - renderHeight / 2, renderWidth, renderHeight
      );
    } else {
      // 备用：简易蓝色小人
      ctx.fillStyle = '#4a90d9';
      ctx.beginPath();
      ctx.arc(x, y - 15, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 8, y - 5, 16, 20);
    }

    // 摊位名称气泡
    const name = stall.stall_name || '摊位';
    ctx.font = 'bold 11px Arial';
    const textWidth = ctx.measureText(name).width;

    // 气泡背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const bubbleWidth = textWidth + 12;
    const bubbleHeight = 18;
    ctx.beginPath();
    ctx.roundRect(x - bubbleWidth / 2, y - 45, bubbleWidth, bubbleHeight, 4);
    ctx.fill();

    // 气泡三角
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 27);
    ctx.lineTo(x + 5, y - 27);
    ctx.lineTo(x, y - 22);
    ctx.fill();

    // 文字
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y - 36);

    // 昵称
    ctx.fillStyle = '#fff';
    ctx.font = '10px Arial';
    ctx.fillText(stall.nickname, x, y + 35);
  },

  // 只绘制摊位名称气泡（自己的摊位用，不绘制摊主精灵）
  drawStallNameBubble(ctx, x, y, stall) {
    // 先绘制木质底座（不显示"空"字）
    this.drawStallBase(ctx, x, y, 0, false);

    const name = stall.stall_name || '摊位';
    ctx.font = 'bold 11px Arial';
    const textWidth = ctx.measureText(name).width;

    // 气泡背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    const bubbleWidth = textWidth + 12;
    const bubbleHeight = 18;
    ctx.beginPath();
    ctx.roundRect(x - bubbleWidth / 2, y - 45, bubbleWidth, bubbleHeight, 4);
    ctx.fill();

    // 气泡三角
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 27);
    ctx.lineTo(x + 5, y - 27);
    ctx.lineTo(x, y - 22);
    ctx.fill();

    // 文字
    ctx.fillStyle = '#ffd700';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y - 36);
  }
};

// ========== 辅助函数 ==========
// 获取物品图标 (复用现有逻辑或提供默认)
function getItemIcon(item) {
  if (!item) return '?';

  // 尝试使用现有的 getItemEmoji 函数
  if (typeof getItemEmoji === 'function') {
    return getItemEmoji(item);
  }

  // 默认图标
  const iconMap = {
    'weapon': '⚔️',
    'armor': '🛡️',
    'helm': '🪖',
    'gloves': '🧤',
    'boots': '👢',
    'belt': '🎗️',
    'ring': '💍',
    'amulet': '📿',
    'potion': '🧪'
  };
  return iconMap[item.type] || '📦';
}
