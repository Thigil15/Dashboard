# 🎓 Mapeamento Completo de Notas Práticas - Sistema de Categorização

## 📋 Visão Geral

Este documento explica como o sistema Dashboard classifica automaticamente os campos de avaliação prática em três competências principais:

1. **Raciocínio Clínico** - Avaliação, planejamento e associação de conhecimentos
2. **Execução Técnica** - Habilidade e precisão na execução de procedimentos
3. **Profissionalismo** - Comunicação, ética e relacionamento interpessoal

## 🧠 1. Raciocínio Clínico (Clinical Reasoning)

### Descrição
Avalia a capacidade do aluno de analisar, planejar e tomar decisões clínicas baseadas em conhecimento teórico.

### Campos que são categorizados como Raciocínio Clínico:

#### Avaliação e Planejamento
- **Capacidade de avaliação** do paciente
- **Avaliação inicial** do estado do paciente
- **Planejamento** de tratamento ou organização
- **Habilidade de associação** de conhecimentos
- **Raciocínio clínico**

#### Conhecimento e Análise
- **Conhecimento teórico**
- **Análise do paciente**
- **Diagnóstico funcional**
- **Interpretação de dados**
- **Tomada de decisão**

#### Organização e Priorização
- **Organização de atividades**
- **Priorização**
- **Resolução de problemas**

### Exemplos de Campos Reais:
```
✅ "Capacidade de Avaliação Inicial do Paciente"
✅ "Planejamento e Organização do Tratamento"
✅ "Raciocínio Clínico na Análise de Casos"
✅ "Conhecimento Teórico Aplicado"
✅ "Interpretação de Dados Clínicos"
```

## 🔧 2. Execução Técnica (Technical Execution)

### Descrição
Avalia a habilidade manual, precisão e qualidade na execução de procedimentos fisioterapêuticos.

### Campos que são categorizados como Execução Técnica:

#### Habilidade e Execução
- **Habilidade de execução** de procedimentos
- **Execução técnica**
- **Precisão na realização**
- **Técnica de procedimento**

#### Procedimentos Específicos
- **Aspiração** (nasotraqueal, orotraqueal)
- **Ventilação mecânica**
- **Posicionamento** do paciente
- **Mobilização** precoce
- **Desmame** ventilatório
- **Técnicas fisioterapêuticas** específicas

#### Destreza e Precisão
- **Destreza manual**
- **Habilidade manual**
- **Precisão** na execução
- **Segurança do procedimento**
- **Realização de forma segura e eficaz**
- **Nível de auxílio** necessário

### Exemplos de Campos Reais:
```
✅ "Execução Técnica de Aspiração Nasotraqueal"
✅ "Habilidade na Realização de Procedimentos"
✅ "Precisão na Execução de Técnicas"
✅ "Aspiração Nasotraqueal - Segurança e Eficácia"
✅ "Destreza Manual em Procedimentos"
✅ "Nível de Auxílio Necessário"
```

## 👥 3. Profissionalismo (Professionalism)

### Descrição
Avalia a postura profissional, comunicação, ética e comprometimento do aluno.

### Campos que são categorizados como Profissionalismo:

#### Comunicação
- **Habilidade no uso de termos** técnicos
- **Comunicação interprofissional**
- **Comunicação com paciente**
- **Comunicação com equipe**
- **Relacionamento**
- **Registro em prontuário**

#### Ética e Comportamento
- **Comportamento ético**
- **Ética profissional**
- **Profissionalismo**
- **Postura profissional**
- **Respeito**
- **Empatia**

#### Responsabilidade e Comprometimento
- ⭐ **Responsabilidade** profissional
- ⭐ **Pontualidade**
- ⭐ **Assiduidade**
- ⭐ **Frequência**
- ⭐ **Comparecimento** regular
- ⭐ **Regularidade** e exatidão
- ⭐ **Comprometimento**
- ⭐ **Dedicação**

#### Iniciativa e Interesse
- **Iniciativa**
- **Interesse**
- **Proatividade**
- **Busca por conhecimento**
- **Autonomia**

#### Trabalho em Equipe
- **Trabalho em equipe**
- **Colaboração**
- **Cooperação**

### Exemplos de Campos Reais:
```
✅ "Assiduidade - Frequência e Comparecimento com Regularidade e Exatidão"
✅ "Comunicação Interprofissional com a Equipe"
✅ "Comportamento Ético e Profissional"
✅ "Iniciativa e Interesse nas Atividades"
✅ "Responsabilidade e Comprometimento"
✅ "Trabalho em Equipe e Colaboração"
```

## 📊 Exemplo Prático: Análise do Caso de Bruna

### Campo do Formulário:
```
"Assiduidade frequencia comparecimento com regularidade e exatidao 
 ao lugar onde tem de desempenhar suas funcoes = 10.0"
```

### Análise do Sistema:

**1. Normalização do Nome do Campo:**
```javascript
// Nome original (depois de sanitização):
"AssiduidadeFrequenciaComparecimentoComRegularidadeEExatidao..."

// Nome formatado para exibição:
"Assiduidade Frequencia Comparecimento com Regularidade e Exatidao..."
```

