const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function loadFoundation() {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "extension", "config.example.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(root, "extension", "foundation.js"), "utf8"), context);
  return context.GLDN_FOUNDATION;
}

test("Move .99 settings normalize the exact FAK12 configuration", () => {
  const result = loadFoundation().validateMove99Settings({
    sourceCategories: [" Not .99 ", "Other"],
    destinationCategory: " Abra Cadabra .99 ",
    sourceStoreCategoryIds: ["44678633011", "1"],
    backburnerItemIds: ["318521296686"]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.settings)), {
    sourceCategories: ["Not .99", "Other"],
    destinationCategory: "Abra Cadabra .99",
    sourceStoreCategoryIds: ["44678633011", "1"],
    backburnerItemIds: ["318521296686"]
  });
});

test("Move .99 settings reject duplicate or overlapping category names", () => {
  const foundation = loadFoundation();
  const duplicate = foundation.validateMove99Settings({
    sourceCategories: ["Not .99", "not .99"],
    destinationCategory: "Abra Cadabra .99"
  });
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.errors.join(" "), /duplicated/i);

  const overlap = foundation.validateMove99Settings({
    sourceCategories: ["Not .99", "Other"],
    destinationCategory: "other"
  });
  assert.equal(overlap.ok, false);
  assert.match(overlap.errors.join(" "), /cannot also be a source/i);
});

test("Move .99 settings reject malformed or duplicate IDs", () => {
  const result = loadFoundation().validateMove99Settings({
    sourceCategories: ["Not .99", "Other"],
    destinationCategory: "Abra Cadabra .99",
    sourceStoreCategoryIds: ["1", "1", "abc"],
    backburnerItemIds: ["318521296686", "318521296686", "12"]
  });
  assert.equal(result.ok, false);
  const message = result.errors.join(" ");
  assert.match(message, /digits only/i);
  assert.match(message, /category ID .*duplicated/i);
  assert.match(message, /not a valid eBay item number/i);
  assert.match(message, /Backburner item ID .*duplicated/i);
});

test("popup, backup restore, and both Move .99 runtimes use the shared validator", () => {
  const popup = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
  const starter = fs.readFileSync(path.join(root, "extension", "start-move99.js"), "utf8");
  const background = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
  const ebay = fs.readFileSync(path.join(root, "extension", "ebay.js"), "utf8");
  assert.match(popup, /function normalizeMove99BackupAccounts/);
  assert.match(popup, /Saved and verified \.99 categories/);
  assert.ok((popup.match(/FOUNDATION\.validateMove99Settings/g) || []).length >= 2);
  assert.match(starter, /type:\s*'startMove99Workflow'[\s\S]*?scanMode[\s\S]*?saleEventStatus/);
  assert.match(popup, /type:\s*'startMove99Workflow'[\s\S]*?scanMode[\s\S]*?saleEventStatus/);
  assert.match(background, /FOUNDATION\.validateMove99Settings\(settings\)/);
  assert.match(ebay, /FOUNDATION\.validateMove99Settings\(merged\)/);
});

test("eBay panel exposes settings-only Store category validation and backup", () => {
  const ebay = fs.readFileSync(path.join(root, "extension", "ebay.js"), "utf8");
  assert.match(ebay, /dataset\.action = "store-category-settings"/);
  assert.match(ebay, /Store Category Settings/);
  assert.match(ebay, /This screen cannot move or revise listings/);
  assert.match(ebay, /Save and Verify/);
  assert.match(ebay, /gldn-move99-category-backup/);
  assert.match(ebay, /Restored and verified Store categories/);
  assert.ok((ebay.match(/FOUNDATION\.validateMove99Settings/g) || []).length >= 3);
});

test("Store category saves use plain records and verify normalized Chrome storage readback", () => {
  const popup = fs.readFileSync(path.join(root, "extension", "popup.js"), "utf8");
  const ebay = fs.readFileSync(path.join(root, "extension", "ebay.js"), "utf8");
  for (const source of [popup, ebay]) {
    assert.match(source, /JSON\.parse\(JSON\.stringify\(validation\.settings|JSON\.parse\(JSON\.stringify\(settings/);
    assert.match(source, /savedValidation = FOUNDATION\.validateMove99Settings\(saved \|\| \{\}\)/);
    assert.match(source, /chrome\.runtime\.lastError/);
  }
});
