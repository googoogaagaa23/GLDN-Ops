const SHEET_NAME = "Tasks";

const KEY_COL = 1;
const TASK_COL = 4;
const OUTPUT_COL_K = 11;
const COMPUTER_HEADER_ROW = 3;
const SESSION_LABEL_COL = 26; // Z
const SESSION_VALUE_COL = 27; // AA

const KEY_PERCENT_NOTIFY = "PERCENT_NOTIFY";
const KEY_FRIDAY_WEEKLY = "FRIDAY_WEEKLY";
const KEY_THURSDAY_WEEKLY = "THURSDAY_WEEKLY";
const KEY_SUNDAY_WEEKLY = "SUNDAY_WEEKLY";
const KEY_MONTHLY_CHECK = "MONTHLY_CHECK";

const ACCOUNT_SNIPED_LABEL = "Account Sniped:";
const NEXT_ACCOUNT_LABEL = "Next Account To Snipe:";

const RED = "#ff0000";
const WHITE = "#ffffff";
const BLACK = "#000000";
const HEADER_BLUE = "#d9eaf7";
const INPUT_YELLOW = "#fff2cc";
const LIGHT_GRAY = "#f3f3f3";
const ORANGE = "#ff9900";

const FRIDAY_START_DATE = new Date(2026, 4, 22, 5, 0, 0);
const THURSDAY_START_DATE = new Date(2026, 4, 21, 17, 0, 0);
const SUNDAY_START_DATE = new Date(2026, 4, 24, 5, 0, 0);
const MONTHLY_START_DATE = new Date(2026, 4, 31, 5, 0, 0);

const EARLY_COMPLETION_HOURS = 48;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Task Controls")
    .addItem("Setup Automation", "setupAutomation")
    .addItem("Clock In", "clockIn")
    .addItem("Clock Out", "clockOut")
    .addItem("Save Progress To History", "saveProgressToHistoryManual")
    .addItem("Save Snapshot Now", "saveSnapshotNow")
    .addItem("Check Alerts Now", "runScheduledChecks")
    .addItem("Fix History Headers", "setupHistoryHeaders")
    .addItem("Uncheck All Checkboxes", "resetAllCheckboxesWithConfirm")
    .addToUi();
}

function onEdit(e) {
  handleEdit(e);
}

function handleEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();
  const now = new Date();

  if (isAccountSnipedInputCell(sheet, row, col)) {
    updateAccountSnipedTimestamp(sheet, now);
    return;
  }

  if (isManualPercentTrackingCell(sheet, row, col)) {
    stampManualInput(e.range, now);
    applyManualPercentAlerts(sheet);
    updatePerformanceCheckboxFromMetrics_(sheet, col, now);
    updateSessionOnEdit(sheet, now);
    updateProgressCell(sheet);
    updateComputerTimestamp(sheet, col);
    return;
  }

  if (!isCheckboxCell(e.range)) return;

  const value = e.range.getValue();
  const tz = e.source.getSpreadsheetTimeZone();

  if (value === true) {
    const human = Utilities.formatDate(now, tz, "MM/dd/yyyy hh:mm:ss a");
    const epoch = now.getTime();

    e.range.setNote(`Last checked: ${human}\nEpoch: ${epoch}`);
    e.range.setBackground(WHITE);

    updateAutomationRowLastChecked(sheet, row, now);
    markMonthlyCellCompletedIfNeeded(sheet, row, col, now);

    if (isConfirmQuantityIncreasedRow(sheet, row) && col >= 5 && col <= 9) {
      updateConfirmQuantityIncreasedLastChecked(sheet, row, now);
    }
  }

  logCheckboxEdit(sheet, e.range, value, now);
  updateSessionOnEdit(sheet, now);
  updateProgressCell(sheet);
  updateComputerTimestamp(sheet, col);
  evaluateAllAlerts(sheet);
}

function setupAutomation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggers = ScriptApp.getProjectTriggers();

  for (let i = 0; i < triggers.length; i++) {
    const fn = triggers[i].getHandlerFunction();

    if (
      fn === "handleEdit" ||
      fn === "runScheduledChecks" ||
      fn === "weeklyFridayCheck" ||
      fn === "weeklyThursdayCheck" ||
      fn === "weeklySundayCheck" ||
      fn === "monthlyCheck" ||
      fn === "dailyAutoSave"
    ) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("handleEdit").forSpreadsheet(ss).onEdit().create();

  ScriptApp.newTrigger("runScheduledChecks")
    .timeBased()
    .everyHours(1)
    .create();

  ScriptApp.newTrigger("weeklyFridayCheck")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(5)
    .create();

  ScriptApp.newTrigger("weeklyThursdayCheck")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(17)
    .create();

  ScriptApp.newTrigger("weeklySundayCheck")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(5)
    .create();

  ScriptApp.newTrigger("monthlyCheck")
    .timeBased()
    .everyDays(1)
    .atHour(5)
    .create();

  ScriptApp.newTrigger("dailyAutoSave")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();

  const sheet = ss.getSheetByName(SHEET_NAME);

  if (sheet) {
    formatAccountSnipingArea(sheet);
    updateProgressCell(sheet);
    updateSessionCells(sheet);
    evaluateAllAlerts(sheet);
  }

  setupHistoryHeaders();
  setupCheckboxLogHeaders();

  SpreadsheetApp.getUi().alert("Automation setup is complete.");
}

