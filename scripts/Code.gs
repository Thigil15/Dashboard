/**********************************************
 * 🔧 CONFIGURAÇÕES GERAIS
 **********************************************/
const FIREBASE_URL = "https://dashboardalunos-default-rtdb.firebaseio.com/"; // ⚠️ Substitua pelo seu
const FIREBASE_SECRET = PropertiesService.getScriptProperties().getProperty("FIREBASE_SECRET");

/**********************************************
 * 🔨 FUNÇÕES AUXILIARES (HELPERS)
 **********************************************/

/**
 * Gera hash MD5 dos dados para detectar alterações.
 * @param {Array} dados - Array de linhas de dados
 * @returns {string} Hash MD5 em hexadecimal
 */
function gerarHashDados(dados) {
  let conteudoConcatenado = "";
  for (let i = 0; i < dados.length; i++) {
    conteudoConcatenado += JSON.stringify(dados[i]);
  }
  return gerarHash(conteudoConcatenado);
}

/**
 * Cria array de registros (objetos) a partir dos dados e cabeçalhos.
 * @param {Array} dados - Array de linhas de dados (sem cabeçalhos)
 * @param {Array} cabecalhos - Array de nomes de colunas sanitizados
 * @returns {Array} Array de objetos com os dados
 */
function criarRegistrosDeAba(dados, cabecalhos) {
  const registros = [];
  for (let i = 0; i < dados.length; i++) {
    const linha = dados[i];
    const obj = {};
    for (let j = 0; j < cabecalhos.length; j++) {
      obj[cabecalhos[j]] = linha[j];
    }
    registros.push(obj);
  }
  return registros;
}

/**
 * Envia registros para o Firebase.
 * @param {string} nomeAba - Nome da aba sanitizado
 * @param {Array} registros - Array de objetos com os dados
 * @param {string} nomeAbaOriginal - Nome original da aba (para referência)
 * @returns {boolean} true se enviou com sucesso, false caso contrário
 */
