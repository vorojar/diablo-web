// PocketBase 在线系统（使用官方 SDK）
const PB_URL = 'https://maikami.com/pb';
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

const OnlineSystem = {
    userId: null,
    nickname: null,
    recordId: null,
    heartbeatTimer: null,

    // 初始化
    async init() {
        this.userId = localStorage.getItem('pb_user_id');
        this.nickname = localStorage.getItem('pb_nickname');

        if (!this.nickname) {
            this.showNicknameDialog();
        } else {
            await this.startOnline();
        }

        this.loadOnlineCount();
        // 创建排行榜按钮（数据延迟加载）
        this.createLeaderboardUI();
    },

    // 创建排行榜按钮和面板（不加载数据）
    createLeaderboardUI() {
        let leftBtns = document.getElementById('left-menu-btns');
        if (!leftBtns) {
            leftBtns = document.createElement('div');
            leftBtns.id = 'left-menu-btns';
            leftBtns.className = 'menu-btns';
            leftBtns.style.cssText = 'left: 20px; right: auto;';
            leftBtns.onmousedown = (e) => e.stopPropagation();
            document.querySelector('.ui-layer')?.appendChild(leftBtns);
        }

        let btn = document.getElementById('btn-leaderboard');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'btn-leaderboard';
            btn.className = 'sys-btn';
            btn.innerHTML = '🏆 排行榜';
            btn.onclick = () => {
                togglePanel('leaderboard');
                // 点击时才加载数据
                this.loadLeaderboard();
            };
            btn.onmousedown = (e) => e.stopPropagation();
            leftBtns.appendChild(btn);
        }

        let panel = document.getElementById('leaderboard-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'leaderboard-panel';
            panel.className = 'panel';
            panel.style.cssText = 'top: 15%; left: 20px; width: 320px;';
            panel.onmousedown = (e) => e.stopPropagation();
            panel.innerHTML = '<div class="panel-close" onclick="togglePanel(\'leaderboard\')">X</div><div class="panel-header">🏆 排行榜</div><div style="color: #666; text-align: center; padding: 20px;">加载中...</div>';
            document.querySelector('.ui-layer')?.appendChild(panel);
        }
    },

    // 排行榜缓存
    leaderboardCache: null,
    leaderboardCacheTime: 0,
    CACHE_DURATION: 5 * 60 * 1000,  // 5分钟缓存

    // 显示昵称输入框
    showNicknameDialog() {
        const overlay = document.createElement('div');
        overlay.id = 'nickname-overlay';
        overlay.innerHTML = `
            <div class="nickname-dialog">
                <div class="nickname-title">欢迎来到庇护所</div>
                <div class="nickname-desc">请输入你的英雄名称</div>
                <input type="text" id="nickname-input" maxlength="12" placeholder="2-12个字符">
                <button id="nickname-confirm">确认</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('nickname-confirm').onclick = () => {
            const input = document.getElementById('nickname-input').value.trim();
            if (input.length >= 2 && input.length <= 12) {
                this.setNickname(input);
                overlay.remove();
            } else {
                alert('昵称需要2-12个字符');
            }
        };

        document.getElementById('nickname-input').onkeydown = (e) => {
            if (e.key === 'Enter') {
                document.getElementById('nickname-confirm').click();
            }
        };
    },

    // 设置昵称
    async setNickname(name) {
        this.nickname = name;
        localStorage.setItem('pb_nickname', name);

        if (!this.userId) {
            this.userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
            localStorage.setItem('pb_user_id', this.userId);
        }

        await this.startOnline();
    },

    // 开始在线状态
    async startOnline() {
        await this.updateOnlineStatus();
        this.heartbeatTimer = setInterval(() => this.updateOnlineStatus(), 30000);
        window.addEventListener('beforeunload', () => this.goOffline());
    },

    // 更新在线状态
    async updateOnlineStatus() {
        try {
            const records = await pb.collection('online').getList(1, 1, {
                filter: `user_id = "${this.userId}"`
            });

            if (records.items.length > 0) {
                this.recordId = records.items[0].id;
                await pb.collection('online').update(this.recordId, {
                    last_active: new Date().toISOString()
                });
            } else {
                const record = await pb.collection('online').create({
                    user_id: this.userId,
                    nickname: this.nickname,
                    last_active: new Date().toISOString()
                });
                this.recordId = record.id;
            }
        } catch (e) { }
    },

    // 下线
    async goOffline() {
        if (this.recordId) {
            try {
                await pb.collection('online').delete(this.recordId);
            } catch (e) { }
        }
    },

    // 加载在线人数（只统计2分钟内活跃的用户）
    async loadOnlineCount() {
        try {
            // 计算2分钟前的时间（转换为 PocketBase 格式：空格替代 T）
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString().replace('T', ' ');
            const records = await pb.collection('online').getList(1, 1, {
                filter: `last_active >= "${twoMinutesAgo}"`
            });
            this.updateOnlineDisplay(records.totalItems || 0);

            // 清理超过5分钟的僵尸记录
            this.cleanupStaleRecords();
        } catch (e) {
            this.updateOnlineDisplay(0);
        }
        setTimeout(() => this.loadOnlineCount(), 60000);
    },

    // 清理僵尸记录（超过5分钟未活跃的）
    async cleanupStaleRecords() {
        try {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace('T', ' ');
            const staleRecords = await pb.collection('online').getList(1, 50, {
                filter: `last_active < "${fiveMinutesAgo}"`
            });
            for (const record of staleRecords.items) {
                try {
                    await pb.collection('online').delete(record.id);
                } catch (e) { }
            }
        } catch (e) { }
    },

    // 更新在线人数显示
    // 更新在线人数显示
    updateOnlineDisplay(count) {
        // 暂时隐藏在线人数显示
        let el = document.getElementById('online-count');
        if (el) {
            el.style.display = 'none';
        }
        return;
        /*
        if (!el) {
            el = document.createElement('div');
            el.id = 'online-count';
            document.querySelector('.ui-layer')?.appendChild(el);
        }
        el.innerHTML = `🟢 在线: ${count * 9}`;
        */
    },

    // 提交分数到排行榜
    async submitScore(data) {
        if (!this.userId || !this.nickname) return;

        const scoreData = {
            user_id: this.userId,
            nickname: this.nickname,
            level: data.level || 1,
            kills: data.kills || 0,
            max_floor: data.maxFloor || 0,
            is_hell: data.isHell || false,
            score: (data.level || 1) * 100 + (data.kills || 0) + (data.maxFloor || 0) * 50
        };

        try {
            const records = await pb.collection('leaderboard').getList(1, 1, {
                filter: `user_id = "${this.userId}"`
            });

            if (records.items.length > 0) {
                if (scoreData.score > records.items[0].score) {
                    await pb.collection('leaderboard').update(records.items[0].id, scoreData);
                    this.loadLeaderboard(true);  // 强制刷新
                }
            } else {
                await pb.collection('leaderboard').create(scoreData);
                this.loadLeaderboard(true);  // 强制刷新
            }
        } catch (e) { }
    },

    // 加载排行榜（带缓存）
    async loadLeaderboard(forceRefresh = false) {
        const now = Date.now();

        // 使用缓存（5分钟内不重复请求）
        if (!forceRefresh && this.leaderboardCache && (now - this.leaderboardCacheTime) < this.CACHE_DURATION) {
            this.updateLeaderboardDisplay(this.leaderboardCache);
            return;
        }

        try {
            const records = await pb.collection('leaderboard').getList(1, 10, {
                sort: '-score'
            });
            this.leaderboardCache = records.items || [];
            this.leaderboardCacheTime = now;
            this.updateLeaderboardDisplay(this.leaderboardCache);
        } catch (e) { }
    },

    // 更新排行榜显示
    updateLeaderboardDisplay(items) {
        let leftBtns = document.getElementById('left-menu-btns');
        if (!leftBtns) {
            leftBtns = document.createElement('div');
            leftBtns.id = 'left-menu-btns';
            leftBtns.className = 'menu-btns';
            leftBtns.style.cssText = 'left: 20px; right: auto;';
            leftBtns.onmousedown = (e) => e.stopPropagation();
            document.querySelector('.ui-layer')?.appendChild(leftBtns);
        }

        let btn = document.getElementById('btn-leaderboard');
        if (!btn) {
            btn = document.createElement('button');
            btn.id = 'btn-leaderboard';
            btn.className = 'sys-btn';
            btn.innerHTML = '🏆 排行榜';
            btn.onclick = () => togglePanel('leaderboard');
            btn.onmousedown = (e) => e.stopPropagation();
            leftBtns.appendChild(btn);
        }

        let panel = document.getElementById('leaderboard-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'leaderboard-panel';
            panel.className = 'panel';
            panel.style.cssText = 'top: 15%; left: 20px; width: 320px;';
            panel.onmousedown = (e) => e.stopPropagation();
            document.querySelector('.ui-layer')?.appendChild(panel);
        }

        this.renderLeaderboardContent(panel, items);
        this.leaderboardData = items;
    },

    // 当前选中的榜单类型
    currentTab: 'score',

    // 渲染排行榜内容
    renderLeaderboardContent(panel, items) {
        let html = '<div class="panel-close" onclick="togglePanel(\'leaderboard\')">X</div>';
        html += '<div class="panel-header">🏆 排行榜</div>';

        // 个人最佳记录区域
        html += this.renderPersonalBest();

        // 榜单标签页
        html += `<div class="leaderboard-tabs">
            <span class="lb-tab ${this.currentTab === 'score' ? 'active' : ''}" onclick="OnlineSystem.switchTab('score')">综合</span>
            <span class="lb-tab ${this.currentTab === 'kills' ? 'active' : ''}" onclick="OnlineSystem.switchTab('kills')">击杀</span>
            <span class="lb-tab ${this.currentTab === 'floor' ? 'active' : ''}" onclick="OnlineSystem.switchTab('floor')">层数</span>
        </div>`;

        // 排行榜列表
        if (items.length === 0) {
            html += '<div style="color: #666; text-align: center; padding: 20px;">暂无数据</div>';
        } else {
            const sortedItems = this.sortByTab(items);
            sortedItems.forEach((item, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                const isMe = item.user_id === this.userId;
                const valueText = this.getValueText(item);
                html += `<div class="stat-row" style="${isMe ? 'color: #ffff00; background: rgba(255,255,0,0.1);' : ''}">
                    <span>${medal} ${item.nickname}</span>
                    <span style="color: #888;">${valueText}</span>
                </div>`;
            });
        }

        panel.innerHTML = html;
        this.bindPanelDrag(panel);
    },

    // 渲染个人最佳记录
    renderPersonalBest() {
        // 检查 player 对象是否存在
        if (typeof player === 'undefined' || !player.personalBest) {
            return '';
        }
        const pb = player.personalBest;
        const stats = player.stats || {};

        let html = '<div class="personal-best">';
        html += `<div class="pb-title">欢迎你 ${OnlineSystem.nickname || '勇士'}</div>`;
        html += '<div class="pb-grid">';
        html += `<div class="pb-item"><span class="pb-label">最高等级</span><span class="pb-value">Lv${pb.maxLevel || 1}</span></div>`;

        // 显示最高层数（普通或地狱）
        if (pb.maxHellFloor > 0) {
            html += `<div class="pb-item"><span class="pb-label">地狱层数</span><span class="pb-value" style="color:#ff6600;">${pb.maxHellFloor}层</span></div>`;
        } else {
            html += `<div class="pb-item"><span class="pb-label">最高层数</span><span class="pb-value">${pb.maxFloor || 0}层</span></div>`;
        }

        html += `<div class="pb-item"><span class="pb-label">总击杀</span><span class="pb-value">${player.kills || 0}</span></div>`;
        html += `<div class="pb-item"><span class="pb-label">Boss击杀</span><span class="pb-value" style="color:#ff4444;">${stats.bossKills || 0}</span></div>`;
        html += '</div></div>';
        return html;
    },

    // 切换榜单标签
    switchTab(tab) {
        this.currentTab = tab;
        const panel = document.getElementById('leaderboard-panel');
        if (panel && this.leaderboardData) {
            this.renderLeaderboardContent(panel, this.leaderboardData);
        }
    },

    // 根据当前标签排序
    sortByTab(items) {
        const sorted = [...items];
        switch (this.currentTab) {
            case 'kills':
                return sorted.sort((a, b) => (b.kills || 0) - (a.kills || 0));
            case 'floor':
                return sorted.sort((a, b) => {
                    const aFloor = a.is_hell ? (a.max_floor || 0) + 10 : (a.max_floor || 0);
                    const bFloor = b.is_hell ? (b.max_floor || 0) + 10 : (b.max_floor || 0);
                    return bFloor - aFloor;
                });
            default: // score
                return sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
    },

    // 根据当前标签获取显示文本
    getValueText(item) {
        switch (this.currentTab) {
            case 'kills':
                return `${item.kills || 0} 击杀`;
            case 'floor':
                return item.is_hell ? `地狱${item.max_floor}层` : `${item.max_floor}层`;
            default:
                return `Lv${item.level} ${item.is_hell ? '地狱' + item.max_floor : item.max_floor + '层'}`;
        }
    },

    // 绑定面板拖动
    bindPanelDrag(panel) {
        const header = panel.querySelector('.panel-header');
        if (!header) return;

        let dragOffsetX = 0, dragOffsetY = 0, isDragging = false;

        header.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDragging = true;

            document.querySelectorAll('.panel').forEach(p => p.style.zIndex = 60);
            panel.style.zIndex = 61;

            const rect = panel.getBoundingClientRect();
            panel.style.left = rect.left + 'px';
            panel.style.top = rect.top + 'px';
            panel.style.transform = 'none';

            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;

            const onMove = (e) => {
                if (isDragging) {
                    panel.style.left = (e.clientX - dragOffsetX) + 'px';
                    panel.style.top = (e.clientY - dragOffsetY) + 'px';
                }
            };
            const onUp = () => {
                isDragging = false;
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        };
    },

    leaderboardData: [],

    // ========== 全服公告系统 ==========
    announcementQueue: [],      // 公告队列
    isScrolling: false,         // 是否正在滚动
    lastAnnouncementTime: 0,    // 上次获取公告时间
    shownAnnouncementIds: new Set(),  // 已显示的公告ID（防重复）
    realtimeSubscribed: false,  // 是否已订阅 Realtime

    // 初始化公告系统
    initAnnouncements() {
        this.createAnnouncementUI();
        this.loadAnnouncements();  // 先加载历史公告

        // ========== 方案B: Realtime 实时推送 ==========
        this.subscribeAnnouncements();

        // ========== 方案A: 轮询（已注释） ==========
        // setInterval(() => this.loadAnnouncements(), 30000);
    },

    // Realtime 订阅公告
    async subscribeAnnouncements() {
        try {
            // 订阅 announcements 表的所有变更
            await pb.collection('announcements').subscribe('*', (e) => {
                // 只处理新创建的公告
                if (e.action === 'create') {
                    const record = e.record;
                    // 防重复
                    if (!this.shownAnnouncementIds.has(record.id)) {
                        this.shownAnnouncementIds.add(record.id);
                        this.announcementQueue.push(this.formatAnnouncement(record));

                        // 如果没在滚动，立即开始
                        if (!this.isScrolling) {
                            this.scrollNextAnnouncement();
                        }
                    }
                }
            });
            this.realtimeSubscribed = true;
            console.log('[公告系统] Realtime 订阅成功');
        } catch (e) {
            console.warn('[公告系统] Realtime 订阅失败，降级为轮询模式', e);
            // 降级为轮询模式
            setInterval(() => this.loadAnnouncements(), 30000);
        }
    },

    // 取消订阅（页面关闭时调用）
    unsubscribeAnnouncements() {
        if (this.realtimeSubscribed) {
            pb.collection('announcements').unsubscribe('*');
            this.realtimeSubscribed = false;
        }
    },

    // 创建公告UI
    createAnnouncementUI() {
        let bar = document.getElementById('announcement-bar');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'announcement-bar';
            bar.innerHTML = '<div id="announcement-content"></div>';
            document.querySelector('.ui-layer')?.appendChild(bar);
        }
    },

    // 加载历史公告（初始化时调用一次）
    async loadAnnouncements() {
        try {
            // 获取最近5分钟的公告
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace('T', ' ');
            const records = await pb.collection('announcements').getList(1, 20, {
                filter: `created >= "${fiveMinutesAgo}"`,
                sort: '-created'
            });

            // 过滤已显示的公告，添加新公告到队列
            for (const record of records.items.reverse()) {
                if (!this.shownAnnouncementIds.has(record.id)) {
                    this.shownAnnouncementIds.add(record.id);
                    this.announcementQueue.push(this.formatAnnouncement(record));
                }
            }

            // 清理过期的ID（保留最近100条）
            if (this.shownAnnouncementIds.size > 100) {
                const arr = Array.from(this.shownAnnouncementIds);
                this.shownAnnouncementIds = new Set(arr.slice(-50));
            }

            // 开始滚动
            if (!this.isScrolling && this.announcementQueue.length > 0) {
                this.scrollNextAnnouncement();
            }
        } catch (e) { }
    },

    // 格式化公告文本
    formatAnnouncement(record) {
        const floorText = record.is_hell ? `地狱${record.floor}层` : `第${record.floor}层`;
        switch (record.type) {
            case 'boss_kill':
                return {
                    text: `${record.nickname} 在${floorText}击杀了 ${record.target_name}`,
                    type: 'boss'
                };
            case 'set_drop':
                return {
                    text: `${record.nickname} 在${floorText}获得了 ${record.target_name}`,
                    type: 'set'
                };
            case 'level_milestone':
                return {
                    text: `${record.nickname} 达到了 ${record.target_name} 级`,
                    type: 'level'
                };
            case 'enhance_success':
                return {
                    text: `${record.nickname} 将 ${record.target_name} 强化成功`,
                    type: 'enhance'
                };
            default:
                return {
                    text: `${record.nickname}: ${record.target_name}`,
                    type: 'default'
                };
        }
    },

    // 滚动显示下一条公告
    scrollNextAnnouncement() {
        if (this.announcementQueue.length === 0) {
            this.isScrolling = false;
            return;
        }

        this.isScrolling = true;
        const announcement = this.announcementQueue.shift();
        const content = document.getElementById('announcement-content');
        if (!content) return;

        // 设置公告内容和样式
        content.innerText = announcement.text;
        content.className = announcement.type === 'boss' ? 'boss-announcement' : 'set-announcement';

        // 重置动画
        content.style.animation = 'none';
        content.offsetHeight; // 触发重绘
        content.style.animation = 'scrollAnnouncement 8s linear';

        // 动画结束后显示下一条
        setTimeout(() => this.scrollNextAnnouncement(), 8500);
    },

    // 提交公告
    async announce(type, targetName) {
        if (!this.userId || !this.nickname) return;

        const floor = typeof player !== 'undefined' ?
            (player.isInHell ? player.hellFloor : player.floor) : 1;
        const isHell = typeof player !== 'undefined' ? player.isInHell : false;

        try {
            await pb.collection('announcements').create({
                type: type,
                nickname: this.nickname,
                floor: floor,
                is_hell: isHell,
                target_name: targetName
            });
        } catch (e) { }
    }
};

// 页面加载后初始化
window.addEventListener('load', () => {
    setTimeout(() => {
        OnlineSystem.init();
        OnlineSystem.initAnnouncements();
    }, 1000);
});
