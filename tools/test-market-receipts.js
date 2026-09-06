const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const tables = { market_stalls: new Map(), market_sales: new Map(), market_receipts: new Map() };
let nextId = 1;
class TestRecord {
  constructor(collection) { this.collection = collection; this.id = `record${nextId++}`; this.fields = {}; }
  get(key) { return this.fields[key]; }
  getString(key) { const value = this.fields[key]; return typeof value === 'object' ? JSON.stringify(value) : String(value); }
  set(key, value) { this.fields[key] = value; }
}
const app = {
  findCollectionByNameOrId(name) { assert.ok(tables[name]); return name; },
  findRecordsByFilter(name, filter, sort, limit, offset, params) {
    return [...tables[name].values()].filter(record => (name === 'market_receipts' ? record.get('request_id') : record.id) === params.id);
  },
  findRecordById(name, id) { const record = tables[name].get(id); if (!record) throw new Error('missing record'); return record; },
  save(record) { tables[record.collection].set(record.id, record); },
  delete(record) { tables[record.collection].delete(record.id); },
  runInTransaction(callback) {
    const snapshot = Object.fromEntries(Object.entries(tables).map(([name, records]) => [name, [...records].map(([id, record]) => [id, structuredClone(record.fields)])]));
    try { callback(this); } catch (error) {
      for (const name of Object.keys(tables)) {
        tables[name].clear();
        for (const [id, fields] of snapshot[name]) { const record = new TestRecord(name); record.id = id; record.fields = fields; tables[name].set(id, record); }
      }
      throw error;
    }
  }
};
const context = vm.createContext({ console, Record: TestRecord, $app: app, module: { exports: {} } });
vm.runInContext(fs.readFileSync('pb_hooks/market-lib.js', 'utf8'), context);
const handlers = context.module.exports;
const call = (method, body) => handlers[method]({ requestInfo: () => ({ body }), json: (status, data) => ({ status, data }) });
const stall = new TestRecord('market_stalls');
stall.set('user_id', 'seller');
stall.set('items', [{ item: { id: 'sword', name: '剑' }, price: 10 }]);
app.save(stall);
const request = { requestId: 'request-buy-123456', stallId: stall.id, buyerId: 'buyer', buyerName: '买家', itemId: 'sword', expectedPrice: 10, expectedTotal: 11, itemIndex: 0 };
const first = call('purchase', request);
assert.equal(first.status, 200);
assert.equal(tables.market_stalls.size, 0);
assert.equal(tables.market_sales.size, 1);
assert.deepEqual(call('purchase', Object.fromEntries(Object.entries(request).reverse())), first, '请求字段顺序不影响收据匹配');
assert.equal(tables.market_receipts.size, 1);
const replay = call('purchase', structuredClone(request));
assert.deepEqual(replay, first, '摊位删除后重放仍返回原成交收据');
assert.equal(tables.market_sales.size, 1);
assert.equal(call('purchase', { ...request, buyerId: 'other' }).data.code, 'receipt_mismatch');
assert.equal(call('purchase', { ...request, expectedTotal: 12 }).data.code, 'receipt_mismatch');
assert.equal(call('purchase', { ...request, requestId: 'request-other-123' }).data.code, 'sold_out');
console.log('PASS 购买原子收据、重复请求、身份与参数绑定、售罄拒绝');
const claim = { requestId: 'request-claim-123', sellerId: 'seller', saleIds: [first.data.saleId] };
const claimed = call('claimSales', claim);
assert.equal(claimed.data.totalGold, 10);
assert.equal(claimed.data.claimedCount, 1);
assert.deepEqual(call('claimSales', structuredClone(claim)), claimed);
assert.equal(call('claimSales', { ...claim, requestId: 'request-claim-456' }).data.totalGold, 0);
assert.equal(call('claimSales', { ...claim, requestId: 'request-claim-789', sellerId: 'other' }).status, 403);
console.log('PASS 收益响应丢失重放原金额、不同请求不会再次领取');

const rollbackStall = new TestRecord('market_stalls');
rollbackStall.set('user_id', 'seller');
rollbackStall.set('items', [{ item: { id: 'sword', name: '剑' }, price: 10 }]);
app.save(rollbackStall);
const salesBefore = tables.market_sales.size;
const originalSave = app.save;
app.save = function (record) {
  if (record.collection === 'market_receipts') throw new Error('模拟收据写入失败');
  originalSave.call(this, record);
};
const failed = call('purchase', { ...request, requestId: 'request-rollback-123', stallId: rollbackStall.id });
assert.equal(failed.status, 500);
assert.equal(tables.market_sales.size, salesBefore);
assert.equal(tables.market_stalls.get(rollbackStall.id).get('items').length, 1);
app.save = originalSave;
console.log('PASS 收据写失败整笔事务回滚，不留孤立销售或丢失商品');

// 模拟 PocketBase 将路由序列化后放进隔离上下文运行。
const routes = [];
vm.runInNewContext(fs.readFileSync('pb_hooks/market.pb.js', 'utf8'), { routerAdd: (verb, path, handler) => routes.push(handler.toString()) });
for (const route of routes) {
  vm.runInNewContext(`(${route})(event)`, { __hooks: '/hooks', require: path => { assert.equal(path, '/hooks/market-lib.js'); return handlers; }, event: { requestInfo: () => ({ body: request }), json: (status, data) => ({ status, data }) } });
}
console.log('PASS Hook 路由不依赖外层词法上下文');
