import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Termos de Uso — NC Performance Suite" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="inline-block mb-8"><Logo size={32} /></Link>
      <h1 className="font-display text-3xl font-bold">Termos de Uso</h1>
      <p className="mt-2 text-sm text-muted-foreground">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

      <article className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">1. Aceitação dos Termos</h2>
          <p>Ao acessar e utilizar a plataforma NC Performance Suite, você concorda em cumprir e estar vinculado a estes Termos de Uso. Se você não concorda com qualquer parte destes termos, não deve utilizar nossos serviços.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">2. Uso da Plataforma</h2>
          <p>A NC Performance Suite é uma ferramenta de gestão e automação de tráfego pago. Você se compromete a utilizar a plataforma apenas para fins legais e de acordo com as políticas das plataformas integradas (ex: Meta/Facebook).</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">3. Integrações de Terceiros</h2>
          <p>Nossa plataforma conecta-se a APIs de terceiros (como a Graph API da Meta). Não somos responsáveis por mudanças nas políticas dessas plataformas ou indisponibilidades de seus serviços que possam afetar a NC Performance Suite.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">4. Responsabilidade de Conta</h2>
          <p>Você é responsável por manter a confidencialidade das credenciais da sua conta e de todas as atividades que ocorrem sob a sua conta. Notifique-nos imediatamente sobre qualquer uso não autorizado.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">5. Propriedade Intelectual</h2>
          <p>Todo o conteúdo, design, código fonte e logotipos presentes na NC Performance Suite são propriedade exclusiva da NC Agência e estão protegidos pelas leis de direitos autorais.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">6. Limitação de Responsabilidade</h2>
          <p>Em nenhuma circunstância a NC Agência será responsável por danos indiretos, incidentais, especiais ou consequentes decorrentes do uso ou da incapacidade de usar a plataforma, incluindo a perda de dados ou lucros de campanhas publicitárias.</p>
        </section>
      </article>

      <div className="mt-12 border-t border-white/5 pt-6 flex gap-4">
        <Link to="/" className="label-mono text-primary hover:underline">← Voltar à página inicial</Link>
        <Link to="/privacy" className="label-mono text-primary hover:underline">Política de Privacidade</Link>
      </div>
    </div>
  );
}
