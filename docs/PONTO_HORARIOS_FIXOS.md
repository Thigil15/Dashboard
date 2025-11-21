# Documentação: Correção do Sistema de Ponto - Horários Fixos e Folgas

## Data: 21 de Novembro de 2025

## Problema Original

O sistema de ponto tinha dois problemas críticos:

### 1. Cálculo Incorreto de Atrasos
- **Comportamento Antigo (❌)**: Todos os alunos eram comparados ao horário mais cedo do dia
- **Exemplo do Problema**: 
  - Aluno A tem horário fixo 7h-12h, chega às 7h → ✅ Presente
  - Aluno B tem horário fixo 8h-13h, chega às 8h → ❌ ATRASADO 60 min (comparado às 7h)
  
### 2. Marcação Incorreta de Faltas
- **Comportamento Antigo (❌)**: Alunos com "Folga" ou "Semana de Descanso" eram marcados como FALTA
- **Problema**: Dias de descanso programados contavam negativamente na frequência

## Solução Implementada

### 1. Horários Fixos Individuais
- **Comportamento Novo (✅)**: Cada aluno é avaliado contra seu próprio horário fixo
- **Exemplo Correto**:
  - Aluno A: horário 7h-12h, chega 7h → ✅ Presente (0 min de atraso)
  - Aluno B: horário 8h-13h, chega 8h → ✅ Presente (0 min de atraso)
  - Aluno A: horário 7h-12h, chega 8h → ⚠️ Atrasado 60 min

### 2. Detecção de Folgas
- **Comportamento Novo (✅)**: "Folga", "Descanso", "Semana de Descanso" são marcados como dias de descanso
- **Visual**: Badge cinza com texto "Folga"
- **Contagem**: Excluídos do total de alunos escalados

## Como Funciona

### Extração de Horários das Escalas

As planilhas de escala contêm colunas de data (DD/MM) com valores como:
```
15/11: "08h às 13h"
16/11: "Folga"
17/11: "07h às 12h - Escala 1"
```

### Funções Helper Criadas

#### 1. `isRestDayValue(dateValue)`
Detecta se o valor indica um dia de folga:
```javascript
isRestDayValue("Folga") // → true
isRestDayValue("08h às 13h") // → false
```

#### 2. `parseTimeFromScheduleValue(dateValue)`
Extrai horários do formato brasileiro:
```javascript
parseTimeFromScheduleValue("08h às 13h")
// → { horaEntrada: "08:00", horaSaida: "13:00" }
```

#### 3. `convertDDMMToISO(dateStr)`
Converte data DD/MM para ISO:
```javascript
convertDDMMToISO("15/11")
// → "2025-11-15"
```

### Fluxo de Dados

1. **Extração** (`extractPontoFromEscalas`):
   - Lê dados das planilhas Escala1, Escala2, etc.
   - Para cada aluno e data, extrai horário ou detecta folga
   - Cria registros com campos `_scheduledEntrada`, `_scheduledSaida`, `_isRestDay`

2. **Normalização** (`normalizePontoRecord`):
   - Preserva campos de horário agendado
   - Converte horários para minutos (`scheduledEntradaMinutes`)

3. **Construção do Roster** (`buildRosterNormalizedRecords`):
   - Extrai valores das colunas de data
   - Usa helpers para detectar folgas e parsear horários
   - Adiciona informações aos registros

4. **Merge Inteligente** (`buildPontoDataset`):
   - Combina dados do roster (horários agendados) com dados reais de ponto
   - Preserva `scheduledEntrada` do roster mesmo quando há registro real
   - Garante que horários fixos sejam mantidos

5. **Enriquecimento** (`enrichPontoRows`):
   - Cria mapa de horários agendados por aluno
   - Para cada registro:
     - Se é folga → status 'off', badge cinza
     - Se tem horário real:
       - Compara com horário agendado daquele aluno
       - Diferença > 10 min → status 'late'
       - Diferença ≤ 10 min → status 'present'
     - Se não tem horário real → status 'absent'

6. **Exibição** (`refreshPontoView`):
   - Conta alunos por status
   - Exclui folgas do total (`totalEscalados = total - offCount`)
   - Renderiza com badges apropriados

## Estrutura de Dados

### Registro de Ponto Enriquecido
```javascript
{
    id: "brunacosta",
    nome: "Bruna Costa",
    isoDate: "2025-11-15",
    escala: "Escala 2",
    
    // Horário real (se registrado)
    horaEntrada: "08:05",
    horaEntradaMinutes: 485,
    
    // Horário agendado (da escala)
    scheduledEntrada: "08:00",
    scheduledEntradaMinutes: 480,
    
    // Status calculado
    isRestDay: false,
    status: "present", // ou "late", "absent", "off"
    statusLabel: "Presente",
    delayMinutes: 5,
    badgeClass: "badge badge-green"
}
```

