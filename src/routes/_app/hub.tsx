import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_app/hub")({
  head: () => ({ meta: [{ title: "Hub de Módulos | NC Performance Suite" }] }),
  component: HubPage,
});

function HubPage() {
  useEffect(() => {
    localStorage.setItem("nc_active_module", "hub");
  }, []);
  
  // O layout `_app.tsx` já intercepta o estado `activeModule === "hub"`
  // e renderiza a tela de seleção por cima de tudo.
  // Portanto, este componente pode retornar nulo.
  return null;
}
