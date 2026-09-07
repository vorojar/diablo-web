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

### 2026-09-08 加载体积验收

使用本地隔离入口打开页面并进入城镇，通过“统计全部加载资源”记录浏览器 Resource Timing 的完整URL、encodedBodySize、transferSize及耗时。原环境部分资源由缓存/浏览器资源层提供，transferSize为0，不能将服务端收到的请求子集当作首次完整下载量。下表统一对比资源内容体积；联机服务与真实存档写入仍隔离，未测线上API流量或公网下载时间。

| 流程 | 请求数 | 资源内容总量 | 证据 |
|---|---:|---:|---|
| 优化前打开并进入城镇 | 83 | 30,051,573 bytes（30.05 MB） | `load-before-browser.json` |
| 优化后相同步骤 | 60 | 9,824,864 bytes（9.82 MB） | `load-after-town-browser.json` |
| 优化后再进入第一层（累计） | — | 10,365,776 bytes | `load-after-forest-browser.json` |

城镇减少20,226,709字节，降幅67.31%。五张旧图不再请求；首屏只加载主角、基础死亡组及基础场景，怪物和Boss按需加载。环境图集较小，仍统一加载；首次进入新区暂停战斗等待所需角色图集，不在后台继续受到不可见敌人攻击。图鉴按需加载完成后重绘图标。

37张运行图无损编码总计14,168,674 → 11,294,784字节，可见RGB和所有alpha逐像素一致；完全透明像素内不可见RGB可由编码器归零。原图和烘焙PNG保留用于制作，发布URL指向WebP，浏览器不会同时下载这些PNG。重新制作素材后依次执行：

```powershell
node tools/prepare-art-atlases.js
node tools/compress-runtime-art.js
```

压缩与验证工具使用已有运行环境中的 `sharp` 和 `@napi-rs/canvas`，游戏运行仍无新增依赖。测试包括首次请求集合、区域追加加载、并发去重、失败状态、37张WebP像素等价、实际发布图集与41种VFX边界。浏览器实景证据：`load-after-{town,forest,ice,lava}.png`，同属本文末尾会话目录。

最终统一验证78项通过（111秒）。森林、冰原、熔岩、首次补载屠夫后真实技能/死亡、390px移动背包均通过，运行错误0、未处理Promise0；移动端为浏览器模拟。日志 `load-verify.txt`，补充截图 `load-after-boss.png` / `load-after-mobile-inventory.png`。纯前端无需后端重启，浏览器刷新加载新版本。

- 所有新增实体原图均验证实际alpha；拒绝过关的条件包括无真实透明、空帧、帧间无透明留白。假棋盘背景和跨格版本未接入。
- 只进行切帧、统一缩放、脚底对齐，不按颜色删除像素；保留白色、深色和半透明效果。
- 原图与提示词保留在项目中。运行时使用 `art/atlas-manifest.js` 指向的34张固定网格图集，避免每次启动扫描原始大图。
- `tools/prepare-art-atlases.js` 从实际定义和原图重建；`tools/test-baked-art.js` 检查源SHA、输出SHA和逐像素归一化等价。
- 全部旧角色/怪物/场景图加载失败时，新素材仍能绘制；各加载边界明确报错。

提示词与来源：[角色/怪物](actor-art-prompts.json)、[环境](environment-art-prompts.json)、[物品](item-art-prompt.md)、[技能](../art/skills/prompts.json)。环境原图透明检查见 [alpha报告](environment-art-alpha-audit.json)。

## 验收入口

### 2026-09-08 陨石与雷暴立体试验扩展

按用户追加要求完成另两个技能。通用设置新增独立开关，默认关闭；原护盾实现、技能数值、角色、地图和其他美术保持原样。约9.4KB的`elemental-3d.js`用共享256×128 GPU图集表现陨石石核和三维密度云团，材质最多30Hz更新，移动与伤害继续使用原游戏循环。没有增加图片、模型或外部依赖。首次启用时预热；性能优先和WebGL不可用时保留原版。

