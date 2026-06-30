# NCSuite — Regras para Claude Code

## Segurança (obrigatório em toda sessão)

- Nunca escrever API keys, tokens, senhas ou strings de conexão diretamente no código
- Todas as credenciais devem vir de variáveis de ambiente (`import.meta.env.VITE_*` no frontend, `process.env.*` no servidor, `Deno.env.get()` nas edge functions)
- Nunca adicionar fallback hardcoded para credenciais — se a variável não existir, lançar erro claro
- Nunca commitar `.env` nem arquivos sensíveis (já coberto pelo `.gitignore` e pelo pre-commit hook)
- Pedir confirmação antes de alterar qualquer lógica de autenticação ou deletar dados
- Usar sempre queries parametrizadas — nunca concatenar input do usuário em SQL

## Stack

- **Frontend**: React 19 + TanStack Start (Vite) + TailwindCSS v4 + shadcn/ui
- **Backend**: TanStack Start server functions (`createServerFn`) + Supabase Edge Functions (Deno)
- **Banco**: Supabase (Postgres) com RLS habilitado em todas as tabelas
- **Auth**: Supabase Auth — middleware em `src/integrations/supabase-external/auth-middleware.ts`

## Variáveis de ambiente

Todas as chaves ficam em `.env` (nunca versionado). Referência de nomes:

| Variável | Onde usar |
|---|---|
| `VITE_SUPABASE_URL` | Frontend e server functions |
| `VITE_SUPABASE_ANON_KEY` | Frontend |
| `VITE_GOOGLE_CLIENT_ID` | Frontend (OAuth Google Ads) |
| `GEMINI_API_KEY` | Server functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions via `Deno.env.get()` |

## Estrutura de pastas

```
src/
  components/       — componentes React reutilizáveis
  routes/           — páginas (TanStack Router file-based routing)
  integrations/
    supabase/       — cliente Supabase principal (Lovable Cloud)
    supabase-external/ — cliente Supabase do projeto ncsuite
  lib/              — server functions e utilitários
supabase/
  functions/        — Edge Functions Deno
  migrations/       — migrations SQL (nunca incluir chaves aqui)
```

## Padrões obrigatórios

**Server functions** — toda server function que acessa dados deve ter o middleware de auth:
```ts
export const minhaFn = createServerFn()
  .middleware([requireSupabaseAuth])
  .validator(z.object({ ... }))
  .handler(async ({ context, data }) => { ... })
```

**RLS** — toda tabela nova deve ter RLS ativo e policy por `user_id`:
```sql
ALTER TABLE public.nova_tabela ENABLE ROW LEVEL SECURITY;
CREATE POLICY "isolamento_usuario" ON public.nova_tabela
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

**Edge Functions** — sempre validar o JWT do usuário no início:
```ts
const authHeader = req.headers.get('Authorization');
if (!authHeader) return new Response('Unauthorized', { status: 401 });
```
