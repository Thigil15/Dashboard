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
