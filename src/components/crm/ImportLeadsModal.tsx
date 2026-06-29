import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { X, Upload, Check, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ImportLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId?: string;
  clientId?: string;
  onSuccess: () => void;
}

export function ImportLeadsModal({
  isOpen,
  onClose,
  pipelineId,
  clientId,
  onSuccess
}: ImportLeadsModalProps) {
  const [stages, setStages] = useState<any[]>([]);
  const [sdrs, setSdrs] = useState<any[]>([]);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedSdrId, setSelectedSdrId] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  
  // Mapping columns
  const [mappings, setMappings] = useState<Record<string, number>>({
    name: -1,
    phone: -1,
    email: -1,
    vehicle_interest: -1,
    source: -1
  });

  const [importing, setImporting] = useState(false);
  const [step, setStep] = useState(1); // 1: Upload, 2: Map Columns

  useEffect(() => {
    if (isOpen && pipelineId) {
      loadStages();
      loadSdrs();
      setFile(null);
      setCsvHeaders([]);
      setCsvRows([]);
      setStep(1);
      setMappings({
        name: -1,
        phone: -1,
        email: -1,
        vehicle_interest: -1,
        source: -1
      });
    }
  }, [isOpen, pipelineId]);

  const loadStages = async () => {
    const { data } = await (supabase as any)
      .from("crm_pipeline_stages")
      .select("*")
      .eq("pipeline_id", pipelineId)
      .order("stage_order", { ascending: true });
    if (data && data.length > 0) {
      setStages(data);
      setSelectedStageId(data[0].id);
    }
  };

  const loadSdrs = async () => {
    const { data } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, role, client_id")
      .in("role", ["agency_sdr", "admin", "client_store"]);
    if (data) {
      const filtered = data.filter((p: any) => 
        p.role !== "client_store" || 
        !clientId || 
        p.client_id === clientId
      );
      setSdrs(filtered);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv") && !selectedFile.name.endsWith(".xml")) {
      toast.error("Por favor, selecione apenas arquivos CSV ou XML.");
      return;
    }

    setFile(selectedFile);
    
    // Ler cabeçalhos e primeiras linhas
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (!text) return;

      let headers: string[] = [];
      let rows: string[][] = [];

      if (selectedFile.name.endsWith(".xml")) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        
        // Verifica erro de parse no XML
        const parseError = xmlDoc.getElementsByTagName("parsererror");
        if (parseError.length > 0) {
          toast.error("Erro na leitura do arquivo XML. Formato inválido.");
          return;
        }

        const root = xmlDoc.documentElement;
        const items = Array.from(root.children);
        
        if (items.length === 0) {
          toast.error("O arquivo XML está vazio ou não possui itens.");
          return;
        }

        // Extrai todas as tags filhas para usar como cabeçalhos (headers)
        const allTags = new Set<string>();
        items.forEach(item => {
          Array.from(item.children).forEach(col => allTags.add(col.tagName));
        });
        
        headers = Array.from(allTags);
        
        // Mapeia os valores de cada lead seguindo os headers encontrados
        rows = items.map(item => {
          return headers.map(h => {
            const el = Array.from(item.children).find(c => c.tagName === h);
            return el ? el.textContent?.trim() || "" : "";
          });
        });
      } else {
        // Processamento de CSV (Vírgula ou Ponto e Vírgula)
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (lines.length === 0) {
          toast.error("O arquivo CSV está vazio.");
          return;
        }

        const firstLine = lines[0];
        const sep = firstLine.includes(";") ? ";" : ",";

        const parseRow = (line: string) => {
          const result: string[] = [];
          let current = "";
          let inQuotes = false;
          
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === sep && !inQuotes) {
              result.push(current.trim());
              current = "";
            } else {
              current += char;
            }
          }
          result.push(current.trim());
          return result;
        };

        headers = parseRow(firstLine);
        rows = lines.slice(1).map(l => parseRow(l));
      }

      setCsvHeaders(headers);
      setCsvRows(rows);
      
      // Auto mapear baseado nos nomes mais comuns
      const autoMap: Record<string, number> = {
        name: -1,
        phone: -1,
        email: -1,
        vehicle_interest: -1,
        source: -1
      };

      headers.forEach((h, idx) => {
        const title = h.toLowerCase();
        if (title.includes("nome") || title.includes("name") || title.includes("cliente")) autoMap.name = idx;
        else if (title.includes("fone") || title.includes("celular") || title.includes("tel") || title.includes("phone")) autoMap.phone = idx;
        else if (title.includes("email") || title.includes("e-mail") || title.includes("correio")) autoMap.email = idx;
        else if (title.includes("veiculo") || title.includes("carro") || title.includes("interesse") || title.includes("modelo")) autoMap.vehicle_interest = idx;
        else if (title.includes("origem") || title.includes("orig") || title.includes("source") || title.includes("canal")) autoMap.source = idx;
      });

      setMappings(autoMap);
      setStep(2);
    };

    reader.readAsText(selectedFile, "UTF-8");
  };

  const handleImport = async () => {
    if (mappings.name === -1) {
      toast.error("Por favor, selecione qual coluna representa o Nome do lead.");
      return;
    }

    if (!selectedStageId) {
      toast.error("Por favor, selecione uma Etapa de destino.");
      return;
    }

    setImporting(true);
    try {
      const leadsToInsert = csvRows.map(row => {
        const name = row[mappings.name];
        if (!name) return null; // Ignorar linhas sem nome

        const phone = mappings.phone !== -1 ? row[mappings.phone] : null;
        const email = mappings.email !== -1 ? row[mappings.email] : null;
        const vehicle_interest = mappings.vehicle_interest !== -1 ? row[mappings.vehicle_interest] : null;
        const source = mappings.source !== -1 ? row[mappings.source] : "Importado via CSV";

        return {
          client_id: clientId,
          pipeline_id: pipelineId,
          stage_id: selectedStageId,
          assigned_to: selectedSdrId || null,
          name,
          phone,
          email,
          vehicle_interest,
          source,
          status: stages.find(s => s.id === selectedStageId)?.name || "Novo Lead"
        };
      }).filter(Boolean);

      if (leadsToInsert.length === 0) {
        toast.error("Nenhum lead válido encontrado no arquivo.");
        setImporting(false);
        return;
      }

      // Inserir no banco
      const { error } = await (supabase as any)
        .from("crm_leads")
        .insert(leadsToInsert);

      if (error) throw error;

      toast.success(`${leadsToInsert.length} leads importados com sucesso!`);
      onSuccess();
      onClose();
    } catch (err) {
      toast.error("Erro ao importar leads do CSV.");
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-card border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
          <div>
            <h3 className="text-base font-bold text-foreground">Importar Leads</h3>
            <p className="text-xs text-muted-foreground">Cadastre contatos comerciais em lote no funil (CSV ou XML)</p>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {step === 1 ? (
            /* PASSO 1: Selecionar Arquivo */
            <div className="space-y-4">
              <div className="border-2 border-dashed border-white/10 hover:border-primary/50 transition-all rounded-2xl p-8 text-center cursor-pointer relative group">
                <input 
                  type="file" 
                  accept=".csv,.xml"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3 group-hover:text-primary transition-colors" />
                <p className="text-xs font-bold text-foreground">Clique para fazer upload ou arraste o arquivo</p>
                <p className="text-[10px] text-muted-foreground mt-1.5">Apenas arquivos .csv ou .xml (UTF-8).</p>
              </div>

              <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-[10px] text-muted-foreground leading-relaxed flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                <span>
                  <strong>Nota sobre formatação:</strong> 
                  <br/>- <strong>CSV</strong>: A primeira linha deve conter os títulos. Dados separados por vírgula ou ponto e vírgula.
                  <br/>- <strong>XML</strong>: O sistema lerá os nós filhos automaticamente para extrair as propriedades do lead.
                </span>
              </div>
            </div>
          ) : (
            /* PASSO 2: Mapear Colunas */
            <div className="space-y-6 animate-fade-in">
              <div className="space-y-3">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                  Parâmetros de Destino
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {/* Etapa */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Etapa Padrão</label>
                    <select
                      value={selectedStageId}
                      onChange={(e) => setSelectedStageId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 text-xs rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary bg-card"
                    >
                      {stages.map(s => (
                        <option key={s.id} value={s.id} className="bg-card text-foreground">{s.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* SDR */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">SDR Padrão</label>
                    <select
                      value={selectedSdrId}
                      onChange={(e) => setSelectedSdrId(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 text-xs rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary bg-card"
                    >
                      <option value="" className="bg-card text-foreground">Sem Atribuição</option>
                      {sdrs.map(s => (
                        <option key={s.id} value={s.id} className="bg-card text-foreground">{s.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                  Mapeamento de Planilha ({file?.name})
                </p>
                
                <div className="space-y-2 border border-white/5 rounded-2xl overflow-hidden bg-black/10 p-3">
                  {/* Nome do Lead */}
                  <div className="flex items-center justify-between py-2 border-b border-white/5 text-xs">
                    <span className="font-bold text-foreground">Nome do Lead *</span>
                    <select
                      value={mappings.name}
                      onChange={(e) => setMappings(prev => ({ ...prev, name: Number(e.target.value) }))}
                      className="bg-card border border-white/10 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value={-1}>Não mapear</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Telefone */}
                  <div className="flex items-center justify-between py-2 border-b border-white/5 text-xs">
                    <span className="font-medium text-foreground">Telefone</span>
                    <select
                      value={mappings.phone}
                      onChange={(e) => setMappings(prev => ({ ...prev, phone: Number(e.target.value) }))}
                      className="bg-card border border-white/10 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value={-1}>Não mapear</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* E-mail */}
                  <div className="flex items-center justify-between py-2 border-b border-white/5 text-xs">
                    <span className="font-medium text-foreground">E-mail</span>
                    <select
                      value={mappings.email}
                      onChange={(e) => setMappings(prev => ({ ...prev, email: Number(e.target.value) }))}
                      className="bg-card border border-white/10 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value={-1}>Não mapear</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Interesse */}
                  <div className="flex items-center justify-between py-2 border-b border-white/5 text-xs">
                    <span className="font-medium text-foreground">Veículo de Interesse</span>
                    <select
                      value={mappings.vehicle_interest}
                      onChange={(e) => setMappings(prev => ({ ...prev, vehicle_interest: Number(e.target.value) }))}
                      className="bg-card border border-white/10 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value={-1}>Não mapear</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>

                  {/* Origem */}
                  <div className="flex items-center justify-between py-2 text-xs">
                    <span className="font-medium text-foreground">Origem do Lead</span>
                    <select
                      value={mappings.source}
                      onChange={(e) => setMappings(prev => ({ ...prev, source: Number(e.target.value) }))}
                      className="bg-card border border-white/10 rounded-lg px-2 py-1 text-xs"
                    >
                      <option value={-1}>Não mapear</option>
                      {csvHeaders.map((h, i) => (
                        <option key={i} value={i}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/10 flex justify-end gap-3 bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-white/10 hover:bg-white/5 text-foreground text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          
          {step === 2 && (
            <button
              onClick={handleImport}
              disabled={importing || mappings.name === -1}
              className="px-5 py-2 bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 cursor-pointer"
            >
              {importing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Iniciar Importação ({csvRows.length})
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
