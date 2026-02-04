# Login Google com Restrição de Domínio

## Visão Geral

Este documento descreve a implementação do login com Google no Portal do Ensino, com restrição ao domínio institucional **@hc.fm.usp.br**.

## Funcionalidade Implementada

### Validação de Domínio

O sistema implementa uma validação em **duas camadas**:

1. **Dica para o Google (parâmetro `hd`)**: Sugere ao seletor de contas do Google que priorize contas do domínio `hc.fm.usp.br`
2. **Validação no Cliente**: Após o login bem-sucedido, o sistema valida o domínio do email do usuário e rejeita domínios não autorizados

### Fluxos de Login

#### Login com Email/Senha
- **Mantido sem alterações**: O fluxo de autenticação via email e senha continua funcionando normalmente
- Não há validação de domínio para este método (configurado no Firebase Authentication)

#### Login com Google
1. Usuário clica no botão "Entrar com Google"
2. Sistema abre popup de autenticação do Google
3. Parâmetro `hd: 'hc.fm.usp.br'` sugere ao Google que mostre contas deste domínio
4. Usuário seleciona conta e autoriza
5. **Validação do domínio**:
   - ✅ Se domínio = `hc.fm.usp.br` → Login bem-sucedido, redireciona para o dashboard
   - ❌ Se domínio ≠ `hc.fm.usp.br` → Usuário é deslogado imediatamente com mensagem de erro

### Validação no onAuthStateChanged

Além da validação no momento do login, o sistema também verifica o domínio sempre que o estado de autenticação muda:

```javascript
window.firebase.onAuthStateChanged(fbAuth, (user) => {
    if (!user) {
        // Usuário não autenticado - mostrar tela de login
        showView('login-view');
        return;
    }
    
    // Validar domínio do usuário
    const domain = getEmailDomain(user.email);
    if (domain !== ALLOWED_DOMAIN) {
        // Domínio não permitido - deslogar e mostrar erro
        showError(`Domínio não permitido. Use uma conta @${ALLOWED_DOMAIN}.`, true);
        window.firebase.signOut(fbAuth);
        return;
    }
    
    // Usuário válido - mostrar dashboard
    showView('dashboard-view');
    initDashboard();
});
```

## Tratamento de Erros

O sistema fornece mensagens amigáveis para diferentes cenários:

| Erro | Mensagem ao Usuário |
|------|---------------------|
| Domínio não permitido | "Domínio não permitido. Use uma conta @hc.fm.usp.br." |
| Popup bloqueado | "Popup bloqueado. Permita popups e tente novamente." |
| Login cancelado | "Login cancelado. Tente novamente." |
| Falha de rede | "Falha de rede. Verifique sua conexão." |
| Firebase não inicializado | "Firebase não inicializado. Recarregue a página." |

## Configuração no Firebase Console

### Requisitos Obrigatórios

1. **Ativar Google como Provedor de Autenticação**
   - Acesse: Firebase Console → Authentication → Sign-in method
   - Ative o provedor "Google"
   - Configure o email de suporte do projeto

2. **Adicionar Domínio às Authorized Domains**
   - Acesse: Firebase Console → Authentication → Settings → Authorized domains
   - Adicione o domínio onde o dashboard está hospedado
   - Exemplo: `dashboardalunos.firebaseapp.com` ou seu domínio customizado

3. **Regras de Segurança (Opcional mas Recomendado)**
   ```json
   {
     "rules": {
       ".read": "auth != null && auth.token.email.endsWith('@hc.fm.usp.br')",
       ".write": "auth != null && auth.token.email.endsWith('@hc.fm.usp.br')"
     }
   }
   ```
   Estas regras garantem que mesmo se alguém burlar a validação do cliente, não terá acesso aos dados.

### Configuração Avançada (Opcional)

Para enforcement completo no servidor (requer plano Blaze), você pode usar **Blocking Functions**:

```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');

exports.beforeSignIn = functions.auth.user().beforeSignIn((user, context) => {
  const allowedDomain = 'hc.fm.usp.br';
  const email = user.email;
  
  if (!email || !email.endsWith(`@${allowedDomain}`)) {
    throw new functions.auth.HttpsError(
      'permission-denied',
      `Apenas contas do domínio @${allowedDomain} são permitidas.`
    );
  }
});
```

**Vantagens das Blocking Functions:**
- Enforcement no servidor (não pode ser burlado)
- Bloqueia autenticação antes de criar a sessão
- Funciona para todos os métodos de login (Google, email/senha, etc.)

**Limitações:**
- Requer plano Blaze (pago)
- Precisa deploy de Cloud Functions

## Limitações da Validação no Cliente

⚠️ **Importante**: A validação implementada é **no cliente** (navegador do usuário).

### Por que apenas no cliente?

- **Simplicidade**: Não requer configuração adicional no Firebase
- **Sem custos**: Funciona no plano gratuito (Spark)
- **Suficiente para a maioria dos casos**: Usuários não têm motivação para burlar o sistema

### Quando usar Blocking Functions?

Use enforcement no servidor se:
- Dados são extremamente sensíveis
- Há risco de acesso não autorizado intencional
- Compliance regulatório exige controle de acesso no servidor
- Orçamento permite plano Blaze

## Testes e Validação

### Cenários de Teste

✅ **Teste 1**: Login com conta válida (@hc.fm.usp.br)
- **Esperado**: Login bem-sucedido, redirecionamento para dashboard

❌ **Teste 2**: Login com conta de outro domínio (@gmail.com, @usp.br, etc.)
- **Esperado**: Login rejeitado, mensagem de erro, permanece na tela de login

🚫 **Teste 3**: Popup bloqueado pelo navegador
- **Esperado**: Mensagem amigável instruindo a permitir popups

📡 **Teste 4**: Sem conexão de rede
- **Esperado**: Mensagem de falha de rede

🔄 **Teste 5**: Logout e novo login
- **Esperado**: Retorno à tela de login, novo login funciona normalmente

### Logs de Debug

O sistema registra logs detalhados no console do navegador:

```
[handleGoogleLogin] Iniciando login com Google...
[handleGoogleLogin] Login com Google bem-sucedido: usuario@hc.fm.usp.br
[onAuthStateChanged] Usuário autenticado: usuario@hc.fm.usp.br
[onAuthStateChanged] Domínio válido. Mostrando dashboard.
```

Ou em caso de erro:
```
[handleGoogleLogin] Domínio não permitido: gmail.com
[handleGoogleLogin] Erro no login com Google: Error: Domínio não permitido...
```

## Manutenção e Suporte

### Alterando o Domínio Permitido

Para alterar o domínio permitido, edite a constante em `script.js`:

```javascript
const ALLOWED_DOMAIN = 'novo-dominio.com';
```

### Permitindo Múltiplos Domínios

Para permitir múltiplos domínios, modifique a validação:

```javascript
const ALLOWED_DOMAINS = ['hc.fm.usp.br', 'fm.usp.br', 'usp.br'];

function isAllowedDomain(email) {
    const domain = getEmailDomain(email);
    return ALLOWED_DOMAINS.includes(domain);
}
```

## Referências

- [Firebase Authentication - Google](https://firebase.google.com/docs/auth/web/google-signin)
- [Blocking Functions](https://firebase.google.com/docs/auth/extend-with-blocking-functions)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [Google Sign-In Brand Guidelines](https://developers.google.com/identity/branding-guidelines)

## Histórico de Alterações

| Data | Versão | Descrição |
|------|--------|-----------|
| 2026-02-04 | 1.0 | Implementação inicial com validação de domínio no cliente |
