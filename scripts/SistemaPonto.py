#!/usr/bin/env python3
"""
nfc_to_apps_script.py

Lê UID do leitor NFC (HID keyboard-emulation) via stdin e envia para um endpoint Google Apps Script.

Uso:
  1) pip install requests
  2) Plugue o leitor NFC (modo teclado).
  3) Abra um terminal e rode:
       python nfc_to_apps_script.py
  4) Mantenha o terminal focado; aproxime o crachá.
"""

import sys
import time
import requests
from datetime import datetime
import argparse
import platform

# ========== CONFIG ==========
ENDPOINT = "https://script.google.com/macros/s/AKfycbz0ggDxcDPXe0h_GJeQ-NT_-INHMKkQ08PAGLp5QN2m7HKHfMlTqg6gsATMzrtRF48n/exec"
DEBOUNCE_SECONDS = 1.2
# Mapeie aqui os IDs para exibir nome (opcional)
NOMES = {
    "1601873172": "Thiago Dias Santos",
    # "1601901111": "Maria Souza",
}
# ===========================

_last_time = 0.0

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

def send_to_endpoint(serial, nome, endpoint):
    """Envia POST JSON para o Apps Script."""
    payload = {
        "SerialNumber": serial,
        "NomeCompleto": nome
    }
    try:
        r = requests.post(endpoint, json=payload, timeout=10)
        return r.status_code, r.text
    except Exception as e:
        return None, str(e)

def main(endpoint):
    global _last_time
    print("=== NFC -> Apps Script ===")
    print("Mantenha o terminal com foco. Aproxime o crachá (Ctrl+C para sair).")
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

            # validação: espera 10 dígitos numéricos (ajuste se seu formato for outro)
            if not (serial.isdigit() and len(serial) >= 8):
                print(f"[!] Leitura não reconhecida: '{serial}' (ignore se estiver testando)")
                continue

            now = time.time()
            if now - _last_time < DEBOUNCE_SECONDS:
                # debounce para evitar duplicados
                continue
            _last_time = now

            nome = NOMES.get(serial, "Desconhecido")
            hora = datetime.now().strftime("%H:%M:%S")
            data = datetime.now().strftime("%d/%m/%Y")
            print(f"📡 Lido: {serial} ({nome}) — {data} {hora}")
            print("→ Enviando para endpoint...")

            code, text = send_to_endpoint(serial, nome, endpoint)
            if code is None:
                print(f"[x] Erro de envio: {text}\n")
                beep("long")
            else:
                print(f"[✓] {code} - {text}\n")
                # tentativa simples de inferir sucesso pelo status 200
                if code == 200:
                    beep("short")
                else:
                    beep("long")

    except KeyboardInterrupt:
        print("\nEncerrado pelo usuário.")
    except Exception as e:
        print("Erro inesperado:", e)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="NFC -> Google Apps Script sender")
    parser.add_argument("--endpoint", "-e", help="URL do Apps Script endpoint", default=ENDPOINT)
    args = parser.parse_args()
    main(args.endpoint)
