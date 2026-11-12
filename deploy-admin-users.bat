@echo off
chcp 65001 > nul
echo ====================================================
echo NC Suite - Deploy Gestão de Usuários e Banco Auth
echo ====================================================
echo.
echo Este script faz:
echo 1. Login no Supabase CLI (projeto uqhilsnrrmlepdjzpubq)
echo 2. Aplica a migration 20261112180000_fix_auth_credentials_no_email.sql
echo 3. Publica a Edge Function admin-create-user (sem confirmação de email)
echo.
pause

call npx supabase login
echo.
echo Aplicando migrations no Supabase...
call npx supabase db push --project-ref uqhilsnrrmlepdjzpubq
echo.
echo Publicando Edge Function admin-create-user...
call npx supabase functions deploy admin-create-user --project-ref uqhilsnrrmlepdjzpubq
echo.
echo Concluido! Pressione qualquer tecla para fechar.
pause

