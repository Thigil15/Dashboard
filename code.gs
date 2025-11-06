/***** CONFIG *****/
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1Q9Qk0OV9oWsXPHi2viMTd2D2woScZm8pFDAjgORrM7A/edit?gid=0';
const DEFAULT_INCLUDE_HIDDEN = false;    // incluir abas ocultas?
const DEFAULT_SKIP_BLANK_ROWS = true;    // pular linhas totalmente vazias?
const DEFAULT_VALUE_MODE = 'RAW';        // RAW | DISPLAY | FORMULAS

/***** INTERNAL UTILS *****/
const ValueMode = Object.freeze({ RAW: 'RAW', DISPLAY: 'DISPLAY', FORMULAS: 'FORMULAS' });

function openSS_() {
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
    if (!base) base = `col_${i+1}`;
    // slug simples (sem acento e espaços)
    base = base
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_')
      .toLowerCase() || `col_${i+1}`;
    let name = base;
    let k = 2;
    while (seen[name]) name = `${base}_${k++}`;
    seen[name] = true;
    return name;
  });
}

function listSheets_(ss, includeHidden) {
  return ss.getSheets().filter(sh => includeHidden || !sh.isSheetHidden());
}

/***** CORE: LEITURA DINÂMICA DE TODAS AS ABAS *****/
function getAllSheetsAsMatrices(options = {}) {
  const {
    includeHidden = DEFAULT_INCLUDE_HIDDEN,
    valueMode = DEFAULT_VALUE_MODE
  } = options;

  const ss = openSS_();
  const out = {};
  for (const sh of listSheets_(ss, includeHidden)) {
    const rng = sh.getDataRange();
    const values = getRangeValuesByMode_(rng, valueMode);
    out[sh.getName()] = values;
  }
  return out;
}

function getAllSheetsAsObjects(options = {}) {
  const {
    includeHidden = DEFAULT_INCLUDE_HIDDEN,
    valueMode = DEFAULT_VALUE_MODE,
    skipBlankRows = DEFAULT_SKIP_BLANK_ROWS
  } = options;

  const ss = openSS_();
  const out = {};
  for (const sh of listSheets_(ss, includeHidden)) {
    const rng = sh.getDataRange();
    const values = getRangeValuesByMode_(rng, valueMode);
    if (!values.length) { out[sh.getName()] = []; continue; }

    const headers = normalizeHeaders_(values[0]);
    const rows = values.slice(1)
      .filter(r => !skipBlankRows || !isRowEmpty_(r))
      .map(r => {
        const obj = {};
        headers.forEach((h, i) => obj[h] = r[i]);
        return obj;
      });

    out[sh.getName()] = rows;
  }
  return out;
}

/***** METADADOS ÚTEIS *****/
function getSpreadsheetMeta(options = {}) {
  const { includeHidden = DEFAULT_INCLUDE_HIDDEN } = options;
  const ss = openSS_();
  const sheets = listSheets_(ss, includeHidden).map(s => ({
    sheetId: s.getSheetId(),
    name: s.getName(),
    rows: s.getMaxRows(),
    cols: s.getMaxColumns(),
    lastRowWithData: s.getLastRow(),
    lastColWithData: s.getLastColumn(),
    hidden: s.isSheetHidden()
  }));
  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    fetchedAt: new Date().toISOString(),
    sheetCount: sheets.length,
    sheets
  };
}

/***** EXPORTAR PARA O DRIVE (JSON) *****/
function saveAllAsJsonInDrive(options = {}) {
  const payload = {
    meta: getSpreadsheetMeta(options),
    bySheet: getAllSheetsAsObjects(options),
  };
  const ts = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fname = `export_${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())}_${pad(ts.getHours())}-${pad(ts.getMinutes())}-${pad(ts.getSeconds())}.json`;
  const blob = Utilities.newBlob(JSON.stringify(payload, null, 2), 'application/json', fname);
  const file = DriveApp.createFile(blob);
  Logger.log('Arquivo criado: ' + file.getUrl());
  return file.getUrl();
}

