/**********************************************
 * 🎯 SISTEMA DE AUSÊNCIAS E REPOSIÇÕES
 * 
 * Este arquivo gerencia as abas "Ausencias" e "Reposicoes"
 * permitindo registro via POST de dados do site externo.
 * 
 * Estrutura das Abas:
 * 
 * Ausencias:
 * - NomeCompleto | EmailHC | Curso | Escala | DataAusencia | Unidade | Horario | Motivo
 * 
 * Reposicoes:
 * - NomeCompleto | EmailHC | Curso | Escala | Unidade | Horario | Motivo | DataReposicao
 * 
 **********************************************/

/**
 * Cria as abas "Ausencias" e "Reposicoes" se não existirem.
 * Configura os cabeçalhos corretos para cada aba.
 */
function criarAbasAusenciasReposicoes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Criar aba Ausencias
  var abaAusencias = ss.getSheetByName('Ausencias');
  if (!abaAusencias) {
    abaAusencias = ss.insertSheet('Ausencias');
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
  var abaReposicoes = ss.getSheetByName('Reposicoes');
  if (!abaReposicoes) {
    abaReposicoes = ss.insertSheet('Reposicoes');
    // Posicionar após a aba Ausencias
    ss.setActiveSheet(abaReposicoes);
    ss.moveActiveSheet(abaAusencias.getIndex() + 1);
    
    // Configurar cabeçalhos
    var cabecalhosReposicoes = ['NomeCompleto', 'EmailHC', 'Curso', 'Escala', 'Unidade', 'Horario', 'Motivo', 'DataReposicao'];
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
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.EmailHC)) {
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
  
  // Validar formato de email
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.EmailHC)) {
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
  var aba = ss.getSheetByName('Ausencias');
  
  if (!aba) {
    return { success: false, message: 'Aba "Ausencias" não encontrada. Execute criarAbasAusenciasReposicoes() primeiro.' };
  }
  
  // Validar dados
  var validacao = validarDadosAusencia(data);
  if (!validacao.valid) {
    return { success: false, message: validacao.message };
  }
  
  // Preparar dados para inserção
  var registro = [
    data.NomeCompleto || '',
    data.EmailHC || '',
    data.Curso || '',
    data.Escala || '',
    data.DataAusencia || '',
    data.Unidade || '',
    data.Horario || '',
    data.Motivo || ''
  ];
  
  // Adicionar à planilha
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
 * @param {Object} data - Dados da reposição
 * @returns {Object} { success: boolean, message: string }
 */
function registrarReposicao(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName('Reposicoes');
  
  if (!aba) {
    return { success: false, message: 'Aba "Reposicoes" não encontrada. Execute criarAbasAusenciasReposicoes() primeiro.' };
  }
  
  // Validar dados
  var validacao = validarDadosReposicao(data);
  if (!validacao.valid) {
    return { success: false, message: validacao.message };
  }
  
  // Preparar dados para inserção
  var registro = [
    data.NomeCompleto || '',
    data.EmailHC || '',
    data.Curso || '',
    data.Escala || '',
    data.Unidade || '',
    data.Horario || '',
    data.Motivo || '',
    data.DataReposicao || ''
  ];
  
  // Adicionar à planilha
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
  var aba = ss.getSheetByName('Ausencias');
  
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
  var aba = ss.getSheetByName('Reposicoes');
  
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
