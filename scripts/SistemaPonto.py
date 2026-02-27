#!/usr/bin/env python3
"""
SistemaPonto.py

Lê UID do leitor NFC (HID keyboard-emulation) via stdin e envia para um endpoint Google Apps Script.
Suporta configuração de dias especiais para aulas de teoria e execução em segundo plano no Windows.

Uso:
  1) pip install requests
  2) Plugue o leitor NFC (modo teclado).
  3) Configure o arquivo config_ponto.json (opcional)
  4) Abra um terminal e rode:
       python SistemaPonto.py
  5) Para rodar em segundo plano no Windows:
       python SistemaPonto.py --background
       
  Para instalar como serviço de inicialização:
       python SistemaPonto.py --install-startup
"""

import sys
import os
import time
import json
import logging
import argparse
import platform
import unicodedata
from datetime import datetime, date, time as dtime
from pathlib import Path

# Tenta importar requests, se não existir, mostra instrução
try:
    import requests
except ImportError:
    print("Erro: O módulo 'requests' não está instalado.")
    print("Execute: pip install requests")
    sys.exit(1)

# Tenta importar msvcrt para Windows (leitura de teclado não-bloqueante)
if platform.system() == "Windows":
    try:
        import msvcrt
    except ImportError:
        msvcrt = None
else:
    msvcrt = None

# ========== CONFIG ==========
# URL do Apps Script (turma 2026) - espelha apps-script-config.js
ENDPOINT = "https://script.google.com/macros/s/AKfycbxF39enADoiGglxeCOzQbjlrc8CWoWn7eHP2OzyuNiqaD4wiAhnkE57NEGhnl81tC3h/exec"
DEBOUNCE_SECONDS = 1.2
CONFIG_FILE = "config_ponto.json"

# Mapeie aqui os IDs para exibir nome (opcional) - legado, usar alunos no config
NOMES = {
    "1601873172": "Thiago Dias Santos",
    # "1601901111": "Maria Souza",
}

# Dias padrão para aulas de teoria com horários por dia da semana.
# Cada entrada: {"dia": <0-6>, "hora_transicao": "HH:MM", "hora_inicio": "HH:MM"}
# 0=Segunda, 1=Terça, ..., 6=Domingo
HORARIOS_TEORIA_PADRAO = [
    {"dia": 1, "hora_transicao": "17:30", "hora_inicio": "18:00"},  # Terça
    {"dia": 3, "hora_transicao": "17:30", "hora_inicio": "18:00"},  # Quinta
]

# Mantido para leitura de configs antigas (backward compat)
DIAS_TEORIA_PADRAO = [1, 3]
HORA_TRANSICAO_TEORIA_PADRAO = "17:30"
HORA_INICIO_TEORIA_PADRAO = "18:00"

# Horário de encerramento da teoria (meia-noite)
HORA_FIM_TEORIA_PADRAO = "00:00"

# Número máximo de pontos por modalidade por dia (entrada + saída = 2)
MAX_PONTOS_POR_MODALIDADE = 2
# ===========================

_last_time = 0.0

# Configuração padrão - usada em load_config() e save_default_config()
def get_default_config():
    """Retorna a configuração padrão."""
    return {
        "endpoint": ENDPOINT,
        "debounce_seconds": DEBOUNCE_SECONDS,
        "nomes": NOMES.copy(),
        "alunos": {},  # Cadastro de alunos
        "horarios_teoria": [dict(h) for h in HORARIOS_TEORIA_PADRAO],
        "dias_especiais_teoria": [],
        "hora_fim_teoria": HORA_FIM_TEORIA_PADRAO,
        "escala_atual": "9",  # Escala atual para registro de ponto (1-12)
        "log_file": None,
        "max_pontos_por_modalidade": MAX_PONTOS_POR_MODALIDADE
    }

# Configurar logging
def setup_logging(log_file=None):
    """Configura o sistema de logging."""
    log_format = "%(asctime)s - %(levelname)s - %(message)s"
    handlers = [logging.StreamHandler(sys.stdout)]
    
    if log_file:
        log_dir = Path(log_file).parent
        if log_dir and not log_dir.exists():
            log_dir.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(log_file, encoding='utf-8'))
    
    logging.basicConfig(
        level=logging.INFO,
        format=log_format,
        handlers=handlers
    )

def load_config():
    """Carrega a configuração do arquivo JSON."""
    config = get_default_config()
    
    # Procura o arquivo de configuração no diretório atual ou no diretório do script
    config_paths = [
        Path(CONFIG_FILE),
        Path(__file__).parent / CONFIG_FILE,
        Path.home() / ".config" / "sistemaponto" / CONFIG_FILE
    ]
    
    for config_path in config_paths:
        if config_path.exists():
            try:
                with open(config_path, 'r', encoding='utf-8') as f:
                    user_config = json.load(f)
                    config.update(user_config)
                    logging.info(f"Configuração carregada de: {config_path}")
                    break
            except json.JSONDecodeError as e:
                logging.warning(f"Erro de sintaxe JSON em {config_path}: {e}")
            except IOError as e:
                logging.warning(f"Erro ao ler arquivo {config_path}: {e}")
    
    return config

def save_default_config(path=None):
    """Salva um arquivo de configuração padrão."""
    if path is None:
        path = Path(CONFIG_FILE)
    
    config = get_default_config()
    config["log_file"] = "logs/sistema_ponto.log"  # Define log file apenas no arquivo salvo
    
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"Arquivo de configuração criado: {path}")
        return True
    except IOError as e:
        print(f"Erro ao criar arquivo de configuração: {e}")
        return False

