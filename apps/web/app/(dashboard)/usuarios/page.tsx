import { ResourcePage } from "@/components/dashboard/resource-page";

export default function UsuariosPage() {
  return (
    <ResourcePage
      title="Usuarios e permissoes"
      description="Controle de acesso por perfil administrativo, juridico, risco e leitura."
      endpoint="/users"
      columns={[
        { key: "full_name", label: "Nome" },
        { key: "email", label: "E-mail" },
        { key: "role", label: "Perfil" },
        { key: "is_active", label: "Ativo" },
        { key: "created_at", label: "Criado em", kind: "date" }
      ]}
    />
  );
}
