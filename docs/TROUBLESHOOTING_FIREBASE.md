# 🔧 Troubleshooting Firebase Connection Issues

Este guia ajuda a resolver problemas comuns de conexão com o Firebase Realtime Database.

## Erro: "Não foi possível carregar os dados do Firebase"

### Possíveis Causas e Soluções

#### 1. ❌ Dados Não Foram Exportados para o Firebase

**Mensagem de Erro:**
```
Os dados não foram encontrados no Firebase. Por favor, execute o Google Apps Script para exportar os dados da planilha para o Firebase.
```

**Solução:**
1. Abra sua planilha do Google Sheets
2. Vá em **Extensões** → **Apps Script**
3. Execute a função de exportação (geralmente chamada `exportToFirebase` ou `sendAllToFirebase`)
4. Aguarde a conclusão da execução
5. Recarregue o Dashboard

**Como Verificar:**
- Acesse o Firebase Console: https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/data
- Verifique se existe o caminho `/exportAll` com dados dentro

---

#### 2. 🔒 Regras do Firebase Estão Bloqueando a Leitura

**Mensagem de Erro:**
```
Os dados do Firebase não puderam ser carregados. Possíveis causas: (1) Regras do Firebase bloqueando leitura...
```

**Solução:**
1. Acesse o Firebase Console: https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/rules
2. Verifique as regras de segurança. Para desenvolvimento, você pode usar:
   ```json
   {
     "rules": {
       ".read": "auth != null",
       ".write": "auth != null"
     }
   }
   ```
3. Clique em **Publicar** para aplicar as regras
4. **Importante:** Para produção, configure regras mais restritivas!

**Regras Recomendadas para Produção:**
```json
{
  "rules": {
    "exportAll": {
      ".read": "auth != null",
      ".write": false
    }
  }
}
```

---

#### 3. 🌐 Problema de Conexão com Internet

**Mensagem de Erro:**
```
Erro de Conexão: Não foi possível estabelecer conexão com Firebase. Verifique sua conexão com a internet e tente novamente.
```

**Solução:**
1. Verifique sua conexão com a internet
2. Tente acessar outro site para confirmar conectividade
3. Verifique se o firewall não está bloqueando conexões ao Firebase
4. Tente em outra rede (ex: rede móvel)
5. Recarregue a página

---

#### 4. 🔑 Usuário Não Está Autenticado

**Mensagem de Erro:**
```
Você não está autenticado
```

**Solução:**
1. Faça logout e login novamente
2. Verifique se o usuário está cadastrado no Firebase Authentication:
   - Acesse: https://console.firebase.google.com/project/dashboardalunos/authentication/users
   - Certifique-se que o Email/Password authentication está habilitado
3. Se necessário, crie um novo usuário no Firebase Console

---

## 🧪 Teste de Conexão

Use o arquivo de teste incluído para diagnosticar problemas:

1. Abra o arquivo: `tests/test-firebase-connection.html`
2. Clique em "Executar Testes"
3. Verifique quais testes passam (✅) e quais falham (❌)

Os testes verificam:
- ✅ Firebase SDK carregado
- ✅ Configuração válida
- ✅ Inicialização do Firebase
- ✅ Conexão com Realtime Database
- ✅ Estrutura /exportAll existe
- ✅ Dados de Alunos disponíveis

---

## 🔍 Como Verificar os Logs no Console

1. Abra o Dashboard no navegador
2. Pressione **F12** para abrir as Ferramentas do Desenvolvedor
3. Vá para a aba **Console**
4. Procure por mensagens que começam com:
   - `[checkFirebaseConnection]` - Status da conexão
   - `[initDashboard]` - Inicialização do dashboard
   - `[setupDatabaseListeners]` - Carregamento de dados

---

## 📞 Ainda com Problemas?

Se nenhuma das soluções acima funcionou:

1. **Capture as mensagens do console:**
   - Abra o Console (F12)
   - Copie todas as mensagens de erro
   
2. **Verifique a configuração:**
   - Arquivo: `firebase-config.js`
   - Confirme que o `databaseURL` está correto
   
3. **Teste a conexão diretamente:**
   - Use o arquivo `tests/test-firebase-connection.html`
   - Anote quais testes falharam

4. **Verifique o Firebase Console:**
   - Authentication: https://console.firebase.google.com/project/dashboardalunos/authentication/users
   - Database: https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/data
   - Rules: https://console.firebase.google.com/project/dashboardalunos/database/dashboardalunos-default-rtdb/rules

---

## ✅ Checklist de Verificação Rápida

- [ ] Internet funcionando?
- [ ] Usuário cadastrado no Firebase Authentication?
- [ ] Login realizado com sucesso?
- [ ] Dados existem em `/exportAll` no Firebase?
- [ ] Regras do Firebase permitem leitura para usuários autenticados?
- [ ] Google Apps Script foi executado para exportar dados?

Se todos os itens estão marcados e ainda há erro, verifique os logs no console do navegador (F12).
