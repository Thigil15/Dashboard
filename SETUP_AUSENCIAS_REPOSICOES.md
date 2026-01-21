# Sistema de Ausências e Reposições - Setup Rápido

## 🚀 Como Ativar o Sistema

### Passo 1: Criar as Abas na Planilha

1. Abra sua planilha do Dashboard no Google Sheets
2. Clique em **Extensões > Apps Script**
3. No editor do Apps Script, cole o conteúdo do arquivo `scripts/AusenciasReposicoes.gs`
4. No editor do Apps Script, execute a função:
   ```javascript
   criarAbasAusenciasReposicoes()
   ```
5. Autorize o script quando solicitado
6. As abas "Ausencias" e "Reposicoes" serão criadas automaticamente!

### Passo 2: Ativar Sincronização Automática

No Apps Script, execute:
```javascript
criarGatilhosAutomaticos()
```

Isso ativa a sincronização automática com o Firebase.

### Passo 3: Verificar Interface Web

1. Acesse sua interface web do Dashboard
2. Você verá duas novas abas na navegação: **Ausências** e **Reposições**
3. Os dados serão sincronizados automaticamente do Google Sheets para o Firebase e aparecem na interface em tempo real

## 📝 Como Usar

### Opção 1: Registrar Manualmente na Planilha

Basta adicionar uma nova linha nas abas "Ausencias" ou "Reposicoes" com os dados:

**Ausencias**:
- NomeCompleto
- EmailHC
- Curso
- Escala
- DataAusencia
- Unidade
- Horario
- Motivo

**Reposicoes**:
- NomeCompleto
- EmailHC
- Curso
- Escala
- Unidade
- Horario
- Motivo
- DataReposicao

Os dados aparecerão automaticamente na interface web!

### Opção 2: Enviar via API (Site Externo)

1. **Publique o Apps Script como Web App**:
   - No Apps Script: **Implantar > Nova implantação**
   - Tipo: Aplicativo da Web
   - Executar como: Eu (seu email)
   - Quem tem acesso: Qualquer pessoa
   - Copie a URL gerada

2. **Use o formulário de exemplo**:
   - Abra o arquivo `docs/exemplo-form-ausencias-reposicoes.html`
   - Substitua `YOUR_DEPLOYMENT_ID` pela URL do seu deployment
   - Hospede o HTML em seu servidor ou abra localmente
   - Preencha e envie!

3. **Integre com seu sistema**:
   
   **Python**:
   ```python
   import requests
   
   url = "SUA_URL_DO_DEPLOYMENT"
   data = {
       "tipo": "ausencia",
       "NomeCompleto": "João Silva",
       "EmailHC": "joao@hc.fm.usp.br",
       "Curso": "Fisioterapia",
       "Escala": "1",
       "DataAusencia": "2024-01-15",
       "Unidade": "UTI",
       "Horario": "08:00-12:00",
       "Motivo": "Doença"
   }
   
   response = requests.post(url, json=data)
   print(response.json())
   ```

   **JavaScript**:
   ```javascript
   const url = "SUA_URL_DO_DEPLOYMENT";
   
   fetch(url, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
           tipo: "reposicao",
           NomeCompleto: "Maria Santos",
           EmailHC: "maria@hc.fm.usp.br",
           Curso: "Fisioterapia",
           Escala: "2",
           Unidade: "Enfermaria",
           Horario: "14:00-18:00",
           Motivo: "Reposição agendada",
           DataReposicao: "2024-01-20"
       })
   })
   .then(response => response.json())
   .then(data => console.log(data));
   ```

## 🔍 Recursos da Interface

### Aba Ausências
- ✅ Visualização de todas as ausências em tempo real
- 🔍 Busca por nome, email ou curso
- 🔄 Botão de atualização
- ⏰ Indicador de última sincronização

### Aba Reposições
- ✅ Visualização de todas as reposições em tempo real
- 🔍 Busca por nome, email ou curso
- 🔄 Botão de atualização
- ⏰ Indicador de última sincronização

## 🛠️ Funções Úteis

### Buscar ausências de um aluno
```javascript
const ausencias = buscarAusenciasAluno("aluno@hc.fm.usp.br");
Logger.log(ausencias);
```

### Buscar reposições de um aluno
```javascript
const reposicoes = buscarReposicoesAluno("aluno@hc.fm.usp.br");
Logger.log(reposicoes);
```

### Verificar status dos gatilhos
```javascript
verificarStatusGatilhos();
```

## 📊 Fluxo de Dados

```
Site/API → Google Apps Script → Google Sheets → Firebase → Interface Web
         (doPost)              (Auto Sync)    (Listeners)
```

## ❓ Problemas Comuns

**❌ As abas não aparecem**
- Execute `criarAbasAusenciasReposicoes()` no Apps Script

**❌ Dados não aparecem na web**
- Verifique se os gatilhos estão ativos: `verificarStatusGatilhos()`
- Confirme que há dados nas abas do Sheets
- Verifique o Firebase Console

**❌ Erro ao enviar POST**
- Verifique se o campo "tipo" é "ausencia" ou "reposicao"
- Confirme que o email está válido
- Verifique se o Apps Script está publicado como Web App

## 📖 Documentação Completa

Para mais detalhes, consulte:
- `docs/AUSENCIAS_REPOSICOES_GUIA.md` - Guia completo
- `docs/exemplo-form-ausencias-reposicoes.html` - Formulário de exemplo

## 🎯 Próximos Passos

1. [x] Criar abas na planilha
2. [x] Ativar sincronização automática
3. [ ] Testar registro via planilha
4. [ ] Testar registro via API
5. [ ] Verificar dados na interface web
6. [ ] Treinar usuários
7. [ ] Monitorar logs

## 💡 Dicas

- Os dados são sincronizados automaticamente em tempo real
- Você pode editar diretamente na planilha e os dados aparecem na web
- Use o formulário de exemplo como base para criar seu próprio sistema
- Todos os campos obrigatórios são validados automaticamente

---

**Desenvolvido para o Portal de Ensino InCor - HC FMUSP**
