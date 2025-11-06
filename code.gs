/***** CONFIG *****/
const SPREADSHEET_ID = '1Q9Qk0OV9oWsXPHi2viMTd2D2woScZm8pFDAjgORrM7A';
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1Q9Qk0OV9oWsXPHi2viMTd2D2woScZm8pFDAjgORrM7A/edit?gid=0';
const DEFAULT_INCLUDE_HIDDEN = false;    // incluir abas ocultas?
const DEFAULT_SKIP_BLANK_ROWS = true;    // pular linhas totalmente vazias?
const DEFAULT_VALUE_MODE = 'RAW';        // RAW | DISPLAY | FORMULAS
const API_KEY = 'CHANGE_ME';
const ALLOWED_ORIGINS = ['*'];           // Apps Script não permite setHeader; mantenha requisições simples no front
const WRITE_ALLOWED_SHEETS = [];         // deixe vazio para permitir todas

/***** INTERNAL UTILS *****/
const ValueMode = Object.freeze({ RAW: 'RAW', DISPLAY: 'DISPLAY', FORMULAS: 'FORMULAS' });

function openSS_() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim()) {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }
  return SpreadsheetApp.openByUrl(SPREADSHEET_URL);
}

function getRangeValuesByMode_(range, mode) {
  switch ((mode || DEFAULT_VALUE_MODE).toUpperCase()) {
    case ValueMode.DISPLAY:  return range.getDisplayValues();
    case ValueMode.FORMULAS: return range.getFormulas();
    default:                 return range.getValues(); // RAW
  }
}

function isRowEmpty_(row) {
  return row.every(v => String(v).trim() === '');
}

function normalizeHeaders_(headers) {
  const seen = {};
  return headers.map((h, i) => {
    let base = String(h || '').trim();
    if (!base) base = `col_${i + 1}`;
    base = base
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_')
      .toLowerCase() || `col_${i + 1}`;
    let name = base;
    let k = 2;
    while (seen[name]) name = `${base}_${k++}`;
    seen[name] = true;
    return name;
  });
}

function buildHeaderMap_(headers) {
  const map = new Map();
  headers.forEach((h, i) => map.set(h, i));
  return map;
}

function listSheets_(ss, includeHidden) {
  return ss.getSheets().filter(sh => includeHidden || !sh.isSheetHidden());
}

