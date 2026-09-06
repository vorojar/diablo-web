# 完整美术覆盖验收

本轮范围是游戏实体、场景物件和技能分支的完整覆盖。登录背景、PWA图标、已有墙地平铺材质、CSS面板/HUD及程序化技能特效保留现有设计，不代表每个历史图片文件都重新生成。

## 实际覆盖

| 类别 | 完整覆盖 | 正式入口 |
|---|---|---|
| 主角 | 7张图集、112帧：6种动作，加4个斜向行走方向 | `getHeroFrame` / `drawHeroSprite` |
| 普通怪 | 9类，各32帧 | `getMonsterSpriteFrame` / `drawMonsterSprite` |
| Boss | 血鸟、女伯爵、屠夫、树头木拳、暗黑破坏神、巴尔，各32帧 | 战斗和图鉴共用新素材 |
| 场景 | 森林/冰原/熔岩/城镇共27种物件，覆盖所有对应区域 | `EnvironmentArt.scenic` / `floor` |
| NPC | 商人、治疗、仓库、铁匠、深渊守卫、重置共6类 | `EnvironmentArt.npc` |
| 破坏物 | 木桶/木箱/陶罐各完整及破碎两态 | `EnvironmentArt.destructible` |
| 物品 | 保持原4×4映射的16种物品图标 | 背包、装备、腰带、地面掉落 |
| 技能 | 4个基础图标 + 24个独立分支图标 | 技能树节点和终极路线预览 |

每种怪物包含待机、行走、攻击、受击；每组含正面与侧面各4帧，右侧由侧面镜像。主角非行走斜向沿用邻近主方向，摆摊正式路径为正面坐姿。死亡沿用受击/倒伏变形与淡出，不新增死亡动画或动作机制。

## 透明资源与运行时

- 所有新增实体原图均验证实际alpha；拒绝过关的条件包括无真实透明、空帧、帧间无透明留白。假棋盘背景和跨格版本未接入。
- 只进行切帧、统一缩放、脚底对齐，不按颜色删除像素；保留白色、深色和半透明效果。
- 原图与提示词保留在项目中。运行时使用 `art/atlas-manifest.js` 指向的28张固定网格图集，下载约6MiB，避免每次启动扫描约40MiB原图。
- `tools/prepare-art-atlases.js` 从实际定义和原图重建；`tools/test-baked-art.js` 检查源SHA、输出SHA和逐像素归一化等价。
- 全部旧角色/怪物/场景图加载失败时，新素材仍能绘制；各加载边界明确报错。

提示词与来源：[角色/怪物](actor-art-prompts.json)、[环境](environment-art-prompts.json)、[物品](item-art-prompt.md)、[技能](../art/skills/prompts.json)。环境原图透明检查见 [alpha报告](environment-art-alpha-audit.json)。

## 验收入口

- `tools/test-art-coverage.js`：192个英雄动作方向帧、960个怪物/Boss动作方向帧，真实Canvas绘制，旧图故障回归。
- `tools/test-art-samples.js`：所有实际源图的真实透明、共享缩放、脚底锚点及切格。
- `tools/test-environment-art.js`：对照真实地图配置检查场景、NPC与破坏态，无遗漏映射。
- `tools/test-item-art.js`、`tools/test-skill-art.js`：实际16物品与24分支，真实alpha、留白、唯一内容与UI映射。
- `node tools/qa-server.js` → `http://127.0.0.1:18765/qa.html`：点击“完整美术覆盖验收”，查看动画、真实区域以及40px物品预览；仅测试页使用隔离角色、不写存档。

## 本次验收结果

2026-09-06：统一验证71项通过、0失败。浏览器中23张角色/怪物/森林图集与5张环境图集全部加载，运行错误0、未处理Promise0。桌面1280×850、移动390×844触控路径模拟均通过；移动验证不是实体手机测试。

| 浏览器验收 | 结果 | 会话证据文件 |
|---|---|---|
| 15类怪物与Boss、正面待机和侧面攻击 | PASS | `art-monsters-all.png` / `art-bosses-all.png` / `art-monsters-attack-left.png` |
| 主角动作与方向 | PASS | `art-hero-actions.png` / `art-hero-attack.png` |
| 城镇6位NPC、冰原、熔岩真实地图 | PASS | `art-town-scene.png` / `art-ice-scene.png` / `art-lava-scene.png` |
| 技能树与16种物品40px/80px对照 | PASS | `art-skills-ui.png` / `art-items-ui.png` |
| 手机森林、HUD与素材加载 | PASS | `art-mobile-forest.png` / `art-browser-audit.json` |

截图目录：`C:/Users/voroj/.codex/visualizations/2026/09/06/01a076cc-6a6b-7c00-900a-1eeddbea931a/`。本地验收服务器与测试浏览器页交付时关闭；测试角色不写入存档。纯前端无需构建服务或后端重启。
