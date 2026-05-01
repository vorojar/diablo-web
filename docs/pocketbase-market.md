# PocketBase 市场原子交易部署说明

## 目标

市场购买不能只靠浏览器读写 `market_stalls.items`，否则两个玩家并发购买同一件商品时会同时通过校验。现在客户端会优先调用 PocketBase Hook：

- `POST /api/market/purchase`
- `POST /api/market/claim-sales`

Hook 在 PocketBase 事务里完成摊位读取、商品校验、移除商品、创建销售记录或标记收益已领取。这样同一件商品只会被服务端成交一次。

## 部署

1. 将 `pb_hooks/market.pb.js` 放进线上 PocketBase 的 `pb_hooks` 目录。
2. 重启 PocketBase。
3. 保持前端文件里的 `market.js` 为当前版本；客户端会自动调用 Hook。

本地没有安装 Hook 时，前端会降级到旧购买路径，方便直接打开 `index.html` 调试。但线上发布必须安装 Hook，否则无法获得真正的并发原子性。

## 需要的集合字段

`market_stalls`

- `user_id` text
- `stall_name` text
- `nickname` text
- `stall_index` number
- `items` json
- `expires_at` date

`market_sales`

- `seller_id` text
- `buyer_id` text
- `buyer_name` text
- `item_name` text
- `price` number
- `claimed` bool

建议给 `market_sales.seller_id, claimed` 建索引，收益面板会频繁按这两个字段查询。

## 限制

当前游戏背包、金币仍以客户端存档为主，Hook 保证“摊位上的商品只能被卖出一次”和“销售收益只能领取一次”。如果后续要做到完整反作弊，需要把金币扣减、背包发货也迁移到服务端存档事务里。
