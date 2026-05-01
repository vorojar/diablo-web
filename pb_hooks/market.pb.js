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

routerAdd("POST", "/api/market/purchase", function (e) {
  try {
    var body = e.requestInfo().body || {};
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
      var stall = txApp.findRecordById("market_stalls", stallId);
      var sellerId = String(stall.get("user_id") || "");
      if (!sellerId) abortMarket(409, "invalid_stall", "摊位数据异常");
      if (sellerId === buyerId) abortMarket(400, "own_stall", "不能购买自己的商品");

      var items = readJsonArray(stall.get("items"));
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
    });

    return e.json(200, result);
  } catch (err) {
    return handleMarketError(e, err, "purchase_failed");
  }
});

routerAdd("POST", "/api/market/claim-sales", function (e) {
  try {
    var body = e.requestInfo().body || {};
    var sellerId = String(body.sellerId || "");
    var saleIds = Array.isArray(body.saleIds) ? body.saleIds : [];

    if (!sellerId || saleIds.length === 0) {
      abortMarket(400, "invalid_request", "领取请求不完整");
    }

    var result = { ok: true, totalGold: 0, claimedCount: 0 };

    $app.runInTransaction(function (txApp) {
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
    });

    return e.json(200, result);
  } catch (err) {
    return handleMarketError(e, err, "claim_failed");
  }
});