function toBoolean_(value, defaultValue) {
  if (typeof value === 'undefined' || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const str = String(value).toLowerCase();
  if (str === 'true' || str === '1') return true;
  if (str === 'false' || str === '0') return false;
  return defaultValue;
}

function toPositiveInt_(value, defaultValue, maxValue) {
  const n = parseInt(value, 10);
  if (isNaN(n) || n <= 0) return defaultValue;
  if (maxValue) return Math.min(n, maxValue);
  return n;
}

function parseValueMode_(mode) {
  const desired = String(mode || DEFAULT_VALUE_MODE).toUpperCase();
  return ValueMode[desired] ? desired : DEFAULT_VALUE_MODE;
}

function resolveOrigin_(e) {
  const candidates = [];
  if (e && e.parameter && e.parameter.origin) candidates.push(e.parameter.origin);
  if (e && e.headers) {
    if (e.headers.origin) candidates.push(e.headers.origin);
    if (e.headers.Origin) candidates.push(e.headers.Origin);
  }
  const allowed = ALLOWED_ORIGINS || [];
  if (allowed.indexOf('*') !== -1) {
    return candidates.find(o => o && allowed.indexOf(o) !== -1) || '*';
  }
  const candidate = candidates.find(o => allowed.indexOf(o) !== -1);
  if (candidate) return candidate;
  if (allowed.length) return allowed[0];
  return '*';
}

/** Pretty-print: ?pretty=true|1 => 2 espaços; ?pretty=<número> => n espaços; default 0 (compacto) */
function getPrettyIndent_(e) {
  if (!e || !e.parameter || typeof e.parameter.pretty === 'undefined') return 0;
  const p = String(e.parameter.pretty).toLowerCase();
  if (p === 'true' || p === '1') return 2;
  const n = parseInt(p, 10);
  return isNaN(n) || n < 0 ? 2 : n;
}

/**
 * IMPORTANTE: Apps Script NÃO permite setar headers arbitrários em ContentService.
 * Portanto, NÃO use .setHeader(). Mantenha as requisições do front "simples":
 *  - GET sem headers custom
 *  - POST com 'text/plain' e API key na query (?key=...)
 */
function withCors_(output, e) {
  // Sem setHeader; apenas garanta JSON
  return output.setMimeType(ContentService.MimeType.JSON);
}

function jsonResponse_(e, payload, status) {
  const body = (payload && typeof payload === 'object') ? payload : { ok: false, error: 'invalid_response' };
  if (typeof status !== 'undefined') body.status = status;
  const indent = getPrettyIndent_(e);
  return withCors_(ContentService.createTextOutput(JSON.stringify(body, null, indent)), e);
}

function errorResponse_(e, message, status, details) {
  const payload = { ok: false, error: message || 'unexpected_error' };
  if (details && Object.keys(details).length) payload.details = details;
  if (status) payload.status = status;
  return jsonResponse_(e, payload, status);
}

function toSheetMeta_(sheet) {
  return {
    name: sheet.getName(),
    sheetId: sheet.getSheetId(),
    lastRow: sheet.getLastRow(),
    lastColumn: sheet.getLastColumn(),
    hidden: sheet.isSheetHidden()
  };
}

function getSpreadsheetMeta(options) {
  const { includeHidden = DEFAULT_INCLUDE_HIDDEN } = options || {};
  const ss = openSS_();
  const sheets = listSheets_(ss, includeHidden).map(sh => toSheetMeta_(sh));
  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    fetchedAt: new Date().toISOString(),
    sheetCount: sheets.length,
    sheets
  };
}

function getSheetValues_(sheet, valueMode) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return [];
  const range = sheet.getRange(1, 1, lastRow, lastCol);
  return getRangeValuesByMode_(range, valueMode);
}

function buildObjectsFromValues_(values, skipBlankRows) {
  if (!values || !values.length) return { headers: [], rows: [] };
  const headers = normalizeHeaders_(values[0]);
  const body = values.slice(1);
  const filtered = skipBlankRows ? body.filter(r => !isRowEmpty_(r)) : body;
  const rows = filtered.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
  return { headers, rows };
}

function ensureColumnCapacity_(sheet, neededColumns) {
  if (!neededColumns) return;
  const maxCols = sheet.getMaxColumns();
  if (maxCols < neededColumns) {
    sheet.insertColumnsAfter(maxCols, neededColumns - maxCols);
  }
}

function getHeaderState_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) {
    return { headers: [], headerMap: buildHeaderMap_([]) };
  }
  const headerValues = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const headers = normalizeHeaders_(headerValues);
  return { headers, headerMap: buildHeaderMap_(headers) };
}

function prepareSheetForWrite_(sheet, requiredKeys, createMissingColumns) {
  const uniqueKeys = [];
  (requiredKeys || []).forEach(k => {
    if (k && uniqueKeys.indexOf(k) === -1) uniqueKeys.push(k);
  });
  let { headers } = getHeaderState_(sheet);
  let headerMap = buildHeaderMap_(headers);
  const warnings = [];

  if (!headers.length && uniqueKeys.length) {
    ensureColumnCapacity_(sheet, uniqueKeys.length);
    sheet.getRange(1, 1, 1, uniqueKeys.length).setValues([uniqueKeys]);
    headers = uniqueKeys.slice();
    headerMap = buildHeaderMap_(headers);
  }

  const missing = uniqueKeys.filter(k => !headerMap.has(k));
  if (missing.length) {
    if (!createMissingColumns) {
      warnings.push({ type: 'missingColumns', columns: missing.slice() });
    } else {
      ensureColumnCapacity_(sheet, headers.length + missing.length);
      sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
      headers = headers.concat(missing);
      headerMap = buildHeaderMap_(headers);
    }
  }

  return { headers, headerMap, warnings };
}

