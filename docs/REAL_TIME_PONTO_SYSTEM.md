# 📍 Sistema de Ponto em Tempo Real

## 🎯 Objetivo

Implementar um sistema inteligente que diferencia automaticamente entre registros de ponto do dia atual (tempo real) e registros históricos (dias passados), garantindo que:

1. **Para o dia atual**: Dados são carregados de `PontoPratica` e `PontoTeoria` (atualizações em tempo real)
2. **Para dias passados**: Dados são carregados de `EscalaPratica` e `EscalaTeoria` (dados consolidados)

## 🔄 Fluxo do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    Sistema de Ponto                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌──────────────────────┐
                  │   Aluno bate ponto   │
                  └──────────────────────┘
                              │
                              ▼
             ┌────────────────────────────────┐
             │   Registro vai para:           │
             │   • PontoPratica (prática)     │
             │   • PontoTeoria (teoria)       │
             └────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │   Apps Script sincroniza para:          │
        │   • EscalaPratica + número (ex: 1-12)   │
        │   • EscalaTeoria + número (ex: 1-12)    │
        └─────────────────────────────────────────┘
                              │
                              ▼
           ┌───────────────────────────────────────┐
           │   Dashboard lê dados de:              │
           │   • HOJE: PontoPratica/PontoTeoria    │
           │   • PASSADO: EscalaPratica/Teoria     │
           └───────────────────────────────────────┘
