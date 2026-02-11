# Sistema 100% Apps Script - Arquitetura Simplificada

## 📋 Resumo das Mudanças

O sistema Firebase foi **completamente removido** do Dashboard. Agora o sistema opera 100% através do Google Apps Script.

## ✅ O que foi Removido

### Firebase Completo
- ❌ Firebase SDK (não carrega mais scripts externos)
- ❌ Firebase Authentication (login/logout)
- ❌ Firebase Realtime Database
- ❌ Firebase Cloud Functions
- ❌ Todas as referências e comentários do Firebase

### Configuração Atualizada
- `firebase-config.js` agora contém apenas configuração do Firebase Auth e Apps Script URL
- **NOTA**: Apesar do nome, o arquivo `firebase-config.js` é mantido para compatibilidade, mas o Firebase é usado **APENAS para autenticação**

## 🚀 Como Funciona Agora

### 1. Login Simplificado
- **Antes**: Autenticação via Firebase com email/senha
- **Agora**: Botão "Entrar" direto para o dashboard (sem autenticação)

### 2. Carregamento de Dados
- **Fonte única**: Google Apps Script doGet endpoint
- **Frequência**: Atualização automática a cada 5 minutos
- **Endpoint**: Configurado em `firebase-config.js` → `appsScriptConfig.dataURL`

### 3. Code.gs (Apps Script)
O arquivo `scripts/Code.gs` já está configurado para:
- ✅ Buscar **TODAS as abas** da planilha automaticamente
- ✅ Retornar dados em formato JSON via doGet()
- ✅ Suportar requisições específicas por aba: `?aba=NomeAba`
- ✅ Processar formulários via doPost()

## 📁 Arquivos Principais

### firebase-config.js
```javascript
// Firebase configuration - Used ONLY for Authentication
const firebaseConfig = { ... };

// Apps Script URL configuration - Used for ALL data loading
const appsScriptConfig = {
  dataURL: "https://script.google.com/macros/s/[SEU_ID]/exec"
};
```

**NOTA**: Apesar do nome do arquivo, o Firebase é usado apenas para autenticação. Todos os dados vêm do Apps Script.

### index.html
- Carrega apenas a configuração do Apps Script
- Não carrega SDK do Firebase
- Dispara evento `configReady` quando pronto

### script.js
- `fetchDataFromURL()`: Busca dados do Apps Script
- `startPeriodicDataRefresh()`: Atualiza dados a cada 5 minutos
- `handleLogin()`: Entrada direta no dashboard (sem auth)
- `handleLogout()`: Volta para tela de login

## 🔧 Configuração

### Passo 1: Publicar o Apps Script
1. Abra o Google Sheets com seus dados
2. Vá em **Extensões > Apps Script**
3. Cole o código do arquivo `scripts/Code.gs`
4. Clique em **Implantar > Nova implantação**
5. Escolha **Aplicativo da Web**
6. Configure:
   - **Executar como**: Eu (sua conta)
   - **Quem pode acessar**: Qualquer pessoa
7. Clique em **Implantar**
8. Copie a URL gerada

### Passo 2: Configurar o Dashboard
1. Abra o arquivo `firebase-config.js`
2. Localize a seção `appsScriptConfig`
3. Cole a URL do Apps Script no campo `dataURL`
4. Salve o arquivo

### Passo 3: Testar
1. Abra o `index.html` no navegador
2. Clique em "Entrar"
3. Verifique se os dados aparecem no dashboard
4. Abra o Console (F12) para ver logs de carregamento

## 🔄 Fluxo de Dados

```
Google Sheets (planilha)
    ↓
Code.gs (Apps Script) - doGet()
    ↓
JSON com todas as abas
    ↓
firebase-config.js (appsScriptConfig.dataURL)
    ↓
script.js (fetchDataFromURL)
    ↓
Dashboard (interface)
```

## 📊 Estrutura do JSON Retornado

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
    "Ausencias": {
      "registros": [...],
      "metadados": {...}
    },
    "Escala1": {
      "registros": [...],
      "metadados": {...}
    }
  },
  "metadados": {
    "totalAbas": 10,
    "ultimaAtualizacao": "2026-02-10T12:00:00.000Z"
  }
}
```

## ⚠️ Observações Importantes

1. **Sem Autenticação**: O sistema não tem mais login. Qualquer pessoa com acesso ao link pode ver os dados.
2. **Atualização Manual**: Os dados são atualizados a cada 5 minutos. Use o botão "Atualizar" para forçar uma atualização.
3. **Velocidade**: Primeira carga pode ser lenta se a planilha for grande (Apps Script tem limites de tempo).
4. **Cache**: Os dados ficam em cache no navegador entre as atualizações.

## 🐛 Solução de Problemas

### Erro: "URL do Apps Script não configurada"
- Verifique se `firebase-config.js` tem a URL correta no campo `appsScriptConfig.dataURL`
- A URL deve terminar com `/exec`
- Certifique-se de que a URL não contém placeholders como `YOUR_DEPLOYMENT_ID`

### Erro: "Erro ao carregar dados"
- Verifique se o Apps Script está publicado corretamente
- Verifique se "Quem pode acessar" está configurado como "Qualquer pessoa"
- Verifique o Console do navegador (F12) para detalhes

### Dados não aparecem
- Abra o Console (F12)
- Procure por mensagens com `[fetchDataFromURL]`
- Verifique se o JSON está sendo retornado corretamente
- Teste a URL diretamente no navegador
- Use a página de diagnóstico: `tests/test-appscript-url.html`

## 📝 Próximos Passos (Opcional)

Se precisar adicionar autenticação no futuro:
1. **Simples**: Adicionar senha no Apps Script (verificar na requisição)
2. **Básico**: Implementar sistema de tokens/senhas customizado
3. **Completo**: Reintegrar Firebase Auth (mas mantendo dados no Apps Script)

## ✅ Checklist de Verificação

- [ ] Apps Script publicado como "Aplicativo da Web"
- [ ] URL do Apps Script copiada para `firebase-config.js` (campo `appsScriptConfig.dataURL`)
- [ ] Arquivo `firebase-config.js` salvo
- [ ] Dashboard abre sem erros no Console
- [ ] Botão "Entrar" funciona
- [ ] Dados aparecem no dashboard
- [ ] Abas diferentes (Alunos, Ausências, etc) mostram dados corretos
- [ ] Teste de diagnóstico em `tests/test-appscript-url.html` passa com sucesso
