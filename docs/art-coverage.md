# 完整美术覆盖验收

初始覆盖包含游戏实体、场景物件和技能分支；本轮精修进一步包含动作方向、身体标尺、场景地标、独立死亡和HUD统一。登录背景、PWA图标、已有墙地平铺材质保留，不代表每个历史图片文件都重新生成。

## 实际覆盖

### 2026-09-07 七项精修验收

| 项目 | 当前结果 | 验收 |
|---|---|---|
| 动作方向 | 主角5张错帧图集已修正，原生RGBA且完整切帧 | 7张主角图集逐帧复核通过，移动端左向攻击正确 |
| 身体标尺和脚底 | 7张主角图集使用身体标尺与逐帧横向脚底标注；新增武器范围回归测试 | 全图集比例及自然尺寸预览通过，坐姿保留自然高度差 |
| 场景物件比例 | 39种物件按世界高度渲染，桶箱罐低于角色 | 城镇及三类野外地图桌面/移动实景通过 |
| 画风统一 | 6位NPC（恰西为男性）、吸血鬼、木乃伊、女伯爵、僵尸、血鸟已接入；血鸟持弓与僵尸侧向补帧完成 | NPC、主角和Boss图集视觉复核通过；保留各类怪物轮廓差异 |
| 地图辨识度 | 城镇6种设施、森林/冰原/熔岩各2种地标已接入 | 三个野外区域1280×850及390×844实景通过 |
| 死亡/Boss专属动作 | 16类角色共64帧独立死亡，Boss蓄力/释放/收招与锁向接通，屠夫侧向蓄力补帧 | 六Boss选帧自动检查；屠夫、僵尸、移动端暗黑破坏神实际击杀记录通过；玩家倒地后复活通过 |
| HUD/UI | 暗铜球体/菜单边框、中文字体、装备暗底与圆角统一 | 桌面、390px和320px通过；技能触控区44×44，背包无溢出 |

身体测量与锚点是人工视觉标注；自动测试验证缩放、脚底位置和像素边界，不能证明动作朝向或画风质量。朝向与装备连续性须逐帧人工观察。

提示词和接受/拒绝素材见 `hero-direction-corrections.json`、`art-style-polish-prompts.json`。原生透明素材、切帧标注及接受的单帧合成配方均已保留。

本轮新增验收证据（2026-09-07）：

| 检查 | 结果 | 证据 |
|---|---|---|
| 自动验证 | 最终统一验证74通过、0失败（109秒）；QA目标测试曾误提取新增函数片段，限定施法入口后单项及全量通过 | `tools/verify.ps1` / `polish-final-verify.txt` |
| 桌面HUD与装备格 | 暗铜边框、中文字体、图标暗底，面板完整显示 | `polish-hud-desktop.png` / `polish-inventory-desktop.png` |
| 390×844移动HUD与背包 | 球体圆形；技能44×44；背包宽352、无横向溢出 | `polish-hud-mobile.png` / `polish-inventory-mobile.png` |
| 320×740触控布局 | 修复前FAIL、修复后PASS；球体底671、技能顶677，互不重叠 | `polish-hud-320.png` / `polish-hud-320-fixed.png`；QA“验收HUD触控布局” |
| 三生物群系桌面/移动 | 森林树木、冰原石拱、熔岩门已在真实地图显示，角色未被遮挡 | `polish-{forest,ice,lava}-{desktop,mobile}.png` |
| 玩家死亡与回城 | 倒地过程先显示，结束后仅弹窗一次，免费回城恢复 | `polish-death-before-dialog.png` / `polish-real-death.png` |
| 主角逐帧和移动预览 | 七张最终主角图集逐帧复核；移动端左向攻击自然尺寸与2倍预览通过 | `art/atlases/hero*.png` / `polish-hero-attack-mobile.png` |
| Boss真实阶段 | 屠夫经真实更新循环捕获两帧蓄力、释放、收招、待机，随后真实伤害入口触发四帧死亡 | `polish-butcher-real-combat.png`；QA“记录所选怪物真实战斗帧” |
| 普通怪实际击杀 | 僵尸经 takeDamage 击杀，四帧死亡依次播放 | `polish-zombie-real-combat.png` |
| 移动端Boss | 390×844下暗黑破坏神蓄力到收招及死亡四帧均捕获 | `polish-diablo-combat-mobile.png` / `polish-final-browser.json` |
| 男性铁匠与最终城镇 | 恰西为短发蓄须、皮围裙持锤的成年男性；六位NPC及六类设施正常显示 | `polish-male-blacksmith.png` / `polish-town-final.png` |

浏览器运行错误与未处理Promise均为0。移动环境为浏览器窄屏和触控路径模拟，非实体手机。战斗记录使用隔离页上的正式伤害入口和更新循环；抽查的Boss技能使用 groundSlam 触发通用阶段，六Boss阶段与锁向的完整矩阵由自动测试覆盖。精修范围内无已知阻断问题；生成帧仍存在轻微笔触和明暗差异，不等于手工逐像素动画。

### 已有覆盖基线

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

每种怪物包含待机、行走、攻击、受击；每组含正面与侧面各4帧，右侧由侧面镜像。主角非行走斜向沿用邻近主方向，摆摊正式路径为正面坐姿。精修新增4张死亡图集共64帧，覆盖16类角色：失衡、跪倒、倒地、静止。左右倒地方向使用镜像，每类的四帧保持同一缩放，最终帧不循环站起。提示词和原始来源见 `death-art-prompts.json`。

## 透明资源与运行时

- 所有新增实体原图均验证实际alpha；拒绝过关的条件包括无真实透明、空帧、帧间无透明留白。假棋盘背景和跨格版本未接入。
- 只进行切帧、统一缩放、脚底对齐，不按颜色删除像素；保留白色、深色和半透明效果。
- 原图与提示词保留在项目中。运行时使用 `art/atlas-manifest.js` 指向的34张固定网格图集，避免每次启动扫描原始大图。
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
