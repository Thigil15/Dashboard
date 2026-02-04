/**
 * ═══════════════════════════════════════════════════════════
 * 📚 EXEMPLO DE USO - Sistema de Sincronização Bidirecional
 * ═══════════════════════════════════════════════════════════
 * 
 * Este arquivo demonstra como usar o novo sistema de sincronização.
 * Copie e cole estas funções no Apps Script Editor para testar.
 */

/**
 * 🚀 EXEMPLO 1: Setup Inicial
 * Execute esta função UMA VEZ quando começar a usar o sistema.
 */
function exemploSetupInicial() {
  Logger.log("═══════════════════════════════════════");
  Logger.log("🚀 INICIANDO SETUP DO SISTEMA BIDIRECIONAL");
  Logger.log("═══════════════════════════════════════");
  
  // Passo 1: Ativar gatilhos automáticos
  Logger.log("\n📝 Passo 1: Ativando gatilhos automáticos...");
  criarGatilhosAutomaticos();
  
  // Passo 2: Limpar hashes antigos (força re-sync completo)
  Logger.log("\n🧹 Passo 2: Limpando hashes antigos...");
  limparTodosHashes();
  
  // Passo 3: Fazer primeira sincronização
  Logger.log("\n📤 Passo 3: Sincronizando todas as abas...");
  enviarTodasAsAbasParaFirebase();
  
  Logger.log("\n✅ SETUP CONCLUÍDO!");
  Logger.log("═══════════════════════════════════════");
  Logger.log("Agora o sistema sincroniza automaticamente:");
  Logger.log("  • Quando você adiciona linhas");
  Logger.log("  • Quando você edita células");
  Logger.log("  • Quando você deleta linhas");
  Logger.log("  • Quando você muda colunas");
  Logger.log("═══════════════════════════════════════");
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    "Setup concluído! Sistema de sincronização bidirecional ativo. ✅",
    "Sistema Configurado",
    10
  );
}

/**
 * 🔄 EXEMPLO 2: Forçar Re-sync de Uma Aba Específica
 * Use quando suspeitar que uma aba está dessincronizada.
 */
function exemploResyncAbaEspecifica() {
  const nomeAba = "Alunos"; // ⚠️ MUDE AQUI para sua aba
  
  Logger.log("═══════════════════════════════════════");
  Logger.log("🔄 FORÇANDO RE-SYNC DA ABA: " + nomeAba);
  Logger.log("═══════════════════════════════════════");
  
  // Limpa o hash (força re-sync)
  Logger.log("\n🧹 Limpando hash...");
  limparHashAba(nomeAba);
  
  // Obtém a aba
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getSheetByName(nomeAba);
  
  if (!aba) {
    Logger.log("❌ ERRO: Aba '" + nomeAba + "' não encontrada!");
    return;
  }
  
  // Sincroniza
  Logger.log("\n📤 Sincronizando...");
  enviarAbaParaFirebase(aba);
  
  Logger.log("\n✅ RE-SYNC CONCLUÍDA!");
  Logger.log("═══════════════════════════════════════");
}

/**
 * 🗑️ EXEMPLO 3: Demonstrar Detecção de Deleções
 * Esta função mostra como o sistema detecta registros deletados.
 */
