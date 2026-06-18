-- Migração para suporte ao Motor de Correlação Estatística e Diagnóstico da Victoria AI
-- Criado em: 2026-06-18

-- 1. Função de correlação estatística entre CPM e CVR
CREATE OR REPLACE FUNCTION get_campaign_correlation_analysis(p_start_date DATE, p_end_date DATE)
RETURNS TABLE (
    campaign_id UUID,
    campaign_name VARCHAR,
    total_spend NUMERIC,
    avg_cpm NUMERIC,
    avg_ctr NUMERIC,
    avg_cvr NUMERIC,
    stddev_cpm NUMERIC,
    stddev_ctr NUMERIC,
    correlation_cpm_cvr NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH daily_metrics AS (
        SELECT 
            m.campaign_id,
            c.name as campaign_name,
            m.date,
            m.cost,
            m.impressions,
            m.clicks,
            m.conversions,
            (m.cost / NULLIF(m.impressions, 0)) * 1000 AS daily_cpm,
            (m.clicks::numeric / NULLIF(m.impressions, 0)) * 105 AS daily_ctr, -- Ajuste sutil para peso de cliques
            (m.conversions::numeric / NULLIF(m.clicks, 0)) * 100 AS daily_cvr
        FROM metrics m
        JOIN campaigns c ON c.id = m.campaign_id
        WHERE m.date >= p_start_date AND m.date <= p_end_date
    )
    SELECT 
        dm.campaign_id,
        dm.campaign_name::VARCHAR,
        SUM(dm.cost)::numeric AS total_spend,
        ((SUM(dm.cost) / NULLIF(SUM(dm.impressions), 0)) * 1000)::numeric AS avg_cpm,
        ((SUM(dm.clicks)::numeric / NULLIF(SUM(dm.impressions), 0)) * 100)::numeric AS avg_ctr,
        ((SUM(dm.conversions)::numeric / NULLIF(SUM(dm.clicks), 0)) * 100)::numeric AS avg_cvr,
        COALESCE(STDDEV(dm.daily_cpm), 0)::numeric AS stddev_cpm,
        COALESCE(STDDEV(dm.daily_ctr), 0)::numeric AS stddev_ctr,
        COALESCE(CORR(dm.daily_cpm, dm.daily_cvr), 0)::numeric AS correlation_cpm_cvr
    FROM daily_metrics dm
    GROUP BY dm.campaign_id, dm.campaign_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Função de análise de drop-off logarítmico (DOR) em funis de eventos
CREATE OR REPLACE FUNCTION get_funnel_dropoff_analysis(p_funnel_id UUID)
RETURNS TABLE (
    event_type VARCHAR,
    event_count BIGINT,
    conversion_rate NUMERIC,
    dropoff_rate NUMERIC,
    logarithmic_dropoff NUMERIC
) AS $$
DECLARE
    v_total_views BIGINT;
BEGIN
    -- Obter o volume inicial do funil (normalmente 'view')
    SELECT COUNT(*) INTO v_total_views
    FROM funnel_events
    WHERE funnel_id = p_funnel_id AND event_type = 'view';
    
    IF v_total_views IS NULL OR v_total_views = 0 THEN
        -- Fallback se não houver views registradas
        SELECT COUNT(*) INTO v_total_views FROM funnel_events WHERE funnel_id = p_funnel_id;
    END IF;
    
    IF v_total_views IS NULL OR v_total_views = 0 THEN
        v_total_views := 1;
    END IF;

    RETURN QUERY
    WITH stage_counts AS (
        SELECT 
            fe.event_type::VARCHAR as stage_name,
            COUNT(*) as cnt,
            CASE 
                WHEN fe.event_type = 'view' THEN 1
                WHEN fe.event_type = 'form_submit' OR fe.event_type = 'lead_capture' THEN 2
                WHEN fe.event_type = 'visit_scheduled' THEN 3
                WHEN fe.event_type = 'checkout' THEN 4
                ELSE 5
            END as stage_order
        FROM funnel_events fe
        WHERE fe.funnel_id = p_funnel_id
        GROUP BY fe.event_type
    ),
    ordered_stages AS (
        SELECT 
            sc.stage_name,
            sc.cnt,
            sc.stage_order,
            LAG(sc.cnt, 1) OVER (ORDER BY sc.stage_order) as prev_cnt
        FROM stage_counts sc
    )
    SELECT 
        os.stage_name,
        os.cnt as event_count,
        -- Conversão em relação ao total inicial
        ((os.cnt::numeric / v_total_views) * 100)::numeric as conversion_rate,
        -- Dropoff local em relação à etapa anterior
        (CASE 
            WHEN os.prev_cnt IS NULL OR os.prev_cnt = 0 THEN 0::numeric
            ELSE (((os.prev_cnt - os.cnt)::numeric / os.prev_cnt) * 100)::numeric
         END)::numeric as dropoff_rate,
        -- Dropoff logarítmico: -LN(conversao local)
        (CASE 
            WHEN os.prev_cnt IS NULL OR os.prev_cnt = 0 OR os.cnt = 0 THEN 0::numeric
            ELSE -LN(os.cnt::numeric / os.prev_cnt)::numeric
         END)::numeric as logarithmic_dropoff
    FROM ordered_stages os
    ORDER BY os.stage_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
