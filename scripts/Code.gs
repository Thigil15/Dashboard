/**********************************************
 * 🔧 CONFIGURAÇÕES GERAIS
 **********************************************/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Nomes das abas (constantes para evitar erros de digitação)
const ABA_AUSENCIAS = 'Ausencias';
const ABA_REPOSICOES = 'Reposicoes';
const ABA_PONTO_PRATICA = 'PontoPratica';
const ABA_PONTO_TEORIA = 'PontoTeoria';

// Headers padrão para abas de ponto (usado quando aba está vazia)
const HEADERS_PONTO_PADRAO = ['SerialNumber', 'EmailHC', 'NomeCompleto', 'Data', 'HoraEntrada', 'HoraSaida', 'Escala', 'Tipo'];

// Threshold para distinguir seriais do Excel de timestamps Unix
// Números > 50000 são seriais Excel (dias desde 1/1/1900)
// Números < 50000 são timestamps Unix (milissegundos desde 1/1/1970)
const EXCEL_SERIAL_THRESHOLD = 50000;

// Nomes das funções de gatilhos instaláveis
const TRIGGER_FUNCTIONS = [
  'onEditPontoInstalavel', 'onChangePontoInstalavel',
];

/**********************************************
 * 📡 API - Servir dados via URL (doGet)
 **********************************************/

/**
 * Serve todos os dados das abas como JSON via URL
 * Exemplo de URL: https://script.google.com/.../exec
 * Exemplo com aba específica: https://script.google.com/.../exec?aba=Alunos
 * 
 * @param {Object} e - Objeto de evento com parâmetros da query string
 * @returns {TextOutput} JSON com os dados solicitados
 */
