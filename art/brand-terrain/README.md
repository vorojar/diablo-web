# 封面、图标与基础贴图

2026-09-08，使用内置 imagegen 生成。PNG 为原稿，运行时仅引用 WebP 与根目录三个尺寸的图标。未修改既有角色、怪物、地标或 HUD 素材。

原稿：横版 exec-5e97d25c-fb92-4291-888f-dc070e8e465b；竖版 exec-4f03c753-876c-43ef-9231-13b08c651987；图标 exec-bb922ea7-3bfc-4591-a540-3ebf4c699d6e；墙体 exec-3c7f0826-ca9b-4fe2-8cdd-c45d46f57493；地面 exec-02365b09-18f0-4dee-aa7b-7e350314e725。

封面参考既有 heroidle.png 主角和 townLandmarks-painted.png 营地，保留蓝围巾、皮甲、盾剑；上方预留 DOM 标题，不烘焙文字。图标为暗铜盾上的金色菠萝和绿色叶冠，无字样。

重建：`node tools/build-brand-terrain-art.js`（需要 sharp）。封面有损 WebP quality 82；地形 quality 88。墙地 atlas 为 384×384、3行×3列，每格128px；运行时40px。墙体行顺序苔石/冰石/火山石；地面行顺序草土/石板/火山岩，保留营地用第0行、地牢用第1行的原有规则。变体仅按坐标确定，不改变地图或碰撞。

## 墙体生成提示
Production 2D game wall material atlas, square image divided into exactly 3 equal columns and 3 equal rows, no spacing, no visible grid lines, no labels. Each cell is a full-bleed square seamless repeating wall surface, orthographic front facing texture, no perspective, no standalone blocks, no outer frame. Row 1: weathered olive gray medieval masonry with sparse moss. Row 2: dark desaturated blue frozen rough stone, restrained frost seams, no long icicles. Row 3: dark charcoal volcanic masonry with faint burnt rust cracks, no bright lava. Three columns are subtle alternative arrangements of the same row material, same illumination and palette, flat ambient light, boundary regions blend with other cells of same row, no vignette or cell border. Medium size readable chunky stone forms for rendering each cell at 40x40 pixels. Hand painted compact dark fantasy game style, low contrast texture detail, wall surfaces distinctly denser and darker than walkable ground. No objects, no props, no text, no symbols, no cast shadows. Reference shows the previous three material families, modernize craft quality while retaining their colors and functional distinction.

## 地面生成提示
Create production 2D top-down ground texture atlas, exactly 3 equal rows and 3 equal columns in a square canvas, no gaps, no grid lines, no margins, no labels. Each square cell fills its area with seamless repeatable ground texture. Row 1: compact desaturated olive moss and packed brown earth with scattered tiny flat pebbles, woodland camp ground. Row 2: worn flat gray green medieval paving stones, irregular broad slabs with subdued narrow seams and sparse moss. Row 3: flat dark charcoal volcanic rock with extremely faint burnt umber hairline cracks, no bright lava. Three columns are subtle variations of same material per row; same brightness, same flat overhead ambient lighting, edge regions should blend across every tile of same row. Designed for rendering each tile at 40x40 pixels. Quiet low contrast, medium broad stone shapes, minimal fine noise, no shading vignette, no raised blocks, no wall faces, no cliffs, no objects, no text, no symbols. Hand-painted compact dark fantasy game style. Reference image provides existing ground material palette, improve clarity and craftsmanship, reduce repetitive high contrast detail.
