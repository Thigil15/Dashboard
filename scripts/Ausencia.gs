/**
 * Sistema de Identificação de Ausências
 * 
 * Funcionalidade:
 * - Identifica ausências nas abas EscalaPratica (1-12)
 * - Calcula o horário mais frequente de cada aluno
 * - Insere registros de ausência na aba "AusenciasReposicoes"
 * 
 * Cabeçalhos da aba AusenciasReposicoes:
 * NomeCompleto | EmailHC | Curso | Escala | DataAusencia | Unidade | Horario | Motivo | DataReposicao
 */

// Indicadores de ausência configuráveis
var INDICADORES_AUSENCIA = ['falta', 'ausente', 'f', '-'];

// Número máximo de escalas práticas
var MAX_ESCALAS = 12;

/**
 * Processa todas as escalas práticas e identifica ausências dos alunos.
 * Insere os registros de ausência na aba "AusenciasReposicoes".
 */
function processarAusencias() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAusencias = ss.getSheetByName('AusenciasReposicoes');
  
  if (!abaAusencias) {
    SpreadsheetApp.getUi().alert('❌ Erro', 'Aba "AusenciasReposicoes" não encontrada!', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }
  
  var totalAusencias = 0;
  
  // Processa EscalaPratica 1 a MAX_ESCALAS
  for (var escalaNum = 1; escalaNum <= MAX_ESCALAS; escalaNum++) {
    var nomeAba = 'EscalaPratica' + escalaNum;
    var escalaSheet = ss.getSheetByName(nomeAba);
    
    if (!escalaSheet) {
      console.log('Aba ' + nomeAba + ' não encontrada. Pulando...');
      continue;
    }
    
    var ausenciasEncontradas = identificarAusenciasNaEscala(ss, escalaSheet, escalaNum, abaAusencias);
    totalAusencias += ausenciasEncontradas;
    console.log('✅ ' + nomeAba + ': ' + ausenciasEncontradas + ' ausência(s) identificada(s)');
  }
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    '✅ Processamento concluído!\n' + totalAusencias + ' ausência(s) identificada(s) e registrada(s).',
    'Ausências',
    8
  );
  
  console.log('📊 Total de ausências processadas: ' + totalAusencias);
}

/**
 * Identifica ausências em uma escala prática específica.
 * @param {Spreadsheet} ss - A planilha ativa
 * @param {Sheet} escalaSheet - A aba da escala prática
 * @param {number} escalaNum - O número da escala (1-12)
 * @param {Sheet} abaAusencias - A aba de destino para registrar ausências
 * @returns {number} Número de ausências encontradas
 */
function identificarAusenciasNaEscala(ss, escalaSheet, escalaNum, abaAusencias) {
  var headers = escalaSheet.getRange(1, 1, 1, escalaSheet.getLastColumn()).getValues()[0];
  var lastRow = escalaSheet.getLastRow();
  
  if (lastRow < 2) {
    console.log('Escala vazia');
    return 0;
  }
  
  // Encontrar colunas de identificação
  var colIndices = encontrarColunasIdentificacao(headers);
  
  if (colIndices.nome < 0) {
    console.warn('Coluna NomeCompleto não encontrada na escala');
    return 0;
  }
  
  // Encontrar colunas de data
  var colunasData = encontrarColunasData(headers);
  
  if (colunasData.length === 0) {
    console.warn('Nenhuma coluna de data encontrada na escala');
    return 0;
  }
  
  // Ler todos os dados da escala
  var dados = escalaSheet.getRange(2, 1, lastRow - 1, escalaSheet.getLastColumn()).getValues();
  var ausenciasEncontradas = 0;
  
  // Para cada aluno na escala
  for (var i = 0; i < dados.length; i++) {
    var aluno = dados[i];
    var nomeCompleto = (colIndices.nome >= 0) ? String(aluno[colIndices.nome] || '').trim() : '';
    var emailHC = (colIndices.email >= 0) ? String(aluno[colIndices.email] || '').trim() : '';
    var curso = (colIndices.curso >= 0) ? String(aluno[colIndices.curso] || '').trim() : '';
    var unidade = (colIndices.unidade >= 0) ? String(aluno[colIndices.unidade] || '').trim() : '';
    
    // Ignorar linhas sem nome
    if (!nomeCompleto) continue;
    
    // Calcular horário mais frequente do aluno
    var horarioMaisFrequente = calcularHorarioMaisFrequente(aluno, colunasData);
    
    // Verificar ausências (células vazias nas colunas de data)
    for (var j = 0; j < colunasData.length; j++) {
      var colData = colunasData[j];
      var valorCelula = aluno[colData.indice];
      
      // Se a célula está vazia, é uma ausência
      if (ehAusencia(valorCelula)) {
        var dataAusencia = colData.data;
        
        // Verificar se já existe registro dessa ausência
        if (!ausenciaJaRegistrada(abaAusencias, nomeCompleto, emailHC, dataAusencia, escalaNum)) {
          // Inserir registro de ausência
          inserirRegistroAusencia(abaAusencias, {
            nomeCompleto: nomeCompleto,
            emailHC: emailHC,
            curso: curso,
            escala: escalaNum,
            dataAusencia: dataAusencia,
            unidade: unidade,
            horario: horarioMaisFrequente,
            motivo: '',
            dataReposicao: ''
          });
          ausenciasEncontradas++;
        }
      }
    }
  }
  
  return ausenciasEncontradas;
}

