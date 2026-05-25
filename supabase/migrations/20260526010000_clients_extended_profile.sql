-- Expansão do perfil de clientes com dados de loja, tráfego e metas
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS niche            text,
  ADD COLUMN IF NOT EXISTS store_url        text,
  ADD COLUMN IF NOT EXISTS platform         text,          -- shopify | nuvemshop | loja_integrada | woocommerce | outro
  ADD COLUMN IF NOT EXISTS product_type     text,          -- fisico | digital | servico
  ADD COLUMN IF NOT EXISTS average_ticket   numeric,
  ADD COLUMN IF NOT EXISTS sale_cycle_days  integer,
  ADD COLUMN IF NOT EXISTS contact_name     text,
  ADD COLUMN IF NOT EXISTS contact_phone    text,
  ADD COLUMN IF NOT EXISTS logo_url         text,
  ADD COLUMN IF NOT EXISTS status           text DEFAULT 'ativo',   -- ativo | pausado | otimizando
  ADD COLUMN IF NOT EXISTS weekly_budget_goal    numeric,   -- valor adicionado no Meta (bruto, inclui imposto)
  ADD COLUMN IF NOT EXISTS meta_tax_rate         numeric DEFAULT 0.1215,
  ADD COLUMN IF NOT EXISTS objective_budgets     jsonb DEFAULT '{}',   -- {"conversao":0,"leads":0,"trafego":0}
  ADD COLUMN IF NOT EXISTS stock_quantity        integer,
  ADD COLUMN IF NOT EXISTS stock_alert_threshold integer,
  ADD COLUMN IF NOT EXISTS hero_product          text,
  ADD COLUMN IF NOT EXISTS daily_leads_goal      integer,
  ADD COLUMN IF NOT EXISTS daily_purchases_goal  integer,
  ADD COLUMN IF NOT EXISTS target_ctr            numeric,
  ADD COLUMN IF NOT EXISTS target_cpm            numeric,
  ADD COLUMN IF NOT EXISTS target_conversion_rate numeric,
  ADD COLUMN IF NOT EXISTS peak_hours_start      text,
  ADD COLUMN IF NOT EXISTS peak_hours_end        text,
  ADD COLUMN IF NOT EXISTS notes                 text,
  ADD COLUMN IF NOT EXISTS rules                 jsonb DEFAULT '[]',  -- [{id,title,category,content}]
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_clients_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_updated_at ON public.clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_clients_updated_at();
