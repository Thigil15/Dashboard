# 🧪 Índice de Testes

Este diretório contém todos os arquivos de teste do Portal do Ensino. Use estes testes para validar funcionalidades e diagnosticar problemas.

## 🚀 Início Rápido

**Primeiro teste a executar:**

### 1. Teste de Conexão Firebase ⚡
**Arquivo**: `test-firebase-connection.html`

**O que testa**:
- ✅ SDK do Firebase carregado
- ✅ Configuração válida
- ✅ Conexão estabelecida
- ✅ Dados existem no Firebase
- ✅ Estrutura de dados correta

**Como usar**:
1. Abra `test-firebase-connection.html` no navegador
2. Clique em "▶️ Executar Testes"
3. Verifique se todos ficam verdes ✅

**Quando usar**: Sempre que houver problemas com dados não carregando.

---

## 🔐 Testes de Login e Autenticação

### 2. Teste do Sistema de Login 🆕
**Arquivo**: `test-login-system.html`

**O que testa**:
- ✅ Botão de login desabilitado inicialmente
- ✅ Firebase inicializa corretamente
- ✅ Botão habilitado quando pronto
- ✅ Login funciona normalmente
- ✅ Race condition resolvida

**Como usar**:
1. Abra `test-login-system.html` no navegador
2. Leia os 4 cenários de teste manual
3. Execute cada teste seguindo as instruções
4. Marque como concluído se passar

**Quando usar**: Após mudanças no sistema de autenticação ou se login não funcionar.

---

## 📊 Testes de Dados e Campos

### 3. Teste de Campos de Dados
**Arquivo**: `test-data-fields.html`

**O que testa**:
- ✅ Campos de alunos carregam corretamente
- ✅ Normalização de campos funciona
- ✅ Variações de nomes de campos são reconhecidas

**Como usar**:
1. Abra `test-data-fields.html` no navegador
2. Execute os testes
3. Verifique se todos os campos esperados aparecem

**Quando usar**: Quando campos não aparecem ou dados estão incorretos.

### 4. Teste de Formatação de Campos
**Arquivo**: `test-field-formatting.html`

**O que testa**:
- ✅ Datas formatam corretamente
- ✅ Números formatam corretamente
- ✅ Campos especiais tratados apropriadamente

**Como usar**:
1. Abra `test-field-formatting.html` no navegador
2. Verifique exemplos de formatação
3. Confirme que valores aparecem como esperado

**Quando usar**: Quando datas ou números aparecem em formato errado.

---

## 📝 Testes de Notas Teóricas

### 5. Teste de Debug de Notas Teóricas
**Arquivo**: `test-notas-teoricas-debug.html`

**O que testa**:
- ✅ Estrutura de dados de notas teóricas
- ✅ Campos disponíveis
- ✅ Dados brutos do Firebase

**Como usar**:
1. Abra `test-notas-teoricas-debug.html` no navegador
2. Veja os dados brutos carregados
3. Identifique problemas de estrutura

**Quando usar**: Debug de problemas com notas teóricas.

### 6. Verificação de Correção de Notas Teóricas
**Arquivo**: `test-notas-teoricas-fix-verification.html`

**O que testa**:
- ✅ Correções de notas teóricas aplicadas
- ✅ Cálculos de média corretos
- ✅ Campos mapeados apropriadamente

**Como usar**:
1. Abra `test-notas-teoricas-fix-verification.html` no navegador
2. Execute verificação
3. Confirme que correções estão ativas

**Quando usar**: Após aplicar correções em notas teóricas.

### 7. Correção de Notas Teóricas
**Arquivo**: `test-notas-teoricas-fix.html`

**O que testa**:
- ✅ Visualização de notas teóricas
- ✅ Renderização correta
- ✅ Todos os módulos aparecem

**Como usar**:
1. Abra `test-notas-teoricas-fix.html` no navegador
2. Visualize como notas teóricas são exibidas
3. Verifique se todos os dados aparecem

**Quando usar**: Validar apresentação de notas teóricas.

---

## 💼 Testes de Notas Práticas