```

## 📊 Estrutura de Dados

### Abas do Google Sheets

#### 1. PontoPratica (Dia Atual - Prática)
```
Colunas:
- SerialNumber
- EmailHC  
- NomeCompleto
- Data (formato: DD/MM/YYYY)
- HoraEntrada (formato: HH:MM:SS)
- HoraSaida (formato: HH:MM:SS)
- Escala (número da escala: 1-12)
- Tipo (sempre "Prática")
```

#### 2. PontoTeoria (Dia Atual - Teoria)
```
Colunas:
- SerialNumber
- EmailHC
- NomeCompleto
- Data (formato: DD/MM/YYYY)
- HoraEntrada (formato: HH:MM:SS)
- HoraSaida (formato: HH:MM:SS)
- Escala (número da escala: 1-12)
- Tipo (sempre "Teoria")
```

#### 3. EscalaPratica1-12 (Histórico - Prática)
```
Estrutura matricial:
- Linhas: Alunos (SerialNumber, EmailHC, NomeCompleto)
- Colunas: Datas (formato: DD/MM ou DD_MM)
- Células: Horários de entrada e saída (HH:MM:SS às HH:MM:SS)
```

#### 4. EscalaTeoria1-12 (Histórico - Teoria)
```
Estrutura matricial:
- Linhas: Alunos (SerialNumber, EmailHC, NomeCompleto)
- Colunas: Datas (formato: DD/MM ou DD_MM)
- Células: Horários de entrada e saída (HH:MM:SS às HH:MM:SS)
```

## 🕐 Detecção de Timezone

### Função: `getTodayBrazilISO()`

Retorna a data atual no fuso horário do Brasil (America/Sao_Paulo) em formato ISO.

```javascript
function getTodayBrazilISO() {
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString('en-US', { 
        timeZone: 'America/Sao_Paulo' 
    }));
    const year = brazilTime.getFullYear();
    const month = String(brazilTime.getMonth() + 1).padStart(2, '0');
    const day = String(brazilTime.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
```

**Exemplo de saída**: `"2025-12-15"`

### Função: `isToday(isoDate)`

Verifica se uma data ISO é o dia atual (timezone do Brasil).

```javascript
function isToday(isoDate) {
    if (!isoDate) return false;
    const todayISO = getTodayBrazilISO();
    return isoDate === todayISO;
}
```

**Exemplos**:
- `isToday("2025-12-15")` → `true` (se hoje for 15/12/2025)
- `isToday("2025-12-14")` → `false` (dia passado)
- `isToday("2025-12-16")` → `false` (dia futuro)

## 🔀 Lógica de Priorização

### Para o Dia Atual (isToday = true)

```javascript
// Prioridade 1: PontoPratica e PontoTeoria
if (fromPontoPratica || fromPontoTeoria) {
    // Substitui qualquer dado existente de Escala
    // Garante que dados de tempo real sejam usados
}

// Prioridade 2: Ignora dados de Escala se já existir em Ponto
if (fromEscala && hasPontoRecord) {
    // Pula - não sobrescreve dados de tempo real
}
```

### Para Dias Passados (isToday = false)

```javascript
// Prioridade 1: EscalaPratica e EscalaTeoria
if (fromEscala) {
    // Adiciona normalmente - fonte primária para histórico
}

// Prioridade 2: PontoPratica/PontoTeoria (se existir)
if (fromPontoPratica || fromPontoTeoria) {
    // Substitui apenas se for de Escala
    // Mantém dados de Ponto se já existirem
}
```

## 🎨 Indicadores Visuais

### 1. Label de Data
- **Hoje**: `🔴 HOJE (Tempo Real) • 15/12/2025`
- **Dia Passado**: `14/12/2025`

### 2. Seletor de Data
- **Hoje**: Borda vermelha + fundo gradiente vermelho claro
- **Dia Passado**: Estilo padrão

### 3. Label de Sincronização
- **Hoje**: `Atualizado 14:30 • 15 datas disponíveis • Fonte: PontoPratica/PontoTeoria`
- **Dia Passado**: `Atualizado 14:30 • 15 datas disponíveis • Fonte: EscalaPratica/EscalaTeoria`

## 📝 Logs do Console

### Durante o carregamento de dados:

```
[getTodayBrazilISO] Horário do Brasil (São Paulo): 15/12/2025, 14:30:25
[getTodayBrazilISO] Data atual (ISO): 2025-12-15

[extractAndPopulatePontoDates] Processando 45 registros de PontoPratica

[extractAndPopulatePontoDates] Substituído registro de Escala por PontoPratica 
para João Silva em 2025-12-15

[extractAndPopulatePontoDates] ✅ 12 registros encontrados para HOJE (2025-12-15) 
- Fonte: PontoPratica

[extractAndPopulatePontoDates] Ignorando dados de Escala para dia atual 2025-12-15 
(já existe em Ponto)
```

## 🧪 Testes

### Teste Automatizado

Abra o arquivo: `tests/test-brazil-timezone.html`

Este teste verifica:
1. ✅ Detecção correta do timezone do Brasil
2. ✅ Função `isToday()` para data atual
3. ✅ Função `isToday()` para datas passadas
4. ✅ Função `isToday()` para datas futuras
5. ✅ Tratamento de datas inválidas

### Teste Manual

1. **Verificar Dia Atual**:
   - Abra o Dashboard
   - Navegue para a aba "Ponto"
   - Verifique se aparece: `🔴 HOJE (Tempo Real)`
   - Verifique se aparece: `Fonte: PontoPratica/PontoTeoria`

2. **Verificar Dia Passado**:
   - Use o seletor de data para escolher um dia passado
   - Verifique se NÃO aparece: `🔴 HOJE`
   - Verifique se aparece: `Fonte: EscalaPratica/EscalaTeoria`

3. **Verificar Atualização em Tempo Real**:
   - No dia atual, registre um novo ponto via sistema de biometria
   - Clique no botão de refresh (🔄)
   - O novo registro deve aparecer imediatamente
   - Verifique os logs do console para ver a origem do dado

## 🔍 Troubleshooting

### Problema: Dados do dia atual não aparecem

**Causa Possível**: Dados ainda não foram sincronizados do Google Sheets para o Firebase

**Solução**:
1. Verifique se o Apps Script está rodando automaticamente
2. Execute manualmente: `enviarTodasAsAbasParaFirebase()`
3. Verifique no Firebase Console se os dados existem em `/exportAll/PontoPratica/dados`

### Problema: Timezone incorreto

**Causa Possível**: Configuração do navegador ou sistema operacional

**Solução**:
1. Abra `tests/test-brazil-timezone.html`
2. Verifique se o horário mostrado está correto
3. Compare com o horário oficial: https://www.horariodebrasilia.org/
4. Se estiver incorreto, verifique as configurações de timezone do seu dispositivo

### Problema: Dados duplicados

**Causa Possível**: Escala e Ponto sendo carregados simultaneamente

**Solução**:
1. Verifique os logs do console
2. Procure por mensagens: `Ignorando dados de Escala para dia atual`
3. Se não aparecer, pode haver um problema na lógica de priorização
4. Abra uma issue no GitHub com os logs completos

## 🚀 Atualizações Futuras

### Planejado para próximas versões:

1. **Auto-refresh**: Atualizar automaticamente a cada 5 minutos quando visualizando o dia atual
2. **Notificações**: Alertas quando novos registros de ponto são detectados
3. **Comparação**: Mostrar diferenças entre dados de Ponto e Escala
4. **Histórico**: Timeline mostrando quando cada registro foi criado/atualizado

## 📚 Referências

- [Google Sheets Apps Script - PontoEscala.gs](../scripts/PontoEscala.gs)
- [Google Sheets Apps Script - Ponto.gs](../scripts/Ponto.gs)
- [Firebase Realtime Database - Estrutura](./FIREBASE_SETUP.md)
- [Documentação de Timezone - IANA](https://www.iana.org/time-zones)

## 🤝 Contribuindo

Para contribuir com melhorias neste sistema:

1. Teste as alterações com `tests/test-brazil-timezone.html`
2. Adicione logs detalhados para debug
3. Documente qualquer mudança na lógica de priorização
4. Atualize este documento com novos comportamentos

---

**Última Atualização**: 15 de Dezembro de 2025  
**Versão**: 1.0  
**Autor**: Sistema de Dashboard - INCOR
