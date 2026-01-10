// ========== ui-panels.js - UI 面板管理系统 ==========
// 负责面板的打开/关闭、层级管理、位置计算
// 依赖全局函数: GSAPAnims.panelIn, hideTooltip, renderInventory, updateSkillsUI 等

// ========== 面板管理器 ==========
const panelManager = {
  panels: {
    'stats': { id: 'stats-panel', group: 'left', top: 10, baseTop: 10, opened: false, zIndex: 0 },
    'achievements': { id: 'achievements-panel', group: 'left', top: 10, baseTop: 10, opened: false, zIndex: 0 },
    'quest': { id: 'quest-panel', group: 'left', top: 15, baseTop: 15, opened: false, zIndex: 0 },
    'set-collection': { id: 'set-collection-panel', group: 'left', top: 10, baseTop: 10, opened: false, zIndex: 0 },
    'inventory': { id: 'inventory-panel', group: 'right', top: 10, baseTop: 10, opened: false, zIndex: 0 },
    'stash': { id: 'stash-panel', group: 'right', top: 15, baseTop: 15, opened: false, zIndex: 0 },
    'skills': { id: 'skills-panel', group: 'center', top: 15, baseTop: 15, opened: false, zIndex: 0, left: 340 },
    'shop': { id: 'shop-panel', group: 'center', top: 10, baseTop: 10, opened: false, zIndex: 0 },
    'blacksmith': { id: 'blacksmith-panel', group: 'center', top: 15, baseTop: 15, opened: false, zIndex: 0 },
    'auto-battle': { id: 'auto-battle-panel', group: 'right', top: 10, baseTop: 10, opened: false, zIndex: 0 }
  },
  maxZIndex: 100,

  // 动态计算面板位置
  calculatePosition(panelId) {
    const panel = this.panels[panelId];
    const element = document.getElementById(panel.id);

    // 计算同组中已打开面板的数量
    const openedInGroup = Object.values(this.panels).filter(
      p => p.group === panel.group && p.opened && p.id !== panel.id
    ).length;

    // 根据同组打开面板数量动态调整位置
    const offset = openedInGroup * 8; // 每个面板错开8%
    const newTop = panel.baseTop + offset;

    // 对于center组但没有left属性的面板（如成就面板），保留CSS居中设置
    if (panel.group === 'center' && !panel.left) {
      // 不修改位置，让CSS的transform居中生效
      return newTop;
    }

    element.style.top = newTop + '%';

    // 对于中间组的面板,水平错开
    if (panel.group === 'center' && panel.left) {
      const centerOffset = (openedInGroup % 2) * 50 - 25; // 左右错开
      element.style.left = (panel.left + centerOffset) + 'px';
    }

    // 小屏适配：小屏幕让CSS居中生效，不做位置调整
    if (window.innerWidth < 768) return newTop;

    // 大屏确保面板在可视区域内
    requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      const padding = 10;
      // 右边超出
      if (rect.right > window.innerWidth - padding) {
        element.style.left = Math.max(padding, window.innerWidth - rect.width - padding) + 'px';
        element.style.right = 'auto';
      }
      // 底部超出
      if (rect.bottom > window.innerHeight - padding) {
        element.style.top = Math.max(padding, window.innerHeight - rect.height - padding) + 'px';
      }
      // 左边超出
      if (rect.left < padding) {
        element.style.left = padding + 'px';
        element.style.right = 'auto';
      }
    });

    return newTop;
  },

  // 设置面板在最上层
  bringToFront(panelId) {
    const panel = this.panels[panelId];
    const element = document.getElementById(panel.id);

    this.maxZIndex += 10;
    panel.zIndex = this.maxZIndex;
    element.style.zIndex = this.maxZIndex;
  },

  // 打开面板
  open(panelId) {
    const panel = this.panels[panelId];
    panel.opened = true;
    this.calculatePosition(panelId);
    this.bringToFront(panelId);
  },

  // 关闭面板
  close(panelId) {
    const panel = this.panels[panelId];
    panel.opened = false;
    panel.zIndex = 0;
  }
};

// ========== 辅助函数 ==========

// 检查是否有任何重要面板打开（排除自动战斗设置面板）
function isAnyPanelOpen() {
  return Object.entries(panelManager.panels).some(
    ([key, p]) => p.opened && key !== 'auto-battle'
  );
}

// 检测鼠标是否悬停在UI元素上
function isHoveringUI() {
  if (typeof mouse === 'undefined') return false;
  if (mouse.y > window.innerHeight - 140) return true;
  const panels = ['stats-panel', 'inventory-panel', 'skills-panel', 'shop-panel', 'menu-btns', 'quest-panel', 'achievements-panel', 'set-collection-panel', 'dialog-box',
    'abyss-entrance-panel', 'abyss-leaderboard-panel', 'abyss-result-panel'];
  for (let id of panels) {
    const el = document.getElementById(id);
    if (el) {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' || id === 'menu-btns') {
        const r = el.getBoundingClientRect();
        if (mouse.x >= r.left && mouse.x <= r.right && mouse.y >= r.top && mouse.y <= r.bottom) return true;
      }
    }
  }
  return false;
}

// ========== 面板切换 ==========

function togglePanel(id) {
  const panelElement = document.getElementById(id + '-panel');
  const isOpening = panelElement.style.display !== 'block';

  if (isOpening) {
    // 打开面板
    panelElement.style.display = 'block';
    // 使用 GSAP 播放弹入动画
    if (typeof GSAPAnims !== 'undefined') {
      GSAPAnims.panelIn(panelElement, 'bottom');
    }

    // 使用面板管理器动态调整位置和层级
    if (panelManager && panelManager.panels[id]) {
      panelManager.open(id);
    }

    // 根据面板类型调用相应的UI更新函数
    const updateFunctions = {
      'inventory': typeof renderInventory !== 'undefined' ? renderInventory : null,
      'skills': typeof updateSkillsUI !== 'undefined' ? updateSkillsUI : null,
      'stats': typeof updateStatsUI !== 'undefined' ? updateStatsUI : null,
      'quest': typeof updateQuestUI !== 'undefined' ? updateQuestUI : null,
      'achievements': typeof renderAchievements !== 'undefined' ? renderAchievements : null,
      'shop': typeof renderEmbeddedBag !== 'undefined' ? () => renderEmbeddedBag('shop') : null,
      'stash': typeof renderStash !== 'undefined' ? renderStash : null,
      'blacksmith': typeof renderBlacksmithPanel !== 'undefined' ? () => { renderBlacksmithPanel(); renderEmbeddedBag('blacksmith'); } : null,
      'set-collection': typeof renderSetCollection !== 'undefined' ? () => {
        renderSetCollection();
        // 如果怪物tab是激活状态，也渲染怪物图鉴
        const monsterTab = document.querySelector('.codex-tab[data-tab="monsters"]');
        if (monsterTab && monsterTab.classList.contains('active') && typeof renderMonsterCodex !== 'undefined') {
          renderMonsterCodex();
        }
      } : null
    };

    if (updateFunctions[id]) {
      updateFunctions[id]();
    }
  } else {
    // 关闭面板
    panelElement.style.display = 'none';

    // 隐藏tooltip，避免残留
    if (typeof hideTooltip !== 'undefined') {
      hideTooltip();
    }

    // 清除卖出确认状态
    if (typeof pendingSellConfirmIdx !== 'undefined') {
      pendingSellConfirmIdx = -1;
    }

    // 更新面板管理器状态
    if (panelManager && panelManager.panels[id]) {
      panelManager.close(id);
    }
  }
}
