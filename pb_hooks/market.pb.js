// 每个路由在独立 JSVM 上下文执行，公共逻辑通过模块显式加载。
routerAdd("GET", "/api/market/protocol", function (e) {
  return require(__hooks + "/market-lib.js").protocol(e);
});
routerAdd("POST", "/api/market/purchase", function (e) {
  return require(__hooks + "/market-lib.js").purchase(e);
});
routerAdd("POST", "/api/market/claim-sales", function (e) {
  return require(__hooks + "/market-lib.js").claimSales(e);
});
