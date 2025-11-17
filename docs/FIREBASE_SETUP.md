# Firebase Setup Guide

Este guia explica como configurar o Firebase Authentication e Realtime Database para o Portal do Ensino.

## Pré-requisitos

1. Conta no Firebase (https://firebase.google.com/)
2. Projeto Firebase "dashboardalunos" já criado

## Passo 1: Obter Configuração do Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione o projeto "dashboardalunos"
3. Clique no ícone de engrenagem (⚙️) e depois em "Configurações do projeto"
4. Role até a seção "Seus apps"
5. Se não houver um app web, clique em "Adicionar app" e selecione "Web"
6. Copie o objeto `firebaseConfig`

## Passo 2: Atualizar firebase-config.js

Abra o arquivo `firebase-config.js` e substitua os valores de placeholder:

```javascript
const firebaseConfig = {
  apiKey: "SUA_API_KEY_AQUI",
  authDomain: "dashboardalunos.firebaseapp.com",
  databaseURL: "https://dashboardalunos-default-rtdb.firebaseio.com",
  projectId: "dashboardalunos",
  storageBucket: "dashboardalunos.firebasestorage.app",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
};
```

## Passo 3: Configurar Firebase Authentication

1. No Firebase Console, vá para "Authentication"
2. Clique em "Get Started" (se for a primeira vez)
3. Na aba "Sign-in method", ative o provedor "Email/Password"
4. Clique em "Save"

## Passo 4: Criar Usuários

Na seção "Users" do Authentication, adicione os usuários que terão acesso ao sistema:

1. Clique em "Add user"
2. Digite o email (ex: usuario@hc.fm.usp.br)
3. Digite a senha
4. Clique em "Add user"

**Importante**: Migre os usuários existentes do arquivo `users.json` para o Firebase Authentication.

## Passo 5: Configurar Regras do Realtime Database

As regras de segurança já estão configuradas em `database.rules.json`:

```json
{
  "rules": {
    "exportAll": {
      ".read": "auth != null",
      ".write": "auth.uid === 'dashboard-thiago-230425'"
    }
  }
}
```

Estas regras garantem que:
- Apenas usuários autenticados podem ler os dados
- Apenas o script do Google Apps Script pode escrever dados (via auth token)

Para aplicar as regras:

```bash
firebase deploy --only database
```

Ou configure manualmente no Firebase Console:
1. Vá para "Realtime Database"
2. Clique na aba "Rules"
3. Cole o conteúdo do arquivo `database.rules.json`
4. Clique em "Publish"

## Passo 6: Verificar Estrutura de Dados

O Google Apps Script (`CodeFirebase.gs`) já está configurado para exportar dados para o Firebase Realtime Database no caminho `/exportAll`.

A estrutura esperada é:

```
/exportAll
  /Alunos
    /dados: [array de alunos]
  /AusenciasReposicoes
    /dados: [array de ausências]
  /NotasTeoricas
    /dados: [array de notas teóricas]
  /Ponto
    /dados: [array de registros de ponto]
  /Escala1
    /dados: [array de dados da escala]
  /Escala2
    /dados: [array de dados da escala]
  ... (outras escalas)
  ... (abas de notas práticas: NP_*, etc.)
```

## Passo 7: Testar a Aplicação

1. Abra o arquivo `index.html` em um navegador
2. Você verá a tela de login
3. Digite as credenciais de um usuário criado no Firebase Authentication
4. Se tudo estiver correto, você será redirecionado para o dashboard

## Fluxo da Aplicação

1. **Carregamento**: O usuário acessa a página
2. **Verificação de Autenticação**: `onAuthStateChanged` verifica se há um usuário logado
3. **Login**: Se não logado, mostra tela de login
4. **Autenticação**: `signInWithEmailAndPassword` valida as credenciais
5. **Dashboard**: Após login, `setupDatabaseListeners()` estabelece listeners em tempo real
6. **Dados em Tempo Real**: A UI é atualizada automaticamente quando os dados mudam no Firebase
7. **Logout**: `signOut()` encerra a sessão e limpa os listeners

## Solução de Problemas

### Erro: "Firebase não inicializado"
- Verifique se o arquivo `firebase-config.js` está configurado corretamente
- Verifique o console do navegador para erros de carregamento

### Erro: "User not found" ou "Wrong password"
- Verifique se o usuário foi criado no Firebase Authentication
- Verifique se o email e senha estão corretos

### Erro: "Permission denied"
- Verifique se as regras do Realtime Database estão configuradas corretamente
- Verifique se o usuário está autenticado antes de tentar acessar os dados

### Dados não aparecem no dashboard
- Verifique se o Google Apps Script está exportando dados para o Firebase
- Verifique a estrutura de dados no Firebase Console
- Verifique o console do navegador para erros nos listeners

## Segurança

⚠️ **IMPORTANTE**: 
- Nunca commite o arquivo `firebase-config.js` com as credenciais reais em repositórios públicos
- Use variáveis de ambiente ou arquivos de configuração privados em produção
- As regras do Realtime Database devem ser ajustadas conforme necessário para seu caso de uso

## Suporte

Para mais informações sobre Firebase:
- [Documentação Firebase Authentication](https://firebase.google.com/docs/auth)
- [Documentação Realtime Database](https://firebase.google.com/docs/database)
