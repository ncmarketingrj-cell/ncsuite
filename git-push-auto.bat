@echo off
chcp 65001 > nul
echo ====================================================
echo 🚀 NC Traffic Insights - Auto Commit & Push
echo ====================================================
echo.

:: Verifica o status do git
echo 🔍 Verificando alterações...
git status -s
echo.

:: Adiciona arquivos ao stage
echo 📂 Adicionando alterações ao Git...
git add .
echo.

:: Solicita mensagem do commit
set /p msg="✍️  Digite a mensagem do commit (pressione [Enter] para a padrão): "
if "%msg%"=="" (
    set msg="auto: atualização automática em %date% %time%"
)

echo.
echo 💾 Executando commit: %msg%
git commit -m "%msg%"
echo.

echo 📤 Enviando alterações para o GitHub (git push)...
git push
echo.

echo ====================================================
echo ✅ Processo concluído com sucesso!
echo ====================================================
pause
