const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const ebaySource = fs.readFileSync(path.join(root, "extension/ebay.js"), "utf8");

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

function makeTextarea({ extension = false, placeholder = "", ariaLabel = "", dialogText = "", hidden = false } = {}) {
  return {
    id: "",
    name: "",
    placeholder,
    hidden,
    getAttribute(name) {
      if (name === "aria-label") return ariaLabel;
      if (name === "data-testid") return "";
      return "";
    },
    closest(selector) {
      if (selector.includes("gldn-")) return extension ? { id: "gldn-note-preview" } : null;
      if (selector.includes("role='dialog'")) return dialogText ? { innerText: dialogText } : null;
      return null;
    }
  };
}

function createSandbox(elements) {
  return {
    document: {
      querySelectorAll() {
        return elements;
      }
    },
    U: {
      isVisible(element) {
        return !element.hidden;
      },
      normalizeText(value = "") {
        return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  };
}

test("order-note textarea selection excludes GLDN preview and chooses eBay Add note", () => {
  const preview = makeTextarea({ extension: true, placeholder: "Editable note" });
  const ebay = makeTextarea({ placeholder: "Start typing your note to self here", dialogText: "Add note" });
  const sandbox = createSandbox([preview, ebay]);
  vm.runInNewContext(extractFunction(ebaySource, "findVisibleNoteTextarea"), sandbox);
  assert.equal(sandbox.findVisibleNoteTextarea(), ebay);
});

test("order-note textarea selection stops when only GLDN preview exists", () => {
  const preview = makeTextarea({ extension: true, placeholder: "Editable note" });
  const sandbox = createSandbox([preview]);
  vm.runInNewContext(extractFunction(ebaySource, "findVisibleNoteTextarea"), sandbox);
  assert.equal(sandbox.findVisibleNoteTextarea(), null);
});

test("order-note textarea selection prefers the labeled note box and rejects ambiguity", () => {
  const message = makeTextarea({ placeholder: "Write a message" });
  const ebay = makeTextarea({ ariaLabel: "Your note", dialogText: "Add note" });
  const sandbox = createSandbox([message, ebay]);
  vm.runInNewContext(extractFunction(ebaySource, "findVisibleNoteTextarea"), sandbox);
  assert.equal(sandbox.findVisibleNoteTextarea(), ebay);

  const ambiguous = createSandbox([makeTextarea(), makeTextarea()]);
  vm.runInNewContext(extractFunction(ebaySource, "findVisibleNoteTextarea"), ambiguous);
  assert.equal(ambiguous.findVisibleNoteTextarea(), null);
});

test("existing-note Edit selection stays inside the My note section", () => {
  const noteEdit = { textContent: "Edit", innerText: "Edit" };
  const noteContainer = {
    innerText: "My note\n5.68 - 7.16 - f9132 - 6/30\nEdit\nDelete",
    parentElement: null,
    closest() {
      return null;
    },
    querySelectorAll() {
      return [noteEdit];
    }
  };
  const marker = {
    textContent: "My note",
    innerText: "My note",
    parentElement: noteContainer,
    closest() {
      return null;
    }
  };
  const sandbox = {
    document: {
      querySelectorAll() {
        return [marker];
      }
    },
    U: {
      isVisible() {
        return true;
      },
      normalizeText(value = "") {
        return String(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
      }
    }
  };
  vm.runInNewContext(extractFunction(ebaySource, "findExistingNoteContainer"), sandbox);
  vm.runInNewContext(extractFunction(ebaySource, "extractExistingNote"), sandbox);
  vm.runInNewContext(extractFunction(ebaySource, "findExistingNoteEditButton"), sandbox);
  assert.equal(sandbox.findExistingNoteEditButton(), noteEdit);
  assert.equal(sandbox.extractExistingNote(), "5.68 - 7.16 - f9132 - 6/30");
});

test("order-note fill copies, opens Add note, fills, and never saves", () => {
  const fillFlow = blockBetween(ebaySource, "async function openAndFillAddNote(note)", "function findVisibleNoteTextarea()");
  assert.match(fillFlow, /navigator\.clipboard\.writeText\(note\)/);
  assert.match(fillFlow, /findExistingNoteEditButton\(\)/);
  assert.match(fillFlow, /findVisibleByText\("More actions"\)/);
  assert.match(fillFlow, /findVisibleByText\("Add note"\)/);
  assert.match(fillFlow, /setNativeValue\(textarea, note\)/);
  assert.match(fillFlow, /InputEvent\("input"/);
  assert.doesNotMatch(fillFlow, /findVisibleByText\("Save"\)|dispatchFullClick\([^\n]*Save|\.click\(\)[^\n]*Save/);
});

test("Prepare Order Note survives blocked clipboard access and fails visibly", () => {
  const readFlow = blockBetween(ebaySource, "async function readAmazonClipboard(order = {})", "function showOrderNoteFailure(");
  assert.match(readFlow, /storageGet\(\["lastCopiedAmazonPayload"\]\)/);
  assert.match(readFlow, /addCandidate\(stored\.lastCopiedAmazonPayload, "saved-review"\)/);
  assert.match(readFlow, /exactAsinMatch/);
  assert.match(readFlow, /No reviewed Amazon order information is ready/);

  const failureFlow = blockBetween(ebaySource, "function showOrderNoteFailure(", "function showPreview(");
  assert.match(failureFlow, /gldn-note-error/);
  assert.match(failureFlow, /Prepare Order Note stopped/);
  assert.match(failureFlow, /openAmazonOrderSearch/);

  const prepareFlow = blockBetween(ebaySource, "async function prepareNote()", "async function detectSavedNote()");
  assert.match(prepareFlow, /showOrderNoteFailure\(message, order \|\| \{\}\)/);
  assert.match(prepareFlow, /U\.recordExtensionLog/);
  assert.match(prepareFlow, /throw error/);
});

test("popup-triggered Prepare Order Note waits for the real page result", () => {
  const messageFlow = blockBetween(ebaySource, 'if (message?.type !== "runEbayPageAction")', "createPanel();");
  assert.match(messageFlow, /\["approve-move99-submit", "start-monthly-profit", "prepare-order-note"\]/);
  assert.match(messageFlow, /Promise\.resolve\(action\(\)\)/);
  assert.match(messageFlow, /sendResponse\(\{ ok: false, error:/);
});

test("order-note fill does not sync profit before eBay Save", () => {
  const previewFlow = blockBetween(ebaySource, "function showPreview({ payload, earnings, match, order, supplierAudit })", "async function openAndFillAddNote(note)");
  assert.doesNotMatch(previewFlow, /syncMarketplaceProfitRecord\(/);
  assert.match(previewFlow, /if \(!unchangedExistingNote\) await openAndFillAddNote\(note\)/);
  assert.match(previewFlow, /refreshProfitForMatchingSavedNote\(profitRecord\)/);
  assert.match(previewFlow, /Nothing is saved or synced until you click eBay's Save button/);
});

test("an already matching saved note can refresh the same profit row without another eBay Save", () => {
  const refreshFlow = blockBetween(ebaySource, "async function refreshProfitForMatchingSavedNote(record)", "async function openDashboard()");
  assert.match(refreshFlow, /syncMarketplaceProfitRecord\(record\)/);
  assert.match(refreshFlow, /if \(!sync\?\.ok && !sync\?\.queued\) throw new Error/);
  assert.match(refreshFlow, /latestMarketplaceProfit: record/);
});

test("eBay order note requires exact decoded SKU and Amazon order evidence", () => {
  const prepareFlow = blockBetween(ebaySource, "async function prepareNote()", "async function detectSavedNote()");
  assert.match(prepareFlow, /extractEbayOrderIdentity\(\)/);
  assert.match(prepareFlow, /validateAmazonPayloadForEbayOrder\(payload, order/);
  assert.match(prepareFlow, /if \(!audit\.ok\) throw new Error\(audit\.error\)/);
  assert.match(prepareFlow, /supplierAudit: audit\.supplierAudit/);

  const recordFlow = blockBetween(ebaySource, "function buildEbayProfitRecord(", "async function readAmazonClipboard(");
  assert.match(recordFlow, /sku: order\.skus\.join/);
  assert.match(recordFlow, /\.\.\.supplierAudit/);
  assert.match(recordFlow, /orderNumber: order\.orderNumber/);
});

test("eBay Custom label SKU decodes to the exact Amazon ASIN", () => {
  const sandbox = {
    document: { body: { innerText: "Item\nCustom label (SKU):\nQjA5WjYxRzc3TA==\nItem ID: 123" } },
    atob(value) { return Buffer.from(value, "base64").toString("utf8"); }
  };
  vm.runInNewContext(extractFunction(ebaySource, "decodeSkuToAsin"), sandbox);
  vm.runInNewContext(extractFunction(ebaySource, "extractEbaySkuValues"), sandbox);
  assert.deepEqual([...sandbox.extractEbaySkuValues()], ["QjA5WjYxRzc3TA=="]);
  assert.equal(sandbox.decodeSkuToAsin("QjA5WjYxRzc3TA=="), "B09Z61G77L");
});

test("saved-note detection waits for the eBay textarea to close before syncing", () => {
  const savedFlow = blockBetween(ebaySource, "async function detectSavedNote()", "function firstPercent(text)");
  assert.match(savedFlow, /if \(findVisibleNoteTextarea\(\)\) return/);
  assert.match(savedFlow, /extractExistingNote\(\)/);
  assert.match(savedFlow, /syncMarketplaceProfitRecord\(record\.profitRecord\)/);
});
