function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var id = data.SerialNumber || "";
    var nome = data.NomeCompleto || "Desconhecido";
    var email = data.EmailHC || "";
    var escala = data.Escala || "";
    var simularTerca = data.SimularTerça || false;

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var abaPratica = ss.getSheetByName("PontoPratica");
    var abaTeoria = ss.getSheetByName("PontoTeoria");
    if (!abaPratica || !abaTeoria)
      throw new Error("Abas 'PontoPratica' ou 'PontoTeoria' não encontradas!");

    var agora = new Date();
    var dataStr = Utilities.formatDate(agora, "America/Sao_Paulo", "dd/MM/yyyy");
    var horaStr = Utilities.formatDate(agora, "America/Sao_Paulo", "HH:mm:ss");
    var diaSemana = agora.getDay();
    if (simularTerca) diaSemana = 2; // simulação para testes

    // === 1. Verifica se há linha aberta na TEORIA ===
    var dadosTeoria = abaTeoria.getDataRange().getValues();
    var linhaTeoriaAberta = null;
    var linhaTeoriaCompleta = false;

    for (var i = 1; i < dadosTeoria.length; i++) {
      var linhaId = dadosTeoria[i][0];
      var linhaData = formatarData(dadosTeoria[i][3]);
      var entrada = dadosTeoria[i][4];
      var saida = dadosTeoria[i][5];

      if (linhaId == id && linhaData == dataStr) {
        if (!saida) linhaTeoriaAberta = i + 1;
        else linhaTeoriaCompleta = true;
      }
    }

    // Se já existe teoria completa → ignora
    if (linhaTeoriaCompleta) {
      return resposta("Sem ação: aluno já completou a teoria hoje.");
    }

    // Se existe teoria aberta → registrar saída e parar
    if (linhaTeoriaAberta) {
      abaTeoria.getRange(linhaTeoriaAberta, 6).setValue(horaStr);
      return resposta("Saída teórica registrada: " + horaStr);
    }

    // === 2. Verifica se há linha aberta na PRÁTICA ===
    var dadosPratica = abaPratica.getDataRange().getValues();
    var linhaPraticaAberta = null;
    var linhaPraticaCompleta = false;

    for (var i = 1; i < dadosPratica.length; i++) {
      var linhaId = dadosPratica[i][0];
      var linhaData = formatarData(dadosPratica[i][3]);
      var entrada = dadosPratica[i][4];
      var saida = dadosPratica[i][5];

      if (linhaId == id && linhaData == dataStr) {
        if (!saida) linhaPraticaAberta = i + 1;
        else linhaPraticaCompleta = true;
      }
    }

    // Se já existe prática completa e não é dia de teoria → ignora
    if (linhaPraticaCompleta && diaSemana !== 2 && diaSemana !== 4) {
      return resposta("Sem ação: aluno já completou a prática hoje.");
    }

    // === 3. Caso não exista prática aberta → cria nova entrada prática ===
    if (!linhaPraticaAberta && !linhaPraticaCompleta) {
      abaPratica.appendRow([id, email, nome, dataStr, horaStr, "", escala, "Prática"]);
      return resposta("Entrada prática registrada: " + horaStr);
    }

    // === 4. Caso exista prática aberta → registra saída ===
    if (linhaPraticaAberta) {
      abaPratica.getRange(linhaPraticaAberta, 6).setValue(horaStr);

      // Se for terça (2) ou quinta (4), cria entrada teórica automaticamente
      if (diaSemana === 2 || diaSemana === 4) {
        // Verifica se já há teoria hoje
        var existeTeoriaHoje = dadosTeoria.some(function (r) {
          return r[0] == id && formatarData(r[3]) == dataStr;
        });
        if (!existeTeoriaHoje) {
          abaTeoria.appendRow([id, email, nome, dataStr, horaStr, "", escala, "Teoria"]);
          // Sincroniza automaticamente para FrequenciaTeorica
          var novaLinha = abaTeoria.getLastRow();
          syncToFrequenciaTeoricaFromPonto_(ss, abaTeoria, novaLinha, escala);
          return resposta("Saída prática e entrada teórica registradas: " + horaStr);
        }
      }

      return resposta("Saída prática registrada: " + horaStr);
    }

    // === 5. Caso final: não há nada a fazer ===
    return resposta("Sem ação necessária para o ID " + id + ".");

  } catch (err) {
    return resposta("Erro: " + err.message);
  }
}

