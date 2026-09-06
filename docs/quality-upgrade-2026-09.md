# 菠萝战纪质量升级与验收清单

本轮目标：优先保护玩家进度，修复操作与布局问题，再接入一组统一的透明美术样板。用户已授权按重要性逐一或并发实施、验收。

| 编号 | 优先级 | 工作与边界 | 通过条件 | 状态 |
| --- | --- | --- | --- | --- |
| Q01 | P0 | 市场购买、领奖的持久化请求与幂等交付 | 延迟期间背包变化不覆盖；失败不发送；同一请求重试不重复扣款/奖励；满包待领取 | 本地真实服务通过，生产未部署 |
| Q02 | P1 | 引导与实际输入一致、气泡生命周期 | 无 I/W/E/R 失效提示；出城/打开面板隐藏气泡；装备自动推进；奖励不打断初次操作 | 17项回归通过；浏览器装备/重载通过 |
| Q03 | P1 | 每日任务统一当地午夜 | 午夜前后日期/倒计时一致；旧日任务不可跨日领奖 | 边界回归通过 |
| Q04 | P1 | 面板定位、滚动、触控区 | 桌面/窄屏/横屏内容可访问；常用移动技能触控区至少44px | 320px外框已实测修复；详见下表 |
| Q05 | P1 | 回归测试有效性 | 不绑定过期时间戳，验证版本化资源真实存在；原行为断言保留 | 统一验收入口已通过 |
| Q10 | P1 | 技能分支实际机制 | 火/雷/箭/盾共24节点；正确处理闪避、护甲、同帧破盾、死亡/切层清理 | 53项行为回归通过 |
| Q06 | P2 | RGBA素材直接加载、染色缓存按需生成 | 原始白/紫与半透明像素不被抠除；不预生成4份完整怪物染色图集 | 真实Canvas像素与容量测试通过 |
| Q07 | P2 | 技能图标、空装备槽、分支说明 | 新图标实际接入；槽位中文；升级前可读机制与最终分支方向 | 已接入，390px排版已查看 |
| Q08 | P2 | 角色/基础怪/首层场景美术样板 | 真实alpha；动作/尺寸/锚点明确；场景内角色与敌我预警可辨；美术不改伤害 | 118帧透明及分隔校验通过 |
| Q09 | 验收 | 自动测试与浏览器冒烟 | 本地隔离联网副作用；新建、装备、面板、技能、存档重载验证 | 64项统一检查通过；浏览器关键入口通过 |

## 美术规格

- 小比例暗黑幻想，与现有俯视游戏保持一致；固定上左光源、明确轮廓、受控发光。
- 生图直接使用真实透明PNG；不经过背景抠色。切帧、尺寸校验和动作预览仍需要验收。
- 技能图标以44px可读性为准；文字与交互结构保留在HTML/CSS中。
- 保留业务伤害、碰撞、掉落与技能冷却。资源未通过验收不能替换正式资源。
- 大型图集的每种染色不再常驻一份完整副本，缓存需要有容量限制。

## 验收记录

| Case | 入口 / 证据 | 实测结果 |
| --- | --- | --- |
| M01 | 官方 PocketBase v0.40.2，`tools/test-market-pocketbase-live.js`，本轮会话 `qa-pocketbase/run-final/results.json` | 购买/重放/领取/冲突/回滚/最后一件并发全部通过；服务已停止 |
| G01 | `tools/test-skill-branch-behavior.js` | 53项通过；包括真实 `takeDamage` 闪避/护甲和 `playerTakeDamage` 连续破盾入口 |
| U01 | 原始 `/index.html`，创建本地1号存档，打开背包、点击短剑、重载再选角色 | 气泡隐藏；武器显示“短剑”；重载保留装备。测试数据只在127.0.0.1来源 |
| U02 | 320×568浏览器，`inventory-320.png` | 外框left10/right310/width300，clientWidth=scrollWidth=283，6列物品槽均44px |
| U03 | 844×390横屏实际DOM | 背包top10/bottom380/height370，位于视口内 |
| U04 | 390×844技能树 | 描述、两条终极路线可读，面板可滚动 |
| A01 | `tools/test-art-samples.js` | 16主角受伤帧 + 3×32怪物帧 + 6装饰；拒绝无alpha、空帧和无分隔留白的图 |
| R01 | `tools/test-sprite-frame-cache.js` | 白色/紫色与半透明像素、镜像/锚点、缓存淘汰上限通过 |
| G02 | 浏览器显式QA施法按钮；`browser-results.json` | 陨石伤害1626且区域峰值1；电弧伤害816并产生122.4护盾；弹幕伤害51、弹道峰值48且波次归零；神盾创建时guard/angel、210吸收、7秒，结束后无敌计时归零。数值仅为该练习目标的观测值 |