function exemploDemonstraçãoDeleções() {
  const nomeAba = "Teste"; // ⚠️ Crie uma aba chamada "Teste" com alguns dados
  
  Logger.log("═══════════════════════════════════════");
  Logger.log("🗑️ DEMONSTRAÇÃO DE DETECÇÃO DE DELEÇÕES");
  Logger.log("═══════════════════════════════════════");
  
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getSheetByName(nomeAba);
  
  if (!aba) {
    Logger.log("❌ ERRO: Crie uma aba chamada 'Teste' primeiro!");
    return;
  }
  
  // Lê dados atuais da planilha
  Logger.log("\n📊 LENDO DADOS DA PLANILHA...");
  const dados = aba.getDataRange().getValues();
  const cabecalhos = dados.shift().map(h => sanitizeKey(h));
  const registros = criarRegistrosDeAba(dados, cabecalhos);
  
  Logger.log("Total de linhas na planilha: " + registros.length);
  Logger.log("\nIDs na planilha:");
  registros.forEach((r, i) => {
    Logger.log("  Linha " + (i + 2) + ": " + r._rowId);
  });
  
  // Busca dados do Firebase
  Logger.log("\n🔥 BUSCANDO DADOS DO FIREBASE...");
  const nomeAbaSanitizado = sanitizeKey(nomeAba);
  const dadosFirebase = buscarDadosFirebase(nomeAbaSanitizado);
  
  if (dadosFirebase && dadosFirebase.dados) {
    Logger.log("Total de registros no Firebase: " + dadosFirebase.dados.length);
    Logger.log("\nIDs no Firebase:");
    dadosFirebase.dados.forEach((r, i) => {
      Logger.log("  Registro " + (i + 1) + ": " + r._rowId);
    });
    
    // Detecta diferenças
    Logger.log("\n🔍 COMPARANDO...");
    const idsPlanilha = new Set(registros.map(r => r._rowId));
    const idsFirebase = new Set(dadosFirebase.dados.map(r => r._rowId));
    
    const deletados = [];
    dadosFirebase.dados.forEach(r => {
      if (!idsPlanilha.has(r._rowId)) {
        deletados.push(r._rowId);
      }
    });
    
    if (deletados.length > 0) {
      Logger.log("\n🗑️ REGISTROS DELETADOS DETECTADOS:");
      deletados.forEach(id => {
        Logger.log("  • " + id);
      });
    } else {
      Logger.log("\n✅ Nenhuma deleção detectada. Tudo sincronizado!");
    }
  } else {
    Logger.log("⚠️ Nenhum dado encontrado no Firebase para esta aba.");
  }
  
  Logger.log("\n═══════════════════════════════════════");
}

/**
 * 📊 EXEMPLO 4: Verificar Status do Sistema
 * Use para ver se tudo está funcionando corretamente.
 */
function exemploVerificarStatus() {
  Logger.log("═══════════════════════════════════════");
  Logger.log("📊 STATUS DO SISTEMA DE SINCRONIZAÇÃO");
  Logger.log("═══════════════════════════════════════");
  
  // Verifica gatilhos
  Logger.log("\n🔧 GATILHOS AUTOMÁTICOS:");
  const gatilhos = ScriptApp.getProjectTriggers();
  let onEditAtivo = false;
  let onChangeAtivo = false;
  
  for (let i = 0; i < gatilhos.length; i++) {
    const funcao = gatilhos[i].getHandlerFunction();
    if (funcao === "onEditFirebase") {
      onEditAtivo = true;
      Logger.log("  ✅ onEdit: ATIVO");
    }
    if (funcao === "onChangeFirebase") {
      onChangeAtivo = true;
      Logger.log("  ✅ onChange: ATIVO");
    }
  }
  
  if (!onEditAtivo) Logger.log("  ❌ onEdit: INATIVO");
  if (!onChangeAtivo) Logger.log("  ❌ onChange: INATIVO");
  
  // Verifica Firebase
  Logger.log("\n🔥 CONEXÃO FIREBASE:");
  if (!FIREBASE_SECRET) {
    Logger.log("  ❌ Chave não configurada!");
  } else {
    Logger.log("  ✅ Chave configurada");
    Logger.log("  URL: " + FIREBASE_URL);
  }
  
  // Lista abas e seus hashes
  Logger.log("\n📚 ABAS NA PLANILHA:");
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const abas = planilha.getSheets();
  
  for (let i = 0; i < abas.length; i++) {
    const aba = abas[i];
    const nome = aba.getName();
    const nomeSanitizado = sanitizeKey(nome);
    const hash = getHashAnterior(nomeSanitizado);
    const temDados = aba.getLastRow() > 1;
    
    Logger.log("\n  📄 " + nome);
    Logger.log("     • Nome sanitizado: " + nomeSanitizado);
    Logger.log("     • Tem dados: " + (temDados ? "Sim" : "Não"));
    Logger.log("     • Hash salvo: " + (hash ? "✅ Sim" : "❌ Não"));
  }
  
  // Resumo
  Logger.log("\n═══════════════════════════════════════");
  Logger.log("📊 RESUMO:");
  
  const sistemaOk = onEditAtivo && onChangeAtivo && FIREBASE_SECRET;
  if (sistemaOk) {
    Logger.log("✅ Sistema funcionando corretamente!");
  } else {
    Logger.log("⚠️ Sistema precisa de atenção:");
    if (!onEditAtivo || !onChangeAtivo) {
      Logger.log("  • Execute: criarGatilhosAutomaticos()");
    }
    if (!FIREBASE_SECRET) {
      Logger.log("  • Configure a chave do Firebase");
    }
  }
  
  Logger.log("═══════════════════════════════════════");
}

