# Sistema de Formulários para Ausências e Reposições

## 🎯 Visão Geral

Este documento descreve o novo sistema de formulários implementado para registrar **Ausências** e **Reposições** diretamente pela interface web do Dashboard, com integração automática ao Firebase e Google Sheets.

## ✨ Novas Funcionalidades

### 1. **Aba Ausências - Inserção de Faltas**

A aba de Ausências agora possui:

- **Lista de Alunos Ativos**: Exibe todos os alunos com status "Ativo" em cards visuais
- **Busca Rápida**: Campo de busca para filtrar alunos por nome ou email
- **Botão "Inserir Ausência"**: Cada aluno possui um botão para registrar uma nova ausência
- **Modal de Formulário**: Formulário completo com todos os campos necessários
- **Tabela de Ausências**: Visualização de todas as ausências já registradas

#### Campos do Formulário de Ausências:
- **Nome Completo** (pré-preenchido, somente leitura)
- **Email HC** (pré-preenchido, somente leitura)
- **Curso** (editável)
- **Escala** (editável)
- **Data da Ausência** (obrigatório)
- **Unidade** (obrigatório)
- **Horário** (obrigatório, formato: 08:00-12:00)
- **Motivo** (obrigatório)

### 2. **Aba Reposições - Registro de Aulas de Reposição**

A aba de Reposições agora possui:

- **Botão "Nova Reposição"**: Destaque no topo da página para criar uma nova reposição
- **Modal de Formulário**: Formulário completo para registrar reposições
- **Tabela de Reposições**: Visualização de todas as reposições já registradas

#### Campos do Formulário de Reposições:
- **Nome Completo** (obrigatório)
- **Email HC** (obrigatório)
- **Curso** (obrigatório)
- **Escala** (obrigatório)
- **Unidade** (obrigatório)
- **Horário** (obrigatório, formato: 14:00-18:00)
- **Motivo** (obrigatório)
- **Data da Reposição** (obrigatório)

## 🎨 Design e UX

### Modais Profissionais
- **Glassmorphism**: Fundo com blur para destacar o modal
- **Animações Suaves**: Fade-in e slide-up ao abrir
- **Design Responsivo**: Funciona perfeitamente em desktop e mobile
- **Fechamento Intuitivo**: 
  - Botão X no canto superior
  - Clicar fora do modal
  - Tecla ESC

### Formulários Elegantes
- **Layout em Grid**: Campos organizados em 2 colunas
- **Labels Claros**: Identificação visual de campos obrigatórios (*)
- **Campos Pré-preenchidos**: Dados do aluno já populados quando aplicável
- **Feedback Visual**: Estados de focus, hover e validação

### Botões de Ação
- **Gradientes InCor**: Cores institucionais (azul InCor)
- **Efeitos Hover**: Elevação e mudança de tom
- **Loading States**: Indicador visual durante salvamento
- **Ícones SVG**: Icons claros e profissionais

## 🔧 Implementação Técnica

### Arquitetura

```
Interface Web (HTML/CSS/JS)
           ↓
  Firebase Realtime Database
           ↓
  Google Apps Script (Triggers)
           ↓
   Google Sheets (Ausencias/Reposicoes)
```

### Funções JavaScript Principais

#### 1. `openAusenciaModal(email, nome, curso, escala)`
- Abre o modal de ausência
- Pré-preenche dados do aluno
- Foco automático no primeiro campo editável

#### 2. `closeAusenciaModal()`
- Fecha o modal
- Limpa todos os campos do formulário

#### 3. `saveAusencia(data)`
- Valida os dados
- Salva no Firebase em `exportAll/Ausencias/dados`
- Retorna resultado (sucesso/erro)

#### 4. `renderAusenciasStudentsList()`
- Renderiza lista de alunos ativos
- Adiciona botão de ação para cada aluno
- Implementa busca em tempo real

#### 5. `openReposicaoModal()`
- Abre modal de reposição
- Limpa todos os campos

#### 6. `saveReposicao(data)`
- Valida os dados
- Salva no Firebase em `exportAll/Reposicoes/dados`
- Retorna resultado (sucesso/erro)

### Firebase Operations

```javascript
// Escrita de Ausência
const ausenciasRef = firebase.ref(fbDB, 'exportAll/Ausencias/dados');
const newAusenciaRef = firebase.push(ausenciasRef);
await firebase.set(newAusenciaRef, data);

// Escrita de Reposição
const reposicoesRef = firebase.ref(fbDB, 'exportAll/Reposicoes/dados');
const newReposicaoRef = firebase.push(reposicoesRef);
await firebase.set(newReposicaoRef, data);
```

