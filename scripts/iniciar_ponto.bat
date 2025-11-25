@echo off
chcp 65001 >nul 2>&1
REM =========================================
REM  Sistema de Ponto NFC - Ensino Fisio
REM  Executa no CMD com saida visivel
REM =========================================

REM Muda para o diretório do script
cd /d "%~dp0"

cls
echo.
echo ============================================================
echo             SISTEMA DE PONTO NFC - ENSINO FISIO
echo ============================================================
echo.

REM Verifica se Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo   [ERRO] Python nao encontrado!
    echo.
    echo   Por favor, instale o Python 3:
    echo   https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo   [OK] Python encontrado
echo.

REM Verifica se requests está instalado
python -c "import requests" >nul 2>&1
if errorlevel 1 (
    echo   [!] A dependencia 'requests' nao esta instalada.
    echo.
    set /p INSTALL_CONFIRM="   Deseja instalar agora? (S/N): "
    if /i "%INSTALL_CONFIRM%"=="S" (
        echo.
        echo   Instalando dependencia 'requests'...
        pip install requests
        echo.
    ) else (
        echo.
        echo   Instalacao cancelada.
        echo   O programa precisa do 'requests' para funcionar.
        echo.
        pause
        exit /b 1
    )
)

echo   [OK] Dependencias verificadas
echo.
echo ============================================================
echo   Iniciando Sistema de Ponto...
echo ============================================================
echo.

python SistemaPonto.py

echo.
echo ============================================================
echo   Sistema encerrado.
echo ============================================================
echo.
pause
