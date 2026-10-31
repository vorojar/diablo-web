# 特效配方与导出

`vfx-recipes.js` 是不读取游戏状态的确定性绘制源。修改配方后运行 `node tools/build-vfx.js build`，提交生成的双层 WebP、JSON 清单和 `vfx-generated-manifest.js`。使用已有 Node 环境中的 `@napi-rs/canvas`、`sharp`，不增加游戏运行依赖。

- `node tools/build-vfx.js check`：检查多种子的边界、末帧、循环接缝、确定性和生成像素是否同步。
- `node tools/build-vfx.js preview --output <仓库外目录> --seed 19`：生成可播放、拖动时间的连续帧预览及接触表。
- `node tools/build-vfx.js export --output <仓库外目录> --seed 19`：导出透明 PNG 双层图集、逐帧 PNG 和带帧标签、时长、支点的 atlas.json。

配方支持时间、种子和四阶调色板；单次效果结束必须透明，循环端点必须一致。实体用 source-over，光照用 lighter；禁止黑色底板。默认素材双层解码像素预算小于4MiB，性能模式释放光照层。更改图集尺寸时须通过预算检查。

`VfxDirector` 只读取现有施法、伤害结算结果、Boss pendingSkill 和成功拾取事件；禁止用它推进技能计时、决定命中或发放奖励。危险区域及原始主命中特效仍由原系统绘制；新增附加光效和环境装饰共享 CombatVisuals 装饰预算。跨层清空临时事件并复用通用图集。

雷电使用固定版本的 PixelFX 原始绘制源，入口为 `node tools/build-lightning.mjs --preview <仓库外目录>`。它生成 `art/lightning/` 双层图集与 `lightning-manifest.js`，浏览器仅由 `LightningVfx` 定位、合成和回收。上游来源及 MIT 许可位于 `tools/vendor/pixelfx/`；部署时保留 `art/lightning/` 内的许可文件。示例蓄力不接入游戏计时，实际连锁两端由原战斗结果提供。
