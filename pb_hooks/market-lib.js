// PocketBase JS hook: market purchase and sales claiming.
// Deploy by copying this file into the PocketBase `pb_hooks` directory and restarting PocketBase.

var MARKET_TAX_RATE = 0.05;

function readJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      var parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return [];
}

function abortMarket(status, code, message) {
  var err = new Error(message);
  err.status = status;
  err.code = code;
  throw err;
}

function normalizeAmount(value) {
  var amount = Number(value);
  if (!isFinite(amount)) return 0;
  return Math.max(0, Math.floor(amount));
}

function handleMarketError(e, err, fallbackCode) {
  var status = err.status || 500;
  var code = err.code || fallbackCode || "market_error";
  var message = err.message || "市场操作失败";
  return e.json(status, { ok: false, code: code, message: message });
}

// 收据仅允许 Hook 在事务内读写。request_id 必须有 UNIQUE 索引。
function receiptKey(body) {
  var key = String(body.requestId || "");
  if (key.length < 12 || key.length > 200) abortMarket(400, "invalid_request", "缺少交易请求编号");
  return key;
}

function receiptBody(body, kind) {
  // Go map 转入 JS 的属性顺序不稳定，使用固定字段顺序绑定业务参数。
  return JSON.stringify(kind === "purchase" ? [kind, body.buyerId, body.buyerName,
    body.stallId, body.itemId, body.itemIndex, body.expectedPrice, body.expectedTotal] :
    [kind, body.sellerId, body.saleIds]);
}

function readReceipt(app, body, kind) {
  var records = app.findRecordsByFilter("market_receipts", "request_id = {:id}", "", 1, 0, { id: receiptKey(body) });
  if (!records.length) return null;
  var receipt = records[0];
  if (receipt.get("kind") !== kind || receipt.get("request_body") !== receiptBody(body, kind)) {
    abortMarket(409, "receipt_mismatch", "请求编号与原交易不一致");
  }
  return JSON.parse(receipt.getString("response"));
}

function saveReceipt(app, body, kind, result) {
  result.requestId = receiptKey(body);
  var receipt = new Record(app.findCollectionByNameOrId("market_receipts"));
  receipt.set("request_id", result.requestId);
  receipt.set("kind", kind);
  receipt.set("request_body", receiptBody(body, kind));
  receipt.set("response", result);
  app.save(receipt);
}

function protocol(e) {
  try {
    $app.findCollectionByNameOrId("market_receipts");
    return e.json(200, { version: 2 });
  } catch (err) { return handleMarketError(e, err, "receipts_not_installed"); }
}

function purchase(e) {
  try {
    var body = e.requestInfo().body || {};
    receiptKey(body);
    var stallId = String(body.stallId || "");
    var buyerId = String(body.buyerId || "");
    var buyerName = String(body.buyerName || "匿名玩家").slice(0, 24);
    var expectedItemId = String(body.itemId || "");
    var expectedPrice = normalizeAmount(body.expectedPrice);
    var expectedTotal = normalizeAmount(body.expectedTotal);
    var itemIndex = parseInt(body.itemIndex, 10);

    if (!stallId || !buyerId || isNaN(itemIndex)) {
      abortMarket(400, "invalid_request", "购买请求不完整");
    }

    var result = null;

    $app.runInTransaction(function (txApp) {
      result = readReceipt(txApp, body, "purchase");
      if (result) return;
      var stalls = txApp.findRecordsByFilter("market_stalls", "id = {:id}", "", 1, 0, { id: stallId });
      if (!stalls.length) abortMarket(409, "sold_out", "商品已售出或摊位已关闭");
      var stall = stalls[0];
      var sellerId = String(stall.get("user_id") || "");
      if (!sellerId) abortMarket(409, "invalid_stall", "摊位数据异常");
      if (sellerId === buyerId) abortMarket(400, "own_stall", "不能购买自己的商品");

      // PocketBase JSON 字段的 get 返回 JSONRaw 字节，需显式转字符串再解析。
      var items = readJsonArray(stall.getString("items"));
      var slot = items[itemIndex];
      if (!slot || !slot.item) abortMarket(409, "sold_out", "商品已售出");

      var item = slot.item;
      var itemId = String(item.id || "");
      if (expectedItemId && itemId !== expectedItemId) {
        abortMarket(409, "sold_out", "商品已售出");
      }

      var price = normalizeAmount(slot.price);
      var totalPrice = price + Math.ceil(price * MARKET_TAX_RATE);
      if (price !== expectedPrice || totalPrice !== expectedTotal) {
        abortMarket(409, "price_changed", "商品价格已变化，请重新确认");
      }

      var finalItems = [];
      for (var i = 0; i < items.length; i++) {
        if (i !== itemIndex) finalItems.push(items[i]);
      }

      if (finalItems.length === 0) {
        txApp.delete(stall);
      } else {
        stall.set("items", finalItems);
        txApp.save(stall);
      }

      var salesCollection = txApp.findCollectionByNameOrId("market_sales");
      var sale = new Record(salesCollection);
      sale.set("seller_id", sellerId);
      sale.set("buyer_id", buyerId);
      sale.set("buyer_name", buyerName);
      sale.set("item_name", String(item.name || "商品"));
      sale.set("price", price);
      sale.set("claimed", false);
      txApp.save(sale);

      result = {
        ok: true,
        item: item,
        price: price,
        totalPrice: totalPrice,
        saleId: sale.id
      };
      saveReceipt(txApp, body, "purchase", result);
    });

    return e.json(200, result);
  } catch (err) {
    return handleMarketError(e, err, "purchase_failed");
  }
}

function claimSales(e) {
  try {
    var body = e.requestInfo().body || {};
    receiptKey(body);
    var sellerId = String(body.sellerId || "");
    var saleIds = Array.isArray(body.saleIds) ? body.saleIds : [];

    if (!sellerId || saleIds.length === 0) {
      abortMarket(400, "invalid_request", "领取请求不完整");
    }

    var result = { ok: true, totalGold: 0, claimedCount: 0 };

    $app.runInTransaction(function (txApp) {
      var existing = readReceipt(txApp, body, "claim-sales");
      if (existing) { result = existing; return; }
      for (var i = 0; i < saleIds.length; i++) {
        var sale = txApp.findRecordById("market_sales", String(saleIds[i]));
        if (String(sale.get("seller_id") || "") !== sellerId) {
          abortMarket(403, "forbidden", "只能领取自己的摊位收益");
        }
        if (sale.get("claimed") === true) continue;

        result.totalGold += normalizeAmount(sale.get("price"));
        result.claimedCount++;
        sale.set("claimed", true);
        txApp.save(sale);
      }
      saveReceipt(txApp, body, "claim-sales", result);
    });

    return e.json(200, result);
  } catch (err) {
    return handleMarketError(e, err, "claim_failed");
  }
}

module.exports = { protocol: protocol, purchase: purchase, claimSales: claimSales };
