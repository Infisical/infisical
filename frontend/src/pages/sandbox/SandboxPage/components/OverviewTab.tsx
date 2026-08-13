import { ReactNode, useEffect, useState } from "react";
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BotIcon,
  CpuIcon,
  MemoryStickIcon,
  PowerIcon,
  PuzzleIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  TerminalIcon
} from "lucide-react";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@app/components/v3";
import {
  SandboxStatus,
  streamSandboxCommands,
  TSandbox,
  TSandboxActivityEntry,
  useGetSandboxMetrics,
  useGetSandboxProxyActivity
} from "@app/hooks/api/sandboxes";

import { CountUp, Dial, niceCeiling, Sparkline } from "../../components/charts";
import { BLOCKED_TONE, TOOL_TONES, toToolKind } from "../../components/toolActivity";

/** One figure in the reference strip: a glyph, the number, and what it counts. */
const StripStat = ({
  icon,
  value,
  children
}: {
  icon: ReactNode;
  /** Omitted when there is no figure worth showing; the label then stands on its own. */
  value?: ReactNode;
  children: ReactNode;
}) => (
  <span className="flex items-center gap-2">
    <span className="text-muted [&>svg]:size-4">{icon}</span>
    {/* Nullish, not falsy: a count of zero is a real figure and has to render. */}
    {value !== null && value !== undefined && (
      <span className="text-lg font-semibold text-foreground">{value}</span>
    )}
    <span className="text-xs text-muted">{children}</span>
  </span>
);

