# Guia Completo: Notas SUB (Substitutivas) no Portal de Ensino InCor

## 📋 Visão Geral

Este guia explica como o sistema de notas substitutivas (SUB) funciona e como garantir que apareçam corretamente no site.

## 🔍 Como o Sistema Detecta Notas SUB

### Prefixos Reconhecidos

O sistema reconhece automaticamente colunas com os seguintes formatos (case-insensitive):
- `Sub` seguido diretamente pelo nome da disciplina: `SubAnatomopatologia`, `SubDoencasCardiacas` **(formato usado no Firebase)**
- `Sub/` com barra: `Sub/Anatomopatologia`
- `Sub-` com hífen: `Sub-Anatomopatologia`
- `Sub_` com underscore: `Sub_Anatomopatologia`

### Exemplo de Estrutura Correta

Na planilha **NotasTeoricas** do Google Sheets, as colunas devem estar nomeadas assim:

| EmailHC | NomeCompleto | Anatomopatologia | SubAnatomopatologia | Bases | SubBases | VM | SubVM |
|---------|--------------|------------------|---------------------|-------|----------|----|---------
| aluno@hc.fm.usp.br | João Silva | 5,5 | 7,0 | 8,5 | | 6,0 | 7,5 |

**Importante**: 
- Coluna da disciplina normal: `Anatomopatologia`
- Coluna da prova SUB: `SubAnatomopatologia` (sem separador, formato do Firebase)
- Também aceito: `Sub/Anatomopatologia`, `Sub-Anatomopatologia`, `Sub_Anatomopatologia`

## 🎯 Lógica de Substituição

O sistema aplica a seguinte lógica:

1. **Se nota SUB existe (> 0) E é MAIOR que a original**: A nota SUB **substitui** a nota original
2. **Se nota SUB não existe, é zero, ou é MENOR/IGUAL à original**: Usa a nota original
3. **Para cálculo de médias**: Sempre usa a nota efetiva (SUB se for maior, senão original)

### Exemplos

#### Caso 1: Aluno melhorou na SUB
```
Anatomopatologia: 5,5 (original)
SubAnatomopatologia: 7,0 (SUB é maior)
→ Nota exibida: 7,0
→ Nota usada para média: 7,0
→ Badge "SUB" exibido ✅
```

#### Caso 2: SUB não melhorou (igual ou pior)
```
Bases: 6,0 (original)
SubBases: 5,5 (SUB é menor)
→ Nota exibida: 6,0 (mantém original)
→ Nota usada para média: 6,0
→ Sem badge SUB (SUB foi pior)
```

#### Caso 3: Melhoria pequena conta
```
VM: 5,5 (original)
SubVM: 5,6 (SUB é 0,1 maior)
→ Nota exibida: 5,6
→ Nota usada para média: 5,6
→ Badge "SUB" exibido ✅
```

#### Caso 4: Aluno não precisou de SUB
```
Bases: 8,5 (original, >= 7)
SubBases: (vazio)
→ Nota exibida: 8,5
→ Nota usada para média: 8,5
→ Sem badge SUB
```

## 📊 Onde as Notas SUB Aparecem no Site

### 1. Na Aba "Notas Teóricas" do Aluno

#### a) Accordion de Módulos
Cada disciplina mostra:
- **Coluna "Original"**: Nota da avaliação regular
- **Coluna "SUB"**: Nota da prova substitutiva (se houver)
- **Badge "SUB"**: Indicador visual quando SUB foi aplicada
- **Status**: "Aprovado" ou "Atenção" baseado na nota efetiva

#### b) Seção "Provas Substitutivas"
No final da página, lista todas as provas SUB que o aluno fez:
- Nome da disciplina
- Nota obtida na prova SUB
- Status (Aprovado/Atenção)

### 2. No Dashboard Principal

As médias por módulo já consideram automaticamente as notas SUB na conta.

## 🔧 Como Configurar no Google Sheets

### Passo 1: Verificar Estrutura da Planilha

1. Abra a planilha Google Sheets
2. Vá para a aba **NotasTeoricas**
3. Verifique se existe uma coluna para cada disciplina que pode ter SUB
4. Verifique se existe uma coluna `Sub/[NomeDaDisciplina]` correspondente

### Passo 2: Nomear Colunas Corretamente

**✅ CORRETO:**
```
| Anatomopatologia | SubAnatomopatologia |
| Bases | SubBases |
| VM | SubVM |
```

**❌ INCORRETO:**
```
| Anatomopatologia | Anatomopatologia SUB |  ← Sem prefixo "Sub"
| Bases | SUBBases |                        ← Sem capitalização correta
| VM | Sub VM |                             ← Espaço em vez de juntar
```

### Passo 3: Preencher Dados

- **Nota Original**: Sempre preencher na coluna da disciplina
- **Nota SUB**: Preencher apenas quando o aluno fez a prova substitutiva
- **Células vazias**: OK deixar vazio se não fez SUB
- **Valor 0**: OK usar 0 se não fez SUB

### Passo 4: Exportar para Firebase

Execute a função do Google Apps Script:
```
Extensões > Apps Script > enviarTodasAsAbasParaFirebase()
```

Ou configure o trigger automático para export a cada 5 minutos.

## 🐛 Diagnóstico de Problemas

### Problema: Notas SUB não aparecem no site

#### Passo 1: Verificar Logs do Console

1. Abra o site
2. Abra o Console do Navegador (F12)
3. Navegue para um aluno
4. Vá para "Notas Teóricas"
5. Procure por estas mensagens:

```javascript
[renderTabNotasTeoricas v37] Keys in notas: [lista de chaves]
[renderTabNotasTeoricas v37] 🔍 SUB-prefixed keys found: [chaves SUB]
[findSubDisciplinesFromData] Found SUB key: "Sub/Anatomopatologia" -> ...
[findSubDisciplinesFromData] ✅ Total SUB disciplines found: X
```

