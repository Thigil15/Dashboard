/**
 * Sistema de sincronização de pontos para escalas.
 * 
 * Funcionalidade:
 * - PontoTeoria sincroniza para EscalaTeoria + número (ex: EscalaTeoria1, EscalaTeoria2, etc.)
 * - PontoPratica sincroniza para EscalaPratica + número (ex: EscalaPratica1, EscalaPratica2, etc.)
 * 
 * Identificação de alunos:
 * - O aluno é identificado por pelo menos 2 dos 3 campos: SerialNumber, EmailHC, NomeCompleto
 * - Os dois identificadores precisam coincidir para encontrar o aluno na escala
 * 
 * Formato das datas nas colunas da escala:
 * - Formato DD_MM (ex: 10_03 para 10 de março)
 * - Também aceita DD/MM, DD/MM/YYYY, DD_MM/YYYY
 * 
 * Atualizado para inserir apenas "HH:MM:SS às HH:MM:SS" (sem "Prática:"/ "Teoria:")
 * Cole em Extensions → Apps Script do seu Google Sheets.
 * 
 * IMPORTANTE: Para funcionar automaticamente mesmo com a planilha fechada,
 * execute a função criarGatilhosPontoAutomatico() UMA VEZ para criar
 * os gatilhos instaláveis.
 */

// Nomes das funções de gatilhos para evitar duplicação
var TRIGGER_FUNCTIONS = [
  'onEditPontoInstalavel', 'onChangePontoInstalavel',
  'onEditFirebase', 'onChangeFirebase'
];

/**
 * Função simples onEdit (gatilho simples) - funciona apenas com planilha aberta.
 * Para funcionar com planilha fechada, use o gatilho instalável (criarGatilhosPontoAutomatico).
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
 * Sincroniza pontos para Escalas e envia para Firebase automaticamente.
 * @param {Object} e - Objeto evento do Google Apps Script
 */
function onEditPontoInstalavel(e) {
  try {
    // Primeiro sincroniza para as escalas
    handlePontoChange(e);
    
    // Depois envia para o Firebase (se a função existir no Code.gs)
    if (typeof enviarTodasAsAbasParaFirebase === 'function') {
      enviarTodasAsAbasParaFirebase();
    }
  } catch(err) {
    console.error("Erro em onEditPontoInstalavel:", err);
  }
}

/**
 * Cria gatilhos instaláveis para sincronização automática de pontos.
 * EXECUTE ESTA FUNÇÃO UMA VEZ para ativar a sincronização automática
 * mesmo quando a planilha está fechada.
 */
