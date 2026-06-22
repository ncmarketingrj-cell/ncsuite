import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/multicanal")({
  beforeLoad: () => {
    throw redirect({ to: "/metricas" });
  },
  component: () => null,
});
