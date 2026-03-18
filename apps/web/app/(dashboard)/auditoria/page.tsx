import { ResourcePage } from "@/components/dashboard/resource-page";

export default function AuditoriaPage() {
  return (
    <ResourcePage
      title="Auditoria e logs"
      description="Rastro operacional e governanca das acoes do sistema, usuario, integracao e atualizacao de alertas."
      endpoint="/audit/logs"
      columns={[
        { key: "actor_email", label: "Ator" },
        { key: "entity_name", label: "Entidade" },
        { key: "entity_id", label: "Registro" },
        { key: "action", label: "Acao" },
        { key: "created_at", label: "Data", kind: "date" }
      ]}
    />
  );
}
