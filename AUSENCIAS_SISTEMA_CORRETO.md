# 🎯 Sistema de Ausências - Guia de Uso Correto

## ✅ Sistema Atual (Correto)

O sistema de registro de ausências foi modernizado e agora funciona da seguinte forma:

### 📋 Como Registrar Ausências

1. **Via Interface Web (index.html)**
   - Acesse a aba "Ausências" no dashboard
   - Clique em "Registrar Ausência"
   - Preencha o formulário com:
     - Nome Completo
     - Email HC
     - Curso
     - Escala
     - Data da Ausência
     - Unidade
     - Horário
     - Motivo
   - Clique em "Salvar"

2. **Via POST para Google Apps Script**
   - URL: `https://script.google.com/macros/s/AKfycbz-o8_PfTuFHgyPSaOxdfM_NUeCexOYSzpFPcxUak-sKF81XTuwDvTSlI7aNI0UFEMF2w/exec`
   - Método: POST
   - Content-Type: application/json
   - **IMPORTANTE**: Incluir campo `"tipo": "ausencia"` no JSON
   - Exemplo:
     ```json
     {
       "tipo": "ausencia",
       "NomeCompleto": "João Silva",
       "EmailHC": "joao.silva@hc.fm.usp.br",
       "Curso": "Fisioterapia",
       "Escala": "1",
       "DataAusencia": "21/01/2026",
       "Unidade": "UTI",
       "Horario": "07h-12h",
       "Motivo": "Doença"
     }
     ```

### 🗂️ Onde os Dados São Armazenados

- **Ausências**: Aba "Ausencias" (8 colunas)
- **Reposições**: Aba "Reposicoes" (8 colunas)
- **Não vai mais para**: PontoPratica, PontoTeoria ou outras abas

### 🔑 Campo Crítico: "tipo"

O campo `tipo` determina para onde os dados vão:

| Valor de "tipo" | Destino |
|----------------|---------|
| `"ausencia"` | Aba "Ausencias" |
| `"reposicao"` | Aba "Reposicoes" |
| (não enviado ou outro valor) | PontoPratica/PontoTeoria (sistema de ponto) |

## ❌ Sistema Antigo (Removido)

As seguintes funcionalidades foram **REMOVIDAS**:

1. ❌ Menu "📋 Ausências" na planilha
2. ❌ Função "Processar Todas as Ausências"
3. ❌ Processamento automático de ausências às 22h
4. ❌ Identificação automática de células vazias como ausências
5. ❌ Aba "AusenciasReposicoes" (antiga - agora são duas abas separadas)

### Por Que Foram Removidas?

- O sistema antigo processava células vazias nas escalas como ausências
- Era propenso a erros e registros duplicados
- Não permitia registro direto de motivos e justificativas
- O novo sistema é mais preciso e permite registro completo de informações

## 🛠️ Solução de Problemas

### Problema: Ausência vai para PontoPratica

**Causa**: O campo `tipo` não está sendo enviado ou está com valor incorreto.

**Solução**:
1. Verifique se o formulário/sistema está enviando `"tipo": "ausencia"`
2. Verifique se está usando a URL correta do Apps Script
3. Use o formulário do dashboard (index.html) que já envia corretamente

### Problema: Aba "Ausencias" não encontrada

**Solução**:
1. Execute a função `criarAbasAusenciasReposicoes()` no Apps Script
2. Isso criará as abas "Ausencias" e "Reposicoes" com os cabeçalhos corretos

## 📞 Fluxo de Dados Completo

```
Interface Web (index.html)
    ↓
    Envia POST com tipo="ausencia"
    ↓
doPost() em Code.gs
    ↓
    Verifica campo "tipo"
    ↓
doPostAusenciasReposicoes()
    ↓
registrarAusencia()
    ↓
Insere na aba "Ausencias"
    ↓
Sincroniza com Firebase (se configurado)
```

## 📝 Cabeçalhos das Abas

### Aba "Ausencias"
```
NomeCompleto | EmailHC | Curso | Escala | DataAusencia | Unidade | Horario | Motivo
```

### Aba "Reposicoes"
```
NomeCompleto | EmailHC | Curso | Escala | Unidade | Horario | Motivo | DataReposicao
```

## ✨ Funcionalidades Mantidas

- ✅ Registro de ausências via web
- ✅ Registro de reposições via web
- ✅ Busca de alunos
- ✅ Visualização de ausências/reposições registradas
- ✅ Sincronização automática com Firebase
- ✅ Validação de dados (email, campos obrigatórios)
- ✅ Interface moderna e responsiva

---

**Última atualização**: 21/01/2026  
**Versão**: 2.0 (Sistema Modernizado)
