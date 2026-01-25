# Guia de Resolução de Problemas: Botão Registrar Reposição

## 📋 Problema

Quando clico no botão "Registrar Reposição", nada acontece ou os dados não aparecem na planilha.

## ✅ Soluções Passo a Passo

### 1. Verificar as Abas na Planilha Google Sheets

As abas "Ausencias" e "Reposicoes" devem existir na sua planilha:

1. Abra sua planilha no Google Sheets
2. Verifique se existem duas abas chamadas exatamente:
   - `Ausencias` (com cabeçalhos: NomeCompleto, EmailHC, Curso, Escala, DataAusencia, Unidade, Horario, Motivo)
   - `Reposicoes` (com cabeçalhos: NomeCompleto, EmailHC, Curso, Escala, Horario, Unidade, Motivo, DataReposicao)

**Se as abas não existem:**

1. Vá em **Extensões > Apps Script**
2. Execute a função: `criarAbasAusenciasReposicoes()`
3. Autorize o script quando solicitado
4. Volte para a planilha e verifique se as abas foram criadas

### 2. Verificar o Deployment do Google Apps Script

O Apps Script precisa estar **implantado como aplicativo web** para receber dados:

1. Abra o Google Apps Script: **Extensões > Apps Script**
2. No canto superior direito, clique em **Implantar > Gerenciar implantações**
3. Verifique se existe uma implantação ativa do tipo "Aplicativo da Web"

**Se não existe implantação:**

1. Clique em **Implantar > Nova implantação**
2. Clique no ícone de engrenagem ⚙️ e selecione **Aplicativo da Web**
3. Configure:
   - **Descrição**: "API para Ausências e Reposições"
   - **Executar como**: Eu (seu email)
   - **Quem tem acesso**: Qualquer pessoa
4. Clique em **Implantar**
5. Copie a URL gerada (formato: `https://script.google.com/macros/s/[ID]/exec`)
6. **IMPORTANTE**: Cole essa URL no arquivo `script.js` nas linhas:
   - Linha ~2841 (ausências)
   - Linha ~2906 (reposições)
   
   Substitua:
   ```javascript
   const appsScriptURL = 'https://script.google.com/macros/s/[SUA_URL_AQUI]/exec';
   ```

### 3. Testar o Formulário no Navegador

1. Abra o site do Dashboard
2. Pressione **F12** para abrir as Ferramentas do Desenvolvedor
3. Vá na aba **Console**
4. Tente registrar uma reposição
5. Observe as mensagens no console:

**Mensagens esperadas (sucesso):**
```
[setupReposicaoFormHandler] Form submitted
[setupReposicaoFormHandler] Validation passed. Sending data to Google Apps Script: {...}
[setupReposicaoFormHandler] ✅ Request sent successfully to Google Apps Script
[setupReposicaoFormHandler] Note: no-cors mode prevents reading response, assuming success
```

**Mensagens de erro comuns:**

- `Validation error: Nome completo é obrigatório` → Preencha todos os campos obrigatórios
- `Validation error: Email HC é obrigatório` → Verifique o campo de email
- `Validation error: Data da reposição é obrigatória` → Selecione uma data
- `Error sending data: Failed to fetch` → Problema de conexão ou URL inválida do Apps Script

### 4. Verificar Validação dos Campos

Os seguintes campos são **obrigatórios**:

- ✅ Nome Completo
- ✅ Email HC
- ✅ Data da Reposição

Se algum desses campos estiver vazio, o formulário não será enviado e uma mensagem de erro será exibida.

### 5. Verificar Logs no Google Apps Script

Para ver se os dados estão chegando no servidor:

1. Abra **Extensões > Apps Script**
2. No menu lateral, clique em **Execuções** (ícone de relógio)
3. Tente enviar uma reposição novamente
4. Veja se aparece uma nova execução da função `doPost`
5. Clique na execução para ver os logs

**Logs esperados:**
```
📥 Requisição recebida - Tipo: reposicao
📋 Dados: {"tipo":"reposicao","NomeCompleto":"...","EmailHC":"..."}
✅ Reposição registrada: [Nome] - [Data]
📤 Resultado: {"success":true,"message":"Reposição registrada com sucesso"}
```

