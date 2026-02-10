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

### Arquivos Removidos/Renomeados
- `firebase-config.js` → `apps-script-config.js` (renomeado e simplificado)

## 🚀 Como Funciona Agora

### 1. Login Simplificado
- **Antes**: Autenticação via Firebase com email/senha
- **Agora**: Botão "Entrar" direto para o dashboard (sem autenticação)

### 2. Carregamento de Dados
- **Fonte única**: Google Apps Script doGet endpoint
- **Frequência**: Atualização automática a cada 5 minutos
- **Endpoint**: Configurado em `apps-script-config.js`

### 3. Code.gs (Apps Script)
O arquivo `scripts/Code.gs` já está configurado para:
- ✅ Buscar **TODAS as abas** da planilha automaticamente
- ✅ Retornar dados em formato JSON via doGet()
- ✅ Suportar requisições específicas por aba: `?aba=NomeAba`
- ✅ Processar formulários via doPost()

## 📁 Arquivos Principais

### apps-script-config.js
```javascript
const appsScriptConfig = {
  dataURL: "https://script.google.com/macros/s/[SEU_ID]/exec"
};
```

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
1. Abra o arquivo `apps-script-config.js`
2. Cole a URL do Apps Script no campo `dataURL`
3. Salve o arquivo

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
apps-script-config.js (URL)
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
- Verifique se `apps-script-config.js` tem a URL correta
- A URL deve terminar com `/exec`

### Erro: "Erro ao carregar dados"
- Verifique se o Apps Script está publicado corretamente
- Verifique se "Quem pode acessar" está configurado como "Qualquer pessoa"
- Verifique o Console do navegador (F12) para detalhes

### Dados não aparecem
- Abra o Console (F12)
- Procure por mensagens com `[fetchDataFromURL]`
- Verifique se o JSON está sendo retornado corretamente
- Teste a URL diretamente no navegador

## 📝 Próximos Passos (Opcional)

Se precisar adicionar autenticação no futuro:
1. **Simples**: Adicionar senha no Apps Script (verificar na requisição)
2. **Básico**: Implementar sistema de tokens/senhas customizado
3. **Completo**: Reintegrar Firebase Auth (mas mantendo dados no Apps Script)

## ✅ Checklist de Verificação

- [ ] Apps Script publicado como "Aplicativo da Web"
- [ ] URL do Apps Script copiada para `apps-script-config.js`
- [ ] Arquivo `apps-script-config.js` salvo
- [ ] Dashboard abre sem erros no Console
- [ ] Botão "Entrar" funciona
- [ ] Dados aparecem no dashboard
- [ ] Abas diferentes (Alunos, Ausências, etc) mostram dados corretos
