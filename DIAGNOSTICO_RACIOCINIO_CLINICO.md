# 🔍 GUIA DE DIAGNÓSTICO: Raciocínio Clínico = 0.0

## 🚨 Problema Reportado

**Todos os alunos estão com 0.0 em Raciocínio Clínico**

Isso indica que os campos de avaliação relacionados a essa competência não estão sendo reconhecidos pelo sistema de categorização.

---

## 📋 Como Diagnosticar

### Passo 1: Abra o Console do Navegador

1. Pressione **F12** no navegador
2. Vá para a aba **Console**
3. Navegue até a página de **Notas Práticas** de um aluno

### Passo 2: Procure por Logs de Diagnóstico

Procure por linhas que começam com `[calculatePracticeSummary]`:

```javascript
[calculatePracticeSummary] Categorization Summary:
  Raciocínio Clínico: 0 fields  ← ❌ PROBLEMA AQUI!
  Execução Técnica: 8 fields
  Profissionalismo: 12 fields
```

### Passo 3: Identifique Campos Não Categorizados

Role para baixo no console e procure por:

```javascript
⚠️ Uncategorized fields found: 15

📋 NP_Modulo1:
   - "CapacidadeDeAvaliacaoDoEstadoDoPaciente" = 8.5
   - "HabilidadeDeInterpretarDadosDeMonitorizacao" = 7.0
   - "CompetenciaNoEstabelecimentoDeDiagnosticoFuncional" = 9.0
```

**ATENÇÃO:** Os campos acima DEVERIAM ser categorizados como **Raciocínio Clínico**, mas não estão sendo reconhecidos!

---

## 🔧 Solução: Adicionar Padrões Regex

### Exemplos de Campos que Provavelmente São "Raciocínio Clínico"

Campos relacionados a:
- ✅ **Avaliação** do paciente
- ✅ **Análise** de dados
- ✅ **Interpretação** de resultados
- ✅ **Diagnóstico** funcional
- ✅ **Planejamento** de tratamento
- ✅ **Raciocínio** clínico
- ✅ **Conhecimento** teórico
- ✅ **Tomada de decisão**

### Como os Campos Aparecem (Depois de Sanitização)

Os cabeçalhos das planilhas são sanitizados pelo Google Apps Script, removendo:
- Espaços → Removidos
- Acentos → Removidos (á→a, ç→c, etc.)
- Pontuação → Removida
- Tudo junto em PascalCase

**Exemplo:**
```
Original: "Capacidade de avaliação do estado do paciente"
Sanitizado: "CapacidadeDeAvaliacaoDoEstadoDoPaciente"
```

---

## 🎯 Padrões Regex que DEVEM Funcionar

Os seguintes padrões já estão no código e DEVERIAM reconhecer campos de Raciocínio Clínico:

```javascript
raciocinio: [
    /CAPACIDADE.*AVALIAÇÃO/i,      // "Capacidade de Avaliação"
    /AVALIAÇÃO.*INICIAL/i,          // "Avaliação Inicial"
    /AVALIACAO.*INICIAL/i,          // Sem acento
    /PLANEJAMENTO.*TRATAMENTO/i,    // "Planejamento de Tratamento"
    /RACIOCINIO.*CLINICO/i,         // "Raciocínio Clínico"
    /RACIOCÍNIO.*CLÍNICO/i,         // Com acentos
    /CONHECIMENTO.*TEORICO/i,       // "Conhecimento Teórico"
    /ANALISE.*PACIENTE/i,           // "Análise do Paciente"
    /INTERPRETAÇÃO.*DADOS/i,        // "Interpretação de Dados"
    /DIAGNÓSTICO.*FUNCIONAL/i,      // "Diagnóstico Funcional"
    // ... e mais
]
```

---

## 🔬 Possíveis Causas do Problema

### Causa 1: Campos Usam Nomes Diferentes

Os formulários podem usar nomes como:
- "Avaliação **do estado** do paciente" (incluindo palavras extras)
- "Capacidade de **interpretar dados** de monitorização"
- "Competência no **estabelecimento de diagnóstico**"

**Solução:** Adicionar padrões mais flexíveis:

```javascript
/CAPACIDADE.*AVALIACAO/i,  // Já existe
/AVALIACAO.*ESTADO/i,      // ADICIONAR
/AVALIACAO.*PACIENTE/i,    // ADICIONAR
/INTERPRETAR.*DADOS/i,     // ADICIONAR
/INTERPRETACAO.*DADOS/i,   // ADICIONAR (já existe)
/ESTABELECIMENTO.*DIAGNOSTICO/i,  // ADICIONAR
/DIAGNOSTICO.*FUNCIONAL/i,        // Já existe
```

### Causa 2: Sanitização Remove Demais