function enviarParaFirebase(nomeAba, registros, nomeAbaOriginal) {
  const url = FIREBASE_URL + "exportAll/" + nomeAba + ".json?auth=" + FIREBASE_SECRET;
  const payload = {
    dados: registros,
    nomeAbaOriginal: nomeAbaOriginal,
    ultimaAtualizacao: new Date().toISOString()
  };
  const opcoes = {
    method: "put",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const resposta = UrlFetchApp.fetch(url, opcoes);
    return resposta.getResponseCode() === 200;
  } catch (erro) {
    Logger.log("❌ Erro na requisição Firebase: " + erro);
    return false;
  }
}

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

    const hashAtual = gerarHashDados(dados);
    const hashAnterior = getHashAnterior(nomeAba);

    if (hashAtual === hashAnterior) {
      Logger.log("⏭️ Nenhuma alteração em: " + nomeAba);
      totalIgnoradas++;
      continue;
    }

    const registros = criarRegistrosDeAba(dados, cabecalhos);
    const sucesso = enviarParaFirebase(nomeAba, registros, aba.getName());

    if (sucesso) {
      salvarHash(nomeAba, hashAtual);
      Logger.log("✅ Enviado com sucesso: " + nomeAba);
      totalEnviadas++;
    } else {
      Logger.log("⚠️ Falha ao enviar " + nomeAba);
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

/**********************************************
 * ⚡ SINCRONIZAÇÃO AUTOMÁTICA — Detecta alterações
 **********************************************/

/**
 * Função chamada automaticamente quando há alteração na planilha.
 * Sincroniza imediatamente com o Firebase sem debounce.
 * NOTA: Esta função precisa ser configurada como gatilho instalável
 * para funcionar com UrlFetchApp (veja criarGatilhosAutomaticos).
 * Gatilhos instaláveis funcionam mesmo com a planilha fechada.
 * @param {Object} e - Objeto evento do Google Apps Script
 */
function onEditFirebase(e) {
  try {
    let sucesso = false;
    
    // Sincroniza a aba que foi editada imediatamente
    if (e && e.source && e.range) {
      const abaEditada = e.range.getSheet();
      sucesso = enviarAbaParaFirebaseComRetorno(abaEditada);
    } else {
      // Se não tiver informação da aba, sincroniza tudo
      sucesso = enviarTodasAsAbasParaFirebaseComRetorno();
    }
    
    // Registra timestamp apenas se a sync foi bem-sucedida
    if (sucesso) {
      const agora = new Date().getTime();
      salvarUltimaSync(agora);
    }
  } catch (erro) {
    Logger.log("❌ Erro no onEditFirebase: " + erro);
  }
}

/**
 * Função chamada quando há alterações estruturais na planilha
 * (adicionar/remover abas, linhas, colunas, etc.)
 * Sincroniza imediatamente com o Firebase.
 * Gatilhos instaláveis funcionam mesmo com a planilha fechada.
 * @param {Object} e - Objeto evento do Google Apps Script
 */
function onChangeFirebase(e) {
  try {
    const sucesso = enviarTodasAsAbasParaFirebaseComRetorno();
    
    // Registra timestamp apenas se a sync foi bem-sucedida
    if (sucesso) {
      const agora = new Date().getTime();
      salvarUltimaSync(agora);
    }
  } catch (erro) {
    Logger.log("❌ Erro no onChangeFirebase: " + erro);
  }
}

/**
 * Envia uma aba para o Firebase e retorna true se bem-sucedido.
 * @param {Sheet} aba - A aba a ser enviada
 * @returns {boolean} true se enviou com sucesso
 */
function enviarAbaParaFirebaseComRetorno(aba) {
  if (!FIREBASE_SECRET) {
    Logger.log("❌ ERRO: chave do Firebase não configurada.");
    return false;
  }
  
  const nomeAba = sanitizeKey(aba.getName());
  const dados = aba.getDataRange().getValues();
  
  if (dados.length < 2) {
    Logger.log("⏭️ Aba vazia ignorada: " + nomeAba);
    return true; // Considera sucesso pois não havia nada para enviar
  }
  
  const cabecalhos = dados.shift().map(h => sanitizeKey(h));
  
  const hashAtual = gerarHashDados(dados);
  const hashAnterior = getHashAnterior(nomeAba);
  
  if (hashAtual === hashAnterior) {
    Logger.log("⏭️ Nenhuma alteração real em: " + nomeAba);
    return true; // Considera sucesso pois não havia alteração
  }
  
  const registros = criarRegistrosDeAba(dados, cabecalhos);
  const sucesso = enviarParaFirebase(nomeAba, registros, aba.getName());
  
  if (sucesso) {
    salvarHash(nomeAba, hashAtual);
    Logger.log("✅ Sincronizado automaticamente: " + nomeAba);
  } else {
    Logger.log("⚠️ Falha ao sincronizar " + nomeAba);
  }
  
  return sucesso;
}

/**
 * Envia todas as abas para o Firebase e retorna true se todas foram bem-sucedidas.
 * @returns {boolean} true se todas as abas foram enviadas com sucesso
 */
function enviarTodasAsAbasParaFirebaseComRetorno() {
  if (!FIREBASE_SECRET) {
    Logger.log("❌ ERRO: chave do Firebase não configurada.");
    return false;
  }

  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const abas = planilha.getSheets();
  let todasSucesso = true;

  for (let aba of abas) {
    const nomeAba = sanitizeKey(aba.getName());
    const dados = aba.getDataRange().getValues();
    if (dados.length < 2) continue;

    const cabecalhos = dados.shift().map(h => sanitizeKey(h));

    const hashAtual = gerarHashDados(dados);
    const hashAnterior = getHashAnterior(nomeAba);

    if (hashAtual === hashAnterior) {
      continue;
    }

    const registros = criarRegistrosDeAba(dados, cabecalhos);
    const sucesso = enviarParaFirebase(nomeAba, registros, aba.getName());

    if (sucesso) {
      salvarHash(nomeAba, hashAtual);
      Logger.log("✅ Enviado com sucesso: " + nomeAba);
    } else {
      Logger.log("⚠️ Falha ao enviar " + nomeAba);
      todasSucesso = false;
    }
  }

  return todasSucesso;
}

/**
 * Envia apenas uma aba específica para o Firebase.
 * Mais eficiente que enviar todas as abas quando apenas uma foi alterada.
 * @param {Sheet} aba - A aba a ser enviada
 */
function enviarAbaParaFirebase(aba) {
  if (!FIREBASE_SECRET) {
    Logger.log("❌ ERRO: chave do Firebase não configurada.");
    return;
  }
  
  const nomeAba = sanitizeKey(aba.getName());
  const dados = aba.getDataRange().getValues();
  
  if (dados.length < 2) {
    Logger.log("⏭️ Aba vazia ignorada: " + nomeAba);
    return;
  }
  
  const cabecalhos = dados.shift().map(h => sanitizeKey(h));
  
  const hashAtual = gerarHashDados(dados);
  const hashAnterior = getHashAnterior(nomeAba);
  
  if (hashAtual === hashAnterior) {
    Logger.log("⏭️ Nenhuma alteração real em: " + nomeAba);
    return;
  }
  
  const registros = criarRegistrosDeAba(dados, cabecalhos);
  const sucesso = enviarParaFirebase(nomeAba, registros, aba.getName());
  
  if (sucesso) {
    salvarHash(nomeAba, hashAtual);
    Logger.log("✅ Sincronizado automaticamente: " + nomeAba);
    SpreadsheetApp.getActiveSpreadsheet().toast(
      "Aba '" + aba.getName() + "' sincronizada com Firebase! ✅", 
      "Auto Sync", 
      3
    );
  } else {
    Logger.log("⚠️ Falha ao sincronizar " + nomeAba);
  }
}

/**
 * Salva o timestamp da última sincronização
 * @param {number} timestamp - Timestamp em milissegundos
 */
function salvarUltimaSync(timestamp) {
  PropertiesService.getScriptProperties().setProperty("ULTIMA_SYNC", timestamp.toString());
}

/**
 * Obtém o timestamp da última sincronização
 * @returns {number} Timestamp em milissegundos (0 se nunca sincronizou)
 */
function getUltimaSync() {
  const valor = PropertiesService.getScriptProperties().getProperty("ULTIMA_SYNC");
  return valor ? parseInt(valor, 10) : 0;
}

/**********************************************
 * 🔧 CONFIGURAR GATILHOS AUTOMÁTICOS
 **********************************************/

/**
 * ⚡ EXECUTE ESTA FUNÇÃO UMA VEZ para ativar a sincronização automática!
 * Cria gatilhos instaláveis para onEdit e onChange.
 * Gatilhos instaláveis são necessários porque gatilhos simples
 * não podem usar UrlFetchApp (requerido para chamadas ao Firebase).
 * Também ativa o processamento automático de ausências.
 */
function criarGatilhosAutomaticos() {
  // Remove gatilhos antigos para evitar duplicação
  const gatilhos = ScriptApp.getProjectTriggers();
  for (const t of gatilhos) {
    const funcao = t.getHandlerFunction();
    if (funcao === "onEditFirebase" || funcao === "onChangeFirebase" || funcao === "processarAusenciasAutomatico") {
      ScriptApp.deleteTrigger(t);
    }
  }
  
  // Cria gatilho onEdit instalável
  ScriptApp.newTrigger("onEditFirebase")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  
  // Cria gatilho onChange instalável
  ScriptApp.newTrigger("onChangeFirebase")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
  
  // Cria gatilho para processamento automático de ausências (executa diariamente às 22h)
  ScriptApp.newTrigger("processarAusenciasAutomatico")
    .timeBased()
    .everyDays(1)
    .atHour(22)
    .create();
  
  Logger.log("✅ Gatilhos automáticos criados!");
  Logger.log("📝 onEditFirebase: sincroniza ao editar células");
  Logger.log("📝 onChangeFirebase: sincroniza ao adicionar/remover abas ou linhas");
  Logger.log("📋 processarAusenciasAutomatico: processa ausências diariamente às 22h");
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Sincronização automática ATIVADA! 🚀\nAlterações serão enviadas automaticamente para o Firebase.\n📋 Ausências serão processadas automaticamente às 22h.",
    "Firebase Auto Sync",
    10
  );
}

