/** Code.gs — Backend atualizado: PontoPratica + PontoTeoria (compatível v32) */

const SHEET_NAMES = {
  ALUNOS: 'Alunos',
  PONTOPRATICA: 'PontoPratica',
  PONTOTEORIA: 'PontoTeoria',
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
  const pontoRegistros = getCombinedPontoRecords_();
  return {
    success: true,
    alunos,
    ausenciasReposicoes: ausRep,
    notasTeoricas: notasT,
    notasPraticas: notasP,
    escalas,
    pontoRegistros
  };
}

/**
 * Helper: Converte Data (Date ou dd/MM/yyyy) para ISO (YYYY-MM-DD)
 */
function convertToISO_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, "America/Sao_Paulo", "yyyy-MM-dd");
  }
  var str = String(value).trim();
  // Se já está em formato ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Se está em formato BR (dd/MM/yyyy)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    var parts = str.split('/');
    return parts[2] + '-' + parts[1] + '-' + parts[0];
  }
  return '';
}

/**
 * Retorna todos os registros das abas PontoPratica e PontoTeoria
 * com o campo adicional 'Pratica/Teoria' normalizado e DataISO adicionado.
 */
function getCombinedPontoRecords_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = [];

  var sheetsToRead = [SHEET_NAMES.PONTOPRATICA, SHEET_NAMES.PONTOTEORIA];
  sheetsToRead.forEach(function(sheetName) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    var rows = getSheetDataAsJSON_(sh); // usa util existente
    if (!rows || !rows.length) return;
    // tipo sem acento e sem barra: 'Pratica' ou 'Teoria'
    var tipo = (sheetName === SHEET_NAMES.PONTOPRATICA) ? 'Pratica' : 'Teoria';
    rows.forEach(function(r) {
      var copy = Object.assign({}, r);
      
      // Normaliza o campo Data para ISO
      var dataISO = convertToISO_(copy.Data || copy.data || copy.DATA);
      if (dataISO) {
        copy.DataISO = dataISO;
      }
      
      // normaliza várias formas de campo final e garante igualdade
      copy['Pratica/Teoria'] = (
        (copy['Pratica/Teoria'] && String(copy['Pratica/Teoria']).toString().trim()) ||
        (copy['Prática/Teórica'] && String(copy['Prática/Teórica']).toString().trim()) ||
        (copy['Pratica'] && String(copy['Pratica']).toString().trim()) ||
        (copy['Prática'] && String(copy['Prática']).toString().trim()) ||
        (copy['Teoria'] && String(copy['Teoria']).toString().trim()) ||
        (copy['Teórica'] && String(copy['Teórica']).toString().trim()) ||
        tipo
      );
      // também padroniza para sem acento: 'Pratica' or 'Teoria'
      var v = String(copy['Pratica/Teoria'] || '').trim();
      if (/prá?tica/i.test(v)) copy['Pratica/Teoria'] = 'Pratica';
      else if (/teór?ica|teoria/i.test(v)) copy['Pratica/Teoria'] = 'Teoria';
      else copy['Pratica/Teoria'] = tipo;
      out.push(copy);
    });
  });

  return out;
}

/** Hoje (dd/MM/yyyy) em America/Sao_Paulo) — agora considera as duas abas */
function getPontoHoje_() {
  var todayBR = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy");
  var all = getCombinedPontoRecords_();

  var hoje = all.filter(function(p) {
    var v = p.Data;
    if (v instanceof Date) {
      return Utilities.formatDate(v, "America/Sao_Paulo", "dd/MM/yyyy") === todayBR;
    }
    return String(v || '').trim() === todayBR;
  });

  var parts = todayBR.split('/');
  var dataISO = parts.length === 3 ? (parts[2] + '-' + parts[1] + '-' + parts[0]) : '';

  return {
    success: true,
    hoje: hoje,
    lastUpdate: new Date().toISOString(),
    dataISO: dataISO
  };
}

/** Filtra Ponto por Escala + Data (YYYY-MM-DD) — agora busca em ambas as abas */
function getPontoPorEscala_(escala, dataISO) {
  var all = getCombinedPontoRecords_();

  // Converte ISO -> dd/MM/yyyy
  var dataBR = '';
  if (dataISO && /^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
    var parts = dataISO.split('-');
    dataBR = parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  var registros = all.filter(function(p) {
    // Data
    var okDate = true;
    if (dataBR) {
      if (p.Data instanceof Date) {
        okDate = Utilities.formatDate(p.Data, "America/Sao_Paulo", "dd/MM/yyyy") === dataBR;
      } else {
        okDate = String(p.Data || '').trim() === dataBR;
      }
    }

    // Escala (case-insensitive)
    var okEscala = true;
    if (escala && escala.trim() !== '') {
      var valorEscala = String(p.Escala || p['Escala'] || '').trim().toLowerCase();
      okEscala = valorEscala === escala.trim().toLowerCase();
    }

    return okDate && okEscala;
  });

  return {
    success: true,
    escala: escala || 'all',
    data: dataISO || 'todas',
    registros: registros,
    lastUpdate: new Date().toISOString()
  };
}

/* --- Extras: helper para escrita nas abas (opcional) --- */
/**
 * appendPontoPraticaRow: útil se for gravar via script (mantém ordem de colunas).
 * A função detecta cabeçalho automaticamente e preenche nas colunas corretas.
 */
function appendPontoPraticaRow(obj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAMES.PONTOPRATICA);
  if (!sh) throw new Error("Aba PontoPratica não encontrada");
  var headers = sh.getDataRange().getValues()[0].map(h => String(h).trim());
  var row = headers.map(h => {
    if (h === 'Data') return obj.Data || '';
    if (h === 'HoraEntrada') return obj.HoraEntrada || '';
    if (h === 'HoraSaida') return obj.HoraSaida || '';
    if (h === 'SerialNumber') return obj.SerialNumber || '';
    if (h === 'NomeCompleto') return obj.NomeCompleto || '';
    if (h === 'EmailHC') return obj.EmailHC || '';
    if (h === 'Escala') return obj.Escala || '';
    if (h === 'Pratica' || h === 'Pratica/Teoria' || h === 'Prática') return 'Pratica';
    return obj[h] || '';
  });
  sh.appendRow(row);
}

/**
 * appendPontoTeoriaRow: idem para PontoTeoria
 */
function appendPontoTeoriaRow(obj) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAMES.PONTOTEORIA);
  if (!sh) throw new Error("Aba PontoTeoria não encontrada");
  var headers = sh.getDataRange().getValues()[0].map(h => String(h).trim());
  var row = headers.map(h => {
    if (h === 'Data') return obj.Data || '';
    if (h === 'HoraEntrada') return obj.HoraEntrada || '';
    if (h === 'HoraSaida') return obj.HoraSaida || '';
    if (h === 'SerialNumber') return obj.SerialNumber || '';
    if (h === 'NomeCompleto') return obj.NomeCompleto || '';
    if (h === 'EmailHC') return obj.EmailHC || '';
    if (h === 'Escala') return obj.Escala || '';
    if (h === 'Teoria' || h === 'Pratica/Teoria' || h === 'Teórica') return 'Teoria';
    return obj[h] || '';
  });
  sh.appendRow(row);
}
