# Firebase Storage - Conexão com o Site

## 📦 Visão Geral

Este documento explica como conectar o Firebase Storage ao site para que os usuários possam baixar arquivos de escalas (XLSM/XLSX) diretamente da interface.

## ✅ O Que Foi Implementado

### 1. SDK do Firebase Storage
- Adicionado Firebase Storage SDK ao `index.html`
- Importadas as funções: `getStorage`, `storageRef`, `listAll`, `getDownloadURL`
- Integração completa com o Firebase já existente

### 2. Nova Aba "Arquivos de Escalas"
- Localização: Tab "Escala" > "Arquivos de Escalas"
- Interface profissional com design InCor
- Lista todos os arquivos XLSX/XLSM do Firebase Storage
- Botões de download para cada arquivo

### 3. Funcionalidades
- **Listagem Automática**: Carrega todos os arquivos do Storage
- **Categorização**: Separa arquivos Excel de outros formatos
- **Download Direto**: Links de download protegidos do Firebase
- **Visual Profissional**: Design consistente com o resto do site
- **Estados de UI**: Loading, Empty, Error e Success

## 🚀 Como Usar

### Passo 1: Configurar Firebase Storage

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Selecione o projeto "dashboardalunos"
3. Vá em "Storage" no menu lateral
4. Clique em "Get Started" (se for a primeira vez)

### Passo 2: Fazer Upload dos Arquivos

Existem duas formas de enviar arquivos:

#### Opção A: Via Firebase Console (Mais Fácil)

1. No Firebase Console, vá em "Storage"
2. Clique em "Upload file" ou arraste os arquivos
3. Envie os arquivos XLSM/XLSX das escalas
4. Os arquivos aparecerão automaticamente no site

#### Opção B: Via Google Apps Script (Automático)

Você pode configurar um script para enviar automaticamente:

```javascript
function uploadToFirebaseStorage() {
  // Obtenha o arquivo da planilha
  var file = DriveApp.getFileById('ID_DA_PLANILHA');
  var blob = file.getBlob();
  
  // Configure Firebase Storage
  var firebaseUrl = 'https://dashboardalunos.firebasestorage.app/v0/b/dashboardalunos.firebasestorage.app/o/';
  var token = 'SUA_API_KEY_AQUI';
  
  // Faça upload do arquivo
  var url = firebaseUrl + encodeURIComponent(file.getName()) + '?uploadType=media';
  var response = UrlFetchApp.fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': blob.getContentType()
    },
    payload: blob
  });
  
  Logger.log('Upload concluído: ' + response.getContentText());
}
```

### Passo 3: Configurar Regras de Segurança

