import { SearchX } from "lucide-react";

import { cn, formatDate } from "@/lib/utils";
import { StatusPill } from "./status-pill";

type Column = {
  key: string;
  label: string;
  kind?: "date" | "status" | "severity" | "currency";
};

function formatValue(value: unknown, kind?: Column["kind"]) {
  if (kind === "date") {
    return <span>{formatDate(value as string)}</span>;
  }
  if (kind === "status" || kind === "severity") {
    return <StatusPill value={String(value ?? "-")} />;
  }
  if (kind === "currency") {
    const amount =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value.replace(/[^\d,.-]/g, "").replace(",", "."))
          : null;
    return (
      <span>
        {amount == null || Number.isNaN(amount)
          ? "-"
          : new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL"
            }).format(amount)}
      </span>
    );
  }
  if (typeof value === "boolean") {
    return <span>{value ? "Sim" : "Nao"}</span>;
  }
  return <span className="block whitespace-normal break-words">{String(value ?? "-")}</span>;
}

export function DataTable({
  rows,
  columns,
  emptyTitle = "Nenhum registro disponivel ainda.",
  emptyDescription = "A base atual ainda nao retornou linhas para esta visao."
}: {
  rows: Record<string, unknown>[];
  columns: Column[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  if (!rows.length) {
    return (
      <div className="law-empty-state law-reveal rounded-[28px] px-6 py-12">
        <div className="mx-auto flex max-w-xl flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-slate-200 bg-white/90 text-law-navy">
            <SearchX className="h-6 w-6" />
          </div>
          <div className="mt-4 font-serif text-[1.7rem] leading-none text-ink">{emptyTitle}</div>
          <div className="mt-3 text-sm leading-7 text-slate-500">{emptyDescription}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="law-reveal overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.07)]">
      <div className="h-px bg-gradient-to-r from-transparent via-law-gold/70 to-transparent" />
      <div className="overflow-x-auto">
        <table className="min-w-[860px] table-fixed text-left text-sm">
          <thead className="bg-[linear-gradient(180deg,_rgba(245,241,234,0.92),_rgba(255,255,255,0.94))] text-xs uppercase tracking-[0.22em] text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-5 py-4 font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, index) => (
              <tr
                key={String(row.id ?? index)}
                className="transition-colors duration-150 hover:bg-[rgba(245,241,234,0.52)]"
              >
                {columns.map((column) => {
                  const value = row[column.key];
                  return (
                    <td key={column.key} className="px-5 py-4 align-top text-slate-700">
                      <div
                        className={cn(
                          "overflow-hidden leading-6",
                          column.kind === "currency"
                            ? "whitespace-nowrap"
                            : "whitespace-normal break-words"
                        )}
                      >
                        {formatValue(value, column.kind)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
