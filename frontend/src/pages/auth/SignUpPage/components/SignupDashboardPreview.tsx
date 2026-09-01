import {
  Activity,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  FolderKey,
  KeyRound,
  LockKeyhole,
  Search,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";

const navigationItems = [
  { icon: CircleGauge, label: "Overview", active: true },
  { icon: FolderKey, label: "Secret Manager" },
  { icon: KeyRound, label: "KMS" },
  { icon: ShieldCheck, label: "Certificate Manager" },
  { icon: Boxes, label: "Integrations" }
];

const activityItems = [
  { icon: CheckCircle2, label: "Production secrets synced", time: "2m ago" },
  { icon: Users, label: "Workspace access reviewed", time: "18m ago" },
  { icon: Braces, label: "CI environment updated", time: "41m ago" }
];

const chartBars = [
  { id: "aug-12", height: 42 },
  { id: "aug-13", height: 58 },
  { id: "aug-14", height: 46 },
  { id: "aug-15", height: 72 },
  { id: "aug-16", height: 64 },
  { id: "aug-17", height: 86 },
  { id: "aug-18", height: 76 },
  { id: "aug-19", height: 92 },
  { id: "aug-20", height: 82 },
  { id: "aug-21", height: 100 },
  { id: "aug-22", height: 94 },
  { id: "aug-23", height: 108 }
];

export const SignupDashboardPreview = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden bg-page" aria-hidden="true">
    <div className="flex h-full min-h-[720px] min-w-[960px] scale-[1.02] blur-[2px] saturate-75">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card px-4 py-5">
        <div className="flex h-10 items-center gap-3 px-3">
          <img alt="" src="/images/logotransparent.png" className="h-5" />
        </div>
        <div className="mt-6 flex items-center gap-3 rounded-md border border-border bg-container/60 px-3 py-2.5">
          <div className="flex size-7 items-center justify-center rounded-sm bg-project/15 text-project">
            <LockKeyhole className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground">Acme Infrastructure</p>
            <p className="text-[10px] text-muted">Cloud workspace</p>
          </div>
          <ChevronDown className="size-3.5 text-muted" />
        </div>
        <nav className="mt-5 flex flex-col gap-1">
          {navigationItems.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-xs ${
                active ? "border border-project/20 bg-project/10 text-foreground" : "text-label"
              }`}
            >
              <Icon className={`size-4 ${active ? "text-project" : "text-muted"}`} />
              {label}
            </div>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t border-border px-3 pt-4 text-xs text-label">
          <Settings className="size-4" />
          Workspace settings
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-8">
          <div>
            <p className="font-alliance text-lg text-foreground">Overview</p>
            <p className="text-[11px] text-muted">Infrastructure security at a glance</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-56 items-center gap-2 rounded-md border border-border bg-container/40 px-3 text-xs text-muted">
              <Search className="size-3.5" />
              Search resources
            </div>
            <div className="size-8 rounded-full border border-project/25 bg-project/15" />
          </div>
        </header>

        <main className="flex-1 overflow-hidden px-8 py-7">
          <div className="grid grid-cols-3 gap-4">
            {[
              ["Managed secrets", "248", "+18 this month"],
              ["Active identities", "36", "4 service accounts"],
              ["Connected projects", "12", "All systems healthy"]
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border border-border bg-card p-5">
                <p className="text-[11px] text-label">{label}</p>
                <p className="mt-2 font-alliance text-2xl text-foreground">{value}</p>
                <p className="mt-2 text-[10px] text-muted">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] gap-4">
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Secrets activity</p>
                  <p className="mt-1 text-[11px] text-muted">Requests across all environments</p>
                </div>
                <Activity className="size-4 text-project" />
              </div>
              <div className="mt-8 flex h-44 items-end gap-3 border-b border-border px-2">
                {chartBars.map(({ id, height }) => (
                  <div
                    key={id}
                    className="flex-1 rounded-t-sm border border-project/20 bg-project/15"
                    style={{ height }}
                  />
                ))}
              </div>
              <div className="mt-3 flex justify-between px-1 text-[9px] text-muted">
                <span>Aug 12</span>
                <span>Aug 16</span>
                <span>Aug 20</span>
                <span>Today</span>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm font-medium text-foreground">Recent activity</p>
              <p className="mt-1 text-[11px] text-muted">Latest workspace changes</p>
              <div className="mt-5 flex flex-col">
                {activityItems.map(({ icon: Icon, label, time }) => (
                  <div
                    key={label}
                    className="flex items-start gap-3 border-b border-border py-4 last:border-0"
                  >
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-success/10 text-success">
                      <Icon className="size-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[11px] text-foreground">{label}</p>
                      <p className="mt-1 text-[9px] text-muted">{time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
    <div className="absolute inset-0 bg-page/60 backdrop-blur-[3px]" />
  </div>
);
