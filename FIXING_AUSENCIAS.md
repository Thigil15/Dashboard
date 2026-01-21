# 🎯 Correção do Sistema de Ausências - Guia Completo

## 📋 Problema Identificado

**Issue Original**: Quando inserir a ausência, os dados caiam para a aba "PontoPratica" em vez de cair na aba "Ausencias"

**Exemplo do problema**:
```
caren.sardelari@hc.fm.usp.br	Caren Cristina Sardelari	21/01/2026	19:44:57		11	Prática
```

## ✅ Soluções Implementadas

### 1. Correção do Roteamento de Ausências (Code.gs)

**Problema Técnico**: As funções de ausências estavam em um arquivo separado (`AusenciasReposicoes.gs`) e não eram acessíveis ao handler principal `doPost()`.

**Solução**: Todas as funções foram integradas diretamente no `Code.gs` (arquivo único — `AusenciasReposicoes.gs` foi removido no repositório, mantendo tudo centralizado):

```javascript
function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var tipo = (data.tipo || '').toLowerCase();
  
  // ✅ Agora redireciona corretamente para ausências
  if (tipo === 'ausencia' || tipo === 'reposicao') {
    return doPostAusenciasReposicoes(e);
  }
  
  // ... resto do código de ponto
}
```

**Funções Integradas**:
- ✅ `doPostAusenciasReposicoes()` - Handler principal
- ✅ `registrarAusencia()` - Grava na aba "Ausencias"
- ✅ `registrarReposicao()` - Grava na aba "Reposicoes"
- ✅ `validarDadosAusencia()` - Validação de dados
- ✅ `validarDadosReposicao()` - Validação de dados
- ✅ `buscarAusenciasAluno()` - Busca por aluno
- ✅ `buscarReposicoesAluno()` - Busca por aluno
- ✅ `criarAbasAusenciasReposicoes()` - Utilitário para criar abas (caso necessário)

**Melhorias Adicionadas**:
- Sincronização automática com Firebase após gravar
- Logging detalhado para debug
- Tratamento de erros robusto

### 2. Melhoria na Exibição de Nomes

**Problema**: Nomes completos muito longos nos cards dos alunos

**Solução**: Criada função `getShortName()` que exibe apenas primeiro nome + último sobrenome:

```javascript
// Antes: "João Silva Santos Oliveira"
// Depois: "João Oliveira"
```

**Aplicado em**:
- ✅ Cards da aba Ausências
- ✅ Cards da aba Alunos

**Mantido nome completo em**:
- ✅ Formulário de inserção de ausência
- ✅ Modais de detalhes
- ✅ Tabelas de dados

### 3. Melhorias Visuais

**Problema**: Campo de ausências considerado "feio"

**Soluções**:
- ✅ Header da aba Ausências com gradiente roxo
- ✅ Header da aba Reposições com gradiente rosa
- ✅ Ícones com fundo semi-transparente
- ✅ Melhor contraste e tipografia

## 🚀 Como Implantar as Correções

### Passo 1: Atualizar o Google Apps Script

1. Abra sua planilha no Google Sheets
2. Vá em **Extensões > Apps Script**
3. Localize o arquivo `Code.gs`
4. **SUBSTITUA TODO O CONTEÚDO** pelo novo arquivo `scripts/Code.gs` deste repositório
5. Clique em **Salvar** (ícone de disquete)

**IMPORTANTE**: O arquivo `AusenciasReposicoes.gs` agora é **OPCIONAL**. Todas as funções já estão no `Code.gs`.

**NOTA**: As abas "Ausencias" e "Reposicoes" já existem na sua planilha, então não é necessário criar novas abas. O código está preparado para trabalhar com as abas existentes.

### Passo 2: Atualizar o Site

1. Substitua o arquivo `index.html` pelo novo
2. Substitua o arquivo `script.js` pelo novo
3. Não é necessário alterar `style.css`

### Passo 3: Testar o Sistema

#### Teste 1: Inserir Ausência via Site

1. Acesse o site do Dashboard
2. Faça login com seu email institucional
3. Vá na aba **Ausências**
4. Clique em um card de aluno
5. Preencha o formulário de ausência
6. Clique em "Registrar Ausência"

**Resultado Esperado**:
- ✅ Dados devem aparecer na aba "Ausencias" da planilha
- ✅ NÃO deve aparecer na aba "PontoPratica"
- ✅ Firebase deve ser atualizado automaticamente

#### Teste 2: Verificar Nome nos Cards

**Resultado Esperado**:
- ✅ Cards mostram apenas "Primeiro Último" (ex: "Caren Sardelari")
- ✅ Ao abrir o formulário, nome completo aparece
- ✅ Na tabela de ausências, nome completo aparece

#### Teste 3: Inserir Ausência via API