/**
 * Encontra as colunas de identificação do aluno.
 * @param {Array} headers - Array de cabeçalhos
 * @returns {Object} Objeto com índices das colunas
 */
function encontrarColunasIdentificacao(headers) {
  var indices = {
    nome: -1,
    email: -1,
    serial: -1,
    curso: -1,
    unidade: -1
  };
  
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').toLowerCase().trim();
    
    if (h === 'nomecompleto' || h === 'nome completo' || h === 'nome') {
      indices.nome = i;
    } else if (h === 'emailhc' || h === 'email' || h === 'e-mail') {
      indices.email = i;
    } else if (h === 'serialnumber' || h === 'serial') {
      indices.serial = i;
    } else if (h === 'curso') {
      indices.curso = i;
    } else if (h === 'unidade') {
      indices.unidade = i;
    }
  }
  
  return indices;
}

/**
 * Encontra as colunas que representam datas na escala.
 * Suporta formatos: DD/MM, DD_MM, DD/MM/YYYY, objetos Date
 * @param {Array} headers - Array de cabeçalhos
 * @returns {Array} Array de objetos {indice, data} para cada coluna de data
 */
function encontrarColunasData(headers) {
  var colunasData = [];
  var anoAtual = new Date().getFullYear();
  
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    var dataEncontrada = null;
    
    // Se é um objeto Date
    if (Object.prototype.toString.call(header) === '[object Date]' && !isNaN(header)) {
      dataEncontrada = formatarDataParaString(header);
    } else {
      var hs = String(header || '').trim();
      
      // Formato DD/MM ou DD_MM
      var match = hs.match(/^(\d{1,2})[\/\_](\d{1,2})(?:[\/\_](\d{2,4}))?$/);
      if (match) {
        var dia = padZero(parseInt(match[1], 10));
        var mes = padZero(parseInt(match[2], 10));
        // Anos de 2 dígitos são interpretados como 2000+ (ex: 25 = 2025)
        // Isso é apropriado para escalas de estágio que são sempre do ano atual ou recente
        var ano = match[3] ? parseInt(match[3], 10) : anoAtual;
        if (ano < 100) ano += 2000;
        dataEncontrada = dia + '/' + mes + '/' + ano;
      }
    }
    
    if (dataEncontrada) {
      colunasData.push({
        indice: i,
        data: dataEncontrada
      });
    }
  }
  
  return colunasData;
}

/**
 * Calcula o horário mais frequente de um aluno com base nos registros da escala.
 * @param {Array} dadosAluno - Linha de dados do aluno
 * @param {Array} colunasData - Array de colunas de data
 * @returns {string} Horário mais frequente (ex: "12h às 13h")
 */
function calcularHorarioMaisFrequente(dadosAluno, colunasData) {
  var contadorHorarios = {};
  
  for (var i = 0; i < colunasData.length; i++) {
    var colData = colunasData[i];
    var valorCelula = dadosAluno[colData.indice];
    
    if (valorCelula && String(valorCelula).trim() !== '') {
      var horarioExtraido = extrairHorario(valorCelula);
      if (horarioExtraido) {
        contadorHorarios[horarioExtraido] = (contadorHorarios[horarioExtraido] || 0) + 1;
      }
    }
  }
  
  // Encontrar o horário mais frequente
  var horarioMaisFrequente = '';
  var maxContagem = 0;
  
  for (var horario in contadorHorarios) {
    if (contadorHorarios[horario] > maxContagem) {
      maxContagem = contadorHorarios[horario];
      horarioMaisFrequente = horario;
    }
  }
  
  return horarioMaisFrequente || 'Horário não identificado';
}