### Validação

- **Campos Obrigatórios**: Validação HTML5 (required)
- **Formato de Email**: Validação automática do navegador
- **Feedback de Erro**: Mensagens claras em caso de falha
- **Feedback de Sucesso**: Notificação visual ao salvar

## 📱 Responsividade

### Desktop (> 1024px)
- Formulários em 2 colunas
- Largura máxima do modal: 800px
- Lista de alunos em cards lado a lado

### Tablet (768px - 1024px)
- Formulários em 2 colunas
- Modal ocupa 90% da largura
- Cards de alunos em grid responsivo

### Mobile (< 768px)
- Formulários em 1 coluna
- Modal ocupa 95% da largura
- Cards de alunos empilhados verticalmente

## 🚀 Como Usar

### Para Registrar uma Ausência:

1. Acesse a aba **Ausências** no menu principal
2. Use a busca para localizar o aluno (opcional)
3. Clique no botão **"Inserir Ausência"** do aluno desejado
4. Preencha os campos do formulário:
   - Data da Ausência
   - Unidade
   - Horário (formato: 08:00-12:00)
   - Motivo
5. Clique em **"Registrar Ausência"**
6. Aguarde a confirmação de sucesso
7. A ausência aparecerá automaticamente na tabela abaixo

### Para Registrar uma Reposição:

1. Acesse a aba **Reposições** no menu principal
2. Clique no botão verde **"Nova Reposição"** no topo
3. Preencha todos os campos do formulário:
   - Nome Completo
   - Email HC
   - Curso
   - Escala
   - Unidade
   - Horário (formato: 14:00-18:00)
   - Motivo
   - Data da Reposição
4. Clique em **"Registrar Reposição"**
5. Aguarde a confirmação de sucesso
6. A reposição aparecerá automaticamente na tabela abaixo

## 🔒 Segurança

- **Autenticação**: Apenas usuários logados podem acessar
- **Validação Client-Side**: Campos obrigatórios verificados antes do envio
- **Validação Server-Side**: Firebase Rules devem ser configuradas para validar escritas
- **Campos Read-Only**: Email e Nome não podem ser alterados (prevenção de erros)

## 🎯 Benefícios

### Para Professores/Administradores:
- ✅ Registro rápido e intuitivo
- ✅ Interface profissional e moderna
- ✅ Sincronização automática com planilhas
- ✅ Histórico completo em tempo real
- ✅ Busca e filtros eficientes

### Para o Sistema:
- ✅ Dados estruturados e padronizados
- ✅ Integração perfeita Firebase ↔ Sheets
- ✅ Rastreabilidade completa
- ✅ Redução de erros de digitação
- ✅ Backup automático

## 🐛 Troubleshooting

### O modal não abre
- Verifique o console do navegador para erros JavaScript
- Confirme que o Firebase está inicializado
- Verifique se os event listeners foram registrados

### Dados não aparecem na tabela
- Verifique a conexão com Firebase
- Confirme que o caminho `exportAll/Ausencias/dados` existe
- Verifique os listeners do Firebase

### Erro ao salvar
- Confirme permissões no Firebase Database Rules
- Verifique se todos os campos obrigatórios estão preenchidos
- Veja os logs do console para detalhes do erro

### Modal não fecha
- Tente clicar no botão X
- Tente pressionar ESC
- Tente clicar fora do modal
- Recarregue a página se necessário

## 📝 Próximos Passos

### Melhorias Futuras Sugeridas:
- [ ] Editar ausências/reposições existentes
- [ ] Excluir registros (com confirmação)
- [ ] Filtros avançados na tabela
- [ ] Exportação para Excel/PDF
- [ ] Histórico de alterações (audit log)
- [ ] Notificações por email ao registrar
- [ ] Campos adicionais customizáveis
- [ ] Upload de documentos (atestados, etc.)
- [ ] Dashboard com estatísticas

## 📞 Suporte

Para dúvidas ou problemas:
- Email: ensinofisioincor@hc.fm.usp.br
- Telefone: (11) 2661-5319
- Documentação: `/docs/`

---

**Desenvolvido para o Portal de Ensino InCor - HC FMUSP**
*Sistema Profissional de Gestão Acadêmica*
