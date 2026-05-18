@echo off
chcp 65001 > nul
echo ====================================================
echo 🚀 NC Traffic Insights - Deploy de Edge Function
echo ====================================================
echo.
echo Este script irá ajudar você a fazer o deploy da função
echo 'sync-meta-ads' para o seu Supabase.
echo.
echo 🚨 AVISO: O deploy anterior falhou devido a falta de permissão (Erro 403).
echo Isso significa que o seu terminal precisa se autenticar no Supabase.
echo.
echo Passo 1: Vamos abrir a página de login do Supabase no seu navegador.
echo Por favor, faça login com a conta dona do projeto 'wmwrftvypapgsmktdaaz'.
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
call npx supabase functions deploy sync-meta-ads --project-ref wmwrftvypapgsmktdaaz
echo.
echo ====================================================
echo ✅ Processo concluído! Pressione qualquer tecla para fechar.
echo ====================================================
pause