def is_dia_teoria(config):
    """
    Verifica se hoje é um dia de teoria.

    Suporta dois formatos de configuração:
    - Novo: "horarios_teoria": [{"dia": 1, "hora_transicao": "17:30", "hora_inicio": "18:00"}, ...]
    - Legado: "dias_teoria": [1, 3]

    Retorna True se:
    - O dia da semana consta em horarios_teoria (ou dias_teoria legado)
    - OU a data de hoje está na lista dias_especiais_teoria
    """
    hoje = date.today()
    dia_semana = hoje.weekday()  # 0=Segunda, 1=Terça, ..., 6=Domingo

    # Verifica no novo formato horarios_teoria
    horarios = config.get("horarios_teoria")
    if horarios:
        for h in horarios:
            if isinstance(h, dict) and h.get("dia") == dia_semana:
                return True
    else:
        # Fallback para formato legado
        if dia_semana in config.get("dias_teoria", DIAS_TEORIA_PADRAO):
            return True

    # Verifica se é um dia especial de teoria
    data_hoje_str = hoje.strftime("%d/%m/%Y")
    dias_especiais = config.get("dias_especiais_teoria", [])

    for item in dias_especiais:
        data_item = item.get("data", item) if isinstance(item, dict) else item
        if data_item == data_hoje_str:
            logging.info(f"Dia especial de teoria: {data_hoje_str}")
            return True

    return False

def _parse_hhmm(hhmm_str):
    """Converte string 'HH:MM' para objeto datetime.time. Retorna None se inválido."""
    try:
        h, m = hhmm_str.split(":")
        return dtime(int(h), int(m))
    except (ValueError, AttributeError):
        return None

def _normalizar_texto(texto):
    """Remove acentos e converte para minúsculas para comparação resiliente."""
    return unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode("ascii").lower()

def get_horario_teoria_hoje(config):
    """
    Retorna o horário de teoria para hoje como dict:
        {"hora_transicao": "17:30", "hora_inicio": "18:00"}

    Prioridade de busca:
    1. dias_especiais_teoria (por data específica, no novo formato dict)
    2. horarios_teoria (por dia da semana)
    3. Fallback: campos legados hora_transicao_teoria / hora_inicio_teoria
    4. Constantes padrão

    Retorna None se hoje não é dia de teoria.
    """
    if not is_dia_teoria(config):
        return None

    hoje = date.today()
    dia_semana = hoje.weekday()
    data_hoje_str = hoje.strftime("%d/%m/%Y")

    # 1. Dia especial com horário próprio
    for item in config.get("dias_especiais_teoria", []):
        if isinstance(item, dict) and item.get("data") == data_hoje_str:
            return {
                "hora_transicao": item.get("hora_transicao", HORA_TRANSICAO_TEORIA_PADRAO),
                "hora_inicio": item.get("hora_inicio", HORA_INICIO_TEORIA_PADRAO),
            }

    # 2. horarios_teoria por dia da semana
    for h in config.get("horarios_teoria", []):
        if isinstance(h, dict) and h.get("dia") == dia_semana:
            return {
                "hora_transicao": h.get("hora_transicao", HORA_TRANSICAO_TEORIA_PADRAO),
                "hora_inicio": h.get("hora_inicio", HORA_INICIO_TEORIA_PADRAO),
            }

    # 3. Campos legados / constantes
    return {
        "hora_transicao": config.get("hora_transicao_teoria", HORA_TRANSICAO_TEORIA_PADRAO),
        "hora_inicio": config.get("hora_inicio_teoria", HORA_INICIO_TEORIA_PADRAO),
    }

def determinar_modalidade(config):
    """
    Determina a modalidade do ponto atual: 'Teoria' ou 'Prática'.

    Regras:
    - Se hoje NÃO é dia de teoria → sempre 'Prática'
    - Se hoje É dia de teoria E hora atual >= hora_transicao → 'Teoria'
    - Caso contrário → 'Prática'
    """
    horario = get_horario_teoria_hoje(config)
    if horario is None:
        return 'Prática'

    hora_transicao = _parse_hhmm(horario["hora_transicao"])
    hora_atual = _parse_hhmm(datetime.now().strftime("%H:%M"))

    if hora_transicao is None or hora_atual is None:
        return 'Prática'

    return 'Teoria' if hora_atual >= hora_transicao else 'Prática'

def consultar_pontos_do_dia(serial, data_iso, endpoint):
    """
    Consulta o endpoint via GET para verificar pontos já registrados
    para o aluno no dia informado.

    Retorna lista de registros ou None em caso de erro / sem suporte.
    Formato esperado da resposta: {"pontos": [...]} ou lista direta [...].
    """
    try:
        params = {
            "action": "getPontos",
            "serial": serial,
            "data": data_iso,
        }
        r = requests.get(endpoint, params=params, timeout=5)
        if r.status_code == 200:
            try:
                data = r.json()
                if isinstance(data, list):
                    return data
                if isinstance(data, dict):
                    for key in ("pontos", "registros", "data", "records"):
                        if key in data and isinstance(data[key], list):
                            return data[key]
            except ValueError:
                pass
    except Exception as e:
        logging.debug(f"Erro ao consultar pontos do dia: {e}")
    return None

