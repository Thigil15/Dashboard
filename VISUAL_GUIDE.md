# 🎨 Guia Visual das Alterações - Interface de Ausências/Reposições

## 📱 Visão Geral das Mudanças

Este documento apresenta as melhorias visuais implementadas no sistema de ausências e reposições.

---

## 1️⃣ Aba Principal "Reposições" - Before & After

### ANTES ❌
```
┌────────────────────────────────────────────────────────────┐
│  Reposições Pendentes                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • João Silva (5 ausências registradas)              │  │
│  │   Problema: Todas aparecem como pendentes, mesmo    │  │
│  │   que 3 já tenham reposição agendada na mesma data  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### DEPOIS ✅
```
┌────────────────────────────────────────────────────────────┐
│  Reposições Pendentes                                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • João Silva (2 ausências pendentes)                │  │
│  │   ✓ Sistema verifica se ausência tem reposição na   │  │
│  │     mesma data antes de considerar como pendente    │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  Reposições Marcadas                                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ • João Silva (3 reposições agendadas)               │  │
│  │   ✓ Mostra ausências que já têm reposição marcada   │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

---

## 2️⃣ Perfil Individual do Aluno - Nova Interface

### 📊 Painel de Estatísticas (KPIs)

```
┌────────────────────────────────────────────────────────────┐
│  ╔════════════╦════════════╦════════════╦════════════╗    │
│  ║ 📋 Total   ║ ⏰ Pend.   ║ ✅ Rep.    ║ 📈 Taxa    ║    │
│  ║    5       ║    2       ║    3       ║   60%      ║    │
│  ║ Ausências  ║ Pendentes  ║ Repostas   ║ Reposição  ║    │
│  ╚════════════╩════════════╩════════════╩════════════╝    │
└────────────────────────────────────────────────────────────┘
```

### 🎯 Sistema de Tabs (Novo!)

```
┌────────────────────────────────────────────────────────────┐
│  📅 Ausências e Reposições                                 │
│  ┌────────────────────────────────────────────────────┐   │
│  │ [ Todas (5) ] [ Pendentes (2) 🔴 ] [ Repostas (3) ] │   │
│  └────────────────────────────────────────────────────┘   │
│     ▲ Active      ▲ Com alerta       ▲ Concluídas         │
└────────────────────────────────────────────────────────────┘
```

#### Estados dos Botões:

**1. Botão Inativo (Default)**
```css
Cor: Cinza (#475569)
Fundo: Transparente
Hover: Fundo azul claro + cor azul
```

**2. Botão Ativo**
```css
Cor: Branco
Fundo: Azul InCor (#0054B4)
Sombra: 0 2px 8px rgba(0, 84, 180, 0.2)
```

**3. Botão com Alerta (Pendentes)**
```css
Cor: Âmbar (#D97706)
Indicador: Ponto vermelho pulsante (🔴)
Animação: pulse 2s infinite
```

**4. Botão Ativo + Alerta**
```css
Cor: Branco (sobrescreve âmbar)
Fundo: Azul InCor
Indicador: Oculto (não mostra ponto vermelho)
```

---

## 3️⃣ Timeline de Ausências - Visualização por Tab

### Tab "Todas" (Padrão)
```
┌────────────────────────────────────────────────────────────┐
│  Timeline Completa                                         │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  │                                                           │
│  │ ⚠️ PENDENTE                                15 dias pend. │
│  │ ▸ Ausência:  15/01/2026 (Seg)                          │
│  │ ▸ Reposição: Aguardando reposição                      │
│  │ ▸ Local:     UTI                                        │
│  │ ▸ Motivo:    Doença                                     │
│  │                                                           │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  │                                                           │
│  │ ✅ REPOSTA                               Reposta em 10d │
│  │ ▸ Ausência:  10/01/2026 (Qua)                         │
│  │ ▸ Reposição: 20/01/2026 (Sáb)                         │
│  │ ▸ Local:     Enfermaria                                 │
│  │ ▸ Motivo:    Atestado médico                           │
│  │                                                           │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
└────────────────────────────────────────────────────────────┘
```

### Tab "Pendentes" (Filtrado)
```
┌────────────────────────────────────────────────────────────┐
│  Apenas Ausências Pendentes (2)                            │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  │                                                           │
│  │ ⚠️ PENDENTE                                15 dias pend. │
│  │ ▸ Ausência:  15/01/2026 (Seg)                          │
│  │ ▸ Reposição: Aguardando reposição                      │
│  │ ▸ Local:     UTI                                        │
│  │ ▸ Motivo:    Doença                                     │
│  │                                                           │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  │                                                           │
│  │ ⚠️ PENDENTE                                 8 dias pend. │
│  │ ▸ Ausência:  22/01/2026 (Qua)                         │
│  │ ▸ Reposição: Aguardando reposição                      │
│  │ ▸ Local:     Enfermaria                                 │
│  │ ▸ Motivo:    Compromisso pessoal                       │
│  │                                                           │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
└────────────────────────────────────────────────────────────┘
```

