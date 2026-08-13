import { ReactNode, useEffect, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  CpuIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  TerminalIcon
} from "lucide-react";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Separator
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  SandboxStatus,
  streamSandboxCommands,
  TSandbox,
  TSandboxActivityEntry,
  useGetSandboxMetrics,
  useGetSandboxProxyActivity
} from "@app/hooks/api/sandboxes";

import { CountUp, Dial, Sparkline } from "../../components/charts";

type TStatVariant = "project" | "info" | "neutral";

const StatCard = ({
  title,
  icon,
  iconVariant,
  value,
  subtitle,
  footnote,
  footnoteVariant,
  spark
}: {
  title: string;
  icon: ReactNode;
  iconVariant: TStatVariant;
  value: ReactNode;
  subtitle: string;
  footnote: string;
  footnoteVariant: "project" | "neutral" | "success";
  spark?: ReactNode;
}) => (
  <Card className="flex-1 gap-4 transition-colors duration-300 hover:border-product-sandbox/30">
    {/* Force the two-column header: CardHeader only splits at its @xs container width, and four
        cards in a row are narrower than that, which drops the icon onto its own line. */}
    <CardHeader className="grid-cols-[1fr_auto]">
      <CardTitle className="text-sm font-medium text-accent">{title}</CardTitle>
      <CardAction>
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-md border [&>svg]:size-5",
            iconVariant === "project" && "border-project/15 bg-project/10 text-project",
            iconVariant === "info" && "border-info/15 bg-info/10 text-info",
            iconVariant === "neutral" && "border-neutral/15 bg-neutral/10 text-neutral"
          )}
        >
          {icon}
        </div>
      </CardAction>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <div>
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        <span className="ml-2 text-sm text-muted">{subtitle}</span>
      </div>
      {spark}
      <Separator />
      <Badge variant={footnoteVariant} className="no-underline">
        {footnote}
      </Badge>
    </CardContent>
  </Card>
);

const LiveDot = () => (
  <span className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted uppercase">
    <span className="relative flex size-1.5">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-product-sandbox opacity-70" />
      <span className="relative inline-flex size-1.5 rounded-full bg-product-sandbox" />
    </span>
    Live
  </span>
);

/**
 * The newest few commands, live. The full feed has its own page; this is the glance that answers
 * "what is it doing right now" without leaving the dashboard.
 */
const RecentActivity = ({ sandbox, isRunning }: { sandbox: TSandbox; isRunning: boolean }) => {
  const [entries, setEntries] = useState<TSandboxActivityEntry[]>([]);

  useEffect(() => {
    if (!isRunning) {
      setEntries([]);
      return undefined;
    }

    const controller = new AbortController();
    streamSandboxCommands(
      sandbox.id,
      // Idempotent on id: every connection replays the backlog, so a reconnect (or the second mount
      // React does in development) would otherwise show each entry twice.
      (entry) =>
        setEntries((prev) =>
          prev.some((seen) => seen.id === entry.id) ? prev : [entry, ...prev].slice(0, 6)
        ),
      controller.signal
    ).catch(() => {});

    return () => controller.abort();
  }, [sandbox.id, isRunning]);

  if (!entries.length) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        {isRunning ? "Nothing has run yet." : "Start the sandbox to see what it does."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex items-center gap-2.5 rounded px-1 py-1 transition-colors hover:bg-foreground/5"
        >
          <TerminalIcon className="size-3.5 shrink-0 text-muted" />
          <span className="truncate font-mono text-[11px] text-foreground">
            {"command" in entry ? entry.command : entry.host}
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
            {"exitCode" in entry && entry.exitCode !== null && entry.exitCode !== 0 ? (
              <span className="text-danger">exit {entry.exitCode}</span>
            ) : (
              new Date(entry.at).toLocaleTimeString()
            )}
          </span>
        </li>
      ))}
    </ul>
  );
};

