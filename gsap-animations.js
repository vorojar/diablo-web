/**
 * GSAPAnims - 游戏动画管理引擎 (GSAP 核心驱动)
 * 专门用于处理 UI 数值翻滚、面板进出、战斗视觉增强等
 */
const GSAPAnims = {
  /**
   * 数字增长翻滚效果
   * @param {HTMLElement} element 目标 DOM 元素
   * @param {number} from 起始值
   * @param {number} to 目标值
   * @param {number} duration 持续时间
   * @param {object} options 额外配置
   */
  countUp(element, from, to, duration = 1, options = {}) {
    if (!element || typeof gsap === 'undefined') return null;

    const {
      format = (v) => Math.floor(v).toLocaleString(),
      ease = 'power2.out',
      onComplete
    } = options;

    // 如果已经在运动，杀掉之前的动画
    gsap.killTweensOf(element);

    const obj = { value: from };
    return gsap.to(obj, {
      value: to,
      duration,
      ease,
      onUpdate: () => {
        element.textContent = format(obj.value);
      },
      onComplete
    });
  },

  /**
   * 面板弹入动画
   */
  panelIn(element, direction = 'bottom') {
    if (!element || typeof gsap === 'undefined') return;

    gsap.killTweensOf(element);
    const fromProps = { opacity: 0, scale: 0.95 };

    if (direction === 'bottom') fromProps.y = 30;
    else if (direction === 'top') fromProps.y = -30;
    else if (direction === 'center') fromProps.scale = 0.8;

    gsap.fromTo(element, fromProps, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.35,
      ease: "back.out(1.5)",
      clearProps: "transform" // 动画结束后清除 transform，避免干扰 CSS layout
    });
  },

  /**
   * 暴击弹出动画
   */
  critPop(element) {
    if (!element || typeof gsap === 'undefined') return;

    const tl = gsap.timeline();
    tl.fromTo(element,
      { scale: 0.5, opacity: 0, rotation: -15 },
      { scale: 1.5, opacity: 1, rotation: 0, duration: 0.15, ease: 'power2.out' }
    )
      .to(element, { scale: 1, duration: 0.1, ease: 'power2.inOut' })
      .to(element, {
        filter: 'brightness(1.5) drop-shadow(0 0 8px gold)',
        duration: 0.15,
        yoyo: true,
        repeat: 3
      }, "-=0.1");

    return tl;
  },

  /**
   * 高级拾取物飞行效果 (支持动态追踪玩家)
   * @param {object} fp 拾取物对象 (需包含 x, y, startX, startY 等)
   * @param {object} player 玩家对象 (用于实时获取位置)
   * @param {function} onComplete 飞行完成后的回调 (执行实际拾取逻辑)
   */
  lootFly(fp, player, onComplete) {
    if (!fp || !player || typeof gsap === 'undefined') return;

    // 核心动画：驱动一个虚拟进度值 t (0 -> 1)
    const progress = { t: 0 };

    return gsap.to(progress, {
      t: 1,
      duration: 0.45 + Math.random() * 0.15, // 略微加长飞行时间，展示优美轨迹
      ease: "power2.in", // 吸入时的加速感
      onUpdate: () => {
        const t = progress.t;
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;

        // 三次贝塞尔曲线实时插值
        // 终点始终指向 player 的当前位置，实现“磁吸”效果
        fp.x = mt3 * fp.startX +
          3 * mt2 * t * fp.controlX1 +
          3 * mt * t2 * fp.controlX2 +
          t3 * player.x;

        fp.y = mt3 * fp.startY +
          3 * mt2 * t * fp.controlY1 +
          3 * mt * t2 * fp.controlY2 +
          t3 * (player.y - 20);

        // 记录当前的 progress 用于渲染层使用 (例如缩放或透明度)
        fp.progress = t;
      },
      onComplete: onComplete
    });
  },

  /**
   * 强力震动效果 (用于受击或法力不足)
   */
  shake(element, intensity = 5) {
    if (!element || typeof gsap === 'undefined') return;
    gsap.killTweensOf(element);
    gsap.to(element, {
      x: `random(-${intensity}, ${intensity})`,
      y: `random(-${intensity}, ${intensity})`,
      duration: 0.05,
      repeat: 5,
      yoyo: true,
      onComplete: () => gsap.set(element, { x: 0, y: 0 })
    });
  },

  /**
   * UI 脉冲反馈 (例如点击按钮或获得物品)
   */
  pulse(element, scale = 1.1) {
    if (!element || typeof gsap === 'undefined') return;
    gsap.to(element, {
      scale: scale,
      duration: 0.1,
      yoyo: true,
      repeat: 1,
      ease: "power2.inOut"
    });
  }
};

window.GSAPAnims = GSAPAnims;