def verificar_ponto_duplicado(serial, data_iso, modalidade, endpoint, config):
    """
    Verifica se o aluno já atingiu o limite de pontos para a modalidade no dia.

    Retorna tupla (bloqueado: bool, contagem: int, mensagem: str).
    - bloqueado=True  → não deve registrar ponto
    - bloqueado=False → pode registrar (ou não foi possível verificar)
    """
    max_pontos = config.get("max_pontos_por_modalidade", MAX_PONTOS_POR_MODALIDADE)
    pontos = consultar_pontos_do_dia(serial, data_iso, endpoint)

    if pontos is None:
        return False, 0, "⚠️  Não foi possível verificar duplicatas (servidor sem suporte a consulta)."

    # Filtra registros da modalidade atual (aceita variações de campo e normaliza acentos)
    modalidade_norm = _normalizar_texto(modalidade)

    def _modalidade_match(p):
        for key in ("modalidade", "Pratica_Teorica", "Pratica/Teorica", "tipo"):
            val = p.get(key, "")
            if val and _normalizar_texto(val) == modalidade_norm:
                return True
        return False

    pontos_modalidade = [p for p in pontos if _modalidade_match(p)]
    contagem = len(pontos_modalidade)

    if contagem >= max_pontos:
        msg = (
            f"🚫 PONTO JÁ REGISTRADO!\n"
            f"   O aluno já possui {contagem} registro(s) de {modalidade} hoje\n"
            f"   (máximo: {max_pontos} por modalidade por dia)."
        )
        return True, contagem, msg

    return False, contagem, f"Pontos de {modalidade} hoje: {contagem}/{max_pontos}"


def beep(kind="short"):
    """Feedback sonoro simples (works on Windows via winsound, else fallback to terminal bell)."""
    try:
        if platform.system() == "Windows":
            import winsound
            if kind == "short":
                winsound.Beep(800, 120)
            elif kind == "long":
                winsound.Beep(600, 350)
            else:
                winsound.Beep(1000, 100)
        else:
            # terminal bell (may or may not sound depending on OS/terminal)
            if kind == "short":
                print("\a", end="", flush=True)
            else:
                print("\a\a", end="", flush=True)
    except Exception:
        pass

def send_to_endpoint(serial, nome, endpoint, is_teoria_day=False, escala="", email="", modalidade=None, tipo_registro=None):
    """Envia POST JSON para o Apps Script."""
    payload = {
        "SerialNumber": serial,
        "NomeCompleto": nome,
        "EmailHC": email,
        "IsDiaTeoria": is_teoria_day,
        "Escala": escala
    }
    if modalidade is not None:
        payload["Modalidade"] = modalidade
    if tipo_registro is not None:
        payload["TipoRegistro"] = tipo_registro
    try:
        r = requests.post(endpoint, json=payload, timeout=10)
        return r.status_code, r.text
    except Exception as e:
        return None, str(e)

def registrar_transicao_ponto(serial, nome, endpoint, escala, config):
    """
    Registra o duplo ponto de transição (Terça/Quinta partir da hora_transicao):
      1. Saída da Prática
      2. Entrada da Teoria

    Ambos enviados com a mesma hora (hora atual).

    Retorna:
      (ok_pratica: bool, ok_teoria: bool, msg_pratica: str, msg_teoria: str)
    """
    hora_fim_teoria = config.get("hora_fim_teoria", HORA_FIM_TEORIA_PADRAO)

    # 1 — Saída da Prática
    code1, text1 = send_to_endpoint(
        serial, nome, endpoint,
        is_teoria_day=True,
        escala=escala,
        modalidade="Prática",
        tipo_registro="Saída"
    )
    ok_pratica = code1 == 200
    msg_pratica = (
        "✅ Saída da Prática registrada!"
        if ok_pratica
        else f"⚠️  Saída Prática: {code1} — {text1}"
    )

    # 2 — Entrada da Teoria
    code2, text2 = send_to_endpoint(
        serial, nome, endpoint,
        is_teoria_day=True,
        escala=escala,
        modalidade="Teoria",
        tipo_registro="Entrada",
    )
    ok_teoria = code2 == 200
    msg_teoria = (
        f"✅ Entrada da Teoria registrada! (até {hora_fim_teoria})"
        if ok_teoria
        else f"⚠️  Entrada Teoria: {code2} — {text2}"
    )

    return ok_pratica, ok_teoria, msg_pratica, msg_teoria

def add_dia_especial(data_str, hora_transicao=None, hora_inicio=None, config_path=None):
    """Adiciona um dia especial de teoria.

    Aceita:
      data_str       - DD/MM/YYYY
      hora_transicao - HH:MM (opcional, usa padrão se omitido)
      hora_inicio    - HH:MM (opcional, usa padrão se omitido)
    """
    if config_path is None:
        config_path = Path(CONFIG_FILE)

    # Valida o formato da data
    try:
        datetime.strptime(data_str, "%d/%m/%Y")
    except ValueError:
        print(f"Erro: Data inválida '{data_str}'. Use o formato dd/mm/yyyy")
        return False

    # Carrega a configuração existente ou cria uma nova
    config = {}
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Aviso: Erro de sintaxe no arquivo de configuração: {e}")
            print("Criando nova configuração...")
        except IOError as e:
            print(f"Aviso: Erro ao ler arquivo de configuração: {e}")

    if "dias_especiais_teoria" not in config:
        config["dias_especiais_teoria"] = []

    # Normaliza entradas antigas (strings) para dicts e remove a data se existir
    novos = []
    for item in config["dias_especiais_teoria"]:
        data_item = item.get("data", item) if isinstance(item, dict) else item
        if data_item != data_str:
            novos.append(item)

    novo_item = {"data": data_str}
    if hora_transicao:
        novo_item["hora_transicao"] = hora_transicao
    if hora_inicio:
        novo_item["hora_inicio"] = hora_inicio

    novos.append(novo_item)
    novos.sort(key=lambda x: datetime.strptime(
        x.get("data", x) if isinstance(x, dict) else x, "%d/%m/%Y"
    ))
    config["dias_especiais_teoria"] = novos

    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"Dia especial de teoria adicionado: {data_str}" +
              (f" (transição: {hora_transicao})" if hora_transicao else ""))
        return True
    except IOError as e:
        print(f"Erro ao salvar configuração: {e}")
        return False

