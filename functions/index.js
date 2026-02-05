/**
 * Função Cloud personalizada para Dashboard de Alunos
 * Autor: Thiago
 * Objetivo: Receber dados do Apps Script e espelhar no RTDB com validação de token
 */

const funcoes = require('firebase-functions');
const administrador = require('firebase-admin');

administrador.initializeApp();
const baseDados = administrador.database();

// Manipulador principal do endpoint HTTP
exports.sincronizarPlanilha = funcoes.https.onRequest(async (requisicao, resposta) => {
  
  // Permitir CORS para desenvolvimento
  resposta.set('Access-Control-Allow-Origin', '*');
  
  // Tratar preflight OPTIONS
  if (requisicao.method === 'OPTIONS') {
    resposta.set('Access-Control-Allow-Methods', 'POST');
    resposta.set('Access-Control-Allow-Headers', 'Content-Type, X-SYNC-TOKEN');
    resposta.set('Access-Control-Max-Age', '3600');
    resposta.status(204).send('');
    return;
  }

  // Aceitar apenas POST
  if (requisicao.method !== 'POST') {
    resposta.status(405).json({ ok: false, erro: 'Método não permitido' });
    return;
  }

  // Buscar token da configuração e comparar com o recebido
  const chaveEsperada = funcoes.config().autenticacao?.chave;
  const chaveRecebida = requisicao.headers['x-sync-token'];
  
  if (!chaveEsperada) {
    console.error('[ERRO] Chave de autenticação não definida na configuração');
    resposta.status(500).json({ ok: false, erro: 'Servidor não configurado' });
    return;
  }

  // Validar autenticação
  const autenticacaoValida = chaveRecebida && chaveRecebida === chaveEsperada;
  
  if (!autenticacaoValida) {
    console.warn('[AVISO] Tentativa de acesso não autorizado', {
      ip: requisicao.ip,
      temToken: !!chaveRecebida
    });
    resposta.status(401).json({ ok: false, erro: 'Não autorizado' });
    return;
  }

  // Extrair informações do corpo da requisição
  const corpoDados = requisicao.body;
  const nomeAba = corpoDados.aba;
  const listaRegistros = corpoDados.dados;
  const tituloOriginal = corpoDados.nomeAbaOriginal;
  const momentoAtualizacao = corpoDados.ultimaAtualizacao;
  const informacoesExtra = corpoDados.metadados;

  // Validar campos obrigatórios
  if (!nomeAba) {
    resposta.status(400).json({ ok: false, erro: 'Nome da aba não fornecido' });
    return;
  }

  if (!Array.isArray(listaRegistros)) {
    resposta.status(400).json({ ok: false, erro: 'Dados devem ser uma lista' });
    return;
  }

  // Processar sincronização
  try {
    const localizacaoRTDB = `cache/${nomeAba}`;
    
    const pacoteDados = {
      registros: listaRegistros,
      nomeOriginal: tituloOriginal || nomeAba,
      timestampSync: momentoAtualizacao || administrador.database.ServerValue.TIMESTAMP,
      info: {
        totalItens: listaRegistros.length,
        tipo: informacoesExtra?.tipoSincronizacao || 'espelho_completo',
        metadados: informacoesExtra
      }
    };

    // Estratégia: sobrescrever o nó completo (resolve insert/update/delete automaticamente)
    await baseDados.ref(localizacaoRTDB).set(pacoteDados);

    console.log(`[SUCESSO] Aba sincronizada: ${nomeAba} com ${listaRegistros.length} registros`);

    resposta.status(200).json({
      ok: true,
      mensagem: `Sincronização completada: ${tituloOriginal}`,
      detalhes: {
        aba: nomeAba,
        totalRegistros: listaRegistros.length,
        localizacao: localizacaoRTDB
      }
    });

  } catch (erroProcessamento) {
    console.error('[ERRO] Falha na sincronização:', {
      aba: nomeAba,
      mensagem: erroProcessamento.message
    });

    resposta.status(500).json({
      ok: false,
      erro: 'Falha ao processar sincronização',
      detalhes: erroProcessamento.message
    });
  }
});