| case | 验收结果 | 会话目录证据 |
|---|---|---|
| 真实陨石施法 | PASS：下落熔纹石核、拖尾、地面光圈、实际爆炸后碎片 | `elemental-meteor-frames.png` |
| 真实雷暴施法 | PASS：悬浮云团、范围轮廓、按实际伤害目标和节拍落雷 | `elemental-storm-frames.png` |
| 手机390×844 | PASS：两种效果可见、无运行错误 | `elemental-{meteor,storm}-mobile.png`；浏览器模拟，非手机GPU实测 |
| 独立设置开关 | PASS：陨石false/雷暴true、陨石true/雷暴false均可操作 | 系统设置→通用设置，DOM复选框状态实测 |
| 性能优先回退 | PASS：施法前后GPU绘制计数同为203，残留事件0、错误0 | QA `#qa-snapshot`与画质选择DOM |
| 行为不变 | PASS：开关前后伤害、耗蓝、落地时刻、范围、持续时间一致 | `test-skill-branch-behavior.js`新增两项真实战斗状态对照 |
| 生命周期与上限 | PASS：12个撞击、24条落雷上限；结束/关闭/离层清理；无WebGL回退 | `test-elemental-3d.js`、原有死亡/离层回归；可见云团最多6个 |
| 完整回归 | PASS：Agent Flow完整验证115秒，最终浏览器运行错误0/未处理Promise0 | QA报告及上述测试 |

首轮真实施法暴露首次update前ProjectilePool对象没有age，导致地面渐变收到NaN；新增该真实状态的红测后修复首帧计时，浏览器完整施法复测通过。QA截图越过手机视口边缘曾出现透明空白，已限制截图矩形到实际画布，未修改生产画面。

当前是与2D游戏合成的局部立体特效，未实现全场景深度遮挡、折射或真实体积光；真实低端手机GPU与极端群战帧率仍需设备专项测试。纯前端无需构建/后端重启，刷新页面即可。

### 2026-09-08 立体护盾试验

结论：球面厚度和真实受击波纹可见，人物与原有分支纹饰保留；提升偏细腻，尚未达到继续扩展陨石/雷暴的标准。保留默认关闭的试验开关（系统设置→通用设置），只在华丽特效模式生效。采用独立约5KB原生WebGL球面着色代码，无新图片、模型或Three.js依赖；未实现全场景深度、折射或真实体积光。

| case | 结果 | 本文会话目录证据 |
|---|---|---|
| shader/人物前后层/同尺寸原版对照 | PASS | `shield-comparison-desktop.png`，QA“护盾并排对比” |
| 真实伤害入口 | PASS：护盾吸收50，定向波纹触发 | `shield-3d-impact.png`，QA“护盾真实受击” |
| 手机390×844 | PASS：人物可读、球面完整 | `shield-3d-mobile.png`（桌面浏览器模拟，非手机GPU） |
| 实际设置开关 | PASS：默认false→点击后true | `shield-setting.png`；需收起QA控制台，避免其遮挡设置页 |
| 回归 | PASS：完整Agent Flow验证113秒 | `test-shield-3d.js`覆盖性能模式前后层、关闭试验、分支纹饰、护盾结束、无WebGL回退 |
| 运行错误 | PASS：错误0/未处理Promise0 | QA `#qa-errors` |

初步180帧采样：桌面3D中位8.3ms/P95 12.4ms，原版4.2ms/8.4ms，移动视口3D 4.2ms/8.3ms。窗口尺寸、绘制负载与刷新调度未严格锁定，这些只用于冒烟检测，不能作为GPU耗时或性能差值结论；`renderMs`仅计CPU提交时间。正式扩大范围前仍需真实手机和受控A/B压测。