def remove_dia_especial(data_str, config_path=None):
    """Remove um dia especial de teoria (suporta formato string e dict)."""
    if config_path is None:
        config_path = Path(CONFIG_FILE)

    if not config_path.exists():
        print("Arquivo de configuração não encontrado.")
        return False

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Erro ao ler configuração: {e}")
        return False

    dias_especiais = config.get("dias_especiais_teoria", [])
    novos = [
        item for item in dias_especiais
        if (item.get("data", item) if isinstance(item, dict) else item) != data_str
    ]

    if len(novos) == len(dias_especiais):
        print(f"Data {data_str} não encontrada na lista de dias especiais.")
        return False

    config["dias_especiais_teoria"] = novos

    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"Dia especial de teoria removido: {data_str}")
        return True
    except IOError as e:
        print(f"Erro ao salvar configuração: {e}")
        return False

def list_dias_especiais(config_path=None):
    """Lista todos os dias e horários de teoria configurados."""
    if config_path is None:
        config_path = Path(CONFIG_FILE)

    dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

    if not config_path.exists():
        print("Nenhum arquivo de configuração encontrado.")
        print("Configuração padrão:")
        for h in HORARIOS_TEORIA_PADRAO:
            print(f"  - {dias_semana[h['dia']]}-feira | transição: {h['hora_transicao']} | início: {h['hora_inicio']}")
        return

    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Erro ao ler configuração: {e}")
        return

    print("\n=== Configuração de Dias de Teoria ===")

    # Novo formato horarios_teoria
    horarios = config.get("horarios_teoria")
    if horarios:
        print("\nDias fixos semanais (horarios_teoria):")
        for h in sorted(horarios, key=lambda x: x.get("dia", 0)):
            dia_nome = dias_semana[h["dia"]] if 0 <= h.get("dia", -1) <= 6 else f"dia {h.get('dia')}"
            print(f"  - {dia_nome}-feira | transição: {h.get('hora_transicao','?')} | início: {h.get('hora_inicio','?')}")
    else:
        # Legado
        dias_teoria = config.get("dias_teoria", DIAS_TEORIA_PADRAO)
        hora_t = config.get("hora_transicao_teoria", HORA_TRANSICAO_TEORIA_PADRAO)
        hora_i = config.get("hora_inicio_teoria", HORA_INICIO_TEORIA_PADRAO)
        print("\nDias fixos semanais (formato legado):")
        for dia in dias_teoria:
            print(f"  - {dias_semana[dia]}-feira | transição: {hora_t} | início: {hora_i}")

    hora_fim = config.get("hora_fim_teoria", HORA_FIM_TEORIA_PADRAO)
    print(f"\nEncerramento da teoria: {hora_fim} (meia-noite)")

    dias_especiais = config.get("dias_especiais_teoria", [])
    print("\nDias especiais:")
    if dias_especiais:
        for item in dias_especiais:
            if isinstance(item, dict):
                data = item.get("data", "?")
                ht = item.get("hora_transicao", HORA_TRANSICAO_TEORIA_PADRAO)
                hi = item.get("hora_inicio", HORA_INICIO_TEORIA_PADRAO)
                print(f"  - {data} | transição: {ht} | início: {hi}")
            else:
                print(f"  - {item}")
    else:
        print("  (nenhum dia especial configurado)")

    print("")

def set_escala_atual(escala_str, config_path=None):
    """Define a escala atual para registro de ponto."""
    if config_path is None:
        config_path = Path(CONFIG_FILE)
    
    # Valida o número da escala (deve ser entre 1 e 12)
    try:
        escala_num = int(escala_str)
        if escala_num < 1 or escala_num > 12:
            print(f"Erro: Escala inválida '{escala_str}'. Deve ser um número entre 1 e 12.")
            return False
    except ValueError:
        print(f"Erro: Escala inválida '{escala_str}'. Deve ser um número entre 1 e 12.")
        return False
    
    # Carrega a configuração existente ou cria uma nova
    config = {}
    if config_path.exists():
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Aviso: Erro de sintaxe no arquivo de configuração: {e}")
            print("Criando nova configuração...")
        except IOError as e:
            print(f"Aviso: Erro ao ler arquivo de configuração: {e}")
    
    # Define a nova escala
    config["escala_atual"] = str(escala_num)
    
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        print(f"\n=== Escala Atualizada ===")
        print(f"\n  Escala atual definida: {escala_num}")
        print(f"\n  Esta escala será usada para todos os próximos registros de ponto.")
        print("")
        return True
    except IOError as e:
        print(f"Erro ao salvar configuração: {e}")
        return False

def get_endpoint_for_config(config):
    """Retorna a URL do endpoint configurada, com fallback para o padrão."""
    return config.get("endpoint") or ENDPOINT


