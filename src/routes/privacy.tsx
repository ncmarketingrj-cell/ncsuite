import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Política de Privacidade — NC Performance Suite" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="inline-block mb-8"><Logo size={32} /></Link>
      <h1 className="font-display text-3xl font-bold">Política de Privacidade</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

      <article className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">1. Coleta de Dados</h2>
          <p>Coletamos informações fornecidas diretamente por você, incluindo: nome, email, dados de campanhas publicitárias e métricas de performance. Esses dados são utilizados exclusivamente para fornecer os serviços da plataforma NC Performance Suite.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">2. Uso dos Dados</h2>
          <p>Utilizamos seus dados para: gerar relatórios de performance, sincronizar dados com a API do Meta Ads, exibir dashboards e métricas, e melhorar a experiência da plataforma.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">3. Compartilhamento</h2>
          <p>Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros, exceto quando necessário para o funcionamento do serviço (ex: comunicação com APIs do Meta).</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Segurança</h2>
          <p>Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados, incluindo criptografia em trânsito (TLS), autenticação segura via Supabase Auth e controle de acesso baseado em funções.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">5. Seus Direitos</h2>
          <p>Você tem o direito de acessar, corrigir, exportar ou excluir seus dados pessoais a qualquer momento. Para exercer esses direitos, entre em contato pelo email da agência.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">6. Contato</h2>
          <p>Para dúvidas sobre esta política, entre em contato: nc.marketingrj@gmail.com</p>
        </section>
      </article>

      <div className="mt-12 border-t border-white/5 pt-6">
        <Link to="/" className="label-mono text-primary hover:underline">← Voltar à página inicial</Link>
      </div>
    </div>
  );
}