### Tab "Repostas" (Filtrado)
```
┌────────────────────────────────────────────────────────────┐
│  Apenas Ausências Repostas (3)                             │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  │                                                           │
│  │ ✅ REPOSTA                               Reposta em 10d │
│  │ ▸ Ausência:  10/01/2026 (Qua)                         │
│  │ ▸ Reposição: 20/01/2026 (Sáb)                         │
│  │ ▸ Local:     Enfermaria                                 │
│  │ ▸ Motivo:    Atestado médico                           │
│  │                                                           │
│  ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │
│  │ (mais 2 reposições...)                                  │
│  │                                                           │
└────────────────────────────────────────────────────────────┘
```

---

## 4️⃣ Animações e Transições

### Ponto de Alerta Pulsante
```css
@keyframes faltas-tab-alert-pulse {
    0%   → Opacidade: 1.0, Escala: 1.0
    50%  → Opacidade: 0.5, Escala: 1.2
    100% → Opacidade: 1.0, Escala: 1.0
}

Duração: 2 segundos
Loop: Infinito
```

### Transição de Botões
```css
Propriedade: all
Duração: 0.25s
Curva: cubic-bezier(0.4, 0, 0.2, 1)

Hover Effect:
  - Fundo: azul claro (#E6F0FF)
  - Cor: azul escuro (#0033A0)
  - Suave e profissional
```

### Entrada de Cards (Timeline)
```css
@keyframes faltas-card-enter {
    from → Opacidade: 0, Posição: -10px (esquerda)
    to   → Opacidade: 1, Posição: 0
}

Atraso escalonado: index × 0.05s
Resultado: Animação cascata de cima para baixo
```

---

## 5️⃣ Paleta de Cores Usada

### Cores Principais
```
Azul InCor (Principal):
  - Escuro:  #001A52 (Textos)
  - Médio:   #0054B4 (Botões ativos)
  - Claro:   #E6F0FF (Hover)

Vermelho InCor (Alertas):
  - Principal: #E21E26 (Ponto de alerta)

Status Colors:
  - Sucesso:  #059669 (Verde) - Repostas
  - Pendente: #D97706 (Âmbar) - Pendentes
  - Neutro:   #475569 (Cinza) - Padrão
```

### Aplicação por Elemento
```
Tabs:
  - Inativo:  Cinza #475569
  - Ativo:    Branco em azul #0054B4
  - Alerta:   Âmbar #D97706 + ponto vermelho

Cards Timeline:
  - Pendente: Borda âmbar #D97706
  - Reposta:  Borda verde #059669
  - Fundo:    Branco com sombra suave
```

---

## 6️⃣ Responsividade

### Desktop (> 1024px)
```
- Tabs em linha horizontal
- Cards com largura completa
- 4 KPIs lado a lado
```

### Tablet (768px - 1024px)
```
- Tabs mantêm layout horizontal
- Cards com padding reduzido
- KPIs 2x2 grid
```

### Mobile (< 768px)
```
- Tabs com scroll horizontal se necessário
- Cards empilhados verticalmente
- KPIs 1x4 coluna
- Textos com tamanhos ajustados
```

---

## 🎯 Melhorias de UX Implementadas

### 1. Feedback Visual Imediato
✅ Contadores em tempo real nos botões
✅ Ponto pulsante para alertas
✅ Cores distintas por status

### 2. Navegação Intuitiva
✅ Um clique para filtrar visualização
✅ Estado ativo claramente visível
✅ Sem necessidade de scroll para trocar tabs

### 3. Informação Contextual
✅ Números de itens em cada categoria
✅ Status visual com ícones
✅ Tempo desde ausência / até reposição

### 4. Design Profissional
✅ Alinhado com identidade InCor
✅ Animações suaves e modernas
✅ Hierarquia visual clara

---

## 📐 Especificações Técnicas

### Dimensões dos Elementos
```
Tab Button:
  - Padding: 0.5rem 1rem
  - Border Radius: 10px
  - Font: Inter, 0.875rem, 600

Ponto de Alerta:
  - Tamanho: 6px × 6px
  - Posição: 0.25rem do topo/direita
  - Border Radius: 50% (círculo)

Tab Container:
  - Gap: 0.5rem
  - Padding: 0.25rem
  - Background: white
  - Border Radius: 12px
  - Shadow: 0 2px 4px rgba(0, 51, 160, 0.04)
```

### Z-Index Hierarchy
```
Layers (menor para maior):
  1. Background: 0
  2. Cards: 1
  3. Tab Container: auto
  4. Active Tab: auto
  5. Alert Dot: auto (dentro do botão)
```

---

## 🚀 Próximos Passos Sugeridos

1. **Testes de Usabilidade**
   - Coletar feedback dos usuários
   - Medir tempo para encontrar informações
   - Avaliar satisfação com novo design

2. **Melhorias Futuras Possíveis**
   - Adicionar busca/filtro dentro das tabs
   - Exportar dados filtrados para PDF
   - Notificações push para pendências

3. **Acessibilidade**
   - Validar contraste de cores (WCAG AA)
   - Adicionar ARIA labels adequados
   - Testar com leitores de tela

---

**Design System:** InCor Institucional Premium v35.0  
**Implementado em:** Janeiro 2026  
**Compatibilidade:** Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
