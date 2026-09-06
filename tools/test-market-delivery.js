const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = { console, Set, Date, Math, player: { gold: 100, inventory: [null, null] },
  OnlineSystem: { userId: 'buyer', nickname: '测试' },
  SaveSystem: { save: async () => true }, showNotification() {}, updateStats() {}, renderInventory() {},
  document: { getElementById: () => null }, pb: { send: async (url, options) => {
    if (url.endsWith('/protocol')) return { version: 2 };
    context.player.inventory[0] = { id: 'loot' };
    return { ok: true, requestId: options.body.requestId, item: { id: 'bought' }, totalPrice: 11 };
  } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('market.js', 'utf8') + '\nglobalThis.market = MarketSystem;', context);
context.market.closeViewPanel = () => {};
context.market.loadStalls = () => {};
(async () => {
  await context.market.tryServerPurchase({ id: 'stall' }, { item: { id: 'bought' }, price: 10 }, 0, 11, 0);
  assert.equal(context.player.inventory[0].id, 'loot', '网络等待期间拾取物品不可被覆盖');
  assert.equal(context.player.inventory[1].id, 'bought');
  assert.equal(context.player.gold, 89);
  console.log('PASS 市场异步交付不会覆盖新拾取物品');
  context.player = { gold: 100, inventory: [null] };
  let savedState;
  context.SaveSystem.save = async () => { savedState = structuredClone(context.player); return true; };
  let attempts = 0;
  let requestId;
  context.pb.send = async (url, options) => {
    if (url.endsWith('/protocol')) return { version: 2 };
    attempts++;
    if (!requestId) requestId = options.body.requestId;
    assert.equal(options.body.requestId, requestId);
    assert.equal(savedState.gold, 89, '发送前已保存预扣款');
    if (attempts === 1) throw new Error('模拟成交后响应丢失');
    return { ok: true, requestId, item: { id: 'recovered' }, totalPrice: 11 };
  };
  await context.market.tryServerPurchase({ id: 'stall' }, { item: { id: 'recovered' }, price: 10 }, 0, 11);
  assert.equal(context.player.gold, 89);
  assert.equal(context.player.marketPending.applied, false);
  context.player = structuredClone(savedState); // 模拟关闭浏览器再加载存档
  context.player.inventory[0] = { id: 'new-loot' };
  await context.market.recoverPendingTransactions();
  assert.equal(context.player.inventory[0].id, 'new-loot');
  assert.equal(context.player.marketPending.applied, false, '满背包保留收据请求');
  context.player.inventory[0] = null;
  await context.market.recoverPendingTransactions();
  assert.equal(context.player.inventory[0].id, 'recovered');
  assert.equal(context.player.gold, 89);
  context.player = structuredClone(savedState);
  await context.market.recoverPendingTransactions();
  assert.equal(context.player.gold, 89);
  assert.equal(context.player.inventory.filter(Boolean).length, 1);
  assert.equal(attempts, 3, '已交付存档重载不应再次请求');
  console.log('PASS 响应丢失、重启、满包补领、重复恢复');

  context.player = { gold: 100, inventory: [null] };
  context.SaveSystem.save = async () => false;
  attempts = 0;
  context.pb.send = async url => { if (url.endsWith('/protocol')) return { version: 2 }; attempts++; };
  await context.market.tryServerPurchase({ id: 'stall' }, { item: { id: 'x' }, price: 10 }, 0, 11);
  assert.equal(attempts, 0);
  assert.equal(context.player.gold, 100);
  assert.equal(context.player.marketPending, undefined);
  console.log('PASS 预扣款保存失败不发起成交');

  context.SaveSystem.save = async () => true;
  context.pb.send = async (url, options) => {
    if (url.endsWith('/protocol')) return { version: 2 };
    context.SaveSystem.save = async () => false;
    return { ok: true, requestId: options.body.requestId, totalGold: 50, claimedCount: 1 };
  };
  await context.market.tryServerClaimSales([{ id: 'sale' }]);
  assert.equal(context.player.gold, 150);
  assert.equal(context.player.marketPending.applied, true);
  context.SaveSystem.save = async () => true;
  await context.market.recoverPendingTransactions();
  assert.equal(context.player.gold, 150, '保存重试不能重复领取收益');
  assert.equal(context.player.marketPending, undefined);
  console.log('PASS 收益到账后保存失败重试不重复加钱');

  context.pb.send = async () => { throw { status: 404 }; };
  await context.market.tryServerPurchase({ id: 'stall' }, { item: { id: 'x' }, price: 10 }, 0, 11);
  assert.equal(context.player.gold, 150);
  assert.equal(context.player.marketPending, undefined);
  console.log('PASS 未安装新版服务禁止旧路径成交');
})().catch(error => { console.error(error); process.exitCode = 1; });