/***** DEMOS RÁPIDOS *****/
function demoLogAll() {
  const meta = getSpreadsheetMeta();
  Logger.log(JSON.stringify(meta, null, 2));

  const data = getAllSheetsAsObjects({ valueMode: 'RAW' });
  Logger.log('Abas lidas: ' + Object.keys(data).join(', '));
  // Logger.log(JSON.stringify(data, null, 2));
}

function demoSaveJson() {
  const url = saveAllAsJsonInDrive({ valueMode: 'DISPLAY' });
  Logger.log('JSON salvo em: ' + url);
}

/***** WEBAPP (GET) COM OPÇÕES + PAGINAÇÃO *****/
// Deploy: Publicar > Implantar > Tipo: Web app > Executar como: você > Quem tem acesso: conforme necessidade.
// Parâmetros (query string):
//   mode=objects|matrices (default: objects)
//   valueMode=RAW|DISPLAY|FORMULAS (default: RAW)
//   includeHidden=true|false
//   skipBlankRows=true|false
//   sheet=NomeDaAba (opcional; sem isso retorna todas)
//   paginate=true|false (se true, precisa de "sheet"; pagina por linhas)
//   page=1 (default)  pageSize=500 (default)
function doGet(e) {
  const p = e && e.parameter ? e.parameter : {};
  const mode = (p.mode || 'objects').toLowerCase();
  const valueMode = (p.valueMode || DEFAULT_VALUE_MODE).toUpperCase();
  const includeHidden = String(p.includeHidden || DEFAULT_INCLUDE_HIDDEN) === 'true';
  const skipBlankRows = String(p.skipBlankRows || DEFAULT_SKIP_BLANK_ROWS) === 'true';
  const sheetName = p.sheet;
  const paginate = String(p.paginate || 'false') === 'true';
  const page = Math.max(1, parseInt(p.page || '1', 10));
  const pageSize = Math.max(1, Math.min(2000, parseInt(p.pageSize || '500', 10)));

  const ss = openSS_();
  const sheets = listSheets_(ss, includeHidden);
  const res = { meta: getSpreadsheetMeta({ includeHidden }) };

  if (paginate) {
    if (!sheetName) {
      return jsonOut_({ error: 'Para paginação, informe ?sheet=NomeDaAba' }, 400);
    }
    const sh = sheets.find(s => s.getName() === sheetName);
    if (!sh) return jsonOut_({ error: `Aba "${sheetName}" não encontrada.` }, 404);

    const rng = sh.getDataRange();
    const values = getRangeValuesByMode_(rng, valueMode);
    const headers = values.length ? normalizeHeaders_(values[0]) : [];
    const body = values.slice(1);

    const start = (page - 1) * pageSize;
    const end = Math.min(start + pageSize, body.length);
    const slice = body.slice(start, end);

    res.page = page;
    res.pageSize = pageSize;
    res.totalRows = body.length;
    res.sheet = sheetName;

    if (mode === 'matrices') {
      res.data = [headers, ...slice];
    } else {
      res.data = slice.map(r => {
        const o = {};
        headers.forEach((h, i) => o[h] = r[i]);
        return o;
      });
    }
    return jsonOut_(res);
  }

  // sem paginação: traz tudo
  if (mode === 'matrices') {
    res.bySheet = {};
    for (const sh of sheets) {
      const vals = getRangeValuesByMode_(sh.getDataRange(), valueMode);
      res.bySheet[sh.getName()] = vals;
    }
  } else {
    res.bySheet = {};
    for (const sh of sheets) {
      const vals = getRangeValuesByMode_(sh.getDataRange(), valueMode);
      if (!vals.length) { res.bySheet[sh.getName()] = []; continue; }
      const headers = normalizeHeaders_(vals[0]);
      const rows = vals.slice(1)
        .filter(r => !skipBlankRows || !isRowEmpty_(r))
        .map(r => {
          const o = {};
          headers.forEach((h, i) => o[h] = r[i]);
          return o;
        });
      res.bySheet[sh.getName()] = rows;
    }
  }

  return jsonOut_(res);
}

function jsonOut_(obj, status = 200) {
  const out = ContentService.createTextOutput(JSON.stringify(obj, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
  // Nota: Apps Script não permite setar status custom no simple webapp; incluímos no payload:
  return out;
}
