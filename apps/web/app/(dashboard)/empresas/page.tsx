import { ResourcePage } from "@/components/dashboard/resource-page";

export default function EmpresasPage() {
  return (
    <ResourcePage
      title="Empresas monitoradas"
      description="Base interna da LAW para cedentes, sacados, grupos economicos e entidades com foco em CNPJ e ownership."
      endpoint="/entities"
      columns={[
        { key: "entity_type", label: "Tipo" },
        { key: "corporate_name", label: "Razao social" },
        { key: "trade_name", label: "Nome fantasia" },
        { key: "cnpj", label: "CNPJ" },
        { key: "internal_owner", label: "Responsavel interno" },
        { key: "updated_at", label: "Atualizado em", kind: "date" }
      ]}
    />
  );
}
