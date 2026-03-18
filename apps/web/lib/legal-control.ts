import "server-only";

import fs from "node:fs";
import path from "node:path";

export type LegalControlRow = {
  id: string;
  spreadsheet_id: string;
  portfolio: string;
  cedente: string;
  sacado: string | null;
  status: string | null;
  fase: string | null;
  data_envio_docs: string | null;
  data_ajuizamento: string | null;
  valor_acao: number | null;
  custas_juridicas: number | null;
  ultimo_andamento: string | null;
  data_atualizacao: string | null;
  responsavel: string | null;
  prioridade: string | null;
  observacoes: string | null;
  source_file: string;
  source_sheet: string;
  source_row_number: number;
  local_state?: "planilha" | "ajustado" | "manual";
};

export type LegalControlWorkbook = {
  workbookName: string;
  workbookUpdatedAt: string;
  rows: LegalControlRow[];
};

const GENERATED_PATH = path.resolve(process.cwd(), "generated", "legal-control-workbook.json");

export function loadLegalControlWorkbook(): LegalControlWorkbook {
  if (!fs.existsSync(GENERATED_PATH)) {
    throw new Error(`Snapshot da planilha nao encontrado em ${GENERATED_PATH}`);
  }

  return JSON.parse(fs.readFileSync(GENERATED_PATH, "utf8")) as LegalControlWorkbook;
}
