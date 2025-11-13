/**********************************************
 * 🔧 CONFIGURAÇÕES GERAIS
 **********************************************/
const FIREBASE_URL = "https://dashboardalunos-default-rtdb.firebaseio.com/"; // ⚠️ Substitua pelo seu
const FIREBASE_SECRET = PropertiesService.getScriptProperties().getProperty("FIREBASE_SECRET");

/**********************************************
 * 📤 FUNÇÃO PRINCIPAL — Envia todas as abas alteradas
 **********************************************/
function enviarTodasAsAbasParaFirebase() {
  if (!FIREBASE_SECRET) {
    Logger.log("❌ ERRO: chave do Firebase não configurada. Rode salvarChaveFirebase() primeiro.");
    SpreadsheetApp.getActiveSpreadsheet().toast("Erro: chave Firebase não configurada ❌", "Firebase", 6);
    return;
  }

  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const abas = planilha.getSheets();
  let totalEnviadas = 0;
  let totalIgnoradas = 0;

  for (let aba of abas) {
    const nomeAba = sanitizeKey(aba.getName());
    const dados = aba.getDataRange().getValues();
    if (dados.length < 2) continue; // ignora abas vazias

    const cabecalhos = dados.shift().map(h => sanitizeKey(h));
    const registros = [];

    // Gera string para calcular hash
    let conteudoConcatenado = "";
    for (let i = 0; i < dados.length; i++) {
      conteudoConcatenado += JSON.stringify(dados[i]);
    }

    const hashAtual = gerarHash(conteudoConcatenado);
    const hashAnterior = getHashAnterior(nomeAba);

    if (hashAtual === hashAnterior) {
      Logger.log("⏭️ Nenhuma alteração em: " + nomeAba);
      totalIgnoradas++;
      continue;
    }

    // Monta objetos
    for (let i = 0; i < dados.length; i++) {
      const linha = dados[i];
      const obj = {};
      for (let j = 0; j < cabecalhos.length; j++) {
        obj[cabecalhos[j]] = linha[j];
      }
      registros.push(obj);
    }

    const url = FIREBASE_URL + nomeAba + ".json?auth=" + FIREBASE_SECRET;
    const opcoes = {
      method: "put",
      contentType: "application/json",
      payload: JSON.stringify(registros),
      muteHttpExceptions: true
    };

    try {
      const resposta = UrlFetchApp.fetch(url, opcoes);
      const status = resposta.getResponseCode();
      if (status === 200) {
        salvarHash(nomeAba, hashAtual);
        Logger.log("✅ Enviado com sucesso: " + nomeAba);
        totalEnviadas++;
      } else {
        Logger.log("⚠️ Falha ao enviar " + nomeAba + ": " + status);
      }
    } catch (erro) {
      Logger.log("❌ Erro ao enviar " + nomeAba + ": " + erro);
    }
  }

  Logger.log("🚀 Envio concluído — Enviadas: " + totalEnviadas + " | Ignoradas: " + totalIgnoradas);
  SpreadsheetApp.getActiveSpreadsheet().toast(`Firebase atualizado! ✅ Enviadas: ${totalEnviadas} | Ignoradas: ${totalIgnoradas}`, "Firebase Sync", 8);
}

/**********************************************
 * 🧮 HASH (detecta alterações)
 **********************************************/
function gerarHash(texto) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto);
  return digest.map(b => (b + 256) % 256).map(b => ("0" + b.toString(16)).slice(-2)).join("");
}

function salvarHash(nomeAba, hash) {
  PropertiesService.getScriptProperties().setProperty("HASH_" + nomeAba, hash);
}

function getHashAnterior(nomeAba) {
  return PropertiesService.getScriptProperties().getProperty("HASH_" + nomeAba) || "";
}

/**********************************************
 * 🧹 SANITIZAÇÃO DE CHAVES
 **********************************************/
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
 * 🕒 GATILHO AUTOMÁTICO — Executa todo dia às 21h
 **********************************************/
function criarGatilhoDiario() {
  // Apaga gatilhos antigos pra evitar duplicação
  const gatilhos = ScriptApp.getProjectTriggers();
  for (const t of gatilhos) {
    if (t.getHandlerFunction() === "enviarTodasAsAbasParaFirebase") {
      ScriptApp.deleteTrigger(t);
    }
  }

  // Cria novo gatilho diário às 21h
  ScriptApp.newTrigger("enviarTodasAsAbasParaFirebase")
    .timeBased()
    .everyDays(1)
    .atHour(21)
    .create();

  Logger.log("🕒 Gatilho criado: execução diária às 21h.");
}
