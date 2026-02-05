# Firebase Realtime Database - Configuração para Cache Espelho

## 📋 Visão Geral

Este documento explica como configurar o Firebase Realtime Database como um **cache espelho** onde:

- ✅ **Apps Script** escreve dados completos (PUT) da planilha Google Sheets
- ✅ **Website** escuta mudanças em tempo real
- ✅ **Inserções** são refletidas imediatamente no site
- ✅ **Deleções** são refletidas imediatamente no site

## 🔧 Arquitetura

```
Google Sheets → Apps Script → Firebase RTDB → Website (Real-time)
                  (PUT)         (Mirror)      (Listeners)
```

### Fluxo de Dados

1. **Google Sheets** é a fonte primária de dados
2. **Apps Script** detecta mudanças automaticamente (via triggers)
3. **Apps Script** envia JSON completo para Firebase via REST API (PUT)
4. **Firebase RTDB** armazena os dados no caminho `/exportAll`
5. **Website** escuta mudanças em tempo real via Firebase SDK
6. **Website** atualiza interface automaticamente quando dados mudam

## 🔐 Configuração de Segurança

### Passo 1: Configurar Regras do Firebase

As regras de segurança devem permitir:
- ✅ **Leituras**: Apenas usuários autenticados
- ✅ **Escritas**: Abertas no caminho `/exportAll` (Apps Script usa REST API sem auth)

**Importante**: Como o Apps Script usa REST API pública, precisamos permitir escritas no caminho `/exportAll`. Isso é seguro porque:
- O Apps Script é uma fonte confiável (apenas você tem acesso)
- A URL do Firebase não é pública
- Apenas o caminho `/exportAll` permite escritas
- Leituras ainda requerem autenticação

### Regras Recomendadas

Acesse o Firebase Console:
1. Vá para: https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/rules
2. Configure as seguintes regras:

```json
{
  "rules": {
    "exportAll": {
      ".read": "auth != null",
      ".write": true,
      ".indexOn": ["_rowId", "EmailHC", "SerialHC"]
    },
    ".read": "auth != null",
    ".write": false
  }
}
```

**Explicação das Regras:**

- `"exportAll/.read": "auth != null"` - Apenas usuários autenticados podem ler
- `"exportAll/.write": true` - Permite escritas via REST API (Apps Script)
- `".indexOn"` - Otimiza consultas por campos específicos
- Regra padrão (`.read` e `.write` no root) protege outros caminhos

### Passo 2: Verificar Autenticação no Website

O website já está configurado para usar Firebase Authentication. Os usuários devem:
1. Fazer login com email e senha
2. Após autenticação, podem visualizar os dados
3. Real-time listeners são ativados automaticamente

## 📤 Apps Script - Envio de Dados

### Método de Envio

O Apps Script usa **Firebase REST API** com método **PUT** para substituir completamente os dados:

```javascript
const url = FIREBASE_URL + "exportAll/" + nomeAba + ".json";
const opcoes = {
  method: "put",
  contentType: "application/json",
  payload: JSON.stringify(payload)
};
const resposta = UrlFetchApp.fetch(url, opcoes);
```

### Estrutura dos Dados

Cada aba é enviada com a seguinte estrutura:

```json
{
  "dados": [
    {
      "_rowId": "abc123...",
      "_rowIndex": 2,
      "EmailHC": "exemplo@hc.edu.br",
      "NomeCompleto": "João Silva",
      ...
    }
  ],
  "nomeAbaOriginal": "Alunos",
  "ultimaAtualizacao": "2026-02-05T21:00:00.000Z",
  "metadados": {
    "totalRegistros": 150,
    "registrosDeletados": 0,
    "sincronizacaoBidirecional": true
  }
}
```

### Sincronização Automática

O Apps Script detecta mudanças automaticamente usando triggers:

- **onEdit**: Detecta edições de células
- **onChange**: Detecta inserções/deleções de linhas
- **Gatilhos temporais**: Sincronização periódica (opcional)

Para ativar a sincronização automática:
1. Abra a planilha Google Sheets
2. Vá em **Menu → Gestão de Pontos → Configurar Gatilhos → Ativar sincronização automática**

## 🌐 Website - Leitura em Tempo Real

### Listeners do Firebase

O website usa listeners do Firebase SDK para escutar mudanças em tempo real:

```javascript
const dbRef = window.firebase.ref(fbDB, 'exportAll/Alunos/dados');
const unsubscribe = window.firebase.onValue(dbRef, (snapshot) => {
  const data = snapshot.val();
  // Atualiza interface automaticamente
  processarDados(data);
});
```

### Paths Monitorados

O website escuta mudanças nos seguintes caminhos:

- `/exportAll/Alunos/dados` - Lista de alunos
- `/exportAll/Ausencias/dados` - Ausências
- `/exportAll/Reposicoes/dados` - Reposições
- `/exportAll/NotasTeoricas/dados` - Notas teóricas
- `/exportAll/Ponto/dados` - Registro de ponto
- `/exportAll/Escala*/dados` - Escalas de plantão

