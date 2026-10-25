const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../extension/order-links-core.js');
const orderId='10-00000-00001',amazonOrderId='112-1234567-1234567';
test('the note identifies TIFF without mistaking its ETA for a purchase date',()=>{
  assert.equal(C.profileFromNote('29.69 - 24.99 - TIFF - 10/4'),'TIFF');
  const context=C.context({orderId,notes:['29.69 - 24.99 - TIFF - 10/4'],skus:[btoa('B012345678')]});
  assert.equal(context.profileLabel,'TIFF');assert.deepEqual(context.asins,['B012345678']);assert.equal(context.purchaseDate,undefined);
});
test('multiple note profiles are not silently resolved',()=>{
  assert.throws(()=>C.context({orderId,notes:['1 - 2 - TIFF - 10/4','1 - 2 - M8 - 10/4']}),/different Amazon profiles/);
  assert.equal(C.context({orderId,notes:['unstructured manual note']}).profileLabel,'');
});
test('exact order and allowed website identities exclude demo and lookalikes',()=>{
  assert.equal(C.ebayId(orderId),orderId);assert.equal(C.ebayId('x'+orderId),'');assert.equal(C.amazonId(amazonOrderId),amazonOrderId);
  assert.equal(C.ebayPage('https://www.ebay.com/rtn/Return/123'),true);assert.equal(C.ebayPage('https://www.ebay.com/mesh/ord/details?orderid='+orderId),true);
  for(const url of ['https://ebay.com.evil.test/rtn/Return/1','http://ebay.com/rtn/Return/1','https://ebay.com/itm/123'])assert.equal(C.ebayPage(url),false);
  assert.equal(C.trackerPage('https://app.trackerbot.me/home'),true);assert.equal(C.trackerPage('https://app.trackerbot.me/demo/home'),false);assert.equal(C.trackerPage('https://app.trackerbot.me.evil.test/home'),false);
});
test('Trackerbot matches the eBay ID rather than the item, recipient, tracking or another order',()=>{
  const row={orderId,amazonOrderId,supplier:'AMAZON',supplierEmail:'tiff@example.com'};
  assert.equal(C.trackerMatch([{...row,orderId:'10-15243-00000'},row],orderId).amazonOrderId,amazonOrderId);
  assert.equal(C.trackerMatch([{...row,supplier:'Walmart'}],orderId),null);
  assert.equal(C.trackerMatch([{...row,amazonOrderId:'not captured'}],orderId),null);
  assert.throws(()=>C.trackerMatch([{...row,supplier:'AMAZONUK'}],orderId),/not a supported/);
  assert.throws(()=>C.trackerMatch([row],''),/exact/);
});
test('split or conflicting supplier orders require review while repeated shipment rows deduplicate',()=>{
  const row={orderId,amazonOrderId,supplier:'Amazon',supplierEmail:'tiff@example.com'};
  assert.equal(C.trackerMatch([row,row],orderId).amazonOrderId,amazonOrderId);
  assert.throws(()=>C.trackerMatch([row,{...row,amazonOrderId:'112-0000000-1234567'}],orderId),/multiple/);
  assert.throws(()=>C.trackerMatch([row,{...row,supplierEmail:'other@example.com'}],orderId),/multiple/);
});
test('local mappings join note labels and supplier emails without falling back to the current profile',()=>{
  const mappings=[{label:'TIFF',supplierEmail:'tiff@example.com',profileDirectory:'Profile 7'},{label:'M8',supplierEmail:'m8@example.com',profileDirectory:'Profile 8'}];
  assert.equal(C.chooseMapping(mappings,' tiff ','TIFF@example.com').profileDirectory,'Profile 7');
  assert.equal(C.chooseMapping(mappings,'','tiff@example.com').label,'TIFF');
  assert.equal(C.chooseMapping(mappings,'unknown',''),null);
  assert.throws(()=>C.chooseMapping(mappings,'TIFF','m8@example.com'),/differs|different/);
  assert.throws(()=>C.chooseMapping(mappings,'TIFF','unknown@example.com'),/differs/);
});
