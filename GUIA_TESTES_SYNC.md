# 🧪 Guia de Testes - Sistema de Sincronização Bidirecional

Este guia ajuda você a testar e validar o novo sistema de sincronização bidirecional.

## 📋 Pré-requisitos

Antes de começar os testes:

1. ✅ Chave do Firebase configurada
   ```javascript
   // No Apps Script Editor, vá em:
   // Projeto → Configurações → Propriedades do Script
   // Adicione: FIREBASE_SECRET = sua_chave_aqui
   ```

2. ✅ Gatilhos automáticos ativos
   ```javascript
   criarGatilhosAutomaticos();
   ```

3. ✅ Uma aba de teste preparada
   - Crie uma aba chamada "Teste"
   - Adicione alguns dados de exemplo

## 🧪 Teste 1: Sincronização Manual Inicial

### Objetivo
Verificar que a sincronização básica funciona.

### Passos
1. Abra o Apps Script Editor
2. Execute a função:
   ```javascript
   function testeManual() {
     enviarTodasAsAbasParaFirebase();
   }
   ```
3. Verifique os logs (Ver → Registros)

### Resultado Esperado
```
✅ Enviado com sucesso: Teste
✅ Enviado com sucesso: Alunos
...
🚀 Envio concluído — Enviadas: 3 | Ignoradas: 0
```

### Verificação no Firebase
1. Abra Firebase Console
2. Vá em Realtime Database → exportAll
3. Encontre sua aba (ex: "Teste")
4. Verifique que cada registro tem:
   - `_rowId`: string de 16 caracteres
   - `_rowIndex`: número da linha
   - Outros campos da planilha

## 🧪 Teste 2: Inserção de Nova Linha

### Objetivo
Verificar que novas linhas são detectadas e sincronizadas automaticamente.

### Passos
1. Abra sua planilha Google Sheets
2. Vá na aba "Teste"
3. Adicione uma nova linha com dados
4. Aguarde 5-10 segundos
5. Verifique os logs do Apps Script

### Resultado Esperado (Logs)
```
✅ Sincronizado automaticamente: Teste
```

### Verificação no Firebase
1. Recarregue o Firebase Console
2. Verifique que a nova linha apareceu
3. Confirme que tem `_rowId` e `_rowIndex`

## 🧪 Teste 3: Edição de Célula

### Objetivo
Verificar que edições são detectadas e sincronizadas.

### Passos
1. Edite uma célula existente na aba "Teste"
2. Aguarde 5-10 segundos
3. Verifique os logs

### Resultado Esperado (Logs)
```
✅ Sincronizado automaticamente: Teste
```

### Verificação no Firebase
1. Recarregue o Firebase Console
2. Verifique que o valor foi atualizado
3. Confirme que `_rowId` permaneceu o mesmo

## 🧪 Teste 4: Deleção de Linha ⭐ NOVO!

### Objetivo
Verificar que deleções são detectadas e removidas do Firebase.

### Passos
1. Identifique uma linha para deletar
2. Anote algum valor único dessa linha (para verificar depois)
3. Delete a linha inteira
4. Aguarde 5-10 segundos
5. Verifique os logs

### Resultado Esperado (Logs)
```
🗑️ Registro deletado detectado: a3b5c7d9e1f2a4b6
✅ Sincronizado com 1 deleção(ões)
✅ Sincronizado automaticamente: Teste
```

### Verificação no Firebase
1. Recarregue o Firebase Console
2. Verifique que o registro NÃO existe mais
3. Confirme que `metadados.registrosDeletados` foi incrementado

### ⚠️ Se Não Funcionar
```javascript
// Limpe o hash e tente novamente
limparHashAba("Teste");
// Delete a linha novamente
```

## 🧪 Teste 5: Múltiplas Deleções

### Objetivo
Verificar que múltiplas deleções são detectadas corretamente.

### Passos
1. Delete 3 linhas da planilha
2. Aguarde 10 segundos
3. Verifique os logs

