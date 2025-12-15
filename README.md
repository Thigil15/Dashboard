# 🎓 Portal do Ensino - Dashboard de Alunos

Dashboard interativo para gerenciamento de alunos, notas, faltas e escalas do programa de ensino de fisioterapia.

## ✨ Status Atual

✅ **Sistema 100% funcional e integrado com Firebase!**

O site está **completamente configurado** para ler dados do Firebase Realtime Database em tempo real.

---

## 🚀 Como Usar

### Início Rápido (5 minutos)

1. **Abra o arquivo de teste**
   ```
   Abra: tests/test-firebase-connection.html
   ```

2. **Execute os testes**
   - Clique em "Executar Testes"
   - Veja se todos ficam verdes ✅

3. **Configure usuários** (se ainda não tiver)
   - Acesse: https://console.firebase.google.com/
   - Projeto: dashboardalunos
   - Authentication → Users → Add user

4. **Acesse o site**
   ```
   Abra: index.html
   Faça login com as credenciais do Firebase
   ```

---

## 📚 Documentação

### Para Usuários

- **[VERIFICACAO_RAPIDA.md](./docs/VERIFICACAO_RAPIDA.md)** ⚡
  - Checklist rápido
  - Teste de 3 minutos
  - Problemas comuns

- **[COMO_FUNCIONA_FIREBASE.md](./docs/COMO_FUNCIONA_FIREBASE.md)** 📖
  - Explicação completa
  - Como o sistema funciona
  - Perguntas frequentes

- **[QUICK_START.md](./docs/QUICK_START.md)** 🏁
  - Setup em 5 minutos
  - Para quem quer começar rápido

### Para Desenvolvedores

- **[FIREBASE_SETUP.md](./docs/FIREBASE_SETUP.md)** ⚙️
  - Configuração detalhada
  - Troubleshooting avançado
  - Regras de segurança

- **[MIGRATION_SUMMARY.md](./docs/MIGRATION_SUMMARY.md)** 🔄
  - Detalhes técnicos
  - Arquitetura do sistema
  - Comparação antes/depois

---

## 🏗️ Arquitetura

### Stack Tecnológico

- **Frontend**: HTML5, CSS3, JavaScript (ES6 Modules)
- **Autenticação**: Firebase Authentication
- **Banco de Dados**: Firebase Realtime Database
- **Exportação de Dados**: Google Apps Script
- **UI Framework**: Tailwind CSS (CDN)

### Estrutura de Arquivos

```
Dashboard/
├── 📁 .github/                    # Configurações e workflows do GitHub
├── 📁 docs/                       # Documentação completa (40 arquivos)
│   ├── LOGIN_FORENSIC_ANALYSIS.md # Análise do fix do login
│   ├── LOGIN_FIX_DOCUMENTATION.md # Documentação técnica do login
│   ├── VERIFICACAO_RAPIDA.md      # Checklist rápido
│   ├── COMO_FUNCIONA_FIREBASE.md  # Guia Firebase
│   └── ... (outros 36 documentos)
├── 📁 scripts/                    # Google Apps Script (arquivo único)
│   └── Code.gs                    # Script unificado (exportação, ponto, escalas, ausências)
├── 📁 tests/                      # Testes e validações (9 arquivos)
│   ├── test-firebase-connection.html
│   ├── test-login-system.html
│   ├── test-data-fields.html
│   └── ... (outros 6 testes)
│
├── 🏠 index.html                  # Página principal do dashboard
├── ⚙️ script.js                   # Lógica da aplicação (235KB)
├── 🎨 style.css                   # Estilos customizados (130KB)
├── 🔥 firebase-config.js          # Configuração do Firebase
├── 📦 package.json                # Dependências do projeto
├── 📦 package-lock.json           # Lock file das dependências
├── 📖 README.md                   # Este arquivo
└── 🚫 .gitignore                  # Arquivos ignorados pelo Git
```

---

## 🔥 Firebase Integration

### Configuração

O site está configurado para ler de:
```
URL: https://dashboardalunos-default-rtdb.firebaseio.com/
```

### Estrutura de Dados

```
/exportAll
  /Alunos
    /dados: [array de alunos]
  /NotasTeoricas
    /dados: [array de notas]
  /AusenciasReposicoes
    /dados: [array de faltas]
  /Ponto
    /dados: [array de registros de ponto]
  /Escala1
    /dados: [dados da escala 1]
  /Escala2
    /dados: [dados da escala 2]
  /NP_ModuloX
    /dados: [notas práticas do módulo X]
```

### Listeners em Tempo Real

O sistema usa listeners que atualizam automaticamente quando os dados mudam:

```javascript
// Configurado automaticamente ao fazer login
setupDatabaseListeners() {
  // Escuta mudanças em todas as abas
  // Atualiza a UI automaticamente
  // Sem necessidade de refresh!
}
```

---

## 🔐 Segurança

### Autenticação

- ✅ Firebase Authentication (Email/Password)
- ✅ Senhas criptografadas
- ✅ Sessões gerenciadas automaticamente
- ✅ Logout apropriado com cleanup

### Regras de Database

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

- **Leitura**: Somente usuários autenticados
- **Escrita**: Somente o App Script autorizado

---

## 🧪 Testes

### Teste Automático

```bash
# Abra no navegador:
tests/test-firebase-connection.html
```

Verifica:
- ✅ SDK carregado
- ✅ Configuração válida
- ✅ Conexão estabelecida
- ✅ Dados existem
- ✅ Estrutura correta

### Teste Manual

1. Abra `index.html`
2. Faça login
3. Navegue pelas abas:
   - Dashboard (KPIs, gráficos)
   - Alunos (lista, detalhes)
   - Ponto (registros de frequência)
   - Escala (visualização de escalas)
