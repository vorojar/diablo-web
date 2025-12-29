// ========== 每日任务系统 ==========
// 链式解锁：完成一个才显示下一个
// 目标数值根据玩家等级动态计算

const DailyQuestSystem = {
    // 倒计时定时器
    _countdownTimer: null,

    // 启动倒计时定时器
    startCountdown() {
        this.stopCountdown();
        this._countdownTimer = setInterval(() => {
            const el = document.getElementById('daily-quest-countdown');
            if (el) {
                el.textContent = this.getResetTime();
            } else {
                this.stopCountdown();
            }
        }, 1000);
    },

    // 停止倒计时定时器
    stopCountdown() {
        if (this._countdownTimer) {
            clearInterval(this._countdownTimer);
            this._countdownTimer = null;
        }
    },

    // 任务模板（目标值用函数计算）
    // 简单任务
    EASY_TEMPLATES: [
        { type: 'kill', calcTarget: lvl => 50 + lvl * 10, desc: lvl => `击杀${50 + lvl * 10}只怪物`, rewardMult: 1 },
        { type: 'collect_gold', calcTarget: lvl => 200 + lvl * 50, desc: lvl => `收集${200 + lvl * 50}金币`, rewardMult: 0.8 },
        { type: 'collect_item', calcTarget: lvl => 5 + Math.floor(lvl / 3), desc: lvl => `拾取${5 + Math.floor(lvl / 3)}件装备`, rewardMult: 1 },
        { type: 'use_potion', calcTarget: lvl => 2 + Math.floor(lvl / 5), desc: lvl => `使用${2 + Math.floor(lvl / 5)}瓶药水`, rewardMult: 0.8 },
    ],

    // 中等任务
    MEDIUM_TEMPLATES: [
        { type: 'kill', calcTarget: lvl => 150 + lvl * 20, desc: lvl => `击杀${150 + lvl * 20}只怪物`, rewardMult: 1.5 },
        { type: 'kill_elite', calcTarget: lvl => 3 + Math.floor(lvl / 5), desc: lvl => `击杀${3 + Math.floor(lvl / 5)}只精英怪`, rewardMult: 1.8 },
        { type: 'kill_boss', calcTarget: lvl => 1 + Math.floor(lvl / 10), desc: lvl => `击杀${1 + Math.floor(lvl / 10)}个BOSS`, rewardMult: 2 },
        { type: 'collect_gold', calcTarget: lvl => 800 + lvl * 100, desc: lvl => `收集${800 + lvl * 100}金币`, rewardMult: 1.2 },
    ],

    // 困难任务（奖励技能点）
    HARD_TEMPLATES: [
        { type: 'kill', calcTarget: lvl => 300 + lvl * 30, desc: lvl => `击杀${300 + lvl * 30}只怪物`, rewardMult: 2 },
        { type: 'kill_elite', calcTarget: lvl => 8 + Math.floor(lvl / 3), desc: lvl => `击杀${8 + Math.floor(lvl / 3)}只精英怪`, rewardMult: 2.2 },
        { type: 'kill_boss', calcTarget: lvl => 3 + Math.floor(lvl / 5), desc: lvl => `击杀${3 + Math.floor(lvl / 5)}个BOSS`, rewardMult: 2.5 },
        { type: 'clear_floor', calcTarget: lvl => 3 + Math.floor(lvl / 5), desc: lvl => `通关${3 + Math.floor(lvl / 5)}层地牢`, rewardMult: 2 },
    ],

    // 根据等级计算奖励
    calcReward(lvl, mult, isHard = false) {
        const baseGold = 50 + lvl * 20;
        const baseXp = 30 + lvl * 15;
        return {
            gold: Math.floor(baseGold * mult),
            xp: Math.floor(baseXp * mult),
            ...(isHard ? { skillPoint: 1 } : {})
        };
    },

    // 获取今日日期字符串
    getTodayStr() {
        return new Date().toISOString().slice(0, 10);
    },

    // 初始化/检查重置
    checkAndReset() {
        const today = this.getTodayStr();
        const lvl = player.lvl || 1;

        // 初始化或重置
        if (!player.dailyQuests || player.dailyQuests.date !== today) {
            player.dailyQuests = {
                date: today,
                generatedAtLevel: lvl,
                quests: this.generateQuests(lvl)
            };
            console.log('[每日任务] 已重置:', player.dailyQuests);
        }
    },

    // 生成每日任务
    generateQuests(lvl) {
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];

        const easy = pick(this.EASY_TEMPLATES);
        const medium = pick(this.MEDIUM_TEMPLATES);
        const hard = pick(this.HARD_TEMPLATES);

        return [
            {
                id: 0, type: easy.type,
                target: easy.calcTarget(lvl),
                desc: easy.desc(lvl),
                reward: this.calcReward(lvl, easy.rewardMult),
                progress: 0, completed: false, claimed: false, unlocked: true
            },
            {
                id: 1, type: medium.type,
                target: medium.calcTarget(lvl),
                desc: medium.desc(lvl),
                reward: this.calcReward(lvl, medium.rewardMult),
                progress: 0, completed: false, claimed: false, unlocked: false
            },
            {
                id: 2, type: hard.type,
                target: hard.calcTarget(lvl),
                desc: hard.desc(lvl),
                reward: this.calcReward(lvl, hard.rewardMult, true),
                progress: 0, completed: false, claimed: false, unlocked: false
            }
        ];
    },

    // 获取当前活跃的任务
    getCurrentQuest() {
        if (!player.dailyQuests || !player.dailyQuests.quests) return null;
        return player.dailyQuests.quests.find(q => q.unlocked && !q.claimed);
    },

    // 检查是否有可领取的奖励
    hasClaimableReward() {
        if (!player.dailyQuests || !player.dailyQuests.quests) return false;
        return player.dailyQuests.quests.some(q => q.completed && !q.claimed);
    },

    // 更新任务进度
    updateProgress(type, amount = 1) {
        if (!player.dailyQuests || !player.dailyQuests.quests) return;

        const currentQuest = this.getCurrentQuest();
        if (!currentQuest || currentQuest.type !== type || currentQuest.completed) return;

        currentQuest.progress = Math.min(currentQuest.progress + amount, currentQuest.target);

        if (currentQuest.progress >= currentQuest.target) {
            currentQuest.completed = true;
            showNotification('📋 每日任务完成！');
            AudioSys.play('quest');
            if (typeof updateMenuIndicators === 'function') updateMenuIndicators();
        }

        this.updateUI();
        this.updateTracker();
    },

    // 领取任务奖励并解锁下一个
    claimReward(questId) {
        if (!player.dailyQuests || !player.dailyQuests.quests) return;

        const quest = player.dailyQuests.quests.find(q => q.id === questId);
        if (!quest || !quest.completed || quest.claimed) return;

        let offsetY = 0;
        if (quest.reward.gold) {
            player.gold += quest.reward.gold;
            createDamageNumber(player.x, player.y - 40 + offsetY, `+${quest.reward.gold}G`, 'gold');
            offsetY -= 25;
        }
        if (quest.reward.xp) {
            player.xp += quest.reward.xp;
            checkLevelUp();
            createDamageNumber(player.x, player.y - 40 + offsetY, `+${quest.reward.xp}XP`, '#4d69cd');
            offsetY -= 25;
        }
        if (quest.reward.skillPoint) {
            player.skillPoints += quest.reward.skillPoint;
            createDamageNumber(player.x, player.y - 40 + offsetY, `+${quest.reward.skillPoint}技能点`, '#ff88ff');
            showNotification('🎉 获得技能点！');
        }

        quest.claimed = true;

        // 解锁下一个任务
        const nextQuest = player.dailyQuests.quests.find(q => !q.unlocked);
        if (nextQuest) {
            nextQuest.unlocked = true;
            showNotification('📋 新的每日任务已解锁！');
        }

        AudioSys.play('sell');
        this.updateUI();
        this.updateTracker();
        updateUI();
        if (typeof updateMenuIndicators === 'function') updateMenuIndicators();
    },

    // 重置时间倒计时
    getResetTime() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0); // 下一个午夜
        const diff = midnight - now;

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        const ss = String(seconds).padStart(2, '0');

        return `${hh}:${mm}:${ss} 后重置`;
    },

    // 更新任务面板UI
    updateUI() {
        this.checkAndReset();
        if (!player.dailyQuests || !player.dailyQuests.quests) return;

        let container = document.getElementById('daily-quest-section');
        if (!container) {
            const questList = document.getElementById('quest-list');
            if (!questList) return;
            container = document.createElement('div');
            container.id = 'daily-quest-section';
            container.style.cssText = 'margin-top:20px; border-top:1px solid #4a3b2a; padding-top:15px;';
            questList.appendChild(container);
        }

        const quests = player.dailyQuests.quests;
        const completedCount = quests.filter(q => q.claimed).length;

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="color:#c7b377; font-size:14px;">📋 每日任务 (${completedCount}/3)</span>
                <span id="daily-quest-countdown" style="color:#888; font-size:11px;">${this.getResetTime()}</span>
            </div>
        `;

        quests.forEach((q, idx) => {
            const isLocked = !q.unlocked;
            const statusColor = q.claimed ? '#666' : (q.completed ? '#88ff88' : (isLocked ? '#555' : '#fff'));
            const bgColor = q.claimed ? 'rgba(0,0,0,0.3)' : (isLocked ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.5)');

            let rewardText = [];
            if (q.reward.gold) rewardText.push(`${q.reward.gold}G`);
            if (q.reward.xp) rewardText.push(`${q.reward.xp}XP`);
            if (q.reward.skillPoint) rewardText.push(`${q.reward.skillPoint}技能点`);

            if (isLocked) {
                html += `
                    <div style="background:${bgColor}; border:1px solid #2a2a2a; padding:8px 10px; margin-bottom:6px; border-radius:4px; opacity:0.6;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:#555; font-size:13px;">🔒 完成上一个任务后解锁</span>
                            <span style="color:#555; font-size:12px;">${rewardText.join(' ')}</span>
                        </div>
                    </div>
                `;
            } else {
                html += `
                    <div style="background:${bgColor}; border:1px solid #3a3a3a; padding:8px 10px; margin-bottom:6px; border-radius:4px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="color:${statusColor}; font-size:13px;">${q.claimed ? '✓ ' : ''}${q.desc}</span>
                            ${q.completed && !q.claimed
                                ? `<button onclick="DailyQuestSystem.claimReward(${q.id})" style="background:#4a7c4a; color:#fff; border:none; padding:4px 10px; border-radius:3px; cursor:pointer; font-size:12px;">领取</button>`
                                : `<span style="color:#888; font-size:12px;">${rewardText.join(' ')}</span>`
                            }
                        </div>
                        ${!q.claimed ? `<div style="color:#aaa; font-size:11px; margin-top:4px;">进度: ${q.progress}/${q.target}</div>` : ''}
                    </div>
                `;
            }
        });

        container.innerHTML = html;
        this.startCountdown();
    },

    // 更新左上角追踪器
    updateTracker() {
        this.checkAndReset();
        if (!player.dailyQuests || !player.dailyQuests.quests) return;

        const el = document.getElementById('quest-tracker');
        if (!el) return;

        let dailyTracker = document.getElementById('daily-quest-tracker');
        if (!dailyTracker) {
            dailyTracker = document.createElement('div');
            dailyTracker.id = 'daily-quest-tracker';
            el.appendChild(dailyTracker);
        }

        const currentQuest = this.getCurrentQuest();

        if (!currentQuest) {
            const allClaimed = player.dailyQuests.quests.every(q => q.claimed);
            dailyTracker.innerHTML = allClaimed
                ? `<div style="margin-bottom:8px;"><span style="color:#88ff88; font-size:12px;">✓ 今日任务已完成</span></div>`
                : `<div style="margin-bottom:8px;"><span style="color:#ffcc00; font-size:12px;">🎁 有奖励可领取！</span></div>`;
            return;
        }

        const isDone = currentQuest.completed;
        dailyTracker.innerHTML = `
            <div style="margin-bottom:8px;">
                <span style="color:${isDone ? '#88ff88' : '#c7b377'}; font-size:12px;">${isDone ? '✓ ' : '📋 '}${currentQuest.desc}</span><br>
                <span style="color:#aaa; font-size:11px;">进度: ${currentQuest.progress}/${currentQuest.target}</span>
            </div>
        `;
    }
};

window.DailyQuestSystem = DailyQuestSystem;
