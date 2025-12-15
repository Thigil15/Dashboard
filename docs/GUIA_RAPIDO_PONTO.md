# 📱 Guia Rápido - Sistema de Ponto em Tempo Real

## 🎯 O Que Mudou?

Agora o sistema detecta automaticamente se você está vendo dados de **HOJE** ou de **DIAS PASSADOS** e carrega os dados da fonte correta.

### ANTES ❌
- Todos os dados vinham da mesma fonte (Escalas)
- Sem diferenciação entre tempo real e histórico
- Atualizações não apareciam imediatamente

### AGORA ✅
- **HOJE**: Dados vêm de `PontoPratica` e `PontoTeoria` (tempo real)
- **DIAS PASSADOS**: Dados vêm de `EscalaPratica` e `EscalaTeoria` (histórico)
- Indicador visual mostra qual fonte está sendo usada
- Atualizações aparecem imediatamente quando você atualiza a página

## 👀 Como Identificar

### 1. Visualizando HOJE

Quando você está vendo o dia atual, verá:

```
🔴 HOJE (Tempo Real) • 15/12/2025
```

E no rodapé:
```
Atualizado 14:30 • Fonte: PontoPratica/PontoTeoria
```

**O que isso significa**:
- ✅ Você está vendo registros do dia atual
- ✅ Os dados vêm direto das abas de Ponto
- ✅ Quando alguém bate o ponto, aparece aqui em tempo real

### 2. Visualizando Dias Passados

Quando você seleciona um dia anterior, verá:

```
14/12/2025
```

E no rodapé:
```
Atualizado 14:30 • Fonte: EscalaPratica/EscalaTeoria
```

**O que isso significa**:
- ✅ Você está vendo registros históricos
- ✅ Os dados vêm das abas de Escala (já consolidados)
- ✅ Estes dados não mudam mais (já estão finalizados)

## 🔄 Fluxo dos Dados

### Quando o aluno bate o ponto:

1. **Registro inicial** → vai para `PontoPratica` ou `PontoTeoria`
2. **Apps Script sincroniza** → copia para `EscalaPratica` ou `EscalaTeoria` 
3. **Dashboard detecta**:
   - Se for HOJE → lê de `PontoPratica/PontoTeoria`
   - Se for dia passado → lê de `EscalaPratica/EscalaTeoria`

```
Aluno bate ponto
       ↓
PontoPratica/PontoTeoria (HOJE)
       ↓
EscalaPratica/EscalaTeoria (SEMPRE)
       ↓
Dashboard lê da fonte correta
```

## 📊 Exemplos Práticos

### Exemplo 1: Verificar presença de hoje

1. Abra o Dashboard
2. Vá para aba "Ponto"
3. Você verá automaticamente o dia de hoje
4. Confirme que aparece: `🔴 HOJE (Tempo Real)`
5. Os registros mostrados são os pontos batidos hoje

**Cenário Real**:
- João bateu ponto às 07:00 hoje
- O registro aparece imediatamente em `PontoPratica`
- Você vê o registro no Dashboard em tempo real

### Exemplo 2: Ver registro de ontem

1. No Dashboard, aba "Ponto"
2. Use o seletor de data (📅) para escolher ontem
3. Confirme que NÃO aparece: `🔴 HOJE`
4. Confirme que aparece: `Fonte: EscalaPratica/EscalaTeoria`
5. Os registros mostrados são históricos (finalizados)

**Cenário Real**:
- João bateu ponto ontem às 07:00
- O registro foi sincronizado para `EscalaPratica1` (se ele é da Escala 1)
- Você vê o registro consolidado no Dashboard

### Exemplo 3: Atualizar após novo ponto

1. Alguém acabou de bater o ponto agora
2. No Dashboard, aba "Ponto" (visualizando HOJE)
3. Clique no botão de refresh (🔄) no topo
4. O novo registro aparecerá imediatamente
5. Verifique nos logs do console: `✅ registros encontrados para HOJE`

## 🛠️ Testando o Sistema

### Teste Rápido (2 minutos)

1. Abra: `tests/test-brazil-timezone.html`
2. Clique em: **"Executar Todos os Testes"**
3. Todos devem passar com ✅
4. Verifique se o horário mostrado está correto