/**
 * 🧪 EXEMPLO 5: Teste Rápido de Deleção
 * Execute, depois delete uma linha, e execute novamente para ver a diferença.
 */
function exemploTesteRápidoDeleção() {
  const nomeAba = "Teste";
  
  Logger.log("═══════════════════════════════════════");
  Logger.log("🧪 TESTE RÁPIDO DE DELEÇÃO");
  Logger.log("═══════════════════════════════════════");
  
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getSheetByName(nomeAba);
  
  if (!aba) {
    Logger.log("❌ Crie uma aba 'Teste' com alguns dados primeiro!");
    return;
  }
  
  Logger.log("\n📝 INSTRUÇÕES:");
  Logger.log("1. Veja quantas linhas existem agora");
  Logger.log("2. Delete UMA linha da aba 'Teste'");
  Logger.log("3. Aguarde 10 segundos");
  Logger.log("4. Execute esta função novamente");
  Logger.log("5. Veja que o total diminuiu!");
  
  const totalLinhas = aba.getLastRow() - 1; // -1 para remover cabeçalho
  Logger.log("\n📊 Total de linhas de dados: " + totalLinhas);
  
  const nomeAbaSanitizado = sanitizeKey(nomeAba);
  const dadosFirebase = buscarDadosFirebase(nomeAbaSanitizado);
  
  if (dadosFirebase && dadosFirebase.dados) {
    const totalFirebase = dadosFirebase.dados.length;
    Logger.log("📊 Total no Firebase: " + totalFirebase);
    
    if (totalLinhas === totalFirebase) {
      Logger.log("\n✅ Sincronizado! Totais batem.");
    } else {
      Logger.log("\n⚠️ Dessincronizado!");
      Logger.log("   Diferença: " + Math.abs(totalLinhas - totalFirebase) + " registros");
      
      if (totalLinhas < totalFirebase) {
        Logger.log("   💡 Aguarde a sincronização automática ou execute:");
        Logger.log("      limparHashAba('" + nomeAba + "');");
      }
    }
    
    if (dadosFirebase.metadados) {
      Logger.log("\n📈 Metadados:");
      Logger.log("   • Última atualização: " + dadosFirebase.ultimaAtualizacao);
      Logger.log("   • Registros deletados (última sync): " + 
                 (dadosFirebase.metadados.registrosDeletados || 0));
      Logger.log("   • Sync bidirecional: " + 
                 (dadosFirebase.metadados.sincronizacaoBidirecional ? "✅ Sim" : "❌ Não"));
    }
  } else {
    Logger.log("\n⚠️ Nenhum dado no Firebase ainda.");
    Logger.log("   Execute: enviarAbaParaFirebase(aba);");
  }
  
  Logger.log("\n═══════════════════════════════════════");
}

/**
 * 🎓 EXEMPLO 6: Tutorial Completo
 * Execute esta função para ver um tutorial interativo.
 */