function criarGatilhosPontoAutomatico() {
  var ss = SpreadsheetApp.getActive();
  
  // Remove gatilhos antigos para evitar duplicação
  var gatilhos = ScriptApp.getProjectTriggers();
  for (var i = 0; i < gatilhos.length; i++) {
    var funcao = gatilhos[i].getHandlerFunction();
    if (funcao === 'onEditPontoInstalavel' || funcao === 'onChangePontoInstalavel') {
      ScriptApp.deleteTrigger(gatilhos[i]);
    }
  }
  
  // Cria gatilho onEdit instalável
  ScriptApp.newTrigger('onEditPontoInstalavel')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  
  // Cria gatilho onChange instalável (para inserção de linhas)
  ScriptApp.newTrigger('onChangePontoInstalavel')
    .forSpreadsheet(ss)
    .onChange()
    .create();
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '✅ Gatilhos de sincronização automática criados!\n' +
    'Os pontos serão sincronizados automaticamente mesmo com a planilha fechada.',
    'Sincronização Automática',
    10
  );
  
  console.log('✅ Gatilhos instaláveis criados: onEditPontoInstalavel e onChangePontoInstalavel');
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
        var sheet = ss.getSheetByName(sheets[i]);
        if (sheet) {
          syncAllRowsInSheet_(ss, sheet, sheets[i]);
        }
      }
      
      // Envia para Firebase
      if (typeof enviarTodasAsAbasParaFirebase === 'function') {
        enviarTodasAsAbasParaFirebase();
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
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
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
  
  // Requer pelo menos email ou serial e data/hora entrada
  if ((emailCol < 0 && serialCol < 0) || dataCol < 0 || horaEntCol < 0) return;
  
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
 * @param {Spreadsheet} spreadsheet - A planilha ativa
 * @param {string} escalaNumber - O número da escala (1-12)
 * @param {string} serial - Número de série do aluno (SerialNumber)
 * @param {string} email - Email do aluno (EmailHC)
 * @param {string} nome - Nome completo do aluno (NomeCompleto)
 * @param {*} dataRaw - Data do ponto
 * @param {*} horaEnt - Hora de entrada
 * @param {*} horaSai - Hora de saída
 * @param {string} pontoSheetName - Nome da aba de origem ('PontoTeoria' ou 'PontoPratica')
 */
function syncOnePontoRow_(spreadsheet, escalaNumber, serial, email, nome, dataRaw, horaEnt, horaSai, pontoSheetName){
  // Determina o prefixo da escala baseado na aba de origem
  var escalaPrefix = (pontoSheetName === 'PontoTeoria') ? 'EscalaTeoria' : 'EscalaPratica';
  var escalaName = escalaPrefix + escalaNumber;
  var escalaSheet = spreadsheet.getSheetByName(escalaName);
  if (!escalaSheet){
    console.warn('Aba ' + escalaName + ' não encontrada.');
    return;
  }

  // ler cabeçalho da escala
  var headersEsc = escalaSheet.getRange(1,1,1,escalaSheet.getLastColumn()).getValues()[0];
  
  // Encontrar colunas de identificação na escala
  var serialColEsc = -1;
  var emailColEsc = -1;
  var nomeColEsc = -1;
  
  for (var i = 0; i < headersEsc.length; i++) {
    var h = String(headersEsc[i] || '').toLowerCase().trim();
    if (h === 'serialnumber' || h === 'serial') {
      serialColEsc = i + 1;
    } else if (h === 'emailhc' || h === 'email') {
      emailColEsc = i + 1;
    } else if (h === 'nomecompleto' || h === 'nome') {
      nomeColEsc = i + 1;
    }
  }
  
  // Precisa de pelo menos duas colunas de identificação
  var numIdCols = (serialColEsc > 0 ? 1 : 0) + (emailColEsc > 0 ? 1 : 0) + (nomeColEsc > 0 ? 1 : 0);
  if (numIdCols < 2) {
    console.warn('A aba ' + escalaName + ' precisa de pelo menos 2 colunas de identificação (SerialNumber, EmailHC, NomeCompleto)');
    return;
  }

  // localizar a linha do aluno (verificando pelo menos 2 identificadores)
  var lastRow = Math.max(escalaSheet.getLastRow(), 2);
  if (lastRow < 2) { console.warn('Escala vazia'); return; }
  
  var allData = escalaSheet.getRange(2, 1, lastRow - 1, escalaSheet.getLastColumn()).getValues();
  var studentRow = -1;
  
  for (var rr = 0; rr < allData.length; rr++) {
    var rowData = allData[rr];
    var matches = 0;
    
    // Verificar SerialNumber
    if (serialColEsc > 0 && serial) {
      var escSerial = String(rowData[serialColEsc - 1] || '').trim();
      if (escSerial && escSerial.toLowerCase() === String(serial).trim().toLowerCase()) {
        matches++;
      }
    }
    
    // Verificar EmailHC
    if (emailColEsc > 0 && email) {
      var escEmail = String(rowData[emailColEsc - 1] || '').trim();
      if (escEmail && escEmail.toLowerCase() === String(email).trim().toLowerCase()) {
        matches++;
      }
    }
    
    // Verificar NomeCompleto
    if (nomeColEsc > 0 && nome) {
      var escNome = String(rowData[nomeColEsc - 1] || '').trim();
      if (escNome && escNome.toLowerCase() === String(nome).trim().toLowerCase()) {
        matches++;
      }
    }
    
    // Precisa de pelo menos 2 matches
    if (matches >= 2) {
      studentRow = rr + 2;
      break;
    }
  }
  
  if (studentRow === -1){
    var idInfo = [];
    if (serial) idInfo.push('Serial: ' + serial);
    if (email) idInfo.push('Email: ' + email);
    if (nome) idInfo.push('Nome: ' + nome);
    console.warn('Aluno com ' + idInfo.join(', ') + ' não encontrado em ' + escalaName + ' (precisa de pelo menos 2 identificadores correspondentes)');
    return;
  }

  // formatar data (procuramos dd/mm ou dd_mm nas colunas)
  var parsed = parseDateFlexible_(dataRaw);
  if (!parsed){
    console.warn('Data inválida:', dataRaw);
    return;
  }
  var ddmm = two(parsed.getDate()) + '/' + two(parsed.getMonth()+1);
  var ddmm_underscore = two(parsed.getDate()) + '_' + two(parsed.getMonth()+1);

  // localizar coluna de data na escala usando a função helper
  var dateColIndex = -1;
  for (var j=0;j<headersEsc.length;j++){
    if (isDateHeaderMatch_(headersEsc[j], parsed)) {
      dateColIndex = j+1;
      break;
    }
  }
  if (dateColIndex === -1){
    console.warn('Coluna de data ' + ddmm + ' (ou ' + ddmm_underscore + ') não encontrada em ' + escalaName);
    return;
  }

  // construir string de horário (somente hora - com segundos se disponíveis)
  var timeStr = '';
  if (horaEnt && horaSai) timeStr = entradaSaidaToString_(horaEnt, horaSai);
  else if (horaEnt) timeStr = entradaSaidaToString_(horaEnt, '');
  else if (horaSai) timeStr = entradaSaidaToString_('', horaSai);
  else {
    console.warn('Sem horário para gravar para aluno na linha ' + studentRow + ' em ' + ddmm);
    return;
  }

  var cell = escalaSheet.getRange(studentRow, dateColIndex);
  var existing = cell.getValue();
  var newEntry = timeStr; // **somente o horário** (ex: 07:00:54 - 12:00:54)
  
  // Verifica se já existe esse horário exato para evitar duplicatas
  if (existing) {
    var existingStr = String(existing);
    // Se o horário já existe, não sobrescreve
    if (existingStr.indexOf(newEntry) !== -1) {
      console.log('Horário já registrado na linha ' + studentRow + ' em ' + ddmm + '. Ignorando duplicata.');
      return;
    }
    // Adiciona nova entrada em nova linha
    cell.setValue(existingStr + '\n' + newEntry);
  } else {
    cell.setValue(newEntry);
  }
}

/**
 * Sincroniza uma linha da aba PontoTeoria para a aba FrequenciaTeorica correspondente.
 * O número da escala (1-12) determina qual aba FrequenciaTeorica receberá a linha.
 * @param {Spreadsheet} spreadsheet - A planilha ativa
 * @param {Sheet} pontoTeoriaSheet - A aba PontoTeoria
 * @param {number} rowNumber - O número da linha a ser copiada
 * @param {string} escalaNumber - O número da escala (1-12)
 */
function syncToFrequenciaTeorica_(spreadsheet, pontoTeoriaSheet, rowNumber, escalaNumber) {
  // Valida se o número da escala está no intervalo 1-12
  var escalaNum = parseInt(escalaNumber, 10);
  if (isNaN(escalaNum) || escalaNum < 1 || escalaNum > 12) {
    console.warn('Número de escala inválido para FrequenciaTeorica: ' + escalaNumber);
    return;
  }

  var freqSheetName = 'FrequenciaTeorica' + escalaNum;
  var freqSheet = spreadsheet.getSheetByName(freqSheetName);
  if (!freqSheet) {
    console.warn('Aba ' + freqSheetName + ' não encontrada.');
    return;
  }

  // Obtém os dados da linha inteira de PontoTeoria
  var lastCol = pontoTeoriaSheet.getLastColumn();
  var rowData = pontoTeoriaSheet.getRange(rowNumber, 1, 1, lastCol).getValues()[0];

  // Obtém os cabeçalhos de PontoTeoria e FrequenciaTeorica
  var headersOrigem = pontoTeoriaSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var headersDestino = freqSheet.getRange(1, 1, 1, freqSheet.getLastColumn()).getValues()[0];

  // Verifica se já existe uma linha com os mesmos dados para evitar duplicatas
  // Usa SerialNumber + Data + HoraEntrada + HoraSaida como identificador único
  var serialColOrigem = headersOrigem.indexOf('SerialNumber');
  var dataColOrigem = headersOrigem.indexOf('Data');
  var horaEntColOrigem = headersOrigem.indexOf('HoraEntrada');
  var horaSaiColOrigem = headersOrigem.indexOf('HoraSaida');

  // Se não encontrar SerialNumber, usa a primeira coluna (índice 0)
  if (serialColOrigem < 0) serialColOrigem = 0;

  if (dataColOrigem < 0 || horaEntColOrigem < 0 || horaSaiColOrigem < 0) {
    console.warn('Colunas Data, HoraEntrada ou HoraSaida não encontradas em PontoTeoria');
    return;
  }

  var serialValue = rowData[serialColOrigem];
  var dataValue = rowData[dataColOrigem];
  var horaEntValue = rowData[horaEntColOrigem];
  var horaSaiValue = rowData[horaSaiColOrigem];

  if (!serialValue) {
    console.warn('SerialNumber vazio na linha ' + rowNumber);
    return;
  }

  // Procura colunas correspondentes em FrequenciaTeorica
  var serialColDestino = headersDestino.indexOf('SerialNumber');
  var dataColDestino = headersDestino.indexOf('Data');
  var horaEntColDestino = headersDestino.indexOf('HoraEntrada');
  var horaSaiColDestino = headersDestino.indexOf('HoraSaida');

  // Se não encontrar SerialNumber, usa a primeira coluna
  if (serialColDestino < 0) serialColDestino = 0;

  // Verifica se já existe a mesma linha em FrequenciaTeorica (evita duplicatas)
  var lastRowFreq = freqSheet.getLastRow();
  if (lastRowFreq >= 2 && dataColDestino >= 0 && horaEntColDestino >= 0 && horaSaiColDestino >= 0) {
    var existingData = freqSheet.getRange(2, 1, lastRowFreq - 1, freqSheet.getLastColumn()).getValues();
    var dataFormatada = formatDateForComparison_(dataValue);
    var horaEntFormatada = formatTimeForComparison_(horaEntValue);
    var horaSaiFormatada = formatTimeForComparison_(horaSaiValue);

    for (var i = 0; i < existingData.length; i++) {
      var existingSerial = String(existingData[i][serialColDestino] || '').trim();
      var existingDataRow = formatDateForComparison_(existingData[i][dataColDestino]);
      var existingHoraEnt = formatTimeForComparison_(existingData[i][horaEntColDestino]);
      var existingHoraSai = formatTimeForComparison_(existingData[i][horaSaiColDestino]);

      if (existingSerial === String(serialValue).trim() &&
          existingDataRow === dataFormatada &&
          existingHoraEnt === horaEntFormatada &&
          existingHoraSai === horaSaiFormatada) {
        console.log('Linha já existe em ' + freqSheetName + '. Ignorando duplicata.');
        return;
      }
    }
  }

  // Adiciona a linha inteira na aba FrequenciaTeorica
  freqSheet.appendRow(rowData);
  console.log('Linha sincronizada para ' + freqSheetName + ': SerialNumber ' + serialValue);
}

/**
 * Formata uma data para comparação (dd/MM/yyyy)
 * @param {Date|string} value - O valor da data
 * @returns {string} A data formatada como string
 */
function formatDateForComparison_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return two(value.getDate()) + '/' + two(value.getMonth() + 1) + '/' + value.getFullYear();
  }
  return String(value).trim();
}

