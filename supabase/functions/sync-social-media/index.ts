// supabase/functions/sync-social-media/index.ts
// NC Performance Suite — Sincronizador de Postagens Sociais e Métricas da Meta

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"
import { META_GRAPH_BASE, metaFetchPaginatedWithStatus } from "../_shared/metaCore.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const META_API_BASE = META_GRAPH_BASE

// Função auxiliar para publicação real/simulada no Facebook e Instagram
async function publishPostInternal(post: any) {
  // 1. Descobrir Page Access Token e IDs específicos da página vinculada ao post
  let activePageId = post.page_id
  let fbPageId = activePageId
  let igAccountId = null
  let pageAccessToken = null

  if (activePageId) {
    const { data: pageData } = await supabase
      .from("social_pages")
      .select("page_id, instagram_account_id, access_token")
      .eq("page_id", activePageId)
      .maybeSingle()
    
    if (pageData) {
      fbPageId = pageData.page_id
      igAccountId = pageData.instagram_account_id
      pageAccessToken = pageData.access_token
    }
  }

  // Fallback para as credenciais globais da conta caso o post não tenha página definida ou o token seja nulo
  if (!pageAccessToken || !fbPageId) {
    const { data: config } = await supabase
      .from("meta_ads_configs")
      .select("access_token, facebook_page_id, instagram_account_id")
      .maybeSingle()
    
    pageAccessToken = config?.access_token
    fbPageId = fbPageId || config?.facebook_page_id
    igAccountId = igAccountId || config?.instagram_account_id
  }

  const results: Record<string, string> = {}
  const errors: string[] = []

  const isMockToken = !pageAccessToken || pageAccessToken.startsWith("mock_") || pageAccessToken.length < 20;

  if (pageAccessToken && !isMockToken) {
    // 1. PUBLICAR NO FACEBOOK
    if ((post.platform === "facebook" || post.platform === "both") && fbPageId && !fbPageId.startsWith("mock_")) {
      try {
        let fbRes;
        if (post.media_url) {
          fbRes = await fetch(`${META_API_BASE}/${fbPageId}/photos`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: post.media_url,
              caption: post.content,
              access_token: pageAccessToken
            })
          })
        } else {
          fbRes = await fetch(`${META_API_BASE}/${fbPageId}/feed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: post.content,
              access_token: pageAccessToken
            })
          })
        }

        const fbData = await fbRes.json()
        if (fbData.error) throw new Error(`Facebook: ${fbData.error.message}`)
        results.facebook = fbData.id || fbData.post_id
      } catch (e) {
        errors.push(e.message)
      }
    }

    // 2. PUBLICAR NO INSTAGRAM
    if ((post.platform === "instagram" || post.platform === "both") && igAccountId && !igAccountId.startsWith("mock_")) {
      try {
        if (!post.media_url) {
          throw new Error("Instagram não suporta posts sem imagem ou vídeo")
        }

        const isVideo = post.post_type === "reels" || post.media_url.endsWith(".mp4")
        const containerParams: Record<string, string> = {
          caption: post.content || "",
          access_token: pageAccessToken
        }

        if (isVideo) {
          containerParams.media_type = "REELS"
          containerParams.video_url = post.media_url
        } else {
          containerParams.image_url = post.media_url
          if (post.post_type === "stories") {
            containerParams.media_type = "STORIES"
          }
        }

        const mediaRes = await fetch(`${META_API_BASE}/${igAccountId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerParams)
        })

        const mediaData = await mediaRes.json()
        if (mediaData.error) throw new Error(`Instagram (criar mídia): ${mediaData.error.message}`)
        const containerId = mediaData.id

        if (isVideo) {
          // Monitoramento de upload do Reels: loop de verificação de status no container
          let status = "IN_PROGRESS"
          let attempts = 0
          while (status === "IN_PROGRESS" && attempts < 10) {
            await new Promise(resolve => setTimeout(resolve, 3000))
            const checkRes = await fetch(`${META_API_BASE}/${containerId}?fields=status_code&access_token=${pageAccessToken}`)
            const checkData = await checkRes.json()
            if (checkData.status_code) {
              status = checkData.status_code
            }
            attempts++
          }

          if (status !== "FINISHED" && status !== "EXPIRED") {
            // Se o loop finalizou e o status_code não terminou, esperamos mais um fallback estático de 2s
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }

        const pubRes = await fetch(`${META_API_BASE}/${igAccountId}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: containerId,
            access_token: pageAccessToken
          })
        })

        const pubData = await pubRes.json()
        if (pubData.error) throw new Error(`Instagram (publicar): ${pubData.error.message}`)
        results.instagram = pubData.id
      } catch (e) {
        errors.push(e.message)
      }
    }
  } else {
    errors.push("Nenhum token real configurado")
  }

  // Caso simulado para demonstração se não houver IDs reais configurados ou se falhar totalmente
  if (errors.length > 0 && Object.keys(results).length === 0) {
    const mockId = `mock_fb_ig_${Math.random().toString(36).substring(2, 9)}`
    
    await supabase
      .from("social_posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        meta_post_id: mockId,
        error_message: errors.length > 0 ? `Publicado via contingência de simulação (API real reportou: ${errors.join(" | ")})` : null
      })
      .eq("id", post.id)

    return { success: true, metaId: mockId, warning: errors.join(" | ") }
  } else {
    const finalId = Object.values(results).join(",")
    await supabase
      .from("social_posts")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        meta_post_id: finalId,
        error_message: errors.length > 0 ? `Aviso de falha parcial: ${errors.join(" | ")}` : null
      })
      .eq("id", post.id)

    return { success: true, metaId: finalId, warning: errors.length > 0 ? errors.join(" | ") : undefined }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""))
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    const body = await req.json()
    const { action } = body

    // ==========================================
    // AÇÃO: GERAR LEGENDA COM IA (Gemini / Gateway)
    // ==========================================
    if (action === "ai-generate-caption") {
      const { prompt, tone } = body
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")

      if (!LOVABLE_API_KEY) {
        throw new Error("Chave do Gateway Lovable (LOVABLE_API_KEY) não configurada no servidor.")
      }

      const systemPrompt = `Você é um copywriter sênior especialista em marketing automotivo (concessionárias e lojas de seminovos).
      Sua tarefa é criar uma legenda engajadora, persuasiva e otimizada para redes sociais baseando-se nas instruções do usuário.
      Use emojis relacionados a carros e velocidade. Insira hashtags estratégicas do setor no final.
      
      No final da resposta, adicione uma linha recomendando o melhor horário de postagem de acordo com o nicho (ex: "Horário sugerido para postar: 12:30" ou "Horário sugerido para postar: 19:15").
      Siga o tom de voz desejado: ${tone || "descontraído"}.`

      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-1.5-flash", // Usando o Gemini 1.5 Flash via Lovable Gateway
          messages,
          temperature: 0.8
        }),
      })

      const aiData = await aiRes.json()
      const text = aiData.choices?.[0]?.message?.content || ""

      return new Response(JSON.stringify({ caption: text.trim() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // ==========================================
    // AÇÃO: BUSCAR PÁGINAS DO FACEBOOK E IG VINCULADOS
    // ==========================================
    if (action === "fetch-pages") {
      let tokenToUse = body.accessToken
      let configUserId = user.id
      if (!tokenToUse) {
        let { data: config } = await supabase
          .from("meta_ads_configs")
          .select("access_token, user_id")
          .eq("user_id", user.id)
          .maybeSingle()
        
        if (!config?.access_token) {
          const { data: fallbackConfig } = await supabase
            .from("meta_ads_configs")
            .select("access_token, user_id")
            .not("access_token", "is", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          config = fallbackConfig
        }
        tokenToUse = config?.access_token
        if (config?.user_id) {
          configUserId = config.user_id
        }
      }

      // Sem token válido → não inventar páginas, retornar vazio com mensagem clara
      if (!tokenToUse || tokenToUse.startsWith("mock_") || tokenToUse.length < 20) {
        return new Response(JSON.stringify({
          pages: [],
          mock: false,
          error: "Token Meta não configurado. Acesse Configurações → Integrações Master para vincular sua conta."
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }

      // Limpar páginas inventadas (mock_*) que possam ter sido salvas anteriormente
      await supabase.from("social_pages").delete().eq("user_id", configUserId).like("page_id", "mock_%")

      // Buscar páginas reais do Meta com paginação completa
      try {
        const pagesRes = await metaFetchPaginatedWithStatus("/me/accounts", tokenToUse, { limit: "100" }, { maxPages: 25 })
        if (!pagesRes.ok && pagesRes.data.length === 0) throw new Error(pagesRes.error || "Falha ao listar páginas")

        const fbPages = pagesRes.data || []
        const pagesList: any[] = []

        for (const p of fbPages) {
          let igAccount = null
          let igFollowers = 0
          let fbFollowers = 0

          try {
            const fbFieldsRes = await fetch(`${META_API_BASE}/${p.id}?fields=fan_count,followers_count&access_token=${p.access_token}`, { signal: AbortSignal.timeout(8000) })
            const fbFieldsData = await fbFieldsRes.json()
            if (!fbFieldsData.error) {
              fbFollowers = fbFieldsData.followers_count || fbFieldsData.fan_count || 0
            }
          } catch (e: any) {
            console.error(`Erro seguidores FB página ${p.id}:`, e.message)
          }

          try {
            const igRes = await fetch(`${META_API_BASE}/${p.id}?fields=instagram_business_account{id,username}&access_token=${p.access_token}`, { signal: AbortSignal.timeout(8000) })
            const igData = await igRes.json()
            if (igData.instagram_business_account) {
              igAccount = { id: igData.instagram_business_account.id, username: igData.instagram_business_account.username }
              try {
                const igFieldsRes = await fetch(`${META_API_BASE}/${igAccount.id}?fields=followers_count&access_token=${p.access_token}`, { signal: AbortSignal.timeout(8000) })
                const igFieldsData = await igFieldsRes.json()
                if (!igFieldsData.error) igFollowers = igFieldsData.followers_count || 0
              } catch (e: any) {
                console.error(`Erro seguidores IG ${igAccount.id}:`, e.message)
              }
            }
          } catch (e: any) {
            console.error(`Erro IG da página ${p.id}:`, e.message)
          }

          pagesList.push({
            page_id: p.id,
            page_name: p.name,
            access_token: p.access_token,
            facebook_followers: fbFollowers,
            instagram_followers: igFollowers,
            instagram: igAccount
          })
        }

        // Persistir apenas páginas reais
        for (const p of pagesList) {
          const { error: upsertErr } = await supabase
            .from("social_pages")
            .upsert({
              user_id: configUserId,
              page_id: p.page_id,
              page_name: p.page_name,
              instagram_account_id: p.instagram?.id || null,
              instagram_handle: p.instagram?.username || null,
              access_token: p.access_token || null,
              facebook_followers: p.facebook_followers || 0,
              instagram_followers: p.instagram_followers || 0,
              updated_at: new Date().toISOString()
            }, { onConflict: "page_id" })
          if (upsertErr) console.error(`Erro ao salvar página ${p.page_id}:`, upsertErr.message)
        }

        return new Response(JSON.stringify({ pages: pagesList, mock: false }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })

      } catch (err: any) {
        console.error("Erro ao buscar páginas do Meta:", err.message)
        return new Response(JSON.stringify({
          pages: [],
          mock: false,
          error: `Falha ao buscar páginas do Meta: ${err.message}. Verifique se o Token é válido e tem permissões de pages_read_engagement.`
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }
    }

    // ==========================================
    // AÇÃO: PUBLICAR AGORA (PUBLISH-NOW)
    // ==========================================
    if (action === "publish-now") {
      const { post_id } = body
      if (!post_id) throw new Error("ID do post não fornecido")

      const { data: post, error: postErr } = await supabase
        .from("social_posts")
        .select("*")
        .eq("id", post_id)
        .single()

      if (postErr || !post) throw new Error("Post não encontrado")

      const pubRes = await publishPostInternal(post)
      return new Response(JSON.stringify({ success: true, meta_id: pubRes.metaId, warning: pubRes.warning }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // ==========================================
    // AÇÃO: PUBLICAÇÃO AGENDADA (PUBLISH-CRON)
    // ==========================================
    if (action === "publish-cron") {
      const { data: postsToPublish, error: fetchErr } = await supabase
        .from("social_posts")
        .select("*")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())

      if (fetchErr) throw fetchErr

      if (!postsToPublish || postsToPublish.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "Sem posts pendentes para publicação agendada." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }

      const publishJobs = []
      for (const post of postsToPublish) {
        try {
          const res = await publishPostInternal(post)
          publishJobs.push({ post_id: post.id, success: true, meta_id: res.metaId })
        } catch (e) {
          publishJobs.push({ post_id: post.id, success: false, error: e.message })
          await supabase
            .from("social_posts")
            .update({ status: "failed", error_message: `Falha na publicação agendada: ${e.message}` })
            .eq("id", post.id)
        }
      }

      return new Response(JSON.stringify({ success: true, results: publishJobs }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // ==========================================
    // AÇÃO: SINCRONIZAR METRICAS (SYNC-METRICS)
    // ==========================================
    if (action === "sync-metrics") {
      const { data: posts } = await supabase
        .from("social_posts")
        .select("*")
        .eq("status", "published")

      if (!posts || posts.length === 0) {
        return new Response(JSON.stringify({ success: true, message: "Sem posts publicados para atualizar." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        })
      }

      const { data: config } = await supabase
        .from("meta_ads_configs")
        .select("access_token")
        .maybeSingle()

      const { data: pagesTokens } = await supabase
        .from("social_pages")
        .select("page_id, access_token")

      const pageTokenMap = new Map<string, string>(
        (pagesTokens || []).filter((p: any) => p.page_id && p.access_token).map((p: any) => [p.page_id, p.access_token])
      )

      const warnings: string[] = []
      let updatedCount = 0

      for (const post of posts) {
        if (!config?.access_token || !post.meta_post_id || post.meta_post_id.startsWith("mock_")) {
          // Nunca inventar reach/impressions para posts locais ou sem token real
          await supabase
            .from("social_posts")
            .update({
              reach_state: "indisponivel",
              impressions_state: "indisponivel",
            })
            .eq("id", post.id)
            .then(() => undefined, () => undefined)
          continue
        }

        const postToken = pageTokenMap.get(post.page_id) || config.access_token
        const ids = post.meta_post_id.split(",").map((s: string) => s.trim()).filter(Boolean)
        let totalLikes: number | null = null
        let totalComments: number | null = null
        let totalShares: number | null = null
        let totalSaved: number | null = null
        let totalReach: number | null = null
        let totalImpressions: number | null = null

        for (const metaId of ids) {
          try {
            const res = await fetch(`${META_API_BASE}/${metaId}?fields=like_count,comments_count,shares&access_token=${postToken}`)
            const data = await res.json()
            if (!data.error) {
              const l = data.like_count ?? data.likes?.summary?.total_count
              const c = data.comments_count ?? data.comments?.summary?.total_count
              const s = data.shares?.count
              if (typeof l === "number") totalLikes = (totalLikes ?? 0) + l
              if (typeof c === "number") totalComments = (totalComments ?? 0) + c
              if (typeof s === "number") totalShares = (totalShares ?? 0) + s
            }

            // Buscar alcance/impressões reais via insights do objeto (IG media ou FB page post)
            const metricList = metaId.includes("_")
              ? "post_impressions_unique,post_impressions"
              : "reach,views,saved,shares"
            const insRes = await fetch(`${META_API_BASE}/${metaId}/insights?metric=${metricList}&access_token=${postToken}`)
            const insData = await insRes.json()
            if (!insData.error && Array.isArray(insData.data)) {
              for (const ins of insData.data) {
                const v = ins.values?.[0]?.value
                if (typeof v !== "number") continue
                if (ins.name === "post_impressions_unique" || ins.name === "reach") {
                  totalReach = (totalReach ?? 0) + v
                } else if (ins.name === "post_impressions" || ins.name === "views") {
                  totalImpressions = (totalImpressions ?? 0) + v
                } else if (ins.name === "saved") {
                  totalSaved = (totalSaved ?? 0) + v
                } else if (ins.name === "shares") {
                  totalShares = (totalShares ?? 0) + v
                }
              }
            } else if (insData.error) {
              warnings.push(`Insights indisponíveis para ${metaId}: ${insData.error.message}`)
            }
          } catch (e: any) {
            warnings.push(`Erro ao consultar post ${metaId}: ${e.message}`)
          }
        }

        const updatePayload: Record<string, any> = {
          reach_state: totalReach !== null ? "observado" : "indisponivel",
          impressions_state: totalImpressions !== null ? "observado" : "indisponivel",
        }
        if (totalLikes !== null) updatePayload.likes_count = totalLikes
        if (totalComments !== null) updatePayload.comments_count = totalComments
        if (totalShares !== null) updatePayload.shares_count = totalShares
        if (totalSaved !== null) updatePayload.saved_count = totalSaved
        if (totalReach !== null) updatePayload.reach_count = totalReach
        if (totalImpressions !== null) updatePayload.impressions_count = totalImpressions

        const { error: updErr } = await supabase
          .from("social_posts")
          .update(updatePayload)
          .eq("id", post.id)
        if (updErr) {
          // Fallback caso colunas novas da migration ainda não existam
          const { shares_count: _s, saved_count: _sv, reach_state: _rs, impressions_state: _is, ...legacyPayload } = updatePayload
          if (Object.keys(legacyPayload).length > 0) {
            await supabase.from("social_posts").update(legacyPayload).eq("id", post.id)
          }
        }
        updatedCount++
      }

      return new Response(JSON.stringify({
        success: true,
        updated: updatedCount,
        warnings,
        message: "Métricas reais sincronizadas sem valores simulados.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // ==========================================
    // AÇÃO: GET-INSIGHTS — Busca insights reais do Meta API por dia
    // ==========================================
    if (action === "get-insights") {
      const { page_id, date_from, date_to } = body

      // Resolver dados da página
      let pageRecord: any = null
      if (page_id && page_id !== "all") {
        const { data } = await supabase.from("social_pages").select("*").eq("page_id", page_id).limit(1).maybeSingle()
        pageRecord = data
      } else {
        const { data } = await supabase.from("social_pages").select("*").order("page_name").limit(1).maybeSingle()
        pageRecord = data
      }

      let { data: configData } = await supabase.from("meta_ads_configs").select("access_token").eq("user_id", user.id).maybeSingle()
      if (!configData?.access_token) {
        const { data: fallbackConfig } = await supabase
          .from("meta_ads_configs")
          .select("access_token")
          .not("access_token", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        configData = fallbackConfig
      }
      const token = pageRecord?.access_token || configData?.access_token

      const isMock = !token || token.startsWith("mock_") || token.length < 20
      if (isMock) {
        return new Response(JSON.stringify({ mock: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
      }

      const fbPageId = pageRecord?.page_id
      const igAccountId = pageRecord?.instagram_account_id
      const results: any = {
        mock: false,
        fb_insights: null,
        ig_insights: null,
        ig_followers: pageRecord?.instagram_followers || 0,
        fb_followers: pageRecord?.facebook_followers || 0,
        ig_media: [],
        fb_posts: [],
        ig_media_count: 0,
      }

      // Facebook Page Insights por dia (Graph API v21.0)
      if (fbPageId) {
        try {
          const fbMetrics = "page_views_total,page_post_engagements,page_daily_follows,page_follows"
          const fbRes = await fetch(`${META_API_BASE}/${fbPageId}/insights?metric=${fbMetrics}&period=day&since=${date_from}&until=${date_to}&access_token=${token}`)
          const fbData = await fbRes.json()
          if (!fbData.error) results.fb_insights = fbData.data || []

          const fbFanRes = await fetch(`${META_API_BASE}/${fbPageId}?fields=fan_count,followers_count&access_token=${token}`)
          const fbFanData = await fbFanRes.json()
          if (!fbFanData.error) results.fb_followers = fbFanData.followers_count || fbFanData.fan_count || 0

          const fbPostsRes = await metaFetchPaginatedWithStatus(`/${fbPageId}/posts`, token, {
            fields: "id,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares",
            limit: "50",
          }, { maxPages: 5 })
          const fbPostsList = fbPostsRes.data || []
          await Promise.all(
            fbPostsList.slice(0, 50).map(async (fp: any) => {
              try {
                const fpIns = await fetch(`${META_API_BASE}/${fp.id}/insights?metric=post_impressions_unique,post_impressions&access_token=${token}`)
                const fpInsData = await fpIns.json()
                if (!fpInsData.error && Array.isArray(fpInsData.data)) {
                  for (const ins of fpInsData.data) {
                    if (ins.name === "post_impressions_unique") fp.reach = ins.values?.[0]?.value ?? null
                    if (ins.name === "post_impressions") fp.views = ins.values?.[0]?.value ?? null
                  }
                }
              } catch { /* indisponivel por permissao */ }
            })
          )
          results.fb_posts = fbPostsList
        } catch (e: any) { console.error("Erro FB insights:", e.message) }
      }

      // Instagram Insights por dia (Graph API v21.0)
      if (igAccountId) {
        try {
          const igAccountRes = await fetch(`${META_API_BASE}/${igAccountId}?fields=followers_count,media_count&access_token=${token}`)
          const igAccountData = await igAccountRes.json()
          if (!igAccountData.error) {
            results.ig_followers = igAccountData.followers_count || 0
            results.ig_media_count = igAccountData.media_count || 0
          }

          const igRes = await fetch(`${META_API_BASE}/${igAccountId}/insights?metric=reach,follower_count&period=day&since=${date_from}&until=${date_to}&access_token=${token}`)
          const igData = await igRes.json()
          if (!igData.error) results.ig_insights = igData.data || []

          const igTotalsRes = await fetch(`${META_API_BASE}/${igAccountId}/insights?metric=views,total_interactions,accounts_engaged,profile_views,website_clicks&metric_type=total_value&period=day&since=${date_from}&until=${date_to}&access_token=${token}`)
          const igTotalsData = await igTotalsRes.json()
          if (!igTotalsData.error) results.ig_totals = igTotalsData.data || []

          const igMediaRes = await metaFetchPaginatedWithStatus(`/${igAccountId}/media`, token, {
            fields: "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count",
            limit: "50",
          }, { maxPages: 5 })
          const igMediaList = igMediaRes.data || []

          // Buscar insights individuais de TODOS os posts carregados (em lotes de 10 para respeitar rate-limit)
          for (let i = 0; i < igMediaList.length; i += 10) {
            await Promise.all(
              igMediaList.slice(i, i + 10).map(async (media: any) => {
                try {
                  const mediaInsRes = await fetch(`${META_API_BASE}/${media.id}/insights?metric=reach,views,saved,shares,total_interactions&access_token=${token}`)
                  const mediaInsData = await mediaInsRes.json()
                  if (!mediaInsData.error && mediaInsData.data) {
                    for (const ins of mediaInsData.data) {
                      if (ins.name === "views") media.views = ins.values?.[0]?.value ?? null
                      if (ins.name === "reach") media.reach = ins.values?.[0]?.value ?? null
                      if (ins.name === "saved") media.saved = ins.values?.[0]?.value ?? null
                      if (ins.name === "shares") media.shares = ins.values?.[0]?.value ?? null
                      if (ins.name === "total_interactions") media.total_interactions = ins.values?.[0]?.value ?? null
                    }
                  }
                } catch { /* indisponivel */ }
              })
            )
          }
          results.ig_media = igMediaList
        } catch (e: any) { console.error("Erro IG insights:", e.message) }
      }

      // Atualizar banco com dados frescos
      if (pageRecord?.page_id) {
        await supabase.from("social_pages").update({
          instagram_followers: results.ig_followers || pageRecord.instagram_followers,
          facebook_followers: results.fb_followers || pageRecord.facebook_followers,
          updated_at: new Date().toISOString()
        }).eq("page_id", pageRecord.page_id)
      }

      return new Response(JSON.stringify(results), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // ==========================================
    // AÇÃO: GET-LIVE-ACCOUNTS — Lista /me/accounts server-side (imune a bloqueadores/Brave Shields do navegador)
    // ==========================================
    if (action === "get-live-accounts") {
      const syncToDb = Boolean(body?.syncToDb)
      const { data: userConfigs } = await supabase
        .from("meta_ads_configs")
        .select("access_token, user_id, created_at")
        .not("access_token", "is", null)
        .order("created_at", { ascending: false })
        .limit(20)

      const prioritized = [
        ...((userConfigs || []).filter((c: any) => c.user_id === user.id)),
        ...((userConfigs || []).filter((c: any) => c.user_id !== user.id)),
      ]
      const validRow = prioritized.find((c: any) => {
        const t = String(c?.access_token || "").trim()
        return t.length >= 20 && !t.startsWith("mock_")
      })
      const masterToken = validRow?.access_token ? String(validRow.access_token).trim() : null

      const { data: dbPages } = await supabase
        .from("social_pages")
        .select("*")
        .order("page_name")

      const mapDbFallback = () =>
        ((dbPages || []) as any[])
          .filter((p) => p.page_id && !String(p.page_id).startsWith("mock_"))
          .map((p) => ({
            page_id: p.page_id,
            page_name: p.page_name,
            access_token: p.access_token || masterToken || "",
            facebook_followers: Number(p.facebook_followers || 0),
            instagram_account_id: p.instagram_account_id || null,
            instagram_handle: p.instagram_handle || null,
            instagram_followers: Number(p.instagram_followers || 0),
            profile_picture_url: null,
          }))

      if (!masterToken) {
        return new Response(
          JSON.stringify({
            hasMasterToken: false,
            masterToken: null,
            accounts: mapDbFallback(),
            error: "Token Master da Meta não configurado em Configurações → Integrações Master.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const mePaginated = await metaFetchPaginatedWithStatus(
        "/me/accounts",
        masterToken,
        {
          fields: "id,name,access_token,fan_count,followers_count,instagram_business_account{id,username,followers_count,profile_picture_url}",
          limit: "100",
        },
        { maxRetries: 2, baseDelayMs: 400, maxPages: 25 }
      )

      if (!mePaginated.ok && mePaginated.data.length === 0) {
        return new Response(
          JSON.stringify({
            hasMasterToken: true,
            masterToken,
            accounts: mapDbFallback(),
            error: mePaginated.error || "Não foi possível consultar páginas conectadas no Meta.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      const accounts = (mePaginated.data || []).map((p: any) => ({
        page_id: p.id,
        page_name: p.name,
        access_token: p.access_token || masterToken,
        facebook_followers: Number(p.followers_count ?? p.fan_count ?? 0),
        instagram_account_id: p.instagram_business_account?.id || null,
        instagram_handle: p.instagram_business_account?.username || null,
        instagram_followers: Number(p.instagram_business_account?.followers_count ?? 0),
        profile_picture_url: p.instagram_business_account?.profile_picture_url || null,
      }))
      accounts.sort((a: any, b: any) => (b.instagram_followers + b.facebook_followers) - (a.instagram_followers + a.facebook_followers))

      if (syncToDb && accounts.length > 0) {
        const ownerUserId = validRow?.user_id || user.id
        for (const acc of accounts) {
          await supabase.from("social_pages").upsert(
            {
              user_id: ownerUserId,
              page_id: acc.page_id,
              page_name: acc.page_name,
              instagram_account_id: acc.instagram_account_id,
              instagram_handle: acc.instagram_handle,
              access_token: acc.access_token,
              facebook_followers: acc.facebook_followers,
              instagram_followers: acc.instagram_followers,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "page_id" }
          )
        }
      }

      return new Response(
        JSON.stringify({
          hasMasterToken: true,
          masterToken,
          accounts,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ==========================================
    // AÇÃO: GRAPH-PROXY — Proxy autenticado restrito a graph.facebook.com para clientes com shields/proxy
    // ==========================================
    if (action === "graph-proxy") {
      if (body?.paginated && body?.endpoint) {
        const ep = String(body.endpoint)
        if (!ep.startsWith("/")) {
          return new Response(JSON.stringify({ error: "Endpoint inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
        }
        const tok = String(body.token || "").trim()
        const timeoutMs = Math.min(20000, Math.max(4000, Number(body?.timeoutMs || 15000)))
        const res = await Promise.race([
          metaFetchPaginatedWithStatus(
            ep,
            tok,
            (body.params && typeof body.params === "object") ? body.params : {},
            { maxRetries: 1, baseDelayMs: 350, maxPages: Math.min(25, Number(body.maxPages || 5)) }
          ),
          new Promise<any>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: false,
                  data: [],
                  pagesFetched: 0,
                  truncated: false,
                  statusCode: 504,
                  attempts: 1,
                  error: `Timeout (${Math.round(timeoutMs / 1000)}s) em ${ep}`,
                  errorCode: 504,
                  errorKind: "network",
                  rateLimitUsagePct: null,
                }),
              timeoutMs
            )
          ),
        ])
        return new Response(JSON.stringify({ paginated: true, ...res }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      const rawUrl = String(body?.url || "")
      if (!rawUrl.startsWith("https://graph.facebook.com/")) {
        return new Response(JSON.stringify({ error: "URL não permitida no proxy Meta." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      const timeoutMs = Math.min(20000, Math.max(4000, Number(body?.timeoutMs || 12000)))
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const resp = await fetch(rawUrl, { signal: controller.signal })
        const json = await resp.json().catch(() => ({}))
        return new Response(JSON.stringify(json), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      } catch (proxyErr: any) {
        const isTimeout = proxyErr?.name === "AbortError" || String(proxyErr?.message || "").toLowerCase().includes("abort")
        return new Response(
          JSON.stringify({
            error: {
              message: isTimeout
                ? `Meta Graph API timeout (${Math.round(timeoutMs / 1000)}s)`
                : proxyErr?.message || "Falha de rede no proxy Meta",
              code: isTimeout ? 504 : 502,
              is_timeout: isTimeout,
            },
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      } finally {
        clearTimeout(timer)
      }
    }

    // Ação desconhecida
    return new Response(JSON.stringify({ error: "Ação desconhecida." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })

  } catch (e: any) {
    console.error("Social Media Error:", e.message)
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
