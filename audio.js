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
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
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
    play: function (type) {
        if (!this.ctx) { console.log('AudioSys: No context'); return; }
        if (this.ctx.state === 'suspended') { console.log('AudioSys: Context suspended'); this.ctx.resume(); }

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
        } else if (type === 'attack') {
            osc.type = 'triangle'; osc.frequency.setValueAtTime(100, t); osc.frequency.linearRampToValueAtTime(50, t + 0.1);
            gain.gain.setValueAtTime(0.1, t); gain.gain.linearRampToValueAtTime(0, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'hit') {
            // 普通击中：闷响 (低频三角波)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, t);
            osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'hit_crit') {
            // 暴击击中：金属撞击/撕裂声 (高频锯齿波叠加)
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.2);
            gain.gain.setValueAtTime(0.2, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(); osc.stop(t + 0.2);

            // 额外叠加一个金属 ping 声
            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1600, t);
            gain2.gain.setValueAtTime(0.1, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
            osc2.connect(gain2);
            gain2.connect(this.sfxGain);
            osc2.start(t); osc2.stop(t + 0.05);
        } else if (type === 'hit_kill') {
            // 击杀：沉重的破碎声 (低频方波 + 快速衰减)
            osc.type = 'square';
            osc.frequency.setValueAtTime(60, t);
            osc.frequency.linearRampToValueAtTime(30, t + 0.3);
            gain.gain.setValueAtTime(0.25, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.start(); osc.stop(t + 0.3);

            // 叠加一层“碎裂”噪声感
            const osc3 = this.ctx.createOscillator();
            const gain3 = this.ctx.createGain();
            osc3.type = 'sawtooth';
            osc3.frequency.setValueAtTime(100 + Math.random() * 200, t);
            gain3.gain.setValueAtTime(0.15, t);
            gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc3.connect(gain3);
            gain3.connect(this.sfxGain);
            osc3.start(t); osc3.stop(t + 0.1);
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
            // 逼真的火球音效 - 三层叠加：爆发冲击 + 火焰燃烧 + 空气振动

            // 1. 爆发冲击层 - 方波模拟爆炸冲击
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'square';
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.frequency.setValueAtTime(80, t);
            osc1.frequency.exponentialRampToValueAtTime(40, t + 0.2);
            gain1.gain.setValueAtTime(0.3, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
            osc1.start(t);
            osc1.stop(t + 0.3);

            // 2. 火焰燃烧层 - 锯齿波模拟火焰噼啪声
            [120, 150, 180].forEach((f, i) => {
                const osc2 = this.ctx.createOscillator();
                const gain2 = this.ctx.createGain();
                osc2.type = 'sawtooth';
                osc2.connect(gain2);
                gain2.connect(this.sfxGain);
                osc2.frequency.setValueAtTime(f, t + i * 0.03);
                osc2.frequency.exponentialRampToValueAtTime(f * 0.3, t + 0.4);
                gain2.gain.setValueAtTime(0.1 - i * 0.02, t + i * 0.03);
                gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
                osc2.start(t + i * 0.03);
                osc2.stop(t + 0.5);
            });
            // 3. 高频嘶嘶声层 - 正弦波模拟空气振动
            const osc3 = this.ctx.createOscillator();
            const gain3 = this.ctx.createGain();
            osc3.type = 'sine';
            osc3.connect(gain3);
            gain3.connect(this.sfxGain);
            osc3.frequency.setValueAtTime(1000, t);
            osc3.frequency.exponentialRampToValueAtTime(500, t + 0.15);
            gain3.gain.setValueAtTime(0.05, t);
            gain3.gain.linearRampToValueAtTime(0, t + 0.2);
            osc3.start(t);
            osc3.stop(t + 0.2);
        } else if (type === 'arrow') {
            // 箭矢音效 - 风声和撞击声
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(400, t + 0.1);
            gain.gain.setValueAtTime(0.1, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        } else if (type === 'thunder') {
            // 雷电音效：白噪声 + 低频震荡
            // 1. 初始的尖锐爆裂声 (高频锯齿波)
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(800, t);
            osc1.frequency.exponentialRampToValueAtTime(100, t + 0.1);
            gain1.gain.setValueAtTime(0.3, t);
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.start(t);
            osc1.stop(t + 0.15);

            // 2. 隆隆的雷声 (低频噪声模拟)
            // 由于 Web Audio API 原生没有白噪声节点，我们用多个低频振荡器模拟
            [60, 80, 100, 120, 150].forEach((f) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'square'; // 方波听起来更粗糙，适合模拟雷声
                osc.frequency.setValueAtTime(f + Math.random() * 20, t);
                osc.frequency.linearRampToValueAtTime(f * 0.5, t + 0.5 + Math.random() * 0.5);

                gain.gain.setValueAtTime(0.05, t);
                gain.gain.linearRampToValueAtTime(0.08, t + 0.1); // 渐强
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8 + Math.random() * 0.4); // 漫长的衰减

                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t);
                osc.stop(t + 1.5);
            });
        } else if (type === 'specter_bolt') {
            // 闪电幽魂发射音效 - 轻柔的电流嗞嗞声
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(400, t);
            osc1.frequency.exponentialRampToValueAtTime(200, t + 0.1);
            gain1.gain.setValueAtTime(0.06, t);  // 音量很低
            gain1.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
            osc1.connect(gain1);
            gain1.connect(this.sfxGain);
            osc1.start(t);
            osc1.stop(t + 0.12);

            // 轻微的电流杂音
            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(1200 + Math.random() * 400, t);
            gain2.gain.setValueAtTime(0.02, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc2.connect(gain2);
            gain2.connect(this.sfxGain);
            osc2.start(t);
            osc2.stop(t + 0.08);
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
            // 卷轴/药水落地：轻柔 (低频三角波)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(150, t);
            osc.frequency.exponentialRampToValueAtTime(80, t + 0.05);
            gain.gain.setValueAtTime(0.05, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.start(); osc.stop(t + 0.1);
        } else if (type === 'land_hard') {
            // 武器/防具落地：金属/重物感 (高频锯齿波叠加低频方波)
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, t);
            osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
            gain.gain.setValueAtTime(0.08, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.start(); osc.stop(t + 0.15);

            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(60, t);
            gain2.gain.setValueAtTime(0.05, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc2.connect(gain2);
            gain2.connect(this.sfxGain);
            osc2.start(t); osc2.stop(t + 0.1);
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