def install_windows_startup():
    """Instala o script para iniciar com o Windows."""
    if platform.system() != "Windows":
        print("Esta funcionalidade só está disponível no Windows.")
        return False
    
    try:
        import winreg
        
        # Obtém o caminho absoluto do script
        script_path = Path(__file__).resolve()
        python_path = sys.executable
        
        # Comando para executar em segundo plano
        cmd = f'"{python_path}" "{script_path}" --background'
        
        # Abre a chave do registro para programas de inicialização
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE
        )
        
        winreg.SetValueEx(key, "SistemaPonto", 0, winreg.REG_SZ, cmd)
        winreg.CloseKey(key)
        
        print("SistemaPonto instalado para iniciar com o Windows!")
        print(f"Comando: {cmd}")
        return True
        
    except ImportError:
        print("Erro: módulo winreg não disponível.")
        return False
    except Exception as e:
        print(f"Erro ao instalar no registro do Windows: {e}")
        return False

def uninstall_windows_startup():
    """Remove o script da inicialização do Windows."""
    if platform.system() != "Windows":
        print("Esta funcionalidade só está disponível no Windows.")
        return False
    
    try:
        import winreg
        
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0,
            winreg.KEY_SET_VALUE
        )
        
        try:
            winreg.DeleteValue(key, "SistemaPonto")
            print("SistemaPonto removido da inicialização do Windows.")
        except FileNotFoundError:
            print("SistemaPonto não estava instalado na inicialização.")
        
        winreg.CloseKey(key)
        return True
        
    except ImportError:
        print("Erro: módulo winreg não disponível.")
        return False
    except Exception as e:
        print(f"Erro ao remover do registro do Windows: {e}")
        return False

def hide_console_window():
    """Esconde a janela do console no Windows."""
    if platform.system() == "Windows":
        try:
            import ctypes
            ctypes.windll.user32.ShowWindow(
                ctypes.windll.kernel32.GetConsoleWindow(), 0
            )
            return True
        except Exception:
            pass
    return False

def clear_screen():
    """Limpa a tela do terminal."""
    os.system('cls' if platform.system() == 'Windows' else 'clear')

def print_header():
    """Exibe o cabeçalho do programa."""
    print("\n" + "=" * 60)
    print("           🎓 SISTEMA DE PONTO NFC - ENSINO FISIO")
    print("=" * 60)
    data_hora = datetime.now().strftime("%d/%m/%Y às %H:%M:%S")
    print(f"                    {data_hora}")
    print("=" * 60 + "\n")

def aluno_existe(uid, config):
    """Verifica se o aluno já está cadastrado pelo UID."""
    # Verifica na lista de alunos (novo formato)
    alunos = config.get("alunos", {})
    if uid in alunos:
        return True
    
    # Verifica no formato antigo (nomes)
    nomes = config.get("nomes", {})
    if uid in nomes:
        return True
    
    return False

def get_nome_aluno(uid, config):
    """Obtém o nome do aluno pelo UID."""
    # Primeiro verifica na lista de alunos (novo formato)
    alunos = config.get("alunos", {})
    if uid in alunos:
        aluno = alunos[uid]
        if isinstance(aluno, dict):
            return aluno.get("nome", "Desconhecido")
        return aluno
    
    # Fallback para o formato antigo (nomes)
    nomes = config.get("nomes", NOMES)
    return nomes.get(uid, "Desconhecido")

def get_email_aluno(uid, config):
    """Obtém o e-mail do aluno pelo UID."""
    alunos = config.get("alunos", {})
    if uid in alunos:
        aluno = alunos[uid]
        if isinstance(aluno, dict):
            return aluno.get("email", "")
    return ""

def validar_email(email):
    """Valida o formato básico de um e-mail (usuario@dominio.tld)."""
    if not email or '@' not in email:
        return False
    partes = email.split('@')
    if len(partes) != 2:
        return False
    usuario, dominio = partes
    if not usuario:
        return False
    partes_dominio = dominio.split('.')
    # Precisa de pelo menos 'dominio.tld' com caracteres em cada parte
    if len(partes_dominio) < 2 or any(p == '' for p in partes_dominio):
        return False
    return True

def salvar_config(config, config_path=None):
    """Salva a configuração no arquivo JSON."""
    if config_path is None:
        # Procura o arquivo de configuração existente ou usa o padrão
        config_paths = [
            Path(CONFIG_FILE),
            Path(__file__).parent / CONFIG_FILE,
        ]
        for path in config_paths:
            if path.exists():
                config_path = path
                break
        if config_path is None:
            config_path = Path(__file__).parent / CONFIG_FILE
    
    try:
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
        return True
    except IOError as e:
        print(f"   ❌ Erro ao salvar configuração: {e}")
        return False