Campos muito específicos podem perder contexto:
- "Raciocínio clínico **na avaliação inicial**" → "RaciocinioClinioNaAvaliacaoInicial"
- "Conhecimento teórico **aplicado ao caso**" → "ConhecimentoTeoricoAplicadoAoCaso"

**Solução:** Adicionar padrões que focam em palavras-chave:

```javascript
/RACIOCINIO/i,        // Qualquer coisa com "raciocinio"
/AVALIACAO/i,         // Pode ser muito amplo, use com cuidado
/CONHECIMENTO/i,      // Qualquer conhecimento
```

⚠️ **CUIDADO:** Padrões muito genéricos podem categorizar incorretamente!

### Causa 3: Typos nos Formulários

Erros de digitação comuns:
- "Racioc**i**nio" vs "Racioc**í**nio"
- "Clínico" vs "Clinio" (typo)
- "Avaliaçao" vs "Avaliacao"

**Solução:** Já adicionamos padrões para typos comuns:

```javascript
/RACIOCINIO.*CLINIO/i,  // Typo "Clinio" em vez de "Clinico"
```

---

## 📝 Procedimento de Correção

### 1. Coletar Dados Reais

Peça ao usuário para:
1. Abrir o Console (F12)
2. Ir para Notas Práticas de um aluno
3. Copiar TODOS os campos não categorizados
4. Enviar para você

### 2. Analisar os Campos

Para cada campo não categorizado, pergunte:
- Ele se refere a **avaliação** do paciente? → Raciocínio
- Ele se refere a **execução** de procedimento? → Técnica
- Ele se refere a **comportamento** profissional? → Profissionalismo

### 3. Adicionar Padrões

Edite o arquivo `script.js` na função `calculatePracticeSummary()`:

```javascript
raciocinio: [
    // Padrões existentes...
    
    // ADICIONAR NOVOS PADRÕES AQUI:
    /NOVO_PADRAO_1/i,
    /NOVO_PADRAO_2/i,
    /NOVO_PADRAO_3/i,
],
```

### 4. Testar

1. Recarregue a página
2. Vá para Notas Práticas novamente
3. Verifique no Console:
   ```
   Raciocínio Clínico: 5 fields  ← ✅ AGORA TEM CAMPOS!
   ```

---

## 🚀 Ação Imediata Recomendada

Para resolver rapidamente, siga estes passos:

### 1. Coletar Evidências

Execute este comando no Console do navegador:

```javascript
// Cole isto no Console (F12) quando estiver na página de Notas Práticas:
console.log('=== DIAGNÓSTICO DE CAMPOS ===');
const notasP = appState.notasPraticas;
if (notasP && Object.keys(notasP).length > 0) {
    const firstModule = Object.values(notasP)[0];
    if (firstModule && firstModule.registros && firstModule.registros[0]) {
        const firstRecord = firstModule.registros[0];
        console.log('Campos disponíveis:');
        Object.keys(firstRecord).forEach(key => {
            if (typeof firstRecord[key] === 'number' && firstRecord[key] >= 0 && firstRecord[key] <= 10) {
                console.log(`  - "${key}" = ${firstRecord[key]}`);
            }
        });
    }
} else {
    console.log('Nenhum dado de notas práticas encontrado');
}
```

### 2. Envie os Resultados

Copie a lista de campos e envie para análise.

### 3. Aguarde Correção

Um desenvolvedor adicionará os padrões corretos e você verá as notas aparecerem.

---

## ✅ Como Saber se Foi Resolvido

Após a correção, você deve ver no Console:

```javascript
[calculatePracticeSummary] Categorization Summary:
  Raciocínio Clínico: 5 fields  ← ✅ TEM CAMPOS!
    📝 Campos categorizados:
       - "CapacidadeDeAvaliacao" = 8.5
       - "ConhecimentoTeorico" = 9.0
       - "RaciocinioClinioNoAtendimento" = 7.5
  Execução Técnica: 8 fields
  Profissionalismo: 12 fields

✅ All fields successfully categorized!
```

E no Dashboard:

```
┌──────────────┬──────────────┬──────────────────┐
│ 🧠 Raciocínio│ 🔧 Execução  │ 👥 Profiss.      │
│   Clínico    │   Técnica    │                  │
│              │              │                  │
│     8.3      │     8.6      │     8.6          │
│      ↑       │              │                  │
│  CORRIGIDO!  │              │                  │
└──────────────┴──────────────┴──────────────────┘
```

---

## 📞 Suporte

Se o problema persistir após seguir este guia:

1. **Colete os dados** usando o comando JavaScript acima
2. **Crie um issue** no GitHub com:
   - Título: "Raciocínio Clínico = 0.0 - Campos não categorizados"
   - Corpo: Lista completa de campos não categorizados
3. **Aguarde** correção do desenvolvedor

---

**Criado:** 2025-11-17  
**Versão:** 1.0  
**Status:** Guia de Diagnóstico Ativo
