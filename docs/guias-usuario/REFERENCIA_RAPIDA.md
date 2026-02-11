# Referência Rápida - Sistema Híbrido

## 🎯 O Que Foi Implementado

Sistema híbrido com:
- **Firebase Authentication**: Para login com email/senha
- **Apps Script**: Para carregar TODOS os dados da planilha

## 🔐 Login

### Como Funciona
1. Usuário abre `index.html`
2. Digite email e senha (cadastrados no Firebase)
3. Firebase valida as credenciais
4. Se aprovado, dashboard carrega automaticamente
5. Dados são buscados do Apps Script

### Adicionar Usuário
```
Firebase Console → Authentication → Users → Add User
```

## 📊 Dados

### Origem
- **100% Apps Script**: Todos os dados vêm do Google Sheets
- **Sem Firebase Database**: Firebase é usado APENAS para login

### Code.gs - Como Funciona
```javascript
function doGet(e) {
  // Busca TODAS as abas automaticamente
  const abas = planilha.getSheets();
  
  // Retorna JSON com todas as abas
  return JSON.stringify({
    cache: {
      Alunos: { registros: [...] },
      Ausencias: { registros: [...] },
      Escala1: { registros: [...] }
      // ... todas as outras abas
    }
  });
}
```

### Atualização
- **Automática**: A cada 5 minutos
- **Manual**: Botão "Atualizar" em cada aba

## 📁 Arquivos Principais

### firebase-config.js
```javascript
// Firebase - para login
const firebaseConfig = { ... };

// Apps Script - para dados
const appsScriptConfig = {
  dataURL: "https://script.google.com/..."
};
```

### index.html
- Carrega Firebase SDK (Auth)
- Carrega configurações
- Interface do usuário

### script.js
- `initializeFirebase()`: Inicializa Firebase Auth
- `handleLogin()`: Faz login com email/senha
- `onAuthStateChanged()`: Detecta quando usuário faz login
- `fetchDataFromURL()`: Busca dados do Apps Script

### scripts/Code.gs
- `doGet()`: Retorna JSON com todas as abas
- `doPost()`: Recebe dados de formulários

## ⚙️ Configuração Inicial

### 1. Firebase
```
1. Acesse Firebase Console
2. Vá em Authentication → Users
3. Adicione usuários (email/senha)
```

### 2. Apps Script
```
1. Abra planilha no Google Sheets
2. Extensões → Apps Script
3. Cole código do Code.gs
4. Implante como "Aplicativo da Web"
5. Copie a URL gerada
6. Cole em firebase-config.js
```

## 🐛 Problemas Comuns

### "Email ou senha inválidos"
→ Verifique se usuário existe no Firebase Console

### "URL do Apps Script não configurada"
→ Verifique firebase-config.js → appsScriptConfig.dataURL

### Dados não aparecem
→ Teste a URL do Apps Script diretamente no navegador
→ Deve retornar JSON

### Login funciona mas dados não carregam
→ Abra Console (F12)
→ Procure por erros em vermelho
→ Verifique se fetchDataFromURL() foi chamado

## ✅ Checklist

- [ ] Firebase Console acessível
- [ ] Usuários criados no Firebase
- [ ] Apps Script publicado
- [ ] URL do Apps Script em firebase-config.js
- [ ] Teste: login funciona
- [ ] Teste: dados aparecem
- [ ] Teste: logout funciona

## 🔄 Fluxo Simplificado

```
Login → Firebase Auth → Dashboard → Apps Script → Dados → Render
  ↓                                                            ↑
Email/Senha                                           Auto-refresh (5min)
```

## 📝 Notas Importantes

1. **Firebase é APENAS Auth**: Não armazena dados
2. **Apps Script tem TODOS os dados**: Busca todas as abas automaticamente
3. **Code.gs não precisa de mudanças**: Já busca tudo automaticamente
4. **Adicionar nova aba**: Basta criar no Sheets, Code.gs já inclui
5. **URL pública**: Apps Script URL é pública (configure acesso no Apps Script se necessário)

## 📚 Documentação Completa

- `ARQUITETURA_HIBRIDA.md`: Guia completo com todos os detalhes

## 🎉 Pronto!

Sistema configurado e funcionando com:
- ✅ Autenticação segura via Firebase
- ✅ Dados completos via Apps Script
- ✅ Atualização automática
- ✅ Fácil gerenciamento de usuários

---

**Última atualização**: 10 de Fevereiro de 2026