/**
 * Extrai o horário de uma célula da escala.
 * Suporta formatos como "07:00:00 às 12:00:00", "7h às 12h", "07:00 - 12:00"
 * @param {*} valor - Valor da célula
 * @returns {string|null} Horário formatado ou null
 */
function extrairHorario(valor) {
  if (!valor) return null;
  
  var s = String(valor).trim();
  
  // Formato "HH:MM:SS às HH:MM:SS" ou "HH:MM às HH:MM"
  var match = s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:às|-|a)\s*(\d{1,2}):(\d{2})(?::\d{2})?/i);
  if (match) {
    var horaInicio = parseInt(match[1], 10);
    var horaFim = parseInt(match[3], 10);
    return horaInicio + 'h às ' + horaFim + 'h';
  }
  
  // Formato "Xh às Yh" ou "X às Y"
  match = s.match(/(\d{1,2})\s*h?\s*(?:às|-|a)\s*(\d{1,2})\s*h?/i);
  if (match) {
    var horaInicio = parseInt(match[1], 10);
    var horaFim = parseInt(match[2], 10);
    return horaInicio + 'h às ' + horaFim + 'h';
  }
  
  return null;
}

/**
 * Verifica se um valor representa ausência (célula vazia ou indicadores configurados).
 * Os indicadores são definidos na constante INDICADORES_AUSENCIA.
 * @param {*} valor - Valor da célula
 * @returns {boolean} true se é ausência
 */
function ehAusencia(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return true;
  }
  
  var s = String(valor).trim().toLowerCase();
  
  // Verifica se o valor está na lista de indicadores de ausência
  for (var i = 0; i < INDICADORES_AUSENCIA.length; i++) {
    if (s === INDICADORES_AUSENCIA[i]) {
      return true;
    }
  }
  
  return false;
}

/**
 * Verifica se uma ausência já foi registrada na aba AusenciasReposicoes.
 * @param {Sheet} abaAusencias - A aba de ausências
 * @param {string} nomeCompleto - Nome do aluno
 * @param {string} emailHC - Email do aluno
 * @param {string} dataAusencia - Data da ausência
 * @param {number} escala - Número da escala
 * @returns {boolean} true se já existe registro
 */
function ausenciaJaRegistrada(abaAusencias, nomeCompleto, emailHC, dataAusencia, escala) {
  var lastRow = abaAusencias.getLastRow();
  if (lastRow < 2) return false;
  
  var dados = abaAusencias.getRange(2, 1, lastRow - 1, abaAusencias.getLastColumn()).getValues();
  var headers = abaAusencias.getRange(1, 1, 1, abaAusencias.getLastColumn()).getValues()[0];
  
  // Encontrar índices das colunas
  var colNome = -1, colEmail = -1, colData = -1, colEscala = -1;
  
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').toLowerCase().trim();
    if (h === 'nomecompleto' || h === 'nome completo') colNome = i;
    else if (h === 'emailhc' || h === 'email') colEmail = i;
    else if (h === 'dataausencia' || h === 'data ausencia' || h === 'data') colData = i;
    else if (h === 'escala') colEscala = i;
  }
  
  for (var j = 0; j < dados.length; j++) {
    var linha = dados[j];
    var nomeExistente = (colNome >= 0) ? String(linha[colNome] || '').trim().toLowerCase() : '';
    var emailExistente = (colEmail >= 0) ? String(linha[colEmail] || '').trim().toLowerCase() : '';
    var dataExistente = (colData >= 0) ? formatarDataParaString(linha[colData]) : '';
    var escalaExistente = (colEscala >= 0) ? String(linha[colEscala] || '').trim() : '';
    
    // Compara por nome/email + data + escala
    var nomeMatch = nomeCompleto.toLowerCase() === nomeExistente || 
                    (emailHC && emailHC.toLowerCase() === emailExistente);
    var dataMatch = dataAusencia === dataExistente;
    var escalaMatch = String(escala) === escalaExistente;
    
    if (nomeMatch && dataMatch && escalaMatch) {
      return true;
    }
  }
  
  return false;
}

/**
 * Insere um registro de ausência na aba AusenciasReposicoes.
 * @param {Sheet} abaAusencias - A aba de destino
 * @param {Object} registro - Objeto com os dados do registro
 */
