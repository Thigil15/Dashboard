# 💬 Chat Data Flow - Documentação Completa

## 📋 Visão Geral

Este documento explica como os dados de chat (e todos os outros dados) são carregados no Dashboard do Portal do Ensino a partir do Google Apps Script.

---

## 🔗 URL do Apps Script

**URL Configurada:**
```
https://script.google.com/macros/s/AKfycbx6x-I0PCc1Ym8vx7VYyXmwvx3mY-9i3P16z6-5sJB2v728SlzENKnwy-4uAIHIiDLxGg/exec
```

Esta URL é a **única fonte de dados** para o site. Todos os dados, incluindo:
- Dados de alunos
- Ausências e reposições
- Notas teóricas e práticas
- Escalas
- Ponto
- **Dados de chat** (se configurados na planilha)

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Sheets                             │
│  (Planilha com todas as abas de dados)                      │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Google Apps Script (Code.gs)                    │
│  • Função doGet() - Serve dados como JSON                   │
│  • Função doPost() - Recebe dados de formulários            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ (HTTPS GET Request)
┌─────────────────────────────────────────────────────────────┐
│              firebase-config.js                              │
│  • appsScriptConfig.dataURL - URL do Apps Script            │
│  • Configuração centralizada                                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ (Carregado por index.html)
┌─────────────────────────────────────────────────────────────┐
│                    index.html                                │
│  • Carrega firebase-config.js como módulo ES6               │
│  • Disponibiliza config em window.firebase.appsScriptConfig │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼ (window.firebase.appsScriptConfig)
┌─────────────────────────────────────────────────────────────┐
│                    script.js                                 │
│  • fetchDataFromURL() - Busca dados do Apps Script          │
│  • Atualização automática a cada 5 minutos                  │
│  • Processa e armazena dados em variáveis globais           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                Dashboard Interface                           │
│  • Exibe dados de alunos, notas, ausências, etc.           │
│  • Formulários enviam dados de volta para Apps Script       │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Configuração em Arquivos

### 1. firebase-config.js
**Localização:** `/firebase-config.js`

```javascript
// Apps Script URL configuration - Used for ALL data loading
const appsScriptConfig = {
  dataURL: "https://script.google.com/macros/s/AKfycbx6x-I0PCc1Ym8vx7VYyXmwvx3mY-9i3P16z6-5sJB2v728SlzENKnwy-4uAIHIiDLxGg/exec"
};
```

✅ **Esta é a ÚNICA definição da URL no código**

### 2. index.html
**Localização:** `/index.html` (linhas 1590-1608)

```javascript
// Import configuration (Firebase for Auth + Apps Script for Data)
import configModule from './firebase-config.js';
const appsScriptConfig = configModule.appsScriptConfig || { dataURL: "" };

// Make configurations globally available
window.firebase = {
    // ... outras propriedades
    appsScriptConfig
};

console.log('[Apps Script Config] Data URL configured:', appsScriptConfig.dataURL);
```

### 3. script.js
**Localização:** `/script.js`

#### Busca de Dados (linhas 42-216)
```javascript
async function fetchDataFromURL() {
    console.log('[fetchDataFromURL] Buscando dados da URL do Apps Script...');
    
    // Lê URL da configuração global
    const dataURL = window.firebase?.appsScriptConfig?.dataURL;
    if (!dataURL) {
        console.error('[fetchDataFromURL] URL do Apps Script não configurada.');
        return false;
    }
    
    // Faz requisição para Apps Script
    const response = await fetch(dataURL);
    const data = await response.json();
    
    // Processa dados recebidos
    // - alunos
    // - ausencias_reposicoes
    // - ausencias
    // - reposicoes
    // - notas_teoricas
    // - ponto
    // - escalas
    // - chat (se existir na resposta)
    
    return true;
}
```

#### Envio de Formulários (linhas 2521-2700)
```javascript
function setupAusenciaFormHandler() {
    form.addEventListener('submit', async (e) => {
        // ... código de validação
        
        // Lê URL da configuração global
        const APPS_SCRIPT_URL = window.firebase?.appsScriptConfig?.dataURL;
        if (!APPS_SCRIPT_URL) {
            showError('URL do Apps Script não configurada');
            return;
        }
        
        // Envia dados para Apps Script
        await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify(ausenciaData)
        });
    });
}
```

