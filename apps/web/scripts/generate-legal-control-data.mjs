import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const workbookName = "Law Sistema Juridico (1).xlsx";
const workbookPath = path.resolve(process.cwd(), "..", "..", workbookName);
const outputDir = path.resolve(process.cwd(), "generated");
const outputPath = path.resolve(outputDir, "legal-control-workbook.json");
const sheets = ["LAW FUNDO", "LAW SEC"];

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text === "--" || text === "---") return null;
  return text;
}

function excelDateToIso(value) {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");
    return `${parsed.y}-${month}-${day}`;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = cleanText(value);
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString().slice(0, 10);
  }

  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function toAmount(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  const text = String(value).trim();
  if (!text) return null;

  const normalized = text.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function normalizeRow(sheetName, row, rowIndex) {
  const spreadsheetId = String(row.ID ?? row.Id ?? row.id ?? `${rowIndex + 1}`);

  return {
    id: `${sheetName.toLowerCase().replace(/\s+/g, "-")}-${spreadsheetId}`,
    spreadsheet_id: spreadsheetId,
    portfolio: sheetName.replace(/\s+/g, "_"),
    cedente: cleanText(row.Cedente) ?? "Sem cedente informado",
    sacado: cleanText(row.Sacado),
    status: cleanText(row.Status),
    fase: cleanText(row.Fase),
    data_envio_docs: excelDateToIso(row["Data Envio Docs"]),
    data_ajuizamento: excelDateToIso(row["Data Ajuizamento"]),
    valor_acao: toAmount(row["Valor da Ação"]),
    custas_juridicas: toAmount(row["Custas Jurídicas"]),
    ultimo_andamento: cleanText(row["Último Andamento"]),
    data_atualizacao: excelDateToIso(row["Data Atualização"]),
    responsavel: cleanText(row.Responsável),
    prioridade: cleanText(row.Prioridade),
    observacoes: cleanText(row.Observações),
    source_file: workbookName,
    source_sheet: sheetName,
    source_row_number: rowIndex + 2,
    local_state: "planilha"
  };
}

if (!fs.existsSync(workbookPath)) {
  throw new Error(`Planilha nao encontrada em ${workbookPath}`);
}

const workbook = XLSX.readFile(workbookPath, { cellDates: true });
const workbookUpdatedAt = fs.statSync(workbookPath).mtime.toISOString();

const rows = sheets
  .flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    const parsedRows = XLSX.utils.sheet_to_json(sheet, {
      defval: null,
      raw: true
    });
    return parsedRows.map((row, index) => normalizeRow(sheetName, row, index));
  })
  .sort((left, right) => {
    if (left.portfolio !== right.portfolio) {
      return left.portfolio.localeCompare(right.portfolio);
    }
    return Number(left.spreadsheet_id) - Number(right.spreadsheet_id);
  });

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  outputPath,
  JSON.stringify(
    {
      workbookName,
      workbookUpdatedAt,
      rows
    },
    null,
    2
  )
);

console.log(`Arquivo gerado em ${outputPath} com ${rows.length} registros.`);