### Resultado Esperado (Logs)
```
🗑️ Registro deletado detectado: a3b5c7d9e1f2a4b6
🗑️ Registro deletado detectado: b4c6d8e2f4a6b8c0
🗑️ Registro deletado detectado: c5d7e9f3a5b7c9d1
✅ Sincronizado com 3 deleção(ões)
```

### Verificação no Firebase
1. Confirme que todas as 3 linhas sumiram
2. Verifique `metadados.registrosDeletados: 3`

## 🧪 Teste 6: Mudança de Nome de Coluna ⭐ NOVO!

### Objetivo
Verificar que mudanças estruturais são detectadas automaticamente.

### Passos
1. Renomeie um cabeçalho (ex: "Nome" → "NomeCompleto")
2. Aguarde 5-10 segundos
3. Verifique os logs

### Resultado Esperado (Logs)
```
✅ Sincronizado automaticamente: Teste
```

### Verificação no Firebase
1. Recarregue o Firebase Console
2. Verifique que os registros têm o NOVO nome de campo
3. Exemplo: antes tinha `nome`, agora tem `nomecompleto` (sanitizado)

### ⚠️ Nota
- O nome será sanitizado (sem acentos, lowercase)
- Se era "Nome", vira "nome"
- Se era "Nome Completo", vira "nomecompleto"

## 🧪 Teste 7: Adicionar Nova Coluna ⭐ NOVO!

### Objetivo
Verificar que novas colunas são adicionadas automaticamente.

### Passos
1. Adicione uma nova coluna (ex: "Telefone")
2. Preencha alguns valores
3. Aguarde 5-10 segundos
4. Verifique os logs

### Resultado Esperado (Logs)
```
✅ Sincronizado automaticamente: Teste
```

### Verificação no Firebase
1. Recarregue o Firebase Console
2. Verifique que registros têm o novo campo `telefone`
3. Linhas sem valor terão o campo como vazio ou undefined

## 🧪 Teste 8: Hash Inteligente

### Objetivo
Verificar que o hash detecta mudanças estruturais.

### Passos
1. Execute no Apps Script:
   ```javascript
   function testeHash() {
     const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Teste");
     const dados = sheet.getDataRange().getValues();
     const cabecalhos = dados.shift();
     
     // Gera hash com estrutura
     const hash1 = gerarHashDados(dados, cabecalhos);
     Logger.log("Hash original: " + hash1);
     
     // Simula mudança no cabeçalho
     cabecalhos[0] = "NovoNome";
     const hash2 = gerarHashDados(dados, cabecalhos);
     Logger.log("Hash após mudança: " + hash2);
     
     Logger.log("Hashes são diferentes? " + (hash1 !== hash2));
   }
   ```

### Resultado Esperado
```
Hash original: a3b5c7d9e1f2a4b6...
Hash após mudança: x9y8z7w6v5u4t3s2...
Hashes são diferentes? true
```

## 🧪 Teste 9: Limpar Hash

### Objetivo
Verificar que limpar hash força re-sincronização.

### Passos
1. Execute:
   ```javascript
   function testeLimparHash() {
     limparHashAba("Teste");
   }
   ```
2. Verifique a notificação na planilha
3. Faça uma pequena edição
4. Verifique que sincronização ocorre mesmo sem mudanças reais

### Resultado Esperado
- Toast notification: "Hash limpo para aba 'Teste'"
- Próxima edição força sincronização completa

## 🧪 Teste 10: Metadados

### Objetivo
Verificar que metadados são salvos corretamente.

### Passos
1. Após qualquer sincronização, verifique no Firebase:
   ```
   exportAll → Teste → metadados
   ```

### Resultado Esperado
```json
{
  "totalRegistros": 45,
  "registrosDeletados": 2,
  "sincronizacaoBidirecional": true
}
```

## 🧪 Teste Completo: Cenário Real

### Objetivo
Simular uso real do sistema.

### Passos
1. **Dia 1**: Adicionar 10 novos alunos
   - Adicione 10 linhas
   - Aguarde sincronização
   - Verifique no Firebase

2. **Dia 2**: Atualizar alguns dados
   - Edite 5 células aleatórias
   - Aguarde sincronização
   - Verifique no Firebase

