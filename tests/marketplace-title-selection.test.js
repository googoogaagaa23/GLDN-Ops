const test = require("node:test");
const assert = require("node:assert/strict");

const audit = require("../extension/profit-audit.js");

test("eBay item title prefers the real item link over navigation links", () => {
  const title = audit.selectMarketplaceItemTitle([
    { text: "Skip to main content", href: "#mainContent" },
    { text: "EZY DOSE Weekly (7-Day) Pill Organizer, Medicine Planner, Vitamin Organizer Box,", href: "#itemInfo" },
    { text: "EZY DOSE Weekly (7-Day) Pill Organizer, Medicine Planner, Vitamin Organizer Box,", href: "https://www.ebay.com/itm/317594965260" }
  ]);

  assert.equal(title, "EZY DOSE Weekly (7-Day) Pill Organizer, Medicine Planner, Vitamin Organizer Box,");
});

test("eBay item title ignores hidden notification item links", () => {
  const title = audit.selectMarketplaceItemTitle([
    {
      text: "OFFER EXPIREDLarge Microwave Kiln for Glass FusingNew notification",
      href: "https://www.ebay.com/itm/317841913143?_trkparms=ni_actn%3Anav",
      visible: false
    },
    {
      text: "EZY DOSE Weekly (7-Day) Pill Organizer, Medicine Planner, Vitamin Organizer Box,",
      href: "https://www.ebay.com/itm/317594965260",
      visible: true
    }
  ]);

  assert.equal(title, "EZY DOSE Weekly (7-Day) Pill Organizer, Medicine Planner, Vitamin Organizer Box,");
});

test("marketplace title fallback rejects navigation noise", () => {
  assert.equal(audit.selectMarketplaceItemTitle([
    { text: "Skip to main content", href: "#mainContent" },
    { text: "A useful marketplace product title", href: "#itemInfo" }
  ]), "A useful marketplace product title");
});
