# 菠萝战纪 Brawlore

HTML5 Canvas 与原生 JavaScript ARPG。使用传统脚本和共享全局状态，按 index.html 顺序加载多个模块；不要假设单文件架构或随意调整加载顺序。

## 运行与验证

- 无需安装依赖或构建即可运行前端；现代浏览器打开 index.html，涉及联网、资源加载或浏览器测试时使用本地 HTTP 服务。
- 存档使用 IndexedDB；在线、市场和云同步功能另有服务依赖，按任务选择验证范围。
- .agent-flow.json 将完整验证指向 tools/verify.ps1：包含 JS 语法、非 live 回归和精灵资源检查，需要 Node，部分检查需要已有的 @napi-rs/canvas。
- 完整交付可运行 C:\Users\voroj\.agent-flow\commands\agent-flow.ps1 deliver；它已包含 verify 和 guard，不要顺序重复调用。
- tools/test-*-live* 浏览器测试单独运行。视觉和交互改动按需补浏览器实测；纯文档改动检查引用和 diff 即可。

## 模块导航

| 文件 | 职责 |
|---|---|
| game.js | 主循环、player 状态、地图/楼层、伤害及主流程集成 |
| constants.js | 品质、技能和游戏配置常量 |
| enemy-system.js、combat-tactics.js | 敌人/Boss 能力、预警及战术机制 |
| auto-battle.js | 自动战斗、路径与拾取策略 |
| save-system.js | IndexedDB 存档和迁移 |
| item-system.js、items-data.js、set-items.js | 物品、掉落、装备及套装 |
| skill-branches.js、abyss-system.js、daily-quest.js | 技能分支、深渊和每日任务 |
| ui-panels.js、index.html、style.css | 面板、页面结构与样式 |
| audio.js | 音效与背景音乐 |
| sprite-renderer.js、art/、vfx-manifest.js | 精灵与特效资源 |
| elemental-3d.js、physical-3d.js、shield-3d.js | 元素、物理和护盾立体效果 |
| online.js、market.js、pb_hooks/ | 在线功能、市场及服务端钩子 |

按符号搜索实现，例如 gameLoop、enterFloor、takeDamage、SaveSystem、AutoBattle。数值、数据结构和准确位置以当前代码为准，不在指令文件复制。

## 项目约束

- 修改 JS/CSS 后，更新 index.html 中对应资源的版本号，避免缓存旧文件。
- 修改玩家持久化状态或自动战斗设置时，处理旧存档缺失字段并验证迁移；不要重置用户数据来掩盖兼容问题。
- 不重新引入怪物受伤瞬移；移动与攻击应遵守墙体、视线和碰撞规则。
- 战斗/特效改动保留对象清理、生命周期和画质分级，避免在每帧热点中无控制地分配对象或访问 DOM。
- 音频初始化需要用户交互；测试时区分浏览器自动播放限制与代码故障。
- 装备或套装调整检查属性重算、套装加成、成就追踪和存档影响；新增内容沿用当前数据接口。
- 使用 ES6+；坐标区分像素与瓦片索引，颜色优先沿用 COLORS，用户文本和新注释使用中文。
- 用户可见功能和修复写入 CHANGELOG.md；仅维护指令文档无需改游戏更新记录。
- 项目专用技能在 .agents/skills/，仅在对应任务需要时读取。

## 指令维护

本文件是项目规则唯一事实源；CLAUDE.md 只负责引用。共享工程纪律在 C:\Users\voroj\.agent-flow\policy.md，项目文件不复制它。
