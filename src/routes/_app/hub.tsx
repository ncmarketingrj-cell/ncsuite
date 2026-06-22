import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/hub")({
  head: () => ({ meta: [{ title: "Hub de Modulos | NC Performance Suite" }] }),
  component: function HubPage() {
    useEffect(() => {
      localStorage.setItem("nc_active_module", "hub");
    }, []);
    return null;
  },
});