/**
 * Função para processamento automático de ausências.
 * Chamada pelo gatilho diário criado em criarGatilhosAutomaticos().
 * Processa apenas alunos com status "Ativa" na aba "Alunos".
 */
function processarAusenciasAutomatico() {
  try {
    Logger.log("🕐 Iniciando processamento automático de ausências...");
    processarAusencias();
    Logger.log("✅ Processamento automático de ausências concluído!");
  } catch (erro) {
    Logger.log("❌ Erro no processamento automático de ausências: " + erro);
  }
}

/**
 * Remove todos os gatilhos automáticos (caso queira desativar).
 * Também remove o gatilho de processamento automático de ausências.
 */
function removerGatilhosAutomaticos() {
  const gatilhos = ScriptApp.getProjectTriggers();
  let removidos = 0;
  
  for (const t of gatilhos) {
    const funcao = t.getHandlerFunction();
    if (funcao === "onEditFirebase" || funcao === "onChangeFirebase" || funcao === "processarAusenciasAutomatico") {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  }
  
  Logger.log("🗑️ " + removidos + " gatilho(s) removido(s).");
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Sincronização automática DESATIVADA. ⏸️\n📋 Processamento automático de ausências também foi desativado.",
    "Firebase Auto Sync",
    5
  );
}

/**
 * Verifica o status dos gatilhos automáticos.
 */