### 8. Visualização de Notas Práticas
**Arquivo**: `test-notaspraticas-visual.html`

**O que testa**:
- ✅ Notas práticas carregam
- ✅ Visualização está correta
- ✅ Todos os módulos práticos aparecem
- ✅ Formatação adequada

**Como usar**:
1. Abra `test-notaspraticas-visual.html` no navegador
2. Visualize notas práticas de um aluno
3. Verifique se layout está correto

**Quando usar**: Problemas com visualização de notas práticas.

---

## 🔧 Testes Gerais de Correções

### 9. Teste Geral de Correções
**Arquivo**: `test-fixes.html`

**O que testa**:
- ✅ Múltiplas correções aplicadas
- ✅ Sistema funcionando como esperado
- ✅ Integrações entre componentes

**Como usar**:
1. Abra `test-fixes.html` no navegador
2. Execute bateria de testes
3. Valide que correções estão ativas

**Quando usar**: Após aplicar múltiplas correções, validar sistema completo.

---

## 📊 Resumo dos Testes

| Arquivo | Categoria | Prioridade | Tempo |
|---------|-----------|------------|-------|
| `test-firebase-connection.html` | Firebase | 🔴 Alta | 2 min |
| `test-login-system.html` | Login | 🔴 Alta | 5 min |
| `test-data-fields.html` | Dados | 🟡 Média | 3 min |
| `test-field-formatting.html` | Formatação | 🟡 Média | 2 min |
| `test-notas-teoricas-debug.html` | Debug | 🟢 Baixa | 3 min |
| `test-notas-teoricas-fix-verification.html` | Verificação | 🟡 Média | 2 min |
| `test-notas-teoricas-fix.html` | Notas T. | 🟡 Média | 3 min |
| `test-notaspraticas-visual.html` | Notas P. | 🟡 Média | 3 min |
| `test-fixes.html` | Geral | 🟢 Baixa | 5 min |

**Total**: 9 testes | **Tempo Total**: ~28 minutos

---

## 🎯 Sequência Recomendada de Testes

### Para Novo Setup:
1. ✅ `test-firebase-connection.html` - Valida Firebase
2. ✅ `test-login-system.html` - Valida autenticação
3. ✅ `test-data-fields.html` - Valida dados
4. ✅ Abrir `index.html` e testar manualmente

### Para Debug de Problema Específico:

**Problema: Login não funciona**
→ `test-login-system.html`

**Problema: Dados não carregam**
→ `test-firebase-connection.html`

**Problema: Notas teóricas erradas**
→ `test-notas-teoricas-debug.html`
→ `test-notas-teoricas-fix.html`

**Problema: Notas práticas não aparecem**
→ `test-notaspraticas-visual.html`

**Problema: Campos faltando**
→ `test-data-fields.html`

---

## 💡 Dicas

### Como Executar Testes Localmente

1. **Abra o arquivo HTML diretamente no navegador**
   ```
   file:///caminho/para/Dashboard/tests/test-firebase-connection.html
   ```

2. **Ou use um servidor local**
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Então acesse:
   http://localhost:8000/tests/test-firebase-connection.html
   ```

### Ferramentas Úteis

- **Console do Navegador** (F12): Veja logs detalhados
- **Network Tab**: Verifique chamadas ao Firebase
- **Application Tab**: Inspecione dados no Firebase

### Reportar Problemas

Se um teste falhar:
1. ✅ Abra o console (F12)
2. ✅ Copie a mensagem de erro
3. ✅ Tire um screenshot
4. ✅ Anote qual teste falhou
5. ✅ Reporte no GitHub Issues

---

## 📖 Documentação Relacionada

- [VERIFICACAO_RAPIDA.md](../docs/VERIFICACAO_RAPIDA.md) - Checklist rápido
- [LOGIN_FIX_DOCUMENTATION.md](../docs/LOGIN_FIX_DOCUMENTATION.md) - Docs do login
- [FIREBASE_SETUP.md](../docs/FIREBASE_SETUP.md) - Setup do Firebase

---

**Última Atualização**: 2025-11-18  
**Versão**: v32.8.1  
**Total de Testes**: 9 arquivos
