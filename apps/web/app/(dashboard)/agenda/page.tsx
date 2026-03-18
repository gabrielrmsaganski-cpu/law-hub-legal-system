import { ResourcePage } from "@/components/dashboard/resource-page";

export default function AgendaPage() {
  return (
    <ResourcePage
      title="Agenda e execucoes"
      description="Historico do scheduler diario, execucoes manuais, reprocessamentos e status do job das 22:00."
      endpoint="/executions"
      columns={[
        { key: "run_type", label: "Tipo" },
        { key: "status", label: "Status", kind: "status" },
        { key: "requested_by", label: "Solicitado por" },
        { key: "started_at", label: "Inicio", kind: "date" },
        { key: "finished_at", label: "Fim", kind: "date" },
        { key: "manual", label: "Manual" }
      ]}
    />
  );
}
