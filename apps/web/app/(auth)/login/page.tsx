"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Clock3, LockKeyhole, ShieldCheck, Workflow } from "lucide-react";

import { apiFetch, getOfflineDemoCredentials, isOfflineDemo } from "@/lib/api";

const fieldClassName =
  "w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-law-gold";

export default function LoginPage() {
  const router = useRouter();
  const offlineDemoCredentials = getOfflineDemoCredentials();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch<{ access_token: string; refresh_token: string }>(
        "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({ email, password })
        }
      );

      window.localStorage.setItem("law-token", response.access_token);
      window.localStorage.setItem("law-refresh-token", response.refresh_token);
      router.push("/dashboard");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Nao foi possivel autenticar."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="law-shell-grid absolute inset-0 opacity-[0.08]" />
      <div className="absolute left-[-8rem] top-[-6rem] h-[18rem] w-[18rem] rounded-full bg-law-gold/10 blur-[90px]" />
      <div className="absolute right-[-8rem] top-[8rem] h-[16rem] w-[16rem] rounded-full bg-sky-100/70 blur-[100px]" />

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.02fr_0.98fr]">
        <section className="hidden px-6 py-6 lg:block xl:px-8">
          <div className="law-panel flex h-full flex-col overflow-hidden rounded-[38px] p-7 xl:p-8">
            <div className="law-rail-card rounded-[30px] p-6 text-white">
              <div className="flex items-center justify-between gap-4">
                <div className="relative h-14 w-[190px]">
                  <Image
                    src="/law-logo-white.png"
                    alt="LAW"
                    fill
                    className="object-contain object-left"
                    priority
                  />
                </div>
                <div className="rounded-full border border-law-gold/25 bg-law-gold/12 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-law-sand">
                  Uso interno
                </div>
              </div>
              <div className="mt-8">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/50">
                  Acesso ao painel
                </div>
                <h1 className="mt-4 font-serif text-[clamp(2.8rem,4.2vw,4.4rem)] leading-[0.94]">
                  Entrada central da operacao LAW.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-8 text-white/70">
                  Ambiente interno para acompanhar carteira, risco, eventos, auditoria e tratativas em uma mesma rotina.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-3">
              <InfoCard
                label="Base"
                value="Monitoramento LAW"
                hint="rotina interna"
                icon={Workflow}
              />
              <InfoCard
                label="Cadencia"
                value="22:00 BRT"
                hint="scheduler diario"
                icon={Clock3}
              />
              <InfoCard
                label="Sessao"
                value="Acesso controlado"
                hint="autenticacao"
                icon={ShieldCheck}
              />
            </div>

            <div className="mt-6 grid flex-1 gap-4 xl:grid-cols-2">
              <div className="rounded-[28px] border border-slate-200 bg-white/85 p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Rotina do sistema
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    "Dashboard com leitura executiva da carteira.",
                    "Acompanhamento operacional por caso e tratativa.",
                    "Eventos, documentos, matches e auditoria em fluxo unico."
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-[20px] border border-slate-200 bg-law-cloud/60 px-4 py-4 text-sm leading-7 text-slate-600"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white/85 p-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Escopo
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    "Carteira, risco e acompanhamento em uma unica navegacao.",
                    "Trilha auditavel das acoes realizadas.",
                    "Base configurada para uso interno da LAW."
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-[20px] border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-600"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-4 py-5 sm:px-6 lg:px-8">
          <div className="law-surface-card relative w-full max-w-[560px] overflow-hidden rounded-[38px] p-6 sm:p-8">
            <div className="absolute right-[-4rem] top-[-5rem] h-40 w-40 rounded-full bg-law-gold/10 blur-3xl" />
            <div className="absolute left-[-4rem] bottom-[-5rem] h-40 w-40 rounded-full bg-sky-100/70 blur-3xl" />

            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="rounded-[24px] bg-[linear-gradient(180deg,_rgba(20,38,58,0.98),_rgba(27,46,67,0.98))] px-4 py-3 shadow-[0_22px_50px_rgba(15,23,42,0.18)]">
                  <div className="relative h-11 w-[164px]">
                    <Image
                      src="/law-logo-white.png"
                      alt="LAW"
                      fill
                      className="object-contain object-left"
                      priority
                    />
                  </div>
                </div>
                <div className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                  LAW
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  Acesso interno
                </div>
                <h2 className="mt-4 font-serif text-[clamp(2.2rem,4vw,3.1rem)] leading-[0.95] text-ink">
                  Entrar no painel
                </h2>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                  Use suas credenciais para acessar a rotina interna de monitoramento, operacao e governanca.
                </p>
              </div>

              {isOfflineDemo() ? (
                <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-800">
                  Modo demonstracao ativo. Login: <strong>{offlineDemoCredentials.email}</strong>.
                  Senha: <strong>{offlineDemoCredentials.password}</strong>.
                </div>
              ) : null}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Login</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={fieldClassName}
                    placeholder="Seu usuario"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-600">Senha</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={fieldClassName}
                    placeholder="Sua senha"
                  />
                </label>

                {error ? (
                  <div className="rounded-[22px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-3 rounded-[24px] bg-[linear-gradient(135deg,_#d3ae21,_#e6c95f)] px-4 py-4 font-semibold text-ink shadow-[0_20px_45px_rgba(211,174,33,0.22)] transition hover:brightness-95 disabled:opacity-60"
                >
                  <LockKeyhole className="h-4 w-4" />
                  {loading ? "Autenticando..." : "Entrar"}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Workflow;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white/85 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {label}
          </div>
          <div className="mt-2 text-sm font-semibold text-ink">{value}</div>
          <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{hint}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-law-navy">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}
