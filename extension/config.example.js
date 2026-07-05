// GLDN Ops built-in configuration template.
// Copy this file to config.js for each local unpacked extension install.
globalThis.GLDN_CONFIG = Object.freeze({
  dashboardUrl: "",
  dashboardKey: "",
  move99Accounts: {
    FAK12: {
      sourceStoreCategoryIds: ["44678633011", "1"],
      sourceCategories: ["Not .99", "Other"],
      destinationCategory: "Abra Cadabra .99",
      backburnerItemIds: ["318521296686"]
    },
    CLICKNCARRY: {
      sourceCategories: ["Not .99", "Other"],
      destinationCategory: "Abra Cadabra .99",
      backburnerItemIds: []
    },
    FINTIME: {
      sourceCategories: ["Not .99", "Other"],
      destinationCategory: "Abra Cadabra .99",
      backburnerItemIds: []
    },
    FANCYFI: {
      sourceCategories: ["Not .99", "Other"],
      destinationCategory: "Abra Cadabra .99",
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
  minimumUiOpacity: 65,
  maximumUiOpacity: 100
});
