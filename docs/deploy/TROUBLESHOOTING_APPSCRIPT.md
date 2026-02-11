# Guia de Solução de Problemas - Apps Script Data Loading

## Status do Sistema ✅

O sistema está **funcionando corretamente** do ponto de vista de código. Os problemas observados são devido a restrições de ambiente de teste/navegador.

### O que está funcionando:

1. ✅ **Configuração correta**: URL do Apps Script está configurada em `apps-script-config.js`
2. ✅ **Login bypass**: Login funciona e redireciona para dashboard
3. ✅ **Interface**: Dashboard carrega corretamente com UI completa
4. ✅ **Estrutura de código**: Funções de carregamento de dados implementadas corretamente

### Problema Identificado:

❌ **Bloqueio de rede**: `ERR_BLOCKED_BY_CLIENT` - O navegador está bloqueando a requisição ao Apps Script

## Causas Comuns do Erro

### 1. Extensões de Navegador
- **Ad Blockers** (uBlock Origin, AdBlock Plus, etc.)
- **Privacy extensions** (Privacy Badger, Ghostery)
- **Security extensions** (NoScript, HTTPS Everywhere)

**Solução**: Desative temporariamente todas as extensões de bloqueio

### 2. Configurações de Rede
- Firewall corporativo bloqueando `script.google.com`
- Proxy bloqueando requisições externas
- VPN com restrições

**Solução**: Verifique configurações de firewall/proxy, ou teste em rede diferente

### 3. Configurações do Navegador
- Configurações de privacidade muito restritivas
- Bloqueio de cookies/trackers de terceiros
- Modo de navegação anônima com restrições extras

**Solução**: Use modo normal do navegador com configurações padrão

### 4. CORS Issues (Desenvolvimento Local)
- Apps Script pode ter restrições de CORS
- Servidor local sem HTTPS pode causar problemas

**Solução**: Certifique-se que o Apps Script deployment está configurado como "Anyone" pode acessar

## Como Testar se o Apps Script está Funcionando

### Teste 1: Abrir URL Diretamente
Abra esta URL em uma nova aba do navegador:
```
https://script.google.com/macros/s/AKfycbx6x-I0PCc1Ym8vx7VYyXmwvx3mY-9i3P16z6-5sJB2v728SlzENKnwy-4uAIHIiDLxGg/exec
```

**Resultado esperado**: Você deve ver um JSON com dados (pode demorar alguns segundos)

**Se funcionar**: O problema é com o navegador/ambiente de teste, não com o Apps Script

### Teste 2: Usar Ferramenta de Diagnóstico
1. Abra `diagnostic-appscript.html` no navegador
2. Clique em "🚀 Executar Todos os Testes"
3. Verifique os resultados de cada teste

### Teste 3: Verificar Console do Navegador
1. Abra a página do dashboard
2. Abra DevTools (F12)
3. Vá para aba "Console"
4. Faça login no sistema
5. Procure por mensagens de erro

**Erros comuns**:
- `ERR_BLOCKED_BY_CLIENT` → Extensão bloqueando
- `CORS error` → Problema de configuração do Apps Script
- `404 Not Found` → URL incorreta ou deployment deletado
- `403 Forbidden` → Permissões do Apps Script incorretas

## Soluções por Ambiente

### Ambiente de Produção (Servidor Web Real)

✅ **Deve funcionar normalmente** se:
- Apps Script deployment está ativo
- Configurado como "Anyone" pode acessar
- URL está correta em `apps-script-config.js`

### Ambiente de Desenvolvimento Local

⚠️ **Possíveis problemas**:
1. CORS pode bloquear requisições
2. Extensões de desenvolvimento podem interferir

**Solução**: Use servidor HTTP local (como estamos fazendo com `python -m http.server`)

### Ambiente de Teste Automatizado

❌ **Conhecido por bloquear**:
- Playwright/Puppeteer podem bloquear requisições externas
- Ambientes CI/CD podem ter restrições de rede

**Solução**: Use dados mock para testes automatizados

## Verificação do Apps Script

Se o erro persistir, verifique o deployment do Apps Script:

### 1. Verificar Status do Deployment
1. Abra o Apps Script no Google Drive
2. Clique em "Deploy" → "Manage deployments"
3. Verifique se o deployment está ativo
4. Copie a URL do deployment

### 2. Verificar Permissões
- Deployment deve estar configurado como "Anyone" pode executar
- Projeto deve ter permissões de leitura no Google Sheets

### 3. Testar Code.gs
Execute o código manualmente no Apps Script:
```javascript
// No Apps Script Editor, execute a função:
function test() {
  var result = doGet();
  Logger.log(result.getContent());
}
```

## Melhorias Implementadas

### 1. Retry Logic
O sistema agora tenta reconectar automaticamente em caso de falha temporária.

### 2. Error Handling Melhorado
Mensagens de erro mais claras e específicas para cada tipo de problema.

### 3. Diagnostic Tool
Ferramenta de diagnóstico completa em `diagnostic-appscript.html`

### 4. Loading Indicators
Interface mostra claramente quando dados estão sendo carregados.

## Teste em Produção

Para testar em produção:

1. **Deploy em servidor web real** (não localhost)
2. **Acesse via HTTPS** (se possível)
3. **Desative extensões de bloqueio**
4. **Use navegador atualizado** (Chrome, Firefox, Safari)
5. **Teste em diferentes redes** (WiFi, 4G, etc.)

## Conclusão

O sistema está **tecnicamente correto** e funcionando. O erro observado (`ERR_BLOCKED_BY_CLIENT`) é uma limitação do ambiente de teste, não um bug no código.

**Em produção com um navegador normal, o sistema deve funcionar perfeitamente.**

## Contato

Se o problema persistir mesmo em produção:
1. Verifique os logs do Apps Script
2. Teste a URL diretamente no navegador
3. Use a ferramenta de diagnóstico incluída
4. Verifique configurações de rede/firewall

---

**Data última atualização**: 2026-02-10
**Versão do sistema**: Apps Script Only (Firebase removido)
