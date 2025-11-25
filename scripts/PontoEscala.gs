/**
 * Atualizado para inserir apenas "HH:MM:SS - HH:MM:SS" (sem "Prática:"/ "Teoria:")
 * Cole em Extensions → Apps Script do seu Google Sheets.
 */

function onEdit(e){
  try {
    handlePontoChange(e);
  } catch(err) {
    console.error("Erro em onEdit:", err);
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
  var emailCol = idx('EmailHC');
  var dataCol = idx('Data');
  var horaEntCol = idx('HoraEntrada');
  var horaSaiCol = idx('HoraSaida');
  var escalaCol = idx('Escala');

  if (emailCol < 0 || dataCol < 0 || horaEntCol < 0) {
    console.warn('Cabeçalhos obrigatórios não encontrados na aba ' + sheetName);
    return;
  }

  var startRow = e.range.getRow();
  var endRow = e.range.getLastRow();

  for (var r = startRow; r <= endRow; r++){
    var row = sheet.getRange(r,1,1,sheet.getLastColumn()).getValues()[0];
    var email = row[emailCol-1];
    if (!email) continue;

    var dataRaw = row[dataCol-1];
    var horaEnt = row[horaEntCol-1];
    var horaSai = (horaSaiCol>0) ? row[horaSaiCol-1] : '';
    var escalaNumber = (escalaCol>0 && row[escalaCol-1]) ? String(row[escalaCol-1]) : '9';

    try {
      syncOnePontoRow_(e.source, escalaNumber, email, dataRaw, horaEnt, horaSai);
      // Sincroniza também para FrequenciaTeorica se for aba PontoTeoria
      if (sheetName === 'PontoTeoria') {
        syncToFrequenciaTeorica_(e.source, sheet, r, escalaNumber);
      }
    } catch(err) {
      console.error('Erro sincronizando linha ' + r + ':', err);
    }
  }
}

function syncOnePontoRow_(spreadsheet, escalaNumber, email, dataRaw, horaEnt, horaSai){
  var escalaName = 'Escala' + escalaNumber;
  var escalaSheet = spreadsheet.getSheetByName(escalaName);
  if (!escalaSheet){
    console.warn('Aba ' + escalaName + ' não encontrada.');
    return;
  }

  // ler cabeçalho da escala
  var headersEsc = escalaSheet.getRange(1,1,1,escalaSheet.getLastColumn()).getValues()[0];
  var emailColEsc = headersEsc.indexOf('EmailHC') + 1;
  if (emailColEsc === 0) {
    for (var i=0;i<headersEsc.length;i++){
      var h = String(headersEsc[i]||'').toLowerCase();
      if (h.indexOf('email') !== -1) { emailColEsc = i+1; break; }
    }
    if (emailColEsc === 0){
      console.warn('Coluna EmailHC não encontrada na ' + escalaName);
      return;
    }
  }

  // localizar a linha do aluno (buscando EmailHC)
  var lastRow = Math.max(escalaSheet.getLastRow(), 2);
  if (lastRow < 2) { console.warn('Escala vazia'); return; }
  var emails = escalaSheet.getRange(2, emailColEsc, lastRow-1, 1).getValues();
  var studentRow = -1;
  for (var rr=0; rr<emails.length; rr++){
    var val = emails[rr][0];
    if (!val) continue;
    if (String(val).trim().toLowerCase() === String(email).trim().toLowerCase()){
      studentRow = rr + 2;
      break;
    }
  }
  if (studentRow === -1){
    console.warn('Aluno com email ' + email + ' não encontrado em ' + escalaName);
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

  // localizar coluna de data na escala (procura por "dd/mm" ou "dd_mm" dentro do cabeçalho)
  var dateColIndex = -1;
  for (var j=0;j<headersEsc.length;j++){
    var h = headersEsc[j];
    if (!h) continue;
    var hs = String(h);
    // Verifica formato com barra (dd/mm) ou com underscore (dd_mm)
    if (hs.indexOf(ddmm) !== -1 || hs.trim() === ddmm || 
        hs.indexOf(ddmm_underscore) !== -1 || hs.trim() === ddmm_underscore ||
        hs.indexOf(ddmm + '/' + parsed.getFullYear()) !== -1 ||
        hs.indexOf(ddmm_underscore + '_' + parsed.getFullYear()) !== -1) {
      dateColIndex = j+1;
      break;
    }
    if (Object.prototype.toString.call(h) === '[object Date]' && !isNaN(h)) {
      if (h.getDate() === parsed.getDate() && h.getMonth() === parsed.getMonth()) {
        dateColIndex = j+1; break;
      }
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
    console.warn('Sem horário para gravar para ' + email + ' em ' + ddmm);
    return;
  }

  var cell = escalaSheet.getRange(studentRow, dateColIndex);
  var existing = cell.getValue();
  var newEntry = timeStr; // **somente o horário** (ex: 07:00:54 - 12:00:54)
  var finalValue = existing ? (String(existing) + '\n' + newEntry) : newEntry;
  cell.setValue(finalValue);
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
    var emailCol = headers.indexOf('EmailHC') + 1;
    var dataCol = headers.indexOf('Data') + 1;
    var horaEntCol = headers.indexOf('HoraEntrada') + 1;
    var horaSaiCol = headers.indexOf('HoraSaida') + 1;
    var escalaCol = headers.indexOf('Escala') + 1;

    if (emailCol < 1 || dataCol < 1 || horaEntCol < 1) return;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var rows = sheet.getRange(2,1,lastRow-1,sheet.getLastColumn()).getValues();
    for (var i=0;i<rows.length;i++){
      var r = rows[i];
      var email = r[emailCol-1];
      if (!email) continue;
      var dataRaw = r[dataCol-1];
      var horaEnt = r[horaEntCol-1];
      var horaSai = (horaSaiCol>0) ? r[horaSaiCol-1] : '';
      var escalaNumber = (escalaCol>0 && r[escalaCol-1]) ? String(r[escalaCol-1]) : '9';
      syncOnePontoRow_(ss, escalaNumber, email, dataRaw, horaEnt, horaSai);
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
      .addItem('✅ Ativar sincronização automática', 'criarGatilhosAutomaticos')
      .addItem('⏸️ Desativar sincronização automática', 'removerGatilhosAutomaticos')
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
  var emailCol = headers.indexOf('EmailHC') + 1;
  var dataCol = headers.indexOf('Data') + 1;
  var horaEntCol = headers.indexOf('HoraEntrada') + 1;
  var horaSaiCol = headers.indexOf('HoraSaida') + 1;
  var escalaCol = headers.indexOf('Escala') + 1;

  if (emailCol < 1 || dataCol < 1 || horaEntCol < 1) {
    console.warn('Cabeçalhos obrigatórios não encontrados na aba ' + sheetName);
    return;
  }
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  var rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  var sincronizados = 0;
  
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var email = r[emailCol - 1];
    if (!email) continue;
    
    var dataRaw = r[dataCol - 1];
    var horaEnt = r[horaEntCol - 1];
    var horaSai = (horaSaiCol > 0) ? r[horaSaiCol - 1] : '';
    var escalaNumber = (escalaCol > 0 && r[escalaCol - 1]) ? String(r[escalaCol - 1]) : '9';
    
    syncOnePontoRow_(ss, escalaNumber, email, dataRaw, horaEnt, horaSai);
    
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
    '• Use ANTES de enviar para o Firebase\n' +
    '• Sincroniza os pontos das abas PontoPratica e PontoTeoria\n' +
    '• Os dados são copiados para as abas de Escala correspondentes\n\n' +
    '═══════════════════════════════════════\n\n' +
    '⚙️ CONFIGURAR GATILHOS:\n' +
    '• Ativa/desativa a sincronização automática\n' +
    '• Configura envio diário automático às 21h\n\n' +
    '═══════════════════════════════════════\n\n' +
    '🔥 FIREBASE:\n' +
    '• Verificar configuração - Checa se o Firebase está pronto\n' +
    '• ENVIAR DADOS - Envia tudo para o Firebase\n' +
    '  ⚠️ Use sempre APÓS sincronizar os pontos!\n\n' +
    '═══════════════════════════════════════\n\n' +
    '💡 ORDEM RECOMENDADA:\n' +
    '1. Faça alterações nos pontos\n' +
    '2. Sincronize os pontos (menu Sincronizar Pontos)\n' +
    '3. Envie para o Firebase (menu Firebase)';
  
  ui.alert('❓ Ajuda - Menu de Gestão de Pontos', mensagem, ui.ButtonSet.OK);
}