function buildRowObject_(headers, rowValues) {
  const obj = {};
  headers.forEach((h, i) => { obj[h] = rowValues[i]; });
  return obj;
}

function buildValuesFromObject_(headers, data) {
  return headers.map(h => (typeof data[h] === 'undefined' ? '' : data[h]));
}

function isOptionsRequest_(e) {
  return e && e.parameter && String(e.parameter.method || '').toUpperCase() === 'OPTIONS';
}

function parseJsonBody_(e) {
  if (!e || !e.postData) return null;
  const contents = e.postData.contents;
  if (!contents) return null;
  try {
    return JSON.parse(contents);
  } catch (err) {
    const error = new Error('invalid_json');
    error.status = 400;
    throw error;
  }
}

function getApiKey_(e) {
  const headerKey = e && e.headers && (e.headers['x-api-key'] || e.headers['X-Api-Key']);
  if (headerKey) return headerKey;
  if (e && e.parameter) {
    if (e.parameter['X-Api-Key']) return e.parameter['X-Api-Key'];
    if (e.parameter['x-api-key']) return e.parameter['x-api-key'];
    if (e.parameter.key) return e.parameter.key;
  }
  return null;
}

function ensureWriteAllowed_(sheetName) {
  if (!sheetName) {
    const err = new Error('sheet_required');
    err.status = 400;
    throw err;
  }
  if (WRITE_ALLOWED_SHEETS && WRITE_ALLOWED_SHEETS.length && WRITE_ALLOWED_SHEETS.indexOf(sheetName) === -1) {
    const err = new Error('write_not_allowed');
    err.code = 'write_not_allowed';
    err.status = 403;
    throw err;
  }
}

function findSheetByName_(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    const err = new Error('sheet_not_found');
    err.details = { sheet: name };
    err.code = 'sheet_not_found';
    err.status = 404;
    throw err;
  }
  return sheet;
}

function rowsMatch_(rowObj, match) {
  return Object.keys(match).every(key => String(rowObj[key]) === String(match[key]));
}

/***** READ OPERATIONS *****/
function buildMetaAndSheets_(includeHidden) {
  const ss = openSS_();
  const sheets = listSheets_(ss, includeHidden);
  const meta = {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    fetchedAt: new Date().toISOString(),
    sheetCount: sheets.length,
    sheets: sheets.map(sh => toSheetMeta_(sh))
  };
  return { ss, sheets, meta };
}

function getAllSheetsAsMatrices(options = {}) {
  const {
    includeHidden = DEFAULT_INCLUDE_HIDDEN,
    valueMode = DEFAULT_VALUE_MODE
  } = options;
  const ss = openSS_();
  const sheets = listSheets_(ss, includeHidden);
  const mode = parseValueMode_(valueMode);
  const result = {};
  sheets.forEach(sheet => {
    result[sheet.getName()] = getSheetValues_(sheet, mode);
  });
  return result;
}

function getAllSheetsAsObjects(options = {}) {
  const {
    includeHidden = DEFAULT_INCLUDE_HIDDEN,
    valueMode = DEFAULT_VALUE_MODE,
    skipBlankRows = DEFAULT_SKIP_BLANK_ROWS
  } = options;
  const ss = openSS_();
  const sheets = listSheets_(ss, includeHidden);
  const mode = parseValueMode_(valueMode);
  const result = {};
  sheets.forEach(sheet => {
    const values = getSheetValues_(sheet, mode);
    const { rows } = buildObjectsFromValues_(values, skipBlankRows);
    result[sheet.getName()] = rows;
  });
  return result;
}

