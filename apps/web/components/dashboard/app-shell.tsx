"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Clock3,
  FileSpreadsheet,
  Gauge,
  Layers3,
  LogOut,
  Menu,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Waypoints,
  X,
  type LucideIcon
} from "lucide-react";

import { isOfflineDemo } from "@/lib/api";
import { cn } from "@/lib/utils";

type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  blurb: string;
};

type NavigationSection = {
  label: string;
  shortLabel: string;
  caption: string;
  items: NavigationItem[];
};

const sections: NavigationSection[] = [
  {
    label: "Executivo",
    shortLabel: "Visao",
    caption: "Visoes centrais da operacao.",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: Gauge,
        blurb: "Resumo geral de risco, carteira e agenda."
      },
      {
        href: "/acompanhamento",
        label: "Acompanhamento",
        icon: BriefcaseBusiness,
        blurb: "Fila operacional, tratativas e proximos passos."
      },
      {
        href: "/controle-juridico",
        label: "Controle juridico",
        icon: FileSpreadsheet,
        blurb: "Planilha consolidada, inclusoes e ajustes da rotina."
      }
    ]
  },
  {
    label: "Monitoramento",
    shortLabel: "Monitorar",
    caption: "Sinais, eventos e leitura documental.",
    items: [
      {
        href: "/alertas",
        label: "Alertas",
        icon: ShieldAlert,
        blurb: "Ocorrencias prioritarias e desvios."
      },
      {
        href: "/eventos",
        label: "Eventos juridicos",
        icon: Bell,
        blurb: "Linha do tempo dos eventos capturados."
      },
      {
        href: "/matches",
        label: "Matches",
        icon: Waypoints,
        blurb: "Correlacoes com a base interna."
      },
      {
        href: "/documentos",
        label: "Documentos",
        icon: BookOpen,
        blurb: "Publicacoes e registros relevantes."
      }
    ]
  },
  {
    label: "Base LAW",
    shortLabel: "Base",
    caption: "Cadastros, rotina e configuracao.",
    items: [
      {
        href: "/empresas",
        label: "Empresas monitoradas",
        icon: Building2,
        blurb: "Base de entidades e ownership."
      },
      {
        href: "/agenda",
        label: "Agenda e execucoes",
        icon: CalendarClock,
        blurb: "Jobs, reprocessamentos e historico."
      },
      {
        href: "/auditoria",
        label: "Auditoria",
        icon: ShieldAlert,
        blurb: "Trilha das acoes do sistema."
      },
      {
        href: "/usuarios",
        label: "Usuarios",
        icon: UserCog,
        blurb: "Acessos e perfis."
      },
      {
        href: "/configuracoes",
        label: "Configuracoes",
        icon: Settings,
        blurb: "Parametros e governanca."
      }
    ]
  }
];

const topSignals = [
  { label: "Base", value: "LAW", hint: "uso interno" },
  { label: "Rotina", value: "22:00 BRT", hint: "scheduler" },
  { label: "Sessao", value: "Ativa", hint: "acesso controlado" }
];

function allItems() {
  return sections.flatMap((section) =>
    section.items.map((item) => ({
      ...item,
      section: section.label,
      sectionCaption: section.caption
    }))
  );
}

function currentPage(pathname: string) {
  return (
    allItems().find((item) => item.href === pathname) ?? {
      href: pathname,
      label: "Painel LAW",
      icon: Layers3,
      blurb: "Visao integrada da operacao juridico-financeira.",
      section: "Workspace",
      sectionCaption: "Acompanhamento interno da LAW."
    }
  );
}

function sectionForPathname(pathname: string) {
  return sections.find((section) => section.items.some((item) => item.href === pathname)) ?? sections[0];
}

function sectionHref(section: NavigationSection, pathname: string) {
  return section.items.find((item) => item.href === pathname)?.href ?? section.items[0]?.href ?? "/dashboard";
}

