@echo off
REM =========================================
REM  Script para iniciar o Sistema de Ponto
REM  Executa em segundo plano no Windows
REM =========================================

REM Muda para o diretório do script
cd /d "%~dp0"

REM Verifica se Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Python não encontrado. Por favor, instale o Python 3.
    echo Download em: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM Verifica se requests está instalado
python -c "import requests" >nul 2>&1
if errorlevel 1 (
    echo A dependencia 'requests' nao esta instalada.
    set /p INSTALL_CONFIRM="Deseja instalar agora? (S/N): "
    if /i "%INSTALL_CONFIRM%"=="S" (
        echo Instalando dependencia 'requests'...
        pip install requests
    ) else (
        echo Instalacao cancelada. O programa precisa do 'requests' para funcionar.
        pause
        exit /b 1
    )
)

REM Inicia o programa minimizado
echo Iniciando Sistema de Ponto em segundo plano...
start /min pythonw SistemaPonto.py --background

echo Sistema de Ponto iniciado com sucesso!
echo O programa está rodando em segundo plano.
echo.
echo Para gerenciar dias especiais de teoria:
echo   python SistemaPonto.py --add-dia DD/MM/YYYY
echo   python SistemaPonto.py --remove-dia DD/MM/YYYY
echo   python SistemaPonto.py --list-dias
echo.
echo Para instalar na inicialização do Windows:
echo   python SistemaPonto.py --install-startup
echo.
timeout /t 5