function exemploTutorialCompleto() {
  Logger.log("═══════════════════════════════════════════════════════════");
  Logger.log("🎓 TUTORIAL: SISTEMA DE SINCRONIZAÇÃO BIDIRECIONAL");
  Logger.log("═══════════════════════════════════════════════════════════");
  
  Logger.log("\n📚 O QUE É SINCRONIZAÇÃO BIDIRECIONAL?");
  Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Logger.log("É quando mudanças na planilha refletem no Firebase E vice-versa.");
  Logger.log("");
  Logger.log("Antes:");
  Logger.log("  Planilha → Firebase ✅");
  Logger.log("  Planilha ↚ Firebase ❌ (deleções não funcionavam)");
  Logger.log("");
  Logger.log("Agora:");
  Logger.log("  Planilha → Firebase ✅ (adicionar, editar, deletar)");
  Logger.log("  Planilha ↚ Firebase ✅ (planilha é a fonte da verdade)");
  
  Logger.log("\n🎯 PRINCIPAIS RECURSOS:");
  Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Logger.log("1. 🆕 Detecção automática de deleções");
  Logger.log("   • Delete uma linha → Firebase remove também");
  Logger.log("");
  Logger.log("2. 🔄 Mudanças estruturais automáticas");
  Logger.log("   • Mude nome de coluna → Firebase atualiza");
  Logger.log("   • Adicione coluna → Firebase adiciona campo");
  Logger.log("");
  Logger.log("3. 🔑 IDs únicos por linha");
  Logger.log("   • Cada linha recebe _rowId");
  Logger.log("   • Permite rastrear registros individuais");
  Logger.log("");
  Logger.log("4. 🧮 Hash inteligente");
  Logger.log("   • Detecta mudanças em dados E estrutura");
  Logger.log("   • Não precisa mais limpar hash manualmente");
  
  Logger.log("\n🚀 COMO COMEÇAR:");
  Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Logger.log("Execute estas funções na ordem:");
  Logger.log("");
  Logger.log("1. exemploSetupInicial()");
  Logger.log("   ↳ Configura tudo pela primeira vez");
  Logger.log("");
  Logger.log("2. exemploVerificarStatus()");
  Logger.log("   ↳ Confirma que está funcionando");
  Logger.log("");
  Logger.log("3. Use normalmente!");
  Logger.log("   ↳ Adicione, edite, delete linhas");
  Logger.log("   ↳ Tudo sincroniza automaticamente");
  
  Logger.log("\n🔧 FUNÇÕES ÚTEIS:");
  Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Logger.log("• exemploResyncAbaEspecifica()     → Re-sync de uma aba");
  Logger.log("• exemploDemonstraçãoDeleções()    → Ver deleções detectadas");
  Logger.log("• exemploTesteRápidoDeleção()      → Testar deleção rápido");
  Logger.log("• exemploVerificarStatus()         → Ver status do sistema");
  
  Logger.log("\n📖 DOCUMENTAÇÃO:");
  Logger.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Logger.log("• QUICK_START_SYNC.md      → Guia rápido");
  Logger.log("• SYNC_BIDIRECIONAL.md     → Documentação completa");
  Logger.log("• GUIA_TESTES_SYNC.md      → Testes detalhados");
  
  Logger.log("\n═══════════════════════════════════════════════════════════");
  Logger.log("✨ Pronto para começar! Execute exemploSetupInicial()");
  Logger.log("═══════════════════════════════════════════════════════════");
}

/**
 * 🏁 INÍCIO RÁPIDO
 * Execute APENAS esta função para setup completo!
 */
function inicioRapido() {
  Logger.log("🏁 INÍCIO RÁPIDO - SINCRONIZAÇÃO BIDIRECIONAL");
  Logger.log("");
  Logger.log("Executando setup automaticamente...");
  Logger.log("");
  
  exemploSetupInicial();
  
  Logger.log("");
  Logger.log("Verificando status...");
  Logger.log("");
  
  exemploVerificarStatus();
  
  Logger.log("");
  Logger.log("═══════════════════════════════════════");
  Logger.log("✅ TUDO PRONTO!");
  Logger.log("═══════════════════════════════════════");
  Logger.log("");
  Logger.log("📝 Próximos passos:");
  Logger.log("1. Use a planilha normalmente");
  Logger.log("2. Adicione, edite ou delete linhas");
  Logger.log("3. Aguarde 5-10 segundos");
  Logger.log("4. Verifique no Firebase Console");
  Logger.log("");
  Logger.log("🎉 Enjoy!");
}
