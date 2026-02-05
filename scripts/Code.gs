/**********************************************
 * 🔧 CONFIGURAÇÕES GERAIS
 **********************************************/
// Cloud Function endpoint e token de sincronização
const FUNCTION_URL = PropertiesService.getScriptProperties().getProperty("FUNCTION_URL");
const SYNC_TOKEN = PropertiesService.getScriptProperties().getProperty("SYNC_TOKEN");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Nomes das abas (constantes para evitar erros de digitação)
const ABA_AUSENCIAS = 'Ausencias';
const ABA_REPOSICOES = 'Reposicoes';
const ABA_PONTO_PRATICA = 'PontoPratica';
const ABA_PONTO_TEORIA = 'PontoTeoria';

/**********************************************
 * 📝 SOBRE O SISTEMA DE SINCRONIZAÇÃO
 **********************************************/
/**
 * SINCRONIZAÇÃO BIDIRECIONAL AUTOMÁTICA
 * 
 * Este sistema agora implementa sincronização ao vivo entre a planilha e o Firebase:
 * 
 * ✅ DETECÇÃO AUTOMÁTICA:
 *    - Inserções: novas linhas são detectadas e enviadas automaticamente
 *    - Atualizações: células editadas são sincronizadas instantaneamente
 *    - Deleções: linhas removidas da planilha são deletadas no Firebase
 *    - Mudanças estruturais: alterações nas colunas são detectadas automaticamente
 * 
 * ✅ SISTEMA DE IDs:
 *    - Cada linha recebe um ID único baseado em seu conteúdo
 *    - IDs permitem rastrear registros individuais
 *    - Deleções são detectadas comparando IDs Firebase vs Planilha
 * 
 * ✅ HASH INTELIGENTE:
 *    - Hash agora inclui estrutura das colunas
 *    - Mudanças nas colunas não requerem mais reset manual
 *    - Hash detecta qualquer alteração: dados ou estrutura
 * 
 * ✅ GATILHOS AUTOMÁTICOS:
 *    - onEdit: sincroniza quando você edita células
 *    - onChange: sincroniza quando você adiciona/remove linhas ou colunas
 *    - Funciona mesmo com a planilha fechada
 * 
 * 📋 FUNÇÕES ÚTEIS:
 *    - limparHashAba(nomeAba): força re-sync de uma aba específica
 *    - limparTodosHashes(): força re-sync completo de tudo
 *    - criarGatilhosAutomaticos(): ativa sincronização automática
 *    - removerGatilhosAutomaticos(): desativa sincronização automática
 */

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
 * Gera hash MD5 dos dados para detectar alterações.
 * Agora considera tanto o conteúdo quanto a estrutura (colunas).
 * @param {Array} dados - Array de linhas de dados
 * @param {Array} cabecalhos - Array de cabeçalhos
 * @returns {string} Hash MD5 em hexadecimal
 */
function gerarHashDados(dados, cabecalhos) {
  // Inclui cabeçalhos no hash para detectar mudanças estruturais
  let conteudoConcatenado = "HEADERS:" + JSON.stringify(cabecalhos) + "|DATA:";
  for (let i = 0; i < dados.length; i++) {
    conteudoConcatenado += JSON.stringify(dados[i]);
  }
  return gerarHash(conteudoConcatenado);
}

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
 * Envia registros para Cloud Function (cache espelho com sobrescrita total).
 * A Cloud Function valida o token e escreve no Firebase RTDB.
 * @param {string} nomeAba - Nome da aba sanitizado
 * @param {Array} registros - Array de objetos com os dados
 * @param {string} nomeAbaOriginal - Nome original da aba (para referência)
 * @returns {boolean} true se enviou com sucesso, false caso contrário
 */
