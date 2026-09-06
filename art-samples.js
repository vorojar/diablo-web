// 游戏原生透明图集：只切帧和对齐，不按颜色抠除任何像素。
const ArtSamples = (() => {
    const atlases = new Map();
    const definitions = {
        heroHurt: { file: 'hero-hurt-painted.png', cols: 4, rows: 4 },
        melee: { file: 'monster-imp-painted.png', cols: 8, rows: 4 },
        zombie: { file: 'monster-zombie-painted.png', cols: 8, rows: 4 },
        ranged: { file: 'monster-archer-painted.png', cols: 8, rows: 4 },
        ruins: { file: 'ruins-props-painted.png', cols: 2, rows: 3 }
    };
    for (const action of ['idle', 'walk', 'attack', 'cast', 'sit', 'walkDiagonal']) {
        definitions[`hero${action}`] = { file: `hero-${action}-painted.png`, cols: 4, rows: 4 };
    }
    for (const type of ['skeleton', 'shaman', 'mummy', 'ghost', 'specter', 'vampire', 'bloodRaven', 'countess', 'butcher', 'duriel', 'diablo', 'baal']) {
        definitions[type] = { file: `monster-${type}-painted.png`, cols: 8, rows: 4 };
    }

    function heroFrame(action, direction, frameIndex) {
        const diagonals = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];
        if (action === 'walk' && diagonals.includes(direction)) {
            return frame('herowalkDiagonal', diagonals.indexOf(direction), frameIndex);
        }
        const row = direction.startsWith('back') ? 1 : direction.endsWith('Left') || direction === 'left' ? 2
            : direction.endsWith('Right') || direction === 'right' ? 3 : 0;
        return frame(action === 'hurt' ? 'heroHurt' : `hero${action}`, row, frameIndex);
    }

    function normalizeAtlas(source, cols, rows) {
        const scan = document.createElement('canvas');
        scan.width = source.width; scan.height = source.height;
        const scanContext = scan.getContext('2d');
        scanContext.drawImage(source, 0, 0);
        const data = scanContext.getImageData(0, 0, scan.width, scan.height).data;
        let transparent = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
        if (transparent < source.width * source.height * 0.15) throw new Error('美术样板缺少真实透明通道');
        // 生图的留白未必等距：寻找邻近的透明分隔线，不能截断人物再硬塞进格子。
        function gutters(count, size, projection) {
            const cuts=[0];
            for(let i=1;i<count;i++) {
                const ideal=i*size/count, radius=size/count*0.3;
                let best=-1;
                for(let at=Math.max(1,Math.ceil(ideal-radius));at<Math.min(size,ideal+radius);at++) {
                    if(projection[at]===0 && (best<0 || Math.abs(at-ideal)<Math.abs(best-ideal))) best=at;
                }
                if(best<0) throw new Error(`美术样板帧交叠：第${i}条分隔线无透明留白`);
                cuts.push(best);
            }
            return [...cuts,size];
        }
        const rowProjection=new Uint32Array(source.height);
        for(let y=0;y<source.height;y++) for(let x=0;x<source.width;x++) if(data[(y*source.width+x)*4+3]>12) rowProjection[y]++;
        const rowCuts=gutters(rows,source.height,rowProjection);
        const bounds = [];
        for (let row = 0; row < rows; row++) {
            const y0=rowCuts[row], y1=rowCuts[row+1];
            const colProjection=new Uint32Array(source.width);
            for(let y=y0;y<y1;y++) for(let x=0;x<source.width;x++) if(data[(y*source.width+x)*4+3]>12) colProjection[x]++;
            const colCuts=gutters(cols,source.width,colProjection);
            for (let col = 0; col < cols; col++) {
            const x0=colCuts[col], x1=colCuts[col+1];
            let left=x1, right=-1, top=y1, bottom=-1;
            for (let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) if(data[(y*source.width+x)*4+3]>12) {
                left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
            }
            if (right < left) throw new Error(`美术样板存在空帧 ${row}:${col}`);
            bounds.push({ x:left, y:top, width:right-left+1, height:bottom-top+1 });
            }
        }
        // 全图共享缩放，避免较小姿态被单独放大产生呼吸式抖动。
        const scale = Math.min(88 / Math.max(...bounds.map(b=>b.height)), 112 / Math.max(...bounds.map(b=>b.width)));
        const atlas = document.createElement('canvas');
        atlas.width = cols * 128; atlas.height = rows * 128;
        const ctx = atlas.getContext('2d');
        atlas.contentBounds = [];
        bounds.forEach((b, i) => {
            const w=b.width*scale, h=b.height*scale;
            const x=(i%cols)*128+(128-w)/2, y=Math.floor(i/cols)*128+124-h;
            ctx.drawImage(source,b.x,b.y,b.width,b.height,x,y,w,h);
            atlas.contentBounds.push({sx:x,sy:y,sw:w,sh:h});
        });
        scan.width=0;scan.height=0;
        return atlas;
    }

    function load(key, definition) {
        return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            // 素材输入边界：不合格图片拒绝接入，原有图集仍可绘制。
            try { atlases.set(key, prepareSource(image, definition)); resolve(key); }
            catch (error) { reject(error); }
        };
        image.onerror = () => reject(new Error(`${definition.file} 加载失败`));
        image.src = `${assetPath(definition.file)}?v=2026090602`;
        });
    }

    function assetPath(file) {
        return typeof ArtAtlasManifest === 'undefined' ? file : ArtAtlasManifest[file].file;
    }
    function prepareSource(image, definition) {
        if (typeof ArtAtlasManifest === 'undefined') return normalizeAtlas(image, definition.cols, definition.rows);
        const entry = ArtAtlasManifest[definition.file];
        if (image.width !== entry.width || image.height !== entry.height || entry.contentBounds.length !== definition.cols * definition.rows) {
            throw new Error(`预处理图集与清单不匹配：${definition.file}`);
        }
        image.contentBounds = entry.contentBounds;
        return image;
    }

    function frame(key, row, col, flipX = false) {
        const source=atlases.get(key);
        if (!source) return null;
        return { source, x:col*128, y:row*128, width:128, height:128, flipX, animated:true,
            contentBounds:source.contentBounds[row*definitions[key].cols+col] };
    }
    const ready = Promise.all(Object.entries(definitions).map(([key, definition]) => load(key, definition)));
    ready.catch(error => console.error('[美术图集] 验收失败', error));
    return { frame, heroFrame, normalizeAtlas, prepareSource, assetPath, definitions, ready };
})();
