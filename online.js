// PocketBase 在线系统（使用官方 SDK）
const PB_URL = 'https://maikami.com/pb';
const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);

// ========== 云同步系统 ==========
const CloudSync = {
    syncCode: null,
    isBound: false,
    recordId: null,
    isReady: false,  // 云同步是否初始化完成
    uploadDebounceTimer: null,
    DEBOUNCE_DELAY: 2000,  // 2秒防抖

    // 初始化：检查本地是否已绑定
    async init() {
        this.syncCode = localStorage.getItem('cloud_sync_code');
        this.recordId = localStorage.getItem('cloud_record_id');
        this.isBound = !!this.syncCode;

        // 如果已绑定，自动从云端同步最新数据
        if (this.isBound && this.recordId) {
            await this.syncFromCloud();
        }

        this.isReady = true;
        this.updateUI();
        // 通知 SaveSystem 尝试激活按钮
        if (typeof SaveSystem !== 'undefined' && SaveSystem.tryActivateStartButton) {
            SaveSystem.tryActivateStartButton();
        }
        console.log('[云同步] 初始化完成, 已绑定:', this.isBound);
    },

    // 从云端同步最新数据到本地（比较等级，云端更高则覆盖）
    async syncFromCloud() {
        try {
            const cloudRecord = await pb.collection('cloud_saves').getOne(this.recordId);
            if (!cloudRecord) return;

            const cloudSlots = [
                cloudRecord.slot_1 || null,
                cloudRecord.slot_2 || null,
                cloudRecord.slot_3 || null
            ];
            const localSlots = await this.getLocalSlots();

            let updated = false;
            for (let i = 0; i < 3; i++) {
                const cloud = cloudSlots[i];
                const local = localSlots[i];

                if (!cloud) continue;

                const cloudLevel = cloud.lvl || 0;
                const localLevel = local?.lvl || 0;

                // 云端等级更高，覆盖本地
                if (cloudLevel > localLevel) {
                    await this.saveToLocalSlot(i + 1, cloud);
                    updated = true;
                    console.log(`[云同步] 槽位${i + 1}: 云端(Lv${cloudLevel}) > 本地(Lv${localLevel})，已更新`);
                }
            }

            if (updated) {
                // 刷新存档列表显示
                if (typeof SaveSystem !== 'undefined' && SaveSystem.loadAllSlotsMeta) {
                    SaveSystem.loadAllSlotsMeta();
                }
            }
        } catch (e) {
            console.error('[云同步] 同步失败:', e);
        }
    },

    // 保存数据到本地指定槽位
    async saveToLocalSlot(slotId, data) {
        if (typeof db === 'undefined' || !db) return;

        // 确保数据有正确的 id 和 slotId
        const saveData = {
            ...data,
            id: `slot_${slotId}`,
            slotId: slotId
        };

        return new Promise((resolve) => {
            const tx = db.transaction(['saveData'], 'readwrite');
            tx.objectStore('saveData').put(saveData);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
        });
    },

    // 生成6位同步码（大写字母+数字）
    generateSyncCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // 排除易混淆的 I/O/0/1
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    },

    // 获取本地所有槽位的存档数据
    async getLocalSlots() {
        const slots = [null, null, null];
        if (typeof db === 'undefined' || !db) return slots;

        for (let i = 1; i <= 3; i++) {
            try {
                const data = await new Promise((resolve) => {
                    const tx = db.transaction(['saveData'], 'readonly');
                    const req = tx.objectStore('saveData').get(`slot_${i}`);
                    req.onsuccess = (e) => resolve(e.target.result);
                    req.onerror = () => resolve(null);
                });
                if (data) {
                    slots[i - 1] = {
                        lvl: data.lvl || 1,
                        gold: data.gold || 0,
                        kills: data.kills || 0,
                        maxFloor: data.personalBest?.maxFloor || data.floor || 0,
                        maxHellFloor: data.personalBest?.maxHellFloor || 0,
                        nickname: data.nickname || '未命名',
                        fullData: data
                    };
                }
            } catch (e) { }
        }
        return slots;
    },

    // 绑定账号（新建）
    async bindNew() {
        const code = this.generateSyncCode();
        const slots = await this.getLocalSlots();
        const nickname = OnlineSystem.nickname || '勇士';

        try {
            // 检查同步码是否已存在（极小概率冲突）
            const existing = await pb.collection('cloud_saves').getList(1, 1, {
                filter: `sync_code = "${code}"`
            });

            if (existing.items.length > 0) {
                // 冲突，重新生成
                return this.bindNew();
            }

            // 创建云端存档
            const record = await pb.collection('cloud_saves').create({
                sync_code: code,
                nickname: nickname,
                slot_1: slots[0]?.fullData || null,
                slot_2: slots[1]?.fullData || null,
                slot_3: slots[2]?.fullData || null,
                version: 1
            });

            // 保存到本地
            this.syncCode = code;
            this.recordId = record.id;
            this.isBound = true;
            localStorage.setItem('cloud_sync_code', code);
            localStorage.setItem('cloud_record_id', record.id);

            this.updateUI();
            this.hideDialog();
            this.showSuccessMessage(`绑定成功！同步码: ${code}`);
            return true;
        } catch (e) {
            console.error('[云同步] 绑定失败:', e);
            this.showErrorMessage('绑定失败，请稍后重试');
            return false;
        }
    },

    // 绑定账号（已有同步码）
    async bindExisting(code) {
        code = code.toUpperCase().trim();
        if (!/^[A-Z0-9]{6}$/.test(code)) {
            this.showErrorMessage('同步码格式错误，需要6位字母数字');
            return false;
        }

        try {
            const records = await pb.collection('cloud_saves').getList(1, 1, {
                filter: `sync_code = "${code}"`
            });

            if (records.items.length === 0) {
                this.showErrorMessage('同步码不存在');
                return false;
            }

            const cloudRecord = records.items[0];
            const localSlots = await this.getLocalSlots();
            const cloudSlots = [
                this.parseCloudSlot(cloudRecord.slot_1),
                this.parseCloudSlot(cloudRecord.slot_2),
                this.parseCloudSlot(cloudRecord.slot_3)
            ];

            // 检查是否有冲突
            const hasLocalData = localSlots.some(s => s !== null);
            const hasCloudData = cloudSlots.some(s => s !== null);

            if (hasLocalData && hasCloudData) {
                // 显示冲突对比面板，让用户选择覆盖方向
                this.showBindConflictPanel(code, cloudRecord, localSlots, cloudSlots);
                return 'conflict';
            } else if (hasCloudData) {
                // 本地为空，直接用云端
                await this.applyCloudSave(cloudRecord);
                this.completeBinding(code, cloudRecord.id, cloudRecord.nickname);
                return true;
            } else {
                // 云端为空，上传本地
                await this.uploadAllSlots(cloudRecord.id);
                this.completeBinding(code, cloudRecord.id, cloudRecord.nickname);
                return true;
            }
        } catch (e) {
            console.error('[云同步] 绑定失败:', e);
            this.showErrorMessage('绑定失败，请检查网络');
            return false;
        }
    },

    // 解析云端槽位数据
    parseCloudSlot(data) {
        if (!data) return null;
        return {
            lvl: data.lvl || 1,
            gold: data.gold || 0,
            kills: data.kills || 0,
            maxFloor: data.personalBest?.maxFloor || data.floor || 0,
            maxHellFloor: data.personalBest?.maxHellFloor || 0,
            nickname: data.nickname || '未命名',
            fullData: data
        };
    },

    // 完成绑定
    completeBinding(code, recordId, nickname = null) {
        this.syncCode = code;
        this.recordId = recordId;
        this.isBound = true;
        localStorage.setItem('cloud_sync_code', code);
        localStorage.setItem('cloud_record_id', recordId);

        // 如果有云端昵称，保存到本地并显示欢迎信息
        if (nickname) {
            localStorage.setItem('pb_nickname', nickname);
            OnlineSystem.nickname = nickname;
            const welcomeEl = document.getElementById('welcome-back');
            if (welcomeEl) welcomeEl.textContent = `欢迎回来，${nickname}`;
        }

        this.updateUI();
        this.hideDialog();
        this.showSuccessMessage(`绑定成功！同步码: ${code}`);
    },

    // 恢复存档（输入同步码下载）
    async restore(code) {
        code = code.toUpperCase().trim();
        if (!/^[A-Z0-9]{6}$/.test(code)) {
            this.showErrorMessage('同步码格式错误，需要6位字母数字');
            return false;
        }

        try {
            const records = await pb.collection('cloud_saves').getList(1, 1, {
                filter: `sync_code = "${code}"`
            });

            if (records.items.length === 0) {
                this.showErrorMessage('同步码不存在');
                return false;
            }

            const cloudRecord = records.items[0];
            const localSlots = await this.getLocalSlots();
            const cloudSlots = [
                this.parseCloudSlot(cloudRecord.slot_1),
                this.parseCloudSlot(cloudRecord.slot_2),
                this.parseCloudSlot(cloudRecord.slot_3)
            ];

            const hasCloudData = cloudSlots.some(s => s !== null);
            if (!hasCloudData) {
                this.showErrorMessage('该同步码没有存档数据');
                return false;
            }

            const hasLocalData = localSlots.some(s => s !== null);
            if (hasLocalData) {
                // 显示冲突对比面板
                this.showRestoreConflictPanel(code, cloudRecord, localSlots, cloudSlots);
                return 'conflict';
            } else {
                // 本地为空，直接恢复
                await this.applyCloudSave(cloudRecord);
                this.completeBinding(code, cloudRecord.id);
                this.showSuccessMessage('存档恢复成功！');
                // 刷新存档列表
                if (typeof SaveSystem !== 'undefined') {
                    SaveSystem.loadAllSlotsMeta();
                }
                return true;
            }
        } catch (e) {
            console.error('[云同步] 恢复失败:', e);
            this.showErrorMessage('恢复失败，请检查网络');
            return false;
        }
    },

    // 应用云端存档到本地
    async applyCloudSave(cloudRecord) {
        if (!db) return;

        const slots = [cloudRecord.slot_1, cloudRecord.slot_2, cloudRecord.slot_3];
        const tx = db.transaction(['saveData'], 'readwrite');
        const store = tx.objectStore('saveData');

        for (let i = 0; i < 3; i++) {
            if (slots[i]) {
                const data = { ...slots[i], id: `slot_${i + 1}`, slotId: i + 1 };
                store.put(data);
            }
        }

        return new Promise((resolve) => {
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    },

    // 上传所有槽位到云端
    async uploadAllSlots(recordId = null) {
        const slots = await this.getLocalSlots();
        const updateData = {
            slot_1: slots[0]?.fullData || null,
            slot_2: slots[1]?.fullData || null,
            slot_3: slots[2]?.fullData || null,
            version: Date.now()
        };

        const id = recordId || this.recordId;
        if (!id) return false;

        try {
            await pb.collection('cloud_saves').update(id, updateData);
            return true;
        } catch (e) {
            console.error('[云同步] 上传失败:', e);
            return false;
        }
    },

    // 上传单个槽位（自动同步用，带防抖）
    uploadSlotDebounced(slotId) {
        if (!this.isBound || !this.recordId) return;

        clearTimeout(this.uploadDebounceTimer);
        this.uploadDebounceTimer = setTimeout(() => {
            this.uploadSlot(slotId);
        }, this.DEBOUNCE_DELAY);
    },

    // 上传单个槽位
    async uploadSlot(slotId) {
        if (!this.isBound || !this.recordId) return;

        const slots = await this.getLocalSlots();
        const localSlot = slots[slotId - 1];
        if (!localSlot) return;

        const localLevel = localSlot.lvl || 0;

        // 降级保护：获取云端当前数据比较等级
        try {
            const cloudRecord = await pb.collection('cloud_saves').getOne(this.recordId);
            const cloudSlot = cloudRecord[`slot_${slotId}`];

            if (cloudSlot) {
                const cloudLevel = cloudSlot.lvl || 0;

                // 如果本地等级比云端低5级以上，跳过（防止误覆盖）
                if (localLevel < cloudLevel - 5) {
                    console.warn(`[云同步] 检测到降级(本地Lv${localLevel} < 云端Lv${cloudLevel})，跳过自动同步`);
                    return;
                }
            }

            const updateData = {
                [`slot_${slotId}`]: localSlot.fullData,
                version: Date.now()
            };
            await pb.collection('cloud_saves').update(this.recordId, updateData);
            console.log(`[云同步] 槽位${slotId} 已上传 (Lv${localLevel})`);
        } catch (e) {
            console.error('[云同步] 上传槽位失败:', e);
        }
    },

    // 显示云同步弹窗（老用户）
    showSyncDialog() {
        const overlay = document.getElementById('cloud-sync-overlay');
        const panel = document.getElementById('cloud-sync-panel');
        const content = document.getElementById('cloud-sync-content');
        if (!overlay || !content || !panel) return;

        content.innerHTML = `
            <div class="nickname-title">云同步管理</div>
            <div class="nickname-desc">您可以创建新账号或绑定已有账号</div>
            <div id="cloud-error" class="nickname-error"></div>
            <div class="cloud-start-options">
                <div class="cloud-start-option" onclick="CloudSync.handleBindNew()">
                    <div class="cloud-start-title">创建新账号</div>
                    <div class="cloud-start-desc">生成同步码，上传本地存档</div>
                </div>
                <div class="cloud-start-divider">或</div>
                <div class="cloud-start-option restore">
                    <div class="cloud-start-title">输入同步码</div>
                    <div class="cloud-start-desc">绑定已有账号或恢复存档</div>
                    <input type="text" id="sync-code-input" maxlength="6" autocomplete="off"
                           placeholder="输入 6 位同步码" onclick="event.stopPropagation()"
                           onkeydown="if(event.key==='Enter')CloudSync.handleSyncCode()">
                    <button id="cloud-restore-btn" onclick="event.stopPropagation();CloudSync.handleSyncCode()">确认</button>
                </div>
            </div>
        `;
        // 老用户弹窗：显示关闭按钮
        const closeBtn = panel.querySelector('.panel-close');
        if (closeBtn) closeBtn.style.display = 'block';

        panel.style.display = 'block';
        overlay.classList.add('active');
    },

    // 显示新用户弹窗（创建/恢复/跳过）
    showNewUserDialog() {
        console.log('[CloudSync] showNewUserDialog 被调用');
        const overlay = document.getElementById('cloud-sync-overlay');
        const panel = document.getElementById('cloud-sync-panel');
        const content = document.getElementById('cloud-sync-content');
        console.log('[CloudSync] 元素检查:', { overlay: !!overlay, panel: !!panel, content: !!content });
        if (!overlay || !content || !panel) {
            console.error('[CloudSync] 元素缺失，无法显示弹窗');
            return;
        }

        content.innerHTML = `
            <div class="nickname-title">欢迎来到 菠萝战纪</div>
            <div class="nickname-desc">请选择开始方式</div>
            <div id="cloud-error" class="nickname-error"></div>
            <div class="cloud-start-options">
                <div class="cloud-start-option" onclick="CloudSync.handleNewUserCreate()">
                    <div class="cloud-start-title">创建新角色</div>
                    <div class="cloud-start-desc">开始新的冒险</div>
                </div>
                <div class="cloud-start-divider">或</div>
                <div class="cloud-start-option restore">
                    <div class="cloud-start-title">恢复存档</div>
                    <input type="text" id="sync-code-input" maxlength="6" autocomplete="off"
                           placeholder="输入 6 位同步码" onclick="event.stopPropagation()"
                           onkeydown="if(event.key==='Enter')CloudSync.handleNewUserRestore()">
                    <button id="cloud-restore-btn" onclick="event.stopPropagation();CloudSync.handleNewUserRestore()">恢复</button>
                </div>
            </div>
        `;
        // 新用户弹窗：隐藏关闭按钮，必须选择
        const closeBtn = panel.querySelector('.panel-close');
        if (closeBtn) closeBtn.style.display = 'none';

        panel.style.display = 'block';
        overlay.classList.add('active');
    },

    // 新用户选择"创建新角色" → 弹昵称输入
    handleNewUserCreate() {
        this.hideDialog();
        OnlineSystem.showNicknameDialog();
    },

    // 新用户选择"恢复存档"
    async handleNewUserRestore() {
        const input = document.getElementById('sync-code-input');
        if (!input || !input.value) {
            this.showErrorInPanel('请输入同步码');
            return;
        }
        const result = await this.bindExisting(input.value);
        if (result === true) {
            // 恢复成功，昵称已在 completeBinding 中保存
            // 刷新存档列表（进入游戏时才 startOnline）
            if (typeof SaveSystem !== 'undefined') {
                SaveSystem.loadAllSlotsMeta();
            }
        }
    },

    // 隐藏弹窗
    hideDialog() {
        const overlay = document.getElementById('cloud-sync-overlay');
        const panel = document.getElementById('cloud-sync-panel');
        if (overlay) overlay.classList.remove('active');
        if (panel) panel.style.display = 'none';
    },

    // 处理创建新账号（老用户）
    async handleBindNew() {
        await this.bindNew();
    },

    // 处理输入同步码（自动判断绑定/恢复）
    async handleSyncCode() {
        const input = document.getElementById('sync-code-input');
        if (!input || !input.value) {
            this.showErrorInPanel('请输入同步码');
            return;
        }
        // 统一使用 bindExisting，它会自动处理所有情况
        await this.bindExisting(input.value);
    },

    // 在面板内显示错误
    showErrorInPanel(msg) {
        const errorEl = document.getElementById('cloud-error');
        if (errorEl) {
            errorEl.textContent = msg;
            errorEl.style.display = 'block';
            setTimeout(() => { errorEl.style.display = 'none'; }, 3000);
        }
    },

    // 显示绑定冲突面板（用户选择覆盖方向）
    showBindConflictPanel(code, cloudRecord, localSlots, cloudSlots) {
        const overlay = document.getElementById('cloud-sync-overlay');
        const panel = document.getElementById('cloud-sync-panel');
        const content = document.getElementById('cloud-sync-content');
        if (!overlay || !panel || !content) return;

        content.innerHTML = `
            <div class="nickname-title" style="color:#ff6666;">存档冲突</div>
            <div class="nickname-desc">本地和云端都有存档，请选择保留哪一方</div>
            <div class="conflict-compare">
                <div class="conflict-side">
                    <div class="conflict-side-title">💾 本地存档</div>
                    ${this.renderSlotList(localSlots)}
                </div>
                <div class="conflict-vs">VS</div>
                <div class="conflict-side">
                    <div class="conflict-side-title">☁️ 云端存档</div>
                    ${this.renderSlotList(cloudSlots)}
                </div>
            </div>
            <div class="conflict-actions">
                <button class="conflict-btn" onclick="CloudSync.resolveBindConflict('local', '${code}', '${cloudRecord.id}')">
                    用本地覆盖云端
                </button>
                <button class="conflict-btn" onclick="CloudSync.resolveBindConflict('cloud', '${code}', '${cloudRecord.id}')">
                    用云端覆盖本地
                </button>
            </div>
            <button class="conflict-cancel" onclick="CloudSync.hideDialog()">取消</button>
        `;

        // 临时存储 cloudRecord 用于后续操作
        this._pendingCloudRecord = cloudRecord;

        // 显示 panel 和 overlay
        panel.style.display = 'block';
        overlay.classList.add('active');
    },

    // 显示恢复冲突面板
    showRestoreConflictPanel(code, cloudRecord, localSlots, cloudSlots) {
        this.hideDialog();
        const overlay = document.getElementById('cloud-sync-overlay');
        if (!overlay) return;

        const content = document.getElementById('cloud-sync-content');
        if (!content) return;

        content.innerHTML = `
            <div class="conflict-title">存档冲突</div>
            <div class="conflict-desc">本地已有存档，恢复云端存档将覆盖本地</div>
            <div class="conflict-compare">
                <div class="conflict-side">
                    <div class="conflict-side-title">💾 本地存档（将被覆盖）</div>
                    ${this.renderSlotList(localSlots)}
                </div>
                <div class="conflict-vs">→</div>
                <div class="conflict-side">
                    <div class="conflict-side-title">☁️ 云端存档</div>
                    ${this.renderSlotList(cloudSlots)}
                </div>
            </div>
            <div class="conflict-warning">⚠️ 此操作将覆盖本地所有存档，无法恢复！</div>
            <div class="conflict-actions">
                <button class="conflict-btn danger" onclick="CloudSync.resolveRestoreConflict('${code}', '${cloudRecord.id}')">
                    确认覆盖本地
                </button>
            </div>
            <button class="conflict-cancel" onclick="CloudSync.hideDialog()">取消</button>
        `;

        this._pendingCloudRecord = cloudRecord;
        overlay.classList.add('active');
    },

    // 渲染槽位列表
    renderSlotList(slots) {
        return slots.map((slot, i) => {
            if (!slot) {
                return `<div class="conflict-slot empty">槽位${i + 1}: 空</div>`;
            }
            const hellText = slot.maxHellFloor > 0 ? ` 地狱${slot.maxHellFloor}层` : '';
            return `<div class="conflict-slot">
                槽位${i + 1}: Lv.${slot.lvl} ${slot.maxFloor}层${hellText}
            </div>`;
        }).join('');
    },

    // 解决绑定冲突
    async resolveBindConflict(choice, code, recordId) {
        const cloudNickname = this._pendingCloudRecord?.nickname || null;

        if (choice === 'local') {
            // 用本地覆盖云端
            await this.uploadAllSlots(recordId);
        } else {
            // 用云端覆盖本地
            if (this._pendingCloudRecord) {
                await this.applyCloudSave(this._pendingCloudRecord);
                if (typeof SaveSystem !== 'undefined') {
                    SaveSystem.loadAllSlotsMeta();
                }
            }
        }
        this.completeBinding(code, recordId, cloudNickname);
        this._pendingCloudRecord = null;
    },

    // 解决恢复冲突
    async resolveRestoreConflict(code, recordId) {
        if (this._pendingCloudRecord) {
            await this.applyCloudSave(this._pendingCloudRecord);
            if (typeof SaveSystem !== 'undefined') {
                SaveSystem.loadAllSlotsMeta();
            }
        }
        this.completeBinding(code, recordId);
        this._pendingCloudRecord = null;
        this.showSuccessMessage('存档恢复成功！');
    },

    // 复制同步码到剪贴板
    async copySyncCode() {
        if (!this.syncCode) return;

        try {
            await navigator.clipboard.writeText(this.syncCode);
            this.showSuccessMessage('同步码已复制');
        } catch (e) {
            // 降级方案
            const input = document.createElement('input');
            input.value = this.syncCode;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            this.showSuccessMessage('同步码已复制');
        }
    },

    // 更新首页UI状态
    updateUI() {
        const bar = document.getElementById('cloud-sync-bar');
        if (!bar) return;

        // 如果没有昵称（新用户），不显示云同步状态栏
        const hasNickname = localStorage.getItem('pb_nickname');
        if (!hasNickname) {
            bar.style.display = 'none';
            return;
        }

        // 初始化完成，显示状态栏
        bar.style.display = 'flex';

        const statusEl = document.getElementById('cloud-sync-status');
        const btnSync = document.getElementById('btn-cloud-sync');
        const codeEl = document.getElementById('cloud-sync-code');

        if (this.isBound) {
            bar.classList.add('bound');
            if (statusEl) statusEl.textContent = `已绑定`;
            if (btnSync) btnSync.style.display = 'none';
            if (codeEl) {
                codeEl.style.display = 'inline';
                codeEl.innerHTML = `<span class="sync-code-value">${this.syncCode}</span> <span class="copy-hint" onclick="CloudSync.copySyncCode()">[复制]</span>`;
            }
        } else {
            bar.classList.remove('bound');
            if (statusEl) statusEl.textContent = '未绑定';
            if (btnSync) btnSync.style.display = 'inline-block';
            if (codeEl) codeEl.style.display = 'none';
        }
    },

    // 显示成功消息
    showSuccessMessage(msg) {
        if (typeof showNotification === 'function') {
            showNotification(msg);
        } else {
            this.showAlert(msg);
        }
    },

    // 显示错误消息
    showErrorMessage(msg) {
        this.showErrorInPanel(msg);
    }
};

const OnlineSystem = {
    // 通用确认框 (替代 confirm)
    showConfirm(content, title = '确认') {
        return new Promise((resolve) => {
            const overlay = document.getElementById('game-dialog-overlay');
            const header = document.getElementById('game-dialog-header');
            const body = document.getElementById('game-dialog-body');
            const btnCancel = document.getElementById('game-dialog-btn-cancel');
            const btnConfirm = document.getElementById('game-dialog-btn-confirm');

            header.textContent = title;
            body.innerHTML = content.replace(/\n/g, '<br>');
            btnCancel.style.display = 'block';
            overlay.classList.add('active');

            const onConfirm = () => {
                overlay.classList.remove('active');
                cleanup();
                resolve(true);
            };
            const onCancel = () => {
                overlay.classList.remove('active');
                cleanup();
                resolve(false);
            };
            const cleanup = () => {
                btnConfirm.removeEventListener('click', onConfirm);
                btnCancel.removeEventListener('click', onCancel);
            };

            btnConfirm.onclick = onConfirm;
            btnCancel.onclick = onCancel;
        });
    },

    // 通用提示框 (替代 alert)
    showAlert(content, title = '提示') {
        return new Promise((resolve) => {
            const overlay = document.getElementById('game-dialog-overlay');
            const header = document.getElementById('game-dialog-header');
            const body = document.getElementById('game-dialog-body');
            const btnCancel = document.getElementById('game-dialog-btn-cancel');
            const btnConfirm = document.getElementById('game-dialog-btn-confirm');

            header.textContent = title;
            body.innerHTML = content.replace(/\n/g, '<br>');
            btnCancel.style.display = 'none'; // Alert模式隐藏取消按钮
            overlay.classList.add('active');

            const onConfirm = () => {
                overlay.classList.remove('active');
                btnConfirm.onclick = null;
                resolve();
            };
            btnConfirm.onclick = onConfirm;
        });
    },

    userId: null,
    nickname: null,
    recordId: null,
    heartbeatTimer: null,

    // 初始化
    /**
     * @param {boolean} showDialog - 是否立即显示昵称对话框（默认为true）
    /**
     * 初始化 - 只加载用户信息和UI，不建立在线状态
     * 在线状态在进入游戏时（selectSlot）才建立
     */
    async init(showDialog = true) {
        this.userId = localStorage.getItem('pb_user_id');
        this.nickname = localStorage.getItem('pb_nickname');

        // 初始化云同步
        CloudSync.init();

        // 老用户且非刚被踢：尝试清理属于本页面的残留状态
        if (this.userId && !sessionStorage.getItem('kicked_reason')) {
            this.goOffline();
        }

        this.loadOnlineCount();
        // 创建排行榜按钮（数据延迟加载）
        this.createLeaderboardUI();

        // 检查是否是因为被踢才回到首页的
        this.checkKickedStatus();
    },

    // 检查被踢状态并弹窗
    checkKickedStatus() {
        const reason = sessionStorage.getItem('kicked_reason');
        if (reason === 'other_device') {
            sessionStorage.removeItem('kicked_reason');
            // 延迟一点点弹出，确保页面已经渲染完成
            setTimeout(() => {
                this.showAlert('您的账号已在其他设备登录，当前设备已下线。', '系统提示');
            }, 500);
        }
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
                <div class="nickname-title">欢迎来到 菠萝战纪</div>
                <div class="nickname-desc">请输入你的英雄名称</div>
                <div id="nickname-error" class="nickname-error" style="display: none;"></div>
                <input type="text" id="nickname-input" maxlength="12" placeholder="2-12个字符">
                <button id="nickname-confirm">确认</button>
                <button id="nickname-back" class="nickname-back-btn">返回</button>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('nickname-confirm').onclick = async () => {
            const input = document.getElementById('nickname-input').value.trim();
            if (input.length >= 2 && input.length <= 12) {
                const success = await this.setNickname(input);
                if (success) {
                    overlay.remove();
                }
            } else {
                this.showAlert('昵称需要2-12个字符', '格式错误');
            }
        };

        document.getElementById('nickname-back').onclick = () => {
            overlay.remove();
            CloudSync.showNewUserDialog();
        };

        document.getElementById('nickname-input').onkeydown = (e) => {
            if (e.key === 'Enter') {
                document.getElementById('nickname-confirm').click();
            }
        };

        // 输入时清除错误提示
        document.getElementById('nickname-input').oninput = () => {
            const errorEl = document.getElementById('nickname-error');
            if (errorEl) {
                errorEl.style.display = 'none';
            }
        };
    },

    // 设置昵称
    async setNickname(name) {
        // 检查是否包含敏感词
        const filteredName = ChatSystem.filterSensitiveWords(name);
        if (filteredName !== name) {
            // 如果昵称包含敏感词，显示错误提示
            const errorEl = document.getElementById('nickname-error');
            if (errorEl) {
                errorEl.textContent = '昵称包含敏感词，请重新输入';
                errorEl.style.display = 'block';
                // 3秒后自动隐藏
                setTimeout(() => {
                    errorEl.style.display = 'none';
                }, 3000);
            }
            return false;
        }

        this.nickname = name;
        localStorage.setItem('pb_nickname', name);

        if (!this.userId) {
            this.userId = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
            localStorage.setItem('pb_user_id', this.userId);
        }

        // 注意：不在这里调用 startOnline，改为进入游戏时调用

        // 昵称设置完成后，显示云同步状态栏
        CloudSync.updateUI();

        return true;
    },

    // 开始在线状态
    async startOnline() {
        // 生成本次会话Token
        this.sessionToken = this.generateSessionToken();
        sessionStorage.setItem('current_session_token', this.sessionToken);

        await this.updateOnlineStatus(false);  // 首次登录，不检查被踢
        this.heartbeatTimer = setInterval(() => this.updateOnlineStatus(true), 30000);  // 心跳时检查被踢
        window.addEventListener('beforeunload', () => this.goOffline());

        // 订阅 online 表变化，实时检测被踢
        await this.subscribeToSessionChanges();
    },

    // 订阅会话变化（实时被踢检测）
    async subscribeToSessionChanges() {
        console.log('[在线] 尝试订阅, recordId:', this.onlineRecordId);
        if (!this.onlineRecordId) {
            console.warn('[在线] 无法订阅: recordId 为空');
            return;
        }

        try {
            await pb.collection('online').subscribe(this.onlineRecordId, (e) => {
                console.log('[在线] 收到 Realtime 事件:', e.action);
                if (e.action === 'update') {
                    const newToken = e.record.session_token;
                    console.log('[在线] 当前Token:', this.sessionToken, '新Token:', newToken);
                    if (newToken && newToken !== this.sessionToken) {
                        console.log('[在线] Realtime 检测到会话被接管');
                        this.handleKicked();
                    }
                }
            });
            console.log('[在线] Realtime 订阅成功, recordId:', this.onlineRecordId);
        } catch (e) {
            console.error('[在线] Realtime 订阅失败:', e);
        }
    },

    // 生成会话Token
    generateSessionToken() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    },

    // 检查是否有其他设备在线（用于进入游戏前检测）
    async checkOtherDeviceOnline() {
        // 必须已绑定云同步才检测
        const cloudRecordId = CloudSync.recordId;
        if (!cloudRecordId) return { online: false };

        try {
            const records = await pb.collection('online').getList(1, 1, {
                filter: `cloud_record_id = "${cloudRecordId}"`
            });

            if (records.items.length > 0) {
                const record = records.items[0];
                const lastActive = new Date(record.last_active).getTime();
                const now = Date.now();

                // 5分钟内有活动视为在线
                if (now - lastActive < 5 * 60 * 1000) {
                    return {
                        online: true,
                        recordId: record.id,
                        lastActive: record.last_active
                    };
                }
            }
            return { online: false };
        } catch (e) {
            console.error('[在线] 检查失败:', e);
            return { online: false };
        }
    },

    // 强制接管会话（踢掉其他设备）
    async takeoverSession(recordId) {
        this.sessionToken = this.generateSessionToken();
        sessionStorage.setItem('current_session_token', this.sessionToken);
        try {
            await pb.collection('online').update(recordId, {
                session_token: this.sessionToken,
                last_active: new Date().toISOString()
            });
            this.onlineRecordId = recordId;
            console.log('[在线] 已接管会话');
            return true;
        } catch (e) {
            console.error('[在线] 接管失败:', e);
            return false;
        }
    },

    // 更新在线状态（使用 cloud_record_id 实现跨设备检测）
    async updateOnlineStatus(isHeartbeat = false) {
        const cloudRecordId = CloudSync.recordId;
        if (!cloudRecordId || !this.nickname) return;

        try {
            // 先尝试查找现有记录（基于云端账号ID）
            const records = await pb.collection('online').getList(1, 1, {
                filter: `cloud_record_id = "${cloudRecordId}"`
            });

            if (records.items.length > 0) {
                const record = records.items[0];
                this.onlineRecordId = record.id;

                // 只有心跳时才检查是否被踢（首次登录时不检查）
                if (isHeartbeat && record.session_token && record.session_token !== this.sessionToken) {
                    // 被其他设备踢掉了
                    this.handleKicked();
                    return;
                }

                // 更新现有记录
                await pb.collection('online').update(this.onlineRecordId, {
                    nickname: this.nickname,
                    session_token: this.sessionToken,
                    last_active: new Date().toISOString()
                });
            } else {
                // 创建新记录
                const record = await pb.collection('online').create({
                    cloud_record_id: cloudRecordId,
                    nickname: this.nickname,
                    session_token: this.sessionToken,
                    last_active: new Date().toISOString()
                });
                this.onlineRecordId = record.id;
            }
        } catch (e) {
            console.error('[在线] 更新状态失败:', e);
        }
    },

    // 处理被踢
    handleKicked() {
        console.log('[在线] 检测到账号在其他设备登录');

        // 停止心跳
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        try {
            if (this.onlineRecordId) {
                pb.collection('online').unsubscribe(this.onlineRecordId);
            }
        } catch (e) { }

        // 设置被踢标记，页面刷新后读取
        sessionStorage.setItem('kicked_reason', 'other_device');

        // 回到首页
        window.location.reload();
    },

    // 下线（清理在线状态）
    async goOffline() {
        const cloudRecordId = CloudSync.recordId || localStorage.getItem('cloud_record_id');
        const token = this.sessionToken || sessionStorage.getItem('current_session_token');
        if (!cloudRecordId || !token) return;

        try {
            // 查找属于当前云账号且 Token 一致的记录
            const records = await pb.collection('online').getList(1, 10, {
                filter: `cloud_record_id = "${cloudRecordId}" && session_token = "${token}"`
            });

            for (const r of records.items) {
                await pb.collection('online').delete(r.id);
            }

            this.onlineRecordId = null;
            this.sessionToken = null;
            sessionStorage.removeItem('current_session_token');
            console.log('[在线] 已清理属于本页面的在线状态');
        } catch (e) {
            // 静默失败
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
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString().replace('T', ' ');
        this.gc('online', `last_active < "${fiveMinutesAgo}"`, 10);
    },

    // 机会性清理辅助函数 (Garbage Collection)
    async gc(collection, filter, limit = 5) {
        try {
            const records = await pb.collection(collection).getList(1, limit, {
                filter: filter,
                sort: 'created',
                requestKey: 'gc_' + collection // 使用固定 key 防止并发冲突
            });
            for (const r of records.items) {
                // 尝试删除，忽略 403(权限) 和 404(已删除)
                await pb.collection(collection).delete(r.id).catch(e => {
                    if (e.status === 403) {
                        console.warn(`[GC] 清理 ${collection} 失败: 请在 PocketBase 后台开放 Delete 权限`);
                    }
                    // 404 表示记录已不存在，静默忽略
                });
            }
        } catch (e) {
            // 获取列表失败也静默
        }
    },

    // 保留最近N条记录，删除其余的
    async gcKeepRecent(collection, keepCount = 20) {
        try {
            const total = await pb.collection(collection).getList(1, 1, {
                requestKey: 'gc_count_' + collection
            });
            if (total.totalItems <= keepCount) return;

            const toDelete = total.totalItems - keepCount;
            const batchSize = Math.min(toDelete, 100);
            const records = await pb.collection(collection).getList(1, batchSize, {
                sort: 'created',
                requestKey: 'gc_delete_' + collection
            });

            let deleted = 0;
            await Promise.all(records.items.map(r =>
                pb.collection(collection).delete(r.id)
                    .then(() => deleted++)
                    .catch(() => { })
            ));

            if (toDelete > batchSize && deleted > 0) {
                setTimeout(() => this.gcKeepRecent(collection, keepCount), 500);
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

    // 提交分数到排行榜（双轨匹配：优先 sync_code，兜底 user_id）
    async submitScore(data) {
        if (!this.userId || !this.nickname) return;

        // 获取 sync_code（优先云同步码，否则用临时ID）
        let syncCode = CloudSync.syncCode;
        if (!syncCode) {
            let tempId = localStorage.getItem('temp_user_id');
            if (!tempId) {
                tempId = Math.random().toString(36).substr(2, 6).toUpperCase();
                localStorage.setItem('temp_user_id', tempId);
            }
            syncCode = tempId;
        }

        const currentWeekStart = this.getWeekStart();
        const scoreData = {
            user_id: this.userId,
            sync_code: syncCode,  // 新增：同时写入 sync_code
            nickname: this.nickname,
            level: data.level || 1,
            kills: data.kills || 0,
            max_floor: data.maxFloor || 0,
            is_hell: data.isHell || false,
            gold: data.gold || 0,
            score: (data.level || 1) * 100 + (data.kills || 0) + (data.maxFloor || 0) * 50
        };

        try {
            // 双轨查询：优先用 sync_code，fallback 用 user_id
            let records = await pb.collection('leaderboard').getList(1, 1, {
                filter: `sync_code = "${syncCode}"`
            });

            // 如果 sync_code 没找到，尝试用 user_id 找老记录
            if (records.items.length === 0) {
                records = await pb.collection('leaderboard').getList(1, 1, {
                    filter: `user_id = "${this.userId}"`
                });
            }

            if (records.items.length > 0) {
                const old = records.items[0];

                // 检查是否需要重置周数据（新的一周）
                const oldWeekStart = old.week_start || 0;
                const isNewWeek = oldWeekStart < currentWeekStart;

                // 计算周数据
                let weekKills, weekScore;
                if (isNewWeek) {
                    // 新的一周，重置周数据
                    weekKills = data.kills || 0;
                    weekScore = scoreData.score;
                } else {
                    // 同一周，累加（取最大值）
                    weekKills = Math.max(old.week_kills || 0, data.kills || 0);
                    weekScore = Math.max(old.week_score || 0, scoreData.score);
                }

                // 添加周数据字段
                scoreData.week_kills = weekKills;
                scoreData.week_score = weekScore;
                scoreData.week_start = currentWeekStart;

                // 分数更高 或 金币更高 或 周数据变化 或 需要迁移 sync_code 都触发更新
                const needsMigration = !old.sync_code || old.sync_code !== syncCode;
                const shouldUpdate = scoreData.score > old.score ||
                    scoreData.gold > (old.gold || 0) ||
                    isNewWeek ||
                    weekKills > (old.week_kills || 0) ||
                    weekScore > (old.week_score || 0) ||
                    needsMigration;

                if (shouldUpdate) {
                    // 更新时排除 user_id（唯一索引字段不能重复设置）
                    const { user_id, ...updateData } = scoreData;
                    await pb.collection('leaderboard').update(old.id, updateData);
                    this.loadLeaderboard(true);  // 强制刷新
                }
            } else {
                // 新用户，周数据等于总数据
                scoreData.week_kills = data.kills || 0;
                scoreData.week_score = scoreData.score;
                scoreData.week_start = currentWeekStart;
                await pb.collection('leaderboard').create(scoreData);
                this.loadLeaderboard(true);  // 强制刷新
            }
        } catch (e) { console.error('[Leaderboard] submitScore error:', e); }
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
            // 获取更多数据（50条），让前端根据周榜/总榜分别排序
            const records = await pb.collection('leaderboard').getList(1, 50, {
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
    // 周榜/总榜模式（默认周榜）
    leaderboardMode: 'week',  // 'week' 或 'all'

    // 获取本周一 0:00 的时间戳（用于周榜重置判断）
    getWeekStart() {
        const now = new Date();
        const day = now.getDay();
        const diff = day === 0 ? 6 : day - 1; // 周日是0，需要回退6天
        const monday = new Date(now);
        monday.setDate(now.getDate() - diff);
        monday.setHours(0, 0, 0, 0);
        return monday.getTime();
    },

    // 获取距离下周一的剩余时间（用于显示）
    getTimeToNextWeek() {
        const now = Date.now();
        const weekStart = this.getWeekStart();
        const nextWeekStart = weekStart + 7 * 24 * 60 * 60 * 1000;
        const remaining = nextWeekStart - now;
        const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
        const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        return `${days}天${hours}小时`;
    },

    // 渲染排行榜内容
    renderLeaderboardContent(panel, items) {
        let html = '<div class="panel-close" onclick="togglePanel(\'leaderboard\')"></div>';
        html += '<div class="panel-header">🏆 排行榜</div>';

        // 周榜/总榜 顶级切换
        html += `<div class="leaderboard-mode-tabs">
            <span class="lb-mode-tab ${this.leaderboardMode === 'week' ? 'active' : ''}" onclick="OnlineSystem.switchMode('week')">📅 周榜</span>
            <span class="lb-mode-tab ${this.leaderboardMode === 'all' ? 'active' : ''}" onclick="OnlineSystem.switchMode('all')">🏅 总榜</span>
        </div>`;

        // 周榜倒计时提示
        if (this.leaderboardMode === 'week') {
            html += `<div class="week-countdown">距离重置: ${this.getTimeToNextWeek()}</div>`;
        }

        // 个人最佳记录区域
        html += this.renderPersonalBest();

        // 榜单标签页（周榜模式只显示击杀和综合）
        if (this.leaderboardMode === 'week') {
            html += `<div class="leaderboard-tabs">
                <span class="lb-tab ${this.currentTab === 'score' ? 'active' : ''}" onclick="OnlineSystem.switchTab('score')">综合</span>
                <span class="lb-tab ${this.currentTab === 'kills' ? 'active' : ''}" onclick="OnlineSystem.switchTab('kills')">击杀</span>
                <span class="lb-tab ${this.currentTab === 'abyss' ? 'active' : ''}" onclick="OnlineSystem.switchTab('abyss')">🔥深渊</span>
            </div>`;
        } else {
            html += `<div class="leaderboard-tabs">
                <span class="lb-tab ${this.currentTab === 'score' ? 'active' : ''}" onclick="OnlineSystem.switchTab('score')">综合</span>
                <span class="lb-tab ${this.currentTab === 'kills' ? 'active' : ''}" onclick="OnlineSystem.switchTab('kills')">击杀</span>
                <span class="lb-tab ${this.currentTab === 'floor' ? 'active' : ''}" onclick="OnlineSystem.switchTab('floor')">层数</span>
                <span class="lb-tab ${this.currentTab === 'gold' ? 'active' : ''}" onclick="OnlineSystem.switchTab('gold')">富豪</span>
                <span class="lb-tab ${this.currentTab === 'abyss' ? 'active' : ''}" onclick="OnlineSystem.switchTab('abyss')">🔥深渊</span>
            </div>`;
        }

        // 排行榜列表
        if (items.length === 0) {
            html += '<div style="color: #666; text-align: center; padding: 20px;">暂无数据</div>';
        } else {
            const sortedItems = this.sortByTab(items).slice(0, 10); // 只显示前10名
            if (sortedItems.length === 0) {
                html += '<div style="color: #666; text-align: center; padding: 20px;">本周暂无数据</div>';
            }
            sortedItems.forEach((item, i) => {
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                // 双轨匹配：优先 sync_code，兜底 user_id
                const mySyncCode = CloudSync.syncCode || localStorage.getItem('temp_user_id');
                const isMe = (mySyncCode && item.sync_code === mySyncCode) || item.user_id === this.userId;
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

        // 深渊榜单使用独立的数据源
        if (tab === 'abyss') {
            this.renderAbyssLeaderboard(panel);
            return;
        }

        if (panel && this.leaderboardData) {
            this.renderLeaderboardContent(panel, this.leaderboardData);
        }
    },

    // 渲染深渊排行榜（保持与普通榜一致的风格）
    renderAbyssLeaderboard(panel) {
        if (!panel) return;

        // 先显示加载状态，保持完整UI结构
        let html = '<div class="panel-close" onclick="togglePanel(\'leaderboard\')"></div>';
        html += '<div class="panel-header">🏆 排行榜</div>';

        // 周榜/总榜切换（深渊榜不区分）
        html += `<div class="leaderboard-mode-tabs">
            <span class="lb-mode-tab ${this.leaderboardMode === 'week' ? 'active' : ''}" onclick="OnlineSystem.switchMode('week')">📅 周榜</span>
            <span class="lb-mode-tab ${this.leaderboardMode === 'all' ? 'active' : ''}" onclick="OnlineSystem.switchMode('all')">🏅 总榜</span>
        </div>`;

        // 深渊个人记录
        const bestScore = parseInt(localStorage.getItem('abyss_best_score') || '0');
        const bestFloor = parseInt(localStorage.getItem('abyss_best_floor') || '0');
        html += `<div class="personal-best">
            <div class="pb-title">🔥 深渊挑战</div>
            <div class="pb-grid">
                <div class="pb-item"><span class="pb-label">最高层数</span><span class="pb-value" style="color:#ff6600;">${bestFloor}层</span></div>
                <div class="pb-item"><span class="pb-label">最高积分</span><span class="pb-value" style="color:#ffcc00;">${bestScore}分</span></div>
            </div>
        </div>`;

        // 周重置倒计时
        html += `<div class="week-countdown">⏱️ 距离重置: ${this.getTimeToNextWeek()}</div>`;


        // Tab标签（与其他榜一致）
        html += `<div class="leaderboard-tabs">
            <span class="lb-tab" onclick="OnlineSystem.switchTab('score')">综合</span>
            <span class="lb-tab" onclick="OnlineSystem.switchTab('kills')">击杀</span>
            ${this.leaderboardMode !== 'week' ? '<span class="lb-tab" onclick="OnlineSystem.switchTab(\'floor\')">层数</span>' : ''}
            ${this.leaderboardMode !== 'week' ? '<span class="lb-tab" onclick="OnlineSystem.switchTab(\'gold\')">富豪</span>' : ''}
            <span class="lb-tab active">🔥深渊</span>
        </div>`;

        html += '<div id="abyss-loading" style="color: #888; text-align: center; padding: 20px;">加载中...</div>';
        panel.innerHTML = html;
        this.bindPanelDrag(panel);

        // 加载深渊数据
        this.getAbyssLeaderboard((data) => {
            if (this.currentTab !== 'abyss') return; // 用户已切换走

            let listHtml = '';
            if (data.error) {
                listHtml = '<div style="color: #f44; text-align: center; padding: 20px;">加载失败</div>';
            } else if (data.list.length === 0) {
                listHtml = '<div style="color: #666; text-align: center; padding: 20px;">暂无挑战者，快来争夺榜首！</div>';
            } else {
                data.list.slice(0, 10).forEach((item, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    listHtml += `<div class="stat-row" style="${item.isSelf ? 'color: #ffff00; background: rgba(255,255,0,0.1);' : ''}">
                        <span>${medal} ${item.name}</span>
                        <span style="color: #ff8800;">${item.floor}层 ${item.score}分</span>
                    </div>`;
                });

                // 我的排名
                if (data.myRank > 0) {
                    listHtml += `<div class="stat-row" style="margin-top: 10px; border-top: 1px solid #333; padding-top: 10px; color: #ffcc00;">
                        <span>我的排名</span>
                        <span>第 ${data.myRank} 名</span>
                    </div>`;
                }
            }

            // 只更新列表部分
            const loadingDiv = document.getElementById('abyss-loading');
            if (loadingDiv) {
                loadingDiv.outerHTML = listHtml;
            }
        });
    },

    // 切换周榜/总榜模式
    switchMode(mode) {
        this.leaderboardMode = mode;
        // 周榜模式下只支持 score 和 kills
        if (mode === 'week' && this.currentTab !== 'score' && this.currentTab !== 'kills') {
            this.currentTab = 'score';
        }
        const panel = document.getElementById('leaderboard-panel');
        if (panel && this.leaderboardData) {
            this.renderLeaderboardContent(panel, this.leaderboardData);
        }
    },

    // 根据当前标签排序
    sortByTab(items) {
        const sorted = [...items];
        const isWeekMode = this.leaderboardMode === 'week';
        const currentWeekStart = this.getWeekStart();

        switch (this.currentTab) {
            case 'kills':
                if (isWeekMode) {
                    // 周榜：按 week_kills 排序，过滤掉非本周数据
                    return sorted
                        .filter(item => (item.week_start || 0) >= currentWeekStart)
                        .sort((a, b) => (b.week_kills || 0) - (a.week_kills || 0));
                }
                return sorted.sort((a, b) => (b.kills || 0) - (a.kills || 0));
            case 'floor':
                return sorted.sort((a, b) => {
                    const aFloor = a.is_hell ? (a.max_floor || 0) + 10 : (a.max_floor || 0);
                    const bFloor = b.is_hell ? (b.max_floor || 0) + 10 : (b.max_floor || 0);
                    return bFloor - aFloor;
                });
            case 'gold':
                return sorted.sort((a, b) => (b.gold || 0) - (a.gold || 0));
            default: // score
                if (isWeekMode) {
                    // 周榜：按 week_score 排序，过滤掉非本周数据
                    return sorted
                        .filter(item => (item.week_start || 0) >= currentWeekStart)
                        .sort((a, b) => (b.week_score || 0) - (a.week_score || 0));
                }
                return sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
    },

    // 根据当前标签获取显示文本
    getValueText(item) {
        const isWeekMode = this.leaderboardMode === 'week';

        switch (this.currentTab) {
            case 'kills':
                if (isWeekMode) {
                    return `${item.week_kills || 0} 击杀`;
                }
                return `${item.kills || 0} 击杀`;
            case 'floor':
                return item.is_hell ? `地狱${item.max_floor}层` : `${item.max_floor}层`;
            case 'gold':
                return `${(item.gold || 0).toLocaleString()} 金币`;
            default:
                if (isWeekMode) {
                    return `周分: ${item.week_score || 0}`;
                }
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
        // 摆摊相关公告不需要楼层信息
        const needsFloor = !['stall_open', 'item_sold'].includes(record.type);
        let floorText = '';
        if (needsFloor) {
            const floorName = getFloorName(record.floor, record.is_hell);
            floorText = `第${record.floor}层「${floorName}」`;
        }

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
            case 'stall_open':
                return {
                    text: `🛒 ${record.nickname} 开设了摊位「${record.target_name}」`,
                    type: 'stall'
                };
            case 'item_sold':
                return {
                    text: `💰 ${record.nickname} 卖出了 ${record.target_name}，获得 ${record.extra_data}G`,
                    type: 'gold'
                };
            case 'abyss_champion':
                return {
                    text: `🔥【深渊快报】${record.nickname} 击败了 ${record.target_name}，登顶深渊王者！`,
                    type: 'abyss'
                };
            case 'abyss_top10':
                return {
                    text: `💀 ${record.nickname} 闯入深渊前10！当前排名第${record.extra_data}名`,
                    type: 'abyss'
                };
            case 'title_unlock':
                return {
                    text: `👑 ${record.nickname} 获得了称号「${record.target_name}」`,
                    type: 'title'
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
        const typeClassMap = {
            'boss': 'boss-announcement',
            'set': 'set-announcement',
            'level': 'level-announcement',
            'enhance': 'enhance-announcement',
            'abyss': 'abyss-announcement',
            'title': 'title-announcement'
        };
        content.className = typeClassMap[announcement.type] || 'set-announcement';

        // 重置动画
        content.style.animation = 'none';
        content.offsetHeight; // 触发重绘
        content.style.animation = 'scrollAnnouncement 8s linear';

        // 动画结束后显示下一条
        setTimeout(() => this.scrollNextAnnouncement(), 8500);
    },

    // 提交公告
    async announce(type, targetName, extraData) {
        if (!this.userId || !this.nickname) return;

        const floor = typeof player !== 'undefined' ?
            (player.isInHell ? player.hellFloor : player.floor) : 1;
        const isHell = typeof player !== 'undefined' ? player.isInHell : false;

        const recordData = {
            type: type,
            nickname: this.nickname,
            floor: floor,
            is_hell: isHell,
            target_name: targetName
        };

        // 如果有额外数据（如销售金额），添加到记录中
        if (extraData !== undefined) {
            recordData.extra_data = extraData.toString();
        }

        try {
            await pb.collection('announcements').create(recordData);
            // 顺便清理旧公告，只保留最近20条
            this.gcKeepRecent('announcements', 20);
        } catch (e) {
            if (e.status === 403) {
                console.warn('[公告系统] 无法发布公告: 请在 PocketBase 后台将 announcements 表的 Create 权限设置为开放 (空字符串)。');
            } else {
                console.error('[公告系统] 发布公告异常:', e.message);
                if (e.response && e.response.data) {
                    console.error('[公告系统] 错误详情:', JSON.stringify(e.response.data));
                }
            }
        }
    }
};

// ========== 世界聊天系统 ==========
const ChatSystem = {
    isCollapsed: false,
    lastSendTime: 0,
    SEND_COOLDOWN: 3000,  // 3秒发言冷却
    MAX_MESSAGES: 50,     // 最大保留消息数
    realtimeSubscribed: false,
    unreadCount: 0,       // 未读消息数
    isSending: false,     // 发送锁，防止重复发送
    isReady: false,       // 聊天系统是否就绪（敏感词库+Realtime订阅完成）

    // 获取当前应显示的称号（最新优先）
    getDisplayTitle() {
        if (typeof player === 'undefined') return '';

        const purchasedTitle = player.currentTitle && player.currentTitle !== 'none'
            ? (typeof TITLES !== 'undefined' ? TITLES.find(t => t.id === player.currentTitle)?.name : null)
            : null;
        const abyssTitle = player.abyssTitle || null;

        // 如果都没有称号
        if (!purchasedTitle && !abyssTitle) return '';

        // 如果只有一个，直接返回
        if (!purchasedTitle) return abyssTitle;
        if (!abyssTitle) return purchasedTitle;

        // 两者都有，比较获取时间（最新优先）
        const titleTime = player.titleObtainedTime || 0;
        const abyssTitleTime = player.abyssTitleObtainedTime || 0;

        return titleTime >= abyssTitleTime ? purchasedTitle : abyssTitle;
    },

    // 敏感词列表（从服务器加载，这里是备用默认值）
    BLOCKED_WORDS: ['sb', 'cnm', 'nmsl'],

    // 从服务器加载敏感词
    async loadBlockedWords() {
        try {
            const record = await pb.collection('settings').getFirstListItem('key = "blocked_words"');
            if (record && Array.isArray(record.value)) {
                this.BLOCKED_WORDS = record.value;
                console.log('[聊天系统] 敏感词库已加载:', this.BLOCKED_WORDS.length, '个');
            }
        } catch (e) {
            console.warn('[聊天系统] 加载敏感词库失败，使用默认列表');
        }
    },

    // 敏感词过滤（全局通用，用*替代敏感词）
    filterSensitiveWords(text) {
        let result = text;
        for (const word of this.BLOCKED_WORDS) {
            // 不区分大小写替换
            const regex = new RegExp(this.escapeRegex(word), 'gi');
            result = result.replace(regex, '*'.repeat(word.length));
        }
        return result;
    },

    // 初始化聊天系统
    async init() {
        // 初始时禁用聊天框（灰色、折叠、不可交互）
        this.setDisabled(true);

        // 并行加载敏感词库和订阅消息
        await Promise.all([
            this.loadBlockedWords(),
            this.subscribeMessages()
        ]);

        this.bindEvents();
        this.loadRecentMessages();

        // 从 localStorage 恢复折叠状态
        this.isCollapsed = localStorage.getItem('chat_collapsed') === 'true';
        if (this.isCollapsed) {
            document.getElementById('chat-box')?.classList.add('collapsed');
        }

        // 初始化完成，激活聊天框
        this.setReady();
    },

    // 设置聊天系统就绪状态
    setReady() {
        this.isReady = true;
        this.setDisabled(false);
        console.log('[聊天系统] 初始化完成，聊天功能已激活');
    },

    // 设置聊天框禁用/启用状态
    setDisabled(disabled) {
        const chatBox = document.getElementById('chat-box');
        if (!chatBox) return;

        if (disabled) {
            chatBox.classList.add('chat-disabled');
        } else {
            chatBox.classList.remove('chat-disabled');
        }
    },

    // 绑定事件
    bindEvents() {
        const input = document.getElementById('chat-input');
        if (input) {
            // 回车发送，阻止事件冒泡到游戏
            input.onkeydown = (e) => {
                e.stopPropagation();  // 阻止冒泡，防止触发游戏交互
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            };
            // 阻止游戏按键冲突
            input.onkeyup = (e) => e.stopPropagation();
            input.onfocus = () => {
                // 聊天输入时禁用游戏快捷键
                window.chatInputFocused = true;
            };
            input.onblur = () => {
                window.chatInputFocused = false;
            };
        }
    },

    // 订阅实时消息
    async subscribeMessages() {
        try {
            await pb.collection('chat_messages').subscribe('*', (e) => {
                if (e.action === 'create') {
                    this.addMessage(e.record);
                }
            });
            this.realtimeSubscribed = true;
            console.log('[聊天系统] Realtime 订阅成功');
        } catch (e) {
            console.warn('[聊天系统] Realtime 订阅失败', e);
        }
    },

    // 加载最近消息
    async loadRecentMessages() {
        try {
            const records = await pb.collection('chat_messages').getList(1, 20, {
                sort: '-created'
            });
            // 倒序添加（旧消息在上）
            records.items.reverse().forEach(msg => this.addMessage(msg, false));
            this.scrollToBottom();
        } catch (e) {
            console.warn('[聊天系统] 加载历史消息失败', e);
        }
    },

    // 发送消息
    async sendMessage() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        const message = input.value.trim();
        if (!message) return;

        // 防止重复发送（网络卡顿时）
        if (this.isSending) return;

        // 检查登录状态
        if (!OnlineSystem.nickname) {
            this.addSystemMessage('请先设置昵称');
            return;
        }

        // 检查冷却
        const now = Date.now();
        if (now - this.lastSendTime < this.SEND_COOLDOWN) {
            const remaining = Math.ceil((this.SEND_COOLDOWN - (now - this.lastSendTime)) / 1000);
            this.addSystemMessage(`发言冷却中 (${remaining}秒)`);
            return;
        }

        // 处理物品分享链接（如果有待发送的物品）
        let processedMessage = message;
        if (typeof pendingShareItem !== 'undefined' && pendingShareItem) {
            const itemData = pendingShareItem;
            const baseName = itemData.n;
            const enhanceText = itemData.e > 0 ? ` +${itemData.e}` : '';  // 注意空格
            const placeholder = `[${baseName}${enhanceText}]`;

            // 生成编码后的物品链接
            const encoded = btoa(encodeURIComponent(JSON.stringify(itemData)));
            const itemLink = `[item:${encoded}]`;

            // 替换显示名为编码格式
            processedMessage = message.replace(placeholder, itemLink);
            pendingShareItem = null;  // 清除待发送物品
        }

        // 敏感词过滤 - 但跳过物品链接部分
        let filtered = processedMessage;
        const itemLinkMatch = processedMessage.match(/\[item:[A-Za-z0-9+/=]+\]/);
        if (itemLinkMatch) {
            // 保护物品链接，过滤其他部分
            const linkPlaceholder = '___ITEM_LINK___';
            const tempMsg = processedMessage.replace(itemLinkMatch[0], linkPlaceholder);
            const filteredTemp = this.filterMessage(tempMsg);
            filtered = filteredTemp.replace(linkPlaceholder, itemLinkMatch[0]);
        } else {
            filtered = this.filterMessage(processedMessage);
        }

        // 获取玩家等级
        const level = typeof player !== 'undefined' ? player.lvl : 1;

        // 设置发送锁
        this.isSending = true;
        input.disabled = true;

        // 获取当前应显示的称号（最新优先）
        const displayTitle = this.getDisplayTitle();

        try {
            const record = await pb.collection('chat_messages').create({
                nickname: OnlineSystem.nickname,
                level: level,
                message: filtered,  // 发送过滤后的消息
                user_id: OnlineSystem.userId,
                title: displayTitle  // 称号
            });
            input.value = '';
            this.lastSendTime = now;
            // 立即本地显示自己发送的消息
            this.addMessage(record);
            // 顺便清理旧消息，只保留最近50条
            OnlineSystem.gcKeepRecent('chat_messages', 50);
        } catch (e) {
            this.addSystemMessage('发送失败，请稍后重试');
        } finally {
            // 释放发送锁
            this.isSending = false;
            input.disabled = false;
            input.focus();
        }
    },

    // 转义正则特殊字符
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    // 敏感词过滤（用*替代敏感词）
    filterMessage(message) {
        return this.filterSensitiveWords(message);
    },

    shownMessageIds: new Set(),  // 防重复显示

    // 解析并渲染物品链接
    parseItemLinks(text) {
        // 匹配 [item:base64data] 格式
        const itemLinkRegex = /\[item:([A-Za-z0-9+/=]+)\]/g;

        const result = text.replace(itemLinkRegex, (match, base64Data) => {
            try {
                const jsonStr = decodeURIComponent(atob(base64Data));
                const item = JSON.parse(jsonStr);

                // 获取稀有度颜色
                const rarityColors = {
                    0: '#aaa', 1: '#fff', 2: '#4d94ff',
                    3: '#ffff00', 4: '#c7b377', 5: '#00ff00'
                };
                const color = rarityColors[item.r] || '#fff';
                const enhanceText = item.e > 0 ? ` +${item.e}` : '';  // 注意空格

                // 返回可点击的物品链接
                return `<span class="chat-item-link" style="color:${color}" data-item='${this.escapeHtml(base64Data)}'>[${this.escapeHtml(item.n)}${enhanceText}]</span>`;
            } catch (e) {
                return match; // 解析失败则原样返回
            }
        });
        return result;
    },

    // 显示物品链接的tooltip（定位在点击位置附近，无分享按钮）
    showItemLinkTooltip(base64Data, event) {
        try {
            const jsonStr = decodeURIComponent(atob(base64Data));
            const data = JSON.parse(jsonStr);

            // 重建物品对象用于tooltip显示
            const item = {
                name: data.n,
                displayName: data.n,
                rarity: data.r,
                type: data.t,
                setId: data.s,
                stats: data.st,
                def: data.f,
                enhanceLvl: data.e
            };

            // 解析伤害
            if (data.d) {
                const [min, max] = data.d.split('-').map(Number);
                item.minDmg = min;
                item.maxDmg = max;
            }

            // 使用专用的聊天链接tooltip显示函数（定位在点击位置，无分享按钮）
            if (typeof showTooltipForChatLink === 'function') {
                showTooltipForChatLink(item, event);
            }
        } catch (e) {
            console.warn('解析物品链接失败', e);
        }
    },

    // 添加消息到聊天框
    addMessage(record, scroll = true) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        // 防重复
        if (this.shownMessageIds.has(record.id)) return;
        this.shownMessageIds.add(record.id);
        // 清理过多的ID
        if (this.shownMessageIds.size > 200) {
            const arr = Array.from(this.shownMessageIds);
            this.shownMessageIds = new Set(arr.slice(-100));
        }

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-msg';

        // 判断是否是自己的消息
        const isMe = record.user_id === OnlineSystem.userId;
        const nicknameColor = isMe ? '#ffff88' : '#88ccff';

        // 称号显示
        let titleHtml = '';
        if (record.title) {
            titleHtml = `<span class="chat-msg-title">「${this.escapeHtml(record.title)}」</span>`;
        }

        // 处理消息内容：先转义HTML，再解析物品链接
        const escapedMsg = this.escapeHtml(record.message);
        const parsedMsg = this.parseItemLinks(escapedMsg);

        msgEl.innerHTML = `
            <span class="chat-msg-nickname" style="color:${nicknameColor}">${this.escapeHtml(record.nickname)}</span>${titleHtml}
            <span class="chat-msg-level">Lv.${record.level}</span>:
            <span class="chat-msg-content">${parsedMsg}</span>
        `;

        // 绑定物品链接点击事件
        msgEl.querySelectorAll('.chat-item-link').forEach(link => {
            link.onclick = (e) => {
                e.stopPropagation();
                const itemData = link.dataset.item;
                if (itemData) {
                    this.showItemLinkTooltip(itemData, e);
                }
            };
        });

        container.appendChild(msgEl);

        // 限制消息数量
        while (container.children.length > this.MAX_MESSAGES) {
            container.removeChild(container.firstChild);
        }

        // 折叠时增加未读计数（自己的消息不算）
        if (this.isCollapsed && scroll && !isMe) {
            this.unreadCount++;
            this.updateUnreadDisplay();
        }

        if (scroll) {
            this.scrollToBottom();
        }
    },

    // 更新未读消息显示
    updateUnreadDisplay() {
        const el = document.getElementById('chat-unread');
        if (!el) return;

        if (this.unreadCount > 0) {
            el.textContent = this.unreadCount > 99 ? '(99+)' : `(${this.unreadCount})`;
        } else {
            el.textContent = '';
        }
    },

    // 添加系统消息
    addSystemMessage(text) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        const msgEl = document.createElement('div');
        msgEl.className = 'chat-msg system';
        msgEl.innerHTML = `<span class="chat-msg-nickname">[系统]</span> ${this.escapeHtml(text)}`;
        container.appendChild(msgEl);
        this.scrollToBottom();
    },

    // 滚动到底部
    scrollToBottom() {
        const container = document.getElementById('chat-messages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    },

    // HTML 转义（防 XSS）
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // 切换折叠状态
    toggle() {
        // 未就绪时不允许展开
        if (!this.isReady && this.isCollapsed) {
            return;  // 保持折叠，不响应点击
        }

        this.isCollapsed = !this.isCollapsed;
        const chatBox = document.getElementById('chat-box');
        if (chatBox) {
            chatBox.classList.toggle('collapsed', this.isCollapsed);
        }
        localStorage.setItem('chat_collapsed', this.isCollapsed);

        // 展开时：清空未读、滚动到底部、聚焦输入框
        if (!this.isCollapsed) {
            this.unreadCount = 0;
            this.updateUnreadDisplay();
            // 延迟执行，等待 CSS 动画完成
            setTimeout(() => {
                this.scrollToBottom();
                document.getElementById('chat-input')?.focus();
            }, 50);
        }
    }
};

// 全局函数：切换聊天框
function toggleChatBox() {
    ChatSystem.toggle();
}

// 全局函数：发送聊天消息
function sendChatMessage() {
    ChatSystem.sendMessage();
}

// 页面加载后初始化
window.addEventListener('load', () => {
    setTimeout(() => {
        ChatSystem.init(); // 先初始化聊天系统（包含敏感词库）

        // 检查是否有未读的更新公告
        const lastReadVersion = localStorage.getItem('changelog_read_version');
        const currentVersion = typeof CURRENT_VERSION !== 'undefined' ? CURRENT_VERSION : null;
        const hasUnreadChangelog = !lastReadVersion || lastReadVersion !== currentVersion;

        // 如果有未读公告，先不显示注册框，等关闭公告后再显示
        OnlineSystem.init(!hasUnreadChangelog);
        OnlineSystem.initAnnouncements();
    }, 1000);
});

// ========== 深渊排行榜 Mock (Patch) ==========
if (typeof OnlineSystem !== 'undefined') {
    // ========== 深渊排行榜 (Real) ==========
    OnlineSystem.getAbyssLeaderboard = async function (callback, minLvl, maxLvl) {
        try {
            let filter = '';
            if (minLvl !== undefined && maxLvl !== undefined) {
                filter = `level >= ${minLvl} && level <= ${maxLvl}`;
            } else if (minLvl !== undefined) {
                filter = `level >= ${minLvl}`;
            }

            // 获取分赛区前100名
            const result = await pb.collection('abyss_rank').getList(1, 100, {
                sort: '-score',
                filter: filter,
                expand: 'user'
            });

            const records = result.items.map((item, index) => ({
                rank: index + 1,
                name: item.nickname || 'Unknown',
                lvl: item.level || 1,
                floor: item.floor || 1,
                score: item.score || 0,
                // 通过同步码识别自己（包括临时ID）
                isSelf: item.sync_code === CloudSync.syncCode ||
                    item.sync_code === localStorage.getItem('temp_user_id')
            }));

            // 获取我的排名 (如果在前100名里)
            let myRank = -1;
            let myLevelRank = -1;

            const myRecord = records.find(r => r.isSelf);
            if (myRecord) myRank = myRecord.rank;

            // TODO: 如果不在前100，需要单独查询

            // 计算同级排名 (简单过滤前100名中的同级方便展示，准确数据需后端支持)
            const myLvl = player.lvl;
            const levelSubset = records.filter(r => Math.abs(r.lvl - myLvl) <= 5);
            // 重新排序子集
            levelSubset.sort((a, b) => b.score - a.score);

            if (myRecord) {
                myLevelRank = levelSubset.findIndex(r => r.isSelf) + 1;
            }

            if (callback) callback({
                list: records,
                myRank: myRank,
                myLevelRank: myLevelRank,
                totalPlayers: result.totalItems
            });

        } catch (e) {
            console.error('[Online] 排行榜拉取失败:', e);
            // 失败时返回空或显示错误，不再伪造数据
            if (callback) callback({
                list: [],
                myRank: 0,
                myLevelRank: 0,
                totalPlayers: 0,
                error: true
            });
        }
    };

    OnlineSystem.submitAbyssScore = async function (score, floor) {
        // 获取同步码，如果未绑定则使用临时ID（6位纯字母数字）
        let syncCode = CloudSync.syncCode;
        if (!syncCode) {
            let tempId = localStorage.getItem('temp_user_id');
            if (!tempId) {
                tempId = Math.random().toString(36).substr(2, 6).toUpperCase();
                localStorage.setItem('temp_user_id', tempId);
            }
            syncCode = tempId;
        }

        const data = {
            sync_code: syncCode,
            nickname: OnlineSystem.nickname || '勇士',
            score: score,
            floor: floor,
            level: player.lvl
        };

        console.log('[Abyss] 提交数据:', JSON.stringify(data));

        try {
            // 先获取当前第1名（用于判断是否超越）
            const topResult = await pb.collection('abyss_rank').getList(1, 1, {
                sort: '-score'
            });
            const previousChampion = topResult.items.length > 0 ? topResult.items[0] : null;
            const previousChampionScore = previousChampion ? previousChampion.score : 0;
            const previousChampionName = previousChampion ? previousChampion.nickname : null;

            // 获取我之前的排名
            const previousRankData = await pb.collection('abyss_rank').getList(1, 1, {
                filter: `sync_code = "${syncCode}"`
            });
            const myPreviousScore = previousRankData.items.length > 0 ? previousRankData.items[0].score : 0;

            // 查询是否已有记录
            const existing = await pb.collection('abyss_rank').getList(1, 1, {
                filter: `sync_code = "${syncCode}"`
            });

            if (existing.items.length > 0) {
                const record = existing.items[0];
                // 只有分数更高时才更新
                if (score > record.score) {
                    await pb.collection('abyss_rank').update(record.id, data);
                    console.log('[Online] 更新深渊记录:', score);
                }
            } else {
                await pb.collection('abyss_rank').create(data);
                console.log('[Online] 创建深渊记录:', score);
            }

            // 获取本赛区的排名（阶梯赛逻辑）
            const myBracket = player.lvl <= 30 ? [20, 30] : (player.lvl <= 50 ? [31, 50] : [51, 999]);
            const bracketFilter = `level >= ${myBracket[0]} && level <= ${myBracket[1]}`;

            // 检查赛区内是否超越第1名
            const bracketTopResult = await pb.collection('abyss_rank').getList(1, 1, {
                sort: '-score',
                filter: bracketFilter
            });
            const previousBracketChampion = bracketTopResult.items.length > 0 ? bracketTopResult.items[0] : null;

            if (score > (previousBracketChampion?.score || 0) && previousBracketChampion?.nickname !== data.nickname) {
                const bracketName = player.lvl <= 30 ? '新秀赛区' : (player.lvl <= 50 ? '精英赛区' : '巅峰赛区');
                OnlineSystem.announce('abyss_champion', `[${bracketName}]`, score);
                console.log(`[Abyss] 公告：超越${bracketName}王者`);
            }

            // 检查赛区内是否进入前10
            const bracketRankResult = await pb.collection('abyss_rank').getList(1, 10, {
                sort: '-score',
                filter: bracketFilter
            });
            const myBracketRank = bracketRankResult.items.findIndex(r => r.sync_code === syncCode) + 1;
            if (myBracketRank > 0 && myBracketRank <= 10 && myPreviousScore === 0) {
                OnlineSystem.announce('abyss_top10', '赛区挑战', myBracketRank);
            }

        } catch (e) {
            console.error('[Online] 提交分数失败:', e);
            // 打印详细错误信息
            if (e.response && e.response.data) {
                console.error('[Online] 错误详情:', JSON.stringify(e.response.data));
            }
        }
    };
}