function verificarStatusGatilhos() {
  const gatilhos = ScriptApp.getProjectTriggers();
  let onEditAtivo = false;
  let onChangeAtivo = false;
  let diarioAtivo = false;
  let ausenciasAtivo = false;
  
  for (const t of gatilhos) {
    const funcao = t.getHandlerFunction();
    if (funcao === "onEditFirebase") onEditAtivo = true;
    if (funcao === "onChangeFirebase") onChangeAtivo = true;
    if (funcao === "enviarTodasAsAbasParaFirebase") diarioAtivo = true;
    if (funcao === "processarAusenciasAutomatico") ausenciasAtivo = true;
  }
  
  Logger.log("📊 STATUS DOS GATILHOS:");
  Logger.log("  • onEdit (auto sync): " + (onEditAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  Logger.log("  • onChange (auto sync): " + (onChangeAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  Logger.log("  • Diário (21h): " + (diarioAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  Logger.log("  • Ausências (22h): " + (ausenciasAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  
  const ultimaSync = getUltimaSync();
  let ultimaSyncStr = "Nunca sincronizado";
  if (ultimaSync > 0) {
    const dataUltimaSync = new Date(ultimaSync);
    ultimaSyncStr = dataUltimaSync.toLocaleString("pt-BR");
    Logger.log("  • Última sync: " + ultimaSyncStr);
  }
  
  // Mostra alerta visual para o usuário
  const mensagem = 
    "📊 STATUS DOS GATILHOS\n\n" +
    "• Sincronização automática (onEdit): " + (onEditAtivo ? "✅ ATIVO" : "❌ INATIVO") + "\n" +
    "• Sincronização automática (onChange): " + (onChangeAtivo ? "✅ ATIVO" : "❌ INATIVO") + "\n" +
    "• Envio diário às 21h: " + (diarioAtivo ? "✅ ATIVO" : "❌ INATIVO") + "\n" +
    "• Processamento de ausências às 22h: " + (ausenciasAtivo ? "✅ ATIVO" : "❌ INATIVO") + "\n\n" +
    "📅 Última sincronização: " + ultimaSyncStr;
  
  SpreadsheetApp.getUi().alert("⚙️ Status dos Gatilhos", mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
  
  return {
    onEdit: onEditAtivo,
    onChange: onChangeAtivo,
    diario: diarioAtivo,
    ausencias: ausenciasAtivo
  };
}