设置交互追踪：首次QA展开时点击“通用设置”未切页，随后对checkbox及checkmark的点击超时（DOM报告隐藏）；读取DOM确认general仍display:none；收起QA→点击通用设置→点击可见checkmark→DOM checked=true。原因是QA控制台遮挡，不修改生产设置逻辑。

### 2026-09-08 封面、图标与基础贴图补齐

仅替换登录横竖版封面、浏览器/PWA菠萝盾徽、旧墙地纹理；已验收角色、怪物、地标、HUD、地图和碰撞保持原样。原稿与重建说明见 [素材目录](../art/brand-terrain/README.md)。

| 验收项 | 结果与证据（下文会话截图目录） |
|---|---|
| 桌面1280×850、手机390×844、窄屏320×568登录 | PASS：标题、按钮、主角无遮挡，无横向溢出；`brand-login-desktop.png`、`brand-login-mobile.png`、`brand-login-320.png` |
| 登录交互 | PASS：踏入庇护所打开三个存档槽；QA入口隔离线上服务，不写真实存档 |
| 营地、森林、冰窟、熔岩 | PASS：墙地材质分区与通行边界清晰，运行错误0、未处理Promise0；`brand-terrain-{town,forest,ice,fire}.png` |
| 运行素材 | PASS：横版134400B、竖版100220B、墙56678B、地24190B；PNG原稿不被游戏请求；32/192/512图标尺寸正确 |
| 启动资源 | 60项9480110B，包含浏览器视口切换触发的横竖两版封面；不含缓存命中后的流量解释。`brand-startup-network.json`；旧封面/旧墙地请求为0 |
| 自动验证 | Agent Flow完整验证通过（197秒）；新增3600格稳定变体、尺寸与单版封面+墙地+favicon低于250KB检查；既有碰撞和美术回归通过 |

手机为浏览器视口模拟，未声称实体手机或PWA安装验收。纯前端无需后端重启，刷新页面即可加载带新版本号的资源。

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


### 立体特效正式启用（2026-09-08，取代此前试验开关方案）

用户实测效果与流畅度满意后，护盾、陨石、雷暴正式随华丽特效自动启用，移除独立开关与生产代码中的旧试验标记判断；旧存档无需重新勾选。性能优先模式继续使用原有效果。雷暴删除云团及其体积着色计算，保留范围圈和按伤害节拍连接目标的落雷，陨石纹理缩为128×128。测试覆盖旧标记不影响默认护盾、雷暴不绘制云团且保留落雷、画质切换不改变伤害/耗蓝/持续时间。

验收通过：Agent Flow 全量验证104秒；本地 QA 实测雷暴与陨石页面运行错误/未处理Promise均为0，设置中旧独立开关数量为0。真实施法截图位于会话证据目录 `C:/Users/voroj/.codex/visualizations/2026/09/06/01a076cc-6a6b-7c00-900a-1eeddbea931a/`：`storm-no-cloud.png`、`meteor-default.png`。


### 陨石与雷暴爆发表现加强（2026-09-08）

陨石采用三层长尾焰、58像素熔纹石核、双层冲击环、地面熔纹和13块发光碎岩；雷暴采用更长的分层主雷、3条局部分叉、落点电环与0.12秒局部爆闪。无云团、无全屏闪光，不修改护盾。保持128×128纹理、30Hz材质更新、12个落地事件/24条主雷上限，事件寿命仍为0.85秒/0.3秒，不增加图片下载。

验收：Agent Flow 全量验证107秒通过；桌面1280×720和手机尺寸390×844真实施放两种技能，页面运行错误与未处理Promise均为0，结束后事件计数归零。手机尺寸验收使用桌面GPU，不代表手机真机性能。截图保存在会话目录 `C:/Users/voroj/.codex/visualizations/2026/09/06/01a076cc-6a6b-7c00-900a-1eeddbea931a/`，文件名为 `meteor-spectacular.png`、`storm-spectacular.png` 及对应的 `-mobile.png`。
