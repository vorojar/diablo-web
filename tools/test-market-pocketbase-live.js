// 仅连接本脚本启动的回环地址服务；独立临时数据库，不调用线上市场。
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const [binary, outputDirectory] = process.argv.slice(2);
if (!binary || !outputDirectory) throw new Error('用法：node tools/test-market-pocketbase-live.js <pocketbase.exe> <独立验收目录>');
const root = path.resolve(outputDirectory);
const source = path.resolve(__dirname, '..');
if (fs.existsSync(path.join(root, 'pb_data'))) throw new Error('验收目录已存在数据库，请指定全新的隔离目录');
fs.mkdirSync(root, { recursive: true });
for (const folder of ['pb_hooks', 'pb_migrations']) fs.mkdirSync(path.join(root, folder), { recursive: true });
for (const file of ['market.pb.js', 'market-lib.js']) fs.copyFileSync(path.join(source, 'pb_hooks', file), path.join(root, 'pb_hooks', file));
fs.copyFileSync(path.join(source, 'pb_migrations/1788652800_market_receipts.js'), path.join(root, 'pb_migrations/1788652800_market_receipts.js'));
const fixture = `migrate(function(app) {
  app.save(new Collection({ name: 'market_stalls', type: 'base', fields: [
    { name: 'user_id', type: 'text' }, { name: 'items', type: 'json' }
  ] }));
  app.save(new Collection({ name: 'market_sales', type: 'base', fields: [
    { name: 'seller_id', type: 'text' }, { name: 'buyer_id', type: 'text' },
    { name: 'buyer_name', type: 'text' }, { name: 'item_name', type: 'text' },
    { name: 'price', type: 'number' }, { name: 'claimed', type: 'bool' }
  ] }));
  for (var i = 1; i <= 3; i++) {
    var stall = new Record(app.findCollectionByNameOrId('market_stalls'));
    stall.set('id', 'qastall0000000' + i);
    stall.set('user_id', 'qa-seller');
    stall.set('items', [{ item: { id: 'sword', name: '验收铁剑' }, price: 10 }]);
    app.save(stall);
  }
}, function() {});`;
fs.writeFileSync(path.join(root, 'pb_migrations/1788652700_qa_fixture.js'), fixture);
fs.writeFileSync(path.join(root, 'pb_hooks/qa-fixture.pb.js'), `
onRecordCreate(function(e) {
  if (String(e.record.get('request_id')).indexOf('qa-rollback') === 0) throw new Error('QA 注入收据保存失败');
  e.next();
}, 'market_receipts');
routerAdd('GET', '/api/qa/state', function(e) {
  var collections = ['market_stalls', 'market_sales', 'market_receipts'];
  var state = {};
  for (var i = 0; i < collections.length; i++) {
    state[collections[i]] = $app.findRecordsByFilter(collections[i], '', '', 100, 0);
  }
  return e.json(200, state);
});`);
const records = [];
records.push({ version: execFileSync(path.resolve(binary), ['--version'], { windowsHide: true, encoding: 'utf8' }).trim() });
let child;
const log = fs.openSync(path.join(root, 'pocketbase.log'), 'a');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const port = await new Promise(resolve => {
    const listener = net.createServer();
    listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(() => resolve(port)); });
  });
  const url = `http://127.0.0.1:${port}`;
  child = spawn(path.resolve(binary), ['serve', `--http=127.0.0.1:${port}`, `--dir=${path.join(root, 'pb_data')}`, `--hooksDir=${path.join(root, 'pb_hooks')}`, `--migrationsDir=${path.join(root, 'pb_migrations')}`], { cwd: root, windowsHide: true, stdio: ['ignore', log, log] });
  child.on('error', error => { console.error(error); });
  const request = async (endpoint, body) => {
    const response = await fetch(url + endpoint, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    records.push({ endpoint, requestId: body?.requestId, status: response.status, data });
    return { status: response.status, data };
  };
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`PocketBase 已退出：${child.exitCode}`);
    try { if ((await fetch(url + '/api/health')).ok) { ready = true; break; } } catch {}
    await delay(150);
  }
  assert.ok(ready, '隔离 PocketBase 启动失败');
  assert.equal((await request('/api/market/protocol')).data.version, 2);
  assert.equal((await request('/api/collections/market_receipts/records')).status, 403, '收据集合不应开放列表');
  const purchase = { requestId: 'qa-buy-0000000001', buyerId: 'qa-buyer', buyerName: '验收买家', stallId: 'qastall00000001', itemId: 'sword', itemIndex: 0, expectedPrice: 10, expectedTotal: 11 };
  const bought = await request('/api/market/purchase', purchase);
  assert.equal(bought.status, 200, JSON.stringify(bought));
  assert.equal(bought.data.item.name, '验收铁剑');
  assert.deepEqual(await request('/api/market/purchase', Object.fromEntries(Object.entries(purchase).reverse())), bought);
  assert.equal((await request('/api/market/purchase', { ...purchase, expectedTotal: 12 })).status, 409);
  assert.equal((await request('/api/market/purchase', { ...purchase, buyerId: 'qa-other' })).status, 409);
  const claim = { requestId: 'qa-claim-00000001', sellerId: 'qa-seller', saleIds: [bought.data.saleId] };
  const claimed = await request('/api/market/claim-sales', claim);
  assert.equal(claimed.status, 200);
  assert.equal(claimed.data.totalGold, 10);
  assert.deepEqual(await request('/api/market/claim-sales', claim), claimed);
  assert.equal((await request('/api/market/claim-sales', { ...claim, requestId: 'qa-claim-00000002' })).data.totalGold, 0);
  const beforeRollback = (await request('/api/qa/state')).data;
  const failed = await request('/api/market/purchase', { ...purchase, requestId: 'qa-rollback-0001', stallId: 'qastall00000002' });
  assert.equal(failed.status, 500);
  const afterRollback = (await request('/api/qa/state')).data;
  assert.deepEqual(afterRollback, beforeRollback, '收据写入失败后数据库必须完全回滚');
  const race = await Promise.all(['a', 'b'].map(suffix => request('/api/market/purchase', { ...purchase, requestId: 'qa-race-0000000' + suffix, buyerId: 'qa-racer-' + suffix, stallId: 'qastall00000003' })));
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
  const finalState = (await request('/api/qa/state')).data;
  assert.equal(finalState.market_sales.length, 2);
  assert.equal(finalState.market_stalls.length, 1);
  records.push({ result: 'PASS', pid: child.pid, url, cases: ['migration', 'isolated-hook-require', 'purchase', 'receipt-replay', 'parameter-mismatch', 'identity-mismatch', 'claim', 'claim-replay', 'rollback', 'concurrent-last-item'] });
  console.log('PASS 真实隔离 PocketBase：迁移、购买、重放、409、收益、回滚、并发抢购');
})().catch(error => { records.push({ result: 'FAIL', error: error.stack }); console.error(error); process.exitCode = 1; }).finally(async () => {
  if (child && child.exitCode === null) {
    const stopped = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await stopped;
  }
  records.push({ cleanup: '测试进程已停止', pid: child?.pid, exitCode: child?.exitCode });
  fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify(records, null, 2));
  fs.closeSync(log);
});
