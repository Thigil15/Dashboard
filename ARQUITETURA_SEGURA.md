# 🔐 ARQUITETURA SEGURA - Cloud Function + RTDB

## 📊 Nova Arquitetura Implementada

```
┌─────────────────────┐
│  Google Sheets      │  Fonte de dados
└──────────┬──────────┘
           │
           │ POST + X-SYNC-TOKEN header
           ↓
┌─────────────────────┐
│  Cloud Function     │  Valida token
│  sincronizarPlanilha│  (Firebase Functions)
└──────────┬──────────┘
           │
           │ Firebase Admin SDK
           ↓
┌─────────────────────┐
│  Firebase RTDB      │  Cache espelho
│  /cache/*           │  (sobrescrita total)
└──────────┬──────────┘
           │
           │ Real-time listeners (WebSocket)
           ↓
┌─────────────────────┐
│  Website            │  Requer Firebase Auth
│  (dashboard)        │  (usuário logado)
└─────────────────────┘
```

## 🎯 O Que Foi Implementado

### 1. Apps Script (✅ Completo)
- **Removido**: Acesso direto ao RTDB com `?auth=`
- **Adicionado**: Função `enviarParaEndpoint()`
- **Config**: FUNCTION_URL e SYNC_TOKEN em Script Properties
- **Payload**: JSON com aba, dados, nomeAbaOriginal, ultimaAtualizacao, metadados
- **Header**: X-SYNC-TOKEN para autenticação
- **IDs**: Baseados em campos estáveis (SerialHC/EmailHC/ID)

### 2. Cloud Function (✅ Código Pronto)
- **Arquivo**: `functions/index.js`
- **Função**: `sincronizarPlanilha`
- **Validação**: Token no header X-SYNC-TOKEN
- **Estratégia**: Sobrescrita total do nó (PUT/SET)
- **Path RTDB**: `/cache/{nomeAba}`
- **Estrutura**: `{registros: [], nomeOriginal, timestampSync, info}`

### 3. Website (✅ Atualizado)
- **Paths**: Mudado de `/exportAll/*` para `/cache/*`
- **Listeners**: `cache/{Aba}/registros`
- **Auth**: Já requer Firebase Authentication
- **Real-time**: Mantém onValue listeners

## 📝 CONFIGURAÇÃO NECESSÁRIA (Você Precisa Fazer)

### Passo 1: Deploy da Cloud Function

```bash
cd /caminho/para/Dashboard/functions
npm install
firebase login
firebase use dashboardalunos
firebase deploy --only functions:sincronizarPlanilha
```

**Resultado**: Você receberá uma URL tipo:
```
https://us-central1-dashboardalunos.cloudfunctions.net/sincronizarPlanilha
```

### Passo 2: Gerar e Configurar o Token de Sincronização

#### 2.1. Gerar Token Seguro

```bash
# No terminal (Mac/Linux):
openssl rand -hex 32

# Ou no Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Ou online:
# https://www.random.org/strings/?num=1&len=64&digits=on&loweralpha=on&unique=on&format=plain
```

**Exemplo de token gerado**:
```
a7f3c8e2b1d9f4e6c8a2b5d7e9f1c3a5b7d9e1f3c5a7b9d1e3f5c7a9b1d3e5f7
```

#### 2.2. Configurar Token na Cloud Function

```bash
firebase functions:config:set autenticacao.chave="SEU_TOKEN_AQUI"
firebase deploy --only functions:sincronizarPlanilha
```

**Substituir** `SEU_TOKEN_AQUI` pelo token gerado no passo 2.1.

#### 2.3. Configurar Token no Apps Script

1. Abra sua planilha Google Sheets
2. Vá em: **Extensões** → **Apps Script**
3. Clique em: **Configurações do projeto** (ícone de engrenagem ⚙️)
4. Role até: **Propriedades de script**
5. Clique em: **Adicionar propriedade de script**
6. Adicione duas propriedades:

**Propriedade 1**:
- **Chave**: `FUNCTION_URL`
- **Valor**: `https://us-central1-dashboardalunos.cloudfunctions.net/sincronizarPlanilha`

**Propriedade 2**:
- **Chave**: `SYNC_TOKEN`
- **Valor**: (Cole o mesmo token do passo 2.1)

### Passo 3: Atualizar Regras do Firebase RTDB

No Firebase Console:
https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/rules

**Cole estas regras**:

```json
{
  "rules": {
    "cache": {
      ".read": "auth != null",
      ".write": false,
      ".indexOn": ["_rowId", "EmailHC", "SerialHC"]
    },
    ".read": "auth != null",
    ".write": false
  }
}
```

**⚠️ IMPORTANTE**: 
- `.write: false` porque APENAS a Cloud Function escreve (via Admin SDK)
- `.read: "auth != null"` exige que usuários estejam logados
- Apps Script NÃO tem acesso direto ao RTDB

### Passo 4: Testar a Configuração

#### 4.1. Testar Apps Script

1. Abra Google Sheets
2. **Menu** → **Gestão de Pontos** → **Firebase** → **Verificar configuração**
3. Deve mostrar: "✅ Configuração OK"

Se der erro:
- Verifique FUNCTION_URL e SYNC_TOKEN nas propriedades
- Verifique se Cloud Function foi deployada
- Veja logs em Firebase Console → Functions

#### 4.2. Enviar Dados Iniciais

1. **Menu** → **Gestão de Pontos** → **Firebase** → **ENVIAR DADOS**
2. Aguarde processamento
3. Deve mostrar: "✅ Sync via Cloud Function! Enviadas: X"

#### 4.3. Verificar no Firebase Console

https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/data