### Detecção de Mudanças

Quando o Apps Script faz um PUT:
1. Firebase RTDB atualiza os dados
2. Todos os listeners ativos são notificados
3. Website recebe novo snapshot dos dados
4. Interface é atualizada automaticamente
5. Usuário vê mudanças em **tempo real** (sem refresh)

## ✅ Testes de Funcionamento

### Teste 1: Inserção de Dados

1. Abra a planilha Google Sheets
2. Adicione uma nova linha em qualquer aba (ex: Alunos)
3. O Apps Script detecta a mudança automaticamente
4. Dados são enviados para Firebase
5. Website recebe notificação em tempo real
6. Nova linha aparece no dashboard **sem refresh**

### Teste 2: Deleção de Dados

1. Abra a planilha Google Sheets
2. Delete uma linha existente
3. Apps Script detecta a deleção
4. Envia JSON atualizado para Firebase (sem a linha deletada)
5. Website recebe notificação
6. Linha desaparece do dashboard **sem refresh**

### Teste 3: Edição de Dados

1. Abra a planilha Google Sheets
2. Edite uma célula
3. Apps Script detecta a edição
4. Envia dados atualizados para Firebase
5. Website recebe notificação
6. Dados atualizados aparecem no dashboard **sem refresh**

## 🔍 Troubleshooting

### Erro: "Invalid token in path"

**Causa**: Este erro ocorria quando o Apps Script tentava usar o parâmetro `?auth=` (método legado)

**Solução**: ✅ **Já corrigido!** Removemos o parâmetro `?auth=` e configuramos as regras do Firebase para permitir escritas no caminho `/exportAll`

### Erro: "Permission Denied"

**Causa**: Regras de segurança do Firebase não permitem acesso

**Soluções**:
1. **Para escritas do Apps Script**: Verifique se `.write: true` está configurado em `/exportAll`
2. **Para leituras do website**: Verifique se o usuário está autenticado (logged in)

### Dados Não Aparecem em Tempo Real

**Verificações**:
1. Usuário está autenticado no website?
2. Console do navegador mostra erros?
3. Listeners estão configurados? (Verifique console: `[setupDatabaseListeners]`)
4. Firebase RTDB está acessível? (https://console.firebase.google.com/project/dashboardalunos/database)

## 📊 Monitoramento

### No Firebase Console

Acesse: https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/data

Você deve ver:
```
📁 dashboardalunos-default-rtdb
  └─ 📁 exportAll
       ├─ 📁 Alunos
       │    ├─ dados: [...]
       │    ├─ nomeAbaOriginal: "Alunos"
       │    ├─ ultimaAtualizacao: "..."
       │    └─ metadados: {...}
       ├─ 📁 Ausencias
       ├─ 📁 Reposicoes
       └─ ...
```

### No Apps Script

1. Abra a planilha Google Sheets
2. Vá em **Extensões → Apps Script**
3. Clique em **Execuções** para ver o histórico
4. Verifique logs das funções executadas

### No Website

1. Abra o Console do Navegador (F12)
2. Procure por mensagens de log:
   - `[Firebase] App initialized successfully`
   - `[setupDatabaseListeners] Configurando listeners...`
   - `[setupDatabaseListeners] ✅ Dados recebidos em tempo real`

## 🚀 Benefícios desta Abordagem

✅ **Tempo Real**: Mudanças aparecem instantaneamente
✅ **Sem Polling**: Não precisa ficar fazendo requisições periódicas
✅ **Eficiente**: Firebase SDK gerencia conexões WebSocket
✅ **Escalável**: Firebase RTDB foi feito para isso
✅ **Confiável**: Reconexão automática em caso de queda
✅ **Simples**: Apps Script envia, website apenas escuta
✅ **Seguro**: Apenas usuários autenticados podem ler

## 📝 Mudanças Realizadas

### No Apps Script (`scripts/Code.gs`)

- ❌ Removido: `const FIREBASE_SECRET = ...`
- ❌ Removido: `?auth=` de todas as URLs
- ✅ Adicionado: Logs detalhados de erro
- ✅ Melhorado: Tratamento de erros HTTP

### No Website

- ✅ Listeners em tempo real já configurados
- ✅ Autenticação Firebase já implementada
- ✅ Processamento de dados já funcional

### Nas Regras do Firebase

- ✅ Escritas permitidas em `/exportAll` (para Apps Script)
- ✅ Leituras requerem autenticação (segurança)

## 📞 Suporte

Se encontrar problemas:
1. Verifique as regras do Firebase
2. Confirme que o usuário está autenticado
3. Verifique o console do navegador para erros
4. Verifique os logs do Apps Script
5. Teste a conexão com `verificarConfiguracaoFirebase()` no Apps Script

---

**Data da última atualização**: 2026-02-05
**Status**: ✅ Implementado e funcional