function formatAccountSnipingArea(sheet) {
  const rows = getAccountSnipingRows(sheet);

  if (rows.accountRow) {
    sheet.getRange(rows.accountRow, 11).setFontWeight("bold");
    sheet.getRange(rows.accountRow, 12).setBackground(INPUT_YELLOW);
    sheet.getRange(rows.accountRow, 13).setFontWeight("bold");
    sheet.getRange(rows.accountRow, 14).setBackground(LIGHT_GRAY);
  }

  if (rows.nextRow) {
    sheet.getRange(rows.nextRow, 11).setFontWeight("bold");
    sheet.getRange(rows.nextRow, 12).setBackground(INPUT_YELLOW);
  }
}

function getAccountSnipingRows(sheet) {
  const lastRow = sheet.getLastRow();
  const values = sheet.getRange(1, 11, lastRow, 4).getValues();

  let accountRow = null;
  let nextRow = null;

  for (let i = 0; i < values.length; i++) {
    const row = i + 1;
    const label = String(values[i][0]).trim();
    const input = String(values[i][1]).trim();
    const timestamp = String(values[i][3]).trim();

    if (label === ACCOUNT_SNIPED_LABEL) {
      if (!accountRow) accountRow = row;
      if (input || timestamp) accountRow = row;
    }

    if (label === NEXT_ACCOUNT_LABEL) {
      if (!nextRow) nextRow = row;
    }
  }

  return {
    accountRow: accountRow,
    nextRow: nextRow
  };
}

function isAccountSnipedInputCell(sheet, row, col) {
  if (col !== 12) return false;

  const rows = getAccountSnipingRows(sheet);
  return rows.accountRow === row;
}

function updateAccountSnipedTimestamp(sheet, now) {
  const rows = getAccountSnipingRows(sheet);
  if (!rows.accountRow) return;

  const inputCell = sheet.getRange(rows.accountRow, 12);
  const timestampCell = sheet.getRange(rows.accountRow, 14);
  const value = inputCell.getValue();
  const tz = sheet.getParent().getSpreadsheetTimeZone();

  if (!value) {
    timestampCell.clearContent();
    return;
  }

  const human = Utilities.formatDate(now, tz, "MM/dd/yyyy hh:mm:ss a");
  timestampCell.setValue(human);
  updateLastSnipedStatus(sheet, now);
}

function clockIn() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  formatAccountSnipingArea(sheet);

  const props = PropertiesService.getDocumentProperties();
  const now = new Date();
  const epoch = now.getTime();

  props.setProperty("SESSION_START_EPOCH", String(epoch));
  props.setProperty("SESSION_LAST_ACTIVITY_EPOCH", String(epoch));
  props.deleteProperty("SESSION_END_EPOCH");

  updateSessionCells(sheet);
  updateProgressCell(sheet);

  SpreadsheetApp.getUi().alert("Clocked in.");
}

function clockOut() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const props = PropertiesService.getDocumentProperties();
  const now = new Date();
  const epoch = now.getTime();

  if (!props.getProperty("SESSION_START_EPOCH")) {
    props.setProperty("SESSION_START_EPOCH", String(epoch));
  }

  props.setProperty("SESSION_LAST_ACTIVITY_EPOCH", String(epoch));
  props.setProperty("SESSION_END_EPOCH", String(epoch));

  updateSessionCells(sheet);
  updateProgressCell(sheet);

  saveProgressToHistory("Clock Out", false, true);

  SpreadsheetApp.getUi().alert("Clocked out. History and snapshot saved.");
}

function updateSessionOnEdit(sheet, now) {
  const props = PropertiesService.getDocumentProperties();
  const epoch = now.getTime();

  if (!props.getProperty("SESSION_START_EPOCH")) {
    props.setProperty("SESSION_START_EPOCH", String(epoch));
  }

  props.setProperty("SESSION_LAST_ACTIVITY_EPOCH", String(epoch));

  if (!props.getProperty("SESSION_END_EPOCH")) {
    updateSessionCells(sheet);
  }
}

function updateSessionCells(sheet) {
  const ss = sheet.getParent();
  const tz = ss.getSpreadsheetTimeZone();
  const props = PropertiesService.getDocumentProperties();

  const startEpoch = Number(props.getProperty("SESSION_START_EPOCH"));
  const lastEpoch = Number(props.getProperty("SESSION_LAST_ACTIVITY_EPOCH"));
  const endEpoch = Number(props.getProperty("SESSION_END_EPOCH"));

  sheet.getRange(2, SESSION_LABEL_COL).setValue("Progress");
  sheet.getRange(3, SESSION_LABEL_COL).setValue("Clock In");
  sheet.getRange(4, SESSION_LABEL_COL).setValue("Last Activity");
  sheet.getRange(5, SESSION_LABEL_COL).setValue("Clock Out");
  sheet.getRange(6, SESSION_LABEL_COL).setValue("Time Worked");
  sheet.getRange(7, SESSION_LABEL_COL).setValue("Status");

  sheet.getRange(3, SESSION_VALUE_COL, 5, 1).clearContent();

  if (!startEpoch) {
    sheet.getRange(7, SESSION_VALUE_COL).setValue("Not clocked in");
    return;
  }

  const startText = Utilities.formatDate(new Date(startEpoch), tz, "MM/dd/yyyy hh:mm:ss a");
  const lastText = lastEpoch ? Utilities.formatDate(new Date(lastEpoch), tz, "MM/dd/yyyy hh:mm:ss a") : "";
  const endText = endEpoch ? Utilities.formatDate(new Date(endEpoch), tz, "MM/dd/yyyy hh:mm:ss a") : "";

  const activeEnd = endEpoch || lastEpoch || startEpoch;
  const durationText = formatDuration(activeEnd - startEpoch);

  sheet.getRange(3, SESSION_VALUE_COL).setValue(startText);
  sheet.getRange(4, SESSION_VALUE_COL).setValue(lastText);
  sheet.getRange(5, SESSION_VALUE_COL).setValue(endText);
  sheet.getRange(6, SESSION_VALUE_COL).setValue(durationText);
  sheet.getRange(7, SESSION_VALUE_COL).setValue(endEpoch ? "Clocked out" : "Clocked in");
}