---

## ⏱️ Atualização Automática

O sistema busca dados automaticamente a cada **5 minutos**:

```javascript
// script.js - linhas 224-237
function startPeriodicDataRefresh() {
    setInterval(() => {
        console.log('[Periodic Refresh] Atualizando dados...');
        fetchDataFromURL();
    }, 5 * 60 * 1000); // 5 minutos
}
```

---

## 💬 Como Adicionar Dados de Chat

Se você quiser adicionar dados de chat à planilha, siga estes passos:

### 1. Adicionar Aba na Planilha
- Crie uma nova aba chamada `Chat` na planilha do Google Sheets
- Adicione colunas como: `Timestamp`, `Usuario`, `Mensagem`, etc.

### 2. Code.gs Já Busca Automaticamente
O arquivo `scripts/Code.gs` já está configurado para buscar **TODAS as abas** automaticamente:

```javascript
function doGet(e) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const result = {};
    
    sheets.forEach(sheet => {
        const sheetName = sheet.getName();
        result[sheetName] = getSheetData(sheet);
    });
    
    return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
}
```

### 3. Processar Chat em script.js
Adicione processamento para a aba Chat em `fetchDataFromURL()`:

```javascript
// Em fetchDataFromURL(), após processar outras abas:
if (data.Chat) {
    window.chatData = data.Chat;
    console.log(`[fetchDataFromURL] ✅ Chat carregado: ${chatData.length} mensagens`);
}
```

### 4. Exibir Chat na Interface
Crie uma nova view para exibir o chat no dashboard.

---

## 🔒 Segurança

### Apps Script
- A URL é **pública** (acessível por qualquer pessoa)
- Configure permissões no Google Apps Script se necessário
- Use Firebase Authentication para proteger o acesso ao dashboard

### Firebase Authentication
O sistema usa Firebase **APENAS para autenticação** (login/logout):
- Email/senha são validados pelo Firebase
- Após login, o usuário pode acessar dados do Apps Script

---

## 🐛 Troubleshooting

### Dados não carregam
1. Abra o Console do navegador (F12)
2. Procure por mensagens de erro com `[fetchDataFromURL]`
3. Verifique se a URL está configurada corretamente em `firebase-config.js`
4. Teste a URL diretamente no navegador

### Formulários não enviam
1. Abra o Console do navegador (F12)
2. Procure por mensagens de erro com `[setupAusenciaFormHandler]` ou `[setupReposicaoFormHandler]`
3. Verifique se a URL está acessível

### Como testar a URL
Abra no navegador:
```
https://script.google.com/macros/s/AKfycbx6x-I0PCc1Ym8vx7VYyXmwvx3mY-9i3P16z6-5sJB2v728SlzENKnwy-4uAIHIiDLxGg/exec
```

Você deve ver um JSON com todas as abas da planilha.

---

## 📊 Estrutura do JSON Retornado

```json
{
  "Alunos": [
    {
      "NomeCompleto": "João Silva",
      "EmailHC": "joao@example.com",
      // ... outros campos
    }
  ],
  "Ausencias": [...],
  "Reposicoes": [...],
  "NotasTeorica": [...],
  "NotasPratica": [...],
  "Ponto": [...],
  "Escalas": [...],
  "Chat": [
    {
      "Timestamp": "2024-01-01 10:30:00",
      "Usuario": "João Silva",
      "Mensagem": "Olá!"
    }
  ]
}
```

---

## ✅ Checklist de Verificação

- [x] URL do Apps Script configurada em `firebase-config.js`
- [x] URL carregada em `index.html` e disponível em `window.firebase.appsScriptConfig`
- [x] `fetchDataFromURL()` usa a URL da configuração
- [x] Formulários de ausência e reposição usam a URL da configuração
- [x] Atualização automática a cada 5 minutos configurada
- [x] Sistema pronto para receber dados de chat quando a aba for criada

---

## 📞 Suporte

Para questões sobre:
- **Configuração do Apps Script**: Ver `DEPLOY_APPSCRIPT.md`
- **Arquitetura do sistema**: Ver `APPS_SCRIPT_ONLY.md`
- **Problemas com formulários**: Ver `TROUBLESHOOTING_REPOSICAO.md`