function enviarParaEndpoint(nomeAba, registros, nomeAbaOriginal) {
  if (!FUNCTION_URL) {
    Logger.log("❌ ERRO: FUNCTION_URL não configurada. Configure nas propriedades do script.");
    return false;
  }
  
  if (!SYNC_TOKEN) {
    Logger.log("❌ ERRO: SYNC_TOKEN não configurado. Configure nas propriedades do script.");
    return false;
  }
  
  // Payload com estrutura de cache espelho
  const payload = {
    aba: nomeAba,
    dados: registros,
    nomeAbaOriginal: nomeAbaOriginal,
    ultimaAtualizacao: new Date().toISOString(),
    metadados: {
      totalRegistros: registros.length,
      tipoSincronizacao: 'sobrescrita_total'
    }
  };
  
  const opcoes = {
    method: "post",
    contentType: "application/json",
    headers: {
      "X-SYNC-TOKEN": SYNC_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    Logger.log(`📤 Enviando ${registros.length} registros da aba "${nomeAbaOriginal}" para Cloud Function...`);
    const resposta = UrlFetchApp.fetch(FUNCTION_URL, opcoes);
    const codigo = resposta.getResponseCode();
    
    if (codigo === 200) {
      Logger.log(`✅ Aba "${nomeAbaOriginal}" enviada com sucesso (${registros.length} registros)`);
      return true;
    } else {
      Logger.log(`❌ Erro HTTP ${codigo} ao enviar "${nomeAbaOriginal}"`);
      Logger.log(`    Resposta: ${resposta.getContentText()}`);
      return false;
    }
  } catch (erro) {
    Logger.log(`❌ Erro na requisição para Cloud Function: ${erro}`);
    return false;
  }
}

/**********************************************
 * 📤 FUNÇÃO PRINCIPAL — Envia todas as abas alteradas para Cloud Function
 **********************************************/
function enviarTodasAsAbasParaFirebase() {
  if (!FUNCTION_URL || !SYNC_TOKEN) {
    Logger.log("❌ ERRO: FUNCTION_URL ou SYNC_TOKEN não configurados.");
    Logger.log("   Configure nas propriedades do script (Configurações → Propriedades de script):");
    Logger.log("   - FUNCTION_URL: URL da Cloud Function");
    Logger.log("   - SYNC_TOKEN: Token secreto para autenticação");
    SpreadsheetApp.getActiveSpreadsheet().toast("Erro: Cloud Function não configurada ❌", "Sync", 6);
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

    const hashAtual = gerarHashDados(dados, cabecalhos);
    const hashAnterior = getHashAnterior(nomeAba);

    if (hashAtual === hashAnterior) {
      Logger.log("⏭️ Nenhuma alteração em: " + nomeAba);
      totalIgnoradas++;
      continue;
    }

    const registros = criarRegistrosDeAba(dados, cabecalhos);
    const sucesso = enviarParaEndpoint(nomeAba, registros, aba.getName());

    if (sucesso) {
      salvarHash(nomeAba, hashAtual);
      Logger.log("✅ Enviado com sucesso: " + nomeAba);
      totalEnviadas++;
    } else {
      Logger.log("⚠️ Falha ao enviar " + nomeAba);
    }
  }

  Logger.log("🚀 Envio concluído — Enviadas: " + totalEnviadas + " | Ignoradas: " + totalIgnoradas);
  SpreadsheetApp.getActiveSpreadsheet().toast(`Sync via Cloud Function! ✅ Enviadas: ${totalEnviadas} | Ignoradas: ${totalIgnoradas}`, "Firebase Sync", 8);
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

/**
 * Limpa o hash de uma aba específica.
 * Útil se você quiser forçar uma sincronização completa.
 * @param {string} nomeAba - Nome da aba (será sanitizado automaticamente)
 */
function limparHashAba(nomeAba) {
  const nomeAbaSanitizado = sanitizeKey(nomeAba);
  PropertiesService.getScriptProperties().deleteProperty("HASH_" + nomeAbaSanitizado);
  Logger.log("🧹 Hash limpo para: " + nomeAba);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Hash limpo para aba '" + nomeAba + "'. Próxima sincronização será completa.",
    "Hash Limpo",
    5
  );
}

/**
 * Limpa todos os hashes salvos.
 * Útil para resetar completamente o sistema de sincronização.
 */
function limparTodosHashes() {
  const props = PropertiesService.getScriptProperties();
  const todasProps = props.getProperties();
  let contador = 0;
  
  for (let chave in todasProps) {
    if (chave.startsWith("HASH_")) {
      props.deleteProperty(chave);
      contador++;
    }
  }
  
  Logger.log("🧹 " + contador + " hashes limpos");
  SpreadsheetApp.getActiveSpreadsheet().toast(
    contador + " hashes limpos. Próxima sincronização será completa para todas as abas.",
    "Reset Completo",
    5
  );
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
 * Envia uma aba para Cloud Function e retorna true se bem-sucedido.
 * @param {Sheet} aba - A aba a ser enviada
 * @returns {boolean} true se enviou com sucesso
 */
function enviarAbaParaFirebaseComRetorno(aba) {
  const nomeAba = sanitizeKey(aba.getName());
  const dados = aba.getDataRange().getValues();
  
  if (dados.length < 2) {
    Logger.log("⏭️ Aba vazia ignorada: " + nomeAba);
    return true; // Considera sucesso pois não havia nada para enviar
  }
  
  const cabecalhos = dados.shift().map(h => sanitizeKey(h));
  
  const hashAtual = gerarHashDados(dados, cabecalhos);
  const hashAnterior = getHashAnterior(nomeAba);
  
  if (hashAtual === hashAnterior) {
    Logger.log("⏭️ Nenhuma alteração real em: " + nomeAba);
    return true; // Considera sucesso pois não havia alteração
  }
  
  const registros = criarRegistrosDeAba(dados, cabecalhos);
  const sucesso = enviarParaEndpoint(nomeAba, registros, aba.getName());
  
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
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const abas = planilha.getSheets();
  let todasSucesso = true;

  for (let aba of abas) {
    const nomeAba = sanitizeKey(aba.getName());
    const dados = aba.getDataRange().getValues();
    if (dados.length < 2) continue;

    const cabecalhos = dados.shift().map(h => sanitizeKey(h));

    const hashAtual = gerarHashDados(dados, cabecalhos);
    const hashAnterior = getHashAnterior(nomeAba);

    if (hashAtual === hashAnterior) {
      continue;
    }

    const registros = criarRegistrosDeAba(dados, cabecalhos);
    const sucesso = enviarParaEndpoint(nomeAba, registros, aba.getName());

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
  const nomeAba = sanitizeKey(aba.getName());
  const dados = aba.getDataRange().getValues();
  
  if (dados.length < 2) {
    Logger.log("⏭️ Aba vazia ignorada: " + nomeAba);
    return;
  }
  
  const cabecalhos = dados.shift().map(h => sanitizeKey(h));
  
  const hashAtual = gerarHashDados(dados, cabecalhos);
  const hashAnterior = getHashAnterior(nomeAba);
  
  if (hashAtual === hashAnterior) {
    Logger.log("⏭️ Nenhuma alteração real em: " + nomeAba);
    return;
  }
  
  const registros = criarRegistrosDeAba(dados, cabecalhos);
  const sucesso = enviarParaEndpoint(nomeAba, registros, aba.getName());
  
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
 */
function criarGatilhosAutomaticos() {
  // Remove gatilhos antigos para evitar duplicação
  const gatilhos = ScriptApp.getProjectTriggers();
  for (const t of gatilhos) {
    const funcao = t.getHandlerFunction();
    if (funcao === "onEditFirebase" || funcao === "onChangeFirebase") {
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
  
  Logger.log("✅ Gatilhos automáticos criados!");
  Logger.log("📝 onEditFirebase: sincroniza ao editar células");
  Logger.log("📝 onChangeFirebase: sincroniza ao adicionar/remover abas ou linhas");
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Sincronização automática ATIVADA! 🚀\nAlterações serão enviadas automaticamente para o Firebase.",
    "Firebase Auto Sync",
    10
  );
}

/**
 * Remove todos os gatilhos automáticos (caso queira desativar).
 */
function removerGatilhosAutomaticos() {
  const gatilhos = ScriptApp.getProjectTriggers();
  let removidos = 0;
  
  for (const t of gatilhos) {
    const funcao = t.getHandlerFunction();
    if (funcao === "onEditFirebase" || funcao === "onChangeFirebase") {
      ScriptApp.deleteTrigger(t);
      removidos++;
    }
  }
  
  Logger.log("🗑️ " + removidos + " gatilho(s) removido(s).");
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Sincronização automática DESATIVADA. ⏸️",
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
  
  for (const t of gatilhos) {
    const funcao = t.getHandlerFunction();
    if (funcao === "onEditFirebase") onEditAtivo = true;
    if (funcao === "onChangeFirebase") onChangeAtivo = true;
    if (funcao === "enviarTodasAsAbasParaFirebase") diarioAtivo = true;
  }
  
  Logger.log("📊 STATUS DOS GATILHOS:");
  Logger.log("  • onEdit (auto sync): " + (onEditAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  Logger.log("  • onChange (auto sync): " + (onChangeAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  Logger.log("  • Diário (21h): " + (diarioAtivo ? "✅ ATIVO" : "❌ INATIVO"));
  
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
    "• Envio diário às 21h: " + (diarioAtivo ? "✅ ATIVO" : "❌ INATIVO") + "\n\n" +
    "📅 Última sincronização: " + ultimaSyncStr;
  
  SpreadsheetApp.getUi().alert("⚙️ Status dos Gatilhos", mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
  
  return {
    onEdit: onEditAtivo,
    onChange: onChangeAtivo,
    diario: diarioAtivo
  };
}


/**********************************************
 * 📌 PONTO E ESCALA (unificado)
 **********************************************/
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
    // Identifica a aba editada
    var sheetName = '';
    if (e && e.range) {
      sheetName = e.range.getSheet().getName();
    }
    
    // Primeiro sincroniza para as escalas
    handlePontoChange(e);
    
    // Depois envia para o Firebase (se a função existir no Code.gs)
    if (typeof enviarTodasAsAbasParaFirebase === 'function') {
      enviarTodasAsAbasParaFirebase();
    }
    
    // Salva detalhes da sincronização
    var agora = new Date().getTime();
    salvarUltimaSync(agora);
    var detalhe = '• Alteração em: ' + sheetName + '\n• Pontos sincronizados para Escalas\n• Dados enviados para Firebase';
    salvarDetalheSincronizacao(detalhe);
    
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
      var syncedSheets = [];
      
      for (var i = 0; i < sheets.length; i++) {
        var sheet = ss.getSheetByName(sheets[i]);
        if (sheet) {
          syncAllRowsInSheet_(ss, sheet, sheets[i]);
          syncedSheets.push(sheets[i]);
        }
      }
      
      // Envia para Firebase
      if (typeof enviarTodasAsAbasParaFirebase === 'function') {
        enviarTodasAsAbasParaFirebase();
      }
      
      // Salva detalhes da sincronização
      var agora = new Date().getTime();
      salvarUltimaSync(agora);
      var detalhe = '• Tipo de alteração: ' + e.changeType + '\n• Abas sincronizadas: ' + syncedSheets.join(', ') + '\n• Dados enviados para Firebase';
      salvarDetalheSincronizacao(detalhe);
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
  
  // Requer pelo menos um identificador e data/hora entrada
  if ((emailCol < 0 && serialCol < 0 && nomeCol < 0) || dataCol < 0 || horaEntCol < 0) return;
  
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
  // Verifica se há pelo menos 2 identificadores no registro de origem
  var numSourceIds = (serial ? 1 : 0) + (email ? 1 : 0) + (nome ? 1 : 0);
  if (numSourceIds < 2) {
    var idInfo = [];
    if (serial) idInfo.push('Serial: ' + serial);
    if (email) idInfo.push('Email: ' + email);
    if (nome) idInfo.push('Nome: ' + nome);
    console.warn('Registro com identificadores insuficientes (' + idInfo.join(', ') + '). Precisa de pelo menos 2 identificadores.');
    return;
  }
  
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
    .addItem('📊 Ver Última Sincronização', 'mostrarUltimaSincronizacao')
    .addSeparator()
    .addItem('✅ Ativar Sincronização Automática', 'ativarSincronizacaoAutomatica')
    .addItem('⏸️ Desativar Sincronização Automática', 'desativarSincronizacaoAutomatica')
    .addSeparator()
    .addItem('🔥 Enviar Todos os Dados para Firebase', 'enviarDadosParaFirebase')
    .addToUi();
}

/**********************************************
 * 📊 FUNÇÕES DE INFORMAÇÃO E STATUS
 **********************************************/

/**
 * Mostra a última sincronização realizada e detalhes do que foi sincronizado
 */
function mostrarUltimaSincronizacao() {
  var ultimaSync = getUltimaSync();
  var ultimoDetalhe = getUltimoDetalheSincronizacao();
  var mensagem = '';
  
  if (ultimaSync > 0) {
    var dataUltimaSync = new Date(ultimaSync);
    mensagem = '📅 Última sincronização:\n' + 
               dataUltimaSync.toLocaleString('pt-BR') + 
               '\n(há ' + calcularTempoDecorrido(ultimaSync) + ')\n\n';
    
    if (ultimoDetalhe) {
      mensagem += '📋 O que foi sincronizado:\n' + ultimoDetalhe;
    } else {
      mensagem += '📋 Sincronização automática ativa.';
    }
  } else {
    mensagem = '⚠️ Nenhuma sincronização foi realizada ainda.\n\n' +
               'Ative a sincronização automática para começar.';
  }
  
  // Verifica status dos gatilhos
  var statusGatilhos = verificarStatusGatilhosInterno();
  mensagem += '\n\n═══════════════════════════════════════\n';
  mensagem += '⚙️ Status da Sincronização Automática:\n';
  mensagem += statusGatilhos.ativo ? '✅ ATIVADA' : '❌ DESATIVADA';
  
  SpreadsheetApp.getUi().alert('📊 Status da Sincronização', mensagem, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Verifica o status dos gatilhos internamente (sem mostrar UI)
 * @returns {Object} Objeto com status dos gatilhos
 */
function verificarStatusGatilhosInterno() {
  var gatilhos = ScriptApp.getProjectTriggers();
  var onEditAtivo = false;
  var onChangeAtivo = false;
  
  for (var i = 0; i < gatilhos.length; i++) {
    var funcao = gatilhos[i].getHandlerFunction();
    if (funcao === 'onEditPontoInstalavel' || funcao === 'onEditFirebase') onEditAtivo = true;
    if (funcao === 'onChangePontoInstalavel' || funcao === 'onChangeFirebase') onChangeAtivo = true;
  }
  
  return {
    ativo: onEditAtivo && onChangeAtivo,
    onEdit: onEditAtivo,
    onChange: onChangeAtivo
  };
}

/**
 * Obtém os detalhes da última sincronização
 * @returns {string} Detalhes da última sincronização
 */
function getUltimoDetalheSincronizacao() {
  return PropertiesService.getScriptProperties().getProperty('ULTIMO_DETALHE_SYNC') || '';
}

/**
 * Salva os detalhes da última sincronização
 * @param {string} detalhe - Detalhes do que foi sincronizado
 */
function salvarDetalheSincronizacao(detalhe) {
  PropertiesService.getScriptProperties().setProperty('ULTIMO_DETALHE_SYNC', detalhe);
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
 * Verifica se a Cloud Function está configurada corretamente
 */
function verificarConfiguracaoFirebase() {
  var ui = SpreadsheetApp.getUi();
  
  if (!FUNCTION_URL) {
    ui.alert('❌ Cloud Function NÃO configurada', 
             'A URL da Cloud Function (FUNCTION_URL) não está configurada.\n\n' +
             'Para configurar:\n' +
             '1. Vá em "Extensões" → "Apps Script"\n' +
             '2. Clique em "Configurações do projeto" (ícone de engrenagem)\n' +
             '3. Role até "Propriedades de script"\n' +
             '4. Adicione:\n' +
             '   - Chave: FUNCTION_URL\n' +
             '   - Valor: URL da sua Cloud Function\n' +
             '   - Chave: SYNC_TOKEN\n' +
             '   - Valor: Token secreto (ex: gere com: openssl rand -hex 32)',
             ui.ButtonSet.OK);
    return;
  }
  
  if (!SYNC_TOKEN) {
    ui.alert('❌ Token de Sync NÃO configurado', 
             'O SYNC_TOKEN não está configurado.\n\n' +
             'Configure nas propriedades do script.',
             ui.ButtonSet.OK);
    return;
  }
  
  // Test connection to Cloud Function
  try {
    const testPayload = {
      aba: "_test",
      dados: [],
      nomeAbaOriginal: "Test",
      ultimaAtualizacao: new Date().toISOString(),
      metadados: { totalRegistros: 0, tipoSincronizacao: 'test' }
    };
    
    const opcoes = {
      method: "post",
      contentType: "application/json",
      headers: { "X-SYNC-TOKEN": SYNC_TOKEN },
      payload: JSON.stringify(testPayload),
      muteHttpExceptions: true
    };
    
    const resposta = UrlFetchApp.fetch(FUNCTION_URL, opcoes);
    const codigo = resposta.getResponseCode();
    
    if (codigo === 200) {
      ui.alert('✅ Configuração OK', 
               'A conexão com a Cloud Function está funcionando!\n\n' +
               'URL: ' + FUNCTION_URL + '\n' +
               'Token: Configurado ✓\n\n' +
               'Você pode enviar dados para o Firebase.',
               ui.ButtonSet.OK);
    } else {
      ui.alert('⚠️ Cloud Function Respondeu, mas com Erro', 
               'Código de resposta: ' + codigo + '\n' +
               'Resposta: ' + resposta.getContentText().substring(0, 200) + '\n\n' +
               'Verifique:\n' +
               '1. Token está correto\n' +
               '2. Cloud Function está deployada\n' +
               '3. Permissões do Firebase',
               ui.ButtonSet.OK);
    }
  } catch (erro) {
    ui.alert('❌ Erro de Conexão', 
             'Não foi possível conectar à Cloud Function.\n\n' +
             'Erro: ' + erro.message + '\n\n' +
             'Verifique:\n' +
             '1. URL está correta\n' +
             '2. Cloud Function está deployada\n' +
             '3. Conexão com internet',
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

/**********************************************
 * 📋 FUNÇÕES DO MENU SIMPLIFICADO
 **********************************************/

/**
 * Ativa a sincronização automática completa:
 * 1. Primeiro sincroniza todos os pontos para as Escalas
 * 2. Depois envia todos os dados para o Firebase
 * 3. Configura gatilhos para sincronização automática em cada alteração
 */
function ativarSincronizacaoAutomatica() {
  var ui = SpreadsheetApp.getUi();
  
  SpreadsheetApp.getActiveSpreadsheet().toast('🔄 Ativando sincronização automática...', 'Aguarde', 3);
  
  try {
    // 1. Sincroniza todos os pontos para as Escalas
    console.log('Sincronizando pontos para Escalas...');
    syncAllPontos();
    
    // 2. Envia todos os dados para o Firebase
    console.log('Enviando dados para Firebase...');
    if (typeof enviarTodasAsAbasParaFirebase === 'function') {
      enviarTodasAsAbasParaFirebase();
    }
    
    // 3. Salva detalhes da sincronização
    var timestamp = new Date().getTime();
    salvarUltimaSync(timestamp);
    salvarDetalheSincronizacao('• PontoTeoria → EscalaTeoria\n• PontoPratica → EscalaPratica\n• Todas as abas → Firebase');
    
    // 4. Ativa os gatilhos automáticos
    ativarTodosGatilhosAutomaticos();
    
    ui.alert('✅ Sincronização Automática Ativada', 
      'A sincronização automática foi ativada com sucesso!\n\n' +
      '📋 O que foi feito agora:\n' +
      '• Pontos sincronizados para Escalas\n' +
      '• Dados enviados para Firebase\n\n' +
      '⚡ A partir de agora:\n' +
      'Qualquer alteração na planilha será sincronizada automaticamente.',
      ui.ButtonSet.OK);
      
  } catch (err) {
    console.error('Erro ao ativar sincronização:', err);
    ui.alert('❌ Erro', 'Ocorreu um erro ao ativar a sincronização:\n' + err.message, ui.ButtonSet.OK);
  }
}

/**
 * Desativa a sincronização automática para manutenção
 */
function desativarSincronizacaoAutomatica() {
  var ui = SpreadsheetApp.getUi();
  
  var resposta = ui.alert(
    '⏸️ Desativar Sincronização',
    'Você está prestes a desativar a sincronização automática.\n\n' +
    'Isso é útil para fazer manutenção na planilha sem que as alterações sejam sincronizadas.\n\n' +
    'Deseja continuar?',
    ui.ButtonSet.YES_NO
  );
  
  if (resposta === ui.Button.YES) {
    desativarTodosGatilhosAutomaticos();
    
    ui.alert('⏸️ Sincronização Desativada', 
      'A sincronização automática foi desativada.\n\n' +
      'Você pode fazer manutenção na planilha.\n\n' +
      '⚠️ Lembre-se de reativar quando terminar!',
      ui.ButtonSet.OK);
  }
}

/**
 * Envia todos os dados para o Firebase manualmente
 */
function enviarDadosParaFirebase() {
  var ui = SpreadsheetApp.getUi();
  
  var resposta = ui.alert(
    '🔥 Enviar para Firebase',
    'Deseja enviar todos os dados da planilha para o Firebase agora?\n\n' +
    '⚠️ Isso irá sobrescrever os dados atuais no Firebase.',
    ui.ButtonSet.YES_NO
  );
  
  if (resposta === ui.Button.YES) {
    SpreadsheetApp.getActiveSpreadsheet().toast('🔄 Enviando dados para Firebase...', 'Aguarde', 5);
    
    try {
      if (typeof enviarTodasAsAbasParaFirebase === 'function') {
        enviarTodasAsAbasParaFirebase();
        
        // Salva o timestamp e detalhes
        var agora = new Date().getTime();
        salvarUltimaSync(agora);
        salvarDetalheSincronizacao('• Envio manual para Firebase\n• Todas as abas enviadas');
        
        ui.alert('✅ Sucesso', 'Todos os dados foram enviados para o Firebase!', ui.ButtonSet.OK);
      } else {
        ui.alert('❌ Erro', 'Função de envio para Firebase não encontrada.\nVerifique se o arquivo Code.gs está configurado corretamente.', ui.ButtonSet.OK);
      }
    } catch (err) {
      console.error('Erro ao enviar para Firebase:', err);
      ui.alert('❌ Erro', 'Ocorreu um erro ao enviar para o Firebase:\n' + err.message, ui.ButtonSet.OK);
    }
  }
}


/**********************************************
 * 📌 API DE PONTO (unificado)
 **********************************************/
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    
    // Verificar se é uma requisição de ausência ou reposição (aceita "tipo" em qualquer capitalização)
    var tipoRaw = data.tipo || data.Tipo || data.TIPO || '';
    var tipo = String(tipoRaw).toLowerCase();
    if (tipo === 'ausencia' || tipo === 'reposicao') {
      // Redirecionar para o handler de ausências/reposições
      return doPostAusenciasReposicoes(e);
    }
    
    var id = data.SerialNumber || "";
    var nome = data.NomeCompleto || "Desconhecido";
    var email = data.EmailHC || "";
    var escala = data.Escala || "";
    var simularTerca = data.SimularTerça || false;
    // Novo: flag enviado pelo SistemaPonto.py indicando se é dia de teoria
    // (terça, quinta ou dia especial configurado)
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
    if (simularTerca) diaSemana = 2; // simulação para testes

    // Determina se é dia de teoria:
    // 1. Se o Python enviou IsDiaTeoria=true (inclui dias especiais)
    // 2. OU se é terça (2) ou quinta (4) pelo dia da semana
    var ehDiaTeoria = isDiaTeoria || diaSemana === 2 || diaSemana === 4;

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
    if (typeof enviarAbaParaFirebase === "function") {
      enviarAbaParaFirebase(abaTeoria);
    }
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
    if (linhaPraticaCompleta && !ehDiaTeoria) {
      return resposta("Sem ação: aluno já completou a prática hoje.");
    }

    // === 3. Caso não exista prática aberta → cria nova entrada prática ou teórica ===
    if (!linhaPraticaAberta && !linhaPraticaCompleta) {
      if (ehDiaTeoria) {
        abaTeoria.appendRow([id, email, nome, dataStr, horaStr, "", escala, "Teoria"]);
        var novaLinhaTeoria = abaTeoria.getLastRow();
        syncToFrequenciaTeoricaFromPonto_(ss, abaTeoria, novaLinhaTeoria, escala);
        if (typeof enviarAbaParaFirebase === "function") {
          enviarAbaParaFirebase(abaTeoria);
        }
        return resposta("Entrada teórica registrada: " + horaStr);
      }
      abaPratica.appendRow([id, email, nome, dataStr, horaStr, "", escala, "Prática"]);
      return resposta("Entrada prática registrada: " + horaStr);
    }

    // === 4. Caso exista prática aberta → registra saída ===
    if (linhaPraticaAberta) {
      abaPratica.getRange(linhaPraticaAberta, 6).setValue(horaStr);

      // Se é dia de teoria (terça, quinta ou dia especial), cria entrada teórica automaticamente
      // Nota: A teoria só é registrada após o aluno ter entrada E saída na prática
      if (ehDiaTeoria) {
        // Verifica se já há teoria hoje
        var existeTeoriaHoje = dadosTeoria.some(function (r) {
          return r[0] == id && formatarData(r[3]) == dataStr;
        });
        if (!existeTeoriaHoje) {
          abaTeoria.appendRow([id, email, nome, dataStr, horaStr, "", escala, "Teoria"]);
          // Sincroniza automaticamente para FrequenciaTeorica
          var novaLinha = abaTeoria.getLastRow();
          syncToFrequenciaTeoricaFromPonto_(ss, abaTeoria, novaLinha, escala);
          if (typeof enviarAbaParaFirebase === "function") {
            enviarAbaParaFirebase(abaTeoria);
          }
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

  // Usa SerialNumber + Data + HoraEntrada + HoraSaida como identificador único para evitar duplicatas
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
    var dataFormatada = formatarDataParaComparacao_(dataValue);
    var horaEntFormatada = formatarHoraParaComparacao_(horaEntValue);
    var horaSaiFormatada = formatarHoraParaComparacao_(horaSaiValue);

    for (var i = 0; i < existingData.length; i++) {
      var existingSerial = String(existingData[i][serialColDestino] || '').trim();
      var existingDataRow = formatarDataParaComparacao_(existingData[i][dataColDestino]);
      var existingHoraEnt = formatarHoraParaComparacao_(existingData[i][horaEntColDestino]);
      var existingHoraSai = formatarHoraParaComparacao_(existingData[i][horaSaiColDestino]);

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
  console.log('Linha sincronizada automaticamente para ' + freqSheetName + ': SerialNumber ' + serialValue);
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

/**
 * Formata uma hora para comparação (HH:mm:ss)
 * @param {Date|string} value - O valor da hora
 * @returns {string} A hora formatada como string
 */
function formatarHoraParaComparacao_(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, "America/Sao_Paulo", "HH:mm:ss");
  }
  return String(value).trim();
}


/**********************************************
 * 📌 AUSÊNCIAS (unificado)
 * 
 * Sistema moderno de registro de ausências:
 * - Ausências são registradas via website (index.html)
 * - Dados enviados via POST para doPost()
 * - Armazenados nas abas "Ausencias" e "Reposicoes"
 * - Sistema antigo de processamento via menu foi removido
 **********************************************/

/**********************************************
 * 🎯 SISTEMA DE AUSÊNCIAS E REPOSIÇÕES
 * Integrado do AusenciasReposicoes.gs
 **********************************************/

/**
 * Cria as abas "Ausencias" e "Reposicoes" se não existirem.
 * Configura os cabeçalhos corretos para cada aba.
 */
function criarAbasAusenciasReposicoes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Criar aba Ausencias
  var abaAusencias = ss.getSheetByName(ABA_AUSENCIAS);
  if (!abaAusencias) {
    abaAusencias = ss.insertSheet(ABA_AUSENCIAS);
    // Posicionar após a aba Frequência/Ponto se existir
    var abaPonto = ss.getSheetByName('Ponto') || ss.getSheetByName('PontoPratica');
    if (abaPonto) {
      ss.setActiveSheet(abaAusencias);
      ss.moveActiveSheet(abaPonto.getIndex() + 1);
    }
    
    // Configurar cabeçalhos
    var cabecalhosAusencias = ['NomeCompleto', 'EmailHC', 'Curso', 'Escala', 'DataAusencia', 'Unidade', 'Horario', 'Motivo'];
    abaAusencias.getRange(1, 1, 1, cabecalhosAusencias.length).setValues([cabecalhosAusencias]);
    abaAusencias.getRange(1, 1, 1, cabecalhosAusencias.length).setFontWeight('bold');
    abaAusencias.setFrozenRows(1);
    
    Logger.log('✅ Aba "Ausencias" criada com sucesso!');
  } else {
    Logger.log('ℹ️ Aba "Ausencias" já existe.');
  }
  
  // Criar aba Reposicoes
  var abaReposicoes = ss.getSheetByName(ABA_REPOSICOES);
  if (!abaReposicoes) {
    abaReposicoes = ss.insertSheet(ABA_REPOSICOES);
    // Posicionar após a aba Ausencias
    ss.setActiveSheet(abaReposicoes);
    ss.moveActiveSheet(abaAusencias.getIndex() + 1);
    
    // Configurar cabeçalhos
    var cabecalhosReposicoes = ['NomeCompleto', 'EmailHC', 'Curso', 'Escala', 'Horario', 'Unidade', 'Motivo', 'DataReposicao', 'DataAusencia'];
    abaReposicoes.getRange(1, 1, 1, cabecalhosReposicoes.length).setValues([cabecalhosReposicoes]);
    abaReposicoes.getRange(1, 1, 1, cabecalhosReposicoes.length).setFontWeight('bold');
    abaReposicoes.setFrozenRows(1);
    
    Logger.log('✅ Aba "Reposicoes" criada com sucesso!');
  } else {
    Logger.log('ℹ️ Aba "Reposicoes" já existe.');
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Abas "Ausencias" e "Reposicoes" configuradas com sucesso! ✅',
    'Sistema de Ausências',
    5
  );
}

/**
 * Valida os dados de uma ausência antes de inserir.
 * @param {Object} data - Dados da ausência
 * @returns {Object} { valid: boolean, message: string }
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
  
  // Validar formato de email
  if (!EMAIL_REGEX.test(data.EmailHC)) {
    return { valid: false, message: 'Email inválido' };
  }
  
  return { valid: true, message: 'OK' };
}

/**
 * Valida os dados de uma reposição antes de inserir.
 * @param {Object} data - Dados da reposição
 * @returns {Object} { valid: boolean, message: string }
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
  
  // DataAusencia é opcional, mas se existir deve ter formato plausível
  if (data.DataAusencia && typeof data.DataAusencia !== 'string') {
    return { valid: false, message: 'Data da ausência deve ser texto (YYYY-MM-DD)' };
  }
  
  // Validar formato de email
  if (!EMAIL_REGEX.test(data.EmailHC)) {
    return { valid: false, message: 'Email inválido' };
  }
  
  return { valid: true, message: 'OK' };
}

/**
 * Registra uma ausência na planilha.
 * @param {Object} data - Dados da ausência
 * @returns {Object} { success: boolean, message: string }
 */
function registrarAusencia(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_AUSENCIAS);
  
  if (!aba) {
    return { success: false, message: 'Aba "' + ABA_AUSENCIAS + '" não encontrada. Execute criarAbasAusenciasReposicoes() primeiro.' };
  }
  
  // Validar dados
  var validacao = validarDadosAusencia(data);
  if (!validacao.valid) {
    return { success: false, message: validacao.message };
  }
  
  // Preparar dados para inserção respeitando a ordem atual dos cabeçalhos
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
  
  // Adicionar à planilha
  aba.appendRow(registro);
  
  Logger.log('✅ Ausência registrada: ' + data.NomeCompleto + ' - ' + data.DataAusencia);
  
  // Sincronizar com Firebase se disponível
  if (typeof enviarAbaParaFirebase === "function") {
    try {
      enviarAbaParaFirebase(aba);
    } catch (e) {
      Logger.log('⚠️ Erro ao sincronizar com Firebase: ' + e);
    }
  }
  
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
 * @param {Object} data - Dados da reposição
 * @returns {Object} { success: boolean, message: string }
 */
function registrarReposicao(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_REPOSICOES);
  
  if (!aba) {
    return { success: false, message: 'Aba "' + ABA_REPOSICOES + '" não encontrada. Execute criarAbasAusenciasReposicoes() primeiro.' };
  }
  
  // Validar dados
  var validacao = validarDadosReposicao(data);
  if (!validacao.valid) {
    return { success: false, message: validacao.message };
  }
  
  // Preparar dados para inserção respeitando a ordem atual dos cabeçalhos
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
  
  // Adicionar à planilha
  aba.appendRow(registro);
  
  Logger.log('✅ Reposição registrada: ' + data.NomeCompleto + ' - ' + data.DataReposicao);
  
  // Sincronizar com Firebase se disponível
  if (typeof enviarAbaParaFirebase === "function") {
    try {
      enviarAbaParaFirebase(aba);
    } catch (e) {
      Logger.log('⚠️ Erro ao sincronizar com Firebase: ' + e);
    }
  }
  
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
 * Endpoint POST para receber dados de ausências e reposições do site externo.
 * 
 * Formato esperado:
 * {
 *   "tipo": "ausencia" ou "reposicao",
 *   "NomeCompleto": "João Silva",
 *   "EmailHC": "joao.silva@hc.fm.usp.br",
 *   "Curso": "Fisioterapia",
 *   "Escala": "1",
 *   "DataAusencia": "2024-01-15" (para ausências),
 *   "DataReposicao": "2024-01-20" (para reposições),
 *   "Unidade": "UTI",
 *   "Horario": "08:00-12:00",
 *   "Motivo": "Doença"
 * }
 */
function doPostAusenciasReposicoes(e) {
  try {
    // Parse dos dados recebidos
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
    
    // Retornar resposta JSON
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

/**
 * Busca ausências de um aluno específico.
 * @param {string} emailHC - Email do aluno
 * @returns {Array} Lista de ausências
 */
function buscarAusenciasAluno(emailHC) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_AUSENCIAS);
  
  if (!aba) {
    return [];
  }
  
  var dados = aba.getDataRange().getValues();
  var cabecalhos = dados[0];
  var ausencias = [];
  
  // Encontrar índice da coluna EmailHC
  var emailIndex = cabecalhos.indexOf('EmailHC');
  
  if (emailIndex === -1) {
    return [];
  }
  
  // Filtrar ausências do aluno
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][emailIndex] === emailHC) {
      var ausencia = {};
      for (var j = 0; j < cabecalhos.length; j++) {
        ausencia[cabecalhos[j]] = dados[i][j];
      }
      ausencias.push(ausencia);
    }
  }
  
  return ausencias;
}

/**
 * Busca reposições de um aluno específico.
 * @param {string} emailHC - Email do aluno
 * @returns {Array} Lista de reposições
 */
function buscarReposicoesAluno(emailHC) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA_REPOSICOES);
  
  if (!aba) {
    return [];
  }
  
  var dados = aba.getDataRange().getValues();
  var cabecalhos = dados[0];
  var reposicoes = [];
  
  // Encontrar índice da coluna EmailHC
  var emailIndex = cabecalhos.indexOf('EmailHC');
  
  if (emailIndex === -1) {
    return [];
  }
  
  // Filtrar reposições do aluno
  for (var i = 1; i < dados.length; i++) {
    if (dados[i][emailIndex] === emailHC) {
      var reposicao = {};
      for (var j = 0; j < cabecalhos.length; j++) {
        reposicao[cabecalhos[j]] = dados[i][j];
      }
      reposicoes.push(reposicao);
    }
  }
  
  return reposicoes;
}
