import { ResourcePage } from "@/components/dashboard/resource-page";

export default function EventosPage() {
  return (
    <ResourcePage
      title="Eventos juridicos"
      description="Eventos classificados pela IA com empresa principal, processo, tribunal e leitura operacional pronta para decisao."
      endpoint="/events"
      columns={[
        { key: "event_type", label: "Tipo do evento" },
        { key: "principal_company", label: "Empresa principal" },
        { key: "principal_company_cnpj", label: "CNPJ" },
        { key: "process_number", label: "Processo" },
        { key: "court", label: "Tribunal" },
        { key: "publication_date", label: "Publicacao", kind: "date" }
      ]}
    />
  );
}
