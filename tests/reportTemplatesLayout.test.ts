import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolvePath(__dirname, "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/integrations/supabase-external/client") {
      return { shortCircuit: true, url: "stub:supabase-client" };
    }
    if (specifier.startsWith("@/")) {
      const target = resolvePath(rootDir, "src", `${specifier.slice(2)}.ts`);
      return { shortCircuit: true, url: pathToFileURL(target).href };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === "stub:supabase-client") {
      return { shortCircuit: true, format: "module", source: "export const supabase = {};" };
    }
    return nextLoad(url, context);
  },
});

const engine = await import("../src/lib/reportTemplateEngine.ts");
const { SYSTEM_REPORT_TEMPLATES, renderReportTemplateText } = engine;

const sampleCampaigns = [
  {
    id: "cmp_1",
    name: "NC - MSG - 29/06",
    platform: "meta" as const,
    objective: "Mensagens",
    rawObjective: "OUTCOME_ENGAGEMENT",
    optimizationGoal: "CONVERSATIONS",
    resultType: "CONVERSATIONS",
    resultIndicator: "actions:onsite_conversion.messaging_conversation_started_7d",
    cost: 150.58,
    impressions: 9436,
    clicks: 120,
    inlineLinkClicks: 95,
    reach: 7196,
    conversions: 19,
    selected: true,
  },
  {
    id: "cmp_2",
    name: "Bonne21 - Vendas Site",
    platform: "meta" as const,
    objective: "Vendas / Compras",
    rawObjective: "OUTCOME_SALES",
    optimizationGoal: "OFFSITE_CONVERSIONS",
    resultType: "PURCHASES",
    resultIndicator: "actions:purchase",
    cost: 0,
    impressions: 0,
    clicks: 0,
    inlineLinkClicks: 0,
    reach: 0,
    conversions: 3,
    purchaseValue: 267.8,
    selected: true,
  },
];

