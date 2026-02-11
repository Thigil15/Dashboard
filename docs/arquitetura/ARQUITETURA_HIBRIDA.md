# Arquitetura Híbrida: Firebase Auth + Apps Script Data

## 📋 Visão Geral

O sistema agora utiliza uma **arquitetura híbrida**:
- **Firebase Authentication**: Para autenticação de usuários (login/logout)
- **Apps Script**: Para carregamento de todos os dados da planilha

## 🔐 Fluxo de Autenticação e Dados

```
┌─────────────────────────────────────────────────────────┐
│                    FLUXO COMPLETO                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Usuário abre index.html                            │
│      ↓                                                  │
│  2. Carrega Firebase SDK (Auth)                        │
│      ↓                                                  │
│  3. Mostra tela de login                               │
│      ↓                                                  │
│  4. Usuário digita email/senha                         │
│      ↓                                                  │
│  5. Firebase Authentication valida credenciais         │
│      ↓                                                  │
│  6. Se aprovado → onAuthStateChanged(user)             │
│      ↓                                                  │
│  7. Mostra dashboard                                   │
│      ↓                                                  │
│  8. fetchDataFromURL() busca dados do Apps Script     │
│      ↓                                                  │
│  9. Code.gs retorna JSON com todas as abas             │
│      ↓                                                  │
│ 10. Dashboard exibe dados                              │
│      ↓                                                  │
│ 11. Atualização automática a cada 5 minutos           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 🔧 Configuração

### 1. firebase-config.js

```javascript
// Firebase - usado APENAS para autenticação
const firebaseConfig = {
  apiKey: "...",
  authDomain: "dashboardalunos.firebaseapp.com",
  projectId: "dashboardalunos",
  // ... outras configs
};

