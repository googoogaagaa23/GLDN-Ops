const test = require("node:test");
const assert = require("node:assert/strict");
const audit = require("../extension/profit-audit.js");

const NOW = Date.parse("2026-07-11T20:00:00.000Z");

function item(asin, cost, orderId = "114-1111111-2222222") {
  return {
    asin,
    cost,
    title: `Amazon item ${asin}`,
    orderId,
    orderUrl: `https://www.amazon.com/your-orders/order-details?orderID=${orderId}`,
    source: "amazon-order-detail-asin-row",
    capturedAt: "2026-07-11T19:59:00.000Z"
  };
}

function payload(orderNumber, asins, items, total) {
  return {
    version: 3,
    source: "amazon",
    total,
    items,
    capturedAt: "2026-07-11T19:59:00.000Z",
    marketplaceContext: {
      platform: "Poshmark",
      orderNumber,
      asins,
      linkedAt: "2026-07-11T19:59:00.000Z"
    }
  };
}

test("accepts one exact ASIN, Amazon order, and item cost", () => {
  const order = { orderNumber: "posh-1", asins: ["B012345678"] };
  const result = audit.validateAmazonPayloadForOrder(
    payload(order.orderNumber, order.asins, [item("B012345678", 9.99)], 9.99),
    order,
    { now: NOW }
  );
  assert.equal(result.ok, true);
  assert.equal(result.total, 9.99);
});

test("rejects legacy totals without exact Amazon order evidence", () => {
  const order = { orderNumber: "posh-1", asins: ["B012345678"] };
  const result = audit.validateAmazonPayloadForOrder({
    source: "amazon",
    total: 9.99,
    asins: order.asins,
    capturedAt: "2026-07-11T19:59:00.000Z",
    marketplaceContext: { platform: "Poshmark", orderNumber: order.orderNumber, asins: order.asins, linkedAt: "2026-07-11T19:59:00.000Z" }
  }, order, { now: NOW });
  assert.equal(result.ok, false);
  assert.match(result.error, /evidence is missing/i);
});

test("rejects a different ASIN, different Poshmark order, stale data, and changed total", () => {
  const order = { orderNumber: "posh-1", asins: ["B012345678"] };
  assert.equal(audit.validateAmazonPayloadForOrder(payload("posh-1", order.asins, [item("B087654321", 9.99)], 9.99), order, { now: NOW }).ok, false);
  assert.equal(audit.validateAmazonPayloadForOrder(payload("posh-2", order.asins, [item("B012345678", 9.99)], 9.99), order, { now: NOW }).ok, false);
  const stale = payload("posh-1", order.asins, [item("B012345678", 9.99)], 9.99);
  stale.capturedAt = "2026-07-11T10:00:00.000Z";
  stale.marketplaceContext.linkedAt = stale.capturedAt;
  assert.equal(audit.validateAmazonPayloadForOrder(stale, order, { now: NOW }).ok, false);
  assert.equal(audit.validateAmazonPayloadForOrder(payload("posh-1", order.asins, [item("B012345678", 9.99)], 19.99), order, { now: NOW }).ok, false);
});

test("supports an exact multi-item Poshmark order across multiple Amazon orders", () => {
  const order = { orderNumber: "posh-bundle", asins: ["B012345678", "B087654321"] };
  const items = [
    item("B012345678", 9.99, "114-1111111-2222222"),
    item("B087654321", 12.5, "114-3333333-4444444")
  ];
  const result = audit.validateAmazonPayloadForOrder(payload(order.orderNumber, order.asins, items, 22.49), order, { now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 2);
  assert.equal(result.total, 22.49);
});

test("builds traceable supplier fields and keeps one evidence item per ASIN", () => {
  const merged = audit.mergeItems(
    [item("B012345678", 8.99)],
    [item("B012345678", 9.99), item("B087654321", 12.5, "114-3333333-4444444")]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged.find((entry) => entry.asin === "B012345678").cost, 9.99);
  const fields = audit.supplierAuditFields(merged);
  assert.equal(fields.supplierItemIds, "B012345678, B087654321");
  assert.match(fields.supplierOrderNumber, /114-1111111-2222222/);
  assert.match(fields.supplierPageUrl, /amazon\.com\/your-orders\/order-details/);
  assert.equal(JSON.parse(fields.supplierItemEvidence).length, 2);
});

test("searches Amazon orders by narrow title phrases before ASIN fallback", () => {
  const queries = audit.amazonOrderSearchQueries({
    itemTitle: "Sketchbook and Pencils Sets, Sketch Supplies Complete: Sketchbook 9x12, Watercolor Kit",
    asins: ["B0FXS7SGHY"]
  });
  assert.deepEqual(queries, [
    "sketchbook pencils sets sketch supplies complete 9x12",
    "sketchbook pencils sets sketch",
    "B0FXS7SGHY"
  ]);
});

test("Amazon order search queries stay unique and fall back to valid ASINs", () => {
  assert.deepEqual(audit.amazonOrderSearchQueries({ itemTitle: "", asins: ["b012345678", "bad", "B012345678"] }), ["B012345678"]);
});
