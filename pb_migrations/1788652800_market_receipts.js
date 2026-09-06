// 仅创建交易收据集合，不改现有摊位与销售记录。
migrate(function (app) {
  app.save(new Collection({
    name: 'market_receipts', type: 'base',
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'request_id', type: 'text', required: true, max: 200 },
      { name: 'kind', type: 'text', required: true, max: 20 },
      { name: 'request_body', type: 'text', required: true, max: 1000000 },
      { name: 'response', type: 'json', required: true, maxSize: 2000000 }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_market_receipt_request ON market_receipts (request_id)']
  }));
}, function () {
  // 收据删除会破坏未交付交易的恢复，不允许自动回滚销毁。
  throw new Error('交易收据必须保留；请通过前滚修复市场版本');
});
