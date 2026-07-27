const test = require("node:test");
const assert = require("node:assert/strict");

const audit = require("../extension/profit-audit.js");

const NOW = Date.parse("2026-07-14T12:00:00.000Z");
const ORDER_ID = "113-2518790-9385867";
const ORDER_URL = `https://www.amazon.com/your-orders/order-details?orderID=${ORDER_ID}`;

function ebayOrder(asins = ["B09Z61G77L"]) {
  return {
    orderNumber: "18-14818-27804",
    skus: ["QjA5WjYxRzc3TA=="],
    asins
  };
}

function amazonPayload(asins = ["B09Z61G77L"]) {
  return {
    version: 4,
    source: "amazon",
    total: 7.17,
    asins,
    orderId: ORDER_ID,
    orderIds: [ORDER_ID],
    exactOrderDetails: true,
    evidenceSource: "amazon-order-details-card",
    capturedAt: new Date(NOW - 30_000).toISOString(),
    url: ORDER_URL
  };
}

test("accepts one exact eBay SKU ASIN and verified Amazon order card", () => {
  const result = audit.validateAmazonPayloadForEbayOrder(amazonPayload(), ebayOrder(), { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.total, 7.17);
  assert.equal(result.supplierAudit.supplierItemIds, "B09Z61G77L");
  assert.equal(result.supplierAudit.supplierOrderNumber, ORDER_ID);
  assert.equal(result.supplierAudit.supplierMatchSource, "amazon-order-details-card");
  assert.equal(result.supplierAudit.supplierPageUrl, ORDER_URL);
  const evidence = JSON.parse(result.supplierAudit.supplierItemEvidence);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].asin, "B09Z61G77L");
  assert.equal(evidence[0].orderTotal, 7.17);
});

test("rejects a mismatched or extra Amazon ASIN", () => {
  const mismatch = audit.validateAmazonPayloadForEbayOrder(
    amazonPayload(["B000000001"]),
    ebayOrder(),
    { now: NOW }
  );
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /do not exactly match/i);

  const extra = audit.validateAmazonPayloadForEbayOrder(
    amazonPayload(["B09Z61G77L", "B000000001"]),
    ebayOrder(),
    { now: NOW }
  );
  assert.equal(extra.ok, false);
  assert.match(extra.error, /do not exactly match/i);
});

test("rejects missing SKU evidence, a changed order URL, and stale capture", () => {
  assert.equal(audit.validateAmazonPayloadForEbayOrder(amazonPayload(), {
    orderNumber: "18-14818-27804",
    skus: [],
    asins: []
  }, { now: NOW }).ok, false);

  const changedUrl = amazonPayload();
  changedUrl.url = "https://www.amazon.com/your-orders/order-details?orderID=111-1111111-1111111";
  assert.equal(audit.validateAmazonPayloadForEbayOrder(changedUrl, ebayOrder(), { now: NOW }).ok, false);

  const stale = amazonPayload();
  stale.capturedAt = new Date(NOW - (3 * 60 * 60 * 1000)).toISOString();
  assert.equal(audit.validateAmazonPayloadForEbayOrder(stale, ebayOrder(), { now: NOW }).ok, false);
});

test("rejects unverified Amazon page evidence even when price and ASIN match", () => {
  const payload = amazonPayload();
  payload.exactOrderDetails = false;
  payload.evidenceSource = "amazon-checkout";
  const result = audit.validateAmazonPayloadForEbayOrder(payload, ebayOrder(), { now: NOW });
  assert.equal(result.ok, false);
  assert.match(result.error, /verified order-details card/i);
});
