import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/campanhas/grafico")({
  beforeLoad: () => {
    throw redirect({ to: "/metricas", search: { view: "analise" } });
  },
  component: () => null,
});
