# Instruções para Agentes de IA - Portal do Ensino

## Visão Geral do Projeto

Portal de gestão acadêmica para fisioterapia da HCFMUSP. Sistema integrado com Google Sheets e Google Apps Script que gerencia:
- **Dashboard de notas**: Teóricas, práticas e geral
- **Controle de ponto**: NFC integrado com validação automática
- **Gestão de alunos**: Perfis, ausências, reposições
- **Escalas de prática**: Múltiplas escalas (P1-P9) com análise agregada

## Arquitetura

### Frontend (`backend/public/`)
- **portal-v32.html**: Interface única com tabs (Dashboard, Alunos, Ponto, Escala)
- **script.js**: Lógica principal (~6k linhas) com gerenciamento de estado `appState` global
- **style.css**: Design InCor (azul #0033A0, sidebar branca, Tailwind + custom CSS)

### Backend: Fluxo de Dados Google Sheets → JSON

```
Google Sheets (Banco de Dados)
    ↓
Google Apps Script (code.gs)
    ↓ [GET request]
Portal HTML (script.js)
    ↓ [transformSheetsPayload()]
appState (estado global JavaScript)
    ↓ [render functions]
UI do Browser
```

- **Google Sheets como Banco de Dados**: Planilha com múltiplas abas (Alunos, Notas Teóricas, NP*, Escalas, Ponto, Ausências, etc.)
- **Google Apps Script** (`code.gs`): Lê dados da planilha e retorna JSON
  - Endpoint: `https://script.google.com/macros/s/AKfycbzfSL1on5MqPhoLdrgiQJFFHfMbK-UDjX_lKd8H09uk-Nxt-S1Shf-CLTm9_5GkhEAi/exec`
  - Retorna: `{ bySheet: {...}, meta: {...} }` com dados normalizados
  
- **Python NFC (`Sistema Python/nfc_to_apps_script.py`)**: 
  - Lê UIDs de cartão NFC → POST para Apps Script
  - Debounce 1.2s contra duplicatas
  - Decisão automática: entrada/saída prática + teoria (terça/quinta)

## Padrões Críticos

### Normalização de Dados (script.js)
O código trata dados de múltiplas fontes (sheets, nomes variáveis) com:
```javascript
// Procura por múltiplas variações de chave (snake_case, PascalCase, camelCase)
toPascalCaseKey(key) → normaliza → addKeyVariants(target, key, value)
// Normaliza sheet names: "Notas Teóricas" → "notastetoricas"
normalizeSheetName(name) → remover acentos, lowercase, sem espaços
```
**Implicação**: Sempre use essas funções ao adicionar novos campos de sheets!

### Data Flow
1. **Login** → validar contra `users.json` (thiago.dias, wallace.fontes)
2. **fetchAllData()** → GET API → transformSheetsPayload() → appState
3. **renderEstruturas** (renderStudentList, renderAtAGlance, etc.) → UI
4. **Event Delegation** → clicks delegados ao container pai (ex: student-list-panel → student-card)

### Sheets Esperadas
A API retorna estrutura flexível. O código busca sheets com padrões:
- **Alunos**: "Alunos" | "Lista de Alunos" | "Base Alunos"
- **Notas Teóricas**: "NotasTeoricas" | "Notas Teoricas" | "Notas Teóricas"
- **Notas Práticas**: começa com "NP" ou contém "pratica"
- **Escalas**: agregação automática de sheets P1-P9
- **Ponto**: "Ponto" | "Registros Ponto" | "Frequencia"
- **Ausências/Reposições**: "AusenciasReposicoes" | "Ausências e Reposições"

## Convenções & Gotchas

### Estado Global
- `appState.alunos`, `appState.escalas`, `appState.notasTeorica` etc.
- **NÃO modifique diretamente**; use `transformSheetsPayload()` ao carregar
- Tabs ativadas via `switchMainTab(tabName)` ou `switchStudentSubTab(tabId)`

### IDs & Atributos
- Cards de aluno: `data-student-email` (chave primária)
- Sub-abas: `data-subtab-id` (ex: "notas-pratica", "ausencias")
- Views: `#login-view`, `#dashboard-view` (display: flex/block/none)

### Datas
- Formato ISO sempre: `YYYY-MM-DD`
- `normalizeDateInput(raw)` converte para ISO
- Campos ausência/reposição: `DataAusenciaISO`, `DataReposicaoISO`

### Tarefa Comum: Adicionar Campo Novo

1. **Sheeet Google**: Adicionar coluna em "Alunos" ou sheet apropriada
2. **Normalização**: Script.js busca automaticamente via `pickSheet()` + `pickFirstValue()`
3. **Renderização**: Criar função `renderXXX()` e chamar em `initDashboard()`
4. **Teste**: Verificar `appState.xxx` no console após login

## Ferramentas & Ambiente

### Desenvolvimento & Testes
- **Frontend**: Chrome DevTools console (testes manuais no browser)
- **Backend**: Google Sheets + Apps Script editor (script.google.com)
- **Python NFC**: `python nfc_to_apps_script.py` (requer `requests` lib, sem .env)
- **Sem testes automatizados**: validação é feita manualmente no Chrome

### Debug
- `console.log('[contexto]')` padrão em script.js
- Erros → `showError()` (UI notificação vermelha)
- Checar estado: `appState`, `window.appState` no console
- Verificar responses da API: Network tab → selecionar request do endpoint

### Credenciais Hardcoded (⚠️ REVISAR SEGURANÇA)
- `users.json`: emails/senhas em plaintext
- API endpoint visible em script.js
- NFC UIDs em `nomes.json` + `nfc_to_apps_script.py`
- Sem arquivo `.env`: configurações estão hardcoded nos arquivos

## Estrutura de Renderização

```
initDashboard()
├─ fetchAllData() → appState
├─ renderStudentList() → busca appState.alunos, filtra por search
├─ renderAtAGlance() → resumo geral + médias por módulo
├─ renderRecentAbsences() → últimas ausências
└─ switchMainTab('dashboard') → show #content-dashboard
```

Ao criar nova visualização: criar `#content-xxx`, função `render...()`, adicionar tab no sidebar, registrar em `setupEventHandlers()`.

## Próximas Implementações Conhecidas

- [ ] Persistência de estados (localStorage para filtros)
- [ ] Melhorias na UI/UX da escala de prática
- [ ] Campos adicionais no cadastro de alunos

---

**Última atualização**: 12 de novembro de 2025