```bash
curl -X POST "SUA_URL_DO_APPS_SCRIPT" \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "ausencia",
    "NomeCompleto": "Teste Silva Santos",
    "EmailHC": "teste@hc.fm.usp.br",
    "Curso": "Fisioterapia",
    "Escala": "1",
    "DataAusencia": "2026-01-22",
    "Unidade": "UTI Clínica",
    "Horario": "07h-12h",
    "Motivo": "Teste do sistema"
  }'
```

**Resultado Esperado**:
```json
{
  "success": true,
  "message": "Ausência registrada com sucesso",
  "data": {
    "nome": "Teste Silva Santos",
    "data": "2026-01-22"
  }
}
```

## 🔍 Estrutura dos Dados

### Aba "Ausencias"

| Coluna | Descrição | Exemplo |
|--------|-----------|---------|
| NomeCompleto | Nome completo do aluno | Caren Cristina Sardelari |
| EmailHC | Email institucional | caren.sardelari@hc.fm.usp.br |
| Curso | Curso do aluno | Fisioterapia |
| Escala | Número da escala (1-12) | 11 |
| DataAusencia | Data da falta | 21/01/2026 |
| Unidade | Unidade onde ocorreu | UTI Clínica |
| Horario | Período da ausência | 07h-12h |
| Motivo | Justificativa | Doença |

### Aba "Reposicoes"

| Coluna | Descrição | Exemplo |
|--------|-----------|---------|
| NomeCompleto | Nome completo do aluno | João Silva Santos |
| EmailHC | Email institucional | joao.silva@hc.fm.usp.br |
| Curso | Curso do aluno | Fisioterapia |
| Escala | Número da escala (1-12) | 5 |
| Unidade | Unidade da reposição | Enf. Pneumo |
| Horario | Período da reposição | 13h-18h |
| Motivo | Motivo da reposição | Reposição de falta |
| DataReposicao | Data agendada | 28/01/2026 |

## 🐛 Solução de Problemas

### Problema: Ausência ainda vai para PontoPratica

**Causa**: O arquivo `Code.gs` não foi atualizado corretamente

**Solução**:
1. Verifique se o novo `Code.gs` foi copiado completamente
2. Procure por `doPostAusenciasReposicoes` no código
3. Se não encontrar, copie novamente o arquivo

### Problema: Erro "Aba Ausencias não encontrada"

**Causa**: As abas foram renomeadas ou removidas acidentalmente

**Solução**:
1. Verifique se as abas "Ausencias" e "Reposicoes" existem na planilha (com esses nomes exatos)
2. Se não existirem por algum motivo, no Apps Script execute: `criarAbasAusenciasReposicoes()`

### Problema: Nomes ainda aparecem completos nos cards

**Causa**: O arquivo `script.js` não foi atualizado

**Solução**:
1. Limpe o cache do navegador (Ctrl+Shift+Delete)
2. Recarregue a página (Ctrl+F5)
3. Verifique se a função `getShortName()` existe no `script.js`

### Problema: Erro 400 ou 404 ao enviar ausência

**Causa**: URL do Apps Script desatualizada

**Solução**:
1. No Apps Script, vá em **Implantar > Gerenciar implantações**
2. Copie a URL do Web App
3. Atualize a URL no `script.js` (linha ~2591)

## 📊 Logs e Debugging

### Visualizar Logs do Apps Script

1. No editor do Apps Script
2. Vá em **Execuções** (menu lateral)
3. Clique na execução mais recente
4. Veja os logs detalhados

**Logs Esperados para Ausência**:
```
📥 Requisição recebida - Tipo: ausencia
📋 Dados: {...}
✅ Ausência registrada: Caren Cristina Sardelari - 21/01/2026
📤 Resultado: {"success":true,...}
```

### Debug no Navegador

Abra o Console do navegador (F12) e procure por:
```
[setupAusenciaFormHandler] Sending data to Google Apps Script: {...}
[setupAusenciaFormHandler] Request sent successfully
```

## 📞 Suporte

Se após seguir todos os passos o problema persistir:

1. **Verifique os logs**: Console do navegador + Apps Script
2. **Teste a API diretamente**: Use curl ou Postman
3. **Confirme a estrutura**: Verifique se as abas têm os cabeçalhos corretos
4. **Revise o código**: Compare com os arquivos deste repositório

## ✨ Melhorias Futuras Sugeridas

- [ ] Adicionar validação de datas (não permitir datas futuras para ausências)
- [ ] Adicionar campo de observações adicionais
- [ ] Criar relatório de ausências por aluno
- [ ] Notificação automática por email ao registrar ausência
- [ ] Histórico de alterações em ausências

---

**Desenvolvido para Portal de Ensino InCor - HC FMUSP**  
**Data da Correção**: Janeiro 2026
