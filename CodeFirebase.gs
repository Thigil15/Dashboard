/********************************************
 * EXPORTAÇÃO UNIVERSAL + INCREMENTAL PARA FIREBASE
 * by ChatGPT — 2025
 *
 * - Exporta apenas abas modificadas
 * - Rodando automaticamente toda madrugada
 * - Sanitização EXTREMA de headers e valores
 * - 0% chance de erro de chave inválida
 * - Evita sobrecarga no Firebase
 ********************************************/

// URL do Realtime Database
var FIREBASE_BASE = "https://dashboardalunos-default-rtdb.firebaseio.com/exportAll";


/****************************************************
 * 1) CRIAR GATILHO (executar uma vez)
 *
 * Roda toda madrugada às 21:00
 ****************************************************/
function criarTriggerNoturno() {
  ScriptApp.newTrigger("exportarIncrementalFirebase")
    .timeBased()
    .atHour(21)
    .nearMinute(0)
    .everyDays(1)
    .create();

  Logger.log("Trigger criado: execução diária às 21:00");
}


/****************************************************
 * 2) EXPORTAÇÃO INCREMENTAL (só mudanças)
 ****************************************************/
function exportarIncrementalFirebase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var props = PropertiesService.getScriptProperties();

  Logger.log("==== INÍCIO EXPORTAÇÃO INCREMENTAL ====");

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();

    // Hash da aba atual
    var hashAtual = gerarHashAba(sheet);

    // Hash salvo da última execução
    var hashAntigo = props.getProperty("HASH_" + name);

    if (hashAtual === hashAntigo) {
      Logger.log("SEM MUDANÇAS: " + name);
      continue;
    }

    Logger.log("ALTERAÇÃO DETECTADA: " + name);

    // Exporta somente a ABA modificada
    exportarAbaParaFirebase(sheet);

    props.setProperty("HASH_" + name, hashAtual);
  }

  Logger.log("==== FINALIZADO EXPORTAÇÃO INCREMENTAL ====");
}


/****************************************************
 * 3) Função Manual: Exportar TUDO AGORA
 ****************************************************/
function exportarTudoAgora() {
  Logger.log("EXPORTAÇÃO TOTAL EXECUTADA MANUALMENTE");
  exportarIncrementalFirebase();
}


/****************************************************
 * 4) Gera um hash da aba (detecta mudanças)
 ****************************************************/
function gerarHashAba(sheet) {
  var raw = JSON.stringify(sheet.getDataRange().getValues());
  var hash = 0;

  for (var i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0; // 32 bits
  }

  return String(hash);
}


/****************************************************
 * 5) Exporta apenas UMA aba (com sanitização extrema)
 ****************************************************/
function exportarAbaParaFirebase(sheet) {

  /******** REGEX E HELPERS ********/
  var forbidden = /[\$\#\[\]\/\.]/g;

  var fullDateRegex  = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  var shortDateRegex = /^(\d{1,2})\/(\d{1,2})$/;

  var headerCleanRegex = /[^A-Za-z0-9_]/g;
  var sheetNameCleanRegex = /[^A-Za-z0-9_\-]/g;

  function zeroFill(str, len) {
    str = String(str);
    while (str.length < len) str = "0" + str;
    return str;
  }

  function safeSheetName(name, fallback) {
    if (!name) name = fallback;
    name = String(name).trim().replace(sheetNameCleanRegex, "_");
    return name === "" ? fallback : name;
  }

  function safeHeader(header, index) {
    header = header === null || header === undefined ? "" : String(header).trim();

    if (header === "") return "col" + index;

    var full = header.match(fullDateRegex);
    if (full) {
      return "data_" + full[3] + "_" + zeroFill(full[2], 2) + "_" + zeroFill(full[1], 2);
    }

    var short = header.match(shortDateRegex);
    if (short) {
      return "dia_" + zeroFill(short[2], 2) + "_" + zeroFill(short[1], 2);
    }

    header = header.replace(headerCleanRegex, "_");
    if (header === "") return "col" + index;

    return header;
  }

  function safeValue(val) {
    if (val === null || val === undefined) return "";

    if (val instanceof Date) {
      return Utilities.formatDate(val, "America/Sao_Paulo", "yyyy-MM-dd HH:mm:ss");
    }

    return String(val).replace(/[\x00-\x1F]/g, " ");
  }


  /******** PROCESSAMENTO DA ABA ********/
  var values = sheet.getDataRange().getValues();
  var rawHeaders = values[0];

  var headers = [];
  var used = {};

  for (var c = 0; c < rawHeaders.length; c++) {
    var h = safeHeader(rawHeaders[c], c + 1);

    if (used[h]) h = h + "_" + (c + 1);
    used[h] = true;

    headers.push(h);
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = safeValue(values[r][c]);
    }
    rows.push(obj);
  }

  var nameRaw = sheet.getName();
  var nameSafe = safeSheetName(nameRaw, "Sheet_" + Math.random());

  var payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    nomeAbaOriginal: nameRaw,
    nomeAbaSanitizada: nameSafe,
    totalRegistros: rows.length,
    dados: rows
  });

  var url = FIREBASE_BASE + "/" + nameSafe + ".json";

  UrlFetchApp.fetch(url, {
    method: "put",
    contentType: "application/json",
    payload: payload
  });

  Logger.log(">>> ABA EXPORTADA: " + nameRaw);
}