def cadastrar_aluno_inline(uid, config):
    """
    Cadastra um novo aluno diretamente quando o UID não é encontrado.
    Retorna (nome, email) do aluno cadastrado ou (None, None) se cancelado.
    """
    print("\n   " + "═" * 50)
    print("   📝 NOVO CRACHÁ DETECTADO - CADASTRO NECESSÁRIO")
    print("   " + "═" * 50)
    print(f"   🔢 UID: {uid}")
    print("   " + "─" * 50)
    
    print("\n   Digite o nome completo do aluno:")
    print("   (ou deixe em branco para pular o cadastro)")
    nome = input("   Nome: ").strip()
    
    if not nome:
        print("\n   ⚠️  Cadastro pulado. Ponto será registrado como 'Desconhecido'.")
        return None, None
    
    print("\n   Digite o e-mail do aluno:")
    print("   (ou deixe em branco para preencher depois)")
    MAX_TENTATIVAS = 3
    email = ""
    for tentativa in range(MAX_TENTATIVAS):
        entrada = input("   E-mail: ").strip().lower()
        if not entrada:
            break
        if validar_email(entrada):
            email = entrada
            break
        restantes = MAX_TENTATIVAS - tentativa - 1
        if restantes > 0:
            print(f"   ⚠️  E-mail inválido. Tente novamente ({restantes} tentativa(s) restante(s)) ou deixe em branco para pular.")
        else:
            print("   ⚠️  E-mail inválido. Continuando sem e-mail.")
    
    # Salvar no config
    if "alunos" not in config:
        config["alunos"] = {}
    
    config["alunos"][uid] = {
        "nome": nome,
        "email": email,
        "data_cadastro": datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    }
    
    # Também atualiza o campo nomes para compatibilidade
    if "nomes" not in config:
        config["nomes"] = {}
    config["nomes"][uid] = nome
    
    # Salvar configuração
    if salvar_config(config):
        print("\n   " + "═" * 50)
        print("   ✅ ALUNO CADASTRADO COM SUCESSO!")
        print("   " + "═" * 50)
        print(f"   📛 Nome: {nome}")
        print(f"   🔢 UID: {uid}")
        print(f"   📧 Email: {email if email else '(não informado)'}")
        print("   " + "═" * 50)
        return nome, email
    else:
        print("\n   ❌ Erro ao salvar cadastro.")
        return None, None

def listar_alunos_cadastrados(config):
    """Lista todos os alunos cadastrados de forma compacta."""
    alunos = config.get("alunos", {})
    nomes = config.get("nomes", {})
    
    # Combina as duas listas (alunos tem prioridade)
    todos_alunos = {}
    
    # Adiciona do formato antigo
    for uid, nome in nomes.items():
        if uid not in todos_alunos:
            todos_alunos[uid] = {"nome": nome, "email": ""}
    
    # Adiciona/sobrescreve do formato novo
    for uid, dados in alunos.items():
        if isinstance(dados, dict):
            todos_alunos[uid] = dados
        else:
            todos_alunos[uid] = {"nome": dados, "email": ""}
    
    return todos_alunos

def main_interativo(config):
    """Loop principal interativo com detecção automática de cadastro e anti-duplicata."""
    global _last_time

    clear_screen()
    print_header()

    endpoint = get_endpoint_for_config(config)
    debounce = config.get("debounce_seconds", DEBOUNCE_SECONDS)
    escala_atual = config.get("escala_atual", "9")

    # Verifica status do dia
    is_teoria = is_dia_teoria(config)
    horario_hoje = get_horario_teoria_hoje(config)
    hora_transicao = horario_hoje["hora_transicao"] if horario_hoje else HORA_TRANSICAO_TEORIA_PADRAO
    hora_inicio = horario_hoje["hora_inicio"] if horario_hoje else HORA_INICIO_TEORIA_PADRAO
    hora_fim_teoria = config.get("hora_fim_teoria", HORA_FIM_TEORIA_PADRAO)
    modalidade = determinar_modalidade(config)

    # Cabeçalho informativo do dia
    print("┌─────────────────────────────────────────────────────────┐")
    if is_teoria:
        print("│         📅 HOJE É DIA DE TEORIA + PRÁTICA               │")
        print(f"│  Prática → antes das {hora_transicao}  |  Teoria → {hora_inicio} até {hora_fim_teoria}    │")
    else:
        print("│         📅 HOJE É DIA DE PRÁTICA                        │")
    print("└─────────────────────────────────────────────────────────┘")
    print(f"\n   🕐 Modalidade atual: {modalidade}")
    print(f"   📊 Escala Atual:    {escala_atual}")

    alunos = listar_alunos_cadastrados(config)
    print(f"   👥 Alunos cadastrados: {len(alunos)}")

    print("\n" + "═" * 60)
    print("   👆 APROXIME O CRACHÁ DO LEITOR PARA BATER PONTO")
    print("      • Aluno cadastrado → Ponto registrado automaticamente")
    print("      • Aluno novo       → Cadastro será solicitado")
    if is_teoria:
        print(f"      • A partir das {hora_transicao}: registra Saída Prática + Entrada Teoria")
    print("   (Ctrl+C para sair)")
    print("═" * 60)

    # Controle de data para recarregar config apenas uma vez por dia
    last_config_date = date.today()

    try:
        while True:
            print("\n   ⏳ Aguardando leitura do crachá...")

            line = sys.stdin.readline()
            if not line:
                break

            serial = line.strip()
            if not serial:
                continue

            # Validação: espera 8+ dígitos numéricos
            if not (serial.isdigit() and len(serial) >= 8):
                if serial:
                    print(f"   ⚠️  Leitura não reconhecida: '{serial}'")
                continue

            now = time.time()
            if now - _last_time < debounce:
                continue
            _last_time = now

            # Recarrega configuração se mudou o dia
            current_date = date.today()
            if current_date != last_config_date:
                config = load_config()
                is_teoria = is_dia_teoria(config)
                horario_hoje = get_horario_teoria_hoje(config)
                hora_transicao = horario_hoje["hora_transicao"] if horario_hoje else HORA_TRANSICAO_TEORIA_PADRAO
                hora_inicio = horario_hoje["hora_inicio"] if horario_hoje else HORA_INICIO_TEORIA_PADRAO
                hora_fim_teoria = config.get("hora_fim_teoria", HORA_FIM_TEORIA_PADRAO)
                escala_atual = config.get("escala_atual", "9")
                endpoint = get_endpoint_for_config(config)
                last_config_date = current_date
                print(f"\n   🔄 Novo dia detectado. Dia de teoria: {is_teoria}")

            hora = datetime.now().strftime("%H:%M:%S")
            data_br = datetime.now().strftime("%d/%m/%Y")
            data_iso = datetime.now().strftime("%Y-%m-%d")

            # Determina modalidade baseada na hora atual
            modalidade = determinar_modalidade(config)
            # True quando está no momento de transição (>= hora_transicao em dia de teoria)
            em_transicao = is_teoria and (modalidade == 'Teoria')

            # Resolve o nome do aluno (cadastrando se necessário)
            if aluno_existe(serial, config):
                nome = get_nome_aluno(serial, config)
                email = get_email_aluno(serial, config)
                
                print("\n   " + "─" * 50)
                print("   ✅ CRACHÁ RECONHECIDO!")
                print("   " + "─" * 50)
                print(f"   📛 Nome: {nome}")
                print(f"   🔢 UID: {serial}")
                print(f"   📅 Data: {data_br}")
                print(f"   ⏰ Hora: {hora}")
                print(f"   📚 Tipo: {'Teoria' if is_teoria else 'Prática'}")
                print(f"   📊 Escala: {escala_atual}")
                print("   " + "─" * 50)
                
                print("   📤 Enviando para o servidor...")
                
                code, text = send_to_endpoint(serial, nome, endpoint, is_teoria, escala_atual, email)
                
                if code is None:
                    print(f"   ❌ ERRO DE ENVIO: {text}")
                    beep("long")
                elif code == 200:
                    print("   ✅ PONTO REGISTRADO COM SUCESSO!")
                    beep("short")
                else:
                    print(f"   ⚠️  Resposta do servidor: {code}")
                    beep("long")
                
                print("   " + "─" * 50)
            
            else:
                # ALUNO NÃO EXISTE - Solicitar cadastro
                nome, email = cadastrar_aluno_inline(serial, config)
                
                if nome:
                    # Aluno foi cadastrado, registrar ponto
                    print(f"\n   📤 Registrando ponto para {nome}...")
                    
                    code, text = send_to_endpoint(serial, nome, endpoint, is_teoria, escala_atual, email)
                    
                    if code is None:
                        print(f"   ❌ ERRO DE ENVIO: {text}")
                        beep("long")
                    else:
                        if code == 200:
                            print("   ✅ PONTO REGISTRADO COM SUCESSO!")
                            beep("short")
                        else:
                            print(f"   ⚠️  Resposta do servidor: {code}")
                            beep("long")
                else:
                    # Usuário pulou o cadastro, registrar como desconhecido
                    print(f"\n   📤 Registrando ponto como 'Desconhecido'...")
                    
                    code, text = send_to_endpoint(serial, "Desconhecido", endpoint, is_teoria, escala_atual)
                    
                    if code is None:
                        print(f"   ❌ ERRO DE ENVIO: {text}")
                        beep("long")
                    else:
                        if code == 200:
                            print("   ✅ PONTO REGISTRADO (como Desconhecido)")
                            beep("short")
                        else:
                            print(f"   ⚠️  Resposta do servidor: {code}")
                            beep("long")
                
                print("   " + "─" * 50)
    
    except KeyboardInterrupt:
        print("\n\n   👋 Sistema encerrado pelo usuário.")
        print("   Até logo!\n")