// === Funções auxiliares ===
function formatarData(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, "America/Sao_Paulo", "dd/MM/yyyy");
  }
  return valor;
}

function resposta(msg) {
  return ContentService.createTextOutput(msg).setMimeType(ContentService.MimeType.TEXT);
}

/**
 * Sincroniza uma linha da aba PontoTeoria para a aba FrequenciaTeorica correspondente.
 * Chamada automaticamente quando uma nova entrada teórica é criada via doPost.
 * @param {Spreadsheet} spreadsheet - A planilha ativa
 * @param {Sheet} pontoTeoriaSheet - A aba PontoTeoria
 * @param {number} rowNumber - O número da linha a ser copiada
 * @param {string} escalaNumber - O número da escala (1-12)
 */
function syncToFrequenciaTeoricaFromPonto_(spreadsheet, pontoTeoriaSheet, rowNumber, escalaNumber) {
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

  // Usa EmailHC + Data como identificador único para evitar duplicatas
  var emailColOrigem = headersOrigem.indexOf('EmailHC');
  var dataColOrigem = headersOrigem.indexOf('Data');

  if (emailColOrigem < 0 || dataColOrigem < 0) {
    console.warn('Colunas EmailHC ou Data não encontradas em PontoTeoria');
    return;
  }

  var emailValue = rowData[emailColOrigem];
  var dataValue = rowData[dataColOrigem];

  if (!emailValue) {
    console.warn('Email vazio na linha ' + rowNumber);
    return;
  }

  // Procura colunas correspondentes em FrequenciaTeorica
  var emailColDestino = headersDestino.indexOf('EmailHC');
  var dataColDestino = headersDestino.indexOf('Data');

  if (emailColDestino < 0) {
    for (var i = 0; i < headersDestino.length; i++) {
      var h = String(headersDestino[i] || '').toLowerCase();
      if (h.indexOf('email') !== -1) { emailColDestino = i; break; }
    }
  }

  // Verifica se já existe a mesma linha em FrequenciaTeorica (evita duplicatas)
  var lastRowFreq = freqSheet.getLastRow();
  if (lastRowFreq >= 2 && emailColDestino >= 0 && dataColDestino >= 0) {
    var existingData = freqSheet.getRange(2, 1, lastRowFreq - 1, freqSheet.getLastColumn()).getValues();
    var dataFormatada = formatarDataParaComparacao_(dataValue);

    for (var i = 0; i < existingData.length; i++) {
      var existingEmail = String(existingData[i][emailColDestino] || '').trim().toLowerCase();
      var existingDataRow = formatarDataParaComparacao_(existingData[i][dataColDestino]);

      if (existingEmail === String(emailValue).trim().toLowerCase() &&
          existingDataRow === dataFormatada) {
        console.log('Linha já existe em ' + freqSheetName + '. Ignorando duplicata.');
        return;
      }
    }
  }

  // Adiciona a linha inteira na aba FrequenciaTeorica
  freqSheet.appendRow(rowData);
  console.log('Linha sincronizada automaticamente para ' + freqSheetName + ': ' + emailValue);
}

/**
 * Formata uma data para comparação (dd/MM/yyyy)
 * @param {Date|string} value - O valor da data
 * @returns {string} A data formatada como string
 */
function formatarDataParaComparacao_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, "America/Sao_Paulo", "dd/MM/yyyy");
  }
  return String(value).trim();
}