function doGet(e) {
  try {
    if (e && e.parameter && String(e.parameter.ping || '') === '1') {
      return jsonResponse_(e, { ok: true, ts: new Date().toISOString() });
    }

    const params = e && e.parameter ? e.parameter : {};
    const mode = String(params.mode || 'objects').toLowerCase();
    const valueMode = parseValueMode_(params.valueMode);
    const includeHidden = toBoolean_(params.includeHidden, DEFAULT_INCLUDE_HIDDEN);
    const skipBlankRows = toBoolean_(params.skipBlankRows, DEFAULT_SKIP_BLANK_ROWS);
    const paginate = toBoolean_(params.paginate, false);
    const page = toPositiveInt_(params.page, 1);
    const pageSize = toPositiveInt_(params.pageSize, 500, 2000);
    const sheetName = params.sheet;

    const { sheets, meta } = buildMetaAndSheets_(includeHidden);

    if (paginate) {
      if (!sheetName) {
        return errorResponse_(e, 'missing_sheet_for_pagination', 400);
      }
      const sheet = sheets.find(sh => sh.getName() === sheetName);
      if (!sheet) {
        return errorResponse_(e, 'sheet_not_found', 404, { sheet: sheetName });
      }
      const values = getSheetValues_(sheet, valueMode);
      const headersRaw = values.length ? values[0] : [];
      const body = values.length ? values.slice(1) : [];
      const effectiveBody = mode === 'objects' && skipBlankRows ? body.filter(r => !isRowEmpty_(r)) : body;
      const totalRows = effectiveBody.length;
      const start = (page - 1) * pageSize;
      const end = Math.min(start + pageSize, totalRows);
      const slice = effectiveBody.slice(start, end);
      let data;
      if (mode === 'matrices') {
        data = values.length ? [headersRaw].concat(slice) : [];
      } else {
        const headers = normalizeHeaders_(headersRaw);
        data = slice.map(row => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = row[i]; });
          return obj;
        });
      }
      return jsonResponse_(e, {
        ok: true,
        meta,
        sheet: sheetName,
        page,
        pageSize,
        totalRows,
        data
      });
    }

    const payload = { ok: true, meta, bySheet: {} };
    sheets.forEach(sheet => {
      const values = getSheetValues_(sheet, valueMode);
      if (mode === 'matrices') {
        payload.bySheet[sheet.getName()] = values;
      } else {
        const { rows } = buildObjectsFromValues_(values, skipBlankRows);
        payload.bySheet[sheet.getName()] = rows;
      }
    });

    return jsonResponse_(e, payload);
  } catch (err) {
    return errorResponse_(e, err && err.message, 500, err && err.details ? err.details : {});
  }
}

/***** WRITE OPERATIONS *****/
function doPost(e) {
  try {
    if (isOptionsRequest_(e)) {
      return jsonResponse_(e, { ok: true, ts: new Date().toISOString() });
    }

    const apiKey = getApiKey_(e);
    if (!apiKey || apiKey !== API_KEY) {
      return errorResponse_(e, 'unauthorized', 401);
    }

    const body = parseJsonBody_(e);
    if (!body || typeof body !== 'object') {
      return errorResponse_(e, 'invalid_body', 400);
    }

    const op = String(body.op || '').toLowerCase();
    const sheetName = body.sheet;
    ensureWriteAllowed_(sheetName);

    const ss = openSS_();
    const sheet = findSheetByName_(ss, sheetName);
    const createMissingColumns = toBoolean_(body.createMissingColumns, false);

    let response;
    switch (op) {
      case 'update':
        response = handleUpdate_(sheet, body, createMissingColumns);
        break;
      case 'append':
        response = handleAppend_(sheet, body, createMissingColumns);
        break;
      case 'delete':
        response = handleDelete_(sheet, body);
        break;
      default:
        return errorResponse_(e, 'unsupported_operation', 400, { op: body.op });
    }

    if (!response || response.ok === false) {
      const status = response && response.status ? response.status : 400;
      return errorResponse_(
        e,
        response && response.error ? response.error : 'operation_failed',
        status,
        response && response.details ? response.details : undefined
      );
    }

    return jsonResponse_(e, response);
  } catch (err) {
    const details = err && err.details ? err.details : {};
    const status = err && err.status ? err.status : (err && err.code === 'write_not_allowed' ? 403 : 500);
    const message = err && err.message ? err.message : 'unexpected_error';
    return errorResponse_(e, message, status, details);
  }
}

