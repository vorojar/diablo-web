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
    const deathGroups = [
        ['hero','melee','zombie','ranged'], ['skeleton','shaman','mummy','ghost'],
        ['specter','vampire','bloodRaven','countess'], ['butcher','duriel','diablo','baal']
    ];
    const deaths = {};
    deathGroups.forEach((types, group) => {
        const key = `death${group}`;
        definitions[key] = {file:`death-${'abcd'[group]}-painted.png`,cols:4,rows:4};
        types.forEach((type,row) => { deaths[type] = {key,row}; });
    });
    // 人工按头顶到脚底测量身体标尺；武器、光效不参与身体缩放。
    // 横向锚点按各帧双脚支撑中心标注（占该帧可见边界宽度的比例）。
    const heroCalibration = {
        heroidle: [0.18, [0.53,0.53,0.53,0.53, 0.44,0.44,0.44,0.44, 0.59,0.59,0.59,0.59, 0.4,0.4,0.4,0.4]],
        herowalk: [0.187, [0.53,0.53,0.53,0.53, 0.44,0.44,0.44,0.44, 0.56,0.56,0.56,0.56, 0.43,0.43,0.43,0.43]],
        heroattack: [0.19, [0.53,0.59,0.37,0.53, 0.44,0.59,0.45,0.44, 0.6,0.63,0.6,0.6, 0.4,0.64,0.35,0.4]],
        herocast: [0.184, [0.53,0.60,0.65,0.60, 0.44,0.48,0.40,0.44, 0.60,0.65,0.64,0.58, 0.4,0.43,0.33,0.4]],
        herosit: [0.22, [0.47,0.47,0.47,0.47, 0.43,0.43,0.43,0.43, 0.6,0.6,0.6,0.6, 0.42,0.42,0.42,0.42]],
        heroHurt: [0.195, [0.53,0.53,0.53,0.53, 0.44,0.44,0.44,0.44, 0.59,0.59,0.59,0.59, 0.4,0.4,0.4,0.4]],
        herowalkDiagonal: [0.21, [0.52,0.52,0.52,0.52, 0.43,0.43,0.43,0.43, 0.43,0.43,0.43,0.43, 0.43,0.43,0.43,0.43]]
    };
    for (const [key,[bodyHeight,footX]] of Object.entries(heroCalibration)) {
        definitions[key].calibration = {bodyHeight,targetHeight:80,footX};
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

    function deathFrame(type, elapsed, collapseDuration, flipX = false) {
        const mapping = deaths[type];
        if (!mapping) return null;
        const index = Math.max(0, Math.min(3, Math.floor(elapsed / collapseDuration * 4)));
        const sample = frame(mapping.key, mapping.row, index, flipX);
        const first = frame(mapping.key, mapping.row, 0);
        const living = frame(type === 'hero' ? 'heroidle' : type, 0, 0);
        if (!sample || !living) return null;
        // 每类只用失衡首帧与站姿校准一次，后续跪倒/横卧保持同一身体标尺。
        return {...sample, death:true, renderScale:living.contentBounds.sh * 0.92 / first.contentBounds.sh};
    }

    function normalizeAtlas(source, cols, rows, calibration) {
        const scan = document.createElement('canvas');
        scan.width = source.width; scan.height = source.height;
        const scanContext = scan.getContext('2d');
        scanContext.drawImage(source, 0, 0);
        const data = scanContext.getImageData(0, 0, scan.width, scan.height).data;
        let transparent = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
        if (transparent < source.width * source.height * 0.15) throw new Error('美术样板缺少真实透明通道');
        // 生图的留白未必等距：寻找邻近的透明分隔线，不能截断人物再硬塞进格子。
        function gutters(count, size, projection, optional = false) {
            const cuts=[0];
            for(let i=1;i<count;i++) {
                const ideal=i*size/count, radius=size/count*0.3;
                let best=-1;
                for(let at=Math.max(1,Math.ceil(ideal-radius));at<Math.min(size,ideal+radius);at++) {
                    if(projection[at]===0 && (best<0 || Math.abs(at-ideal)<Math.abs(best-ideal))) best=at;
                }
                if(best<0) {
                    if (optional) return null;
                    throw new Error(`美术样板帧交叠：第${i}条分隔线无透明留白`);
                }
                cuts.push(best);
            }
            return [...cuts,size];
        }
        const rowProjection=new Uint32Array(source.height);
        for(let y=0;y<source.height;y++) for(let x=0;x<source.width;x++) if(data[(y*source.width+x)*4+3]>12) rowProjection[y]++;
        const rowCuts=gutters(rows,source.height,rowProjection,true);
        const regions = new Array(rows*cols);
        if (rowCuts) for (let row = 0; row < rows; row++) {
            const y0=rowCuts[row], y1=rowCuts[row+1];
            const colProjection=new Uint32Array(source.width);
            for(let y=y0;y<y1;y++) for(let x=0;x<source.width;x++) if(data[(y*source.width+x)*4+3]>12) colProjection[x]++;
            const colCuts=gutters(cols,source.width,colProjection);
            for (let col = 0; col < cols; col++) {
            const x0=colCuts[col], x1=colCuts[col+1];
            regions[row*cols+col]={x0,x1,y0,y1};
            }
        } else {
            // 没有贯穿全图的横向留白时，逐列验证纵向分隔；仍不允许截断不透明像素。
            const colProjection=new Uint32Array(source.width);
            for(let y=0;y<source.height;y++) for(let x=0;x<source.width;x++) if(data[(y*source.width+x)*4+3]>12) colProjection[x]++;
            const colCuts=gutters(cols,source.width,colProjection);
            for(let col=0;col<cols;col++) {
                const x0=colCuts[col],x1=colCuts[col+1], projection=new Uint32Array(source.height);
                for(let y=0;y<source.height;y++) for(let x=x0;x<x1;x++) if(data[(y*source.width+x)*4+3]>12) projection[y]++;
                const cuts=gutters(rows,source.height,projection);
                for(let row=0;row<rows;row++) regions[row*cols+col]={x0,x1,y0:cuts[row],y1:cuts[row+1]};
            }
        }
        const bounds = regions.map(({x0,x1,y0,y1},index) => {
            let left=x1, right=-1, top=y1, bottom=-1;
            for (let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) if(data[(y*source.width+x)*4+3]>12) {
                left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
            }
            if (right < left) throw new Error(`美术样板存在空帧 ${Math.floor(index/cols)}:${index%cols}`);
            return { x:left, y:top, width:right-left+1, height:bottom-top+1 };
        });
        // 全图共享缩放，避免较小姿态被单独放大产生呼吸式抖动。
        if (calibration && (!(calibration.bodyHeight > 0) || !(calibration.targetHeight > 0) || calibration.footX.length !== bounds.length
            || calibration.footX.some(x => !Number.isFinite(x) || x < 0 || x > 1))) throw new Error('人物身体标尺或脚底锚点无效');
        const scale = calibration ? calibration.targetHeight / (source.height * calibration.bodyHeight)
            : Math.min(88 / Math.max(...bounds.map(b=>b.height)), 112 / Math.max(...bounds.map(b=>b.width)));
        const atlas = document.createElement('canvas');
        atlas.width = cols * 128; atlas.height = rows * 128;
        const ctx = atlas.getContext('2d');
        atlas.contentBounds = [];
        bounds.forEach((b, i) => {
            const w=b.width*scale, h=b.height*scale;
            const cellX=(i%cols)*128, cellY=Math.floor(i/cols)*128;
            const x=cellX+64-w*(calibration ? calibration.footX[i] : 0.5), y=cellY+124-h;
            if (x < cellX || x+w > cellX+128 || y < cellY) throw new Error(`人物标尺导致越界：第${i}帧；请校正身体测量或锚点`);
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
        image.src = `${assetPath(definition.file)}?v=2026090702`;
        });
    }

    function assetPath(file) {
        return typeof ArtAtlasManifest === 'undefined' ? file : ArtAtlasManifest[file].file;
    }
    function prepareSource(image, definition) {
        if (typeof ArtAtlasManifest === 'undefined') return normalizeAtlas(image, definition.cols, definition.rows, definition.calibration);
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
    return { frame, heroFrame, deathFrame, normalizeAtlas, prepareSource, assetPath, definitions, ready };
})();
