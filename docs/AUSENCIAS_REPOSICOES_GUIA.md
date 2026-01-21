# Sistema de Ausências e Reposições - Documentação

## Visão Geral

O sistema de Ausências e Reposições permite registrar e gerenciar faltas de alunos e suas respectivas reposições através de uma interface web integrada ao Google Apps Script.

## Estrutura das Abas

### Aba "Ausencias"
Colunas:
- **NomeCompleto**: Nome completo do aluno
- **EmailHC**: Email institucional (@hc.fm.usp.br)
- **Curso**: Curso do aluno
- **Escala**: Número da escala (1-12)
- **DataAusencia**: Data da ausência (formato: DD/MM/YYYY ou YYYY-MM-DD)
- **Unidade**: Unidade hospitalar (ex: UTI, Enfermaria, Cardiopediatria)
- **Horario**: Horário da ausência (ex: 08:00-12:00)
- **Motivo**: Motivo da ausência

### Aba "Reposicoes"
Colunas:
- **NomeCompleto**: Nome completo do aluno
- **EmailHC**: Email institucional (@hc.fm.usp.br)
- **Curso**: Curso do aluno
- **Escala**: Número da escala (1-12)
- **Unidade**: Unidade hospitalar
- **Horario**: Horário da reposição
- **Motivo**: Motivo/descrição da reposição
- **DataReposicao**: Data da reposição (formato: DD/MM/YYYY ou YYYY-MM-DD)

## Setup Inicial

### 1. Criar as Abas na Planilha

Execute a função `criarAbasAusenciasReposicoes()` no Google Apps Script:

1. Abra a planilha do Dashboard
2. Vá em **Extensões > Apps Script**
3. No editor, execute: `criarAbasAusenciasReposicoes()`
4. As abas "Ausencias" e "Reposicoes" serão criadas automaticamente com os cabeçalhos corretos
5. As abas serão posicionadas ao lado da aba "Frequência"

### 2. Configurar Sincronização Automática

O sistema já possui sincronização automática configurada. Para verificar ou reconfigurar:

```javascript
// Executar no Apps Script para ativar gatilhos automáticos
criarGatilhosAutomaticos();
```

Isso ativa:
- Sincronização automática ao editar células (onEdit)
- Sincronização ao adicionar/remover linhas (onChange)
- Sincronização diária às 21h (backup)

### 3. Configurar Firebase

As novas abas serão sincronizadas automaticamente para o Firebase nos seguintes caminhos:
- `exportAll/Ausencias/dados` - Dados de ausências
- `exportAll/Reposicoes/dados` - Dados de reposições

## API para Integração Externa

### Endpoint POST

**URL**: `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec`

### Registrar Ausência

```json
POST /exec
Content-Type: application/json

{
  "tipo": "ausencia",
  "NomeCompleto": "João Silva",
  "EmailHC": "joao.silva@hc.fm.usp.br",
  "Curso": "Fisioterapia",
  "Escala": "1",
  "DataAusencia": "2024-01-15",
  "Unidade": "UTI",
  "Horario": "08:00-12:00",
  "Motivo": "Doença"
}
```

**Resposta de Sucesso**:
```json
{
  "success": true,
  "message": "Ausência registrada com sucesso",
  "data": {
    "nome": "João Silva",
    "data": "2024-01-15"
  }
}
```

**Resposta de Erro**:
```json
{
  "success": false,
  "message": "Email inválido"
}
```

### Registrar Reposição

```json
POST /exec
Content-Type: application/json

{
  "tipo": "reposicao",
  "NomeCompleto": "João Silva",
  "EmailHC": "joao.silva@hc.fm.usp.br",
  "Curso": "Fisioterapia",
  "Escala": "1",
  "Unidade": "Enfermaria",
  "Horario": "14:00-18:00",
  "Motivo": "Reposição de falta anterior",
  "DataReposicao": "2024-01-20"
}
```

## Validações

O sistema valida automaticamente:

### Ausências:
- ✅ Nome completo é obrigatório
- ✅ Email HC é obrigatório e deve ter formato válido
- ✅ Data da ausência é obrigatória

### Reposições:
- ✅ Nome completo é obrigatório
- ✅ Email HC é obrigatório e deve ter formato válido
- ✅ Data da reposição é obrigatória

## Funções Disponíveis no Apps Script

### Criar/Configurar Abas
```javascript
criarAbasAusenciasReposicoes()
```
Cria as abas "Ausencias" e "Reposicoes" com os cabeçalhos corretos se elas não existirem.

