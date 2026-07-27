// GLDN Ops public runtime configuration. Keep secrets in Chrome storage or the
// ignored config.js file; this file is included in every local release.
globalThis.GLDN_CONFIG = Object.freeze({
  settingsSchemaVersion: 2,
  deploymentMode: "local-unpacked",
  dashboardUrl: "https://script.google.com/macros/s/AKfycbziGWXqyZ-bW5MLKhRkkRghH1hT1X6kUCPO5sgEI1pWjuKzMT4aOcivG3ITqCUpjAhUhw/exec",
  dashboardKey: "",
  ecomSniperExtensionId: "eohieelgcgopcnjjjanjgfjdaifolokm",
  computerAccounts: {
    M0: {
      ebayAccountLabel: "CLICKNCARRY",
      display: "M0 - ClickNCarry",
      poshmarkComputerLabel: "M0"
    },
    "2": {
      ebayAccountLabel: "FANCYFI",
      display: "2 - FancyFi"
    },
    "6": {
      ebayAccountLabel: "FINTIME",
      display: "6 - Fintime"
    },
    "0": {
      ebayAccountLabel: "FAK12",
      display: "0 - FAK12",
      poshmarkComputerLabel: "7"
    },
    M1: {
      ebayAccountLabel: "HEARTSTONE",
      display: "M1 - Heartstone"
    },
    "7": {
      ebayAccountLabel: "",
      display: "7 - FarPosh",
      poshmarkOnly: true,
      poshmarkComputerLabel: "7"
    }
  },
  move99Accounts: {
    FAK12: {
      sourceStoreCategoryIds: ["44678633011", "1"],
      sourceCategories: ["Not .99", "Other"],
      destinationCategory: "Abra Cadabra .99",
      backburnerItemIds: ["318521296686"]
    },
    CLICKNCARRY: {
      sourceCategories: ["BEST SELLERS"],
      destinationCategory: "BALK",
      backburnerItemIds: []
    },
    FINTIME: {
      sourceCategories: ["Not .99", "Other"],
      destinationCategory: "Abra Cadabra .99",
      backburnerItemIds: []
    },
    FANCYFI: {
      sourceCategories: ["SNI", "SNIPO v2"],
      destinationCategory: "DAILY",
      backburnerItemIds: []
    },
    HEARTSTONE: {
      sourceCategories: ["Not .99", "Other"],
      destinationCategory: "Abra Cadabra .99",
      backburnerItemIds: []
    }
  },
  defaultUiOpacity: 75,
  defaultUiTheme: "dark",
  minimumUiOpacity: 0,
  maximumUiOpacity: 100,
  poshmarkMatchMinimumConfidence: 80,
  sellerReuseWindowDays: 60
});
