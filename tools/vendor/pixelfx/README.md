# PixelFX 雷电离线源

来源：https://github.com/patch-gg/pixelfx ，固定提交 `a84159688af3ca37a4be05a0d422b94451b2e24e`。保留 MIT 许可及上游 NOTICE。仅裁剪核心导出入口，其他源文件原样保留；不随游戏在浏览器执行。

运行 `node tools/build-lightning.mjs` 从原始双缓冲生成运行图集；落雷跳过示例蓄力，从原始命中帧开始，连锁只使用通用电弧几何和绘制器，不引入示例角色、目标、计时或战斗判定。
