# 物品图集生成记录

工具：内置 image_gen。先查看原有 `items.png` 确认物品身份与4×4格序；最终采用无图片参考的全新生成，输出原生RGBA透明，不按颜色抠除。

最终接入文件：`items-painted.png`。原始输出另存 `items-painted-source.png`，固定网格处理仅调整透明留白与尺寸，不改像素颜色或透明通道语义。

原始图1254×1254，alpha=0像素占65.12%。经 `tools/prepare-item-art.js` 沿完整透明分隔线切片、等比居中，产物1024×1024（每格256×256，主体最长边224）。各列独立寻找行分隔线，避免不等距留白把盾牌顶部裁断。坐标记录在 `art/items/extraction.json`。`tools/test-item-art.js` 验证16格实际物品/UI映射、透明边缘、无截断和内容独立，已通过。

## 原始提示词

第一次参考编辑输出为不透明棋盘格，像素alpha验收失败，未采用；第二次透明编辑仍失败。最终改用无参考的全新生成，提示词如下：

Game-ready 2D sprite sheet on a TRANSPARENT BACKGROUND (native PNG RGBA, no checkerboard). EXACT 4 columns and 4 rows, 16 fantasy inventory icons, square atlas. Generous completely transparent gutters and exterior margins. Every icon fully contained in its equal square cell with 15% padding, centered and similarly sized. Clean hand-painted dark fantasy art, charming compact proportions, crisp steel, brown leather and gold, light from upper left, bold readable silhouettes at 40px, no text, no labels, no frames, no ground, no external glows. Row1 left-to-right: gold coin pile; round red health potion; round blue mana potion; parchment scroll. Row2: steel sword; double-headed axe; wooden magic staff with amber gem; wooden bow with one arrow. Row3: steel helmet; steel breastplate with shoulder armor; pair of leather gloves; pair of leather boots. Row4: leather belt; wooden kite shield with steel rim; gold ring with red gemstone; gold necklace with amber pendant. Exactly these 16 items in these positions. Use truly empty alpha background between and inside the items.

## 已拒绝的参考编辑提示词

Create a production-ready 4 columns x 4 rows inventory icon atlas for Brawlore, a charming hand-painted dark fantasy ARPG. The attached existing atlas is ONLY a reference for item identities and exact slot order; redraw all icons with polished painterly detail, soft volumetric highlights, clean readable silhouettes, aged steel, bronze and brown leather, coherent top-left light, subtle dark illustrated outlines. This should match hand-painted small-proportion medieval fantasy hero and monster sprites, not chunky pixel art.
TRANSPARENT BACKGROUND: output an actual RGBA PNG with a genuinely transparent alpha background. No black, white, magenta or checkerboard painted background. All empty areas must have alpha 0. No scenery, ground plane, tile boxes, frames, labels, letters, watermark or caption. No external glow or shadow outside an icon.
Atlas is a square, exactly 4 equally spaced columns and 4 equally spaced rows. Exactly 16 icons total, one centered in each of the sixteen equal cells. Each icon including all edges must fit inside the central 74% of its own cell, with continuous wide fully transparent gutters separating every row and every column. Nothing may cross any cell boundary. Give all icons a similar readable visual size, weapons diagonally composed within their cell.
Exact order left to right, top to bottom:
Row 1: (1) small gleaming pile of gold coins, (2) red health potion in a round clear glass bottle with cork, (3) blue mana potion in same shape bottle with cork, (4) curled parchment scroll with faint decorative marks but no legible text.
Row 2: (1) one steel sword with brown leather grip, (2) one double-headed steel axe with brown shaft, (3) one curved wooden mage staff topped by a small amber gem, (4) one wooden recurve bow with one arrow.
Row 3: (1) one closed steel knight helmet, (2) one steel breastplate with shoulder plates, (3) a pair of brown leather gloves, (4) a pair of brown leather boots.
Row 4: (1) one looped leather belt with metal buckle, (2) one wooden kite shield with a steel rim and central boss, (3) one gold ring with red gemstone, (4) one golden necklace with amber pendant.
Every item must be fully visible and recognisable when scaled down to a 40px inventory cell. Preserve the exact 16-slot mapping, native transparent alpha, and generous empty gutters.