describe("Report templates clean NC layout", () => {
  it("objective, campaigns e complete seguem o layout limpo NC sem alterar standard_auto e ecommerce_sales", () => {
    const byId = new Map(SYSTEM_REPORT_TEMPLATES.map((t) => [t.id, t]));

    for (const id of ["objective", "campaigns", "complete"]) {
      const tpl = byId.get(id);
      assert.ok(tpl, `Template ${id} deve existir`);
      assert.equal(tpl.message_template.includes("━━━━━"), false, `${id} não deve conter divisor antigo`);
      assert.equal(tpl.message_template.includes("📊 *RELATÓRIO"), false, `${id} não deve conter cabeçalho antigo`);
      assert.equal(tpl.message_template.includes("{{AGENCIA}}"), false, `${id} não deve conter rodapé antigo`);
      assert.ok(tpl.message_template.includes("Loja: {{NOME_CLIENTE}}"), `${id} deve usar Loja: {{NOME_CLIENTE}}`);
      assert.ok(tpl.message_template.includes("*Período:* {{PERIODO}}"), `${id} deve usar *Período:* {{PERIODO}}`);
      assert.ok(tpl.message_template.includes("*Totais Gerais:*"), `${id} deve conter *Totais Gerais:*`);
      assert.ok(tpl.message_template.includes("CPL Médio Geral:"), `${id} deve usar CPL Médio Geral`);
      assert.equal(tpl.message_template.includes("CPA Médio Geral:"), false, `${id} não deve usar CPA Médio Geral`);
    }

    const std = byId.get("standard_auto");
    assert.ok(std);
    assert.ok(std.message_template.startsWith("Relatório mensal: \nLoja: {{NOME_CLIENTE}}"));
    assert.ok(std.message_template.includes("{{BLOCO_VEICULOS}}"));

    const ecom = byId.get("ecommerce_sales");
    assert.ok(ecom);
    assert.ok(ecom.message_template.startsWith("Relatório mensal: \nLoja: {{NOME_CLIENTE}}"));
    assert.ok(ecom.message_template.includes("{{BLOCO_ECOMMERCE}}"));
  });

  it("renderReportTemplateText renderiza objective, campaigns e complete com detalhamento limpo", () => {
    const byId = new Map(SYSTEM_REPORT_TEMPLATES.map((t) => [t.id, t]));

    const completeOut = renderReportTemplateText({
      templateText: byId.get("complete")!.message_template,
      campaigns: sampleCampaigns,
      clientName: "Bonne21",
      periodText: "13/11/2026",
      agencyName: "NC Performance",
      reportLevel: "campaign",
    });

    assert.equal(completeOut.includes("━━━━━"), false);
    assert.equal(completeOut.includes("💵"), false);
    assert.ok(completeOut.includes("Loja: Bonne21"));
    assert.ok(completeOut.includes("*Totais Gerais:*"));
    assert.ok(completeOut.includes("*Resultados por Tipo / Objetivo:*"));
    assert.ok(completeOut.includes("*Detalhamento de Campanhas:*"));
    assert.ok(completeOut.includes("*NC - MSG - 29/06:*"));
    assert.ok(completeOut.includes("Alcance: 7.196"));
    assert.ok(completeOut.includes("Impressões: 9.436"));
    assert.ok(completeOut.includes("*Bonne21 - Vendas Site:*"));

    const stdOut = renderReportTemplateText({
      templateText: byId.get("standard_auto")!.message_template,
      campaigns: sampleCampaigns,
      clientName: "AlfaCar",
      periodText: "01/11/2026 a 15/11/2026",
      agencyName: "NC Performance",
    });
    assert.ok(stdOut.includes("Alcance: 7.196"));
    assert.ok(stdOut.includes("Impressões: 9.436"));
    assert.ok(completeOut.includes("Receita (Compras): R$"));
    assert.ok(completeOut.includes("Não calculável (gasto zero)"));

    const objectiveOut = renderReportTemplateText({
      templateText: byId.get("objective")!.message_template,
      campaigns: sampleCampaigns,
      clientName: "Bonne21",
      periodText: "13/11/2026",
      agencyName: "NC Performance",
    });
    assert.ok(objectiveOut.includes("*Resultados por Tipo / Objetivo:*"));
    assert.equal(objectiveOut.includes("*Detalhamento de Campanhas:*"), false);

    const campaignsOut = renderReportTemplateText({
      templateText: byId.get("campaigns")!.message_template,
      campaigns: sampleCampaigns,
      clientName: "Bonne21",
      periodText: "13/11/2026",
      agencyName: "NC Performance",
    });
    assert.ok(campaignsOut.includes("*Detalhamento de Campanhas:*"));
    assert.equal(campaignsOut.includes("*Resultados por Tipo / Objetivo:*"), false);
  });

  it("relatorios.tsx não contém divisores ou banners legados nos builders de complete/objective/campaigns", () => {
    const relatoriosSource = readFileSync(resolvePath(rootDir, "src/routes/_app/relatorios.tsx"), "utf8");
    assert.equal(relatoriosSource.includes("━━━━━"), false, "relatorios.tsx não deve conter divisores ━━━━━");
    assert.equal(relatoriosSource.includes("TOTAIS GERAIS"), false, "relatorios.tsx não deve conter *📊 TOTAIS GERAIS*");
    assert.equal(relatoriosSource.includes("Conversões Elegíveis"), false, "relatorios.tsx não deve falar Conversões Elegíveis");
    assert.equal(relatoriosSource.includes("CPA (Conversões)"), false, "relatorios.tsx não deve usar CPA (Conversões)");
    assert.ok(relatoriosSource.includes("*Totais Gerais:*"));
    assert.ok(relatoriosSource.includes("*Resultados por Tipo / Objetivo:*"));
    assert.ok(relatoriosSource.includes("Detalhamento de Campanhas"));
  });
});
