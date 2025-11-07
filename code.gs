/** Code.gs — Backend simples, compatível com o v32 do site (GET + action) */

const SHEET_NAMES = {
  ALUNOS: 'Alunos',
  PONTO: 'Ponto',
  AUSENCIAS: 'AusenciasReposicoes',
  NOTAS_TEORICAS: 'NotasTeoricas',
  ESCALA1: 'Escala1', ESCALA2: 'Escala2', ESCALA3: 'Escala3',
  ESCALA4: 'Escala4', ESCALA5: 'Escala5', ESCALA6: 'Escala6', ESCALA7: 'Escala7',
  NP1: 'NotasPraticas1', NP2: 'NotasPraticas2', NP3: 'NotasPraticas3',
  NP4: 'NotasPraticas4', NP5: 'NotasPraticas5', NP6: 'NotasPraticas6', NP7: 'NotasPraticas7'
};

const ESCALA_SHEETS = [
  SHEET_NAMES.ESCALA1, SHEET_NAMES.ESCALA2, SHEET_NAMES.ESCALA3,
  SHEET_NAMES.ESCALA4, SHEET_NAMES.ESCALA5, SHEET_NAMES.ESCALA6, SHEET_NAMES.ESCALA7
];

const NOTAS_PRATICAS_SHEETS = [
  SHEET_NAMES.NP1, SHEET_NAMES.NP2, SHEET_NAMES.NP3,
  SHEET_NAMES.NP4, SHEET_NAMES.NP5, SHEET_NAMES.NP6, SHEET_NAMES.NP7
];

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : '';
    if (!action) return json_({ success: false, message: 'Informe ?action=' });

    if (action === 'getAll') {
      return json_(getAll_());
    }

    if (action === 'getPontoHoje_') {
      return json_(getPontoHoje_());
    }

    if (action === 'getPontoPorEscala_') {
      const dataISO = (e.parameter.data || '').trim();     // YYYY-MM-DD
      const escala  = (e.parameter.escala || '').trim();   // texto exato da Escala
      return json_(getPontoPorEscala_(escala, dataISO));
    }

    return json_({ success: false, message: 'Ação desconhecida: ' + action });
  } catch (err) {
    return json_({ success: false, message: String(err && err.message || err) });
  }
}

/** Util: JSON */
function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Lê uma aba (1ª linha = cabeçalho) => array de objetos */
function getSheetDataAsJSON_(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const o = {};
    headers.forEach((h, idx) => { if (h) o[h] = row[idx]; });
    out.push(o);
  }
  return out;
}

/** Escalas: detecta colunas dd/mm e monta o payload esperado pelo front */
function processEscalas_(ss) {
  const out = {};
  ESCALA_SHEETS.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const rows = getSheetDataAsJSON_(sh);
    if (!rows.length) return;

    const infoKeys = ['NomeCompleto','EmailHC','Curso','Unidade','Supervisor','Reposicoes','Atrasos/Saidas'];
    const sample = rows[0] || {};
    const headersDay = Object.keys(sample)
      .filter(k => !infoKeys.includes(k) && /^\d{1,2}\/\d{1,2}$/.test(String(k).trim()))
      .map(k => {
        const [d,m] = String(k).split('/');
        return `${d.padStart(2,'0')}/${m.padStart(2,'0')}`;
      });

    out[name] = {
      nomeEscala: name,
      headersDay,
      alunos: rows
    };
  });
  return out;
}

function processNotasTeoricas_(sheet) {
  return { registros: getSheetDataAsJSON_(sheet) };
}

function processNotasPraticas_(ss) {
  const map = {};
  NOTAS_PRATICAS_SHEETS.forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const registros = getSheetDataAsJSON_(sh);
    map[name] = { nomePratica: name, registros };
  });
  return map;
}

/** GET ALL: reúne tudo que o front consome */
function getAll_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const alunos   = getSheetDataAsJSON_(ss.getSheetByName(SHEET_NAMES.ALUNOS));
  const ausRep   = getSheetDataAsJSON_(ss.getSheetByName(SHEET_NAMES.AUSENCIAS));
  const notasT   = processNotasTeoricas_(ss.getSheetByName(SHEET_NAMES.NOTAS_TEORICAS));
  const notasP   = processNotasPraticas_(ss);
  const escalas  = processEscalas_(ss);
  return {
    success: true,
    alunos,
    ausenciasReposicoes: ausRep,
    notasTeoricas: notasT,
    notasPraticas: notasP,
    escalas
  };
}

/** Hoje (dd/MM/yyyy) em America/Sao_Paulo) */
function getPontoHoje_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.PONTO);
  if (!sh) return { success: false, message: "Aba 'Ponto' não encontrada." };

  const todayBR = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy");
  const all = getSheetDataAsJSON_(sh);
  const hoje = all.filter(p => {
    const v = p.Data;
    if (v instanceof Date) {
      return Utilities.formatDate(v, "America/Sao_Paulo", "dd/MM/yyyy") === todayBR;
    }
    return String(v || '').trim() === todayBR;
  });

  // opcional: expose também data ISO
  const parts = todayBR.split('/');
  const dataISO = `${parts[2]}-${parts[1]}-${parts[0]}`;

  return {
    success: true,
    hoje,
    lastUpdate: new Date().toISOString(),
    dataISO
  };
}

/** Filtra Ponto por Escala + Data (YYYY-MM-DD) */
function getPontoPorEscala_(escala, dataISO) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAMES.PONTO);
  if (!sh) return { success: false, message: "Aba 'Ponto' não encontrada." };

  const all = getSheetDataAsJSON_(sh);

  // Converte ISO -> dd/MM/yyyy
  let dataBR = '';
  if (dataISO && /^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    const [y,m,d] = dataISO.split('-');
    dataBR = `${d}/${m}/${y}`;
  }

  const registros = all.filter(p => {
    // Data
    let okDate = true;
    if (dataBR) {
      if (p.Data instanceof Date) {
        okDate = Utilities.formatDate(p.Data, "America/Sao_Paulo", "dd/MM/yyyy") === dataBR;
      } else {
        okDate = String(p.Data || '').trim() === dataBR;
      }
    }

    // Escala
    let okEscala = true;
    if (escala && escala.trim() !== '') {
      okEscala = String(p.Escala || '').trim().toLowerCase() === escala.trim().toLowerCase();
    }

    return okDate && okEscala;
  });

  return {
    success: true,
    escala: escala || 'all',
    data: dataISO || 'todas',
    registros,
    lastUpdate: new Date().toISOString()
  };
}