**Se não aparecem execuções:** O Apps Script não está recebendo a requisição. Verifique:
- URL do deployment está correta no `script.js`?
- A implantação está ativa (não em modo "Arquivo de teste")?

### 6. Verificar Sincronização com Firebase

Após registrar na planilha, os dados devem sincronizar automaticamente com o Firebase:

1. No Apps Script, execute: `verificarStatusGatilhos()`
2. Verifique se os gatilhos automáticos estão ativos
3. Se não estiverem, execute: `criarGatilhosAutomaticos()`

### 7. Problemas de CORS (Cross-Origin)

O modo `no-cors` é necessário para o Google Apps Script, mas isso significa que **não conseguimos ler a resposta da requisição**.

**Isso é normal!** Se a requisição foi enviada sem erro, assume-se sucesso.

Para testar se o Apps Script está funcionando:

1. Use uma ferramenta como Postman ou cURL
2. Envie um POST para a URL do deployment:
   ```bash
   curl -X POST \
     'https://script.google.com/macros/s/[SUA_URL]/exec' \
     -H 'Content-Type: application/json' \
     -d '{
       "tipo": "reposicao",
       "NomeCompleto": "Teste Usuario",
       "EmailHC": "teste@hc.fm.usp.br",
       "Curso": "Fisioterapia",
       "Escala": "1",
       "Unidade": "UTI",
       "Horario": "08:00-12:00",
       "Motivo": "Teste",
       "DataReposicao": "2024-01-25"
     }'
   ```
3. Verifique se a linha apareceu na planilha

## 🔍 Checklist de Diagnóstico

Use este checklist para identificar o problema:

- [ ] As abas "Ausencias" e "Reposicoes" existem na planilha?
- [ ] Os cabeçalhos das abas estão corretos?
- [ ] O Apps Script está implantado como "Aplicativo da Web"?
- [ ] A URL do deployment está correta no `script.js`?
- [ ] O deployment tem permissão "Qualquer pessoa" tem acesso?
- [ ] Os gatilhos automáticos estão configurados?
- [ ] O console do navegador mostra erros?
- [ ] Todos os campos obrigatórios estão preenchidos?
- [ ] A execução aparece nos logs do Apps Script?
- [ ] Os dados aparecem na aba "Reposicoes" da planilha?
- [ ] A sincronização com Firebase está funcionando?

## 💡 Dicas Adicionais

### Mensagens de Sucesso Melhoradas

A partir desta atualização, as mensagens de sucesso/erro são mais claras:

**Sucesso:**
> ✅ Reposição registrada com sucesso! Os dados foram enviados para a planilha "Reposicoes".

**Erro de validação:**
> Nome completo é obrigatório
> Email HC é obrigatório
> Data da reposição é obrigatória

**Erro de conexão:**
> Erro ao registrar reposição: [mensagem]. Verifique sua conexão e tente novamente.

### Debug no Console

Para ver o que está acontecendo, sempre mantenha o Console do navegador aberto:

1. Pressione **F12**
2. Vá na aba **Console**
3. Tente registrar uma reposição
4. Copie as mensagens e compartilhe se precisar de ajuda

### Testar com Dados Simples

Se estiver tendo problemas, teste primeiro com dados simples:

1. Nome: "Teste"
2. Email: "teste@hc.fm.usp.br"
3. Curso: "Fisioterapia"
4. Escala: "1"
5. Data: Qualquer data futura
6. Preencha os outros campos

Se funcionar com dados simples, o problema pode estar em caracteres especiais nos dados reais.

## 📞 Precisa de Mais Ajuda?

Se após seguir todos esses passos o problema persistir:

1. ✅ Copie as mensagens do Console do navegador (F12)
2. ✅ Tire um print da tela dos "Logs de Execução" no Apps Script
3. ✅ Verifique se a URL do deployment está correta
4. ✅ Compartilhe essas informações ao reportar o problema

## 📖 Documentação Relacionada

- `SETUP_AUSENCIAS_REPOSICOES.md` - Setup inicial
- `docs/AUSENCIAS_REPOSICOES_GUIA.md` - Guia completo
- `docs/FIREBASE_SETUP.md` - Configuração do Firebase
- `docs/exemplo-form-ausencias-reposicoes.html` - Exemplo de formulário

---

**Última atualização**: Janeiro 2026
**Desenvolvido para**: Portal de Ensino InCor - HC FMUSP