**2. Categorização:**
```javascript
// O sistema detecta as seguintes palavras-chave:
- "ASSIDUIDADE" → Match com /ASSIDUIDADE/i
- "FREQUENCIA" → Match com /FREQUENCIA/i  
- "COMPARECIMENTO" → Match com /COMPARECIMENTO/i
- "REGULARIDADE" → Match com /REGULARIDADE/i
- "EXATIDÃO" → Match com /EXATIDAO/i

// Todas essas palavras estão no array `profissionalismo`
// Portanto, a nota 10.0 é categorizada como PROFISSIONALISMO ✅
```

**3. Resultado no Dashboard:**
```
Raciocínio Clínico: 0.0 (nenhum campo desta categoria)
Execução Técnica: 8.6 (média dos campos técnicos)
Profissionalismo: 8.2 (incluindo a nota 10.0 de Assiduidade)
                       ↑ média ajustada com o novo campo
```

## 🔍 Sistema de Diagnóstico

### Logs no Console

O sistema agora gera logs detalhados para ajudar a identificar campos não categorizados:

```javascript
[calculatePracticeSummary] Categorization Summary:
  Raciocínio Clínico: 5 fields
  Execução Técnica: 8 fields
  Profissionalismo: 12 fields

// Se houver campos não categorizados:
[calculatePracticeSummary] ⚠️ Uncategorized fields found: 3
[calculatePracticeSummary] Sample uncategorized fields:
  - "HabilidadeEmXYZ" = 7.5 (from NP_Modulo1)
  - "CompetenciaABC" = 9.0 (from NP_Modulo2)
  - "AvaliacaoDEF" = 8.0 (from NP_Modulo3)
[calculatePracticeSummary] 💡 Consider adding patterns to map these fields to competencies
```

### Como Usar os Logs:

1. **Abra o Console do Navegador** (F12)
2. **Navegue até a aba de Notas Práticas** de um aluno
3. **Procure por logs** `[calculatePracticeSummary]`
4. **Verifique se há campos não categorizados** (⚠️ warnings)
5. **Se houver**, adicione novos padrões regex ao mapeamento

## ✅ Como Adicionar Novos Padrões

Se você encontrar um campo que não está sendo categorizado corretamente:

### Passo 1: Identifique o Campo
Copie o nome do campo dos logs de diagnóstico.

### Passo 2: Determine a Categoria
Decida em qual das três competências o campo deveria ser classificado:
- Raciocínio Clínico?
- Execução Técnica?
- Profissionalismo?

### Passo 3: Adicione o Padrão Regex
Edite o arquivo `script.js` na função `calculatePracticeSummary()`:

```javascript
const map = {
    raciocinio: [
        // Adicione aqui padrões para Raciocínio Clínico
        /NOVO_PADRAO/i,
    ],
    tecnica: [
        // Adicione aqui padrões para Execução Técnica
        /NOVO_PADRAO/i,
    ],
    profissionalismo: [
        // Adicione aqui padrões para Profissionalismo
        /NOVO_PADRAO/i,
    ]
};
```

### Exemplo Prático:

Se você encontrar um campo chamado "HabilidadeEmTrabalhoEmGrupo" que não está categorizado:

```javascript
profissionalismo: [
    // ... padrões existentes ...
    /TRABALHO.*GRUPO/i,  // ← Adicione este padrão
]
```

## 🎯 Garantias do Sistema

### ✅ Cobertura Abrangente

O mapeamento atual cobre:
- **Raciocínio Clínico**: 30+ padrões regex
- **Execução Técnica**: 25+ padrões regex  
- **Profissionalismo**: 40+ padrões regex

### ✅ Flexibilidade Linguística

Todos os padrões suportam:
- ✅ Com e sem acentos (`AVALIAÇÃO` e `AVALIACAO`)
- ✅ Maiúsculas e minúsculas (case-insensitive com `/i`)
- ✅ Variações de espaçamento

### ✅ Diagnóstico Automático

O sistema automaticamente:
- ✅ Identifica campos não categorizados
- ✅ Reporta no console para análise
- ✅ Sugere adicionar novos padrões

## 📚 Referências

### Baseado em:

1. **Matriz de Competências USP** - Universidade de São Paulo
2. **Diretrizes COFFITO** - Conselho Federal de Fisioterapia e Terapia Ocupacional
3. **Avaliação de Competências INCOR** - Instituto do Coração - HC-FMUSP

### Categorias Alinhadas com:

- ✅ CanMEDS Framework (competências médicas)
- ✅ ACGME Core Competencies (competências clínicas)
- ✅ Bloom's Taxonomy (níveis de conhecimento)

## 🚀 Melhorias Futuras

### Planejadas:
1. **Machine Learning** - Categorização automática com IA
2. **Interface de Configuração** - Editor visual de padrões
3. **Relatórios Personalizados** - Export por competência
4. **Benchmarking** - Comparação entre turmas

---

**Última Atualização:** 2025-11-17  
**Versão:** 2.0 (Enhanced Mapping System)  
**Autores:** GitHub Copilot Agent & Equipe INCOR