// Apps Script - usado para TODOS os dados
const appsScriptConfig = {
  dataURL: "https://script.google.com/macros/s/[ID]/exec"
};
```

### 2. Adicionar Usuários no Firebase

Para adicionar usuários que podem fazer login:

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione seu projeto: `dashboardalunos`
3. Vá em **Authentication** → **Users**
4. Clique em **Add User**
5. Digite o email e senha
6. Clique em **Add User**

### 3. Publicar o Apps Script

1. Abra sua planilha no Google Sheets
2. Vá em **Extensões** → **Apps Script**
3. Cole o código do arquivo `scripts/Code.gs`
4. Clique em **Implantar** → **Nova implantação**
5. Tipo: **Aplicativo da Web**
6. Executar como: **Eu**
7. Quem pode acessar: **Qualquer pessoa**
8. Copie a URL gerada
9. Cole em `firebase-config.js` no campo `dataURL`

## 📂 Estrutura de Arquivos

### firebase-config.js
- Configuração do Firebase (Auth)
- URL do Apps Script (Data)

### index.html
- Carrega Firebase SDK (somente Auth)
- Carrega configurações
- Interface do usuário

### script.js
- `initializeFirebase()`: Inicializa Firebase Auth
- `handleLogin()`: Autentica com email/senha
- `handleLogout()`: Faz logout
- `onAuthStateChanged()`: Observa estado de autenticação
- `fetchDataFromURL()`: Busca dados do Apps Script
- `initDashboard()`: Inicializa dashboard após auth

### scripts/Code.gs
- `doGet()`: Retorna JSON com todas as abas
- `doPost()`: Recebe dados de formulários
- Sistema de ponto e ausências

## 🔐 Segurança

### Firebase Authentication
- ✅ **Protege o acesso**: Apenas usuários autenticados podem ver o dashboard
- ✅ **Email/Senha**: Sistema seguro de autenticação
- ✅ **Gerenciável**: Adicione/remova usuários no Firebase Console

### Apps Script Data
- ⚠️ **URL Pública**: A URL do Apps Script é pública no código client-side
- ⚠️ **Qualquer pessoa com a URL**: Pode acessar os dados diretamente
- 💡 **Solução**: Configure controles de acesso no Apps Script se necessário

## 🚀 Como Usar

### Login
1. Abra `index.html` no navegador
2. Digite email e senha (cadastrados no Firebase)
3. Clique em **Entrar**
4. Se aprovado, dashboard carrega automaticamente

### Logout
1. Clique no ícone de usuário no canto superior direito
2. Clique em **Sair**
3. Retorna para tela de login

## 📊 Dados

### Origem dos Dados
- **100% Apps Script**: Todos os dados vêm do Google Sheets via Code.gs
- **Sem Firebase Database**: Firebase é usado APENAS para autenticação

### Estrutura do JSON

```json
{
  "cache": {
    "Alunos": {
      "registros": [...],
      "metadados": {
        "nomeOriginal": "Alunos",
        "totalRegistros": 100
      }
    },
    "Ausencias": { ... },
    "Reposicoes": { ... },
    "NotasTeoricas": { ... },
    "Escala1": { ... }
  },
  "metadados": {
    "totalAbas": 10,
    "ultimaAtualizacao": "2026-02-10T13:30:00.000Z"
  }
}
```

### Atualização de Dados
- **Automática**: A cada 5 minutos
- **Manual**: Botão "Atualizar" em cada aba
- **Método**: Polling (requisição HTTP)

## 🔄 Code.gs - Busca de Dados

### doGet() - Função Principal

```javascript
function doGet(e) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const abas = planilha.getSheets();
  const resultado = { cache: {}, metadados: {} };
  
  // Itera por TODAS as abas automaticamente
  for (let aba of abas) {
    const nomeAba = aba.getName();
    const dados = aba.getDataRange().getValues();
    const cabecalhos = dados.shift();
    const registros = criarRegistrosDeAba(dados, cabecalhos);
    
    resultado.cache[sanitizeKey(nomeAba)] = {
      registros: registros,
      metadados: {
        nomeOriginal: nomeAba,
        totalRegistros: registros.length
      }
    };
  }
  
  return ContentService.createTextOutput(JSON.stringify(resultado))
    .setMimeType(ContentService.MimeType.JSON);
}
```

### Características
- ✅ **Automático**: Busca TODAS as abas sem necessidade de listar
- ✅ **Flexível**: Funciona com qualquer número de abas
- ✅ **Metadados**: Inclui informações sobre cada aba
- ✅ **Sanitização**: Normaliza nomes de abas e colunas
- ✅ **IDs**: Adiciona _rowId e _rowIndex para cada registro

## 🛠️ Desenvolvimento

### Adicionar Nova Aba na Planilha
1. Crie a aba no Google Sheets
2. Nenhuma alteração necessária no código!
3. Code.gs automaticamente inclui a nova aba

### Adicionar Nova Funcionalidade
1. Verifique se os dados já estão no JSON (provavelmente sim)
2. Adicione processamento em `fetchDataFromURL()` se necessário
3. Adicione UI/visualização no dashboard

## ⚠️ Observações Importantes

### Limites do Apps Script
- **Tempo de execução**: 6 minutos por requisição
- **Tamanho de resposta**: 50 MB
- **Requisições por dia**: ~20,000 para usuários gratuitos

### Primeira Carga
- Pode ser lenta se planilha for muito grande
- Apps Script processa todas as abas
- Navegador processa e exibe dados

### Cache do Navegador
- Dados ficam em cache entre atualizações
- Evita recarregar dados desnecessariamente
- Atualiza a cada 5 minutos ou ao clicar "Atualizar"

## 🐛 Solução de Problemas

### Erro: "Firebase não inicializado"
- Verifique se `firebase-config.js` está correto
- Verifique se Firebase SDK está carregando (F12 → Network)
- Recarregue a página

### Erro: "Email ou senha inválidos"
- Verifique se o usuário existe no Firebase Console
- Verifique se a senha está correta
- Adicione usuário se necessário

### Erro: "URL do Apps Script não configurada"
- Abra `firebase-config.js`
- Verifique se `appsScriptConfig.dataURL` está preenchido
- Publique o Apps Script se ainda não foi feito

### Dados não carregam
- Abra Console (F12)
- Procure por erros em vermelho
- Verifique se Apps Script está respondendo:
  - Copie a URL do Apps Script
  - Cole no navegador diretamente
  - Deve retornar JSON

### Login funciona mas dados não aparecem
- Verifique Console (F12) para erros
- Verifique se `fetchDataFromURL()` foi chamado
- Verifique se Apps Script retornou JSON válido
- Teste URL do Apps Script diretamente

## ✅ Checklist de Verificação

### Firebase Authentication
- [ ] Firebase Console acessível
- [ ] Projeto `dashboardalunos` existe
- [ ] Authentication habilitado
- [ ] Usuários criados
- [ ] `firebase-config.js` tem configuração correta

### Apps Script
- [ ] Planilha Google Sheets acessível
- [ ] Code.gs contém código correto
- [ ] Apps Script publicado como "Aplicativo da Web"
- [ ] URL do Apps Script copiada
- [ ] URL colada em `firebase-config.js`

### Teste Completo
- [ ] Abrir `index.html`
- [ ] Tela de login aparece
- [ ] Login com email/senha funciona
- [ ] Dashboard carrega após login
- [ ] Dados aparecem corretamente
- [ ] Logout funciona
- [ ] Retorna para tela de login

## 📚 Recursos

- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)
- [Google Sheets Service](https://developers.google.com/apps-script/reference/spreadsheet)

---

✅ **Arquitetura Híbrida: Firebase Auth + Apps Script Data**  
Última atualização: 10 de Fevereiro de 2026
