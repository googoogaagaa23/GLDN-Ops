const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../dashboard/tasks-automation/Timestamps.gs'), 'utf8');

function fixture(name = 'Tasks') {
  const cells = new Map();
  const at = (r,c) => {
    const key = `${r}:${c}`;
    if (!cells.has(key)) cells.set(key, {value:'',note:'',formula:'',checkbox:false});
    return cells.get(key);
  };
  const sheet = {getName:()=>name, getLastRow:()=>60, getParent:()=>({getSpreadsheetTimeZone:()=> 'America/Chicago'})};
  sheet.getRange = (row,col,rows=1,cols=1) => {
    const matrix = field => Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>at(row+r,col+c)[field]));
    const range = {
      getSheet:()=>sheet, getRow:()=>row, getColumn:()=>col, getCell:(r,c)=>sheet.getRange(row+r-1,col+c-1),
      getValues:()=>matrix('value'), getFormulas:()=>matrix('formula'), getValue:()=>at(row,col).value,
      getDisplayValues:()=>matrix('value').map(r=>r.map(String)), getDisplayValue:()=>String(at(row,col).value),
      getDataValidations:()=>matrix('checkbox').map(r=>r.map(v=>v?{getCriteriaType:()=> 'checkbox'}:null)),
      getNote:()=>at(row,col).note,
      setNote:v=>{at(row,col).note=v;return range;}, clearNote:()=>{at(row,col).note='';return range;},
      setBackground:()=>range, setValue:v=>{at(row,col).value=v;return range;}
    };
    return range;
  };
  at(15,4).value='Check Performance of Each Store and Check Late Shipment Rate';
  ['Transaction Defect Rate','Late Shipment Rate | Must be Below 3%:', 'Tracking Uploaded On Time & Validated:', 'Cases Closed without seller Resolution'].forEach((label,i)=>at(16+i,4).value=label);
  at(22,4).value='Active Listings';
  const api = {SpreadsheetApp:{DataValidationCriteria:{CHECKBOX:'checkbox'}}, Utilities:{formatDate:date=>date.toISOString()}, Date, Set};
  vm.createContext(api); vm.runInContext(source,api);
  const calls=[];
  ['updateSessionOnEdit','updateProgressCell','updateComputerTimestamp','evaluateAllAlerts','updateAutomationRowLastChecked','markMonthlyCellCompletedIfNeeded','logCheckboxEdit','updatePerformanceCheckboxFromMetrics_'].forEach(fn=>api[fn]=(...args)=>calls.push([fn,...args]));
  api.isAccountSnipedInputCell=()=>false;
  return {api,sheet,at,calls};
}

test('late shipment metric cannot match its parent checkbox',()=>{
  const {api,sheet}=fixture();
  assert.equal(api.findTaskRowByPrefix_(sheet,'Late Shipment Rate'),17);
  assert.equal(api.isManualPercentTrackingCell(sheet,15,5),false);
  assert.equal(api.isManualPercentTrackingCell(sheet,17,5),true);
});
test('pasted metric block stamps every edited computer cell, not only top left',()=>{
  const {api,sheet,at,calls}=fixture();
  for (let r=16;r<=19;r++) for(let c=5;c<=9;c++){at(r,c).value=0;at(r,c).note='Last checked: July\nOperator comment';}
  api.handleEdit({range:sheet.getRange(16,5,4,5)});
  for(let r=16;r<=19;r++) for(let c=5;c<=9;c++){
    assert.match(at(r,c).note,/^Value entered:/); assert.match(at(r,c).note,/Epoch: \d+/);
    assert.match(at(r,c).note,/Operator comment/); assert.doesNotMatch(at(r,c).note,/July/);
  }
  assert.equal(calls.filter(c=>c[0]==='updateSessionOnEdit').length,1);
  assert.equal(calls.filter(c=>c[0]==='updatePerformanceCheckboxFromMetrics_').length,5);
});
test('ordinary manual inputs are stamped while formulas and headers are untouched',()=>{
  const {api,sheet,at}=fixture();
  at(22,5).value=123; at(22,6).value=123;at(22,6).formula='=E22';at(22,6).note='formula';
  api.handleEdit({range:sheet.getRange(22,5,1,2)});
  assert.match(at(22,5).note,/^Value entered:/);assert.equal(at(22,6).note,'formula');
  at(3,5).value='M0'; api.handleEdit({range:sheet.getRange(3,5)});assert.equal(at(3,5).note,'');
});
test('checkbox paste stamps each check and unchecking preserves last completion epoch',()=>{
  const {api,sheet,at}=fixture();
  at(10,4).value='Mark All New Orders as Shipped';
  at(10,5).checkbox=true; at(10,5).value=true;
  at(10,6).checkbox=true; at(10,6).value=false; at(10,6).note='Last checked: old\nEpoch: 123';
  api.handleEdit({range:sheet.getRange(10,5,1,2)});
  assert.match(at(10,5).note,/^Last checked:/);
  assert.match(at(10,6).note,/^Last edited:/); assert.match(at(10,6).note,/\nEpoch: 123$/);
});
test('cleared metric loses its timestamp and archived tabs do not change',()=>{
  const {api,sheet,at}=fixture(); at(17,5).note='Last checked: old';
  api.handleEdit({range:sheet.getRange(17,5)});assert.equal(at(17,5).note,'');
  const archive=fixture('Tasks Snapshot');archive.at(17,5).value=0.1;
  archive.api.handleEdit({range:archive.sheet.getRange(17,5)}); assert.equal(archive.at(17,5).note,'');
});
test('ambiguous duplicate metric rows cannot silently stamp a different task',()=>{
  const {api,sheet,at}=fixture();at(33,4).value='Late Shipment Rate duplicate';
  assert.equal(api.findTaskRowByPrefix_(sheet,'Late Shipment Rate'),null);
});
