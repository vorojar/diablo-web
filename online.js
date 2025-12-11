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
            // this.showNicknameDialog();
        } else {
            await this.startOnline();
        }

        this.loadOnlineCount();
        this.loadLeaderboard();
    },

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
    updateOnlineDisplay(count) {
        let el = document.getElementById('online-count');
        if (!el) {
            el = document.createElement('div');
            el.id = 'online-count';
            document.querySelector('.ui-layer')?.appendChild(el);
        }
        el.innerHTML = `🟢 在线: ${count * 9}`;
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
                }
            } else {
                await pb.collection('leaderboard').create(scoreData);
            }

            this.loadLeaderboard();
        } catch (e) { }
    },

    // 加载排行榜
    async loadLeaderboard() {
        try {
            const records = await pb.collection('leaderboard').getList(1, 10, {
                sort: '-score'
            });
            this.updateLeaderboardDisplay(records.items || []);
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
        html += '<div class="pb-title">我的记录</div>';
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

    leaderboardData: []
};

// 页面加载后初始化
window.addEventListener('load', () => {
    setTimeout(() => OnlineSystem.init(), 1000);
});