function runScheduledChecks() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  evaluateAllAlerts(sheet);
  updateProgressCell(sheet);
}

function weeklyFridayCheck() {
  runScheduledChecks();
}

function weeklyThursdayCheck() {
  runScheduledChecks();
}

function weeklySundayCheck() {
  runScheduledChecks();
}

function monthlyCheck() {
  runScheduledChecks();
}

function dailyAutoSave() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const props = PropertiesService.getDocumentProperties();
  const startEpoch = props.getProperty("SESSION_START_EPOCH");

  if (!startEpoch) return;

  saveProgressToHistory("Daily Auto Save", false, true);
}

function evaluateAllAlerts(sheet) {
  applyManualPercentAlerts(sheet);
  applyWeeklyRows(sheet, KEY_FRIDAY_WEEKLY);
  applyWeeklyRows(sheet, KEY_THURSDAY_WEEKLY);
  applyWeeklyRows(sheet, KEY_SUNDAY_WEEKLY);
  applyMonthlyRows(sheet);
  updateLastSnipedStatus(sheet, new Date());
}

function isManualPercentTrackingCell(sheet, row, col) {
  if (col < 5 || col > 9) return false;
  if (!sheet || sheet.getName() !== SHEET_NAME) return false;

  return row === findTaskRowByContains_(sheet, "Late Shipment Rate")
    || row === findTaskRowByContains_(sheet, "Tracking Uploaded On Time")
    || row === findTaskRowByContains_(sheet, "Transaction Defect Rate")
    || row === findTaskRowByContains_(sheet, "Cases Closed without seller Resolution");
}

function stampManualInput(cell, now) {
  const value = cell.getValue();
  const sheet = cell.getSheet();
  const tz = sheet.getParent().getSpreadsheetTimeZone();

  if (value === "" || value === null) {
    cell.clearNote();
    return;
  }

  const human = Utilities.formatDate(now, tz, "MM/dd/yyyy hh:mm:ss a");
  const epoch = now.getTime();

  cell.setNote(`Value entered: ${human}\nEpoch: ${epoch}`);
}

function applyManualPercentAlerts(sheet) {
  applyZeroPercentAlert_(sheet, "Transaction Defect Rate");
  applyLateShipmentRateAlert(sheet);
  applyTrackingUploadedAlert(sheet);
  applyZeroPercentAlert_(sheet, "Cases Closed without seller Resolution");
}

function applyZeroPercentAlert_(sheet, taskText) {
  const row = findTaskRowByContains_(sheet, taskText);
  if (!row) return;
  const range = sheet.getRange(row, 5, 1, 5);
  const values = range.getValues()[0];
  const checkNames = [];
  for (let i = 0; i < values.length; i++) {
    const cell = range.getCell(1, i + 1);
    const rawValue = values[i];
    if (rawValue === "" || rawValue === null || typeof rawValue === "boolean") {
      cell.setBackground(WHITE);
      continue;
    }
    if (parsePercentValue(rawValue) > 0) {
      cell.setBackground(RED);
      checkNames.push(getComputerHeaderName_(sheet, i + 5));
    } else {
      cell.setBackground(WHITE);
    }
  }
  updateMetricAlertCell_(sheet, row, checkNames);
}

function updateMetricAlertCell_(sheet, row, checkNames) {
  const alertCell = sheet.getRange(row, OUTPUT_COL_K);
  if (checkNames.length) {
    alertCell.setValue("CHECK " + checkNames.join(" & "));
    alertCell.setBackground(RED);
    alertCell.setFontColor(BLACK);
    alertCell.setFontWeight("bold");
  } else {
    alertCell.clearContent();
    alertCell.setBackground(WHITE);
    alertCell.setFontColor(BLACK);
    alertCell.setFontWeight("normal");
  }
}

function updatePerformanceCheckboxFromMetrics_(sheet, col, now) {
  if (col < 5 || col > 9) return;
  const metricRows = [
    findTaskRowByContains_(sheet, "Transaction Defect Rate"),
    findTaskRowByContains_(sheet, "Late Shipment Rate"),
    findTaskRowByContains_(sheet, "Tracking Uploaded On Time"),
    findTaskRowByContains_(sheet, "Cases Closed without seller Resolution")
  ];
  if (metricRows.some((row) => !row)) return;
  const complete = metricRows.every((row) => {
    const value = sheet.getRange(row, col).getValue();
    return value !== "" && value !== null && typeof value !== "boolean";
  });
  if (!complete) return;
  const parentRow = findTaskRowByContains_(sheet, "Check Performance of Each Store and Check Late Shipment Rate");
  if (!parentRow) return;
  const parentCell = sheet.getRange(parentRow, col);
  parentCell.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  parentCell.setValue(true);
  stampManualInput(parentCell, now);
}

