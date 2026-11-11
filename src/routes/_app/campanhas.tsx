import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/campanhas")({
  validateSearch: (s: Record<string, unknown>) => ({
    accountId: (s.accountId as string) || (s.account as string) || undefined,
    campId: (s.campId as string) || (s.campaign as string) || undefined,
    date: s.date as string | undefined,
    account: (s.account as string) || (s.accountId as string) || undefined,
    campaign: (s.campaign as string) || (s.campId as string) || undefined,
    view: s.view as string | undefined,
  }),
  beforeLoad: ({ search, location }) => {
    // Se for sub-rota como /campanhas/grafico, permite a navegação normal
    if (location.pathname.startsWith("/campanhas/grafico")) {
      return;
    }

    const account = search.account || search.accountId;
    const campaign = search.campaign || search.campId;
    const date = search.date;

    throw redirect({
      to: "/metricas",
      search: {
        account: account || undefined,
        campaign: campaign || undefined,
        date: date || undefined,
        accountId: account || undefined,
        campId: campaign || undefined,
        view: search.view || undefined,
      },
    });
  },
  component: () => <Outlet />,
});