4. Verifique se os dados aparecem

---

## 🎯 Funcionalidades

### Dashboard Principal
- 📊 KPIs em tempo real
- 📈 Gráficos de médias por módulo
- 🎓 Distribuição por curso
- 📝 Registros recentes

### Gestão de Alunos
- 👥 Lista completa de alunos
- 🔍 Busca por nome
- 📋 Detalhes individuais
- 📊 Histórico completo

### Notas
- 📚 Notas teóricas por módulo
- 🏥 Notas práticas detalhadas
- 📈 Análise de competências
- 💬 Comentários de supervisores
- ✨ Análise IA com Gemini

### Ponto e Escalas
- ⏰ Registro de frequência
- 📅 Visualização por data
- 👥 Filtros por escala
- 📊 Estatísticas de presença

### Ausências e Reposições
- 📋 Lista de faltas
- ✅ Status de reposições
- 📊 Contador de pendências
- 📅 Datas e motivos

---

## ⚙️ Configuração

### Pré-requisitos

1. **Firebase Project**
   - Projeto: dashboardalunos
   - Realtime Database ativado
   - Authentication habilitado

2. **Google Apps Script**
   - Script configurado para exportar dados
   - Autorização para escrever no Firebase

3. **Usuários**
   - Pelo menos um usuário no Firebase Authentication

### Setup

1. **Clone o repositório** (ou baixe os arquivos)

2. **Configure Firebase** (se ainda não estiver)
   ```
   Veja: docs/FIREBASE_SETUP.md
   ```

3. **Crie usuários**
   ```
   Firebase Console → Authentication → Add user
   ```

4. **Execute o App Script**
   ```
   Para enviar dados para Firebase
   ```

5. **Abra o site**
   ```
   Abra index.html no navegador
   ```

---

## 🐛 Troubleshooting

### Problema: Não consigo fazer login

**Solução**: Verifique se o usuário existe no Firebase Authentication

```
1. Firebase Console → Authentication → Users
2. Se não existir, clique em "Add user"
3. Crie com email e senha
4. Tente login novamente
```

### Problema: Dados não aparecem

**Solução A**: App Script não rodou

```
1. Abra o Google Apps Script
2. Execute a função de exportação
3. Aguarde alguns segundos
4. Recarregue o site
```

**Solução B**: Estrutura errada no Firebase

```
1. Firebase Console → Realtime Database
2. Verifique se existe /exportAll
3. Verifique se tem /Alunos/dados dentro
4. Se não, ajuste o App Script
```

### Problema: "Firebase não inicializado"

**Solução**: Verifique firebase-config.js

```javascript
// Deve ter valores reais, não placeholders
const firebaseConfig = {
  apiKey: "valor_real_aqui",
  // ... outros campos
};
```

### Mais Problemas?

- 📖 Leia: [VERIFICACAO_RAPIDA.md](./docs/VERIFICACAO_RAPIDA.md)
- 🔧 Veja: [FIREBASE_SETUP.md](./docs/FIREBASE_SETUP.md)
- 🧪 Execute: `tests/test-firebase-connection.html`
- 💻 Abra o Console (F12) e veja os erros

---

## 🤝 Contribuindo

### Para Desenvolvedores

1. **Entenda a arquitetura**
   ```
   Leia: docs/MIGRATION_SUMMARY.md
   ```

2. **Configure seu ambiente**
   ```
   Leia: docs/FIREBASE_SETUP.md
   ```

3. **Teste suas mudanças**
   ```
   Use: tests/test-firebase-connection.html
   ```

4. **Siga as convenções**
   - Código comentado em português
   - Funções documentadas
   - Testes para novas features

---

## 📝 Changelog

### v32.7 (Atual)
- ✅ Integração completa com Firebase
- ✅ Listeners em tempo real
- ✅ Autenticação Firebase
- ✅ Logout apropriado
- ✅ Documentação completa
- ✅ Ferramenta de teste

### v32.0 - 32.6
- Firebase migration
- Real-time updates
- Security improvements
- UI enhancements
- Bug fixes

---

## 📞 Suporte

### Documentação
- [VERIFICACAO_RAPIDA.md](./docs/VERIFICACAO_RAPIDA.md) - Checklist rápido
- [COMO_FUNCIONA_FIREBASE.md](./docs/COMO_FUNCIONA_FIREBASE.md) - Guia completo
- [FIREBASE_SETUP.md](./docs/FIREBASE_SETUP.md) - Setup detalhado

### Ferramentas
- `tests/test-firebase-connection.html` - Teste automático

### Console do Navegador
- Pressione F12
- Veja mensagens de log
- Verifique erros em vermelho

---

## 📄 Licença

Este é um projeto interno do programa de ensino de fisioterapia.

---

## 🌟 Créditos

**Desenvolvido para**: Ensino Fisio INCOR  
**Tecnologias**: Firebase, Google Apps Script, JavaScript  
**Versão**: 32.7  
**Status**: ✅ Produção

---

## 🎉 Pronto para Usar!

O sistema está **100% funcional** e configurado.

### Próximos Passos:

1. ✅ Execute o teste: `tests/test-firebase-connection.html`
2. ✅ Configure usuários no Firebase (se necessário)
3. ✅ Rode o App Script para enviar dados
4. ✅ Faça login e aproveite!

**Qualquer dúvida, consulte a documentação acima! 📚**

---

*Última atualização: 2025-11-13*  
*Sistema integrado com Firebase Realtime Database*  
*URL: https://dashboardalunos-default-rtdb.firebaseio.com/*