export const OverviewTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const isRunning = sandbox.status === SandboxStatus.Running;
  const { integrations, pamAccountIds } = sandbox.grants;

  const { data: metrics } = useGetSandboxMetrics(sandbox.id, isRunning);
  const { data: activity } = useGetSandboxProxyActivity(sandbox.id, isRunning);

  const cpuSeries = metrics?.samples.map((sample) => sample.cpuPercent) ?? [];
  const memoryLimit = metrics?.memoryLimitMb || sandbox.memoryMb;

  const brokered = activity?.filter((entry) => entry.decision === "brokered").length ?? 0;
  const blocked = activity?.filter((entry) => entry.decision === "blocked").length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 xl:flex-row">
        <StatCard
          title="CPU"
          icon={<CpuIcon />}
          iconVariant="neutral"
          value={
            isRunning && metrics ? (
              <>
                <CountUp value={metrics.cpuPercent} decimals={1} />%
              </>
            ) : (
              "—"
            )
          }
          subtitle={`of ${sandbox.vcpu} vCPU`}
          footnote={isRunning ? "Running" : "Stopped"}
          footnoteVariant={isRunning ? "success" : "neutral"}
          spark={
            isRunning ? (
              <Sparkline
                values={cpuSeries}
                max={100}
                gradientId="stat-cpu"
                className="h-10 w-full"
              />
            ) : undefined
          }
        />
        <StatCard
          title="Granted Access"
          icon={<KeyRoundIcon />}
          iconVariant="project"
          value={integrations.length + pamAccountIds.length}
          subtitle="resources reachable"
          footnote={
            integrations.length + pamAccountIds.length === 0
              ? "Nothing granted yet"
              : `${integrations.length} endpoints · ${pamAccountIds.length} accounts`
          }
          footnoteVariant={integrations.length + pamAccountIds.length === 0 ? "neutral" : "project"}
        />
        <StatCard
          title="Agent"
          icon={<BotIcon />}
          iconVariant="info"
          value={sandbox.agentType ?? "None"}
          subtitle={sandbox.agentModel ?? (sandbox.agentType ? "configured" : "not configured")}
          footnote={`${sandbox.commandsRun} command${sandbox.commandsRun === 1 ? "" : "s"} run`}
          footnoteVariant="neutral"
        />
      </div>

      <Card className="gap-4">
        <CardHeader className="grid-cols-[1fr_auto]">
          <CardTitle className="text-sm font-medium text-accent">Recent activity</CardTitle>
          <CardAction>{isRunning && <LiveDot />}</CardAction>
        </CardHeader>
        <CardContent>
          <RecentActivity sandbox={sandbox} isRunning={isRunning} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_2fr]">
        <Card className="gap-4">
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle className="text-sm font-medium text-accent">Memory</CardTitle>
            <CardAction>{isRunning && <LiveDot />}</CardAction>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Dial
              value={metrics?.memoryMb ?? 0}
              max={memoryLimit}
              label={
                isRunning && metrics
                  ? `${Math.round((metrics.memoryMb / memoryLimit) * 100)}%`
                  : "—"
              }
              sublabel={`${Math.round(metrics?.memoryMb ?? 0)} / ${Math.round(memoryLimit)} MB`}
            />
            <div className="flex w-full items-center justify-between gap-2 border-t border-border pt-3">
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <ArrowDownIcon className="size-3.5" />
                <CountUp value={metrics?.networkInKb ?? 0} /> KB in
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <ArrowUpIcon className="size-3.5" />
                <CountUp value={metrics?.networkOutKb ?? 0} /> KB out
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle className="text-sm font-medium text-accent">Brokered egress</CardTitle>
            <CardAction>{isRunning && <LiveDot />}</CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-1 items-center gap-3 rounded-md border border-success/20 bg-success/5 p-4">
              <ShieldCheckIcon className="size-5 shrink-0 text-success" />
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  <CountUp value={brokered} />
                </p>
                <p className="text-xs text-muted">
                  requests brokered — a real credential was swapped in outside the sandbox
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-3 rounded-md border border-danger/20 bg-danger/5 p-4">
              <ShieldXIcon className="size-5 shrink-0 text-danger" />
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  <CountUp value={blocked} />
                </p>
                <p className="text-xs text-muted">
                  requests blocked — the host was not on this sandbox&apos;s grant list
                </p>
              </div>
            </div>
          </CardContent>

          {Boolean(activity?.length) && (
            <CardContent className="border-t border-border pt-4">
              <p className="mb-2 text-[11px] font-medium tracking-wider text-muted uppercase">
                Recent decisions
              </p>
              <ul className="flex flex-col">
                {activity?.slice(0, 8).map((entry, index) => (
                  <li
                    // eslint-disable-next-line react/no-array-index-key -- the log has no stable id
                    key={`${entry.at}-${index}`}
                    className="flex items-center gap-2.5 rounded px-1 py-1 transition-colors hover:bg-foreground/5"
                  >
                    {entry.decision === "brokered" ? (
                      <ShieldCheckIcon className="size-3.5 shrink-0 text-success" />
                    ) : (
                      <ShieldXIcon className="size-3.5 shrink-0 text-danger" />
                    )}
                    <span className="shrink-0 font-mono text-[10px] text-muted">
                      {entry.method}
                    </span>
                    <span className="truncate font-mono text-[11px] text-foreground">
                      {entry.host}
                      <span className="text-muted">{entry.path}</span>
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
                      {entry.credential
                        ? `${entry.credential} swapped`
                        : (entry.status ?? "blocked")}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
};