/**
 * Formata uma hora para comparação (HH:MM:SS)
 * @param {Date|string} value - O valor da hora
 * @returns {string} A hora formatada como string
 */
function formatTimeForComparison_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return two(value.getHours()) + ':' + two(value.getMinutes()) + ':' + two(value.getSeconds());
  }
  return String(value).trim();
}

/** helper: pad 2 */
function two(n){ return ('0' + n).slice(-2); }

/** tenta parsear datas em formatos comuns (dd/mm/yyyy, dd/mm, Date object, strings) */
function parseDateFlexible_(v){
  if (!v) return null;
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return v;
  var s = String(v).trim();
  var m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    var d = parseInt(m[1],10), mo = parseInt(m[2],10)-1, y = parseInt(m[3],10);
    if (y < 100) y += 2000;
    return new Date(y,mo,d);
  }
  m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})$/);
  if (m){
    var d2 = parseInt(m[1],10), mo2 = parseInt(m[2],10)-1, y2 = (new Date()).getFullYear();
    return new Date(y2,mo2,d2);
  }
  var dt = new Date(s);
  if (!isNaN(dt)) return dt;
  return null;
}

/**
 * Verifica se um cabeçalho de coluna corresponde a uma data.
 * Suporta formatos: dd/mm, dd_mm, dd/mm/yyyy, dd_mm/yyyy, ou objetos Date.
 * @param {*} header - O valor do cabeçalho (string ou Date)
 * @param {Date} parsedDate - A data parseada para comparar
 * @returns {boolean} true se o cabeçalho corresponde à data
 */