function NavigationContent({
  pathname,
  onNavigate,
  onLogout
}: {
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const currentSection = sectionForPathname(pathname);
  const [activeSectionLabel, setActiveSectionLabel] = useState(currentSection.label);

  useEffect(() => {
    setActiveSectionLabel(currentSection.label);
  }, [currentSection.label]);

  const activeSection =
    sections.find((section) => section.label === activeSectionLabel) ?? currentSection;

  return (
    <div className="flex h-full flex-col">
      <div className="law-rail-card rounded-[30px] p-5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="relative h-11 w-[156px]">
            <Image
              src="/law-logo-white.png"
              alt="LAW"
              fill
              className="object-contain object-left"
              priority
            />
          </div>
          <div className="rounded-full border border-law-gold/25 bg-law-gold/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-law-sand">
            Interno
          </div>
        </div>
        <div className="mt-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/52">
            Painel LAW
          </div>
          <div className="mt-2 font-serif text-[2rem] leading-none">
            Monitoramento juridico-financeiro.
          </div>
          <p className="mt-3 max-w-xs text-sm leading-6 text-white/70">
            Navegacao central da operacao, com acesso rapido aos modulos e leitura organizada da rotina.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        {topSignals.map((signal) => (
          <div key={signal.label} className="law-surface-card rounded-[22px] px-4 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              {signal.label}
            </div>
            <div className="mt-2 text-sm font-semibold text-ink">{signal.value}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-slate-400">
              {signal.hint}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex-1 overflow-y-auto pr-1">
        <div className="rounded-[28px] border border-slate-200 bg-white/80 p-3">
          <div className="px-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Navegacao
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Escolha a area da rotina e abra os modulos relacionados.
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {sections.map((section) => {
              const isActiveTab = section.label === activeSection.label;
              return (
                <button
                  key={section.label}
                  type="button"
                  onClick={() => setActiveSectionLabel(section.label)}
                  className={cn(
                    "rounded-[18px] border px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em] transition",
                    isActiveTab
                      ? "border-law-gold/35 bg-law-gold/12 text-ink shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
                      : "border-slate-200 bg-white text-slate-500 hover:border-law-gold/25 hover:text-ink"
                  )}
                >
                  {section.shortLabel}
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-[24px] border border-slate-200 bg-[rgba(245,241,234,0.6)] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  {activeSection.label}
                </div>
                <div className="mt-1 text-sm leading-6 text-slate-600">{activeSection.caption}</div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {activeSection.items.length} modulos
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {activeSection.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-start gap-3 rounded-[22px] border px-4 py-4 transition",
                    active
                      ? "border-law-gold/35 bg-[linear-gradient(135deg,_rgba(211,174,33,0.16),_rgba(255,255,255,0.92))] text-ink shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                      : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-law-cloud/70 hover:text-ink"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                      active
                        ? "border-law-gold/35 bg-law-gold/15 text-law-navy"
                        : "border-slate-200 bg-white text-slate-500 group-hover:text-law-navy"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{item.label}</span>
                      {active ? (
                        <span className="rounded-full border border-law-gold/25 bg-law-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink">
                          Atual
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-500">{item.blurb}</div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="mt-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
              Acesso atual
            </div>
            <div className="mt-2 text-sm font-semibold text-ink">{currentSection.label}</div>
            <div className="mt-1 text-sm leading-6 text-slate-500">
              A aba acompanha o modulo aberto para facilitar voltar ao mesmo contexto.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[24px] border border-slate-200 bg-white/80 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Sessao
            </div>
            <div className="mt-2 text-sm leading-6 text-slate-600">
              Ambiente interno da LAW com acesso controlado.
            </div>
          </div>
          <ShieldCheck className="mt-0.5 h-5 w-5 text-law-gold" />
        </div>
        <button
          onClick={onLogout}
          className="mt-4 flex w-full items-center justify-center gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-law-gold/40 hover:text-ink"
        >
          <LogOut className="h-4 w-4" />
          Encerrar sessao
        </button>
      </div>
    </div>
  );
}

function QuickSignal({
  label,
  value,
  hint,
  icon: Icon
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}) {
  return (
    <div className="law-surface-card min-w-0 rounded-[22px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            {label}
          </div>
          <div className="mt-2 break-words text-sm font-semibold text-ink">{value}</div>
          <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{hint}</div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-law-navy">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (isOfflineDemo()) {
      return;
    }
    if (!window.localStorage.getItem("law-token")) {
      router.replace("/login");
    }
  }, [router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const page = currentPage(pathname);
  const PageIcon = page.icon;

  const logout = () => {
    window.localStorage.removeItem("law-token");
    window.localStorage.removeItem("law-refresh-token");
    router.push("/login");
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-ink">
      <div className="law-shell-grid absolute inset-0 opacity-[0.08]" />
      <div className="absolute left-[-8rem] top-[-6rem] h-[18rem] w-[18rem] rounded-full bg-law-gold/10 blur-[90px]" />
      <div className="absolute right-[-8rem] top-[8rem] h-[16rem] w-[16rem] rounded-full bg-sky-200/40 blur-[100px]" />

      <div className="relative z-10 px-3 pb-6 pt-3 md:px-4 lg:px-6">
        <div className="mx-auto max-w-[1720px]">
          <div className="law-panel rounded-[28px] px-4 py-4 md:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-slate-200 bg-white lg:hidden">
                  <Image
                    src="/law-logo-white-preview.png"
                    alt="LAW"
                    width={34}
                    height={34}
                    className="h-auto w-auto"
                    priority
                  />
                </div>
                <div className="hidden shrink-0 rounded-[20px] border border-slate-200 bg-white px-5 py-3 lg:flex">
                  <div className="relative h-10 w-[176px]">
                    <Image
                      src="/law-logo-white.png"
                      alt="LAW"
                      fill
                      className="object-contain object-center"
                      priority
                    />
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                    Painel interno LAW
                  </div>
                  <div className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    Monitoramento juridico-financeiro, acompanhamento operacional e governanca da rotina.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isOfflineDemo() ? (
                  <div className="rounded-full border border-law-gold/35 bg-law-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-ink">
                    Demo offline
                  </div>
                ) : null}
                <div className="hidden rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 md:flex md:items-center md:gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  Rotina monitorada
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen((open) => !open)}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 lg:hidden"
                  aria-label={mobileNavOpen ? "Fechar navegacao" : "Abrir navegacao"}
                >
                  <span>Navegacao</span>
                  {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="law-panel mt-4 rounded-[26px] p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="px-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Areas do sistema
                </div>
                <div className="mt-1 text-sm leading-6 text-slate-500">
                  Troque rapidamente entre os grupos principais da rotina.
                </div>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {sections.map((section) => {
                  const active = section.label === page.section;
                  return (
                    <Link
                      key={section.label}
                      href={sectionHref(section, pathname)}
                      className={cn(
                        "shrink-0 rounded-[18px] border px-4 py-3 text-sm font-semibold transition",
                        active
                          ? "border-law-gold/35 bg-law-gold/12 text-ink shadow-[0_14px_32px_rgba(15,23,42,0.08)]"
                          : "border-slate-200 bg-white text-slate-600 hover:border-law-gold/25 hover:text-ink"
                      )}
                    >
                      {section.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {mobileNavOpen ? (
            <div className="law-panel mt-4 rounded-[30px] p-4 lg:hidden">
              <NavigationContent pathname={pathname} onNavigate={() => setMobileNavOpen(false)} onLogout={logout} />
            </div>
          ) : null}

          <div className="mt-5 flex gap-5">
            <aside className="law-panel sticky top-5 hidden h-[calc(100vh-2.5rem)] w-[360px] shrink-0 rounded-[36px] p-5 lg:block">
              <NavigationContent pathname={pathname} onLogout={logout} />
            </aside>

            <div className="min-w-0 flex-1">
              <header className="law-surface-card relative overflow-hidden rounded-[34px] p-5 sm:p-6 xl:p-7">
                <div className="absolute right-[-3rem] top-[-5rem] h-40 w-40 rounded-full bg-law-gold/10 blur-3xl" />
                <div className="absolute bottom-[-5rem] right-[18%] h-32 w-32 rounded-full bg-sky-100/70 blur-3xl" />

                <div className="relative flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] xl:items-end">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-slate-200 bg-white/85 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {page.section}
                      </span>
                      <span className="rounded-full border border-law-gold/20 bg-law-gold/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink">
                        LAW
                      </span>
                    </div>

                    <div className="mt-5 flex items-start gap-4">
                      <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-slate-200 bg-white text-law-navy sm:flex">
                        <PageIcon className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                          Sistema interno
                        </div>
                        <h1 className="mt-2 break-words font-serif text-[clamp(2.1rem,4vw,3.4rem)] leading-[0.95] text-ink">
                          {page.label}
                        </h1>
                        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
                          {page.blurb} {page.sectionCaption}
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 grid gap-3 md:grid-cols-3">
                      <QuickSignal
                        label="Ambiente"
                        value={isOfflineDemo() ? "Demonstracao" : "Autenticado"}
                        hint="acesso interno"
                        icon={ShieldCheck}
                      />
                      <QuickSignal
                        label="Rotina"
                        value="Atualizacao diaria as 22:00"
                        hint="America/Sao_Paulo"
                        icon={Clock3}
                      />
                      <QuickSignal
                        label="Base"
                        value="Dados, eventos e auditoria"
                        hint="stack LAW"
                        icon={Activity}
                      />
                    </div>
                  </div>

                  <div className="rounded-[30px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(20,38,58,0.98),_rgba(27,46,67,0.96))] p-5 text-white">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/46">
                      Resumo do ambiente
                    </div>
                    <div className="mt-3 font-serif text-[1.65rem] leading-none">
                      Visao organizada da rotina.
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      <div className="rounded-[22px] border border-white/10 bg-white/[0.05] p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">
                          Modulo atual
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">{page.label}</div>
                      </div>
                      <div className="rounded-[22px] border border-white/10 bg-white/[0.05] p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">
                          Escopo
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white">Operacao, risco e governanca</div>
                      </div>
                    </div>
                  </div>
                </div>
              </header>

              <div className="mt-6">{children}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
