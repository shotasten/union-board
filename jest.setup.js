// Google Apps Script API のモック
global.Logger = {
  log: jest.fn(),
};

global.SpreadsheetApp = {
  getActiveSpreadsheet: jest.fn(),
  openById: jest.fn(),
};

global.CalendarApp = {
  createCalendar: jest.fn(),
  getCalendarById: jest.fn(),
  getCalendarsByName: jest.fn(),
};

global.HtmlService = {
  createHtmlOutputFromFile: jest.fn(),
  createHtmlOutput: jest.fn(),
};

global.Utilities = {
  computeDigest: jest.fn(),
  computeHmacSha256Signature: jest.fn(),
  getUuid: jest.fn(() => 'mock-uuid-123'),
};

global.PropertiesService = {
  getScriptProperties: jest.fn(() => ({
    getProperty: jest.fn(),
    setProperty: jest.fn(),
    deleteProperty: jest.fn(),
  })),
  getUserProperties: jest.fn(() => ({
    getProperty: jest.fn(),
    setProperty: jest.fn(),
  })),
};

// スプレッドシートのモック
const mockSheet = {
  getDataRange: jest.fn(() => ({
    getValues: jest.fn(() => []),
  })),
  getRange: jest.fn(() => ({
    getValue: jest.fn(),
    getValues: jest.fn(() => []),
    setValue: jest.fn(),
    setValues: jest.fn(),
  })),
  getLastRow: jest.fn(() => 0),
  appendRow: jest.fn(),
  deleteRow: jest.fn(),
  getName: jest.fn(() => 'MockSheet'),
};

global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue({
  getSheetByName: jest.fn(() => mockSheet),
  getSheets: jest.fn(() => [mockSheet]),
  insertSheet: jest.fn(() => mockSheet),
});

global.SpreadsheetApp.openById.mockReturnValue({
  getSheetByName: jest.fn(() => mockSheet),
  getSheets: jest.fn(() => [mockSheet]),
});

// カレンダーのモック
const mockCalendar = {
  createEvent: jest.fn(() => ({
    getId: jest.fn(() => 'mock-event-id'),
    setDescription: jest.fn(),
    getDescription: jest.fn(() => ''),
  })),
  getEvents: jest.fn(() => []),
  getEventsForDay: jest.fn(() => []),
  getName: jest.fn(() => 'MockCalendar'),
  getId: jest.fn(() => 'mock-calendar-id'),
};

global.CalendarApp.createCalendar.mockReturnValue(mockCalendar);
global.CalendarApp.getCalendarById.mockReturnValue(mockCalendar);
global.CalendarApp.getCalendarsByName.mockReturnValue([mockCalendar]);