function doGet(e) {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    const parametros = e.parameter || {};
    const abaEspecifica = parametros.aba;
    
    // Se uma aba específica foi solicitada
    if (abaEspecifica) {
      const aba = planilha.getSheetByName(abaEspecifica);
      if (!aba) {
        return ContentService.createTextOutput(JSON.stringify({
          erro: "Aba não encontrada",
          abaSolicitada: abaEspecifica
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      const dados = aba.getDataRange().getValues();
      if (dados.length < 2) {
        return ContentService.createTextOutput(JSON.stringify({
          aba: abaEspecifica,
          registros: [],
          metadados: {
            totalRegistros: 0,
            ultimaAtualizacao: new Date().toISOString()
          }
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      const cabecalhos = dados.shift().map(h => sanitizeKey(h));
      const registros = criarRegistrosDeAba(dados, cabecalhos);
      
      return ContentService.createTextOutput(JSON.stringify({
        aba: abaEspecifica,
        registros: registros,
        metadados: {
          totalRegistros: registros.length,
          ultimaAtualizacao: new Date().toISOString()
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Se nenhuma aba específica foi solicitada, retorna todas as abas
    const abas = planilha.getSheets();
    const resultado = {
      cache: {},
      metadados: {
        totalAbas: 0,
        ultimaAtualizacao: new Date().toISOString()
      }
    };
    
    for (let aba of abas) {
      const nomeAba = aba.getName();
      const nomeAbaSanitizado = sanitizeKey(nomeAba);
      const dados = aba.getDataRange().getValues();
      
      if (dados.length < 2) {
        // Aba vazia ou só com cabeçalho
        resultado.cache[nomeAbaSanitizado] = {
          registros: [],
          metadados: {
            nomeOriginal: nomeAba,
            totalRegistros: 0
          }
        };
        continue;
      }
      
      const cabecalhos = dados.shift().map(h => sanitizeKey(h));
      const registros = criarRegistrosDeAba(dados, cabecalhos);
      
      resultado.cache[nomeAbaSanitizado] = {
        registros: registros,
        metadados: {
          nomeOriginal: nomeAba,
          totalRegistros: registros.length
        }
      };
      
      resultado.metadados.totalAbas++;
    }
    
    return ContentService.createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (erro) {
    Logger.log('❌ Erro no doGet: ' + erro);
    return ContentService.createTextOutput(JSON.stringify({
      erro: "Erro ao processar requisição",
      mensagem: erro.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**********************************************
 * 🔨 FUNÇÕES AUXILIARES (HELPERS)
 **********************************************/

/**
 * Gera um ID único para uma linha baseado em campos estáveis.
 * Prioriza campos que não mudam (SerialHC, EmailHC) ao invés de índice.
 * @param {Object} registro - Objeto com os valores da linha (já mapeado com cabeçalhos)
 * @param {number} indice - Índice da linha (fallback se não houver campo estável)
 * @returns {string} ID único para a linha
 */
function gerarIdLinha(registro, indice) {
  // Tenta usar campos estáveis primeiro
  if (registro.SerialHC || registro.serialHC || registro.serialhc) {
    return String(registro.SerialHC || registro.serialHC || registro.serialhc);
  }
  
  if (registro.EmailHC || registro.emailHC || registro.emailhc) {
    return String(registro.EmailHC || registro.emailHC || registro.emailhc);
  }
  
  if (registro.ID || registro.id || registro.Id) {
    return String(registro.ID || registro.id || registro.Id);
  }
  
  // Fallback: usa hash do conteúdo + índice (instável mas melhor que nada)
  const conteudo = JSON.stringify(registro).substring(0, 100);
  const hash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5, 
    conteudo + indice
  );
  return hash.map(b => (b + 256) % 256).map(b => ("0" + b.toString(16)).slice(-2)).join("").substring(0, 16);
}

/**
 * Cria array de registros (objetos) a partir dos dados e cabeçalhos.
 * IDs são gerados com base em campos estáveis (SerialHC, EmailHC, ID) quando disponíveis.
 * @param {Array} dados - Array de linhas de dados (sem cabeçalhos)
 * @param {Array} cabecalhos - Array de nomes de colunas sanitizados
 * @returns {Array} Array de objetos com os dados
 */
function criarRegistrosDeAba(dados, cabecalhos) {
  const registros = [];
  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i];
    const obj = {};
    
    // Mapeia colunas para objeto primeiro
    for (let j = 0; j < cabecalhos.length; j++) {
      obj[cabecalhos[j]] = linha[j];
    }
    
    // Gera ID baseado em campos estáveis do objeto (não do índice)
    obj._rowId = gerarIdLinha(obj, i);
    obj._rowIndex = i + 2; // +2 porque linha 1 é cabeçalho e array começa em 0
    
    registros.push(obj);
  }
  return registros;
}

/**
 * Sanitiza chaves/nomes de campos removendo caracteres especiais e acentos.
 * @param {string} texto - Texto a ser sanitizado
 * @returns {string} Texto sanitizado
 */
function sanitizeKey(texto) {
  if (!texto) return "";
  return texto
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.$#[\]/]/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^_+|_+$/g, "");
}

/**********************************************
 * 📌 PONTO E ESCALA - Sistema de Sincronização
 **********************************************/

/**
 * Função simples onEdit (gatilho simples) - funciona apenas com planilha aberta.
 * Para funcionar com planilha fechada, use o gatilho instalável (Menu > Ativar Sincronização).
 */
function onEdit(e){
  try {
    handlePontoChange(e);
  } catch(err) {
    console.error("Erro em onEdit:", err);
  }
}

/**
 * Função chamada pelo gatilho INSTALÁVEL onEdit.
 * Funciona mesmo quando a planilha está fechada.
 * Sincroniza pontos para Escalas.
 * @param {Object} e - Objeto evento do Google Apps Script
 */
function onEditPontoInstalavel(e) {
  try {
    handlePontoChange(e);
  } catch(err) {
    console.error("Erro em onEditPontoInstalavel:", err);
  }
}

/**
 * Função chamada pelo gatilho INSTALÁVEL onChange.
 * Processa inserção de novas linhas mesmo com planilha fechada.
 * @param {Object} e - Objeto evento do Google Apps Script
 */
function onChangePontoInstalavel(e) {
  try {
    if (!e || !e.source) return;
    
    // Verifica se foi uma inserção de linha
    if (e.changeType === 'INSERT_ROW' || e.changeType === 'EDIT') {
      var ss = e.source;
      var sheets = ['PontoPratica', 'PontoTeoria'];
      
      for (var i = 0; i < sheets.length; i++) {
        var sheetName = sheets[i];
        var sheet = ss.getSheetByName(sheetName);
        if (sheet) {
          syncAllRowsInSheet_(ss, sheet, sheetName);
        }
      }
    }
  } catch(err) {
    console.error("Erro em onChangePontoInstalavel:", err);
  }
}

/**
 * Sincroniza todas as linhas de uma aba de ponto.
 * Usado quando há inserção de linhas via onChange.
 */
function syncAllRowsInSheet_(ss, sheet, sheetName) {
  if (!sheet) return;
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (!headers || headers.length === 0) return;
  
  var idx = function(colName){
    var i = headers.indexOf(colName);
    return i >= 0 ? i+1 : -1;
  };
  var serialCol = idx('SerialNumber');
  var emailCol = idx('EmailHC');
  var nomeCol = idx('NomeCompleto');
  var dataCol = idx('Data');
  var horaEntCol = idx('HoraEntrada');
  var horaSaiCol = idx('HoraSaida');
  var escalaCol = idx('Escala');
  
  // Requer pelo menos um identificador e data/hora entrada
  if ((emailCol < 1 && serialCol < 1 && nomeCol < 1) || dataCol < 1 || horaEntCol < 1) {
    console.warn('Cabeçalhos essenciais não encontrados na aba ' + sheetName);
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var serial = (serialCol > 0) ? r[serialCol - 1] : '';
    var email = (emailCol > 0) ? r[emailCol - 1] : '';
    var nome = (nomeCol > 0) ? r[nomeCol - 1] : '';
    
    // Precisa de pelo menos um identificador
    if (!email && !serial && !nome) continue;
    
    var dataRaw = r[dataCol - 1];
    var horaEnt = r[horaEntCol - 1];
    var horaSai = (horaSaiCol > 0) ? r[horaSaiCol - 1] : '';
    var escalaNumber = (escalaCol > 0 && r[escalaCol - 1]) ? String(r[escalaCol - 1]) : '9';
    
    try {
      syncOnePontoRow_(ss, escalaNumber, serial, email, nome, dataRaw, horaEnt, horaSai, sheetName);
      if (sheetName === 'PontoTeoria') {
        syncToFrequenciaTeorica_(ss, sheet, i + 2, escalaNumber);
      }
    } catch(err) {
      console.error('Erro sincronizando linha ' + (i + 2) + ':', err);
    }
  }
}

/**
 * Processa mudanças nas abas PontoPratica ou PontoTeoria.
 * Sincroniza dados para as escalas correspondentes.
 */
function handlePontoChange(e){
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  if (sheetName !== 'PontoPratica' && sheetName !== 'PontoTeoria') return;

  var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];

  var idx = function(colName){
    var i = headers.indexOf(colName);
    return i >= 0 ? i+1 : -1;
  };
  var serialCol = idx('SerialNumber');
  var emailCol = idx('EmailHC');
  var nomeCol = idx('NomeCompleto');
  var dataCol = idx('Data');
  var horaEntCol = idx('HoraEntrada');
  var horaSaiCol = idx('HoraSaida');
  var escalaCol = idx('Escala');

  // Requer pelo menos um identificador e data/hora entrada
  if ((emailCol < 0 && serialCol < 0 && nomeCol < 0) || dataCol < 0 || horaEntCol < 0) {
    console.warn('Cabeçalhos obrigatórios não encontrados na aba ' + sheetName);
    return;
  }

  var startRow = e.range.getRow();
  var endRow = e.range.getLastRow();

  for (var r = startRow; r <= endRow; r++){
    var row = sheet.getRange(r,1,1,sheet.getLastColumn()).getValues()[0];
    var serial = (serialCol > 0) ? row[serialCol-1] : '';
    var email = (emailCol > 0) ? row[emailCol-1] : '';
    var nome = (nomeCol > 0) ? row[nomeCol-1] : '';
    
    // Precisa de pelo menos um identificador
    if (!email && !serial && !nome) continue;

    var dataRaw = row[dataCol-1];
    var horaEnt = row[horaEntCol-1];
    var horaSai = (horaSaiCol>0) ? row[horaSaiCol-1] : '';
    var escalaNumber = (escalaCol>0 && row[escalaCol-1]) ? String(row[escalaCol-1]) : '9';

    try {
      syncOnePontoRow_(e.source, escalaNumber, serial, email, nome, dataRaw, horaEnt, horaSai, sheetName);
      // Sincroniza também para FrequenciaTeorica se for aba PontoTeoria
      if (sheetName === 'PontoTeoria') {
        syncToFrequenciaTeorica_(e.source, sheet, r, escalaNumber);
      }
    } catch(err) {
      console.error('Erro sincronizando linha ' + r + ':', err);
    }
  }
}

/**
 * Sincroniza uma linha de ponto para a aba de escala correspondente.
 * PontoTeoria -> EscalaTeoria + número (ex: EscalaTeoria1)
 * PontoPratica -> EscalaPratica + número (ex: EscalaPratica1)
 * Identifica o aluno por pelo menos 2 dos 3 identificadores: SerialNumber, EmailHC, NomeCompleto
 */
function syncOnePontoRow_(spreadsheet, escalaNumber, serial, email, nome, dataRaw, horaEnt, horaSai, pontoSheetName){
  // Verifica se há pelo menos 2 identificadores no registro de origem
  var numSourceIds = (serial ? 1 : 0) + (email ? 1 : 0) + (nome ? 1 : 0);
  if (numSourceIds < 2) {
    return; // Precisa de pelo menos 2 identificadores
  }

  var base = (pontoSheetName === 'PontoTeoria') ? 'EscalaTeoria' : 'EscalaPratica';
  var escalaSheetName = base + escalaNumber;
  var escalaSheet = spreadsheet.getSheetByName(escalaSheetName);
  if (!escalaSheet) {
    return;
  }

  var parsedDate = parseDateFlexible_(dataRaw);
  if (!parsedDate) {
    return;
  }

  var escalaHeaders = escalaSheet.getRange(1,1,1,escalaSheet.getLastColumn()).getValues()[0];
  
  // Encontra índices dos identificadores (com proteção contra -1)
  var escalaSerialCol = escalaHeaders.indexOf('SerialNumber');
  var escalaEmailCol = escalaHeaders.indexOf('EmailHC');
  var escalaNomeCol = escalaHeaders.indexOf('NomeCompleto');
  
  // Precisa ter pelo menos 2 colunas de identificadores na escala
  var numEscalaIdCols = (escalaSerialCol >= 0 ? 1 : 0) + (escalaEmailCol >= 0 ? 1 : 0) + (escalaNomeCol >= 0 ? 1 : 0);
  if (numEscalaIdCols < 2) {
    return;
  }
  
  // Converte para índice 1-based apenas se encontrado (proteção contra -1)
  escalaSerialCol = escalaSerialCol >= 0 ? escalaSerialCol + 1 : -1;
  escalaEmailCol = escalaEmailCol >= 0 ? escalaEmailCol + 1 : -1;
  escalaNomeCol = escalaNomeCol >= 0 ? escalaNomeCol + 1 : -1;

  // Encontra coluna de data correspondente
  var dataColIndex = -1;
  for (var h = 0; h < escalaHeaders.length; h++){
    if (isDateHeaderMatch_(escalaHeaders[h], parsedDate)){
      dataColIndex = h + 1;
      break;
    }
  }
  if (dataColIndex < 1) {
    return;
  }

  // Procura linha do aluno usando até 2 identificadores
  var lastRow = escalaSheet.getLastRow();
  if (lastRow < 2) return;
  var escalaRows = escalaSheet.getRange(2,1,lastRow-1,escalaSheet.getLastColumn()).getValues();
  
  var targetRow = -1;
  for (var i = 0; i < escalaRows.length; i++){
    var row = escalaRows[i];
    var matches = 0;
    
    if (escalaSerialCol > 0 && serial && String(row[escalaSerialCol-1]) === String(serial)) matches++;
    if (escalaEmailCol > 0 && email && String(row[escalaEmailCol-1]) === String(email)) matches++;
    if (escalaNomeCol > 0 && nome && String(row[escalaNomeCol-1]) === String(nome)) matches++;
    
    if (matches >= 2) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow < 0) {
    return;
  }

  // Monta string de entrada/saída
  var entSaiStr = entradaSaidaToString_(horaEnt, horaSai);
  
  // Atualiza célula se houver diferença
  var cellValue = escalaSheet.getRange(targetRow, dataColIndex).getValue();
  var currentStr = formatTimeForComparison_(cellValue);
  var newStr = formatTimeForComparison_(entSaiStr);
  
  if (currentStr !== newStr){
    escalaSheet.getRange(targetRow, dataColIndex).setValue(entSaiStr);
  }
}

/**
 * Sincroniza uma linha da aba PontoTeoria para a aba FrequenciaTeorica correspondente.
 */
function syncToFrequenciaTeorica_(spreadsheet, pontoTeoriaSheet, rowNumber, escalaNumber) {
  var freqSheetName = 'FrequenciaTeorica' + escalaNumber;
  var freqSheet = spreadsheet.getSheetByName(freqSheetName);
  if (!freqSheet) {
    return;
  }

  var pontoHeaders = pontoTeoriaSheet.getRange(1,1,1,pontoTeoriaSheet.getLastColumn()).getValues()[0];
  var pontoRow = pontoTeoriaSheet.getRange(rowNumber,1,1,pontoTeoriaSheet.getLastColumn()).getValues()[0];
  
  var serialCol = pontoHeaders.indexOf('SerialNumber');
  var emailCol = pontoHeaders.indexOf('EmailHC');
  var nomeCol = pontoHeaders.indexOf('NomeCompleto');
  var dataCol = pontoHeaders.indexOf('Data');
  var horaEntCol = pontoHeaders.indexOf('HoraEntrada');
  var horaSaiCol = pontoHeaders.indexOf('HoraSaida');
  
  if (serialCol < 0 && emailCol < 0 && nomeCol < 0) return;
  if (dataCol < 0 || horaEntCol < 0) return;
  
  var serial = (serialCol >= 0) ? pontoRow[serialCol] : '';
  var email = (emailCol >= 0) ? pontoRow[emailCol] : '';
  var nome = (nomeCol >= 0) ? pontoRow[nomeCol] : '';
  var dataRaw = pontoRow[dataCol];
  var horaEnt = pontoRow[horaEntCol];
  var horaSai = (horaSaiCol >= 0) ? pontoRow[horaSaiCol] : '';
  
  // Precisa de pelo menos 2 identificadores
  var numIds = (serial ? 1 : 0) + (email ? 1 : 0) + (nome ? 1 : 0);
  if (numIds < 2) return;
  
  var parsedDate = parseDateFlexible_(dataRaw);
  if (!parsedDate) return;
  
  var freqHeaders = freqSheet.getRange(1,1,1,freqSheet.getLastColumn()).getValues()[0];
  
  // Encontra índices com proteção contra -1
  var freqSerialCol = freqHeaders.indexOf('SerialNumber');
  var freqEmailCol = freqHeaders.indexOf('EmailHC');
  var freqNomeCol = freqHeaders.indexOf('NomeCompleto');
  
  var numFreqIdCols = (freqSerialCol >= 0 ? 1 : 0) + (freqEmailCol >= 0 ? 1 : 0) + (freqNomeCol >= 0 ? 1 : 0);
  if (numFreqIdCols < 2) return;
  
  // Converte para 1-based apenas se encontrado
  freqSerialCol = freqSerialCol >= 0 ? freqSerialCol + 1 : -1;
  freqEmailCol = freqEmailCol >= 0 ? freqEmailCol + 1 : -1;
  freqNomeCol = freqNomeCol >= 0 ? freqNomeCol + 1 : -1;
  
  var dataColIndex = -1;
  for (var h = 0; h < freqHeaders.length; h++){
    if (isDateHeaderMatch_(freqHeaders[h], parsedDate)){
      dataColIndex = h + 1;
      break;
    }
  }
  if (dataColIndex < 1) return;
  
  var lastRow = freqSheet.getLastRow();
  if (lastRow < 2) return;
  var freqRows = freqSheet.getRange(2,1,lastRow-1,freqSheet.getLastColumn()).getValues();
  
  var targetRow = -1;
  for (var i = 0; i < freqRows.length; i++){
    var row = freqRows[i];
    var matches = 0;
    
    if (freqSerialCol > 0 && serial && String(row[freqSerialCol-1]) === String(serial)) matches++;
    if (freqEmailCol > 0 && email && String(row[freqEmailCol-1]) === String(email)) matches++;
    if (freqNomeCol > 0 && nome && String(row[freqNomeCol-1]) === String(nome)) matches++;
    
    if (matches >= 2) {
      targetRow = i + 2;
      break;
    }
  }
  
  if (targetRow < 0) return;
  
  var entSaiStr = entradaSaidaToString_(horaEnt, horaSai);
  var cellValue = freqSheet.getRange(targetRow, dataColIndex).getValue();
  var currentStr = formatTimeForComparison_(cellValue);
  var newStr = formatTimeForComparison_(entSaiStr);
  
  if (currentStr !== newStr){
    freqSheet.getRange(targetRow, dataColIndex).setValue(entSaiStr);
  }
}

/**
 * Sincroniza uma linha de PontoTeoria para FrequenciaTeorica após registro via doPost.
 */
function syncToFrequenciaTeoricaFromPonto_(spreadsheet, pontoTeoriaSheet, rowNumber, escalaNumber) {
  syncToFrequenciaTeorica_(spreadsheet, pontoTeoriaSheet, rowNumber, escalaNumber);
}

/**********************************************
 * 🔧 FUNÇÕES AUXILIARES DE DATA/HORA
 **********************************************/

/**
 * Formata data para comparação.
 */
function formatDateForComparison_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)){
    return two(value.getDate()) + '/' + two(value.getMonth()+1) + '/' + value.getFullYear();
  }
  return String(value).trim();
}

/**
 * Formata hora para comparação.
 */
function formatTimeForComparison_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)){
    return two(value.getHours()) + ':' + two(value.getMinutes()) + ':' + two(value.getSeconds());
  }
  return String(value).trim();
}

/**
 * Formata número com 2 dígitos.
 */
function two(n){ return ('0' + n).slice(-2); }

/**
 * Parse flexível de data (suporta Date objects e strings DD/MM/YYYY, DD/MM/YY, DD/MM).
 * Valida se dia e mês são válidos antes de criar a data.
 */
function parseDateFlexible_(v){
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v;
  
  var s = String(v).trim();
  
  // Função auxiliar para validar dia e mês
  function isValidDate(day, month, year) {
    if (month < 0 || month > 11) return false; // Mês 0-11 em JS
    if (day < 1 || day > 31) return false;
    
    // Verifica dias válidos por mês
    var daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    // Ano bissexto
    if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
      daysInMonth[1] = 29;
    }
    
    return day <= daysInMonth[month];
  }
  
  // Tenta DD/MM/YYYY
  var m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m){
    var d = parseInt(m[1],10);
    var mm = parseInt(m[2],10) - 1;
    var y = parseInt(m[3],10);
    if (!isValidDate(d, mm, y)) return null;
    return new Date(y, mm, d);
  }
  
  // Tenta DD/MM/YY (2 dígitos)
  m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m){
    var d = parseInt(m[1],10);
    var mm = parseInt(m[2],10) - 1;
    var y = parseInt(m[3],10);
    // Assume 20xx para anos 00-99
    y = y < 100 ? 2000 + y : y;
    if (!isValidDate(d, mm, y)) return null;
    return new Date(y, mm, d);
  }
  
  // Tenta DD/MM (sem ano, assume ano atual)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m){
    var d = parseInt(m[1],10);
    var mm = parseInt(m[2],10) - 1;
    var y = new Date().getFullYear();
    if (!isValidDate(d, mm, y)) return null;
    return new Date(y, mm, d);
  }
  
  return null;
}

/**
 * Verifica se cabeçalho corresponde à data.
 */
function isDateHeaderMatch_(header, parsedDate) {
  if (!header || !parsedDate) return false;
  var hs = String(header).trim();
  var day = parsedDate.getDate();
  var month = parsedDate.getMonth() + 1;
  var year = parsedDate.getFullYear();
  var ddmm = two(day) + '/' + two(month);
  var ddmm_underscore = two(day) + '_' + two(month);
  
  return hs.indexOf(ddmm) !== -1 || 
         hs.indexOf(ddmm + '/' + year) !== -1 ||
         hs.indexOf(ddmm_underscore) !== -1 ||
         hs.indexOf(ddmm_underscore + '/' + year) !== -1;
}

/**
 * Normaliza entrada/saida para formato HH:MM:SS às HH:MM:SS.
 */
function entradaSaidaToString_(ent, sai){
  function norm(t){
    if (!t) return '';
    if (Object.prototype.toString.call(t) === '[object Date]' && !isNaN(t)){
      return two(t.getHours()) + ':' + two(t.getMinutes()) + ':' + two(t.getSeconds());
    }
    var s = String(t).trim();
    var m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      var hh = two(parseInt(m[1],10));
      var mm = two(parseInt(m[2],10));
      var ss = (m[3] ? two(parseInt(m[3],10)) : '00');
      return hh + ':' + mm + ':' + ss;
    }
    m = s.match(/(\d{1,2})[:hH](\d{2})?/);
    if (m) {
      var h = two(parseInt(m[1],10));
      var mn = (m[2] ? two(parseInt(m[2],10)) : '00');
      return h + ':' + mn + ':00';
    }
    return s;
  }
  var e = norm(ent);
  var s = norm(sai);
  if (e && s) return e + ' às ' + s;
  return e || s || '';
}

/**
 * Aliases para compatibilidade com código legado e sistema externo.
 * Mantidos porque formatarData*() pode ser referenciado pelo sistema Python
 * ou por outras partes do código que ainda não foram migradas.
 */
function formatarDataParaComparacao_(value) { return formatDateForComparison_(value); }
function formatarHoraParaComparacao_(value) { return formatTimeForComparison_(value); }

/**********************************************
 * 📋 MENU PRINCIPAL
 **********************************************/

/**
 * Menu personalizado ao abrir a planilha.
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('📋 Gestão de Pontos')
    .addItem('📊 Ver Status dos Gatilhos', 'verificarStatusGatilhos')
    .addSeparator()
    .addItem('✅ Ativar Sincronização Automática', 'ativarTodosGatilhosAutomaticos')
    .addItem('⏸️ Desativar Sincronização Automática', 'desativarTodosGatilhosAutomaticos')
    .addSeparator()
    .addItem('❓ Ajuda', 'mostrarAjuda')
    .addToUi();
}

/**
 * Verifica o status dos gatilhos automáticos.
 */
function verificarStatusGatilhos() {
  const gatilhos = ScriptApp.getProjectTriggers();
  let onEditAtivo = false;
  let onChangeAtivo = false;
  
  for (const t of gatilhos) {
    const funcao = t.getHandlerFunction();
    if (funcao === 'onEditPontoInstalavel') onEditAtivo = true;
    if (funcao === 'onChangePontoInstalavel') onChangeAtivo = true;
  }
  
  Logger.log("📊 STATUS DOS GATILHOS:");
  Logger.log("  • onEdit (auto sync): " + (onEditAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  Logger.log("  • onChange (auto sync): " + (onChangeAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  
  const mensagem = 
    "📊 STATUS DOS GATILHOS\n\n" +
    "• Sincronização automática (onEdit): " + (onEditAtivo ? "✅ ATIVO" : "❌ INATIVO") + "\n" +
    "• Sincronização automática (onChange): " + (onChangeAtivo ? "✅ ATIVO" : "❌ INATIVO") + "\n\n" +
    "💡 Os gatilhos sincronizam automaticamente os pontos para as escalas\n" +
    "quando você edita ou adiciona dados na planilha.";
  
  SpreadsheetApp.getUi().alert("⚙️ Status dos Gatilhos", mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
  
  return {
    onEdit: onEditAtivo,
    onChange: onChangeAtivo
  };
}

/**
 * Mostra a ajuda sobre como usar o menu.
 */
function mostrarAjuda() {
  var ui = SpreadsheetApp.getUi();
  
  var mensagem = 
    '📋 GUIA DE SINCRONIZAÇÃO DE PONTOS\n\n' +
    '═══════════════════════════════════════\n\n' +
    '🔄 SINCRONIZAÇÃO AUTOMÁTICA:\n' +
    '• Sincroniza pontos de PontoPratica e PontoTeoria para Escalas\n' +
    '• Evita duplicatas automaticamente\n' +
    '• Funciona mesmo com a planilha FECHADA!\n\n' +
    '═══════════════════════════════════════\n\n' +
    '⚙️ COMO USAR O MENU:\n' +
    '• Ver Status: Verifica se gatilhos estão ativos\n' +
    '• Ativar: Liga a sincronização automática\n' +
    '• Desativar: Desliga a sincronização automática\n\n' +
    '═══════════════════════════════════════\n\n' +
    '💡 RECOMENDAÇÃO:\n' +
    'Ative a sincronização automática uma vez e deixe o sistema\n' +
    'trabalhar sozinho! Dados são sincronizados imediatamente\n' +
    'a cada alteração, sem duplicatas.';
  
  ui.alert('❓ Ajuda - Menu de Gestão de Pontos', mensagem, ui.ButtonSet.OK);
}

/**
 * Ativa TODOS os gatilhos automáticos.
 */
function ativarTodosGatilhosAutomaticos() {
  var ss = SpreadsheetApp.getActive();
  
  // Remove todos os gatilhos antigos usando a constante TRIGGER_FUNCTIONS
  var gatilhos = ScriptApp.getProjectTriggers();
  
  for (var i = 0; i < gatilhos.length; i++) {
    var funcao = gatilhos[i].getHandlerFunction();
    if (TRIGGER_FUNCTIONS.indexOf(funcao) !== -1) {
      ScriptApp.deleteTrigger(gatilhos[i]);
    }
  }
  
  // Cria gatilhos para sincronização de Pontos
  ScriptApp.newTrigger('onEditPontoInstalavel')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  
  ScriptApp.newTrigger('onChangePontoInstalavel')
    .forSpreadsheet(ss)
    .onChange()
    .create();
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '✅ Sincronização COMPLETA ativada!\n\n' +
    '• Pontos → Escalas: Automático\n\n' +
    'Funciona mesmo com a planilha fechada!',
    'Sincronização Automática',
    10
  );
  
  console.log('✅ Todos os gatilhos automáticos criados!');
}

/**
 * Desativa TODOS os gatilhos automáticos.
 */
function desativarTodosGatilhosAutomaticos() {
  var gatilhos = ScriptApp.getProjectTriggers();
  var removidos = 0;
  
  for (var i = 0; i < gatilhos.length; i++) {
    var funcao = gatilhos[i].getHandlerFunction();
    if (TRIGGER_FUNCTIONS.indexOf(funcao) !== -1) {
      ScriptApp.deleteTrigger(gatilhos[i]);
      removidos++;
    }
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '⏸️ Sincronização automática DESATIVADA.\n' +
    removidos + ' gatilho(s) removido(s).',
    'Sincronização Automática',
    5
  );
  
  console.log('⏸️ ' + removidos + ' gatilhos removidos.');
}

/**********************************************
 * 📌 API DE PONTO - Recebe dados via POST
 **********************************************/

/**
 * Recebe dados de ponto via POST do sistema externo (Python).
 * Também processa requisições de ausências e reposições.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Verificar se é uma requisição de ausência ou reposição
    var tipoRaw = data.tipo || data.Tipo || data.TIPO || '';
    var tipo = String(tipoRaw).toLowerCase();
    if (tipo === 'ausencia' || tipo === 'reposicao') {
      return doPostAusenciasReposicoes(e);
    }
    
    var id = data.SerialNumber || "";
    var nome = data.NomeCompleto || "Desconhecido";
    var email = data.EmailHC || "";
    var escala = data.Escala || "";
    var simularTerca = data.SimularTerça || false;
    var isDiaTeoria = data.IsDiaTeoria || false;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var abaPratica = ss.getSheetByName(ABA_PONTO_PRATICA);
    var abaTeoria = ss.getSheetByName(ABA_PONTO_TEORIA);
    if (!abaPratica || !abaTeoria)
      throw new Error("Abas '" + ABA_PONTO_PRATICA + "' ou '" + ABA_PONTO_TEORIA + "' não encontradas!");

    var agora = new Date();
    var dataStr = Utilities.formatDate(agora, "America/Sao_Paulo", "dd/MM/yyyy");
    var horaStr = Utilities.formatDate(agora, "America/Sao_Paulo", "HH:mm:ss");
    var diaSemana = agora.getDay();
    if (simularTerca) diaSemana = 2;

    var ehDiaTeoria = isDiaTeoria || diaSemana === 2 || diaSemana === 4;

    // === 1. Verifica se há linha aberta na TEORIA ===
    var dadosTeoria = abaTeoria.getDataRange().getValues();
    if (dadosTeoria.length < 2) {
      // Só tem cabeçalho ou está vazia - usa headers padrão
      dadosTeoria = [HEADERS_PONTO_PADRAO];
    }
    
    var linhaTeoriaAberta = null;
    var linhaTeoriaCompleta = false;

    // Mapeia cabeçalhos da teoria com validação
    var headerTeoria = dadosTeoria[0] || [];
    var colIdxTeoria = {
      id: headerTeoria.indexOf('SerialNumber'),
      data: headerTeoria.indexOf('Data'),
      entrada: headerTeoria.indexOf('HoraEntrada'),
      saida: headerTeoria.indexOf('HoraSaida')
    };
    
    // Valida se encontrou as colunas essenciais
    if (colIdxTeoria.id < 0 || colIdxTeoria.data < 0) {
      return resposta("Erro: Colunas essenciais não encontradas na aba PontoTeoria");
    }

    for (var i = 1; i < dadosTeoria.length; i++) {
      var linhaId = dadosTeoria[i][colIdxTeoria.id];
      var linhaData = formatarData(dadosTeoria[i][colIdxTeoria.data]);
      var entrada = colIdxTeoria.entrada >= 0 ? dadosTeoria[i][colIdxTeoria.entrada] : null;
      var saida = colIdxTeoria.saida >= 0 ? dadosTeoria[i][colIdxTeoria.saida] : null;

      if (String(linhaId) === String(id) && String(linhaData) === String(dataStr)) {
        if (!saida) linhaTeoriaAberta = i + 1;
        else linhaTeoriaCompleta = true;
      }
    }

    if (linhaTeoriaCompleta) {
      return resposta("Sem ação: aluno já completou a teoria hoje.");
    }

    if (linhaTeoriaAberta) {
      if (colIdxTeoria.saida >= 0) {
        abaTeoria.getRange(linhaTeoriaAberta, colIdxTeoria.saida + 1).setValue(horaStr);
      }
      return resposta("Saída teórica registrada: " + horaStr);
    }

    // === 2. Verifica se há linha aberta na PRÁTICA ===
    var dadosPratica = abaPratica.getDataRange().getValues();
    if (dadosPratica.length < 2) {
      // Só tem cabeçalho ou está vazia - usa headers padrão
      dadosPratica = [HEADERS_PONTO_PADRAO];
    }
    
    var linhaPraticaAberta = null;
    var linhaPraticaCompleta = false;

    // Mapeia cabeçalhos da prática com validação
    var headerPratica = dadosPratica[0] || [];
    var colIdxPratica = {
      id: headerPratica.indexOf('SerialNumber'),
      data: headerPratica.indexOf('Data'),
      entrada: headerPratica.indexOf('HoraEntrada'),
      saida: headerPratica.indexOf('HoraSaida')
    };
    
    // Valida se encontrou as colunas essenciais
    if (colIdxPratica.id < 0 || colIdxPratica.data < 0) {
      return resposta("Erro: Colunas essenciais não encontradas na aba PontoPratica");
    }

    for (var i = 1; i < dadosPratica.length; i++) {
      var linhaId = dadosPratica[i][colIdxPratica.id];
      var linhaData = formatarData(dadosPratica[i][colIdxPratica.data]);
      var entrada = colIdxPratica.entrada >= 0 ? dadosPratica[i][colIdxPratica.entrada] : null;
      var saida = colIdxPratica.saida >= 0 ? dadosPratica[i][colIdxPratica.saida] : null;

      if (String(linhaId) === String(id) && String(linhaData) === String(dataStr)) {
        if (!saida) linhaPraticaAberta = i + 1;
        else linhaPraticaCompleta = true;
      }
    }

    if (linhaPraticaCompleta && !ehDiaTeoria) {
      return resposta("Sem ação: aluno já completou a prática hoje.");
    }

    // === 3. Caso não exista prática aberta → cria nova entrada ===
    if (!linhaPraticaAberta && !linhaPraticaCompleta) {
      if (ehDiaTeoria) {
        abaTeoria.appendRow([id, email, nome, dataStr, horaStr, "", escala, "Teoria"]);
        var novaLinhaTeoria = abaTeoria.getLastRow();
        syncToFrequenciaTeoricaFromPonto_(ss, abaTeoria, novaLinhaTeoria, escala);
        return resposta("Entrada teórica registrada: " + horaStr);
      }
      abaPratica.appendRow([id, email, nome, dataStr, horaStr, "", escala, "Prática"]);
      return resposta("Entrada prática registrada: " + horaStr);
    }

    // === 4. Caso exista prática aberta → registra saída ===
    if (linhaPraticaAberta) {
      if (colIdxPratica.saida >= 0) {
        abaPratica.getRange(linhaPraticaAberta, colIdxPratica.saida + 1).setValue(horaStr);
      }

      if (ehDiaTeoria) {
        var existeTeoriaHoje = dadosTeoria.some(function (r, idx) {
          if (idx === 0) return false; // Pula cabeçalho
          var rId = colIdxTeoria.id >= 0 ? r[colIdxTeoria.id] : null;
          var rData = colIdxTeoria.data >= 0 ? formatarData(r[colIdxTeoria.data]) : null;
          return String(rId) === String(id) && String(rData) === String(dataStr);
        });
        if (!existeTeoriaHoje) {
          abaTeoria.appendRow([id, email, nome, dataStr, horaStr, "", escala, "Teoria"]);
          var novaLinha = abaTeoria.getLastRow();
          syncToFrequenciaTeoricaFromPonto_(ss, abaTeoria, novaLinha, escala);
          return resposta("Saída prática e entrada teórica registradas: " + horaStr);
        }
      }

      return resposta("Saída prática registrada: " + horaStr);
    }

    return resposta("Sem ação necessária para o ID " + id + ".");

  } catch (err) {
    return resposta("Erro: " + err.message);
  }
}

/**
 * Formata data (Date object ou número para DD/MM/YYYY).
 * Trata Date objects, números (timestamps) e strings.
 */
function formatarData(valor) {
  // Retorna apenas se for null ou undefined (não 0 ou false)
  if (valor === null || valor === undefined) return valor;
  
  // Se é um Date object válido
  if (valor instanceof Date && !isNaN(valor)) {
    return Utilities.formatDate(valor, "America/Sao_Paulo", "dd/MM/yyyy");
  }
  
  // Se é um número (timestamp ou serial do Excel)
  if (typeof valor === 'number' && valor !== 0) {
    // Usa threshold definido para distinguir entre tipos
    if (valor > EXCEL_SERIAL_THRESHOLD) {
      // Serial do Excel: converte para Date
      var date = new Date((valor - 25569) * 86400 * 1000);
      if (!isNaN(date)) {
        return Utilities.formatDate(date, "America/Sao_Paulo", "dd/MM/yyyy");
      }
    } else if (valor > 0) {
      // Timestamp Unix (assumindo milissegundos)
      var date = new Date(valor);
      if (!isNaN(date)) {
        return Utilities.formatDate(date, "America/Sao_Paulo", "dd/MM/yyyy");
      }
    }
  }
  
  // Retorna o valor como está (pode ser string já formatada)
  return valor;
}

/**
 * Retorna resposta em texto simples.
 */
function resposta(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}

/**********************************************
 * 🎯 SISTEMA DE AUSÊNCIAS E REPOSIÇÕES
 **********************************************/

/**
 * Valida os dados de uma ausência.
 */
function validarDadosAusencia(data) {
  if (!data.NomeCompleto || data.NomeCompleto.trim() === '') {
    return { valid: false, message: 'Nome completo é obrigatório' };
  }
  
  if (!data.EmailHC || data.EmailHC.trim() === '') {
    return { valid: false, message: 'Email HC é obrigatório' };
  }
  
  if (!data.DataAusencia) {
    return { valid: false, message: 'Data da ausência é obrigatória' };
  }
  
  if (!EMAIL_REGEX.test(data.EmailHC)) {
    return { valid: false, message: 'Email inválido' };
  }
  
  return { valid: true, message: 'OK' };
}

/**
 * Valida os dados de uma reposição.
 */
function validarDadosReposicao(data) {
  if (!data.NomeCompleto || data.NomeCompleto.trim() === '') {
    return { valid: false, message: 'Nome completo é obrigatório' };
  }
  
  if (!data.EmailHC || data.EmailHC.trim() === '') {
    return { valid: false, message: 'Email HC é obrigatório' };
  }
  
  if (!data.DataReposicao) {
    return { valid: false, message: 'Data da reposição é obrigatória' };
  }
  
  // Valida formato da DataReposicao (campo correto para reposição)
  if (data.DataReposicao && typeof data.DataReposicao !== 'string') {
    return { valid: false, message: 'Data da reposição deve ser texto (YYYY-MM-DD)' };
  }
  
  // DataAusencia é opcional em reposições
  if (data.DataAusencia && typeof data.DataAusencia !== 'string') {
    return { valid: false, message: 'Data da ausência deve ser texto (YYYY-MM-DD)' };
  }
  
  if (!EMAIL_REGEX.test(data.EmailHC)) {
    return { valid: false, message: 'Email inválido' };
  }
  
  return { valid: true, message: 'OK' };
}

/**
 * Registra uma ausência na planilha.
 */
function registrarAusencia(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_AUSENCIAS);
  
  if (!aba) {
    return { success: false, message: 'Aba "' + ABA_AUSENCIAS + '" não encontrada.' };
  }
  
  var validacao = validarDadosAusencia(data);
  if (!validacao.valid) {
    return { success: false, message: validacao.message };
  }
  
  var cabecalhos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var registro = cabecalhos.map(function(col) {
    switch (col) {
      case 'NomeCompleto': return data.NomeCompleto || '';
      case 'EmailHC': return data.EmailHC || '';
      case 'Curso': return data.Curso || '';
      case 'Escala': return data.Escala || '';
      case 'DataAusencia': return data.DataAusencia || '';
      case 'Unidade': return data.Unidade || '';
      case 'Horario': return data.Horario || '';
      case 'Motivo': return data.Motivo || '';
      default: return '';
    }
  });
  
  aba.appendRow(registro);
  
  Logger.log('✅ Ausência registrada: ' + data.NomeCompleto + ' - ' + data.DataAusencia);
  
  return { 
    success: true, 
    message: 'Ausência registrada com sucesso',
    data: {
      nome: data.NomeCompleto,
      data: data.DataAusencia
    }
  };
}

/**
 * Registra uma reposição na planilha.
 */
function registrarReposicao(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_REPOSICOES);
  
  if (!aba) {
    return { success: false, message: 'Aba "' + ABA_REPOSICOES + '" não encontrada.' };
  }
  
  var validacao = validarDadosReposicao(data);
  if (!validacao.valid) {
    return { success: false, message: validacao.message };
  }
  
  var cabecalhos = aba.getRange(1, 1, 1, aba.getLastColumn()).getValues()[0];
  var registro = cabecalhos.map(function(col) {
    switch (col) {
      case 'NomeCompleto': return data.NomeCompleto || '';
      case 'EmailHC': return data.EmailHC || '';
      case 'Curso': return data.Curso || '';
      case 'Escala': return data.Escala || '';
      case 'Horario': return data.Horario || '';
      case 'Unidade': return data.Unidade || '';
      case 'Motivo': return data.Motivo || '';
      case 'DataReposicao': return data.DataReposicao || '';
      case 'DataAusencia': return data.DataAusencia || '';
      default: return '';
    }
  });
  
  aba.appendRow(registro);
  
  Logger.log('✅ Reposição registrada: ' + data.NomeCompleto + ' - ' + data.DataReposicao);
  
  return { 
    success: true, 
    message: 'Reposição registrada com sucesso',
    data: {
      nome: data.NomeCompleto,
      data: data.DataReposicao
    }
  };
}

/**
 * Endpoint POST para receber dados de ausências e reposições.
 */
function doPostAusenciasReposicoes(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var tipo = (data.tipo || '').toLowerCase();
    
    Logger.log('📥 Requisição recebida - Tipo: ' + tipo);
    Logger.log('📋 Dados: ' + JSON.stringify(data));
    
    var resultado;
    
    if (tipo === 'ausencia') {
      resultado = registrarAusencia(data);
    } else if (tipo === 'reposicao') {
      resultado = registrarReposicao(data);
    } else {
      resultado = {
        success: false,
        message: 'Tipo inválido. Use "ausencia" ou "reposicao".'
      };
    }
    
    Logger.log('📤 Resultado: ' + JSON.stringify(resultado));
    
    return ContentService
      .createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (erro) {
    Logger.log('❌ Erro no doPostAusenciasReposicoes: ' + erro);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        message: 'Erro ao processar requisição: ' + erro.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