function applyLateShipmentRateAlert(sheet) {
  const row = findTaskRowByContains_(sheet, "Late Shipment Rate");
  if (!row) return;

  const range = sheet.getRange(row, 5, 1, 5);
  const values = range.getValues()[0];

  const checkNames = [];

  for (let i = 0; i < values.length; i++) {
    const cell = range.getCell(1, i + 1);
    const rawValue = values[i];
    const percent = parsePercentValue(rawValue);

    if (rawValue === "" || rawValue === null) {
      cell.setBackground(WHITE);
      continue;
    }

    if (percent > 2.4) {
      cell.setBackground(RED);
      checkNames.push(getComputerHeaderName_(sheet, i + 5));
    } else if (percent > 1.5) {
      cell.setBackground(ORANGE);
      checkNames.push(getComputerHeaderName_(sheet, i + 5));
    } else {
      cell.setBackground(WHITE);
    }
  }

  const alertCell = sheet.getRange(row, OUTPUT_COL_K);

  if (checkNames.length) {
    alertCell.setValue("CHECK " + checkNames.join(" & "));
    alertCell.setBackground(RED);
    alertCell.setFontColor(BLACK);
    alertCell.setFontWeight("bold");
  } else {
    alertCell.clearContent();
    alertCell.setBackground(WHITE);
    alertCell.setFontColor(BLACK);
    alertCell.setFontWeight("normal");
  }
}

function applyTrackingUploadedAlert(sheet) {
  const row = findTaskRowByContains_(sheet, "Tracking Uploaded On Time");
  if (!row) return;

  const range = sheet.getRange(row, 5, 1, 5);
  const values = range.getValues()[0];

  const checkNames = [];

  for (let i = 0; i < values.length; i++) {
    const cell = range.getCell(1, i + 1);
    const rawValue = values[i];
    const percent = parsePercentValue(rawValue);

    if (rawValue === "" || rawValue === null) {
      cell.setBackground(WHITE);
      continue;
    }

    if (percent < 80) {
      cell.setBackground(RED);
      checkNames.push(getComputerHeaderName_(sheet, i + 5));
    } else if (percent < 85) {
      cell.setBackground(ORANGE);
      checkNames.push(getComputerHeaderName_(sheet, i + 5));
    } else {
      cell.setBackground(WHITE);
    }
  }

  const alertCell = sheet.getRange(row, OUTPUT_COL_K);

  if (checkNames.length) {
    alertCell.setValue("CHECK " + checkNames.join(" & "));
    alertCell.setBackground(RED);
    alertCell.setFontColor(BLACK);
    alertCell.setFontWeight("bold");
  } else {
    alertCell.clearContent();
    alertCell.setBackground(WHITE);
    alertCell.setFontColor(BLACK);
    alertCell.setFontWeight("normal");
  }
}

function isConfirmQuantityIncreasedRow(sheet, row) {
  const task = String(sheet.getRange(row, TASK_COL).getDisplayValue()).toLowerCase();
  return task.indexOf("confirm quantity increased") !== -1;
}

function updateConfirmQuantityIncreasedLastChecked(sheet, row, now) {
  const tz = sheet.getParent().getSpreadsheetTimeZone();
  const human = Utilities.formatDate(now, tz, "MM/dd/yyyy hh:mm:ss a");
  const epoch = now.getTime();

  const cell = sheet.getRange(row, OUTPUT_COL_K);

  cell.setValue("Last checked: " + human);
  cell.setNote("Epoch: " + epoch);
  cell.setBackground(WHITE);
  cell.setFontColor(BLACK);
  cell.setFontWeight("normal");
}

function getComputerHeaderName_(sheet, col) {
  return String(sheet.getRange(COMPUTER_HEADER_ROW, col).getDisplayValue()).trim() || ("Column " + col);
}

function updateLastSnipedStatus(sheet, now) {
  const row = findTaskRowByContains_(sheet, "Snipe Items");
  if (!row) return;

  const outputCell = sheet.getRange(row, 13);
  const rows = getAccountSnipingRows(sheet);
  let epoch = null;

  if (rows.accountRow) {
    const timestampValue = sheet.getRange(rows.accountRow, 14).getValue();
    if (timestampValue) {
      const parsed = timestampValue instanceof Date ? timestampValue.getTime() : new Date(timestampValue).getTime();
      if (!isNaN(parsed)) epoch = parsed;
    }
  }

  if (!epoch) {
    epoch = extractEpoch(sheet.getRange(row, OUTPUT_COL_K).getNote());
  }

  if (!epoch) {
    outputCell.setValue("NEED TO SNIPE");
    outputCell.setBackground(RED);
    outputCell.setFontColor(BLACK);
    outputCell.setFontWeight("bold");
    return;
  }

  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

  if (now.getTime() - epoch > fiveDaysMs) {
    outputCell.setValue("NEED TO SNIPE");
    outputCell.setBackground(RED);
    outputCell.setFontColor(BLACK);
    outputCell.setFontWeight("bold");
    return;
  }

  const tz = sheet.getParent().getSpreadsheetTimeZone();
  outputCell.setValue(Utilities.formatDate(new Date(epoch), tz, "MM/dd/yyyy"));
  outputCell.setBackground(WHITE);
  outputCell.setFontColor(BLACK);
  outputCell.setFontWeight("normal");
}

