@echo off
title Push CheerRunners to GitHub
cd /d "%~dp0"

echo ====================================================
echo      PUSH CHEERRUNNERS TO GITHUB (Adrcdsil)
echo ====================================================
echo.
echo Remote: https://github.com/Adrcdsil/CheerRunners.git
echo Branch: main
echo.
echo Enviando arquivos...
git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ====================================================
    echo [SUCESSO] Codigo enviado com sucesso para o GitHub!
    echo Agora abra o Render.com para conectar e publicar.
    echo ====================================================
) else (
    echo ====================================================
    echo [AVISO] Se o repositorio ainda nao existe no GitHub:
    echo 1. Crie em https://github.com/new com o nome CheerRunners
    echo 2. Execute este arquivo novamente.
    echo ====================================================
)

echo.
pause