#### Passo 2: Interpretar os Logs

**Se aparecer "SUB-prefixed keys found: []" (lista vazia):**
- ❌ As colunas na planilha não têm o prefixo correto
- Solução: Renomear colunas no Google Sheets (ex: `Sub/Anatomopatologia`)

**Se aparecer "Total SUB disciplines found: 0" mas há chaves SUB:**
- ❌ As células estão vazias ou com valor 0
- Solução: Preencher as notas SUB nas células apropriadas

**Se aparecer "Total SUB disciplines found: X" (X > 0):**
- ✅ Sistema está detectando as notas SUB corretamente
- As notas devem aparecer na seção "Provas Substitutivas"

#### Passo 3: Verificar Firebase Diretamente

1. Acesse o Firebase Console
2. Vá para Realtime Database
3. Navegue até: `exportAll/NotasTeoricas/dados`
4. Encontre o registro do aluno
5. Verifique se as chaves `Sub/[Disciplina]` estão presentes

**Exemplo de estrutura esperada:**
```json
{
  "exportAll": {
    "NotasTeoricas": {
      "dados": [
        {
          "EmailHC": "aluno@hc.fm.usp.br",
          "NomeCompleto": "João Silva",
          "Anatomopatologia": "5,5",
          "SubAnatomopatologia": "7,0",
          "Bases": "8,5",
          "SubBases": "",
          "VM": "6,0",
          "SubVM": "5,5"
        }
      ]
    }
  }
}
```

## 📝 Disciplinas Mapeadas

O sistema já está configurado para procurar SUB nas seguintes disciplinas:

### Fisioterapia I
- Anatomopatologia → `SubAnatomopatologia`
- Bases → `SubBases`
- Doenças Pulmonares → `SubDoençasPulmonares` ou `SubDoencasPulmonares`
- Doenças Cardíacas → `SubDoençasCardíacas` ou `SubDoencasCardiacas`
- Proc. Cirurgico → `SubProc.Cirurgico`
- Avaliação → `SubAvaliacao` (sem acento)
- VM → `SubVM`

### Fisioterapia II
- Técnicas e Recursos → `SubTécnicaseRecursos` ou `SubTecnicaseRecursos`
- Diag. Imagem → `SubDiag.Imagem`

### Fisioterapia III
- Fisio aplicada → `SubFisioaplicada`
- UTI → `SubUTI`

### Fisioterapia IV
- Pediatria → `SubPediatria`
- Mobilização → `SubMobilização` ou `SubMobilizacao`
- Reab. Pulmonar → `SubReab.Pulmonar`

### Disciplinas Complementares
- M. Cientifica → `SubM.Cientifica`
- Saúde e politicas → `SubSaúdeepoliticas` ou `SubSaudeepoliticas`
- Farmacoterapia → `SubFarmacoterapia`
- Bioética → `SubBioética` ou `SubBioetica`

## 🔄 Adicionando Novas Disciplinas SUB

Para adicionar uma nova disciplina que pode ter prova substitutiva:

1. **No Google Sheets**: Adicionar coluna `Sub/[NomeDaDisciplina]`
2. **No código** (`script.js`): Adicionar ao objeto `mediaGroups`:

```javascript
{ nome: 'Nova Disciplina', subKey: generateSubKey('Nova Disciplina') }
```

3. Exportar dados para Firebase
4. O sistema detectará automaticamente

**Nota**: A função `findSubDisciplinesFromData()` já descobre automaticamente TODAS as colunas com prefixo SUB, mesmo que não estejam no mapeamento manual.

## ✅ Checklist de Verificação

Antes de reportar um problema, verifique:

- [ ] As colunas na planilha têm o prefixo `Sub/` correto
- [ ] As células contêm valores numéricos (não estão vazias quando deveriam ter nota)
- [ ] Os dados foram exportados para o Firebase (última atualização recente)
- [ ] O console do navegador mostra que chaves SUB foram encontradas
- [ ] A função `findSubDisciplinesFromData()` retorna > 0 disciplinas

## 🎨 Exemplos Visuais

### Accordion Expandido
```
┌──────────────────────────────────────────────────┐
│ 📘 Fisioterapia I                         8,2 ▾  │
├──────────────────────────────────────────────────┤
│  ┌──────────────────────┬──────────┬──────────┐ │
│  │ Anatomopatologia     │    5,5   │   7,0    │ │
│  │ [SUB Badge]  Aprovado│ Original │   SUB    │ │
│  └──────────────────────┴──────────┴──────────┘ │
│  ┌──────────────────────┬──────────┬──────────┐ │
│  │ Bases                │    8,5   │    -     │ │
│  │             Aprovado │ Original │   SUB    │ │
│  └──────────────────────┴──────────┴──────────┘ │
└──────────────────────────────────────────────────┘
```

### Seção de Provas Substitutivas
```
┌────────────────────────────────────────────────┐
│ 🔄 Provas Substitutivas                        │
│    2 disciplinas com prova substitutiva        │
├────────────────────────────────────────────────┤
│  Anatomopatologia     [Aprovado]        7,0   │
│  VM                   [Aprovado]        7,5   │
└────────────────────────────────────────────────┘
```

## 📞 Suporte

Se após seguir este guia as notas SUB ainda não aparecerem:

1. Copie os logs do console do navegador
2. Verifique a estrutura dos dados no Firebase
3. Confirme que as colunas estão nomeadas corretamente
4. Entre em contato com o suporte técnico

---

**Última atualização**: Janeiro 2026
**Versão do Sistema**: v37 - InCor Professional Redesign
