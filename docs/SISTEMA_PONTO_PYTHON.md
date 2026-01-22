# Sistema de Ponto - Guia de Uso

## Visão Geral

O Sistema de Ponto é um programa Python que lê crachás NFC e envia os dados para uma planilha Google Sheets através do Google Apps Script.

## Funcionalidades

### 1. Registro de Ponto (Prática e Teoria)

- **Prática**: Registrado em qualquer dia da semana
- **Teoria**: Registrado apenas em:
  - Terças-feiras
  - Quintas-feiras
  - Dias especiais configurados

**Regra importante**: Para o ponto ser registrado como Teoria, o aluno precisa:
1. Ter batido entrada E saída na prática naquele dia
2. O dia precisa ser terça-feira, quinta-feira ou um dia especial configurado

### 2. Dias Especiais de Teoria

Você pode configurar dias específicos para permitir aulas de teoria fora dos dias padrão (terça e quinta).

#### Adicionar um dia especial:
```bash
python SistemaPonto.py --add-dia 25/12/2024
```

#### Remover um dia especial:
```bash
python SistemaPonto.py --remove-dia 25/12/2024
```

#### Listar dias configurados:
```bash
python SistemaPonto.py --list-dias
```

### 3. Execução em Segundo Plano (Windows)

#### Opção 1: Script Batch
Execute o arquivo `iniciar_ponto.bat` para iniciar o programa em segundo plano.

#### Opção 2: Linha de comando
```bash
python SistemaPonto.py --background
```

#### Opção 3: Iniciar com o Windows
Para instalar o programa para iniciar automaticamente com o Windows:
```bash
python SistemaPonto.py --install-startup
```

Para remover da inicialização:
```bash
python SistemaPonto.py --uninstall-startup
```

## Instalação

### Requisitos
- Python 3.8 ou superior
- Biblioteca `requests`

### Passos

1. **Instale o Python** (se ainda não tiver):
   - Download: https://www.python.org/downloads/
   - Durante a instalação, marque "Add Python to PATH"

2. **Instale a dependência**:
   ```bash
   pip install requests
   ```

3. **Configure o arquivo** (opcional):
   ```bash
   python SistemaPonto.py --create-config
   ```
   Isso cria o arquivo `config_ponto.json` que você pode editar.

4. **Execute o programa**:
   ```bash
   python SistemaPonto.py
   ```

## Arquivo de Configuração

O arquivo `config_ponto.json` permite personalizar o sistema:

```json
{
  "endpoint": "URL_DO_GOOGLE_APPS_SCRIPT",
  "debounce_seconds": 1.2,
  "nomes": {
    "1234567890": "Nome do Aluno"
  },
  "dias_teoria": [1, 3],
  "dias_especiais_teoria": [
    "25/12/2024",
    "01/01/2025"
  ],
  "escala_atual": "9",
  "log_file": "logs/sistema_ponto.log"
}
```

### Campos:

| Campo | Descrição |
|-------|-----------|
| `endpoint` | URL do Google Apps Script que recebe os dados |
| `debounce_seconds` | Tempo mínimo entre leituras (evita duplicados) |
| `nomes` | Mapa de SerialNumber para nome do aluno |
| `dias_teoria` | Dias da semana para teoria (0=Seg, 1=Ter, ..., 6=Dom) |
| `dias_especiais_teoria` | Lista de datas específicas no formato dd/mm/yyyy |
| `escala_atual` | Número da escala atual (1-12) para registro de ponto |
| `log_file` | Caminho para arquivo de log (opcional) |

## Comandos Disponíveis

```bash
# Execução normal
python SistemaPonto.py

# Executar em segundo plano
python SistemaPonto.py --background

# Gerenciar dias especiais
python SistemaPonto.py --add-dia DD/MM/YYYY
python SistemaPonto.py --remove-dia DD/MM/YYYY
python SistemaPonto.py --list-dias

# Gerenciar escala atual
python SistemaPonto.py --set-escala 9      # Define escala atual como 9
python SistemaPonto.py --show-escala       # Mostra escala atual

# Inicialização do Windows
python SistemaPonto.py --install-startup
python SistemaPonto.py --uninstall-startup

# Criar arquivo de configuração padrão
python SistemaPonto.py --create-config

# Usar endpoint diferente
python SistemaPonto.py --endpoint "URL_ALTERNATIVA"
```

## Fluxo de Registro

```
┌─────────────────────────────────────────────────────┐
│                  LEITURA DE CRACHÁ                   │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              1ª LEITURA DO DIA                       │
│  → Registra ENTRADA na Teoria (dia de teoria)        │
│  → Registra ENTRADA na Prática (outros dias)         │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              2ª LEITURA DO DIA                       │
│          → Registra SAÍDA na Prática                 │
│                                                      │
│  Se for dia de teoria (Ter/Qui/Especial):           │
│          → Registra ENTRADA na Teoria                │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              3ª LEITURA DO DIA                       │
│         (apenas se for dia de teoria)               │
│          → Registra SAÍDA na Teoria                  │
└─────────────────────────────────────────────────────┘
```

## Solução de Problemas

### O programa não inicia
- Verifique se o Python está instalado corretamente
- Execute `pip install requests` para instalar a dependência

### Leitura não é reconhecida
- O leitor NFC precisa estar em modo "teclado" (HID keyboard-emulation)
- Verifique se o número serial tem pelo menos 8 dígitos

### Erro ao enviar para o endpoint
- Verifique sua conexão com a internet
- Confirme que a URL do endpoint está correta no arquivo de configuração

### O programa fecha sozinho no Windows
- Use `pythonw` ao invés de `python` para rodar sem janela
- Ou use o script `iniciar_ponto.bat` fornecido

## Google Apps Script (Ponto.gs)

O arquivo `Ponto.gs` deve ser adicionado ao Google Apps Script da sua planilha. Ele processa os dados recebidos e insere nas abas:

- **PontoPratica**: Para registros de prática
- **PontoTeoria**: Para registros de teoria

O script verifica automaticamente:
- Se é dia de teoria (pelo dia da semana ou flag `IsDiaTeoria`)
- Se o aluno já tem entrada/saída registrada
- Evita duplicatas