function isDateHeaderMatch_(header, parsedDate) {
  if (!header || !parsedDate) return false;
  
  // Se o cabeçalho é um objeto Date
  if (Object.prototype.toString.call(header) === '[object Date]' && !isNaN(header)) {
    return header.getDate() === parsedDate.getDate() && 
           header.getMonth() === parsedDate.getMonth();
  }
  
  // Converte para string e verifica os formatos
  var hs = String(header).trim();
  var dd = two(parsedDate.getDate());
  var mm = two(parsedDate.getMonth() + 1);
  var year = parsedDate.getFullYear();
  
  // Formatos suportados: dd/mm, dd_mm, dd/mm/yyyy, dd_mm/yyyy
  var ddmm_slash = dd + '/' + mm;
  var ddmm_underscore = dd + '_' + mm;
  
  // Verifica se o cabeçalho contém a data em qualquer formato suportado
  return hs.indexOf(ddmm_slash) !== -1 || 
         hs.indexOf(ddmm_underscore) !== -1 ||
         hs.indexOf(ddmm_slash + '/' + year) !== -1 ||
         hs.indexOf(ddmm_underscore + '/' + year) !== -1;
}

/** normaliza entrada/saida para formato HH:MM:SS - HH:MM:SS
 * aceita strings como "7:00:36", "07:00", "07:00:00" ou Date objects.
 */