def main(config):
    """Loop principal do programa."""
    global _last_time
    
    endpoint = get_endpoint_for_config(config)
    debounce = config.get("debounce_seconds", DEBOUNCE_SECONDS)
    escala_atual = config.get("escala_atual", "9")
    
    logging.info("=== Sistema de Ponto NFC ===")
    logging.info(f"Endpoint: {endpoint}")
    logging.info(f"Escala Atual: {escala_atual}")
    logging.info("Aguardando leitura de crachás... (Ctrl+C para sair)")
    
    # Verifica se hoje é dia de teoria
    is_teoria = is_dia_teoria(config)
    if is_teoria:
        logging.info("Hoje é dia de TEORIA (aulas teóricas permitidas)")
    else:
        logging.info("Hoje NÃO é dia de teoria (apenas prática)")
    
    # Controle de data para recarregar config apenas uma vez por dia
    last_config_date = date.today()
    
    try:
        while True:
            # lê linha (o leitor HID "digita" o UID e envia Enter)
            line = sys.stdin.readline()
            if not line:
                # EOF
                break
            serial = line.strip()
            if not serial:
                continue

            # validação: espera 8+ dígitos numéricos
            if not (serial.isdigit() and len(serial) >= 8):
                logging.debug(f"Leitura não reconhecida: '{serial}'")
                continue

            now = time.time()
            if now - _last_time < debounce:
                # debounce para evitar duplicados
                continue
            _last_time = now

            # Recarrega configuração apenas se mudou o dia
            # (para verificar novos dias especiais adicionados)
            current_date = date.today()
            if current_date != last_config_date:
                config = load_config()
                is_teoria = is_dia_teoria(config)
                escala_atual = config.get("escala_atual", "9")
                endpoint = get_endpoint_for_config(config)
                last_config_date = current_date
                logging.info(f"Novo dia detectado. Dia de teoria: {is_teoria}")

            nome = get_nome_aluno(serial, config)
            email = get_email_aluno(serial, config)
            hora = datetime.now().strftime("%H:%M:%S")
            data = datetime.now().strftime("%d/%m/%Y")
            
            logging.info(f"Lido: {serial} ({nome}) - {data} {hora}")
            logging.info(f"Enviando para endpoint... (Dia Teoria: {is_teoria}, Escala: {escala_atual})")

            code, text = send_to_endpoint(serial, nome, endpoint, is_teoria, escala_atual, email)
            if code is None:
                logging.error(f"Erro de envio: {text}")
                beep("long")
            else:
                logging.info(f"Resposta: {code} - {text}")
                if code == 200:
                    beep("short")
                else:
                    beep("long")

    except KeyboardInterrupt:
        logging.info("Encerrado pelo usuário.")
    except Exception as e:
        logging.exception(f"Erro inesperado: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Sistema de Ponto NFC -> Google Apps Script",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos de uso:
  python SistemaPonto.py                                    # Execução interativa (padrão)
  python SistemaPonto.py --background                       # Executar em segundo plano (Windows)
  python SistemaPonto.py --add-dia 25/12/2024               # Dia especial (horários padrão)
  python SistemaPonto.py --add-dia 25/12/2024 --hora-transicao 16:30 --hora-inicio 17:00
  python SistemaPonto.py --remove-dia 25/12/2024            # Remover dia especial
  python SistemaPonto.py --list-dias                        # Listar dias/horários configurados
  python SistemaPonto.py --list-alunos                      # Listar alunos cadastrados
  python SistemaPonto.py --set-escala 9                     # Definir escala atual como 9
  python SistemaPonto.py --show-escala                      # Mostrar escala atual
  python SistemaPonto.py --install-startup                  # Instalar para iniciar com Windows
  python SistemaPonto.py --create-config                    # Criar arquivo de configuração padrão

Funcionamento:
  - Ao aproximar um crachá antes de hora_transicao → registra Prática (entrada ou saída)
  - Ao aproximar a partir de hora_transicao em dia de teoria →
      registra automaticamente: Saída da Prática + Entrada da Teoria (1 tap = 2 registros)
  - Teoria encerra às hora_fim_teoria (padrão: 00:00 / meia-noite)
  - Horários configuráveis por dia da semana em horarios_teoria no config_ponto.json
        """
    )
    parser.add_argument("--endpoint", "-e", help="URL do Apps Script endpoint")
    parser.add_argument("--background", "-b", action="store_true",
                        help="Executar em segundo plano (esconde janela no Windows)")
    parser.add_argument("--create-config", action="store_true",
                        help="Criar arquivo de configuração padrão")
    parser.add_argument("--add-dia", metavar="DD/MM/YYYY",
                        help="Adicionar um dia especial de teoria")
    parser.add_argument("--hora-transicao", metavar="HH:MM",
                        help="Hora de transição Prática→Teoria para --add-dia (ex: 17:30)")
    parser.add_argument("--hora-inicio", metavar="HH:MM",
                        help="Hora de início da teoria para --add-dia (ex: 18:00)")
    parser.add_argument("--remove-dia", metavar="DD/MM/YYYY",
                        help="Remover um dia especial de teoria")
    parser.add_argument("--list-dias", action="store_true",
                        help="Listar dias e horários de teoria configurados")
    parser.add_argument("--list-alunos", action="store_true",
                        help="Listar alunos cadastrados")
    parser.add_argument("--set-escala", metavar="N",
                        help="Definir a escala atual (1-12)")
    parser.add_argument("--show-escala", action="store_true",
                        help="Mostrar a escala atual configurada")
    parser.add_argument("--install-startup", action="store_true",
                        help="Instalar para iniciar com o Windows")
    parser.add_argument("--uninstall-startup", action="store_true",
                        help="Remover da inicialização do Windows")

    args = parser.parse_args()

    # Comandos de gerenciamento
    if args.create_config:
        save_default_config()
        sys.exit(0)

    if args.add_dia:
        add_dia_especial(
            args.add_dia,
            hora_transicao=getattr(args, 'hora_transicao', None),
            hora_inicio=getattr(args, 'hora_inicio', None),
        )
        sys.exit(0)

    if args.remove_dia:
        remove_dia_especial(args.remove_dia)
        sys.exit(0)

    if args.list_dias:
        list_dias_especiais()
        sys.exit(0)

    if args.list_alunos:
        config = load_config()
        alunos = listar_alunos_cadastrados(config)
        print("\n=== Alunos Cadastrados ===\n")
        if not alunos:
            print("Nenhum aluno cadastrado.")
        else:
            for uid, dados in sorted(alunos.items(), key=lambda x: x[1].get("nome", "")):
                nome = dados.get("nome", "")
                email = dados.get("email", "") or "(sem email)"
                print(f"  {uid}: {nome} - {email}")
        print("")
        sys.exit(0)

    if args.show_escala:
        config = load_config()
        escala = config.get("escala_atual", "9")
        print(f"\n=== Escala Atual ===\n")
        print(f"  Escala configurada: {escala}")
        print("")
        sys.exit(0)

    if args.set_escala:
        set_escala_atual(args.set_escala)
        sys.exit(0)

    if args.install_startup:
        install_windows_startup()
        sys.exit(0)

    if args.uninstall_startup:
        uninstall_windows_startup()
        sys.exit(0)

    # Carrega configuração
    config = load_config()
    
    # Sobrescreve endpoint se fornecido via argumento
    if args.endpoint:
        config["endpoint"] = args.endpoint
    
    # Modo background (esconde console no Windows e usa logging)
    if args.background:
        hide_console_window()
        # Configura logging para modo background
        setup_logging(config.get("log_file"))
        # Executa o loop principal silencioso (antigo)
        main(config)
    else:
        # Modo interativo (padrão) - com visual melhorado
        main_interativo(config)