function findTaskRowByContains_(sheet, text) {
  const needle = String(text || "").toLowerCase();
  if (!needle) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return null;

  const tasks = sheet.getRange(1, TASK_COL, lastRow, 1).getDisplayValues();

  for (let i = 0; i < tasks.length; i++) {
    const task = String(tasks[i][0] || "").toLowerCase();
    if (task.indexOf(needle) !== -1) return i + 1;
  }

  return null;
}

function applyWeeklyRows(sheet, prefix) {
  const rows = getRowsByKeyPrefix(sheet, prefix);
  const now = new Date();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].row;
    const keyName = rows[i].key;
    const schedule = getScheduleForKey(keyName);

    if (!schedule) continue;

    if (now.getTime() < schedule.startDate.getTime()) {
      clearDueRowBeforeStart(sheet, row);
      continue;
    }

    colorWeeklyCellsByCurrentCycle(sheet, row, schedule, now);
  }
}

function colorWeeklyCellsByCurrentCycle(sheet, row, schedule, now) {
  const cols = getCheckboxColumnsInRow(sheet, row);
  const currentDue = getMostRecentWeeklyDueDate(now, schedule.day, schedule.hour);
  const earlyStart = new Date(currentDue.getTime() - EARLY_COMPLETION_HOURS * 60 * 60 * 1000);
  const nextDue = new Date(currentDue.getTime() + 7 * 24 * 60 * 60 * 1000);
  const rowLastCheckedEpoch = extractLastCheckedFromK(sheet, row);

  for (let i = 0; i < cols.length; i++) {
    const cell = sheet.getRange(row, cols[i]);

    if (cell.getValue() === true) {
      cell.setBackground(WHITE);
      continue;
    }

    const cellLastCheckedEpoch = extractEpoch(cell.getNote());
    const lastCheckedEpoch = cellLastCheckedEpoch || rowLastCheckedEpoch;

    if (lastCheckedEpoch && lastCheckedEpoch >= earlyStart.getTime() && lastCheckedEpoch < nextDue.getTime()) {
      cell.setBackground(WHITE);
    } else {
      cell.setBackground(RED);
    }
  }
}

function applyMonthlyRows(sheet) {
  const rows = getRowsByKeyPrefix(sheet, KEY_MONTHLY_CHECK);
  const now = new Date();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].row;
    const keyName = rows[i].key;
    const outputCell = sheet.getRange(row, OUTPUT_COL_K);

    if (now.getTime() < MONTHLY_START_DATE.getTime()) {
      clearDueRowBeforeStart(sheet, row);
      outputCell.clearContent();
      outputCell.setBackground(WHITE);
      outputCell.setFontColor(BLACK);
      outputCell.setFontWeight("normal");
      continue;
    }

    if (!isMonthlyDueActive(now)) continue;

    const cycleKey = getCycleKey(now, {
      type: "monthly",
      startDate: MONTHLY_START_DATE
    });

    const hasUnchecked = colorMonthlyCellsRedUntilCompleted(sheet, row, keyName, cycleKey);

    if (hasUnchecked) {
      outputCell.setValue("CHECK");
      outputCell.setBackground(RED);
      outputCell.setFontColor(BLACK);
      outputCell.setFontWeight("bold");
    } else {
      if (String(outputCell.getValue()).indexOf("Last checked:") !== 0) {
        outputCell.clearContent();
      }

      outputCell.setBackground(WHITE);
      outputCell.setFontColor(BLACK);
      outputCell.setFontWeight("normal");
    }
  }
}

function colorMonthlyCellsRedUntilCompleted(sheet, row, keyName, cycleKey) {
  let hasUnchecked = false;
  const cols = getCheckboxColumnsInRow(sheet, row);

  for (let i = 0; i < cols.length; i++) {
    const col = cols[i];
    const cell = sheet.getRange(row, col);

    const alreadyCompletedThisCycle = wasDueCellCompletedThisCycle(keyName, col, cycleKey);

    if (cell.getValue() === true) {
      cell.setBackground(WHITE);
      markDueCellCompleted(keyName, col, cycleKey);
      continue;
    }

    if (alreadyCompletedThisCycle) {
      cell.setBackground(WHITE);
    } else {
      cell.setBackground(RED);
      hasUnchecked = true;
    }
  }

  return hasUnchecked;
}

function clearDueRowBeforeStart(sheet, row) {
  const cols = getCheckboxColumnsInRow(sheet, row);

  for (let i = 0; i < cols.length; i++) {
    const cell = sheet.getRange(row, cols[i]);

    if (cell.getBackground() === RED) {
      cell.setBackground(WHITE);
    }
  }

  const outputCell = sheet.getRange(row, OUTPUT_COL_K);
  const outputText = String(outputCell.getValue()).trim();

  if (outputText === "CHECK") {
    outputCell.clearContent();
    outputCell.setBackground(WHITE);
    outputCell.setFontColor(BLACK);
    outputCell.setFontWeight("normal");
  }
}

