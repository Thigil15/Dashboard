# Como Configurar o Apps Script para Servir Dados via URL

Este guia explica como implantar o Apps Script e configurar o site para buscar dados diretamente do Google Sheets.

## Passo 1: Copiar o Código do Apps Script

1. Abra sua planilha do Google Sheets
2. Vá em **Extensões > Apps Script**
3. Cole o conteúdo do arquivo `scripts/Code.gs` no editor
4. Salve o projeto com um nome significativo (ex: "Dashboard Backend")

## Passo 2: Implantar como Aplicativo Web

1. No editor do Apps Script, clique em **Implantar > Nova implantação**
2. Clique no ícone de engrenagem e selecione **Aplicativo da Web**
3. Configure a implantação:
   - **Descrição**: "API de dados do Dashboard" (ou qualquer descrição)
   - **Executar como**: "Eu" (sua conta)
   - **Quem tem acesso**: "Qualquer pessoa" (para que o site possa acessar os dados)
4. Clique em **Implantar**
5. **IMPORTANTE**: Copie a **URL do aplicativo da Web** que aparece. Será algo como:
   ```
   https://script.google.com/macros/s/AKfycbz.../exec
   ```

## Passo 3: Configurar a URL no Site

1. Abra o arquivo `firebase-config.js` no seu projeto
2. Encontre a seção `appsScriptConfig`:
   ```javascript
   const appsScriptConfig = {
     dataURL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec"
   };
   ```
3. Substitua `YOUR_DEPLOYMENT_ID` pela URL completa que você copiou no Passo 2:
   ```javascript
   const appsScriptConfig = {
     dataURL: "https://script.google.com/macros/s/AKfycbz.../exec"
   };
   ```
4. Salve o arquivo

## Passo 4: Testar a Configuração

### Testar o Apps Script diretamente:

1. Abra a URL do Apps Script no navegador (a que você copiou)
2. Na primeira vez, o Google vai pedir autorização:
   - Clique em **Revisar permissões**
   - Selecione sua conta do Google
   - Clique em **Avançado** (se aparecer aviso de segurança)
   - Clique em **Ir para [nome do projeto] (não seguro)**
   - Clique em **Permitir**
3. Você deverá ver um JSON com todos os dados das abas:
   ```json
   {
     "cache": {
       "Alunos": {
         "registros": [...],
         "metadados": {...}
       },
       "Ponto": {
         "registros": [...],
         "metadados": {...}
       }
     },
     "metadados": {
       "totalAbas": 10,
       "ultimaAtualizacao": "2024-..."
     }
   }
   ```

### Testar uma aba específica:

Você pode buscar dados de uma aba específica adicionando o parâmetro `?aba=NomeAba`:

```
https://script.google.com/macros/s/AKfycbz.../exec?aba=Alunos
```

### Testar o site:

1. Abra o site do Dashboard
2. Faça login com suas credenciais
3. Os dados devem carregar automaticamente
4. Verifique o console do navegador (F12) para ver logs de carregamento:
   - `[fetchDataFromURL] Buscando dados da URL do Apps Script...`
   - `[fetchDataFromURL] ✅ Dados recebidos: ...`

## Atualização Automática

O site agora atualiza os dados automaticamente a cada 5 minutos. Você pode modificar esse intervalo no código se necessário.

## Estrutura dos Dados

O Apps Script retorna os dados no seguinte formato:

```json
{
  "cache": {
    "NomeAba1": {
      "registros": [
        {
          "Campo1": "valor",
          "Campo2": "valor",
          "_rowId": "id-unico",
          "_rowIndex": 2
        }
      ],
      "metadados": {
        "nomeOriginal": "NomeAba1",
        "totalRegistros": 100
      }
    }
  },
  "metadados": {
    "totalAbas": 10,
    "ultimaAtualizacao": "2024-02-05T23:00:00.000Z"
  }
}
```

Cada registro inclui:
- Todos os campos da planilha
- `_rowId`: ID único do registro (baseado em SerialHC, EmailHC ou hash)
- `_rowIndex`: Número da linha na planilha (começando em 2, já que linha 1 é cabeçalho)

## Benefícios desta Arquitetura

1. **Mais simples**: Não precisa de Cloud Functions nem Firebase Realtime Database
2. **Menos configuração**: Apenas implantar o Apps Script e configurar uma URL
3. **Menos custo**: Não há custos de Firebase Database ou Cloud Functions
4. **Mais direto**: Os dados vêm direto do Google Sheets

## Observações Importantes

- **Autenticação**: O Firebase Authentication ainda é usado para login no site
- **Permissões**: O Apps Script precisa ter permissões para acessar a planilha
- **Cache**: O site atualiza os dados a cada 5 minutos automaticamente
- **Real-time**: Não há sincronização em tempo real (os dados são atualizados por polling)
- **Limite de tamanho**: URLs do Google Apps Script têm limite de resposta (~50MB), mas isso deve ser suficiente para a maioria dos casos

## Solução de Problemas

### Erro: "URL do Apps Script não configurada"
- Verifique se você configurou a URL em `firebase-config.js`
- Certifique-se de que substituiu `YOUR_DEPLOYMENT_ID` pela URL real

### Erro: "403 Forbidden" ou "Authorization required"
- Abra a URL do Apps Script no navegador e autorize as permissões
- Certifique-se de que a implantação está configurada como "Qualquer pessoa"

### Erro: "Aba não encontrada"
- Verifique o nome da aba na planilha (case sensitive)
- Use o parâmetro `?aba=NomeExato` para testar

### Dados não carregam no site
- Abra o console do navegador (F12) e verifique os logs
- Teste a URL do Apps Script diretamente no navegador
- Verifique se o Firebase Auth está funcionando (login)

## Atualizando o Apps Script

Se você fizer alterações no código do Apps Script:

1. Cole o novo código no editor
2. **Não** precisa criar nova implantação
3. Clique em **Implantar > Gerenciar implantações**
4. Clique no ícone de edição da implantação existente
5. Clique em **Versão: Nova versão**
6. Clique em **Implantar**
7. A URL permanece a mesma - o site continuará funcionando automaticamente