### Teste Completo (5 minutos)

1. **Teste 1: Visualizar HOJE**
   - Abra o Dashboard → Aba Ponto
   - ✅ Deve aparecer: `🔴 HOJE (Tempo Real)`
   - ✅ Deve aparecer: `Fonte: PontoPratica/PontoTeoria`

2. **Teste 2: Visualizar DIA PASSADO**
   - Selecione ontem no calendário
   - ✅ NÃO deve aparecer: `🔴 HOJE`
   - ✅ Deve aparecer: `Fonte: EscalaPratica/EscalaTeoria`

3. **Teste 3: Refresh**
   - Visualizando HOJE
   - Clique no botão de refresh (🔄)
   - ✅ Dados devem recarregar
   - ✅ Verifique o console (F12) para logs

## 🔍 Console do Navegador

Para ver o que está acontecendo nos bastidores:

1. Pressione **F12** para abrir o Console
2. Vá para aba **Console**
3. Procure por estas mensagens:

```
[getTodayBrazilISO] Horário do Brasil: 15/12/2025, 14:30:25
[getTodayBrazilISO] Data atual (ISO): 2025-12-15

[extractAndPopulatePontoDates] Processando 45 registros de PontoPratica

✅ 12 registros encontrados para HOJE (2025-12-15) - Fonte: PontoPratica
```

## ❓ Perguntas Frequentes

### P: Por que ver dados de dias diferentes?
**R**: O sistema carrega do Google Sheets → Firebase → Dashboard. Dados do dia atual vêm de abas diferentes dos dados históricos.

### P: Quanto tempo demora para aparecer um novo ponto?
**R**: 
- **PontoPratica/PontoTeoria**: Imediato (segundos após sincronização do Apps Script)
- **EscalaPratica/EscalaTeoria**: Também imediato, mas usado apenas para dias passados

### P: Posso ver dados de amanhã?
**R**: Não. O sistema só mostra dados de hoje e dias passados. Amanhã ainda não aconteceu!

### P: E se o horário estiver errado?
**R**: O sistema usa o fuso horário do Brasil (São Paulo). Se estiver errado, verifique:
1. Configurações do seu computador/celular
2. Abra `tests/test-brazil-timezone.html` para confirmar

### P: Os dados antigos sumiram?
**R**: Não! Os dados históricos continuam em `EscalaPratica/EscalaTeoria`. Apenas mudamos qual aba é usada dependendo do dia.

## 🚨 Problemas Comuns

### Problema: Não aparece nenhum registro para hoje

**Solução**:
1. Verifique se alguém bateu ponto hoje
2. Abra o Google Sheets e veja se tem dados em `PontoPratica` ou `PontoTeoria`
3. Execute o Apps Script manualmente: `enviarTodasAsAbasParaFirebase()`
4. Atualize o Dashboard (F5)

### Problema: Aparece "Fonte: EscalaPratica" quando deveria ser "PontoPratica"

**Solução**:
1. Verifique se você está realmente vendo o dia de HOJE
2. Compare a data do seletor com a data de hoje no seu relógio
3. Se for HOJE mas ainda mostra Escala, limpe o cache (Ctrl+Shift+R)

### Problema: Registros duplicados

**Solução**:
1. Isso NÃO deveria acontecer (o sistema evita duplicatas)
2. Abra o Console (F12) e procure por erros
3. Anote o que aparece e reporte o problema

## 📞 Suporte

**Dúvidas**? Entre em contato com o suporte técnico e informe:
1. Que dia você está tentando visualizar (hoje ou dia passado?)
2. O que aparece no label de fonte de dados
3. Se possível, envie um print do Console (F12)

## 📚 Documentação Completa

Para informações técnicas detalhadas, consulte:
- [REAL_TIME_PONTO_SYSTEM.md](./REAL_TIME_PONTO_SYSTEM.md) - Documentação técnica completa
- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) - Configuração do Firebase
- [scripts/PontoEscala.gs](../scripts/PontoEscala.gs) - Código do Apps Script

---

**Última Atualização**: 15 de Dezembro de 2025  
**Versão do Sistema**: 1.0  
**Dashboard INCOR - Ensino Fisioterapia**