最终统一验证64项全部通过（含生产JS语法、各回归脚本和图集合同）；完整入口日志保存在会话 `verify-final.txt`。截图：`inventory-320.png`、`skills-390.png`、`hero-atlas.png`、`monster-atlas.png`。浏览器控制曾出现多标签视口与点击不一致，收敛为单标签后复验；不把前述失败点击算通过。

统一入口：`C:\Users\voroj\.agent-flow\commands\agent-flow.ps1 verify`。纯前端无构建步骤；更新资源URL版本后刷新即可。生产市场需先部署迁移和两个Hook文件，详见 [市场部署说明](pocketbase-market.md)。

本轮会话证据根目录：`C:/Users/voroj/.codex/visualizations/2026/09/06/01a076cc-6a6b-7c00-900a-1eeddbea931a`。本地QA入口：`node tools/qa-server.js`，访问 `http://127.0.0.1:18765/qa.html?touch=1`；触控标志仅模拟既有脚本路径，不能冒充真机手势验收。

## 素材接入与后续扩展边界

| 文件 | 原图尺寸 | 全透明像素占比 | 接入范围 |
| --- | --- | --- | --- |
| skills-painted.png | 1254×1254 | 40.9% | 四技能基础图标；分支沿用所属技能图标 |
| hero-hurt-painted.png | 1254×1254 | 72.1% | 主角前/后/左/右受伤与恢复16帧；其他动作保留现有图集 |
| monster-imp-painted.png | 1774×887 | 69.1% | 近战小恶魔，前/侧待机、行走、攻击、受伤 |
| monster-zombie-painted.png | 1774×887 | 59.6% | 僵尸，同上 |
| monster-archer-painted.png | 1774×887 | 74.2% | 骷髅弓箭手，同上 |
| ruins-props-painted.png | 1024×1536 | 66.3% | 普通首层的残墙、树桩、灯柱、墓碑、灌木、遗骨 |

原生RGBA直接加载；仅在运行时沿透明留白切帧、共享缩放并对齐脚底，不按颜色抠图。首版有交叠的怪物图及RGB假透明返修图均未接入。缓存每类最多96帧且不超过6MiB；这是确定的容量上限，不代表已测得某个FPS增益。

怪物最终生图提示词（两个subject分别为红色持刀小恶魔、紫兜帽骷髅弓箭手）：

```text
Game-ready 2D sprite sheet on a TRANSPARENT BACKGROUND (native PNG RGBA, no checkerboard). EXACT 8 columns and 4 rows, 32 isolated full-body poses of the SAME [subject]. Dark fantasy compact pixel-inspired painted game art, warm upper-left lighting, strong readable silhouette. 2048x1024 canvas. Each 256x256 cell has the character at most 140px tall, centered on x=128 and feet at y=200, leaving HUGE transparent empty gutters all around. Absolutely no weapon or body crosses any cell edge. Row1 idle, row2 walk, row3 attack, row4 hurt/recovery. For each row, columns1-4 front-facing four frames; columns5-8 screen-left facing four frames. All left-facing attack frames MUST KEEP HEAD AND BODY FACING LEFT, including aim/fire/release. No grounds, no halos, no shadows, no labels, no frame borders. All 32 bodies share the exact same scale, deliberately small within their cells. Completely transparent outside every sprite. Render native transparency.
```

其他素材设计约束：主角沿用棕发、蓝围巾、剑盾的现有身份；技能2×2顺序为盾/火/雷/弓；场景2×3顺序为残墙/树桩、灯柱/墓碑、灌木/遗骨。以上提示中的申请尺寸与工具实际输出不同，以资源实测尺寸与运行时切帧为准。

未纳入本次“样板”完成声明：所有Boss/地图整套重绘、主角全动作重制、长期数值平衡、真实手机触摸手势和生产市场上线。市场仍依赖客户端身份/金币，不提供完整反作弊或跨设备事务保证。
