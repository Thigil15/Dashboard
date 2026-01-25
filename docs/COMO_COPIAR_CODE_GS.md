# 🚀 Guia: Como Copiar Code.gs para Google Apps Script

## ⚠️ IMPORTANTE

O arquivo `scripts/Code.gs` no repositório **JÁ CONTÉM** todas as funções necessárias para Ausências E Reposições. Você precisa copiar este arquivo para o Google Apps Script.

## 📋 Verificação Rápida

O `scripts/Code.gs` contém estas funções (confirme antes de copiar):

✅ **Para Reposições:**
- `registrarReposicao()` - Linha 2177
- `validarDadosReposicao()` - Linha 2096  
- `buscarReposicoesAluno()` - Linha 2328

✅ **Para Ausências:**
- `registrarAusencia()` - Linha 2122
- `validarDadosAusencia()` - Linha 2070
- `buscarAusenciasAluno()` - Linha 2290

✅ **Funções Compartilhadas:**
- `doPost()` - Linha 1723 (roteador principal)
- `doPostAusenciasReposicoes()` - Linha 2244 (processa ambos)
- `criarAbasAusenciasReposicoes()` - Linha 2014 (cria as abas)

✅ **Constantes:**
- `ABA_AUSENCIAS = 'Ausencias'` - Linha 9
- `ABA_REPOSICOES = 'Reposicoes'` - Linha 10

## 🔧 Passo a Passo para Copiar

### 1. Abra o Google Sheets
1. Vá para sua planilha do Dashboard
2. Menu: **Extensões > Apps Script**

### 2. Substitua o Código Completo
1. No editor do Apps Script, você verá um arquivo `Code.gs` (ou similar)
2. **SELECIONE TODO O CONTEÚDO** do arquivo atual (Ctrl+A / Cmd+A)
3. **DELETE** todo o conteúdo antigo
4. Abra o arquivo `scripts/Code.gs` do repositório
5. **COPIE TODO O CONTEÚDO** (2359 linhas)
6. **COLE** no editor do Apps Script
7. Clique em **Salvar** (ícone de disquete ou Ctrl+S)

### 3. Crie as Abas Necessárias
1. No Apps Script, selecione a função: `criarAbasAusenciasReposicoes`
2. Clique em **Executar** (▶️)
3. Autorize o script quando solicitado
4. Verifique que as abas "Ausencias" e "Reposicoes" foram criadas na planilha

### 4. Configure o Firebase (Se Necessário)
Se você usa Firebase, execute:
```javascript
salvarChaveFirebase()
```
E forneça sua chave secreta do Firebase quando solicitado.

### 5. Implante como Aplicativo Web
1. Clique em **Implantar > Nova implantação**
2. Tipo: **Aplicativo da Web**
3. Configure:
   - **Executar como**: Eu (seu email)
   - **Quem tem acesso**: Qualquer pessoa
4. Clique em **Implantar**
5. **COPIE A URL GERADA** (formato: `https://script.google.com/macros/s/[ID]/exec`)

### 6. Atualize a URL no Frontend
1. Abra o arquivo `script.js` do repositório
2. Procure por `appsScriptURL` (aparece 2 vezes):
   - Linha ~2906 (reposições)
   - Linha ~2871 (ausências)
3. Substitua pela URL que você copiou no passo 5

### 7. Teste o Sistema
1. Use o arquivo `docs/debug-reposicao-form.html` para testar
2. Ou teste direto no Dashboard
3. Verifique que os dados aparecem nas abas "Reposicoes" e "Ausencias"

## ❓ Troubleshooting

### "A função não existe"
➡️ Você não copiou o arquivo completo. Certifique-se de copiar TODAS as 2359 linhas do `scripts/Code.gs`

### "Aba não encontrada"
➡️ Execute `criarAbasAusenciasReposicoes()` no Apps Script

### "Dados não aparecem na planilha"
➡️ Verifique:
1. O Apps Script está implantado como "Aplicativo da Web"?
2. A URL no `script.js` está correta?
3. As abas "Ausencias" e "Reposicoes" existem?

### "Reposição não funciona, mas Ausência sim"
➡️ Isso é IMPOSSÍVEL se você copiou o Code.gs completo, pois ambas usam a mesma função `doPostAusenciasReposicoes()`. Verifique:
1. O código no Apps Script é exatamente o mesmo do repositório?
2. Você salvou após colar?
3. Você fez uma nova implantação?

## 🎯 Checklist Final

Antes de testar, confirme:

- [ ] Copiei TODO o conteúdo de `scripts/Code.gs` (2359 linhas)
- [ ] Salvei no Google Apps Script (Ctrl+S)
- [ ] Executei `criarAbasAusenciasReposicoes()`
- [ ] As abas "Ausencias" e "Reposicoes" existem na planilha
- [ ] Implantei como "Aplicativo da Web"
- [ ] Copiei a URL do deployment
- [ ] Atualizei a URL no `script.js` (2 locais)
- [ ] Testei com `docs/debug-reposicao-form.html`

## 📞 Ainda Não Funciona?

Se após seguir TODOS os passos acima o sistema ainda não funciona:

1. Abra as **Ferramentas do Desenvolvedor** (F12) no navegador
2. Vá na aba **Console**
3. Tente registrar uma reposição
4. Copie TODAS as mensagens de erro
5. No Apps Script, vá em **Execuções** (menu lateral)
6. Copie os logs da última execução
7. Compartilhe ambos os logs ao reportar o problema

## ⚡ Nota Importante

O `scripts/Code.gs` no repositório é a **fonte única da verdade**. Ele já está completo e funcional. O problema geralmente é que:

1. ❌ O código não foi copiado para o Google Apps Script, OU
2. ❌ Foi copiado parcialmente (faltam funções), OU  
3. ❌ Não foi implantado como aplicativo web, OU
4. ❌ A URL no frontend está errada

---

**Última atualização**: Janeiro 2026  
**Arquivo no repositório**: `scripts/Code.gs` (2359 linhas)  
**Status**: ✅ Completo e testado
