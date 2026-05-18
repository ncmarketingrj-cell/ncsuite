@echo off
chcp 65001 > nul
echo ====================================================
echo 🚀 NC Traffic Insights - Deploy de Edge Function
echo ====================================================
echo.
echo Este script irá ajudar você a fazer o deploy da função
echo 'sync-meta-ads' para o seu Supabase.
echo.
echo Passo 1: Vamos abrir a página de login do Supabase no seu navegador.
echo Por favor, faça login com a conta dona do projeto 'xudumzedcxuuhxokissm'.
echo.
pause

echo.
echo 🔑 Executando login no Supabase...
call npx supabase login
echo.
echo Login concluído! 
echo.
echo Passo 2: Fazendo o deploy da Edge Function...
echo.
call npx supabase functions deploy sync-meta-ads --project-ref xudumzedcxuuhxokissm
echo.
echo ====================================================
echo ✅ Processo concluído! Pressione qualquer tecla para fechar.
echo ====================================================
pause