function updateAutomationRowLastChecked(sheet, row, now) {
  const keyName = getKeyByRow(sheet, row);
  if (!keyName) return;

  const schedule = getScheduleForKey(keyName);
  if (!schedule) return;

  const tz = sheet.getParent().getSpreadsheetTimeZone();
  const human = Utilities.formatDate(now, tz, "MM/dd/yyyy hh:mm:ss a");
  const outputCell = sheet.getRange(row, OUTPUT_COL_K);

  outputCell.setValue("Last checked: " + human);
  outputCell.setNote("Epoch: " + now.getTime());
  outputCell.setBackground(WHITE);
  outputCell.setFontColor(BLACK);
  outputCell.setFontWeight("normal");
}

function markMonthlyCellCompletedIfNeeded(sheet, row, col, now) {
  const keyName = getKeyByRow(sheet, row);
  if (!keyName) return;

  if (!(keyName === KEY_MONTHLY_CHECK || keyName.indexOf(KEY_MONTHLY_CHECK + "_") === 0)) return;
  if (now.getTime() < MONTHLY_START_DATE.getTime()) return;

  const cycleKey = getCycleKey(now, {
    type: "monthly",
    startDate: MONTHLY_START_DATE
  });

  markDueCellCompleted(keyName, col, cycleKey);
}

function markDueCellCompleted(keyName, col, cycleKey) {
  const props = PropertiesService.getDocumentProperties();
  props.setProperty(getDueCellPropertyKey(keyName, col), cycleKey);
}

function wasDueCellCompletedThisCycle(keyName, col, cycleKey) {
  const props = PropertiesService.getDocumentProperties();
  const savedCycle = props.getProperty(getDueCellPropertyKey(keyName, col));

  return savedCycle === cycleKey;
}

function getDueCellPropertyKey(keyName, col) {
  return `DUE_DONE_${keyName}_C${col}`;
}

function resetAllCheckboxesWithConfirm() {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    "Confirm Reset",
    "This will save progress to History, save a snapshot, then uncheck all real checkboxes. Continue?",
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  saveProgressToHistory("Reset", false, true);
  resetAllCheckboxes();
}

function resetAllCheckboxes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2) return;

  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const validations = range.getDataValidations();

  for (let r = 0; r < validations.length; r++) {
    for (let c = 0; c < validations[r].length; c++) {
      if (isCheckboxValidation(validations[r][c])) {
        const cell = range.getCell(r + 1, c + 1);
        cell.setValue(false);
        cell.setBackground(WHITE);
      }
    }
  }

  sheet.getRange(2, SESSION_LABEL_COL, 6, 2).clearContent();

  clearComputerTimestamps(sheet);
  clearSessionData();

  formatAccountSnipingArea(sheet);
  evaluateAllAlerts(sheet);
}

function updateProgressCell(sheet) {
  const progress = getProgressData(sheet);

  sheet.getRange(2, SESSION_LABEL_COL).setValue("Progress");

  if (progress.total === 0) {
    sheet.getRange(2, SESSION_VALUE_COL).clearContent();
    return;
  }

  sheet.getRange(2, SESSION_VALUE_COL).setValue(`${progress.checked}/${progress.total} complete | ${progress.percent}%`);
}

function updateComputerTimestamp(sheet, col) {
  sheet.getRange(COMPUTER_HEADER_ROW, col).clearNote();
}

function clearComputerTimestamps(sheet) {
  const lastCol = sheet.getLastColumn();

  if (lastCol < 2) return;

  sheet.getRange(COMPUTER_HEADER_ROW, 2, 1, lastCol - 1).clearNote();
}

function saveProgressToHistoryManual() {
  saveProgressToHistory("Manual Save", true, true);
  SpreadsheetApp.getUi().alert("History saved.");
}

function saveProgressToHistory(saveType, forceSave, saveSnapshot) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const historySheet = getOrCreateHistorySheet(ss);
  const progress = getProgressData(sheet);
  const rows = getAccountSnipingRows(sheet);

  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const date = Utilities.formatDate(now, tz, "MM/dd/yyyy");
  const saveTime = Utilities.formatDate(now, tz, "hh:mm:ss a");

  const props = PropertiesService.getDocumentProperties();

  let startEpoch = Number(props.getProperty("SESSION_START_EPOCH"));
  let lastEpoch = Number(props.getProperty("SESSION_LAST_ACTIVITY_EPOCH"));
  let endEpoch = Number(props.getProperty("SESSION_END_EPOCH"));

  if (!startEpoch) startEpoch = now.getTime();
  if (!lastEpoch) lastEpoch = now.getTime();

  const historyKey = String(startEpoch) + "|" + date + "|" + saveType;

  if (!forceSave && props.getProperty("LAST_HISTORY_SAVE_KEY") === historyKey) {
    return;
  }

  const effectiveEndEpoch = endEpoch || lastEpoch || now.getTime();

  const startText = Utilities.formatDate(new Date(startEpoch), tz, "MM/dd/yyyy hh:mm:ss a");
  const endText = Utilities.formatDate(new Date(effectiveEndEpoch), tz, "MM/dd/yyyy hh:mm:ss a");
  const durationText = formatDuration(effectiveEndEpoch - startEpoch);

  let accountSniped = "";
  let accountSnipedTime = "";
  let nextAccount = "";

  if (rows.accountRow) {
    accountSniped = sheet.getRange(rows.accountRow, 12).getValue();
    accountSnipedTime = sheet.getRange(rows.accountRow, 14).getValue();
  }

  if (rows.nextRow) {
    nextAccount = sheet.getRange(rows.nextRow, 12).getValue();
  }

  let snapshotName = "";

  if (saveSnapshot) {
    snapshotName = createTaskSnapshot(ss, sheet);
  }

  historySheet.appendRow([
    date,
    saveTime,
    saveType,
    startText,
    endText,
    durationText,
    progress.checked,
    progress.total,
    progress.percent + "%",
    accountSniped,
    accountSnipedTime,
    nextAccount,
    snapshotName
  ]);

  props.setProperty("LAST_HISTORY_SAVE_KEY", historyKey);

  setupHistoryHeaders();
  updateSessionCells(sheet);
  updateProgressCell(sheet);
}

