# PocketBase 市场收据与恢复部署

## 行为

客户端协议版本为 2。购买前把请求编号、商品参数与预扣金币写进同一份 IndexedDB 存档；存档失败不向服务端发起交易。服务端事务把商品移出摊位、创建销售记录和保存完整收据一次提交。响应丢失时重放同一个请求编号，返回原收据，不再次成交。收益领取也先存请求，再由服务端事务标记销售已领取并保存金额收据。

交付时重新寻找空背包格；网络等待期间新拾取的物品不会被覆盖。背包满则保留待交付请求；腾出空格后重开摊位、设置面板或收益面板即可恢复。游戏初始化也尝试恢复。物品/金币与“已交付”标记在同一存档事务中保存，保存失败重试不会在同一存档中重复到账。明确未成交的拒绝会返还预扣款；断网、超时、服务端 5xx 不擅自退款。

## 部署状态与步骤

本仓库提供实现、Node VM 行为测试和真实 PocketBase 隔离验收脚本。2026-09-06 已使用官方 **PocketBase v0.40.2 Windows amd64** 在回环地址、独立数据库完成真实联调，**未连接生产市场、未部署线上 Hook、未执行生产数据库迁移**。上线前仍须按目标服务版本和现有集合规则复验。

1. 备份 PocketBase 数据目录。确认版本支持现代 `Collection.fields` / `app.runInTransaction` API（沿用当前 Hook 的现代 API）。
2. 将 `pb_migrations/1788652800_market_receipts.js` 放进服务的 `pb_migrations` 目录，执行 `pocketbase migrate up`。
3. 同时复制 `pb_hooks/market.pb.js` 和 `pb_hooks/market-lib.js`。两者必须一起部署。
4. 重启 PocketBase，确认新进程和健康接口，再请求 `GET /api/market/protocol`，期望 `{"version":2}`。
5. 完成隔离环境验收后发布前端。未安装新版服务时客户端显示“市场升级中”，不会回退到不具备可靠交付的旧购买/领取路径。

路由通过 `require` 加载模块，以适应 PocketBase 每个 handler 的隔离上下文，见 [官方说明](https://pocketbase.io/docs/js-overview/#handlers-scope)。集合迁移语法见 [官方迁移文档](https://pocketbase.io/docs/js-migrations/)。

## 集合

既有 `market_stalls`：`user_id`、`stall_name`、`nickname`、`stall_index`、`items`（json）、`expires_at`（date）。既有 `market_sales`：`seller_id`、`buyer_id`、`buyer_name`、`item_name`、`price`、`claimed`。

迁移新增 `market_receipts`：`request_id`（text、唯一索引）、`kind`（text）、`request_body`（text，固定顺序的业务参数）、`response`（json）。所有集合 API 规则为 null，仅 Hook/管理员可读写收据。不要开放收据列表，也不要删除历史收据；离线存档中的请求可能尚未交付。迁移主动阻止删除收据的自动回滚。

## 验收

本地无依赖测试：

```powershell
node tools/test-market-delivery.js
node tools/test-market-receipts.js
```

真实服务验收脚本（第二个参数必须是不存在数据库的新目录，不会调用生产）：

```powershell
node tools/test-market-pocketbase-live.js <官方pocketbase.exe路径> <新隔离目录>
```

脚本复制当前迁移/Hook、建立测试集合、以隐藏进程监听随机回环端口，依次验证迁移、模块加载、协议握手、私有收据集合拒绝匿名列表（403）、购买、请求重放、身份/价格变更（409）、领取与重放、收据写入故障事务回滚、两位买家并发购买最后一件（一个 200、一个 409）。结束后自动停止测试进程，保留 `results.json` 与测试数据库供复核。

本轮真实测试发现并修复 `Record.get()` 返回 JSONRaw 字节导致商品误报售罄的问题：商品与收据改用 `getString()` 再解析，参见 [官方 Record API](https://pocketbase.io/docs/js-records/)。VM 测试补充对应接口。

2026-09-06 验收证据位于本轮会话产物目录 `qa-pocketbase/run-final/results.json`，记录版本、实际响应、并发结果和停止进程记录。真实服务验收全部通过；客户端覆盖满包补领、预扣存档失败、到账存档失败恢复和旧服务禁交易的 VM 测试也全部通过。生产上的账号权限、现有数据兼容与前后端联合升级仍需部署时验证。

## 保证范围

这是单浏览器、单角色存档的故障恢复协议，不是完整服务端经济或认证体系。`buyerId`/`sellerId` 仍由既有在线系统提交，**不构成可信登录认证**；收据绑定原请求参数可防误用，但不解决伪造身份或客户端金币作弊。旧客户端仍能直接写集合时也不能承诺全市场并发安全，正式上线需统一升级并审计集合写入规则。

复制/回滚旧存档、跨设备并发打开同一角色、多标签页同时写同一存档、清除浏览器数据仍可能破坏本地资产一致性。要覆盖这些场景，需要把余额和背包归入可信服务端账户事务，超出本次修复范围。不要将本次结果宣传为完整反作弊或跨设备金融级一致性。