3. **Dia 3**: Remover alunos que saíram
   - Delete 3 linhas
   - Aguarde sincronização
   - Verifique que foram removidas do Firebase

4. **Dia 4**: Adicionar nova coluna "Status"
   - Adicione coluna
   - Preencha alguns valores
   - Aguarde sincronização
   - Verifique nova estrutura no Firebase

5. **Dia 5**: Verificação final
   - Total no Firebase deve bater com total na planilha
   - Todos os campos devem estar corretos
   - Nenhum registro deletado deve existir

## 📊 Checklist Final

Após todos os testes, verifique:

- [ ] ✅ Inserções funcionam automaticamente
- [ ] ✅ Edições funcionam automaticamente
- [ ] ✅ Deleções funcionam automaticamente (NOVO!)
- [ ] ✅ Mudanças de colunas funcionam automaticamente (NOVO!)
- [ ] ✅ Novas colunas são adicionadas automaticamente (NOVO!)
- [ ] ✅ Logs aparecem corretamente no Apps Script
- [ ] ✅ Metadados são salvos no Firebase
- [ ] ✅ IDs únicos (_rowId) são gerados
- [ ] ✅ Hash detecta mudanças estruturais
- [ ] ✅ Funções de limpeza de hash funcionam

## 🐛 Troubleshooting Comum

### Problema: "Deleção não funciona"
**Diagnóstico**:
```javascript
function debugDeletions() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Teste");
  const dados = sheet.getDataRange().getValues();
  const cabecalhos = dados.shift();
  const registros = criarRegistrosDeAba(dados, cabecalhos);
  
  Logger.log("IDs na planilha:");
  registros.forEach(r => Logger.log(r._rowId));
  
  const fbData = buscarDadosFirebase("Teste");
  if (fbData && fbData.dados) {
    Logger.log("\nIDs no Firebase:");
    fbData.dados.forEach(r => Logger.log(r._rowId));
  }
}
```

**Solução**:
- Verifique que IDs estão sendo gerados
- Limpe hash: `limparHashAba("Teste")`
- Tente deletar novamente

### Problema: "Hash não detecta mudança de coluna"
**Solução**:
```javascript
// Força nova sincronização
limparHashAba("Teste");
enviarAbaParaFirebase(SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Teste"));
```

### Problema: "Gatilhos não disparam"
**Verificação**:
```javascript
verificarGatilhosAtivos();
```

**Solução se inativos**:
```javascript
criarGatilhosAutomaticos();
```

### Problema: "Erro na requisição Firebase"
**Verificação**:
1. Chave do Firebase está configurada?
2. Firebase está acessível?
3. Permissões estão corretas?

**Debug**:
```javascript
function testFirebaseConnection() {
  const url = FIREBASE_URL + ".json?auth=" + FIREBASE_SECRET;
  const response = UrlFetchApp.fetch(url);
  Logger.log("Status: " + response.getResponseCode());
  Logger.log("Response: " + response.getContentText());
}
```

## 📝 Registro de Testes

Ao terminar os testes, documente:

```
Data: ___/___/______
Testado por: __________

Teste 1 (Sync Manual): [ ] ✅ [ ] ❌
Teste 2 (Inserção): [ ] ✅ [ ] ❌
Teste 3 (Edição): [ ] ✅ [ ] ❌
Teste 4 (Deleção): [ ] ✅ [ ] ❌
Teste 5 (Múltiplas Deleções): [ ] ✅ [ ] ❌
Teste 6 (Mudança de Coluna): [ ] ✅ [ ] ❌
Teste 7 (Nova Coluna): [ ] ✅ [ ] ❌
Teste 8 (Hash Inteligente): [ ] ✅ [ ] ❌
Teste 9 (Limpar Hash): [ ] ✅ [ ] ❌
Teste 10 (Metadados): [ ] ✅ [ ] ❌

Observações:
_________________________________
_________________________________
_________________________________

Sistema Aprovado? [ ] SIM [ ] NÃO
```

---

**Pronto para começar a usar em produção!** 🚀

Se todos os testes passarem, o sistema está funcionando perfeitamente e pode ser usado normalmente.