function saveSnapshotNow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  const name = createTaskSnapshot(ss, sheet);
  SpreadsheetApp.getUi().alert("Snapshot saved: " + name);
}

function createTaskSnapshot(ss, sheet) {
  const tz = ss.getSpreadsheetTimeZone();
  const now = new Date();
  const stamp = Utilities.formatDate(now, tz, "MM-dd-yyyy HHmm");
  let baseName = "Tasks Snapshot " + stamp;
  let name = baseName;

  let counter = 2;
  while (ss.getSheetByName(name)) {
    name = baseName + " (" + counter + ")";
    counter++;
  }

  const copied = sheet.copyTo(ss);
  copied.setName(name);
  copied.getRange("A1").setNote("Snapshot created: " + Utilities.formatDate(now, tz, "MM/dd/yyyy hh:mm:ss a"));

  ss.setActiveSheet(sheet);

  return name;
}

function getOrCreateHistorySheet(ss) {
  let historySheet = ss.getSheetByName("History");

  if (!historySheet) {
    historySheet = ss.insertSheet("History");
  }

  setupHistoryHeaders();

  return historySheet;
}

function setupHistoryHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let historySheet = ss.getSheetByName("History");

  if (!historySheet) {
    historySheet = ss.insertSheet("History");
  }

  const headers = [
    "Date",
    "Time Saved",
    "Save Type",
    "Clock In",
    "Clock Out / Last Activity",
    "Total Time Worked",
    "Completed Checkboxes",
    "Total Checkboxes",
    "Overall Completion Percent",
    "Account Sniped Today",
    "Account Sniped Timestamp",
    "Next Account To Snipe",
    "Snapshot Sheet"
  ];

  historySheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  historySheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground(HEADER_BLUE)
    .setFontColor(BLACK)
    .setHorizontalAlignment("center");

  historySheet.setFrozenRows(1);
  historySheet.autoResizeColumns(1, headers.length);
  historySheet.getRange(1, 1, historySheet.getMaxRows(), headers.length).setVerticalAlignment("middle");
}

function setupCheckboxLogHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName("Checkbox Log");

  if (!logSheet) {
    logSheet = ss.insertSheet("Checkbox Log");
  }

  const headers = [
    "Timestamp",
    "Cell",
    "Automation Key",
    "Task",
    "Computer / Account",
    "Status"
  ];

  logSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  logSheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground(HEADER_BLUE)
    .setFontColor(BLACK)
    .setHorizontalAlignment("center");

  logSheet.setFrozenRows(1);
  logSheet.autoResizeColumns(1, headers.length);
}

function logCheckboxEdit(sheet, range, value, now) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let logSheet = ss.getSheetByName("Checkbox Log");

  if (!logSheet) {
    setupCheckboxLogHeaders();
    logSheet = ss.getSheetByName("Checkbox Log");
  }

  const tz = ss.getSpreadsheetTimeZone();
  const timestamp = Utilities.formatDate(now, tz, "MM/dd/yyyy hh:mm:ss a");
  const row = range.getRow();
  const col = range.getColumn();

  const cellA1 = range.getA1Notation();
  const automationKey = getKeyByRow(sheet, row);
  const task = sheet.getRange(row, TASK_COL).getDisplayValue();
  const computer = sheet.getRange(COMPUTER_HEADER_ROW, col).getDisplayValue();
  const status = value === true ? "Checked" : "Unchecked";

  logSheet.appendRow([
    timestamp,
    cellA1,
    automationKey,
    task,
    computer,
    status
  ]);
}

function getProgressData(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2) {
    return {
      checked: 0,
      total: 0,
      percent: 0
    };
  }

  const range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const values = range.getValues();
  const validations = range.getDataValidations();

  return countCheckboxes(values, validations);
}

function countCheckboxes(values, validations) {
  let total = 0;
  let checked = 0;

  for (let r = 0; r < values.length; r++) {
    for (let c = 0; c < values[r].length; c++) {
      if (isCheckboxValidation(validations[r][c])) {
        total++;

        if (values[r][c] === true) checked++;
      }
    }
  }

  const percent = total === 0 ? 0 : Math.round((checked / total) * 100);

  return {
    checked: checked,
    total: total,
    percent: percent
  };
}

