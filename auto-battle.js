// ========== 自动战斗系统 ==========
// 依赖: constants.js, audio.js, game.js (全局变量)

const AutoBattle = {
    enabled: false,
    settings: {
        useSkill: true,                                     // 优先使用技能
        keepDistance: GAME_CONFIG.AUTO_KEEP_DISTANCE,       // 保持距离（远程战术）
        hpThreshold: GAME_CONFIG.AUTO_POTION_HP_THRESHOLD,  // 喝红药阈值
        mpThreshold: GAME_CONFIG.AUTO_POTION_MP_THRESHOLD,  // 喝蓝药阈值
        emergencyHp: GAME_CONFIG.AUTO_EMERGENCY_HP,         // 紧急回城阈值
        pickupUnique: true,                                 // 自动拾取暗金
        pickupSet: true                                     // 自动拾取套装
    },
    // 雇佣费系统
    sessionGold: 0,          // 本次自动战斗获得的总金币
    sessionFee: 0,           // 本次累计扣除的雇佣费
    currentTarget: null,
    stuckTimer: 0,               // 无目标时的卡死检测计时器
    stuckPosTimer: 0,            // 位置位移卡死检测计时器
    lastPos: { x: 0, y: 0 },
    oscillationDetector: { positions: [], lastCheck: 0 },  // 摇摆检测器
    lastDamagedBy: null,         // 记录最后攻击我的敌人
    lastDamagedTime: 0,          // 最后被攻击时间
    lastTargetDamageDecisionTime: 0, // 上次因受击触发目标重选的时间
    moveDecisionTimer: 0,        // 移动决策计时器
    lastMoveDecision: null,      // 上次的移动决策
    failedPaths: [],             // 记录失败的寻路尝试
    pathCleanupTimer: 0,         // 失败路径清理计时器
    targetFailCount: 0,          // 当前目标的连续失败次数
    lastTargetId: null,          // 上次追击的目标（用于检测目标切换）
    blacklistedTargets: [],      // 被放弃的目标黑名单 [{target, until}]
    targetDecisionTimer: 0,      // 目标选择降频计时器
    pickupDecisionTimer: 0,      // 拾取扫描降频计时器
    targetDecisionInterval: 0.12, // 目标选择约8Hz
    pickupDecisionInterval: 0.18, // 拾取候选约5.5Hz
    losCache: new Map(),         // LOS缓存：对象+双方瓦片+区域
    losObjectIds: new WeakMap(), // 对象引用稳定编号
    losNextObjectId: 1,
    losCacheAreaKey: null,
    losCacheMaxEntries: 600,

    getMeleeEngageDistance(target) {
        if (!target || !Number.isFinite(target.radius)) throw new Error('AutoBattle melee target missing radius');
        if (!Number.isFinite(player.radius)) throw new Error('Player missing radius');
        const targetRadius = target.radius;
        const playerRadius = player.radius;
        return Math.max(70, targetRadius + playerRadius + 35);
    },

    // ====== A*寻路系统 ======
    astarCache: {
        path: null,              // 当前缓存的路径 [{x, y}, ...]
        targetX: null,           // 路径目标X
        targetY: null,           // 路径目标Y
        currentIndex: 0,         // 当前路径点索引
        lastUpdateTime: 0        // 上次更新时间
    },

    // 最小二叉堆实现（用于A*寻路优化）
    MinHeap: class {
        constructor() {
            this.heap = [];
            this.nodeMap = new Map(); // key -> index 快速查找
        }

        size() { return this.heap.length; }

        push(node) {
            this.heap.push(node);
            const idx = this.heap.length - 1;
            this.nodeMap.set(node.key(), idx);
            this._bubbleUp(idx);
        }

        pop() {
            if (this.heap.length === 0) return null;
            const min = this.heap[0];
            const last = this.heap.pop();
            this.nodeMap.delete(min.key());
            if (this.heap.length > 0) {
                this.heap[0] = last;
                this.nodeMap.set(last.key(), 0);
                this._bubbleDown(0);
            }
            return min;
        }

        // 更新节点（用于发现更优路径时）
        updateNode(key, newNode) {
            const idx = this.nodeMap.get(key);
            if (idx === undefined) {
                this.push(newNode);
                return;
            }
            const oldF = this.heap[idx].f;
            this.heap[idx] = newNode;
            this.nodeMap.set(key, idx);
            if (newNode.f < oldF) {
                this._bubbleUp(idx);
            } else {
                this._bubbleDown(idx);
            }
        }

        has(key) {
            return this.nodeMap.has(key);
        }

        _bubbleUp(idx) {
            while (idx > 0) {
                const parentIdx = Math.floor((idx - 1) / 2);
                if (this.heap[idx].f >= this.heap[parentIdx].f) break;
                this._swap(idx, parentIdx);
                idx = parentIdx;
            }
        }

        _bubbleDown(idx) {
            const len = this.heap.length;
            while (true) {
                const left = 2 * idx + 1;
                const right = 2 * idx + 2;
                let smallest = idx;

                if (left < len && this.heap[left].f < this.heap[smallest].f) {
                    smallest = left;
                }
                if (right < len && this.heap[right].f < this.heap[smallest].f) {
                    smallest = right;
                }
                if (smallest === idx) break;
                this._swap(idx, smallest);
                idx = smallest;
            }
        }

        _swap(i, j) {
            const temp = this.heap[i];
            this.heap[i] = this.heap[j];
            this.heap[j] = temp;
            this.nodeMap.set(this.heap[i].key(), i);
            this.nodeMap.set(this.heap[j].key(), j);
        }
    },

    // A*寻路算法实现（使用二叉堆优化）
    astarFindPath(startX, startY, goalX, goalY) {
        // 转换为瓦片坐标
        const startCol = Math.floor(startX / TILE_SIZE);
        const startRow = Math.floor(startY / TILE_SIZE);
        let goalCol = Math.floor(goalX / TILE_SIZE);
        let goalRow = Math.floor(goalY / TILE_SIZE);

        // 边界检查
        if (startCol < 0 || startCol >= MAP_WIDTH || startRow < 0 || startRow >= MAP_HEIGHT) return null;
        if (goalCol < 0 || goalCol >= MAP_WIDTH || goalRow < 0 || goalRow >= MAP_HEIGHT) return null;

        // 目标是墙则尝试找附近最近的可行走瓦片
        if (mapData[goalRow][goalCol] === 0) {
            let found = false;
            // 搜索半径逐渐扩大
            for (let radius = 1; radius <= 3 && !found; radius++) {
                for (let dr = -radius; dr <= radius && !found; dr++) {
                    for (let dc = -radius; dc <= radius && !found; dc++) {
                        if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue; // 只检查外圈
                        const nr = goalRow + dr;
                        const nc = goalCol + dc;
                        if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && mapData[nr][nc] !== 0) {
                            goalRow = nr;
                            goalCol = nc;
                            found = true;
                        }
                    }
                }
            }
            if (!found) return null; // 附近没有可行走的瓦片
        }

        // 节点类
        class AStarNode {
            constructor(col, row, g, h, parent) {
                this.col = col;
                this.row = row;
                this.g = g;       // 起点到当前节点的实际代价
                this.h = h;       // 当前节点到目标的估计代价(启发式)
                this.f = g + h;   // 总代价
                this.parent = parent;
            }

            equals(other) {
                return this.col === other.col && this.row === other.row;
            }

            key() {
                return `${this.col},${this.row}`;
            }
        }

        // 启发函数：欧几里得距离
        const heuristic = (col, row) => {
            const dx = goalCol - col;
            const dy = goalRow - row;
            return Math.sqrt(dx * dx + dy * dy);
        };

        // 获取邻居节点（8方向）
        const getNeighbors = (node) => {
            const neighbors = [];
            const directions = [
                { dc: -1, dr: 0, cost: 1 },      // 左
                { dc: 1, dr: 0, cost: 1 },       // 右
                { dc: 0, dr: -1, cost: 1 },      // 上
                { dc: 0, dr: 1, cost: 1 },       // 下
                { dc: -1, dr: -1, cost: 1.414 }, // 左上
                { dc: 1, dr: -1, cost: 1.414 },  // 右上
                { dc: -1, dr: 1, cost: 1.414 },  // 左下
                { dc: 1, dr: 1, cost: 1.414 }    // 右下
            ];

            for (let dir of directions) {
                const newCol = node.col + dir.dc;
                const newRow = node.row + dir.dr;

                // 边界检查
                if (newCol < 0 || newCol >= MAP_WIDTH || newRow < 0 || newRow >= MAP_HEIGHT) continue;

                // 墙壁检查
                if (mapData[newRow][newCol] === 0) continue;

                // 对角线移动需要检查两边是否都能通过（防止穿墙）
                if (dir.dc !== 0 && dir.dr !== 0) {
                    if (mapData[node.row][newCol] === 0 || mapData[newRow][node.col] === 0) {
                        continue;
                    }
                }

                neighbors.push({
                    col: newCol,
                    row: newRow,
                    cost: dir.cost
                });
            }

            return neighbors;
        };

        // 开放列表（二叉堆）和关闭列表
        const openHeap = new this.MinHeap();
        const closedSet = new Set();
        const gScores = {}; // 记录每个节点的最优g值

        // 起始节点
        const startNode = new AStarNode(startCol, startRow, 0, heuristic(startCol, startRow), null);
        openHeap.push(startNode);
        gScores[startNode.key()] = 0;

        // 主循环
        let iterations = 0;
        const maxIterations = 2000; // 防止死循环

        while (openHeap.size() > 0 && iterations < maxIterations) {
            iterations++;

            // 取出f值最小的节点 - O(log n)
            const current = openHeap.pop();

            // 到达目标
            if (current.col === goalCol && current.row === goalRow) {
                // 重建路径
                const path = [];
                let node = current;
                while (node !== null) {
                    // 转换回像素坐标（瓦片中心）
                    path.unshift({
                        x: node.col * TILE_SIZE + TILE_SIZE / 2,
                        y: node.row * TILE_SIZE + TILE_SIZE / 2
                    });
                    node = node.parent;
                }

                // 路径简化：移除多余的中间点（保持直线段）
                if (path.length > 2) {
                    const simplified = [path[0]];
                    for (let i = 1; i < path.length - 1; i++) {
                        const prev = simplified[simplified.length - 1];
                        const curr = path[i];
                        const next = path[i + 1];

                        // 检查是否需要转向（方向改变）
                        const dx1 = curr.x - prev.x;
                        const dy1 = curr.y - prev.y;
                        const dx2 = next.x - curr.x;
                        const dy2 = next.y - curr.y;

                        // 方向向量归一化后比较
                        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
                        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

                        if (len1 > 0 && len2 > 0) {
                            const dot = (dx1 / len1) * (dx2 / len2) + (dy1 / len1) * (dy2 / len2);
                            // dot接近1表示方向相同，可以跳过中间点
                            if (dot < 0.99) { // 允许2度内的偏差
                                simplified.push(curr);
                            }
                        }
                    }
                    simplified.push(path[path.length - 1]);
                    return simplified;
                }

                return path;
            }

            // 加入关闭列表
            closedSet.add(current.key());

            // 检查邻居
            const neighbors = getNeighbors(current);
            for (let neighbor of neighbors) {
                const neighborKey = `${neighbor.col},${neighbor.row}`;

                // 已在关闭列表中则跳过
                if (closedSet.has(neighborKey)) continue;

                // 计算新的g值
                const tentativeG = current.g + neighbor.cost;

                // 检查是否找到更优路径
                if (gScores[neighborKey] === undefined || tentativeG < gScores[neighborKey]) {
                    gScores[neighborKey] = tentativeG;

                    // 创建新节点
                    const h = heuristic(neighbor.col, neighbor.row);
                    const newNode = new AStarNode(neighbor.col, neighbor.row, tentativeG, h, current);

                    // 使用二叉堆的 updateNode 方法（自动处理插入或更新）- O(log n)
                    openHeap.updateNode(neighborKey, newNode);
                }
            }
        }

        // 未找到路径
        return null;
    },

    getTileKey(x, y) {
        return `${Math.floor(x / TILE_SIZE)},${Math.floor(y / TILE_SIZE)}`;
    },

    getLosAreaKey() {
        return `${player.floor}:${player.hellFloor}:${player.isInHell}:${isInTown()}`;
    },

    resetLosCacheIfAreaChanged() {
        const areaKey = this.getLosAreaKey();
        if (this.losCacheAreaKey !== areaKey) {
            this.losCache.clear();
            this.losCacheAreaKey = areaKey;
        }
        return areaKey;
    },

    getLosObjectId(target) {
        let id = this.losObjectIds.get(target);
        if (id === undefined) {
            id = this.losNextObjectId;
            this.losNextObjectId++;
            this.losObjectIds.set(target, id);
        }
        return id;
    },

    hasCachedLineOfSightTo(target) {
        const areaKey = this.resetLosCacheIfAreaChanged();
        const playerTile = this.getTileKey(player.x, player.y);
        const targetTile = this.getTileKey(target.x, target.y);
        const key = `${areaKey}:${this.getLosObjectId(target)}:${playerTile}:${targetTile}`;

        if (this.losCache.has(key)) {
            return this.losCache.get(key);
        }

        const result = hasLineOfSight(player.x, player.y, target.x, target.y);
        this.losCache.set(key, result);
        if (this.losCache.size > this.losCacheMaxEntries) {
            const firstKey = this.losCache.keys().next().value;
            this.losCache.delete(firstKey);
        }
        return result;
    },

    // 寻找目标 - 优先近的能看到的，其次远的任意怪
    // 优化：使用 EnemyCache.aliveList 避免遍历死亡敌人
    findTarget() {
        if (!this.enabled || isInTown()) return null;

        let nearestVisible = null;   // 能看到的最近的怪
        let minVisibleDistSq = Infinity;
        let nearestClose = null;     // 近距离的怪（即使在墙角）
        let minCloseDistSq = Infinity;
        let nearestAny = null;       // 任意最近的怪（用于绕路）
        let minAnyDistSq = Infinity;

        // 使用缓存的活敌人列表（已过滤死亡敌人）
        const aliveList = typeof EnemyCache !== 'undefined' ? EnemyCache.aliveList : enemies;
        const px = player.x, py = player.y;

        for (let i = 0, len = aliveList.length; i < len; i++) {
            const e = aliveList[i];
            if (e.dead) continue; // 兼容未使用缓存的情况

            const dx = e.x - px, dy = e.y - py;
            const distSq = dx * dx + dy * dy;

            // 近距离的怪（<100）：即使在墙角也要打，最高优先
            if (distSq < 10000 && distSq < minCloseDistSq) {
                nearestClose = e;
                minCloseDistSq = distSq;
            }

            // 能看到的怪：优先选，范围600
            if (distSq < 360000 && distSq < minVisibleDistSq && this.hasCachedLineOfSightTo(e)) {
                nearestVisible = e;
                minVisibleDistSq = distSq;
            }

            // 任意怪：范围扩大到1500（整个屏幕），用于绕路追击
            if (distSq < 2250000 && distSq < minAnyDistSq) { // 1500^2 = 2250000
                nearestAny = e;
                minAnyDistSq = distSq;
            }
        }

        // 优先级：近距离怪 > 能看到的 > 任意怪
        return nearestClose || nearestVisible || nearestAny;
    },

    // 记录被攻击
    onPlayerDamaged(attacker) {
        if (this.enabled && attacker) {
            this.lastDamagedBy = attacker;
            this.lastDamagedTime = Date.now();
        }
    },

    // 决策行动 - 极简版
    decideAction(dt) {
        if (!this.enabled || isInTown()) return;

        // 0. 物理位置卡死检测
        const moveDist = Math.hypot(player.x - this.lastPos.x, player.y - this.lastPos.y);

        // 如果有拾取目标，检测是否在接近目标
        if (player.targetItem) {
            const distToItem = Math.hypot(player.x - player.targetItem.x, player.y - player.targetItem.y);
            // 如果距离物品很近但拾取不了，或者长时间没接近物品，放弃
            if (distToItem < 50 && moveDist < 5) {
                this.stuckPosTimer += dt;
            } else if (moveDist < 10) {
                // 在移动但移动很慢（可能在绕路或卡住）
                this.stuckPosTimer += dt * 0.5;
            } else {
                this.stuckPosTimer = Math.max(0, this.stuckPosTimer - dt);
            }

            if (this.stuckPosTimer > 2) {
                this.blacklistedTargets.push({ target: player.targetItem, until: Date.now() + 30000 });
                // 静默放弃，不显示提示
                player.targetItem = null;
                player.targetX = null;
                player.targetY = null;
                this.stuckPosTimer = 0;
            }
        } else if (moveDist < 2) {
            this.stuckPosTimer += dt;
            if (this.stuckPosTimer > 3) {
                this.escapeFromStuck();
                this.stuckPosTimer = 0;
            }
        } else {
            this.stuckPosTimer = 0;
        }
        this.lastPos = { x: player.x, y: player.y };

        // 1. 生存：紧急回城
        const hpPercent = player.hp / player.maxHp;
        if (hpPercent < this.settings.emergencyHp) {
            const hasScroll = player.inventory.some(it => it && it.type === 'scroll');
            if (hasScroll) {
                this.emergencyTownPortal();
                return;
            }
        }

        // 2. 生存：喝药
        if (hpPercent < this.settings.hpThreshold) {
            this.drinkPotion('health');
        }
        if (player.mp / player.maxMp < this.settings.mpThreshold) {
            this.drinkPotion('mana');
        }

        // 2.5 生存：使用护盾技能（血量低于50%且没有护盾时自动释放）
        if (this.settings.useSkill && hpPercent < 0.5) {
            const shieldLevel = player.skillTree?.holy_shield?.stage1 || 0;
            const shieldCooldown = player.shield?.cooldown || 0;
            const shieldActive = player.shield?.active || false;
            const manaCost = SKILL_TREE?.holy_shield?.stage1?.manaCost || 15;

            // 护盾已学习、不在冷却中、当前没有激活的护盾、法力充足
            if (shieldLevel > 0 && shieldCooldown <= 0 && !shieldActive && player.mp >= manaCost) {
                castSkill('holy_shield');
            }
        }

        // 3. 拾取物品：候选扫描降到约5.5Hz，避免每帧遍历地面物品
        this.pickupDecisionTimer += dt;
        const pickupDecisionDue = this.pickupDecisionTimer >= this.pickupDecisionInterval;
        if (pickupDecisionDue) {
            this.autoPickupItems();
            this.pickupDecisionTimer = 0;
        }

        // 4. 选目标：扫描降到约8Hz；目标死亡/消失/刚受击时立即重选
        this.targetDecisionTimer += dt;
        const targetDecisionDue = this.targetDecisionTimer >= this.targetDecisionInterval;
        const currentTargetRemoved = this.currentTarget && targetDecisionDue && !enemies.includes(this.currentTarget);
        const currentTargetInvalid = (this.currentTarget && this.currentTarget.dead) ||
            currentTargetRemoved;
        const damageTriggeredDecision = this.lastDamagedBy && !this.lastDamagedBy.dead &&
            this.lastDamagedTime > this.lastTargetDamageDecisionTime;
        if (currentTargetInvalid || damageTriggeredDecision || targetDecisionDue) {
            this.currentTarget = this.findTarget();
            this.targetDecisionTimer = 0;
            if (damageTriggeredDecision) {
                this.lastTargetDamageDecisionTime = this.lastDamagedTime;
            }
        }

        if (!this.currentTarget) {
            // 没敌人，随机走走探索
            this.stuckTimer += dt;
            if (this.stuckTimer > 1) {
                this.moveToCenter();
                this.stuckTimer = 0;
            }
            return;
        }
        this.stuckTimer = 0;

        // 5. 移动：没在拾取东西就走向目标
        if (player.targetItem === null) {
            const tdx = this.currentTarget.x - player.x;
            const tdy = this.currentTarget.y - player.y;
            const engageDistance = this.getMeleeEngageDistance(this.currentTarget);
            if (tdx * tdx + tdy * tdy > engageDistance * engageDistance) {
                this.moveTowards(this.currentTarget);
            } else {
                player.targetX = null;
                player.targetY = null;
            }
        }

        // 6. 攻击
        this.attackTarget(this.currentTarget);
    },

    // 紧急回城
    emergencyTownPortal() {
        // 紧急回城（调用前已确保有卷轴）
        useQuickItem('scroll');
        createFloatingText(player.x, player.y - 60, '⚠️ 紧急回城！', COLORS.error, 2);
    },

    // 喝药
    drinkPotion(type) {
        let itemName = '';
        if (type === 'health') itemName = CONSUMABLE_NAME.HEALTH_POTION;
        if (type === 'mana') itemName = CONSUMABLE_NAME.MANA_POTION;

        const hasPotion = player.inventory.some(it => it && it.name === itemName);
        if (hasPotion) {
            useQuickItem(type);
        }
    },

    // A*寻路：使用缓存提高性能
    findPathToTarget(targetX, targetY, target = null) {
        // 1. 检查是否有视线，有的话直接走过去
        const hasDirectLOS = target ? this.hasCachedLineOfSightTo(target) : hasLineOfSight(player.x, player.y, targetX, targetY);
        if (hasDirectLOS) {
            // 清空缓存
            this.astarCache.path = null;
            this.astarCache.currentIndex = 0;
            return { x: targetX, y: targetY };
        }

        // 2. 检查缓存是否有效
        const now = Date.now();
        const targetChanged = this.astarCache.targetX !== null &&
            (Math.abs(this.astarCache.targetX - targetX) > 80 ||
                Math.abs(this.astarCache.targetY - targetY) > 80);

        const cacheExpired = now - this.astarCache.lastUpdateTime > 2000; // 2秒过期
        const needNewPath = !this.astarCache.path || targetChanged || cacheExpired;

        // 3. 如果需要新路径，运行A*
        if (needNewPath) {
            const newPath = this.astarFindPath(player.x, player.y, targetX, targetY);

            if (newPath && newPath.length > 0) {
                // 缓存新路径
                this.astarCache.path = newPath;
                this.astarCache.targetX = targetX;
                this.astarCache.targetY = targetY;
                this.astarCache.currentIndex = 0;
                this.astarCache.lastUpdateTime = now;

                // 显示调试信息（可选）
                if (window.DEBUG_ASTAR) {
                    console.log(`A* 找到路径: ${newPath.length}个路径点`);
                }
            } else {
                // A*失败，清空缓存，返回null让贪心算法处理
                this.astarCache.path = null;
                this.astarCache.currentIndex = 0;

                // 回退到简单的贪心寻路
                return this.fallbackGreedyPath(targetX, targetY);
            }
        }

        // 4. 使用缓存的路径
        if (this.astarCache.path && this.astarCache.path.length > 0) {
            // 跳过已经到达的路径点
            while (this.astarCache.currentIndex < this.astarCache.path.length) {
                const waypoint = this.astarCache.path[this.astarCache.currentIndex];
                const distToWaypoint = Math.hypot(waypoint.x - player.x, waypoint.y - player.y);

                // 如果距离路径点小于半个瓦片，认为已到达
                if (distToWaypoint < TILE_SIZE * 0.6) {
                    this.astarCache.currentIndex++;
                } else {
                    // 返回当前路径点
                    return { x: waypoint.x, y: waypoint.y };
                }
            }

            // 所有路径点都走完了，清空缓存
            this.astarCache.path = null;
            this.astarCache.currentIndex = 0;
            return { x: targetX, y: targetY };
        }

        // 5. 缓存为空，返回null（让外层决定）
        return null;
    },

    // 回退的贪心寻路（当A*失败时使用）
    fallbackGreedyPath(targetX, targetY) {
        const toTargetAngle = Math.atan2(targetY - player.y, targetX - player.x);
        const stepDist = 80;

        const angles = [
            toTargetAngle,
            toTargetAngle - Math.PI / 4,
            toTargetAngle + Math.PI / 4,
            toTargetAngle - Math.PI / 2,
            toTargetAngle + Math.PI / 2,
            toTargetAngle - Math.PI * 3 / 4,
            toTargetAngle + Math.PI * 3 / 4,
            toTargetAngle + Math.PI  // 反向
        ];

        for (let a of angles) {
            const testX = player.x + Math.cos(a) * stepDist;
            const testY = player.y + Math.sin(a) * stepDist;

            if (!isWall(testX, testY)) {
                return { x: testX, y: testY };
            }
        }

        // 完全被困，返回当前位置
        return { x: player.x, y: player.y };
    },

    // 向目标移动（使用寻路）
    moveTowards(target) {
        const pathPos = this.findPathToTarget(target.x, target.y, target);

        if (pathPos) {
            // 检查是否寻路成功（不是返回原地）
            const pathDist = Math.hypot(pathPos.x - player.x, pathPos.y - player.y);
            if (pathDist > 20) {
                // 寻路成功，移动到新位置
                player.targetX = pathPos.x;
                player.targetY = pathPos.y;
            } else {
                // 寻路失败，返回原地，尝试强制脱困
                this.escapeFromStuck();
            }
        } else {
            // 无法寻路，清除目标
            player.targetX = null;
            player.targetY = null;
        }

        player.targetItem = null;
    },

    // 从目标后退（智能绕墙）
    retreatFrom(target) {
        const angle = Math.atan2(player.y - target.y, player.x - target.x);
        const retreatDist = 100;

        // 尝试多个后退方向
        const retreatAngles = [
            angle,                    // 正后方
            angle + Math.PI / 6,      // 右后15度
            angle - Math.PI / 6,      // 左后15度
            angle + Math.PI / 3,      // 右后30度
            angle - Math.PI / 3,      // 左后30度
            angle + Math.PI / 2,      // 右侧
            angle - Math.PI / 2,      // 左侧
        ];

        for (let a of retreatAngles) {
            const testX = player.x + Math.cos(a) * retreatDist;
            const testY = player.y + Math.sin(a) * retreatDist;

            // 找到第一个可行走的后退位置
            if (!isWall(testX, testY)) {
                player.targetX = testX;
                player.targetY = testY;
                player.targetItem = null;
                return;
            }
        }

        // 如果所有方向都被墙挡住，尝试向侧面小距离移动
        const sideAngles = [angle + Math.PI / 2, angle - Math.PI / 2];
        for (let a of sideAngles) {
            const testX = player.x + Math.cos(a) * 60;
            const testY = player.y + Math.sin(a) * 60;

            if (!isWall(testX, testY)) {
                player.targetX = testX;
                player.targetY = testY;
                player.targetItem = null;
                return;
            }
        }

        // 实在没办法，原地不动
        player.targetX = null;
        player.targetY = null;
        player.targetItem = null;
    },

    // 向地图中心移动（防卡死）
    moveToCenter() {
        // 随机选择一个不是墙的位置
        let attempts = 0;
        let foundPos = false;

        while (!foundPos && attempts < 20) {
            const randX = (10 + Math.random() * (MAP_WIDTH - 20)) * TILE_SIZE;
            const randY = (10 + Math.random() * (MAP_HEIGHT - 20)) * TILE_SIZE;

            if (!isWall(randX, randY)) {
                player.targetX = randX;
                player.targetY = randY;
                foundPos = true;
            }
            attempts++;
        }

        if (!foundPos) {
            // 实在找不到就用地图中心
            player.targetX = MAP_WIDTH * TILE_SIZE / 2;
            player.targetY = MAP_HEIGHT * TILE_SIZE / 2;
        }

        player.targetItem = null;
    },

    // 脱困函数：卡墙时尝试脱身（智能版）
    escapeFromStuck() {
        // 记录失败位置，避免再次尝试
        this.failedPaths.push({ x: player.x, y: player.y, time: Date.now() });
        if (this.failedPaths.length > 20) {
            this.failedPaths.shift();
        }

        // 重置移动决策计时器，立即重新决策
        this.moveDecisionTimer = 999;

        // 智能脱困：增大脱困距离，避开目标方向
        const escapeDistances = [150, 250];  // 增大距离，跳出困境

        // 计算应避免的角度（如果有目标，避开目标方向）
        let avoidAngle = null;
        if (this.currentTarget) {
            avoidAngle = Math.atan2(this.currentTarget.y - player.y, this.currentTarget.x - player.x);
        }

        // 尝试16个方向
        for (let dist of escapeDistances) {
            const angles = [];
            for (let i = 0; i < 16; i++) {
                angles.push((Math.PI * 2 / 16) * i);
            }

            // 如果有避免角度，排序角度（优先远离目标）
            if (avoidAngle !== null) {
                angles.sort((a, b) => {
                    const distA = Math.abs(((a - avoidAngle + Math.PI) % (2 * Math.PI)) - Math.PI);
                    const distB = Math.abs(((b - avoidAngle + Math.PI) % (2 * Math.PI)) - Math.PI);
                    return distB - distA;  // 距离目标方向越远越优先
                });
            }

            for (let angle of angles) {
                const testX = player.x + Math.cos(angle) * dist;
                const testY = player.y + Math.sin(angle) * dist;

                if (!isWall(testX, testY)) {
                    // 检查是否在失败路径黑名单中
                    const isInBlacklist = this.failedPaths.some(p =>
                        Math.hypot(p.x - testX, p.y - testY) < 80
                    );

                    if (!isInBlacklist) {
                        player.targetX = testX;
                        player.targetY = testY;
                        player.targetItem = null;
                        return;
                    }
                }
            }
        }

        // 所有方向都失败，移动到地图随机位置
        this.moveToCenter();
    },

    // 攻击目标
    attackTarget(target) {
        const dist = Math.hypot(target.x - player.x, target.y - player.y);

        // 设置鼠标位置指向目标（技能需要这个）
        mouse.worldX = target.x;
        mouse.worldY = target.y;

        // 检查视线
        const hasLOS = this.hasCachedLineOfSightTo(target);

        // 使用技能
        if (this.settings.useSkill) {
            // 有视线：火球/多重优先
            if (hasLOS) {
                const fireballCost = getSkillManaCost('fireball', player.skills.fireball);
                if (player.skills.fireball > 0 && player.skillCooldowns.fireball <= 0 && dist <= 450 && player.mp >= fireballCost) {
                    castSkill('fireball');
                    return;
                }

                const multishotCost = getSkillManaCost('multishot', player.skills.multishot);
                if (player.skills.multishot > 0 && player.skillCooldowns.multishot <= 0 && dist <= 500 && player.mp >= multishotCost) {
                    castSkill('multishot');
                    return;
                }
            }

            // 雷电术：可以隔墙，射程190
            const thunderCost = getSkillManaCost('thunder', player.skills.thunder);
            if (player.skills.thunder > 0 && player.skillCooldowns.thunder <= 0 && dist <= 190 && player.mp >= thunderCost) {
                castSkill('thunder');
                return;
            }
        }

        // 普攻：近战范围内，有视线或距离很近（墙角）
        const meleeRange = this.getMeleeEngageDistance(target);
        const canMelee = (hasLOS || dist <= meleeRange + 10) && dist <= meleeRange;
        if (canMelee && player.attackCooldown <= 0) {
            const baseDmg = player.damage[0] + Math.random() * (player.damage[1] - player.damage[0]);
            const strBonus = player.str * 0.1;
            const totalDmg = Math.floor((baseDmg + strBonus) * (1 + player.attackSpeed / 100));
            takeDamage(target, totalDmg);
            player.attackCooldown = 0.8 / (1 + player.attackSpeed / 100);
            AudioSys.play('hit');
            createSlashEffect(player.x, player.y, target.x, target.y, totalDmg);
            player.attackAnim = 1;

            if (player.lifeSteal > 0) {
                const heal = Math.floor(totalDmg * player.lifeSteal / 100);
                player.hp = Math.min(player.maxHp, player.hp + heal);
            }
        }
    },

    // 自动拾取物品（带优先级）
    autoPickupItems() {
        const inventoryFull = player.inventory.filter(it => it !== null).length >= player.inventory.length;

        // 检查能否为物品腾出空间（只要背包里有比目标稀有度低的物品就可以腾位）
        const canMakeRoom = (targetRarity) => {
            // 只有装备（稀有度>=2）才考虑腾位
            if (targetRarity < 2) return false;
            for (let i = 0; i < player.inventory.length; i++) {
                const it = player.inventory[i];
                if (!it) continue;
                // 药水、卷轴不丢
                if (it.type === 'potion' || it.type === 'scroll') continue;
                // 如果背包里的物品稀有度低于目标，就可以腾位
                if (it.rarity < targetRarity) return true;
            }
            return false;
        };

        // 候选物品列表
        let setItems = [];      // 套装：最高优先级
        let urgentPotions = []; // 紧急药水
        let uniqueItems = [];   // 暗金/稀有
        let goldItems = [];     // 金币
        let consumables = [];   // 药水/卷轴
        let normalItems = [];   // 蓝/黄

        const hasHealPotion = player.inventory.some(it => it && it.name === CONSUMABLE_NAME.HEALTH_POTION);
        const hasManaPotion = player.inventory.some(it => it && it.name === CONSUMABLE_NAME.MANA_POTION);

        for (let i = 0; i < groundItems.length; i++) {
            const it = groundItems[i];
            if (!it) continue;

            // 过滤黑名单物品
            if (this.blacklistedTargets.some(b => b.target === it && Date.now() < b.until)) continue;

            const dist = Math.hypot(it.x - player.x, it.y - player.y);
            if (it.dropTime && Date.now() - it.dropTime < 3000) continue; // 刚丢弃的物品不捡

            // 视线检查：普通物品需要视线；极品物品（套装/暗金/金币）如果距离近即便没视线也要捡（可能在拐角）
            const isSuperRare = it.rarity >= 4 || it.type === 'gold';
            if (!isSuperRare && !this.hasCachedLineOfSightTo(it)) continue;
            // 即便没视线，极品物品距离也有限制（防止全图跑）
            if (isSuperRare && dist > 800) continue;

            // 分类
            if (it.type === 'gold' && player.autoPickup.gold && dist < 600) {
                goldItems.push({ item: it, dist, priority: 1 }); // 金币优先级提升至与套装相同
            } else if (it.rarity === 5 && dist < 500) {
                if (!inventoryFull || canMakeRoom(5)) setItems.push({ item: it, dist, priority: 1 });
            } else if (it.rarity === 4 && dist < 500) {
                if (!inventoryFull || canMakeRoom(4)) uniqueItems.push({ item: it, dist, priority: 3 });
            } else if (it.rarity === 3 && dist < 400) {
                if (!inventoryFull || canMakeRoom(3)) uniqueItems.push({ item: it, dist, priority: 4 });
            } else if ((it.name === CONSUMABLE_NAME.HEALTH_POTION || it.name === CONSUMABLE_NAME.MANA_POTION)) {
                if (player.autoPickup.potion && dist < 400) {
                    const needUrgent = (it.name === CONSUMABLE_NAME.HEALTH_POTION && !hasHealPotion) || (it.name === CONSUMABLE_NAME.MANA_POTION && !hasManaPotion);
                    if (needUrgent) urgentPotions.push({ item: it, dist, priority: 2 });
                    else consumables.push({ item: it, dist, priority: 6 });
                }
            } else if (it.name === CONSUMABLE_NAME.TOWN_PORTAL && player.autoPickup.scroll && dist < 400) {
                consumables.push({ item: it, dist, priority: 6 });
            } else if (it.rarity >= 2 && dist < 300 && !inventoryFull) {
                normalItems.push({ item: it, dist, priority: 7 });
            }
        }

        // 优先级决断逻辑
        let bestCandidate = null;
        const candidates = [...setItems, ...urgentPotions, ...uniqueItems, ...goldItems, ...consumables, ...normalItems];
        if (candidates.length > 0) {
            candidates.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
            bestCandidate = candidates[0].item;
            bestCandidate.prioValue = candidates[0].priority;
        }

        // 激烈战斗判定
        const pX = player.x, pY = player.y;
        const inHeavyCombat = enemies.some(e => {
            if (e.dead) return false;
            const dx = e.x - pX, dy = e.y - pY;
            return dx * dx + dy * dy < 6400; // 80^2 = 6400
        });

        // 如果当前已有目标，检查是否需要切换
        if (player.targetItem) {
            const oldExists = groundItems.includes(player.targetItem);
            const oldPrio = player.targetItem.prioValue || 99;
            const oldDist = Math.hypot(player.targetItem.x - player.x, player.targetItem.y - player.y);

            // 切换条件：旧目标消失，或新目标优先级更高，或同优先级但距离近50%以上
            const shouldSwitch = !oldExists ||
                (bestCandidate && bestCandidate.prioValue < oldPrio) ||
                (bestCandidate && bestCandidate.prioValue === oldPrio && bestCandidate.dist < oldDist * 0.5);

            if (shouldSwitch) {
                // 切换到新目标
                player.targetItem = null;
            } else {
                // 保持旧目标，除非旧目标在激烈战斗中且不够重要
                if (inHeavyCombat && oldPrio > 3 && Math.hypot(player.targetItem.x - player.x, player.targetItem.y - player.y) > 100) {
                    player.targetItem = null; // 战斗中暂缓低优先级拾取
                } else {
                    // 保持旧目标，但需要持续更新路径点（用于 A* 寻路）
                    const item = player.targetItem;
                    if (this.hasCachedLineOfSightTo(item)) {
                        player.targetX = item.x;
                        player.targetY = item.y;
                    } else {
                        const pathPoint = this.findPathToTarget(item.x, item.y, item);
                        if (pathPoint) {
                            player.targetX = pathPoint.x;
                            player.targetY = pathPoint.y;
                        } else {
                            // 找不到路，放弃
                            this.blacklistedTargets.push({ target: item, until: Date.now() + 30000 });
                            player.targetItem = null;
                            player.targetX = null;
                            player.targetY = null;
                        }
                    }
                    return;
                }
            }
        }

        // 选择最合适的捡取目标
        let selected = bestCandidate;
        if (selected && inHeavyCombat) {
            // 激烈战斗中，只允许捡套装(1)、紧急药水(2)或已经在脚下的东西
            if (selected.prioValue > 2 && Math.hypot(selected.x - player.x, selected.y - player.y) > 150) {
                selected = null;
            }
        }

        if (selected) {
            if (inventoryFull && selected.rarity >= 3) {
                this.dropLowestValueItem(selected.rarity);
            }

            // 检查是否有视线，决定移动方式
            if (this.hasCachedLineOfSightTo(selected)) {
                // 有视线，直接走过去
                player.targetItem = selected;
                player.targetX = selected.x;
                player.targetY = selected.y;
            } else {
                // 没有视线，使用 A* 寻路
                const pathPoint = this.findPathToTarget(selected.x, selected.y, selected);
                if (pathPoint) {
                    player.targetItem = selected;
                    player.targetX = pathPoint.x;
                    player.targetY = pathPoint.y;
                } else {
                    // A* 找不到路，放弃这个物品，加入黑名单 30 秒
                    this.blacklistedTargets.push({ target: selected, until: Date.now() + 30000 });
                    player.targetItem = null;
                    player.targetX = null;
                    player.targetY = null;
                }
            }
            selected.prioValue = selected.prioValue; // 记录优先级用于下次对比
        }
    },

    // 丢弃背包中最低价值物品（用于给更高稀有度的物品腾位）
    dropLowestValueItem(targetRarity) {
        let lowestIdx = -1, lowestVal = Infinity;
        for (let i = 0; i < player.inventory.length; i++) {
            const it = player.inventory[i];
            if (!it) continue;
            // 药水、卷轴不丢
            if (it.type === 'potion' || it.type === 'scroll') continue;
            // 只有比目标稀有度低的物品才会被丢弃
            if (it.rarity < targetRarity) {
                const val = (it.rarity || 0) * 1000 + (it.def || 0) + (it.minDmg || 0);
                if (val < lowestVal) { lowestVal = val; lowestIdx = i; }
            }
        }
        if (lowestIdx >= 0) {
            const item = player.inventory[lowestIdx];
            player.inventory[lowestIdx] = null;
            groundItems.push({ ...item, x: player.x, y: player.y, dropTime: Date.now() });
            createFloatingText(player.x, player.y - 40, `丢弃 ${item.name}`, '#888', 1.5);
            return true;
        }
        return false;
    },
};

// 自动拾取设置切换
function toggleAutoPickup(itemType) {
    let checkbox = null;
    if (itemType === 'gold') checkbox = cachedUI.chkAutoGold;
    else if (itemType === 'potion') checkbox = cachedUI.chkAutoPotion;
    else if (itemType === 'scroll') checkbox = cachedUI.chkAutoScroll;

    if (!checkbox) return;
    player.autoPickup[itemType] = checkbox.checked;
    SaveSystem.save();
    showNotification(`自动拾取${itemType === 'gold' ? '金币' : itemType === 'potion' ? '药水' : '卷轴'}：${checkbox.checked ? '开启' : '关闭'}`);
}
