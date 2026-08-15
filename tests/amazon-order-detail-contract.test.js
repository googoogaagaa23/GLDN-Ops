const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const amazonSource = fs.readFileSync(path.join(root, "extension/amazon.js"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Could not extract ${name}`);
}

function blockBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `${startMarker} is missing`);
  assert.notEqual(end, -1, `${endMarker} is missing`);
  return source.slice(start, end);
}

function parseDateToMD(raw) {
  const month = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3,
    april: 4, apr: 4, may: 5, june: 6, jun: 6, july: 7, jul: 7,
    august: 8, aug: 8, september: 9, sep: 9, sept: 9, october: 10, oct: 10,
    november: 11, nov: 11, december: 12, dec: 12
  };
  const match = String(raw || "").match(/([A-Za-z]+)\s+(\d{1,2})/);
  return match && month[match[1].toLowerCase()] ? `${month[match[1].toLowerCase()]}/${Number(match[2])}` : "";
}

function createParser() {
  const sandbox = {
    U: {
      moneyToNumber(value) {
        const parsed = Number(String(value || "").replace(/,/g, ""));
        return Number.isFinite(parsed) ? parsed : null;
      },
      parseDateToMD
    }
  };
  [
    "moneyValues",
    "asinFromAmazonProductHref",
    "parseEtaLine",
    "parseAmazonOrderDetailSnapshot"
  ].forEach((name) => vm.runInNewContext(extractFunction(amazonSource, name), sandbox));
  return sandbox.parseAmazonOrderDetailSnapshot;
}

test("exact order-detail snapshot ignores recommendation prices and ASINs", () => {
  const parse = createParser();
  const result = parse({
    pageOrderId: "113-2518790-9385867",
    cardOrderId: "113-2518790-9385867",
    summaryLines: [
      "Order Summary",
      "Item(s) Subtotal: $7.17",
      "Shipping & Handling: $0.00",
      "Grand Total: $7.17"
    ],
    productLinks: [{
      href: "https://www.amazon.com/dp/B09Z61G77L?ref_=ppx_hzod_title",
      text: "EZY DOSE Weekly (7-Day) Pill Organizer, Medicine Planner, Blue"
    }],
    statusLines: ["Delivered June 30", "Eligible through July 30, 2026"],
    shippingBlock: "Ed Dixon | Florence, SC",
    recommendationPrices: [19.96, 3925],
    recommendationLinks: [{
      href: "https://www.amazon.com/dp/B0UNRELATED",
      text: "Unrelated recommendation"
    }]
  });

  assert.equal(result.total, 7.17);
  assert.deepEqual([...result.asins], ["B09Z61G77L"]);
  assert.deepEqual([...result.etas], ["6/30"]);
  assert.equal(result.titles.length, 1);
  assert.match(result.titles[0], /EZY DOSE Weekly/);
  assert.equal(result.orderId, "113-2518790-9385867");
  assert.equal(result.exactOrderDetails, true);
});

test("order-detail snapshot rejects a card from a different order", () => {
  const parse = createParser();
  assert.equal(parse({
    pageOrderId: "113-2518790-9385867",
    cardOrderId: "111-1111111-1111111",
    summaryLines: ["Grand Total: $7.17"]
  }), null);
});

test("historical profit capture falls back to the Amazon order-detail purchase date", () => {
  const scoped = { innerText: "ORDER PLACED\nApril 12, 2026\nORDER TOTAL\n$9.99" };
  const sandbox = {
    document: {
      querySelector(selector) {
        return selector === "[data-component='orderDetails']" ? scoped : null;
      },
      body: { innerText: "Delivered April 15, 2026" }
    }
  };
  vm.runInNewContext(extractFunction(amazonSource, "amazonPurchaseDateFromText"), sandbox);
  vm.runInNewContext(extractFunction(amazonSource, "amazonPurchaseDateFromOrderDetail"), sandbox);
  assert.equal(sandbox.amazonPurchaseDateFromOrderDetail(), "April 12, 2026");

  const worker = blockBetween(
    amazonSource,
    "async function resumePoshmarkProfitBackfillWorker()",
    "function extractAmazonOrderDetailItemCost("
  );
  assert.match(worker, /purchaseDate: amazonPurchaseDateFromOrderDetail\(\) \|\| searchMatch\.purchaseDate/);
});

test("order-detail DOM collection stays inside the verified order card", () => {
  const collection = blockBetween(
    amazonSource,
    "function extractAmazonOrderDetailData()",
    "function extractShippingBlock()"
  );
  assert.match(collection, /const scope = findAmazonOrderDetailsCard\(pageOrderId\)/);
  assert.match(collection, /scope\.querySelector\("#od-subtotals"\)/);
  assert.match(collection, /scope\.querySelectorAll\("a\[href\*='\/dp\/'\], a\[href\*='\/gp\/product\/'\]"\)/);
  assert.doesNotMatch(collection, /document\.querySelectorAll\("a\[href\*='\/dp\/'\]/);
});

test("order-detail copy path never falls back to cached checkout data", () => {
  const copyFlow = blockBetween(amazonSource, "async function copyAmazonInfo()", "function renderStatus(");
  assert.match(copyFlow, /isAmazonOrderDetailsPage\(\) && !live\.exactOrderDetails/);
  assert.match(copyFlow, /No cached checkout data was used/);
  assert.match(copyFlow, /isAmazonOrderDetailsPage\(\)\s*\? live\.total/);
  assert.match(copyFlow, /isAmazonOrderDetailsPage\(\)\s*\? live\.asins/);
  assert.match(copyFlow, /isAmazonOrderDetailsPage\(\)\s*\? live\.shippingBlock/);
});

test("eBay clipboard payload carries exact Amazon supplier-order evidence", () => {
  const previewFlow = blockBetween(amazonSource, "function showAmazonPreview(", "async function copyAmazonInfo()");
  assert.match(previewFlow, /version: marketplaceContext \? 3 : 4/);
  assert.match(previewFlow, /orderId: orderIds\.length === 1 \? orderIds\[0\] : ""/);
  assert.match(previewFlow, /exactOrderDetails:/);
  assert.match(previewFlow, /evidenceSource:/);
  assert.match(previewFlow, /url: String\(orderEvidence\.url \|\| location\.href\)/);

  const copyFlow = blockBetween(amazonSource, "async function copyAmazonInfo()", "function renderStatus(");
  assert.match(copyFlow, /orderEvidence: live/);
});

test("reviewed Amazon evidence is saved before the optional clipboard handoff", () => {
  const previewFlow = blockBetween(amazonSource, "function showAmazonPreview(", "async function copyAmazonInfo()");
  const storageIndex = previewFlow.indexOf("await storageSet(updates)");
  const clipboardIndex = previewFlow.indexOf("await navigator.clipboard.writeText(clipboardText)");
  assert.ok(storageIndex >= 0, "reviewed payload storage is missing");
  assert.ok(clipboardIndex > storageIndex, "clipboard write must happen after durable extension storage");
  assert.match(previewFlow, /clipboardCopied = false/);
  assert.match(previewFlow, /Reviewed Amazon order data was saved inside GLDN Ops/);
});
