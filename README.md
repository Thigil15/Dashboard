# 🎓 Portal do Ensino - Dashboard de Alunos

Dashboard interativo para gerenciamento de alunos, notas, faltas e escalas do programa de ensino de fisioterapia.

## ✨ Status Atual

✅ **Sistema 100% funcional e integrado com Google Apps Script!**

O site está **completamente configurado** para ler dados do Google Sheets através do Apps Script em tempo real, com atualização automática a cada 5 minutos.

---

## 🚀 Como Usar

### Início Rápido (2 minutos)

1. **Configure a URL do Apps Script** (se ainda não configurou)
   - Abra: `firebase-config.js`
   - A URL já está configurada: https://script.google.com/macros/s/AKfycbx6x-I0PCc1Ym8vx7VYyXmwvx3mY-9i3P16z6-5sJB2v728SlzENKnwy-4uAIHIiDLxGg/exec

2. **Configure usuários no Firebase** (apenas para login)
   - Acesse: https://console.firebase.google.com/
   - Projeto: dashboardalunos
   - Authentication → Users → Add user

3. **Acesse o site**
   ```
   Abra: index.html
   Faça login com as credenciais do Firebase
   ```

---

## 🏗️ Arquitetura

```
Google Sheets (Apps Script)
    ↓
    Gera JSON
    ↓
Website (fetch a cada 5 minutos) ⚡
    ↓
Firebase Auth (apenas login) 🔒
```

**Nota:** Firebase é usado APENAS para autenticação (login). Todos os dados vêm do Google Apps Script.

---

## 📚 Documentação

**📖 [Acesse a documentação completa](docs/INDICE.md)**

Toda a documentação do projeto está organizada na pasta `docs/` com as seguintes categorias:

- **[Guias de Usuário](docs/guias-usuario/)** - Manuais e guias para usuários finais
- **[Arquitetura](docs/arquitetura/)** - Documentação técnica e arquitetura do sistema
- **[Correções](docs/correcoes/)** - Histórico de correções e fixes
- **[Refatoração](docs/refatoracao/)** - Documentação de refatorações de código
- **[Resumos](docs/resumos/)** - Resumos executivos e relatórios
- **[Deploy](docs/deploy/)** - Guias de deploy e troubleshooting

### Documentos Principais

### ⚡ Início Rápido

- **[CONFIGURAR_FIREBASE.md](./CONFIGURAR_FIREBASE.md)** 🔥 **COMECE AQUI!**
  - Resolver erro "Invalid token in path"
  - Configurar regras do Firebase (5 minutos)
  - Habilitar tempo real

- **[FIREBASE_REALTIME_SETUP.md](./FIREBASE_REALTIME_SETUP.md)** 📖
  - Documentação técnica completa
  - Arquitetura do sistema
  - Troubleshooting detalhado

### Para Usuários

- **[VERIFICACAO_RAPIDA.md](./docs/VERIFICACAO_RAPIDA.md)** ⚡
  - Checklist rápido
  - Teste de 3 minutos
  - Problemas comuns

- **[TROUBLESHOOTING_FIREBASE.md](./docs/TROUBLESHOOTING_FIREBASE.md)** 🔧
  - Resolver erros de conexão
  - Mensagens de erro e soluções
  - Guia passo a passo

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

### ⚡ Teste Rápido de Apps Script

**Página de Diagnóstico:**
```bash
# Abra no navegador:
tests/test-appscript-url.html
```

Esta página testa:
- ✅ URL configurada corretamente
- ✅ Conexão HTTP bem-sucedida
- ✅ Headers HTTP válidos
- ✅ JSON válido retornado
- ✅ Estrutura de dados correta
- ✅ Dados de alunos presentes

**Resultado esperado:** Todos os testes devem passar ✅

### 🔬 Smoke Test Manual (Teste Completo)

Execute estes passos para validar a instalação completa:

#### 1. Verificar Configuração
```bash
# Abra firebase-config.js e verifique:
✓ appsScriptConfig.dataURL está preenchido
✓ URL termina com /exec
✓ Não contém placeholders como YOUR_DEPLOYMENT_ID
```

#### 2. Testar Servidor Local
```bash
# Opção A: Live Server (VS Code)
# Clique com botão direito em index.html → "Open with Live Server"

# Opção B: Python HTTP Server
python -m http.server 8000
# Acesse: http://localhost:8000

# Opção C: Node.js HTTP Server
npx http-server -p 8000
```

**⚠️ IMPORTANTE:** Não abra via `file://` - use sempre um servidor HTTP local para evitar problemas de CORS.

#### 3. Verificar URL do Apps Script
```bash
# Teste a URL diretamente no navegador:
# Cole a URL do appsScriptConfig.dataURL no navegador

✓ Deve retornar JSON (não HTML)
✓ JSON deve ter estrutura: { cache: {...}, metadados: {...} }
✓ cache deve conter abas como: Alunos, Ausencias, etc.
```

#### 4. Testar Login e Carregamento
```bash
1. Abra http://localhost:8000 no navegador
2. Abra o Console do navegador (F12 → Console)
3. Faça login com credenciais do Firebase
4. Observe o console:
   ✓ Deve mostrar: "[fetchDataFromURL] ✅ Dados recebidos"
   ✓ Deve mostrar: "[fetchDataFromURL] ✅ Alunos carregados: N registros"
   ✓ NÃO deve mostrar erros em vermelho
```

#### 5. Verificar `window.firebase.appsScriptConfig`
```bash
# No Console do navegador (após login):
console.log(window.firebase.appsScriptConfig.dataURL)

✓ Deve retornar a URL configurada
✓ Se retornar undefined, há problema no carregamento da configuração
```

#### 6. Verificar Network Tab
```bash
1. Abra DevTools (F12) → Network tab
2. Recarregue a página
3. Procure por requisição para script.google.com
   ✓ Status deve ser 200 OK
   ✓ Type deve ser fetch ou xhr
   ✓ Response deve ser JSON (não HTML)
   ✓ Preview deve mostrar { cache: {...} }
```

#### 7. Testar Funcionalidades
```bash
# Após login bem-sucedido:
✓ Dashboard mostra KPIs e gráficos
✓ Aba Alunos mostra lista de estudantes
✓ Aba Ponto mostra registros de frequência
✓ Aba Escala mostra escalas mensais
✓ Dados carregam em menos de 5 segundos
```

### ❌ Troubleshooting - Problemas Comuns

| Problema | Causa Provável | Solução |
|----------|----------------|---------|
| "URL do Apps Script não configurada" | URL vazia ou com placeholder | Configure `appsScriptConfig.dataURL` em `firebase-config.js` |
| "Failed to fetch" | Usando file:// ou bloqueio CORS | Use servidor HTTP local (Live Server, Python, etc) |
| JSON parseado como HTML | URL incorreta ou deployment inativo | Verifique URL e status do deployment no Apps Script |
| Erro 403 Forbidden | Permissões do Apps Script | Configure deployment como "Qualquer pessoa" pode acessar |
| Erro 404 Not Found | URL incorreta ou deployment deletado | Verifique se a URL está correta |
| `window.firebase.appsScriptConfig` undefined | Configuração não carregou | Verifique se `firebase-config.js` exporta `appsScriptConfig` |

### Teste Automático (Legacy)

```bash
# Teste antigo de conexão Firebase:
tests/test-firebase-connection.html
```

**NOTA:** Este teste verifica Firebase Realtime Database, que não é mais usado para dados (apenas Auth).

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
