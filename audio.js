// ========== 音频系统 ==========
// Settings 全局设置（BGM/SFX 开关）
const Settings = { bgm: true, sfx: true };

const AudioSys = {
    ctx: null,
    bgmEl: null,
    bgmUrl: "bg.mp3",
    masterGain: null, sfxGain: null,
    bgmNode: null, bgmGainNode: null, bgmFilter: null, // BGM 音频节点
    bgmPlaying: false,
    bgmRetryNeeded: false,
    // 金币连续拾取音调
    goldPitch: 1.0,
    lastGoldTime: 0,
    // 心跳音效计时
    heartbeatTimer: 0,
    sfxAssetConfig: {
        lightningImpact: { url: 'audio/sfx/lightning_impact.mp3', volume: 0.86 },
        lightningEnemy: { url: 'audio/sfx/lightning_enemy.mp3', volume: 0.74 },
        swordSwing: { url: 'audio/sfx/sword_swing.mp3', volume: 0.86 }
    },
    sfxBuffers: {},
    sfxLoading: {},
    init: function () {
        if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.ctx.createGain();
            this.sfxGain = this.ctx.createGain();

            this.sfxGain.connect(this.masterGain);
            this.masterGain.connect(this.ctx.destination);

            this.sfxGain.gain.value = Settings.sfx ? 1.0 : 0;

            // BGM 链路: source -> bgmGainNode -> bgmFilter -> masterGain
            this.bgmFilter = this.ctx.createBiquadFilter();
            this.bgmFilter.type = 'lowpass';
            this.bgmFilter.frequency.value = 22000; // 默认全通
            this.bgmFilter.connect(this.masterGain);

            this.bgmGainNode = this.ctx.createGain();
            this.bgmGainNode.gain.value = Settings.bgm ? 0.3 : 0;
            this.bgmGainNode.connect(this.bgmFilter);

            this.bgmEl = new Audio(this.bgmUrl);
            this.bgmEl.loop = true;
            // 注意：当使用 MediaElementSource 时，element.volume 也可以控制，但我们主要用 GainNode
            this.bgmEl.volume = 1.0;

            // 创建 MediaElementSource 需要在用户交互后或上下文 ready 时，但在 init 通常也可以
            // 为了安全，我们只创建一次。注意：有些旧浏览器可能需要前缀，但现在通常不需要
            try {
                this.bgmNode = this.ctx.createMediaElementSource(this.bgmEl);
                this.bgmNode.connect(this.bgmGainNode);
            } catch (e) {
                console.error("Error creating MediaElementSource:", e);
                // 降级处理：如果不成功，至少让它响，虽然没有滤镜效果
                this.bgmEl.volume = Settings.bgm ? 0.3 : 0;
            }

            // 监听音频结束事件，确保循环播放
            this.bgmEl.addEventListener('ended', () => {
                if (Settings.bgm && this.bgmPlaying) {
                    this.bgmEl.currentTime = 0;
                    this.bgmEl.play().catch(e => console.log("BGM restart failed:", e));
                }
            });

            this.preloadSfxAssets();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    preloadSfxAssets: function () {
        Object.keys(this.sfxAssetConfig).forEach(id => this.loadSfxAsset(id));
    },
    loadSfxAsset: function (id) {
        const config = this.sfxAssetConfig[id];
        if (!this.ctx || !config) return Promise.resolve(null);
        if (this.sfxBuffers[id]) return Promise.resolve(this.sfxBuffers[id]);
        if (this.sfxLoading[id]) return this.sfxLoading[id];

        this.sfxLoading[id] = fetch(config.url)
            .then(response => {
                if (!response.ok) throw new Error(`音效加载失败 ${config.url}`);
                return response.arrayBuffer();
            })
            .then(buffer => this.ctx.decodeAudioData(buffer))
            .then(decoded => {
                this.sfxBuffers[id] = decoded;
                return decoded;
            })
            .catch(error => {
                console.warn(error.message);
                return null;
            })
            .finally(() => {
                delete this.sfxLoading[id];
            });

        return this.sfxLoading[id];
    },
    playSfxAsset: function (id, volume = 1, delay = 0) {
        const config = this.sfxAssetConfig[id];
        if (!this.ctx || !config) return false;

        const buffer = this.sfxBuffers[id];
        if (!buffer) {
            this.loadSfxAsset(id);
            return false;
        }

        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        source.buffer = buffer;
        gain.gain.setValueAtTime((config.volume || 1) * volume, this.ctx.currentTime + delay);
        source.connect(gain);
        gain.connect(this.sfxGain);
        source.start(this.ctx.currentTime + delay);
        return true;
    },
    startBGM: function () {
        if (this.bgmEl && Settings.bgm && !this.bgmPlaying) {
            console.log("Attempting to start BGM...");
            this.bgmPlaying = true;
            this.bgmEl.play().then(() => {
                console.log("BGM started successfully");
            }).catch(e => {
                console.log("BGM play failed:", e);
                this.bgmPlaying = false;
                // 如果失败，可能是需要更多用户交互，设置标记稍后重试
                this.bgmRetryNeeded = true;
            });
        }
    },
    stopBGM: function () {
        if (this.bgmEl && this.bgmPlaying) {
            this.bgmEl.pause();
            this.bgmPlaying = false;
        }
    },
    resumeBGM: function () {
        if (this.bgmEl && Settings.bgm && !this.bgmPlaying) {
            // 如果有重试标记，先尝试startBGM
            if (this.bgmRetryNeeded) {
                this.bgmRetryNeeded = false;
                this.startBGM();
            } else {
                this.bgmEl.play().then(() => {
                    this.bgmPlaying = true;
                    console.log("BGM resumed successfully");
                }).catch(e => {
                    console.log("BGM resume failed:", e);
                    this.bgmPlaying = false;
                });
            }
        }
    },
    // 在任何用户交互时调用，尝试启动BGM
    tryAutoStartBGM: function () {
        if (this.bgmRetryNeeded && Settings.bgm) {
            console.log("Auto-retrying BGM start...");
            this.bgmRetryNeeded = false;
            this.startBGM();
        }
    },
    makeNoiseBuffer: function (duration) {
        const sampleRate = this.ctx.sampleRate;
        const frameCount = Math.max(1, Math.floor(sampleRate * duration));
        const buffer = this.ctx.createBuffer(1, frameCount, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    },
    playToneLayer: function (type, start, duration, startFreq, endFreq, volume, destination) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, start);
        if (endFreq && endFreq !== startFreq) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), start + duration);
        }
        gain.gain.setValueAtTime(Math.max(0.001, volume), start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(destination || this.sfxGain);
        osc.start(start);
        osc.stop(start + duration);
    },
    playNoiseLayer: function (start, duration, volume, filterType, frequency, q, destination) {
        const source = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        source.buffer = this.makeNoiseBuffer(duration);
        filter.type = filterType;
        filter.frequency.setValueAtTime(frequency, start);
        filter.Q.setValueAtTime(q || 0.6, start);
        gain.gain.setValueAtTime(Math.max(0.001, volume), start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        source.connect(filter);
        filter.connect(gain);
        gain.connect(destination || this.sfxGain);
        source.start(start);
        source.stop(start + duration);
    },
    playCombatImpact: function (kind) {
        const t = this.ctx.currentTime;
        const bus = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(kind === 'kill' ? 7200 : kind === 'crit' ? 9000 : 7600, t);
        filter.Q.setValueAtTime(0.9, t);
        bus.gain.setValueAtTime(1, t);
        bus.connect(filter);
        filter.connect(this.sfxGain);

        if (kind === 'hit') {
            // 普通近战命中：刀刃短擦 + 金属亮边 + 肉体冲击，避免木棒式闷低频。
            this.playNoiseLayer(t, 0.018, 0.075, 'highpass', 3600 + Math.random() * 900, 0.7, bus);
            this.playNoiseLayer(t + 0.006, 0.045, 0.07, 'bandpass', 2100 + Math.random() * 500, 1.4, bus);
            this.playToneLayer('sawtooth', t + 0.004, 0.035, 1700, 820, 0.035, bus);
            this.playToneLayer('triangle', t + 0.012, 0.055, 240, 115, 0.055, bus);
            return;
        }

        if (kind === 'crit') {
            // 暴击命中：更尖的撕裂感和金属擦响，保留短促重心。
            this.playNoiseLayer(t, 0.024, 0.11, 'highpass', 4200 + Math.random() * 1200, 0.8, bus);
            this.playNoiseLayer(t + 0.01, 0.07, 0.1, 'bandpass', 2500 + Math.random() * 800, 1.6, bus);
            this.playToneLayer('sawtooth', t + 0.004, 0.06, 2300, 950, 0.055, bus);
            this.playToneLayer('sine', t + 0.014, 0.08, 1800, 1260, 0.06, bus);
            this.playToneLayer('triangle', t + 0.035, 0.09, 310, 120, 0.065, bus);
            return;
        }

        // 击杀：命中后追加碎裂尾音，但不再用大块低频钝击当主体。
        this.playNoiseLayer(t, 0.03, 0.13, 'highpass', 3800 + Math.random() * 1000, 0.75, bus);
        this.playNoiseLayer(t + 0.018, 0.095, 0.12, 'bandpass', 1600 + Math.random() * 500, 1.1, bus);
        this.playToneLayer('sawtooth', t + 0.003, 0.07, 1550, 620, 0.06, bus);
        this.playToneLayer('triangle', t + 0.02, 0.12, 260, 80, 0.09, bus);
        this.playToneLayer('sine', t + 0.085, 0.12, 720, 240, 0.035, bus);
    },
    playSkillImpact: function (kind) {
        const t = this.ctx.currentTime;
        const bus = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(kind === 'kill' ? 1350 : kind === 'crit' ? 2400 : 1800, t);
        filter.Q.setValueAtTime(kind === 'crit' ? 1.8 : 1.2, t);
        bus.gain.setValueAtTime(0.9, t);
        bus.connect(filter);
        filter.connect(this.sfxGain);

        if (kind === 'hit') {
            this.playNoiseLayer(t, 0.035, 0.065, 'bandpass', 1500 + Math.random() * 600, 1.2, bus);
            this.playNoiseLayer(t + 0.012, 0.07, 0.045, 'highpass', 5200 + Math.random() * 1600, 0.6, bus);
            this.playToneLayer('triangle', t, 0.075, 620, 210, 0.055, bus);
            this.playToneLayer('sine', t + 0.028, 0.08, 980, 520, 0.035, bus);
            return;
        }

        if (kind === 'crit') {
            this.playNoiseLayer(t, 0.028, 0.1, 'highpass', 6500 + Math.random() * 2200, 0.7, bus);
            this.playNoiseLayer(t + 0.018, 0.09, 0.07, 'bandpass', 2100 + Math.random() * 900, 1.7, bus);
            this.playToneLayer('sawtooth', t, 0.055, 1850, 640, 0.045, bus);
            this.playToneLayer('sine', t + 0.018, 0.11, 1320, 740, 0.06, bus);
            this.playToneLayer('triangle', t + 0.052, 0.11, 360, 130, 0.045, bus);
            return;
        }

        this.playNoiseLayer(t, 0.04, 0.12, 'bandpass', 1250 + Math.random() * 500, 1.1, bus);
        this.playNoiseLayer(t + 0.035, 0.14, 0.065, 'highpass', 4200 + Math.random() * 1300, 0.55, bus);
        this.playToneLayer('triangle', t, 0.14, 420, 85, 0.085, bus);
        this.playToneLayer('sine', t + 0.05, 0.2, 880, 220, 0.045, bus);
    },
    playCastCue: function (kind) {
        const t = this.ctx.currentTime;
        const bus = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = kind === 'multishot' ? 'highpass' : 'bandpass';
        filter.frequency.setValueAtTime(kind === 'thunder' ? 2500 : kind === 'multishot' ? 850 : 1250, t);
        filter.Q.setValueAtTime(kind === 'thunder' ? 1.9 : 1.1, t);
        bus.gain.setValueAtTime(0.9, t);
        bus.connect(filter);
        filter.connect(this.sfxGain);

        if (kind === 'fire') {
            this.playNoiseLayer(t, 0.026, 0.095, 'highpass', 2600 + Math.random() * 700, 0.7, bus);
            this.playNoiseLayer(t + 0.016, 0.2, 0.075, 'bandpass', 950 + Math.random() * 280, 1.0, bus);
            this.playToneLayer('sawtooth', t, 0.2, 210, 92, 0.085, bus);
            this.playToneLayer('sine', t + 0.025, 0.12, 1280, 520, 0.04, bus);
            return;
        }

        if (kind === 'thunder') {
            this.playNoiseLayer(t, 0.018, 0.13, 'highpass', 7600 + Math.random() * 1500, 0.65, bus);
            this.playNoiseLayer(t + 0.028, 0.075, 0.075, 'bandpass', 3200 + Math.random() * 700, 2.2, bus);
            this.playToneLayer('square', t, 0.075, 1800, 220, 0.07, bus);
            this.playToneLayer('sawtooth', t + 0.012, 0.12, 980, 120, 0.055, bus);
            return;
        }

        this.playNoiseLayer(t, 0.025, 0.07, 'bandpass', 2900 + Math.random() * 800, 1.8, bus);
        this.playNoiseLayer(t + 0.012, 0.11, 0.045, 'highpass', 1700 + Math.random() * 500, 0.8, bus);
        this.playToneLayer('triangle', t, 0.06, 760, 380, 0.055, bus);
        this.playToneLayer('sine', t + 0.015, 0.08, 190, 120, 0.026, bus);
    },
    playPlayerDamageCue: function (kind, isLowHp) {
        const t = this.ctx.currentTime;
        const bus = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        const baseFreq = {
            physical: 1150,
            fire: 820,
            cold: 2600,
            lightning: 3600,
            poison: 720
        }[kind] || 1100;
        filter.type = kind === 'physical' ? 'lowpass' : 'bandpass';
        filter.frequency.setValueAtTime(baseFreq, t);
        filter.Q.setValueAtTime(kind === 'lightning' ? 2.4 : 1.2, t);
        bus.gain.setValueAtTime(isLowHp ? 1.08 : 0.92, t);
        bus.connect(filter);
        filter.connect(this.sfxGain);

        if (kind === 'fire') {
            this.playNoiseLayer(t, 0.04, 0.085, 'bandpass', 950 + Math.random() * 380, 1.1, bus);
            this.playNoiseLayer(t + 0.018, 0.12, 0.05, 'highpass', 3800 + Math.random() * 900, 0.6, bus);
            this.playToneLayer('sawtooth', t, 0.12, 230, 90, 0.075, bus);
        } else if (kind === 'cold') {
            this.playNoiseLayer(t, 0.035, 0.075, 'highpass', 5200 + Math.random() * 1200, 0.8, bus);
            this.playToneLayer('triangle', t, 0.1, 1140, 620, 0.06, bus);
            this.playToneLayer('sine', t + 0.045, 0.12, 1840, 980, 0.032, bus);
        } else if (kind === 'lightning') {
            this.playNoiseLayer(t, 0.025, 0.105, 'highpass', 7200 + Math.random() * 1600, 0.65, bus);
            this.playToneLayer('square', t, 0.07, 1640, 230, 0.075, bus);
            this.playToneLayer('sawtooth', t + 0.018, 0.08, 980, 180, 0.045, bus);
        } else if (kind === 'poison') {
            this.playNoiseLayer(t, 0.14, 0.075, 'bandpass', 760 + Math.random() * 220, 1.5, bus);
            this.playToneLayer('sine', t, 0.18, 340, 130, 0.06, bus);
        } else {
            this.playNoiseLayer(t, 0.024, 0.09, 'bandpass', 1350 + Math.random() * 450, 1.2, bus);
            this.playToneLayer('triangle', t, 0.09, 220, 96, 0.08, bus);
            this.playNoiseLayer(t + 0.018, 0.06, 0.04, 'highpass', 2600 + Math.random() * 600, 0.7, bus);
        }

        if (isLowHp) {
            this.playToneLayer('triangle', t + 0.035, 0.12, 88, 54, 0.07, bus);
            this.playNoiseLayer(t + 0.05, 0.08, 0.035, 'lowpass', 520, 0.5, bus);
        }
    },
    playDeathCue: function (kind) {
        const t = this.ctx.currentTime;
        const bus = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(kind === 'boss' ? 7200 : 6200, t);
        filter.frequency.exponentialRampToValueAtTime(kind === 'boss' ? 680 : 1450, t + (kind === 'boss' ? 0.95 : 0.42));
        filter.Q.setValueAtTime(kind === 'boss' ? 0.9 : 1.1, t);
        bus.gain.setValueAtTime(1, t);
        bus.connect(filter);
        filter.connect(this.sfxGain);

        if (kind === 'boss') {
            this.playNoiseLayer(t, 0.055, 0.18, 'highpass', 3600 + Math.random() * 1000, 0.8, bus);
            this.playNoiseLayer(t + 0.05, 0.4, 0.14, 'bandpass', 880 + Math.random() * 240, 1.1, bus);
            this.playToneLayer('square', t, 0.28, 120, 42, 0.14, bus);
            this.playToneLayer('sawtooth', t + 0.08, 0.55, 260, 72, 0.12, bus);
            [262, 330, 392, 523].forEach((f, i) => this.playToneLayer('sine', t + 0.16 + i * 0.07, 0.55, f, f * 0.52, 0.05, bus));
            return;
        }

        this.playNoiseLayer(t, 0.035, 0.12, 'highpass', 4200 + Math.random() * 900, 0.8, bus);
        this.playNoiseLayer(t + 0.025, 0.18, 0.09, 'bandpass', 1600 + Math.random() * 500, 1.4, bus);
        this.playToneLayer('sawtooth', t, 0.12, 820, 230, 0.07, bus);
        this.playToneLayer('triangle', t + 0.045, 0.22, 300, 94, 0.075, bus);
        [740, 980].forEach((f, i) => this.playToneLayer('sine', t + 0.1 + i * 0.05, 0.2, f, f * 0.62, 0.03, bus));
    },
    playBossCastCue: function () {
        const t = this.ctx.currentTime;
        const bus = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(740, t);
        filter.frequency.exponentialRampToValueAtTime(1180, t + 0.42);
        filter.Q.setValueAtTime(1.35, t);
        bus.gain.setValueAtTime(0.85, t);
        bus.connect(filter);
        filter.connect(this.sfxGain);

        this.playNoiseLayer(t, 0.12, 0.055, 'bandpass', 680 + Math.random() * 180, 1.2, bus);
        this.playToneLayer('sawtooth', t, 0.42, 96, 180, 0.06, bus);
        this.playToneLayer('triangle', t + 0.06, 0.32, 300, 520, 0.04, bus);
        this.playNoiseLayer(t + 0.28, 0.08, 0.04, 'highpass', 4200 + Math.random() * 900, 0.7, bus);
    },
    play: function (type) {
        if (!this.ctx) { console.log('AudioSys: No context'); return; }
        if (this.ctx.state === 'suspended') { console.log('AudioSys: Context suspended'); this.ctx.resume(); }

        if (type === 'portal') {
            this.playPortalOpen();
            return;
        }
        if (type === 'pickup_unique') type = 'drop_unique';
        if (type === 'coins' || type === 'cash' || type === 'buy' || type === 'sell') type = 'gold';
        if (type === 'fireball_cast') {
            this.playCastCue('fire');
            return;
        }
        if (type === 'thunder_cast') {
            return;
        }
        if (type === 'thunder_impact') {
            if (this.playSfxAsset('lightningImpact')) return;
            this.playSkillImpact('hit');
            return;
        }
        if (type === 'multishot_cast' || type === 'enemy_arrow_cast') {
            this.playCastCue('multishot');
            return;
        }
        if (type === 'enemy_lightning_cast') {
            if (this.playSfxAsset('lightningEnemy')) return;
            this.playCastCue('thunder');
            return;
        }
        if (type === 'boss_cast') {
            this.playBossCastCue();
            return;
        }
        if (type === 'elite_death') {
            this.playDeathCue('elite');
            return;
        }
        if (type === 'boss_death') {
            this.playDeathCue('boss');
            return;
        }
        if (type === 'player_hit_lightning' || type === 'player_hit_lightning_low') {
            if (this.playSfxAsset('lightningImpact', type.endsWith('_low') ? 0.62 : 0.48)) return;
        }
        if (type.startsWith('player_hit_')) {
            const isLowHp = type.endsWith('_low');
            const kind = type.replace('player_hit_', '').replace('_low', '');
            this.playPlayerDamageCue(kind, isLowHp);
            return;
        }

        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain); gain.connect(this.sfxGain);

        if (type === 'gold') {
            // 连续拾取音调递增逻辑
            const now = Date.now();
            if (now - this.lastGoldTime < 1500) {
                this.goldPitch = Math.min(this.goldPitch + 0.1, 2.0); // 最高 2.0 倍
            } else {
                this.goldPitch = 1.0;
            }
            this.lastGoldTime = now;

            osc.type = 'sine';
            // 基础频率 1800 * pitch
            const freq = 1800 * this.goldPitch;
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(0.1, t); gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc.start(); osc.stop(t + 0.15);
        } else if (type === 'heartbeat') {
            // 心跳声：低频脉冲
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(60, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);

            gain.gain.setValueAtTime(0.5, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

            osc.start(); osc.stop(t + 0.2);
        } else if (type === 'attack' || type === 'swing' || type === 'melee_swing') {
            if (this.playSfxAsset('swordSwing')) return;
            this.playNoiseLayer(t, 0.045, 0.045, 'highpass', 950, 0.5);
            this.playToneLayer('sawtooth', t, 0.075, 660, 210, 0.045);
            this.playToneLayer('triangle', t + 0.018, 0.055, 260, 150, 0.025);
        } else if (type === 'melee_hit') {
            // 普通攻击保留短促的金属边缘和身体冲击。
            this.playCombatImpact('hit');
        } else if (type === 'hit') {
            this.playSkillImpact('hit');
        } else if (type === 'melee_crit') {
            // 暴击击中：更亮的撕裂感 + 金属高频点缀
            this.playCombatImpact('crit');
        } else if (type === 'hit_crit') {
            this.playSkillImpact('crit');
        } else if (type === 'melee_kill') {
            // 击杀：重击下沉 + 碎裂尾音
            this.playCombatImpact('kill');
        } else if (type === 'hit_kill') {
            this.playSkillImpact('kill');
        } else if (type === 'pickup') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(900, t);
            osc.frequency.exponentialRampToValueAtTime(1350, t + 0.08);
            gain.gain.setValueAtTime(0.075, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.start(t); osc.stop(t + 0.12);
        } else if (type === 'break_prop') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(140, t);
            osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
            gain.gain.setValueAtTime(0.12, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
            osc.start(t); osc.stop(t + 0.16);
        } else if (type === 'ui_error') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(220, t);
            osc.frequency.setValueAtTime(165, t + 0.06);
            gain.gain.setValueAtTime(0.045, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.start(t); osc.stop(t + 0.12);
        } else if (type === 'hell_enter') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(90, t);
            osc.frequency.exponentialRampToValueAtTime(32, t + 0.6);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
            osc.start(t); osc.stop(t + 0.65);
        } else if (type === 'quest') {
            osc.type = 'sine'; osc.frequency.setValueAtTime(440, t);
            osc.frequency.setValueAtTime(554, t + 0.2); osc.frequency.setValueAtTime(659, t + 0.4);
            gain.gain.setValueAtTime(0.2, t); gain.gain.setValueAtTime(0, t + 1);
            osc.start(); osc.stop(t + 1);
        } else if (type === 'levelup') {
            [440, 554, 659, 880].forEach((f, i) => {
                let o = this.ctx.createOscillator(); let g = this.ctx.createGain();
                o.connect(g); g.connect(this.sfxGain);
                o.frequency.value = f;
                g.gain.setValueAtTime(0.1, t + i * 0.1); g.gain.linearRampToValueAtTime(0, t + i * 0.1 + 0.3);
                o.start(t + i * 0.1); o.stop(t + i * 0.1 + 0.3);
            });
        } else if (type === 'potion') {
            // 咕噜噜的喝药音效 - 使用多个振荡器模拟液体流动声
            [200, 250, 300].forEach((f, i) => {
                let o = this.ctx.createOscillator();
                let g = this.ctx.createGain();
                o.type = 'sine';
                o.connect(g);
                g.connect(this.sfxGain);
                o.frequency.setValueAtTime(f, t + i * 0.05);
                o.frequency.exponentialRampToValueAtTime(f * 0.5, t + i * 0.05 + 0.2);
                g.gain.setValueAtTime(0.08, t + i * 0.05);
                g.gain.exponentialRampToValueAtTime(0.01, t + i * 0.05 + 0.3);
                o.start(t + i * 0.05);
                o.stop(t + i * 0.05 + 0.3);
            });
        } else if (type === 'click') {
            // 加点/确认音效 - 清脆的点击声
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(600, t + 0.05);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
            osc.start(t);
            osc.stop(t + 0.1);
        } else if (type === 'fireball') {
            const bus = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(6200, t);
            filter.frequency.exponentialRampToValueAtTime(2100, t + 0.38);
            filter.Q.setValueAtTime(0.8, t);
            bus.gain.setValueAtTime(1, t);
            bus.connect(filter);
            filter.connect(this.sfxGain);

            this.playNoiseLayer(t, 0.028, 0.12, 'highpass', 2400, 0.6, bus);
            this.playNoiseLayer(t + 0.018, 0.18, 0.095, 'bandpass', 1150 + Math.random() * 250, 1.1, bus);
            this.playNoiseLayer(t + 0.09, 0.26, 0.055, 'highpass', 3800 + Math.random() * 900, 0.5, bus);
            this.playToneLayer('square', t, 0.12, 180, 72, 0.11, bus);
            this.playToneLayer('sawtooth', t + 0.018, 0.34, 260, 95, 0.085, bus);
            this.playToneLayer('sine', t + 0.006, 0.11, 1450, 640, 0.045, bus);
            this.playToneLayer('triangle', t + 0.07, 0.22, 520, 210, 0.035, bus);
        } else if (type === 'arrow') {
            const bus = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(700, t);
            filter.Q.setValueAtTime(0.45, t);
            bus.connect(filter);
            filter.connect(this.sfxGain);

            this.playNoiseLayer(t, 0.022, 0.055, 'bandpass', 3200 + Math.random() * 900, 1.8, bus);
            this.playNoiseLayer(t + 0.012, 0.12, 0.04, 'highpass', 1900 + Math.random() * 700, 0.7, bus);
            this.playToneLayer('triangle', t, 0.055, 880, 420, 0.045, bus);
            this.playToneLayer('sine', t + 0.018, 0.08, 180, 120, 0.025, bus);
        } else if (type === 'thunder') {
            if (this.playSfxAsset('lightningImpact')) return;
            const bus = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(180, t);
            filter.Q.setValueAtTime(0.7, t);
            bus.connect(filter);
            filter.connect(this.sfxGain);

            this.playNoiseLayer(t, 0.024, 0.18, 'highpass', 7200 + Math.random() * 1200, 0.65, bus);
            this.playNoiseLayer(t + 0.035, 0.09, 0.09, 'bandpass', 3100 + Math.random() * 800, 2.3, bus);
            this.playToneLayer('sawtooth', t, 0.085, 2400, 180, 0.12, bus);
            this.playToneLayer('square', t + 0.018, 0.12, 1180, 140, 0.07, bus);

            [54, 73, 91, 123].forEach((f, i) => {
                const rumble = this.ctx.createOscillator();
                const rumbleGain = this.ctx.createGain();
                rumble.type = i % 2 ? 'triangle' : 'square';
                rumble.frequency.setValueAtTime(f + Math.random() * 12, t + 0.04);
                rumble.frequency.exponentialRampToValueAtTime(Math.max(20, f * 0.45), t + 0.75 + Math.random() * 0.2);
                rumbleGain.gain.setValueAtTime(0.045, t + 0.04);
                rumbleGain.gain.linearRampToValueAtTime(0.07, t + 0.12);
                rumbleGain.gain.exponentialRampToValueAtTime(0.001, t + 0.9 + Math.random() * 0.25);
                rumble.connect(rumbleGain);
                rumbleGain.connect(bus);
                rumble.start(t + 0.04);
                rumble.stop(t + 1.05);
            });
        } else if (type === 'specter_bolt') {
            const bus = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1450 + Math.random() * 350, t);
            filter.frequency.exponentialRampToValueAtTime(620, t + 0.22);
            filter.Q.setValueAtTime(2.2, t);
            bus.connect(filter);
            filter.connect(this.sfxGain);

            this.playNoiseLayer(t, 0.06, 0.035, 'bandpass', 1700 + Math.random() * 500, 2.4, bus);
            this.playNoiseLayer(t + 0.035, 0.14, 0.026, 'highpass', 4300 + Math.random() * 1400, 0.7, bus);
            this.playToneLayer('sawtooth', t, 0.12, 520, 180, 0.055, bus);
            this.playToneLayer('sine', t + 0.028, 0.19, 1180, 360, 0.032, bus);
            this.playToneLayer('triangle', t + 0.085, 0.16, 260, 90, 0.022, bus);
        } else if (type === 'drop_unique') {
            // 暗金掉落音效 - 史诗感的金属共鸣 + 天堂之音
            // 1. 金属撞击声
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, t);
            osc1.frequency.exponentialRampToValueAtTime(440, t + 0.3);
            gain1.gain.setValueAtTime(0.3, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.start(t);
            osc1.stop(t + 0.5);

            // 2. 天堂和弦 (C-E-G-C)
            [523, 659, 784, 1047].forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, t + i * 0.08);
                gain.gain.setValueAtTime(0.15, t + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t + i * 0.08);
                osc.stop(t + 1);
            });

            // 3. 低频共鸣
            const osc3 = this.ctx.createOscillator();
            const gain3 = this.ctx.createGain();
            osc3.type = 'triangle';
            osc3.frequency.setValueAtTime(110, t);
            gain3.gain.setValueAtTime(0.2, t);
            gain3.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
            osc3.connect(gain3);
            gain3.connect(this.sfxGain);
            osc3.start(t);
            osc3.stop(t + 0.6);
        } else if (type === 'drop_set') {
            // 套装掉落音效 - 神秘的绿色能量
            // 1. 神秘的低音脉冲
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(165, t);
            osc1.frequency.linearRampToValueAtTime(220, t + 0.3);
            gain1.gain.setValueAtTime(0.25, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.start(t);
            osc1.stop(t + 0.5);

            // 2. 魔法音阶 (小调神秘感)
            [330, 392, 440, 523].forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, t + i * 0.1);
                gain.gain.setValueAtTime(0.12, t + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t + i * 0.1);
                osc.stop(t + 0.9);
            });
        } else if (type === 'land_soft') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(170, t);
            osc.frequency.exponentialRampToValueAtTime(72, t + 0.08);
            gain.gain.setValueAtTime(0.045, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
            osc.start(); osc.stop(t + 0.13);
            this.playNoiseLayer(t + 0.012, 0.07, 0.018, 'lowpass', 900 + Math.random() * 250, 0.45);
        } else if (type === 'land_hard') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(760, t);
            osc.frequency.exponentialRampToValueAtTime(115, t + 0.11);
            gain.gain.setValueAtTime(0.075, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
            osc.start(); osc.stop(t + 0.16);
            this.playNoiseLayer(t, 0.026, 0.05, 'highpass', 3600 + Math.random() * 900, 0.7);
            this.playNoiseLayer(t + 0.02, 0.08, 0.035, 'bandpass', 1200 + Math.random() * 400, 1.2);

            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(68, t);
            gain2.gain.setValueAtTime(0.05, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
            osc2.connect(gain2);
            gain2.connect(this.sfxGain);
            osc2.start(t); osc2.stop(t + 0.13);
        } else if (type === 'land_gold') {
            // 金币落地：清脆叮当声 (高频正弦波脉冲)
            [1200, 1500, 1800].forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, t + i * 0.02);
                gain.gain.setValueAtTime(0.03, t + i * 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.02 + 0.05);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t + i * 0.02);
                osc.stop(t + i * 0.02 + 0.05);
            });
        } else if (type === 'shield') {
            const bus = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(9200, t);
            filter.frequency.exponentialRampToValueAtTime(3600, t + 0.9);
            filter.Q.setValueAtTime(0.65, t);
            bus.connect(filter);
            filter.connect(this.sfxGain);

            this.playNoiseLayer(t, 0.045, 0.08, 'highpass', 5200, 0.7, bus);
            this.playToneLayer('sine', t, 0.13, 720, 430, 0.095, bus);
            this.playToneLayer('triangle', t + 0.012, 0.16, 220, 330, 0.05, bus);

            [523, 659, 784, 1047].forEach((f, i) => {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.type = i === 3 ? 'triangle' : 'sine';
                o.frequency.setValueAtTime(f, t + 0.07 + i * 0.105);
                g.gain.setValueAtTime(0.001, t + 0.07 + i * 0.105);
                g.gain.linearRampToValueAtTime(0.095 - i * 0.012, t + 0.12 + i * 0.105);
                g.gain.exponentialRampToValueAtTime(0.001, t + 0.62 + i * 0.13);
                o.connect(g);
                g.connect(bus);
                o.start(t + 0.07 + i * 0.105);
                o.stop(t + 0.78 + i * 0.13);
            });

            [262, 330, 392].forEach((f, i) => {
                const o = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                o.type = 'triangle';
                o.frequency.setValueAtTime(f, t + 0.1 + i * 0.02);
                g.gain.setValueAtTime(0.045 - i * 0.008, t + 0.1 + i * 0.02);
                g.gain.linearRampToValueAtTime(0.035 - i * 0.006, t + 0.38);
                g.gain.exponentialRampToValueAtTime(0.001, t + 1.05);
                o.connect(g);
                g.connect(bus);
                o.start(t + 0.1 + i * 0.02);
                o.stop(t + 1.05);
            });
        }
    },
    playFireballExplosion: function (level) {
        if (!this.ctx) { console.log('AudioSys: No context'); return; }
        if (this.ctx.state === 'suspended') { this.ctx.resume(); }

        const t = this.ctx.currentTime;

        // 根据等级计算参数
        const filterFreq = 300 - (level - 5) * 10; // 5级=300Hz, 10级=250Hz
        const volume = 0.3 + (level - 5) * 0.04;   // 5级=0.3, 10级=0.5
        const duration = 0.25 + (level - 5) * 0.02; // 5级=0.25s, 10级=0.35s

        // 第一层：低频轰鸣（主体爆炸声）
        // 使用多个低频方波叠加模拟噪声
        [60, 80, 100, 120, 150].forEach((f) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const filter = this.ctx.createBiquadFilter();

            osc.type = 'square';
            osc.frequency.setValueAtTime(f + Math.random() * 10, t);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(filterFreq, t);
            filter.Q.setValueAtTime(1, t);

            gain.gain.setValueAtTime(volume * 0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + duration);
        });

        // 第二层：中频冲击（爆炸瞬间的"砰"）
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(400, t);
        osc2.frequency.exponentialRampToValueAtTime(100, t + 0.05);
        gain2.gain.setValueAtTime(volume * 0.5, t);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc2.connect(gain2);
        gain2.connect(this.sfxGain);
        osc2.start(t);
        osc2.stop(t + 0.08);

        // 第三层：高频碎裂（火焰碎片飞溅）
        [800, 1000, 1200].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(f, t + i * 0.02);
            osc.frequency.exponentialRampToValueAtTime(f * 0.3, t + 0.1);
            gain.gain.setValueAtTime(volume * 0.08, t + i * 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.02);
            osc.stop(t + 0.15);
        });

        // 等级10添加余波效果
        if (level >= 10) {
            setTimeout(() => {
                const t2 = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                const filter = this.ctx.createBiquadFilter();

                osc.type = 'square';
                osc.frequency.setValueAtTime(80, t2);
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(200, t2);
                gain.gain.setValueAtTime(volume * 0.2, t2);
                gain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.15);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t2);
                osc.stop(t2 + 0.15);
            }, 150);
        }
    },
    // 更新低血量音效（由 update 循环调用）
    // 注意：依赖全局 player 对象
    updateLowHpEffect: function (dt, hpPct) {
        if (!this.ctx || !this.bgmFilter) return;

        // 阈值 30%
        if (hpPct < 0.3 && !player.isDead) {
            // 目标频率：越低越闷，最低 200Hz
            const targetFreq = 200 + hpPct * 1000;
            // 平滑过渡
            const currentFreq = this.bgmFilter.frequency.value;
            this.bgmFilter.frequency.value = currentFreq + (targetFreq - currentFreq) * dt * 5;

            // 心跳声
            if (this.heartbeatTimer <= 0) {
                this.play('heartbeat');
                // 血越少心跳越快：30% -> 1秒, 0% -> 0.4秒
                this.heartbeatTimer = 0.4 + hpPct * 2;
            } else {
                this.heartbeatTimer -= dt;
            }
        } else {
            // 恢复正常
            const currentFreq = this.bgmFilter.frequency.value;
            if (currentFreq < 22000) {
                this.bgmFilter.frequency.value = currentFreq + (22000 - currentFreq) * dt * 2;
            }
            this.heartbeatTimer = 0;
        }
    },
    toggleSetting: function (key, val) {
        Settings[key] = val;
        if (key === 'bgm' && this.bgmEl) {
            this.bgmEl.volume = val ? 0.3 : 0;
            if (val && !this.bgmPlaying) {
                // 如果开启BGM且当前没有播放，尝试播放
                this.startBGM();
            } else if (!val && this.bgmPlaying) {
                // 如果关闭BGM且当前正在播放，暂停播放
                this.stopBGM();
            }
        }
        if (key === 'sfx' && this.sfxGain) {
            this.sfxGain.gain.setValueAtTime(val ? 1.0 : 0, this.ctx.currentTime);
        }
    },
    playPortalOpen: function () {
        // 传送门打开音效：神秘的能量涌动
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // 1. 低频能量脉冲
        const osc1 = this.ctx.createOscillator();
        const gain1 = this.ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(80, t);
        osc1.frequency.exponentialRampToValueAtTime(200, t + 0.5);
        gain1.gain.setValueAtTime(0.3, t);
        gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.8);
        osc1.connect(gain1);
        gain1.connect(this.sfxGain);
        osc1.start(t);
        osc1.stop(t + 0.8);

        // 2. 高频魔法音
        [400, 500, 600, 800].forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t + i * 0.1);
            gain.gain.setValueAtTime(0.1, t + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.1);
            osc.stop(t + 0.8);
        });
    },
    playPortalArrive: function () {
        // 到达城镇音效：温暖的环境音
        if (!this.ctx) return;
        const t = this.ctx.currentTime;

        // 和弦音
        [262, 330, 392].forEach((f) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 1.0);
        });
    }
};