Você deve ver:
```
📁 cache
  ├─ 📁 Alunos
  │    ├─ registros: [...]
  │    ├─ nomeOriginal: "Alunos"
  │    ├─ timestampSync: "..."
  │    └─ info: {...}
  ├─ 📁 Ausencias
  └─ ...
```

#### 4.4. Testar Website

1. Abra `index.html`
2. Faça login
3. Dados devem carregar
4. Console deve mostrar:
   - `[Firebase] App initialized successfully`
   - `[checkFirebaseConnection] ✅ Caminho /cache encontrado`
   - `[setupDatabaseListeners] ✅ Dados encontrados em cache/...`

#### 4.5. Testar Tempo Real

1. Mantenha website aberto
2. Vá para Google Sheets
3. Adicione uma linha
4. Aguarde 5-10 segundos
5. Nova linha deve aparecer no website automaticamente!

## 🔒 Segurança Garantida

### ✅ Melhorias de Segurança

1. **Apps Script não tem acesso direto ao RTDB**
   - Nenhum risco de vazamento de credenciais
   - Token validado server-side

2. **Cloud Function é o único ponto de escrita**
   - Valida token antes de qualquer operação
   - Usa Firebase Admin SDK (privilegiado)
   - Logs centralizados no Firebase

3. **Regras RTDB bloqueiam writes diretos**
   - `.write: false` em todos os paths
   - Apenas Cloud Function (Admin SDK) consegue escrever
   - Usuários só leem (e precisam estar autenticados)

4. **Token nunca exposto publicamente**
   - Armazenado em Script Properties (seguro)
   - Armazenado em Firebase Functions Config (seguro)
   - Transmitido apenas via HTTPS

### 🚨 Comparação: Antes vs Depois

**ANTES (Inseguro)**:
```
Apps Script → ?auth=SECRET → RTDB
❌ SECRET em URL (pode vazar em logs)
❌ Apps Script acessa RTDB diretamente
❌ Regras precisavam permitir .write: true
```

**DEPOIS (Seguro)**:
```
Apps Script → X-SYNC-TOKEN header → Cloud Function → Admin SDK → RTDB
✅ Token em header (não aparece em URLs)
✅ Validação server-side
✅ Regras bloqueiam writes (.write: false)
✅ Apenas Cloud Function escreve
```

## 📊 Estrutura de Dados

### Payload Enviado pelo Apps Script

```json
{
  "aba": "Alunos",
  "dados": [
    {
      "_rowId": "12345",
      "_rowIndex": 2,
      "EmailHC": "joao@hc.edu.br",
      "NomeCompleto": "João Silva",
      "SerialHC": "123456"
    }
  ],
  "nomeAbaOriginal": "Alunos",
  "ultimaAtualizacao": "2026-02-05T22:00:00.000Z",
  "metadados": {
    "totalRegistros": 150,
    "tipoSincronizacao": "sobrescrita_total"
  }
}
```

### Estrutura no RTDB (/cache/Alunos)

```json
{
  "registros": [...],
  "nomeOriginal": "Alunos",
  "timestampSync": "2026-02-05T22:00:00.000Z",
  "info": {
    "totalItens": 150,
    "tipo": "espelho_completo",
    "metadados": {...}
  }
}
```

## 🧪 Troubleshooting

### Erro: "Não autorizado" (401)

**Causa**: Token inválido ou não configurado

**Solução**:
1. Verifique se SYNC_TOKEN está nas propriedades do Apps Script
2. Verifique se configurou na Cloud Function: `firebase functions:config:get`
3. Certifique-se de que os tokens são EXATAMENTE iguais

### Erro: "Servidor não configurado" (500)

**Causa**: Cloud Function não tem o token configurado

**Solução**:
```bash
firebase functions:config:set autenticacao.chave="SEU_TOKEN"
firebase deploy --only functions:sincronizarPlanilha
```

### Erro: "Permission Denied" no Website

**Causa**: Regras RTDB ou usuário não autenticado

**Solução**:
1. Verifique regras do Firebase (devem ter `.read: "auth != null"`)
2. Faça logout e login novamente no website
3. Verifique console do navegador para erros de auth

### Dados Não Aparecem em Tempo Real

**Solução**:
1. Abra Console do navegador (F12)
2. Procure por: `[setupDatabaseListeners] ✅ Dados encontrados`
3. Se não aparecer, verifique se dados foram enviados do Apps Script
4. Verifique Firebase Console para confirmar que `/cache` existe

## 📚 Arquivos Modificados

### Apps Script
- `scripts/Code.gs`:
  - Substituído FIREBASE_URL/FIREBASE_SECRET por FUNCTION_URL/SYNC_TOKEN
  - Nova função `enviarParaEndpoint()`
  - IDs baseados em campos estáveis
  - Removida lógica de comparação de IDs

### Cloud Function
- `functions/package.json`: Dependências
- `functions/index.js`: Função `sincronizarPlanilha`

### Website
- `script.js`:
  - Caminhos mudados de `/exportAll/*` para `/cache/*`
  - checkFirebaseConnection() verifica `/cache`
  - Todos os listeners atualizados

## ✅ Checklist Final

- [ ] Cloud Function deployada
- [ ] Token gerado e configurado (Apps Script + Cloud Function)
- [ ] Regras RTDB atualizadas (.write: false, .read: "auth != null")
- [ ] Apps Script testado (verificarConfiguracaoFirebase)
- [ ] Dados enviados pelo Apps Script
- [ ] Firebase Console mostra estrutura /cache/*
- [ ] Website carrega dados
- [ ] Tempo real funciona (insert/update/delete)

---

**Status**: ✅ Implementação completa  
**Ação Necessária**: Configuração por você (deploy + tokens + regras)  
**Tempo Estimado**: 15-20 minutos  
**Data**: 2026-02-05
