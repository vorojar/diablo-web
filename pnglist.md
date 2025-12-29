# 建议新增美术素材清单 (Asset List)

为了消除“网页感”并提升到暗黑风格的沉浸体验，建议增加以下贴图资源。

## 1. UI 界面与 HUD 材质 (UI & HUD)
目前 UI 主要是黑色半透明背景加 CSS 边框，缺乏厚重感。
- [ ] **`ui_panel_bg.png`** (面板背景)
  - 说明：深色石材、陈旧皮革或羊皮纸纹理。
  - 用途：用于角色、背包、技能、任务等面板的底图，替换纯黑半透明背景。
- [ ] **`ui_border_frame.png`** (装饰边框)
  - 说明：带有哥特式花纹、金色或铜锈质感的边框素材（建议九宫格/9-slice 格式）。
  - 用途：替换 CSS 的 `solid` 边框，增加华丽感。
- [ ] **`hud_main_base.png`** (HUD 底座)
  - 说明：底部动作条的一体化金属或石质底座长图。
  - 用途：将血球、技能栏、经验条在视觉上连接起来，形成一个整体控制台，而非分离悬浮的方块。
- [ ] **`cursor_set.png`** (自定义光标)
  - `cursor_gauntlet.png` (默认): 铁手套造型。
  - `cursor_sword.png` (攻击): 悬停在敌人身上时。
  - `cursor_hand_gold.png` (交互): 悬停在物品/NPC 身上时。

## 2. 环境与地块 (Environment Tiles)
代码中大量使用 `ctx.fillRect` 绘制颜色块，这是造成“网页小游戏感”的主要原因。
- [ ] **`floor_tiles.png`** (地面纹理)
  - `floor_grass.png`: 罗格营地草地。
  - `floor_dungeon_stone.png`: 地牢石板路。
  - `floor_hell_lava.png`: 地狱熔岩地面。
- [ ] **`wall_tiles.png`** (墙壁纹理)
  - `wall_stone_bricks.png`: 地牢砖墙。
  - `wall_cave.png`: 洞穴岩壁。
- [ ] **`interactive_objects.png`** (交互物体)
  - `stairs_down.png` / `stairs_up.png`: 地牢入口和出口（替换红/蓝方块）。
  - `waypoint.png`: 传送小站。
  - `shrine.png`: 祭坛。
  - `portal_effect.png`: 传送门的旋转漩涡贴图（替换蓝色圆圈）。

## 3. 技能与状态图标 (Icons)
虽然有 `items.png`，但技能目前似乎没有专用图标。
- [ ] **`skill_icons.png`** (技能图标集)
  - 说明：包含火球、闪电、多重箭、治疗、回城等技能的高清图标 sprite sheet。
- [ ] **`buff_icons.png`** (状态图标)
  - 说明：加速、冰冻、抗性提升等状态的小图标。
- [ ] **`quest_markers.png`** (任务标记)
  - 说明：更有质感的金色感叹号/问号图片，替换头顶文字符号。

## 4. 战斗特效 (VFX)
目前的攻击和魔法效果大多是代码生成的线条或圆形。
- [ ] **`vfx_sheet.png`** (特效序列帧)
  - `fireball_flight.png`: 火球飞行时的火焰拖尾。
  - `explosion_hit.png`: 击中敌人时的爆炸火花。
  - `lightning_spark.png`: 闪电链的节点光效。
  - `blood_splatter.png`: 怪物死亡时的血迹（并在地上残留）。
  - `level_up_pillar.png`: 升级时的金色光柱特效。

## 5. 补充角色/怪物 (Characters)
- [ ] **`corpse_remains.png`**
  - 说明：怪物死亡后的尸体残留图，增加战场真实感。
