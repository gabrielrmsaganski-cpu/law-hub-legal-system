import { ResourcePage } from "@/components/dashboard/resource-page";

export default function MatchesPage() {
  return (
    <ResourcePage
      title="Matches"
      description="Engine de correlacao entre eventos juridicos e a base interna da LAW com explicabilidade e score."
      endpoint="/matches"
      columns={[
        { key: "match_type", label: "Tipo" },
        { key: "company", label: "Empresa monitorada" },
        { key: "cnpj", label: "CNPJ" },
        { key: "event_type", label: "Evento juridico" },
        { key: "match_score", label: "Score match" },
        { key: "risk_score", label: "Score risco" }
      ]}
    />
  );
}
