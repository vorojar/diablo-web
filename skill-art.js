// 独立分支图标；生成原图、提示词与切片坐标保存在 art/skills/。
const SkillArt = (() => {
    const families = {
    "fireball": [
        "explosion",
        "burn",
        "meteor",
        "nova",
        "spread",
        "detonate"
    ],
    "thunder": [
        "chain",
        "shock",
        "storm",
        "overload",
        "torture",
        "shield"
    ],
    "multishot": [
        "pierce",
        "spread",
        "rain",
        "snipe",
        "barrage",
        "split"
    ],
    "holy_shield": [
        "reflect",
        "guard",
        "retribution",
        "fortress",
        "angel",
        "link"
    ]
};
    const definitions = Object.fromEntries(Object.entries(families).map(([skill, nodes]) => [skill,
        Object.fromEntries(nodes.map(node => [node, `art/skills/${skill}-${node}.png`]))
    ]));
    const installed = new WeakSet();
    function applyIcon(sprite, skill, node) {
        const file = definitions[skill]?.[node];
        if (!file) throw new Error(`技能分支缺少独立图标：${skill}/${node}`);
        const key = `${skill}/${node}`;
        if (sprite.dataset.skillArt === key) return;
        sprite.style.backgroundImage = `url("${file}?v=2026090602")`;
        sprite.style.backgroundSize = 'contain';
        sprite.style.backgroundPosition = 'center';
        sprite.dataset.skillArt = key;
    }
    function refresh(root = document.getElementById('skill-tree-content')) {
        if (!root) return;
        for (const node of root.querySelectorAll('.skill-tree-node[data-skill][data-node]')) {
            if (node.dataset.stage === '1') continue;
            applyIcon(node.querySelector('.skill-sprite'), node.dataset.skill, node.dataset.node);
        }
        // 未选择二阶段时也为所有终极路线预览展示各自图标。
        for (const branch of root.querySelectorAll('.skill-tree-branch[data-skill]')) {
            const skill = branch.dataset.skill;
            const options = Object.values(SKILL_TREE[skill].stage3).flatMap(route => Object.entries(route));
            for (const preview of branch.querySelectorAll('.skill-route-option')) {
                if (preview.querySelector('.skill-route-art')) continue;
                const name = preview.querySelector('strong').textContent;
                const entry = options.find(([, option]) => option.name === name);
                if (!entry) throw new Error(`技能路线预览未匹配：${skill}/${name}`);
                const icon = document.createElement('span');
                icon.className = 'skill-route-art';
                icon.setAttribute('aria-hidden', 'true');
                applyIcon(icon, skill, entry[0]);
                preview.prepend(icon);
            }
        }
    }
    function install() {
        const root = document.getElementById('skill-tree-content');
        if (!root || installed.has(root)) return;
        installed.add(root);
        new MutationObserver(() => refresh(root)).observe(root, { childList: true, subtree: true });
        refresh(root);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
    return { definitions, refresh, install };
})();
