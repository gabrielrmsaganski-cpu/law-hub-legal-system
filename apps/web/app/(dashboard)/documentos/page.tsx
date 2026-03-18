import { ResourcePage } from "@/components/dashboard/resource-page";

export default function DocumentosPage() {
  return (
    <ResourcePage
      title="Documentos e publicacoes"
      description="Base auditavel de publicacoes capturadas, com processo, tribunal e trecho relevante para leitura interna."
      endpoint="/events/documents"
      columns={[
        { key: "title", label: "Titulo" },
        { key: "process_number", label: "Processo" },
        { key: "court", label: "Tribunal" },
        { key: "excerpt", label: "Trecho" },
        { key: "publication_date", label: "Publicacao", kind: "date" }
      ]}
    />
  );
}
