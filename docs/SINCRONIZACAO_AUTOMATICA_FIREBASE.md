# ⚡ Sincronização Automática com Firebase

## 📋 Resumo

O arquivo `Code.gs` agora possui **sincronização automática** com o Firebase! Qualquer alteração feita nas abas da planilha será enviada automaticamente para o Firebase, sem necessidade de executar manualmente a função.

---

## 🚀 Como Ativar

### Passo 1: Abra o Google Apps Script
1. Na planilha do Google Sheets, vá em **Extensões → Apps Script**
2. O arquivo `Code.gs` deve estar visível

### Passo 2: Execute a função de configuração
1. No editor de scripts, selecione a função `criarGatilhosAutomaticos` no dropdown
2. Clique no botão ▶️ (Executar)
3. **Autorize** o script quando solicitado (primeira execução)

### Passo 3: Confirme a ativação
- Você verá uma notificação: **"Sincronização automática ATIVADA! 🚀"**
- No log (Ver → Logs), você verá:
  ```
  ✅ Gatilhos automáticos criados!
  📝 onEditFirebase: sincroniza ao editar células
  📝 onChangeFirebase: sincroniza ao adicionar/remover abas ou linhas
  ```

---

## 🔧 Funções Disponíveis

| Função | Descrição |
|--------|-----------|
| `criarGatilhosAutomaticos()` | ⚡ **Ativa** a sincronização automática |
| `removerGatilhosAutomaticos()` | ⏸️ **Desativa** a sincronização automática |
| `verificarStatusGatilhos()` | 📊 Verifica se os gatilhos estão ativos |
| `enviarTodasAsAbasParaFirebase()` | 📤 Sincroniza manualmente todas as abas |
| `criarGatilhoDiario()` | 🕒 Cria gatilho para sincronizar todo dia às 21h |

---

## ⚙️ Como Funciona

### 1. Gatilho `onEdit` (edição de células)
- Detecta quando você **edita qualquer célula**
- Sincroniza **apenas a aba editada** (mais eficiente)
- Usa sistema de hash para enviar apenas se houve alteração real

### 2. Gatilho `onChange` (alterações estruturais)
- Detecta quando você **adiciona/remove abas, linhas ou colunas**
- Sincroniza **todas as abas** para garantir consistência

### 3. Sistema de Debounce (anti-spam)
- Aguarda **30 segundos** entre sincronizações
- Evita sobrecarga no Firebase durante edições rápidas
- Você pode continuar editando normalmente

### 4. Sistema de Hash (eficiência)
- Calcula um "fingerprint" dos dados de cada aba
- Só envia se os dados realmente mudaram
- Economiza recursos e chamadas de API

---

## 📊 Verificando o Status

Execute a função `verificarStatusGatilhos()` para ver:

```
📊 STATUS DOS GATILHOS:
  • onEdit (auto sync): ✅ ATIVO
  • onChange (auto sync): ✅ ATIVO
  • Diário (21h): ❌ INATIVO
  • Última sync: 25/11/2025 10:30:45
```

---

## 🛑 Como Desativar

Se quiser pausar a sincronização automática:

1. Abra o Apps Script
2. Execute `removerGatilhosAutomaticos()`
3. Você verá: **"Sincronização automática DESATIVADA. ⏸️"**

Para reativar, execute `criarGatilhosAutomaticos()` novamente.

---

## ⚠️ Requisitos

### Chave do Firebase
A chave secreta do Firebase deve estar configurada:
```javascript
PropertiesService.getScriptProperties().setProperty("FIREBASE_SECRET", "sua_chave_aqui");
```

Ou crie uma função para salvar:
```javascript
function salvarChaveFirebase() {
  PropertiesService.getScriptProperties().setProperty("FIREBASE_SECRET", "SUA_CHAVE_AQUI");
  Logger.log("✅ Chave salva!");
}
```

### Permissões
Na primeira execução, o Google pedirá autorização para:
- Acessar e modificar planilhas
- Conectar a serviços externos (Firebase)
- Criar gatilhos/triggers

---

## 💡 Dicas

### Edições em lote
Se for fazer muitas edições de uma vez:
1. Faça todas as edições normalmente
2. O debounce de 30 segundos evitará spam
3. A última edição acionará a sync

### Sincronização manual
Você ainda pode executar `enviarTodasAsAbasParaFirebase()` manualmente a qualquer momento.

### Logs
Para ver o que está acontecendo:
1. No Apps Script, vá em **Execuções**
2. Clique em uma execução para ver os logs
3. Ou vá em **Ver → Logs** após executar uma função

---

## 🔍 Solução de Problemas

### "Chave do Firebase não configurada"
Execute a função para salvar a chave (veja seção "Requisitos").

### Sincronização não está acontecendo
1. Execute `verificarStatusGatilhos()` para confirmar que estão ativos
2. Verifique se passou 30 segundos desde a última sync (debounce)
3. Verifique os logs em **Execuções** no Apps Script

### Erro de permissão
Reautorize o script:
1. Vá em **Extensões → Apps Script**
2. Execute qualquer função
3. Siga o fluxo de autorização

---

## 📈 Benefícios

| Antes | Agora |
|-------|-------|
| ❌ Executar função manualmente | ✅ Automático a cada edição |
| ❌ Esquecer de sincronizar | ✅ Sempre sincronizado |
| ❌ Dados desatualizados | ✅ Dados em tempo real |
| ❌ Trabalho repetitivo | ✅ Zero esforço |

---

## 📝 Resumo das Alterações no Code.gs

**Novas funções adicionadas:**
- `onEditFirebase(e)` - Gatilho de edição
- `onChangeFirebase(e)` - Gatilho de alterações estruturais
- `enviarAbaParaFirebase(aba)` - Envia uma aba específica
- `salvarUltimaSync(timestamp)` - Salva timestamp da última sync
- `getUltimaSync()` - Obtém timestamp da última sync
- `criarGatilhosAutomaticos()` - Cria os gatilhos
- `removerGatilhosAutomaticos()` - Remove os gatilhos
- `verificarStatusGatilhos()` - Verifica status

**Nova constante:**
- `DEBOUNCE_INTERVAL` = 30000 (30 segundos)

---

**Última Atualização**: 2025-11-25  
**Versão**: v33.0.0