### Registro de Folga
```javascript
{
    id: "brunacosta",
    nome: "Bruna Costa",
    isoDate: "2025-11-16",
    escala: "Escala 2",
    
    // Marcado como folga
    isRestDay: true,
    status: "off",
    statusLabel: "Folga",
    badgeClass: "badge badge-gray"
}
```

## Regras de Negócio

### Tolerância de Atraso
- **Threshold**: 10 minutos
- Chegada até 10 min após horário agendado = Presente
- Chegada > 10 min após horário agendado = Atraso

### Quando Não Há Horário Agendado
Se um aluno tem registro de entrada mas não há horário agendado na escala:
- **Comportamento**: Marcado como "Presente" (sem cálculo de atraso)
- **Razão**: Pode ser aluno não no roster, dados antigos, ou escala sem horários

### Prioridade de Dados
1. **Ponto Real** (check-in efetivo) sobrescreve dados de escala
2. **Horários Agendados** da escala são preservados durante merge
3. **Folgas** da escala criam registros sem horários de entrada

## Testes

### Arquivo de Teste
`tests/test-ponto-schedule-fix.html`

### Cobertura
- ✅ Detecção de folgas: 4/4
- ✅ Extração de horários: 4/4
- ✅ Cálculo de atrasos: 5/5
- ✅ Total: 13/13 (100%)

### Cenários Testados
1. Identificação de "Folga", "Descanso", "Semana de Descanso"
2. Parse de formatos "7h às 12h", "08h as 13h", "8h a 14h"
3. Delay baseado em horário individual
4. Tolerância de 10 minutos
5. Cenário específico do problema original (Bruna)

## Arquivos Modificados

### script.js (Principal)
- Linhas 1341-1370: Helper functions adicionadas
- Linhas 1393-1455: extractPontoFromEscalas atualizado
- Linhas 2055-2067: getRosterForDate extrai __dateValue
- Linhas 2133-2191: buildRosterNormalizedRecords parse de horários
- Linhas 2194-2252: buildPontoDataset merge inteligente
- Linhas 2410-2458: normalizePontoRecord preserva campos
- Linhas 2689-2796: enrichPontoRows usa horários individuais
- Linhas 2799-2814: refreshPontoView exclui folgas do total

### tests/test-ponto-schedule-fix.html (Novo)
- Testes automatizados da lógica
- Interface visual com resultados
- 422 linhas

## Segurança

- ✅ **CodeQL**: 0 alertas
- ✅ **Code Review**: Todos os feedbacks endereçados
- ✅ **Sanitização**: Dados de entrada normalizados
- ✅ **Validação**: Null checks apropriados

## Manutenção Futura

### Para Adicionar Novos Formatos de Horário
Edite a regex em `parseTimeFromScheduleValue()` (linha ~1360):
```javascript
const timeMatch = dateValue.match(/(\d{1,2})h\s*(?:às|as|a)?\s*(\d{1,2})h/i);
```

### Para Adicionar Novos Marcadores de Folga
Edite a função `isRestDayValue()` (linha ~1347):
```javascript
return normalized.includes('folga') || 
       normalized.includes('descanso') || 
       normalized.includes('semana de descanso') ||
       normalized.includes('NOVO_MARCADOR');
```

### Para Alterar Tolerância de Atraso
Edite a constante (linha 1024):
```javascript
const ATRASO_THRESHOLD_MINUTES = 10; // Altere aqui
```

## Notas Importantes

1. **Ano Atual**: Datas DD/MM são convertidas usando ano atual (`new Date().getFullYear()`)
2. **Case-Insensitive**: Detecção de folgas funciona com MAIÚSCULAS/minúsculas
3. **Normalização**: Acentos são removidos para comparação
4. **Cache**: Sistema usa cache para performance, pode precisar refresh após mudanças

## Commits

1. `9f68ace` - Implementação inicial de horários fixos e folgas
2. `5a10fb5` - Preservação de horários agendados no merge
3. `1b71b20` - Refatoração com helper functions
4. `26cfc53` - Adição de testes
5. `2e5256a` - Melhorias de código e documentação

## Referências

- Issue: copilot/implementa-horarios-fixos-alunos
- Branch: copilot/implementa-horarios-fixos-alunos
- Docs anteriores: PONTO_CORRECAO_COMPLETA.md, LEIA-ME-PRIMEIRO.md