function entradaSaidaToString_(ent, sai){
  function norm(t){
    if (!t) return '';
    if (Object.prototype.toString.call(t) === '[object Date]' && !isNaN(t)){
      return two(t.getHours()) + ':' + two(t.getMinutes()) + ':' + two(t.getSeconds());
    }
    var s = String(t).trim();
    // já no formato HH:MM[:SS]
    var m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      var hh = two(parseInt(m[1],10));
      var mm = two(parseInt(m[2],10));
      var ss = (m[3] ? two(parseInt(m[3],10)) : '00');
      return hh + ':' + mm + ':' + ss;
    }
    // se vier no formato "07h às 12h" tentamos extrair apenas HH e MM
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

/** sincroniza tudo manualmente */
function syncAllPontos(){
  var ss = SpreadsheetApp.getActive();
  var sheets = ['PontoPratica','PontoTeoria'];
  sheets.forEach(function(name){
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;
    var headers = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var serialCol = headers.indexOf('SerialNumber') + 1;
    var emailCol = headers.indexOf('EmailHC') + 1;
    var nomeCol = headers.indexOf('NomeCompleto') + 1;
    var dataCol = headers.indexOf('Data') + 1;
    var horaEntCol = headers.indexOf('HoraEntrada') + 1;
    var horaSaiCol = headers.indexOf('HoraSaida') + 1;
    var escalaCol = headers.indexOf('Escala') + 1;

    // Requer pelo menos um identificador e data/hora entrada
    if ((emailCol < 1 && serialCol < 1 && nomeCol < 1) || dataCol < 1 || horaEntCol < 1) return;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var rows = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
    for (var i=0;i<rows.length;i++){
      var r = rows[i];
      var serial = (serialCol > 0) ? r[serialCol-1] : '';
      var email = (emailCol > 0) ? r[emailCol-1] : '';
      var nome = (nomeCol > 0) ? r[nomeCol-1] : '';
      
      // Precisa de pelo menos um identificador
      if (!email && !serial && !nome) continue;
      
      var dataRaw = r[dataCol-1];
      var horaEnt = r[horaEntCol-1];
      var horaSai = (horaSaiCol>0) ? r[horaSaiCol-1] : '';
      var escalaNumber = (escalaCol>0 && r[escalaCol-1]) ? String(r[escalaCol-1]) : '9';
      syncOnePontoRow_(ss, escalaNumber, serial, email, nome, dataRaw, horaEnt, horaSai, name);
      // Sincroniza também para FrequenciaTeorica se for aba PontoTeoria
      if (name === 'PontoTeoria') {
        syncToFrequenciaTeorica_(ss, sheet, i + 2, escalaNumber);
      }
    }
  });
}

/**********************************************
 * 📋 MENU PRINCIPAL — Criado ao abrir a planilha
 **********************************************/
function onOpen(){
  var ui = SpreadsheetApp.getUi();
  
  ui.createMenu('📋 Gestão de Pontos')
    // === SEÇÃO 1: INFORMAÇÕES E STATUS ===
    .addItem('ℹ️ Ver Status dos Gatilhos', 'verificarStatusGatilhos')
    .addItem('📊 Ver Última Sincronização', 'mostrarUltimaSincronizacao')
    .addSeparator()
    
    // === SEÇÃO 2: SINCRONIZAÇÃO DE PONTOS (PRIMEIRO) ===
    .addSubMenu(ui.createMenu('🔄 Sincronizar Pontos')
      .addItem('📝 Sincronizar TODOS os pontos para Escalas', 'syncAllPontos')
      .addItem('📋 Sincronizar apenas PontoPrática', 'syncPontoPraticaOnly')
      .addItem('📚 Sincronizar apenas PontoTeoria', 'syncPontoTeoriaOnly')
      .addItem('🎯 Sincronizar para FrequenciaTeorica', 'syncAllFrequenciaTeorica'))
    .addSeparator()
    
    // === SEÇÃO 3: CONFIGURAÇÃO DE GATILHOS ===
    .addSubMenu(ui.createMenu('⚙️ Configurar Gatilhos')
      .addItem('✅ Ativar sincronização automática (Pontos + Firebase)', 'ativarTodosGatilhosAutomaticos')
      .addItem('⏸️ Desativar sincronização automática', 'desativarTodosGatilhosAutomaticos')
      .addSeparator()
      .addItem('🔄 Apenas gatilhos de Ponto (Escalas)', 'criarGatilhosPontoAutomatico')
      .addItem('🔥 Apenas gatilhos de Firebase', 'criarGatilhosAutomaticos')
      .addItem('🕒 Ativar envio diário (21h)', 'criarGatilhoDiario')
      .addItem('🗑️ Remover gatilho diário', 'removerGatilhoDiario'))
    .addSeparator()
    
    // === SEÇÃO 4: ENVIO PARA FIREBASE (ÚLTIMO) ===
    .addSubMenu(ui.createMenu('🔥 Firebase')
      .addItem('⚠️ Verificar configuração do Firebase', 'verificarConfiguracaoFirebase')
      .addSeparator()
      .addItem('🚀 ENVIAR TODOS OS DADOS PARA FIREBASE', 'confirmarEnvioFirebase'))
    
    .addSeparator()
    .addItem('❓ Ajuda - Como usar este menu', 'mostrarAjuda')
    .addToUi();
}

/**********************************************
 * 📊 FUNÇÕES DE INFORMAÇÃO E STATUS
 **********************************************/

/**
 * Mostra a última sincronização realizada
 */
function mostrarUltimaSincronizacao() {
  var ultimaSync = getUltimaSync();
  var mensagem = '';
  
  if (ultimaSync > 0) {
    var dataUltimaSync = new Date(ultimaSync);
    mensagem = '📅 Última sincronização:\n\n' + 
               dataUltimaSync.toLocaleString('pt-BR') + 
               '\n\n(há ' + calcularTempoDecorrido(ultimaSync) + ')';
  } else {
    mensagem = '⚠️ Nenhuma sincronização foi realizada ainda.\n\n' +
               'Use o menu "Sincronizar Pontos" para começar.';
  }
  
  SpreadsheetApp.getUi().alert('📊 Status da Sincronização', mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Calcula o tempo decorrido desde um timestamp
 * @param {number} timestamp - Timestamp em milissegundos
 * @returns {string} Tempo decorrido formatado
 */
function calcularTempoDecorrido(timestamp) {
  var agora = new Date().getTime();
  var diferenca = agora - timestamp;
  
  var segundos = Math.floor(diferenca / 1000);
  var minutos = Math.floor(segundos / 60);
  var horas = Math.floor(minutos / 60);
  var dias = Math.floor(horas / 24);
  
  if (dias > 0) return dias + ' dia(s)';
  if (horas > 0) return horas + ' hora(s)';
  if (minutos > 0) return minutos + ' minuto(s)';
  return segundos + ' segundo(s)';
}

/**********************************************
 * 🔄 FUNÇÕES DE SINCRONIZAÇÃO ESPECÍFICAS
 **********************************************/

/**
 * Sincroniza apenas a aba PontoPrática para as Escalas
 */
function syncPontoPraticaOnly() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('PontoPratica');
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Erro', 'Aba "PontoPratica" não encontrada!', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  syncSinglePontoSheet_(ss, sheet, 'PontoPratica');
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ PontoPrática sincronizado com sucesso!', 'Sincronização', 5);
}

/**
 * Sincroniza apenas a aba PontoTeoria para as Escalas
 */
function syncPontoTeoriaOnly() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('PontoTeoria');
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Erro', 'Aba "PontoTeoria" não encontrada!', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  syncSinglePontoSheet_(ss, sheet, 'PontoTeoria');
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ PontoTeoria sincronizado com sucesso!', 'Sincronização', 5);
}

/**
 * Sincroniza uma aba de ponto específica
 * @param {Spreadsheet} ss - A planilha ativa
 * @param {Sheet} sheet - A aba a ser sincronizada
 * @param {string} sheetName - Nome da aba
 */
function syncSinglePontoSheet_(ss, sheet, sheetName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var serialCol = headers.indexOf('SerialNumber') + 1;
  var emailCol = headers.indexOf('EmailHC') + 1;
  var nomeCol = headers.indexOf('NomeCompleto') + 1;
  var dataCol = headers.indexOf('Data') + 1;
  var horaEntCol = headers.indexOf('HoraEntrada') + 1;
  var horaSaiCol = headers.indexOf('HoraSaida') + 1;
  var escalaCol = headers.indexOf('Escala') + 1;

  // Requer pelo menos um identificador e data/hora entrada
  if ((emailCol < 1 && serialCol < 1 && nomeCol < 1) || dataCol < 1 || horaEntCol < 1) {
    console.warn('Cabeçalhos obrigatórios não encontrados na aba ' + sheetName);
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var sincronizados = 0;
  
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
    
    syncOnePontoRow_(ss, escalaNumber, serial, email, nome, dataRaw, horaEnt, horaSai, sheetName);
    
    if (sheetName === 'PontoTeoria') {
      syncToFrequenciaTeorica_(ss, sheet, i + 2, escalaNumber);
    }
    sincronizados++;
  }
  
  console.log('✅ ' + sincronizados + ' registros sincronizados de ' + sheetName);
}

/**
 * Sincroniza todas as linhas de PontoTeoria para FrequenciaTeorica
 */
function syncAllFrequenciaTeorica() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName('PontoTeoria');
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert('❌ Erro', 'Aba "PontoTeoria" não encontrada!', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var escalaCol = headers.indexOf('Escala') + 1;
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getActiveSpreadsheet().toast('⚠️ Nenhum dado para sincronizar em PontoTeoria', 'Sincronização', 5);
    return;
  }
  
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var sincronizados = 0;
  
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var escalaNumber = (escalaCol > 0 && r[escalaCol - 1]) ? String(r[escalaCol - 1]) : '9';
    syncToFrequenciaTeorica_(ss, sheet, i + 2, escalaNumber);
    sincronizados++;
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast('✅ ' + sincronizados + ' registros sincronizados para FrequenciaTeorica!', 'Sincronização', 5);
}

