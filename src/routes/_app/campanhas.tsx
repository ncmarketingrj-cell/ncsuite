import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/campanhas")({
  validateSearch: (search: Record<string, unknown>): { accountId?: string; date?: string; campId?: string } => ({
    accountId: search.accountId as string | undefined,
    date: search.date as string | undefined,
    campId: search.campId as string | undefined,
  }),
  beforeLoad: ({ search }) => {
    const params: Record<string, string> = {};
    if (search.accountId) params.account = search.accountId;
    if (search.campId) params.campaign = search.campId;
    if (search.date) params.date = search.date;
    throw redirect({ to: "/metricas", search: params });
  },
  component: () => null,
});
