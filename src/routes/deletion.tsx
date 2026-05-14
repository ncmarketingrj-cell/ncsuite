import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/deletion")({
  head: () => ({ meta: [{ title: "Exclusão de Dados — NC Performance Suite" }] }),
  component: DeletionPage,
});

function DeletionPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link to="/" className="inline-block mb-8"><Logo size={32} /></Link>
      <h1 className="font-display text-3xl font-bold">Exclusão de Dados</h1>
      <p className="mt-2 text-sm text-muted-foreground">Instruções para solicitar a exclusão dos seus dados.</p>

      <article className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Como solicitar a exclusão</h2>
          <p>Se você deseja que seus dados sejam removidos da plataforma NC Performance Suite, siga os passos abaixo:</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Envie um email para <strong className="text-foreground">nc.marketingrj@gmail.com</strong> com o assunto "Exclusão de Dados".</li>
            <li>Inclua no corpo do email: seu nome completo, email cadastrado na plataforma e motivo da solicitação.</li>
            <li>Nossa equipe processará sua solicitação em até 30 dias úteis.</li>
            <li>Você receberá uma confirmação por email após a conclusão da exclusão.</li>
          </ol>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">O que será excluído</h2>
          <p>Ao solicitar a exclusão, removeremos permanentemente: sua conta de usuário, dados de perfil, relatórios gerados, campanhas cadastradas, métricas armazenadas e quaisquer configurações de integração.</p>
        </section>
        <section>
          <h2 className="font-display text-lg font-semibold text-foreground">Dados retidos</h2>
          <p>Poderemos reter dados anonimizados e agregados para fins estatísticos, conforme permitido pela legislação aplicável (LGPD).</p>
        </section>
      </article>

      <div className="mt-12 border-t border-white/5 pt-6">
        <Link to="/" className="label-mono text-primary hover:underline">← Voltar à página inicial</Link>
      </div>
    </div>
  );
}