### Registrar Ausência Programaticamente
```javascript
registrarAusencia({
  NomeCompleto: "Maria Santos",
  EmailHC: "maria.santos@hc.fm.usp.br",
  Curso: "Fisioterapia",
  Escala: "2",
  DataAusencia: "2024-01-10",
  Unidade: "Cardiopediatria",
  Horario: "08:00-12:00",
  Motivo: "Compromisso familiar"
})
```

### Registrar Reposição Programaticamente
```javascript
registrarReposicao({
  NomeCompleto: "Maria Santos",
  EmailHC: "maria.santos@hc.fm.usp.br",
  Curso: "Fisioterapia",
  Escala: "2",
  Unidade: "Enfermaria",
  Horario: "14:00-18:00",
  Motivo: "Aula de reposição",
  DataReposicao: "2024-01-25"
})
```

### Buscar Ausências de um Aluno
```javascript
const ausencias = buscarAusenciasAluno("joao.silva@hc.fm.usp.br");
console.log(ausencias);
// Retorna array com todas as ausências do aluno
```

### Buscar Reposições de um Aluno
```javascript
const reposicoes = buscarReposicoesAluno("joao.silva@hc.fm.usp.br");
console.log(reposicoes);
// Retorna array com todas as reposições do aluno
```

## Interface Web

O sistema adiciona duas novas abas à navegação principal:

### Aba "Ausências"
- 📋 Visualização de todas as ausências registradas
- 🔍 Campo de busca para filtrar por nome, email ou curso
- 🔄 Botão de atualização para sincronizar dados
- ⏰ Indicador de última sincronização

### Aba "Reposições"
- 📋 Visualização de todas as reposições registradas
- 🔍 Campo de busca para filtrar por nome, email ou curso
- 🔄 Botão de atualização para sincronizar dados
- ⏰ Indicador de última sincronização

## Sincronização em Tempo Real

Os dados são sincronizados automaticamente:
1. **Google Sheets → Firebase**: Através dos gatilhos onEdit e onChange
2. **Firebase → Interface Web**: Através de listeners em tempo real
3. **Interface Web**: Atualizada automaticamente quando novos dados chegam

## Fluxo de Dados

```
┌─────────────────┐
│  Site Externo   │
│  (POST API)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  doPost()       │
│  (Apps Script)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Sheets         │
│  Ausencias/     │
│  Reposicoes     │
└────────┬────────┘
         │
         ▼ (Auto Sync)
┌─────────────────┐
│  Firebase       │
│  Realtime DB    │
└────────┬────────┘
         │
         ▼ (Listeners)
┌─────────────────┐
│  Interface Web  │
│  Dashboard      │
└─────────────────┘
```

## Troubleshooting

### As abas não aparecem na planilha
Execute `criarAbasAusenciasReposicoes()` no Apps Script

### Dados não aparecem na interface web
1. Verifique se as abas existem na planilha
2. Verifique se há dados nas abas
3. Confirme que a sincronização automática está ativa: `verificarStatusGatilhos()`
4. Verifique o Firebase console para confirmar que os dados foram sincronizados

### Erro ao enviar POST
1. Verifique se o campo "tipo" está correto ("ausencia" ou "reposicao")
2. Confirme que todos os campos obrigatórios estão presentes
3. Verifique o formato do email (deve ser válido)
4. Confirme que o deployment do Apps Script está publicado como Web App

### Sincronização não está funcionando
Execute:
```javascript
removerGatilhosAutomaticos();
criarGatilhosAutomaticos();
```

## Exemplos de Uso

### Exemplo Python - Registrar Ausência
```python
import requests
import json

url = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"

ausencia = {
    "tipo": "ausencia",
    "NomeCompleto": "Pedro Oliveira",
    "EmailHC": "pedro.oliveira@hc.fm.usp.br",
    "Curso": "Fisioterapia",
    "Escala": "3",
    "DataAusencia": "2024-01-18",
    "Unidade": "UTI",
    "Horario": "08:00-12:00",
    "Motivo": "Atestado médico"
}

response = requests.post(url, json=ausencia)
print(response.json())
```

### Exemplo JavaScript - Registrar Reposição
```javascript
const url = "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec";

const reposicao = {
  tipo: "reposicao",
  NomeCompleto: "Ana Costa",
  EmailHC: "ana.costa@hc.fm.usp.br",
  Curso: "Fisioterapia",
  Escala: "4",
  Unidade: "Enfermaria",
  Horario: "14:00-18:00",
  Motivo: "Reposição agendada",
  DataReposicao: "2024-01-22"
};

fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(reposicao)
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Erro:', error));
```

## Suporte

Para problemas ou dúvidas:
1. Verifique os logs do Apps Script: **Extensões > Apps Script > View > Logs**
2. Verifique o console do navegador na interface web (F12)
3. Confirme as regras do Firebase permitem leitura/escrita
4. Entre em contato com o administrador do sistema