function getRowsByKeyPrefix(sheet, prefix) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return [];

  const values = sheet.getRange(1, KEY_COL, lastRow, 1).getValues();
  const rows = [];

  for (let i = 0; i < values.length; i++) {
    const key = String(values[i][0]).trim();

    if (key === prefix || key.indexOf(prefix + "_") === 0) {
      rows.push({
        row: i + 1,
        key: key
      });
    }
  }

  return rows;
}

function getKeyByRow(sheet, row) {
  return String(sheet.getRange(row, KEY_COL).getValue()).trim();
}

function getCheckboxColumnsInRow(sheet, row) {
  const lastCol = sheet.getLastColumn();
  const validations = sheet.getRange(row, 1, 1, lastCol).getDataValidations()[0];
  const cols = [];

  for (let c = 0; c < validations.length; c++) {
    if (isCheckboxValidation(validations[c])) {
      cols.push(c + 1);
    }
  }

  return cols;
}

function isCheckboxCell(cell) {
  const validation = cell.getDataValidation();
  return isCheckboxValidation(validation);
}

function isCheckboxValidation(validation) {
  if (!validation) return false;

  return validation.getCriteriaType() === SpreadsheetApp.DataValidationCriteria.CHECKBOX;
}

function parsePercentValue(value) {
  if (typeof value === "number") {
    if (value <= 1) return value * 100;
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace("%", "").trim();
    const num = Number(cleaned);

    if (isNaN(num)) return 0;
    return num;
  }

  return 0;
}

function getScheduleForKey(keyName) {
  if (keyName === KEY_FRIDAY_WEEKLY || keyName.indexOf(KEY_FRIDAY_WEEKLY + "_") === 0) {
    return {
      type: "weekly",
      day: 5,
      hour: 5,
      startDate: FRIDAY_START_DATE
    };
  }

  if (keyName === KEY_THURSDAY_WEEKLY || keyName.indexOf(KEY_THURSDAY_WEEKLY + "_") === 0) {
    return {
      type: "weekly",
      day: 4,
      hour: 17,
      startDate: THURSDAY_START_DATE
    };
  }

  if (keyName === KEY_SUNDAY_WEEKLY || keyName.indexOf(KEY_SUNDAY_WEEKLY + "_") === 0) {
    return {
      type: "weekly",
      day: 0,
      hour: 5,
      startDate: SUNDAY_START_DATE
    };
  }

  if (keyName === KEY_MONTHLY_CHECK || keyName.indexOf(KEY_MONTHLY_CHECK + "_") === 0) {
    return {
      type: "monthly",
      startDate: MONTHLY_START_DATE
    };
  }

  return null;
}

function isMonthlyDueActive(now) {
  const due = getMostRecentMonthlyDueDate(now);
  return now.getTime() >= due.getTime();
}

function getCycleKey(now, schedule) {
  const due = getMostRecentDueDate(now, schedule);
  return Utilities.formatDate(due, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function getMostRecentDueDate(now, schedule) {
  if (schedule.type === "monthly") {
    return getMostRecentMonthlyDueDate(now);
  }

  return getMostRecentWeeklyDueDate(now, schedule.day, schedule.hour);
}

function getMostRecentWeeklyDueDate(now, targetDay, targetHour) {
  const due = new Date(now);
  due.setMinutes(0, 0, 0);
  due.setHours(targetHour);

  let diff = due.getDay() - targetDay;

  if (diff < 0) diff += 7;

  due.setDate(due.getDate() - diff);

  if (now.getTime() < due.getTime()) {
    due.setDate(due.getDate() - 7);
  }

  return due;
}

function getMostRecentMonthlyDueDate(now) {
  let year = now.getFullYear();
  let month = now.getMonth();

  let due = getMonthlyDueDate(year, month);

  if (now.getTime() < due.getTime()) {
    month--;

    if (month < 0) {
      month = 11;
      year--;
    }

    due = getMonthlyDueDate(year, month);
  }

  return due;
}

function getMonthlyDueDate(year, month) {
  if (year === 2026 && month === 4) {
    return new Date(2026, 4, 31, 5, 0, 0);
  }

  const lastDay = new Date(year, month + 1, 0);
  return new Date(year, month, lastDay.getDate() - 1, 5, 0, 0);
}

function extractEpoch(note) {
  if (!note) return null;

  const match = note.match(/Epoch:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function extractLastCheckedFromK(sheet, row) {
  const cell = sheet.getRange(row, OUTPUT_COL_K);
  const noteEpoch = extractEpoch(cell.getNote());

  if (noteEpoch) return noteEpoch;

  const text = String(cell.getValue()).replace("Last checked:", "").trim();
  if (!text) return null;

  const parsed = new Date(text);
  const epoch = parsed.getTime();

  return isNaN(epoch) ? null : epoch;
}

function formatDuration(ms) {
  if (!ms || ms < 0) return "0h 0m";

  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);

  return `${hours}h ${minutes}m`;
}

function clearSessionData() {
  const props = PropertiesService.getDocumentProperties();

  props.deleteProperty("SESSION_START_EPOCH");
  props.deleteProperty("SESSION_LAST_ACTIVITY_EPOCH");
  props.deleteProperty("SESSION_END_EPOCH");
}