const Divider = () => <span className="h-5 w-px bg-border" />;

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
          prev.some((seen) => seen.id === entry.id) ? prev : [entry, ...prev].slice(0, 10)
        ),
      controller.signal
    ).catch(() => {});

    return () => controller.abort();
  }, [sandbox.id, isRunning]);

  if (!entries.length) {
    return (
      // Fills its container rather than sitting at the top of it: the feed has a fixed height, so a
      // short paragraph with padding read as misaligned against the panels either side.
      // Its own minimum now that the feed is unscrolled: without the container's fixed height this
      // would collapse to the text.
      <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center">
        <span className="flex size-9 items-center justify-center rounded-full border border-border bg-container">
          <ActivityIcon className="size-4 text-muted" />
        </span>
        <p className="text-sm text-foreground">
          {isRunning ? "Waiting for activity" : "Sandbox is stopped"}
        </p>
        <p className="text-xs text-muted">
          {isRunning
            ? "Commands and brokered requests appear here live."
            : "Start it to watch live."}
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {entries.map((entry) => {
        const isProxy = "host" in entry;
        const blocked = isProxy && entry.decision === "blocked";
        const kind = isProxy ? "integration" : toToolKind(entry.kind);
        const tone = blocked ? BLOCKED_TONE : TOOL_TONES[kind];
        const Icon = tone.icon;

        return (
          <li
            key={entry.id}
            className={`relative flex sandbox-enter items-center gap-2.5 overflow-hidden rounded-md border py-1.5 pr-2.5 pl-3 ${tone.surface}`}
          >
            <span className={`absolute inset-y-0 left-0 w-0.5 ${tone.rail}`} />
            <Icon className={`size-3.5 shrink-0 ${tone.text}`} />
            <span className="truncate font-mono text-[11px] text-foreground">
              {isProxy ? `${entry.host}${entry.path}` : entry.command}
            </span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-muted">
              {"exitCode" in entry && entry.exitCode !== null && entry.exitCode !== 0 ? (
                <span className="text-danger">exit {entry.exitCode}</span>
              ) : (
                new Date(entry.at).toLocaleTimeString()
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export const OverviewTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const isRunning = sandbox.status === SandboxStatus.Running;
  const { integrations, pamAccountIds } = sandbox.grants;

  const { data: liveMetrics } = useGetSandboxMetrics(sandbox.id, isRunning);
  const { data: liveActivity } = useGetSandboxProxyActivity(sandbox.id, isRunning);

  // Disabling a query does not discard what it already fetched, so a stopped sandbox would keep
  // showing the last frame it managed to sample, frozen and indistinguishable from live.
  const metrics = isRunning ? liveMetrics : undefined;
  const activity = isRunning ? liveActivity : undefined;

  const cpuSeries = metrics?.samples.map((sample) => sample.cpuPercent) ?? [];
  const memoryLimit = metrics?.memoryLimitMb || sandbox.memoryMb;

  const grantCount = integrations.length + pamAccountIds.length;
  const brokered = activity?.filter((entry) => entry.decision === "brokered").length ?? 0;
  const blocked = activity?.filter((entry) => entry.decision === "blocked").length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* The two live instruments lead, side by side and equally weighted. Everything else is
          reference information and sits below as a single strip rather than as more cards. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[2fr_1fr]">
        <Card className="h-full gap-4">
          <CardHeader className="grid-cols-[1fr_auto]">
            {/* Fixed row height on both panel headers, or the inline reading on this one pushes
                its baseline below the other's. */}
            <CardTitle className="flex h-6 items-center gap-2 text-sm font-medium text-accent">
              <CpuIcon className="size-4" />
              CPU
              <span className="text-2xl font-semibold text-foreground">
                {isRunning && metrics ? (
                  <>
                    <CountUp value={metrics.cpuPercent} decimals={1} />%
                  </>
                ) : (
                  "—"
                )}
              </span>
              <span className="text-xs font-normal text-muted">of {sandbox.vcpu} vCPU</span>
            </CardTitle>
            {/* The stopped state swaps the live indicator rather than covering the chart: an
                overlay in the plot area changes the card's height and reads as a broken graph. */}
            <CardAction>
              {isRunning ? (
                <LiveDot />
              ) : (
                <span className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted uppercase">
                  <PowerIcon className="size-3" />
                  Stopped
                </span>
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-end">
            {/* Flexes to fill: the memory card sets the row height, and a fixed-height plot left a
                third of the widest panel as empty air above the trace. */}
            <div className="relative flex min-h-28 flex-1 flex-col">
              <Sparkline
                values={cpuSeries}
                scaleToData
                gradientId="cpu-hero"
                className="w-full flex-1"
              />
              {/* The axis refits to the data, so without a ceiling label an 11% peak and a 54% peak
                  draw the same mountain and the shape carries no magnitude. */}
              {isRunning && (
                <>
                  <span className="pointer-events-none absolute top-0 right-0 font-mono text-[10px] text-muted">
                    {niceCeiling(Math.max(...cpuSeries, 0))}%
                  </span>
                  <span className="pointer-events-none absolute right-0 bottom-0 font-mono text-[10px] text-muted">
                    0%
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="h-full gap-4">
          <CardHeader className="grid-cols-[1fr_auto]">
            <CardTitle className="flex h-6 items-center gap-2 text-sm font-medium text-accent">
              <MemoryStickIcon className="size-4" />
              Memory
            </CardTitle>
            <CardAction>{isRunning && <LiveDot />}</CardAction>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col items-center gap-2">
            <div className="flex flex-1 items-center justify-center">
              <Dial
                value={metrics?.memoryMb ?? 0}
                max={memoryLimit}
                label={metrics ? `${Math.round((metrics.memoryMb / memoryLimit) * 100)}%` : "—"}
                sublabel={
                  metrics
                    ? `${Math.round(metrics.memoryMb)} / ${Math.round(memoryLimit)} MB`
                    : `limit ${Math.round(memoryLimit)} MB`
                }
              />
            </div>
            <div className="mt-auto flex w-full items-center justify-between gap-2 border-t border-border pt-3">
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <CpuIcon className="size-3.5" />
                {metrics ? `${metrics.processes} proc` : "—"}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <ArrowDownIcon className="size-3.5" />
                {metrics ? <CountUp value={metrics.networkInKb} /> : "—"} KB
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <ArrowUpIcon className="size-3.5" />
                {metrics ? <CountUp value={metrics.networkOutKb} /> : "—"} KB
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* One strip instead of three cards: none of these change while you watch, so they do not
          each deserve a panel. Egress is condensed to its two numbers; the decisions that produced
          them are in Activity. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* Without an agent there is no figure to show, so the label carries it alone rather than
              pairing a large "None" with an explanation of the same thing. */}
          <StripStat icon={<BotIcon />} value={sandbox.agentType}>
            {sandbox.agentType ? (sandbox.agentModel ?? "configured") : "No agent configured"}
          </StripStat>
          <Divider />
          {/* Endpoints and PAM accounts are both integrations, so they count as one figure. */}
          <StripStat icon={<PuzzleIcon />} value={grantCount}>
            integration{grantCount === 1 ? "" : "s"}
          </StripStat>
          <Divider />
          <StripStat icon={<TerminalIcon />} value={sandbox.commandsRun}>
            commands run, all time
          </StripStat>
          <Divider />
          <StripStat icon={<ShieldCheckIcon className="text-success" />} value={brokered}>
            brokered
          </StripStat>
          <StripStat icon={<ShieldXIcon className="text-danger" />} value={blocked}>
            blocked
          </StripStat>
        </CardContent>
      </Card>

      {/* Last, and its own scroll: a feed between panels grows and pushes everything apart. */}
      <Card className="gap-4">
        <CardHeader className="grid-cols-[1fr_auto]">
          <CardTitle className="text-sm font-medium text-accent">Recent activity</CardTitle>
          <CardAction>{isRunning && <LiveDot />}</CardAction>
        </CardHeader>
        <CardContent>
          <div>
            <RecentActivity sandbox={sandbox} isRunning={isRunning} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