function doOptions(e) {
  // Não é possível setar headers CORS aqui; mantenha o front sem preflight (sem headers custom).
  return jsonResponse_(e, { ok: true, ts: new Date().toISOString() });
}

function handleUpdate_(sheet, body, createMissingColumns) {
  const match = body.match || {};
  if (!match || typeof match !== 'object' || !Object.keys(match).length) {
    return { ok: false, error: 'missing_match', status: 400 };
  }
  const write = body.write || {};
  if (!write || typeof write !== 'object') {
    return { ok: false, error: 'missing_write', status: 400 };
  }
  const requiredKeys = [];
  Object.keys(match).forEach(k => { if (requiredKeys.indexOf(k) === -1) requiredKeys.push(k); });
  Object.keys(write).forEach(k => { if (requiredKeys.indexOf(k) === -1) requiredKeys.push(k); });

  const state = prepareSheetForWrite_(sheet, requiredKeys, createMissingColumns);
  const headerMap = state.headerMap;
  const missingMatch = Object.keys(match).filter(k => !headerMap.has(k));
  if (missingMatch.length) {
    return {
      ok: false,
      error: 'match_columns_not_found',
      details: { columns: missingMatch },
      status: 400
    };
  }

  const lastRow = sheet.getLastRow();
  const headerCount = state.headers.length;
  if (headerCount === 0 || lastRow <= 1) {
    if (toBoolean_(body.upsert, false)) {
      const newRow = Object.assign({}, match, write);
      return finalizeUpsertInsert_(sheet, newRow, createMissingColumns, state.warnings || []);
    }
    return { ok: true, updated: 0, inserted: 0, rows: [], warnings: state.warnings || [] };
  }

  const dataRange = sheet.getRange(2, 1, lastRow - 1, headerCount);
  const values = dataRange.getValues();
  const matches = [];
  values.forEach((row, idx) => {
    const obj = buildRowObject_(state.headers, row);
    if (rowsMatch_(obj, match)) {
      matches.push({ index: idx, values: row, object: obj });
    }
  });

  if (!matches.length) {
    if (toBoolean_(body.upsert, false)) {
      const newRow = Object.assign({}, match, write);
      return finalizeUpsertInsert_(sheet, newRow, createMissingColumns, state.warnings || []);
    }
    const response = { ok: true, updated: 0, inserted: 0, rows: [], warnings: state.warnings || [] };
    return response;
  }

  const effectiveWriteKeys = Object.keys(write).filter(k => headerMap.has(k));
  matches.forEach(entry => {
    effectiveWriteKeys.forEach(key => {
      const col = headerMap.get(key);
      entry.values[col] = write[key];
      entry.object[key] = write[key];
    });
  });

  matches.forEach(entry => {
    const rowNumber = entry.index + 2;
    sheet.getRange(rowNumber, 1, 1, headerCount).setValues([entry.values]);
  });

  return {
    ok: true,
    updated: matches.length,
    inserted: 0,
    rows: matches.map(entry => entry.object),
    warnings: state.warnings || []
  };
}

function finalizeUpsertInsert_(sheet, data, createMissingColumns, warnings) {
  const state = prepareSheetForWrite_(sheet, Object.keys(data), createMissingColumns);
  const headerCount = state.headers.length;
  if (!headerCount) {
    return { ok: false, error: 'no_columns_available', status: 400 };
  }
  const values = buildValuesFromObject_(state.headers, data);
  ensureColumnCapacity_(sheet, headerCount);
  sheet.appendRow(values);
  return {
    ok: true,
    updated: 0,
    inserted: 1,
    rows: [buildRowObject_(state.headers, values)],
    warnings: (warnings || []).concat(state.warnings || [])
  };
}