function inserirRegistroAusencia(abaAusencias, registro) {
  var headers = abaAusencias.getRange(1, 1, 1, abaAusencias.getLastColumn()).getValues()[0];
  
  // Mapear cabeçalhos para posições
  var mapeamento = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i] || '').toLowerCase().trim().replace(/\s+/g, '');
    mapeamento[h] = i;
  }
  
  // Criar linha de dados na ordem correta
  var novaLinha = new Array(headers.length).fill('');
  
  // Mapear campos do registro para as colunas
  if (mapeamento['nomecompleto'] !== undefined) novaLinha[mapeamento['nomecompleto']] = registro.nomeCompleto;
  if (mapeamento['emailhc'] !== undefined) novaLinha[mapeamento['emailhc']] = registro.emailHC;
  if (mapeamento['curso'] !== undefined) novaLinha[mapeamento['curso']] = registro.curso;
  if (mapeamento['escala'] !== undefined) novaLinha[mapeamento['escala']] = registro.escala;
  if (mapeamento['dataausencia'] !== undefined) novaLinha[mapeamento['dataausencia']] = registro.dataAusencia;
  if (mapeamento['unidade'] !== undefined) novaLinha[mapeamento['unidade']] = registro.unidade;
  if (mapeamento['horario'] !== undefined) novaLinha[mapeamento['horario']] = registro.horario;
  if (mapeamento['motivo'] !== undefined) novaLinha[mapeamento['motivo']] = registro.motivo;
  if (mapeamento['datareposicao'] !== undefined) novaLinha[mapeamento['datareposicao']] = registro.dataReposicao;
  
  abaAusencias.appendRow(novaLinha);
  console.log('✅ Ausência registrada: ' + registro.nomeCompleto + ' - ' + registro.dataAusencia);
}

/**
 * Formata uma data para string no formato DD/MM/YYYY.
 * @param {Date|string} valor - Valor da data
 * @returns {string} Data formatada
 */
function formatarDataParaString(valor) {
  if (!valor) return '';
  
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)) {
    return padZero(valor.getDate()) + '/' + padZero(valor.getMonth() + 1) + '/' + valor.getFullYear();
  }
  
  return String(valor).trim();
}

/**
 * Adiciona zero à esquerda para números menores que 10.
 * @param {number} n - Número
 * @returns {string} Número com padding
 */
function padZero(n) {
  return ('0' + n).slice(-2);
}

/**
 * Processa ausências para uma escala específica.
 * Útil para testes ou processamento individual.
 * @param {number} escalaNum - Número da escala (1-12)
 */
function processarAusenciasEscala(escalaNum) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaAusencias = ss.getSheetByName('AusenciasReposicoes');
  
  if (!abaAusencias) {
    console.error('Aba "AusenciasReposicoes" não encontrada!');
    return;
  }
  
  var nomeAba = 'EscalaPratica' + escalaNum;
  var escalaSheet = ss.getSheetByName(nomeAba);
  
  if (!escalaSheet) {
    console.error('Aba "' + nomeAba + '" não encontrada!');
    return;
  }
  
  var ausencias = identificarAusenciasNaEscala(ss, escalaSheet, escalaNum, abaAusencias);
  console.log('✅ ' + ausencias + ' ausência(s) identificada(s) em ' + nomeAba);
}

/**
 * Adiciona item de menu para processar ausências.
 * Esta função é chamada quando a planilha é aberta.
 */
function adicionarMenuAusencias() {
  var ui = SpreadsheetApp.getUi();
  
  // Cria submenu para escalas individuais
  var subMenu = ui.createMenu('📊 Escalas Individuais');
  for (var i = 1; i <= MAX_ESCALAS; i++) {
    subMenu.addItem('Escala ' + i, 'processarEscala' + i);
  }
  
  ui.createMenu('📋 Ausências')
    .addItem('🔍 Processar Todas as Ausências', 'processarAusencias')
    .addSeparator()
    .addSubMenu(subMenu)
    .addToUi();
}

// Funções auxiliares para menu - geradas dinamicamente para todas as escalas
function processarEscala1() { processarAusenciasEscala(1); }
function processarEscala2() { processarAusenciasEscala(2); }
function processarEscala3() { processarAusenciasEscala(3); }
function processarEscala4() { processarAusenciasEscala(4); }
function processarEscala5() { processarAusenciasEscala(5); }
function processarEscala6() { processarAusenciasEscala(6); }
function processarEscala7() { processarAusenciasEscala(7); }
function processarEscala8() { processarAusenciasEscala(8); }
function processarEscala9() { processarAusenciasEscala(9); }
function processarEscala10() { processarAusenciasEscala(10); }
function processarEscala11() { processarAusenciasEscala(11); }
function processarEscala12() { processarAusenciasEscala(12); }