/**********************************************
 * ⚙️ FUNÇÕES DE GATILHOS
 **********************************************/

/**
 * Remove o gatilho diário
 */
function removerGatilhoDiario() {
  var gatilhos = ScriptApp.getProjectTriggers();
  var removidos = 0;
  
  for (var i = 0; i < gatilhos.length; i++) {
    var t = gatilhos[i];
    if (t.getHandlerFunction() === 'enviarTodasAsAbasParaFirebase') {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  }
  
  if (removidos > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast('🗑️ Gatilho diário removido!', 'Gatilhos', 5);
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('⚠️ Nenhum gatilho diário encontrado para remover.', 'Gatilhos', 5);
  }
}

/**********************************************
 * 🔥 FUNÇÕES DO FIREBASE
 **********************************************/

/**
 * Verifica se o Firebase está configurado corretamente
 */
function verificarConfiguracaoFirebase() {
  var secret = PropertiesService.getScriptProperties().getProperty('FIREBASE_SECRET');
  var ui = SpreadsheetApp.getUi();
  
  if (secret) {
    ui.alert('✅ Configuração OK', 
             'A chave do Firebase está configurada.\n\n' +
             'Você pode enviar dados para o Firebase.',
             ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Firebase NÃO configurado', 
             'A chave do Firebase (FIREBASE_SECRET) não está configurada.\n\n' +
             'Para configurar:\n' +
             '1. Vá em "Extensões" → "Apps Script"\n' +
             '2. Clique em "Configurações do projeto" (ícone de engrenagem)\n' +
             '3. Role até "Propriedades de script"\n' +
             '4. Adicione a propriedade FIREBASE_SECRET com sua chave',
             ui.ButtonSet.OK);
  }
}

/**
 * Confirmação antes de enviar dados para o Firebase
 */
function confirmarEnvioFirebase() {
  var ui = SpreadsheetApp.getUi();
  
  var resposta = ui.alert(
    '🔥 Enviar Dados para o Firebase',
    '⚠️ ATENÇÃO: Antes de enviar, certifique-se de que:\n\n' +
    '1️⃣ Você sincronizou todos os pontos (menu "Sincronizar Pontos")\n' +
    '2️⃣ Todas as alterações nos pontos foram feitas\n' +
    '3️⃣ Os dados nas abas estão corretos\n\n' +
    '📤 Deseja enviar TODOS os dados para o Firebase agora?\n\n' +
    '(Esta ação irá atualizar o Firebase com os dados atuais da planilha)',
    ui.ButtonSet.YES_NO
  );
  
  if (resposta === ui.Button.YES) {
    enviarTodasAsAbasParaFirebase();
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast('❌ Envio cancelado pelo usuário.', 'Firebase', 3);
  }
}

/**********************************************
 * ❓ AJUDA
 **********************************************/

/**
 * Mostra a ajuda sobre como usar o menu
 */
function mostrarAjuda() {
  var ui = SpreadsheetApp.getUi();
  
  var mensagem = 
    '📋 GUIA DO MENU DE GESTÃO DE PONTOS\n\n' +
    '═══════════════════════════════════════\n\n' +
    '📊 VER STATUS:\n' +
    '• Ver Status dos Gatilhos - Mostra quais automações estão ativas\n' +
    '• Ver Última Sincronização - Mostra quando foi a última sync\n\n' +
    '═══════════════════════════════════════\n\n' +
    '🔄 SINCRONIZAR PONTOS:\n' +
    '• Sincroniza pontos de PontoPratica e PontoTeoria para Escalas\n' +
    '• Evita duplicatas automaticamente\n\n' +
    '═══════════════════════════════════════\n\n' +
    '⚙️ CONFIGURAR GATILHOS:\n' +
    '• Ativar sincronização automática - Ativa TUDO automaticamente:\n' +
    '  → Pontos para Escalas\n' +
    '  → Escalas para Firebase\n' +
    '  → Funciona mesmo com a planilha FECHADA!\n' +
    '• Desativar - Remove todas as automações\n' +
    '• Gatilhos específicos disponíveis separadamente\n\n' +
    '═══════════════════════════════════════\n\n' +
    '🔥 FIREBASE:\n' +
    '• Verificar configuração - Checa se o Firebase está pronto\n' +
    '• ENVIAR DADOS - Envia tudo manualmente para o Firebase\n\n' +
    '═══════════════════════════════════════\n\n' +
    '💡 RECOMENDAÇÃO:\n' +
    'Ative a sincronização automática uma vez e deixe o sistema\n' +
    'trabalhar sozinho! Dados são sincronizados imediatamente\n' +
    'a cada alteração, sem duplicatas.';
  
  ui.alert('❓ Ajuda - Menu de Gestão de Pontos', mensagem, ui.ButtonSet.OK);
}

/**********************************************
 * 🔧 FUNÇÕES COMBINADAS DE GATILHOS
 **********************************************/

/**
 * Ativa TODOS os gatilhos automáticos:
 * - Sincronização de pontos para Escalas
 * - Envio automático para Firebase
 * Funciona mesmo com a planilha fechada.
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
  
  // Cria gatilhos para Firebase
  ScriptApp.newTrigger('onEditFirebase')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  
  ScriptApp.newTrigger('onChangeFirebase')
    .forSpreadsheet(ss)
    .onChange()
    .create();
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '✅ Sincronização COMPLETA ativada!\n\n' +
    '• Pontos → Escalas: Automático\n' +
    '• Escalas → Firebase: Automático\n\n' +
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
