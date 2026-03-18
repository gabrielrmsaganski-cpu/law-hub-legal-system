import { ResourcePage } from "@/components/dashboard/resource-page";

export default function AlertasPage() {
  return (
    <ResourcePage
      title="Alertas de risco"
      description="Fila institucional de alertas juridico-financeiros com severidade, estado de triagem e empresa impactada."
      endpoint="/alerts"
      columns={[
        { key: "severity", label: "Severidade", kind: "severity" },
        { key: "status", label: "Status", kind: "status" },
        { key: "title", label: "Titulo" },
        { key: "monitored_entity", label: "Entidade interna" },
        { key: "found_cnpj", label: "CNPJ encontrado" },
        { key: "event_type", label: "Evento" },
        { key: "created_at", label: "Criado em", kind: "date" }
      ]}
    />
  );
}
