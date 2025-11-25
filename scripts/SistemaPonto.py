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
import select
from datetime import datetime, date
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
ENDPOINT = "https://script.google.com/macros/s/AKfycbwNNwndI5_oh7klQI9zgeW5eiKhdkhHPlVbOeOuxFPF6XrEsFDtQrwqqD0J2q1CdLXy/exec"
DEBOUNCE_SECONDS = 1.2
CONFIG_FILE = "config_ponto.json"

# Mapeie aqui os IDs para exibir nome (opcional) - legado, usar alunos no config
NOMES = {
    "1601873172": "Thiago Dias Santos",
    # "1601901111": "Maria Souza",
}

# Template para alunos no config (uid -> dados do aluno)
ALUNOS_TEMPLATE = {
    # "1601873172": {
    #     "nome": "Thiago Dias Santos",
    #     "email": ""  # Preencher manualmente depois
    # }
}

# Dias padrão para aulas de teoria (0=Segunda, 1=Terça, ..., 6=Domingo)
# Por padrão: Terça (1) e Quinta (3) - note que weekday() usa 0=Segunda
DIAS_TEORIA_PADRAO = [1, 3]  # Terça e Quinta
# ===========================

_last_time = 0.0

# Configuração padrão - usada em load_config() e save_default_config()
def get_default_config():
    """Retorna a configuração padrão."""
    return {
        "endpoint": ENDPOINT,
        "debounce_seconds": DEBOUNCE_SECONDS,
        "nomes": NOMES.copy(),
        "alunos": {},  # Novo campo para cadastro de alunos
        "dias_teoria": DIAS_TEORIA_PADRAO.copy(),
        "dias_especiais_teoria": [],
        "log_file": None
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
    Retorna True se:
    - O dia da semana está na lista de dias de teoria (terça/quinta por padrão)
    - OU a data de hoje está na lista de dias especiais de teoria
    """
    hoje = date.today()
    dia_semana = hoje.weekday()  # 0=Segunda, 1=Terça, ..., 6=Domingo
    
    # Verifica se é um dia padrão de teoria
    if dia_semana in config.get("dias_teoria", DIAS_TEORIA_PADRAO):
        return True
    
    # Verifica se é um dia especial de teoria
    data_hoje_str = hoje.strftime("%d/%m/%Y")
    dias_especiais = config.get("dias_especiais_teoria", [])
    
    if data_hoje_str in dias_especiais:
        logging.info(f"Dia especial de teoria: {data_hoje_str}")
        return True
    
    return False

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

def send_to_endpoint(serial, nome, endpoint, is_teoria_day=False):
    """Envia POST JSON para o Apps Script."""
    payload = {
        "SerialNumber": serial,
        "NomeCompleto": nome,
        "IsDiaTeoria": is_teoria_day
    }
    try:
        r = requests.post(endpoint, json=payload, timeout=10)
        return r.status_code, r.text
    except Exception as e:
        return None, str(e)

def add_dia_especial(data_str, config_path=None):
    """Adiciona um dia especial de teoria."""
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
    
    # Adiciona o dia especial
    if "dias_especiais_teoria" not in config:
        config["dias_especiais_teoria"] = []
    
    if data_str not in config["dias_especiais_teoria"]:
        config["dias_especiais_teoria"].append(data_str)
        config["dias_especiais_teoria"].sort(
            key=lambda x: datetime.strptime(x, "%d/%m/%Y")
        )
        
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            print(f"Dia especial de teoria adicionado: {data_str}")
            return True
        except IOError as e:
            print(f"Erro ao salvar configuração: {e}")
            return False
    else:
        print(f"Data {data_str} já está na lista de dias especiais.")
        return True

def remove_dia_especial(data_str, config_path=None):
    """Remove um dia especial de teoria."""
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
    if data_str in dias_especiais:
        dias_especiais.remove(data_str)
        config["dias_especiais_teoria"] = dias_especiais
        
        try:
            with open(config_path, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
            print(f"Dia especial de teoria removido: {data_str}")
            return True
        except IOError as e:
            print(f"Erro ao salvar configuração: {e}")
            return False
    else:
        print(f"Data {data_str} não encontrada na lista de dias especiais.")
        return False

def list_dias_especiais(config_path=None):
    """Lista todos os dias especiais de teoria."""
    if config_path is None:
        config_path = Path(CONFIG_FILE)
    
    if not config_path.exists():
        print("Nenhum arquivo de configuração encontrado.")
        print("Dias padrão de teoria: Terça-feira e Quinta-feira")
        return
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Erro ao ler configuração: {e}")
        return
    
    dias_teoria = config.get("dias_teoria", DIAS_TEORIA_PADRAO)
    dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
    
    print("\n=== Configuração de Dias de Teoria ===")
    print("\nDias fixos semanais:")
    for dia in dias_teoria:
        print(f"  - {dias_semana[dia]}-feira")
    
    dias_especiais = config.get("dias_especiais_teoria", [])
    print("\nDias especiais:")
    if dias_especiais:
        for data in dias_especiais:
            print(f"  - {data}")
    else:
        print("  (nenhum dia especial configurado)")
    
    print("")

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
    Retorna o nome do aluno cadastrado ou None se cancelado.
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
        return None
    
    # Salvar no config
    if "alunos" not in config:
        config["alunos"] = {}
    
    config["alunos"][uid] = {
        "nome": nome,
        "email": "",  # Preenchido manualmente depois
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
        print(f"   📧 Email: (preencher manualmente no config_ponto.json)")
        print("   " + "═" * 50)
        return nome
    else:
        print("\n   ❌ Erro ao salvar cadastro.")
        return None

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
    """Loop principal interativo com detecção automática de cadastro."""
    global _last_time
    
    clear_screen()
    print_header()
    
    print("┌─────────────────────────────────────────────────────────┐")
    print("│              ⏰ SISTEMA DE PONTO NFC                    │")
    print("└─────────────────────────────────────────────────────────┘")
    
    endpoint = config.get("endpoint", ENDPOINT)
    debounce = config.get("debounce_seconds", DEBOUNCE_SECONDS)
    
    # Verifica se hoje é dia de teoria
    is_teoria = is_dia_teoria(config)
    
    print("\n   📅 Status do dia:")
    if is_teoria:
        print("   ✅ Hoje é dia de TEORIA (aulas teóricas permitidas)")
    else:
        print("   📚 Hoje NÃO é dia de teoria (apenas prática)")
    
    # Mostra alunos cadastrados
    alunos = listar_alunos_cadastrados(config)
    print(f"\n   👥 Alunos cadastrados: {len(alunos)}")
    
    print("\n" + "═" * 60)
    print("   👆 APROXIME O CRACHÁ DO LEITOR PARA BATER PONTO")
    print("      • Aluno cadastrado → Ponto registrado automaticamente")
    print("      • Aluno novo → Cadastro será solicitado")
    print("   (Ctrl+C para sair)")
    print("═" * 60)
    
    # Controle de data para recarregar config apenas uma vez por dia
    last_config_date = date.today()
    
    try:
        while True:
            print("\n   ⏳ Aguardando leitura do crachá...")
            
            # Lê linha do stdin
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
                # debounce para evitar duplicados
                continue
            _last_time = now
            
            # Recarrega configuração se mudou o dia
            current_date = date.today()
            if current_date != last_config_date:
                config = load_config()
                is_teoria = is_dia_teoria(config)
                last_config_date = current_date
                print(f"\n   🔄 Novo dia detectado. Dia de teoria: {is_teoria}")
            
            hora = datetime.now().strftime("%H:%M:%S")
            data = datetime.now().strftime("%d/%m/%Y")
            
            # Verifica se o aluno já está cadastrado
            if aluno_existe(serial, config):
                # ALUNO EXISTE - Bater ponto normalmente
                nome = get_nome_aluno(serial, config)
                
                print("\n   " + "─" * 50)
                print("   ✅ CRACHÁ RECONHECIDO!")
                print("   " + "─" * 50)
                print(f"   📛 Nome: {nome}")
                print(f"   🔢 UID: {serial}")
                print(f"   📅 Data: {data}")
                print(f"   ⏰ Hora: {hora}")
                print(f"   📚 Tipo: {'Teoria' if is_teoria else 'Prática'}")
                print("   " + "─" * 50)
                
                print("   📤 Enviando para o servidor...")
                
                code, text = send_to_endpoint(serial, nome, endpoint, is_teoria)
                
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
                
                print("   " + "─" * 50)
            
            else:
                # ALUNO NÃO EXISTE - Solicitar cadastro
                nome = cadastrar_aluno_inline(serial, config)
                
                if nome:
                    # Aluno foi cadastrado, registrar ponto
                    print(f"\n   📤 Registrando ponto para {nome}...")
                    
                    code, text = send_to_endpoint(serial, nome, endpoint, is_teoria)
                    
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
                    
                    code, text = send_to_endpoint(serial, "Desconhecido", endpoint, is_teoria)
                    
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
    
    endpoint = config.get("endpoint", ENDPOINT)
    debounce = config.get("debounce_seconds", DEBOUNCE_SECONDS)
    nomes = config.get("nomes", NOMES)
    
    logging.info("=== Sistema de Ponto NFC ===")
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

            nome = nomes.get(serial, "Desconhecido")
            hora = datetime.now().strftime("%H:%M:%S")
            data = datetime.now().strftime("%d/%m/%Y")
            
            # Recarrega configuração apenas se mudou o dia
            # (para verificar novos dias especiais adicionados)
            current_date = date.today()
            if current_date != last_config_date:
                config = load_config()
                is_teoria = is_dia_teoria(config)
                last_config_date = current_date
                logging.info(f"Novo dia detectado. Dia de teoria: {is_teoria}")
            
            logging.info(f"Lido: {serial} ({nome}) - {data} {hora}")
            logging.info(f"Enviando para endpoint... (Dia Teoria: {is_teoria})")

            code, text = send_to_endpoint(serial, nome, endpoint, is_teoria)
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
  python SistemaPonto.py                          # Execução interativa (padrão)
  python SistemaPonto.py --background             # Executar em segundo plano (Windows)
  python SistemaPonto.py --add-dia 25/12/2024     # Adicionar dia especial de teoria
  python SistemaPonto.py --remove-dia 25/12/2024  # Remover dia especial
  python SistemaPonto.py --list-dias              # Listar dias configurados
  python SistemaPonto.py --list-alunos            # Listar alunos cadastrados
  python SistemaPonto.py --install-startup        # Instalar para iniciar com Windows
  python SistemaPonto.py --create-config          # Criar arquivo de configuração padrão

Funcionamento:
  - Ao aproximar um crachá, o sistema verifica se o aluno está cadastrado
  - Se cadastrado: registra o ponto automaticamente
  - Se não cadastrado: solicita o nome para cadastro
        """
    )
    parser.add_argument("--endpoint", "-e", help="URL do Apps Script endpoint")
    parser.add_argument("--background", "-b", action="store_true", 
                        help="Executar em segundo plano (esconde janela no Windows)")
    parser.add_argument("--create-config", action="store_true",
                        help="Criar arquivo de configuração padrão")
    parser.add_argument("--add-dia", metavar="DD/MM/YYYY",
                        help="Adicionar um dia especial de teoria")
    parser.add_argument("--remove-dia", metavar="DD/MM/YYYY",
                        help="Remover um dia especial de teoria")
    parser.add_argument("--list-dias", action="store_true",
                        help="Listar dias de teoria configurados")
    parser.add_argument("--list-alunos", action="store_true",
                        help="Listar alunos cadastrados")
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
        add_dia_especial(args.add_dia)
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
