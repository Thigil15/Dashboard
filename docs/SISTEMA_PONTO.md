# 📋 Sistema de Ponto - Documentação Completa

## 📖 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Fluxo de Dados](#fluxo-de-dados)
4. [Estruturas de Dados](#estruturas-de-dados)
5. [Funções Principais](#funções-principais)
6. [Correções Implementadas](#correções-implementadas)
7. [Como Usar](#como-usar)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

O **Sistema de Ponto** é um módulo do Dashboard que gerencia registros de frequência de profissionais. Ele permite:

- ✅ Visualizar registros de presença por data
- ✅ Filtrar por escala (Escala1, Escala2, etc.)
- ✅ Detectar automaticamente atrasos e faltas
- ✅ Buscar por nome, email ou número de crachá
- ✅ Navegar entre datas disponíveis
- ✅ Atualização em tempo real via Firebase

---

## 🏗️ Arquitetura

### Componentes Principais

```
Sistema de Ponto
├── Firebase Realtime Database (fonte de dados)
├── pontoState (estado local)
├── Processamento de Dados (extractAndPopulatePontoDates)
├── Cache (otimização de acesso)
└── UI (painel visual)
```

### Fluxo de Comunicação

```
Firebase → Listener → Processor → pontoState → UI Components
                                      ↓
                                    Cache
```

---

## 📊 Fluxo de Dados

### 1. Carregamento Inicial

```javascript
// 1. Firebase listener detecta mudança em /exportAll/Ponto/dados
setupDatabaseListeners() 
  ↓
// 2. Processa dados brutos
processor: (data) => {
  const processed = data.map(deepNormalizeObject)
  extractAndPopulatePontoDates(processed)  // ← CRÍTICO
  updatePontoHojeMap()                     // ← CRÍTICO
  return processed
}
  ↓
// 3. Armazena em appState.pontoStaticRows
appState.pontoStaticRows = processed
  ↓
// 4. Dispara atualização da UI
triggerUIUpdates('pontoStaticRows')
  ↓
// 5. Se painel de ponto estiver visível
hydratePontoSelectors()
refreshPontoView()
```

### 2. Mudança de Aba para "Ponto"

```javascript
switchMainTab('ponto')
  ↓
// Verifica se dados já foram carregados
if (appState.pontoStaticRows.length > 0) {
  // Processa dados se ainda não processado
  if (pontoState.dates.length === 0) {
    extractAndPopulatePontoDates(appState.pontoStaticRows)
    updatePontoHojeMap()
  }
  // Inicializa painel
  initializePontoPanel()
} else {
  // Mostra estado de carregamento
  mostrarLoadingState()
}
```

### 3. Seleção de Data ou Escala

```javascript
handlePontoDateChange(event)
  ↓
pontoState.selectedDate = novaData
  ↓
ensurePontoData(novaData, 'all')  // Garante dados no cache
  ↓
hydratePontoSelectors()           // Atualiza controles
refreshPontoView()                // Renderiza tabela
```

---

## 📦 Estruturas de Dados

### pontoState (Estado Local)

```javascript
const pontoState = {
  rawRows: [],              // Dados brutos (não usado atualmente)
  byDate: Map<string, Array>, // Mapa: data ISO → registros
  cache: Map<string, Array>,  // Mapa: chave cache → registros filtrados
  scalesByDate: Map<string, Array>, // Mapa: data ISO → escalas disponíveis
  autoScaleByDate: Map<string, string>, // Mapa: data ISO → escala automática
  dates: [],                // Array de datas disponíveis (ordenado)
  selectedDate: '',         // Data selecionada atualmente
  selectedScale: 'all',     // Escala selecionada atualmente
  filter: 'all',            // Filtro de status (all/present/late/absent)
  search: '',               // Termo de busca normalizado
  searchRaw: '',            // Termo de busca original
  lastLoadedAt: null,       // Timestamp do último carregamento
  isLoading: false          // Estado de carregamento
};
```

### Registro de Ponto Normalizado

```javascript
{
  id: 'joaosilva',                    // ID primário (nomeId)
  nomeId: 'joaosilva',                // Nome normalizado
  rawSerial: '12345',                 // Número de crachá original
  serialNormalized: '12345',          // Número de crachá normalizado
  nome: 'João Silva',                 // Nome completo
  isoDate: '2025-11-21',              // Data em formato ISO
  dataBr: '21/11/2025',               // Data em formato brasileiro
  escala: 'Escala1',                  // Nome da escala
  modalidade: 'Prática',              // Prática ou Teórica
  horaEntrada: '08:00',               // Hora de entrada (string)
  horaSaida: '17:00',                 // Hora de saída (string)
  horaEntradaMinutes: 480,            // Hora de entrada em minutos
  escalaKey: 'escala1',               // Chave normalizada da escala
  email: 'joao@example.com',          // Email
  emailNormalized: 'joaoexamplecom',  // Email normalizado
  
  // Campos adicionados por enrichPontoRows:
  status: 'present',                  // Status: present/late/absent
  statusLabel: 'Presente',            // Label do status
  badgeClass: 'badge badge-green',    // Classe CSS do badge
  delayMinutes: 0,                    // Minutos de atraso
  searchKey: 'joaosilva...'           // Chave de busca normalizada
}
```

### Formato de Cache

```javascript
// Chave: "dataISO__escalaKey"
"2025-11-21__all"      → [todos os registros de 21/11]
"2025-11-21__escala1"  → [registros de 21/11 da Escala1]
"2025-11-20__all"      → [todos os registros de 20/11]
```

---

## 🔧 Funções Principais

### 1. extractAndPopulatePontoDates(pontoRows)

**Propósito**: Processa dados brutos do Firebase e popula `pontoState`

**O que faz**:
1. Extrai todas as datas únicas dos registros
2. Normaliza cada registro (campos padronizados)
3. Agrupa registros por data
4. Detecta escalas disponíveis por data
5. Popula `pontoState.dates`, `pontoState.byDate` e cache inicial

**Quando é chamada**:
- ✅ No Firebase listener quando dados de ponto chegam
- ✅ Ao trocar para a aba de ponto (se dados existem mas não processados)

**Exemplo**:
```javascript
const pontoRows = [
  { DataISO: '2025-11-21', NomeCompleto: 'João', Escala: 'Escala1', ... },
  { DataISO: '2025-11-21', NomeCompleto: 'Maria', Escala: 'Escala1', ... },
  { DataISO: '2025-11-20', NomeCompleto: 'Pedro', Escala: 'Escala2', ... }
];

extractAndPopulatePontoDates(pontoRows);

// Resultado:
pontoState.dates = ['2025-11-21', '2025-11-20'] // Ordenado desc
pontoState.byDate.get('2025-11-21') = [registro1, registro2]
pontoState.scalesByDate.get('2025-11-21') = ['Escala1']
```

---

### 2. updatePontoHojeMap()

**Propósito**: Cria índice rápido dos registros de hoje

**O que faz**:
1. Busca registros da data atual
2. Cria `appState.pontoHojeMap` com chave = nomeId/email/serial
3. Cria `appState.pontoHojeAliases` para múltiplas formas de identificação

**Por que é importante**:
- Permite busca rápida de registro de ponto por aluno
- Usado em outras partes do sistema (detalhes do aluno, etc.)

---

### 3. normalizePontoRecord(row, fallbackDate)

**Propósito**: Converte registro bruto em formato padronizado

**O que faz**:
1. Detecta campos de data em múltiplas variações (DataISO, dataISO, data, etc.)
2. Detecta campos de nome em múltiplas variações (NomeCompleto, Nome, etc.)
3. Normaliza textos (remove acentos, lowercase)
4. Converte horas para minutos
5. Gera IDs únicos

**Variações de campo suportadas**:
```javascript
// Data:
DataISO, dataISO, dataIso, dataiso, DataIso, data, Data, DATA

// Nome:
NomeCompleto, Nome, nomeCompleto, nome

// Email:
EmailHC, Email, email

// Serial:
SerialNumber, Serial, ID, Id

// Modalidade:
'Pratica/Teorica', 'Prática/Teórica', Modalidade, Tipo, Turno, Periodo
```

---

### 4. enrichPontoRows(rows)

**Propósito**: Adiciona status (presente/atraso/falta) aos registros

**Como funciona**:

1. **Calcula baseline por escala**: hora de entrada mais cedo de cada escala
2. **Detecta atrasos**: compara hora de entrada com baseline
3. **Atribui status**:
   - `absent`: sem hora de entrada
   - `late`: atraso > 10 minutos
   - `present`: atraso ≤ 10 minutos

**Exemplo**:
```javascript
const rows = [
  { nome: 'João', horaEntrada: '08:00', escala: 'Escala1' },
  { nome: 'Maria', horaEntrada: '08:15', escala: 'Escala1' },
  { nome: 'Pedro', horaEntrada: null, escala: 'Escala1' }
];

const enriched = enrichPontoRows(rows);

// Resultado:
enriched[0].status = 'present'  // João: no horário (baseline)
enriched[1].status = 'late'     // Maria: 15 min de atraso
enriched[2].status = 'absent'   // Pedro: sem entrada
```

---

### 5. refreshPontoView()

**Propósito**: Atualiza visualização do painel de ponto

**O que faz**:
1. Busca registros da data/escala selecionada
2. Enriquece com status
3. Aplica filtros (presente/atraso/falta)
4. Aplica busca
5. Renderiza tabela
6. Atualiza contadores
7. Atualiza metadados

---

### 6. hydratePontoSelectors()

**Propósito**: Atualiza todos os controles da UI

**O que atualiza**:
- Seletor de data (min/max, opções)
- Seletor de escala
- Campo de busca
- Botões de navegação (próximo/anterior)
- Pills de filtro (todos/presentes/atrasos/faltas)

---

## ✅ Correções Implementadas

### Problema 1: Dados não processados ao chegar do Firebase

**Sintoma**: 
- Dados de ponto chegavam do Firebase mas não apareciam no painel
- `pontoState.dates` permanecia vazio
- Painel mostrava "Nenhum registro disponível"

**Causa**: 
- Firebase listener recebia dados mas não chamava `extractAndPopulatePontoDates()`

**Solução**:
```javascript
// ANTES (script.js linha ~89):
{ path: 'exportAll/Ponto/dados', stateKey: 'pontoStaticRows', processor: (data) => {
    const processed = data.map(deepNormalizeObject);
    return processed;  // ← Apenas retornava, não processava!
}}

// DEPOIS:
{ path: 'exportAll/Ponto/dados', stateKey: 'pontoStaticRows', processor: (data) => {
    const processed = data.map(deepNormalizeObject);
    
    // CRÍTICO: Processa imediatamente
    extractAndPopulatePontoDates(processed);
    updatePontoHojeMap();
    
    return processed;
}}
```

---

### Problema 2: UI não atualizava quando dados chegavam

**Sintoma**:
- Dados processados mas painel não mostrava
- Necessário refresh manual da página

**Causa**:
- `triggerUIUpdates('pontoStaticRows')` não fazia nada

**Solução**:
```javascript
// ANTES (script.js linha ~595):
case 'pontoStaticRows':
    // Ponto data updated - may need to refresh ponto view
    break;  // ← Não fazia nada!

// DEPOIS:
case 'pontoStaticRows':
    console.log('[triggerUIUpdates] Dados de ponto atualizados');
    
    const pontoContent = document.getElementById('content-ponto');
    if (pontoContent && !pontoContent.classList.contains('hidden')) {
        hydratePontoSelectors();  // ← Atualiza controles
        refreshPontoView();       // ← Renderiza dados
    }
    
    if (typeof renderAtAGlance === 'function') {
        renderAtAGlance();
    }
    break;
```

---

### Problema 3: Painel não inicializava ao trocar de aba

**Sintoma**:
- Ao clicar na aba "Ponto", nada acontecia
- Dados existiam mas não eram exibidos

**Causa**:
- `switchMainTab()` apenas mostrava/escondia divs
- Não verificava se dados estavam carregados

**Solução**:
```javascript
// ANTES (script.js linha ~1370):
function switchMainTab(tabName) {
    // ... código de mostrar/esconder divs
    window.scrollTo(0, 0);
}

// DEPOIS:
function switchMainTab(tabName) {
    // ... código de mostrar/esconder divs
    
    // NOVO: Inicializa ponto se necessário
    if (tabName === 'ponto') {
        if (appState.pontoStaticRows && appState.pontoStaticRows.length > 0) {
            if (pontoState.dates.length === 0) {
                extractAndPopulatePontoDates(appState.pontoStaticRows);
                updatePontoHojeMap();
            }
            initializePontoPanel();
        } else {
            // Mostra loading
            const loadingState = document.getElementById('ponto-loading-state');
            if (loadingState) {
                loadingState.hidden = false;
                loadingState.textContent = 'Carregando dados do Firebase...';
            }
        }
    }
    
    window.scrollTo(0, 0);
}
```

---

### Problema 4: Mensagens de erro genéricas

**Sintoma**:
- "Nenhum registro encontrado" sem contexto
- Usuário não sabia o que fazer

**Solução**:
- Mensagens contextualizadas com dicas
- Diferentes mensagens para diferentes cenários

```javascript
// ANTES:
message.textContent = 'Nenhum registro encontrado.';

// DEPOIS:
if (totalBase === 0) {
    message.innerHTML = `
        <strong>Nenhum registro encontrado para ${formatDateBR(pontoState.selectedDate)}.</strong><br>
        <span style="font-size: 0.9em; color: var(--text-secondary);">
            Dica: Use os botões de navegação ou selecione outra data.
        </span>
    `;
}
```

---

### Problema 5: Controles desabilitados incorretamente

**Sintoma**:
- Seletor de data ficava desabilitado mesmo com dados
- Botões de navegação não funcionavam

**Solução**:
- Verificações de estado mais robustas
- Disable apenas quando realmente necessário

```javascript
// ANTES:
dateInput.value = pontoState.selectedDate;

// DEPOIS:
if (pontoState.dates.length > 0) {
    const sortedDates = [...pontoState.dates].sort((a, b) => a.localeCompare(b));
    dateInput.min = sortedDates[0];
    dateInput.max = sortedDates[sortedDates.length - 1];
    dateInput.disabled = false;  // ← Habilita quando há dados
} else {
    dateInput.disabled = true;   // ← Desabilita quando não há dados
}
```

---

## 📱 Como Usar

### Para Usuários

1. **Acessar o Painel de Ponto**:
   - Faça login no Dashboard
   - Clique em "Ponto" no menu lateral

2. **Navegar por Datas**:
   - Use o seletor de data
   - Ou clique nos botões ← / → para navegar

3. **Filtrar por Escala**:
   - Use o dropdown "Escala"
   - Selecione escala específica ou "Todas as escalas"

4. **Filtrar por Status**:
   - Clique nos pills: Todos / Presentes / Atrasos / Faltas

5. **Buscar**:
   - Digite nome, email ou número de crachá no campo de busca

6. **Atualizar Dados**:
   - Clique no botão de refresh (↻)

---

### Para Desenvolvedores

#### Adicionar Novo Campo ao Registro

```javascript
// 1. Adicionar no Firebase (Google Apps Script)
const pontoData = {
    NomeCompleto: 'João Silva',
    DataISO: '2025-11-21',
    NovoCampo: 'valor'  // ← Novo campo
};

// 2. Adicionar na normalização (script.js, normalizePontoRecord)
function normalizePontoRecord(row = {}, fallbackDate = '') {
    return {
        // ... campos existentes
        novoCampo: row.NovoCampo || row.novoCampo || ''  // ← Suportar variações
    };
}

// 3. Adicionar na renderização (script.js, renderPontoRow)
function renderPontoRow(row) {
    return `
        <tr>
            <!-- ... colunas existentes -->
            <td>${escapeHtml(row.novoCampo || '—')}</td>
        </tr>
    `;
}

// 4. Adicionar coluna na tabela (index.html)
<thead>
    <tr>
        <!-- ... colunas existentes -->
        <th>Novo Campo</th>
    </tr>
</thead>
```

---

## 🐛 Troubleshooting

### Problema: Painel vazio mesmo com dados no Firebase

**Diagnóstico**:
```javascript
// Abra o console (F12) e execute:
console.log('pontoStaticRows:', appState.pontoStaticRows);
console.log('pontoState.dates:', pontoState.dates);
console.log('pontoState.byDate:', pontoState.byDate);
```

**Soluções**:

1. **Se `pontoStaticRows` está vazio**:
   - Execute o Google Apps Script para enviar dados
   - Verifique path no Firebase: `/exportAll/Ponto/dados`

2. **Se `pontoStaticRows` tem dados mas `dates` está vazio**:
   - Dados não foram processados
   - Force o processamento:
   ```javascript
   extractAndPopulatePontoDates(appState.pontoStaticRows);
   updatePontoHojeMap();
   initializePontoPanel();
   ```

3. **Se `dates` tem dados mas `byDate` está vazio**:
   - Problema na normalização de datas
   - Verifique formato do campo `DataISO` no Firebase

---

### Problema: Status sempre "Falta" mesmo com hora de entrada

**Causa possível**: Hora de entrada em formato incorreto

**Solução**:
```javascript
// Verifique o formato no Firebase:
// ✅ Correto: "08:00"
// ❌ Errado: "8:0", "08h00", "480"

// Se necessário, sanitize no Apps Script:
function formatTime(time) {
    const [h, m] = time.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}
```

---

### Problema: Navegação de datas não funciona

**Diagnóstico**:
```javascript
console.log('Dates:', pontoState.dates);
console.log('Selected:', pontoState.selectedDate);
console.log('Index:', pontoState.dates.indexOf(pontoState.selectedDate));
```

**Solução**:
- Data selecionada deve estar no array `dates`
- Array deve estar ordenado: mais recente → mais antigo
- Botões desabilitados nas extremidades é comportamento correto

---

### Problema: Busca não encontra resultados

**Causa**: Busca usa texto normalizado (sem acentos, lowercase)

**Como funciona**:
```javascript
// Busca: "João"
// Normalizado: "joao"
// Compara com searchKey: "joaosilvajoaoexamplecom..."

// Para debugar:
console.log('Busca:', pontoState.search);
console.log('SearchKey do registro:', row.searchKey);
```

---

## 📊 Métricas e Performance

### Otimizações Implementadas

1. **Cache por data+escala**: Evita reprocessamento
2. **Map em vez de Array**: Busca O(1) em vez de O(n)
3. **Normalização única**: Textos normalizados uma vez
4. **Lazy loading**: Dados processados sob demanda

### Complexidade

- `extractAndPopulatePontoDates`: O(n) onde n = registros
- `getPontoRecords`: O(1) com cache, O(n) sem cache
- `enrichPontoRows`: O(n) onde n = registros da data
- `refreshPontoView`: O(n) onde n = registros filtrados

---

## 🔐 Segurança

### Sanitização de Dados

Todos os dados exibidos na UI passam por `escapeHtml()`:

```javascript
function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
```

### Validação de Entrada

- Datas validadas com `normalizeDateInput()`
- Horas sanitizadas com `sanitizeTime()`
- Emails e nomes normalizados (sem código malicioso)

---

## 📚 Referências

- **Firebase**: Fonte de dados em tempo real
- **Código Principal**: `script.js` (linhas 939-2920)
- **UI**: `index.html` (linhas 277-393)
- **Estilos**: `style.css` (classes `.ponto-*`)
- **Testes**: `tests/test-ponto-system.html`

---

## 🎓 Glossário

- **Baseline**: Hora de entrada mais cedo de uma escala (usada para calcular atrasos)
- **Cache Key**: Chave única no formato `dataISO__escalaKey`
- **Enrich**: Adicionar campos calculados (status, badges, etc.)
- **Normalize**: Converter para formato padronizado (sem acentos, lowercase)
- **pontoState**: Estado local do sistema de ponto
- **Roster**: Lista de escalados (vem de Escala1, Escala2, etc.)

---

**Última atualização**: 2025-11-21  
**Versão do Sistema**: 1.0.0 (pós correções)  
**Autor**: Copilot Coding Agent