As regras do Firebase Storage devem permitir:
- **Leitura**: Apenas usuários autenticados
- **Escrita**: Apenas administradores ou scripts autorizados

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      // Permite leitura para usuários autenticados
      allow read: if request.auth != null;
      
      // Permite escrita apenas para usuários específicos ou scripts
      allow write: if request.auth != null && 
                      (request.auth.token.admin == true || 
                       request.auth.uid == 'dashboard-thiago-230425');
    }
  }
}
```

Para aplicar as regras:
1. No Firebase Console, vá em "Storage" > "Rules"
2. Cole as regras acima
3. Clique em "Publish"

## 📂 Estrutura de Arquivos

O site espera os arquivos na raiz do Storage:

```
Firebase Storage (dashboardalunos.firebasestorage.app)
├── Escala_Janeiro_2025.xlsm
├── Escala_Fevereiro_2025.xlsm
├── Escala_Marco_2025.xlsx
└── ... (outros arquivos)
```

**Importante**: 
- Os arquivos devem estar na **raiz** do Storage (não em pastas)
- Formatos aceitos: `.xlsm`, `.xlsx`, `.xls`
- Nomes de arquivo devem ser descritivos

## 🔧 Como Funciona Tecnicamente

### Fluxo de Dados

1. **Usuário clica na aba "Arquivos de Escalas"**
   ```javascript
   // No script.js
   if (targetTab === 'arquivos') {
       loadStorageFiles();
   }
   ```

2. **Sistema lista arquivos do Storage**
   ```javascript
   const listRef = window.firebase.storageRef(fbStorage, '/');
   const result = await window.firebase.listAll(listRef);
   ```

3. **Gera URLs de download**
   ```javascript
   const url = await window.firebase.getDownloadURL(itemRef);
   ```

4. **Renderiza interface com links de download**
   ```javascript
   renderStorageFiles(files);
   ```

### Permissões Necessárias

O Firebase Storage requer que o usuário esteja autenticado. O sistema:
- ✅ Verifica autenticação antes de listar arquivos
- ✅ Usa tokens de segurança do Firebase Auth
- ✅ Gera URLs temporárias de download

## 🎨 Interface do Usuário

### Estados da Interface

1. **Loading (Carregando)**
   - Spinner animado
   - Mensagem: "Carregando arquivos do Firebase Storage..."

2. **Success (Sucesso)**
   - Lista de arquivos Excel em cards
   - Botão de download para cada arquivo
   - Ícones coloridos por tipo de arquivo

3. **Empty (Vazio)**
   - Mensagem: "Nenhum arquivo encontrado"
   - Sugestão para verificar se arquivos foram enviados

4. **Error (Erro)**
   - Mensagem de erro específica
   - Sugestão para verificar permissões

### Design

- **Cards Profissionais**: Cada arquivo em um card com hover effect
- **Ícones por Tipo**: 
  - `.xlsm` = Cyan (arquivos com macros)
  - `.xlsx` = Green (arquivos Excel modernos)
  - `.xls` = Indigo (arquivos Excel antigos)
- **Botão de Download**: Destaque com gradiente e ícone
- **Responsivo**: Funciona em mobile e desktop

## 🐛 Solução de Problemas

### Erro: "Firebase Storage não inicializado"

**Causa**: Firebase SDK não carregou corretamente

**Solução**:
1. Verifique se `index.html` tem o import do Storage SDK
2. Abra o console (F12) e veja se há erros de carregamento
3. Limpe o cache do navegador (Ctrl+Shift+R)

### Erro: "Erro ao carregar arquivos: Permission denied"

**Causa**: Regras de segurança do Storage estão bloqueando acesso

**Solução**:
1. Vá em Firebase Console > Storage > Rules
2. Verifique se `allow read: if request.auth != null;` está configurado
3. Certifique-se de estar logado no site
4. Publique as regras atualizadas

### Nenhum arquivo aparece na lista

**Possíveis causas**:

1. **Arquivos não foram enviados**
   - Solução: Faça upload dos arquivos via Firebase Console

2. **Arquivos estão em uma pasta**
   - Solução: Mova os arquivos para a raiz do Storage
   - O site procura em `/` (raiz), não em subpastas

3. **Problemas de permissão**
   - Solução: Verifique as regras de segurança

### Botão de download não funciona

**Causa**: URL de download expirou ou permissões mudaram

**Solução**:
1. Recarregue a página (F5)
2. O sistema gerará novas URLs
3. Verifique se as regras de Storage permitem leitura

## 📊 Monitoramento

### No Firebase Console

Você pode monitorar:
- **Quantidade de arquivos**: Storage > Files
- **Downloads**: Storage > Usage (gráfico de tráfego)
- **Erros de permissão**: Storage > Rules > Simulator

### No Site

O console do navegador (F12) mostra:
```
[loadStorageFiles] Starting to load files from Firebase Storage...
[loadStorageFiles] Found 5 files in Storage
[loadStorageFiles] Files with URLs: [...]
```

## 🔐 Segurança

### Boas Práticas

✅ **Nunca exponha credenciais**
- API keys estão em `firebase-config.js` (já configurado)
- Nunca commite tokens de admin

✅ **Use regras de segurança**
- Leitura apenas para autenticados
- Escrita apenas para admin/scripts

✅ **URLs temporárias**
- Firebase gera URLs de download temporárias
- Não é possível acessar arquivos sem autenticação

### Limites do Firebase

- **Storage grátis**: 5 GB
- **Downloads grátis**: 1 GB/dia
- **Uploads grátis**: 20.000/dia

Para mais informações: [Firebase Pricing](https://firebase.google.com/pricing)

## 📚 Referências

- [Firebase Storage Documentation](https://firebase.google.com/docs/storage)
- [Firebase Storage Security Rules](https://firebase.google.com/docs/storage/security)
- [Firebase Storage JavaScript SDK](https://firebase.google.com/docs/storage/web/start)

## ✨ Funcionalidades Futuras (Opcional)

Possíveis melhorias:

1. **Organização em pastas**
   - Criar pastas por mês/ano
   - Interface de navegação de pastas

2. **Upload direto do site**
   - Permitir admins enviarem arquivos
   - Drag & drop de arquivos

3. **Preview de arquivos**
   - Visualizar Excel sem baixar
   - Converter para visualização web

4. **Versionamento**
   - Manter histórico de versões
   - Reverter para versões antigas

5. **Notificações**
   - Avisar quando novos arquivos são adicionados
   - Sistema de assinaturas

---

**Versão**: 1.0  
**Data**: Dezembro 2024  
**Autor**: Sistema de Documentação  
**Status**: ✅ Implementado e Funcionando