function handleAppend_(sheet, body, createMissingColumns) {
  const rowsInput = Array.isArray(body.rows) ? body.rows : (body.row ? [body.row] : []);
  if (!rowsInput.length) {
    return { ok: false, error: 'missing_rows', status: 400 };
  }
  const requiredKeys = [];
  rowsInput.forEach(row => {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach(k => { if (requiredKeys.indexOf(k) === -1) requiredKeys.push(k); });
    }
  });

  const state = prepareSheetForWrite_(sheet, requiredKeys, createMissingColumns);
  const headerCount = state.headers.length;
  if (!headerCount) {
    return { ok: false, error: 'no_columns_available', status: 400 };
  }

  const matrix = rowsInput.map(row => buildValuesFromObject_(state.headers, row || {}));
  const startRow = Math.max(2, sheet.getLastRow() + 1);
  ensureColumnCapacity_(sheet, headerCount);
  sheet.getRange(startRow, 1, matrix.length, headerCount).setValues(matrix);
  const appendedRows = matrix.map(values => buildRowObject_(state.headers, values));
  return {
    ok: true,
    appended: matrix.length,
    rows: appendedRows,
    warnings: state.warnings || []
  };
}

function handleDelete_(sheet, body) {
  const match = body.match || {};
  if (!match || typeof match !== 'object' || !Object.keys(match).length) {
    return { ok: false, error: 'missing_match', status: 400 };
  }

  const state = getHeaderState_(sheet);
  const headerCount = state.headers.length;
  if (!headerCount) {
    return { ok: true, deleted: 0 };
  }
  const missingMatch = Object.keys(match).filter(k => !state.headerMap.has(k));
  if (missingMatch.length) {
    return {
      ok: false,
      error: 'match_columns_not_found',
      details: { columns: missingMatch },
      status: 400
    };
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { ok: true, deleted: 0 };
  }
  const values = sheet.getRange(2, 1, lastRow - 1, headerCount).getValues();
  const rowsToDelete = [];
  values.forEach((row, idx) => {
    const obj = buildRowObject_(state.headers, row);
    if (rowsMatch_(obj, match)) {
      rowsToDelete.push(idx + 2);
    }
  });

  for (let i = rowsToDelete.length - 1; i >= 0; i--) {
    sheet.deleteRow(rowsToDelete[i]);
  }

  return {
    ok: true,
    deleted: rowsToDelete.length
  };
}

/***** EXPORTAR PARA O DRIVE (JSON) *****/
function saveAllAsJsonInDrive(options = {}) {
  const includeHidden = typeof options.includeHidden === 'undefined' ? DEFAULT_INCLUDE_HIDDEN : options.includeHidden;
  const skipBlankRows = typeof options.skipBlankRows === 'undefined' ? DEFAULT_SKIP_BLANK_ROWS : options.skipBlankRows;
  const valueMode = typeof options.valueMode === 'undefined' ? DEFAULT_VALUE_MODE : options.valueMode;
  const ss = openSS_();
  const sheets = listSheets_(ss, includeHidden);
  const payload = {
    meta: {
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      fetchedAt: new Date().toISOString(),
      sheetCount: sheets.length,
      sheets: sheets.map(sh => ({
        name: sh.getName(),
        sheetId: sh.getSheetId(),
        lastRow: sh.getLastRow(),
        lastColumn: sh.getLastColumn(),
        hidden: sh.isSheetHidden()
      }))
    },
    bySheet: {}
  };
  const data = getAllSheetsAsObjects({ includeHidden, valueMode, skipBlankRows });
  Object.keys(data).forEach(name => {
    payload.bySheet[name] = data[name];
  });

  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fname = `export_${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}.json`;
  const blob = Utilities.newBlob(JSON.stringify(payload, null, 2), 'application/json', fname);
  const file = DriveApp.createFile(blob);
  Logger.log('Arquivo criado: ' + file.getUrl());
  return file.getUrl();
}

/***** DEMOS RÁPIDOS *****/
function demoLogAll() {
  const meta = getSpreadsheetMeta({});
  Logger.log(JSON.stringify(meta, null, 2));

  const data = getAllSheetsAsObjects({ valueMode: 'RAW' });
  Logger.log('Abas lidas: ' + Object.keys(data).join(', '));
}

function demoSaveJson() {
  const url = saveAllAsJsonInDrive({ valueMode: 'DISPLAY' });
  Logger.log('JSON salvo em: ' + url);
}
