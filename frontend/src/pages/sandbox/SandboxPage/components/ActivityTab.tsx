import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  BotIcon,
  DatabaseIcon,
  GlobeIcon,
  KeyRoundIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  TerminalIcon,
  UserIcon
} from "lucide-react";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@app/components/v3";
import { PamAccountType } from "@app/hooks/api/pam/enums";
import { usePamAccountTypeMap } from "@app/hooks/api/pam/queries";
import {
  SandboxActivityType,
  SandboxCommandKind,
  SandboxCommandSource,
  SandboxStatus,
  streamSandboxCommands,
  TSandbox,
  TSandboxActivityEntry,
  TSandboxProxyEntry
} from "@app/hooks/api/sandboxes";

import { BLOCKED_TONE, TOOL_TONES } from "../../components/toolActivity";

/**
 * A timeline rather than a table, because the interesting question is not what the columns are but
 * what this sandbox touched and whether it used something it was granted. The categories get their
 * own colour and icon so they separate at a glance, and the entries that used a credential carry
 * the detail that shows the sandbox never held it.
 */

type TCategory = {
  label: string;
  icon: typeof DatabaseIcon;
  tone: string;
  ring: string;
  chip: string;
  /** Tint for the row body, so a glance separates real tool use from shell noise. */
  surface: string;
  rail: string;
};

/**
 * Labels and icons are this view's own; the colours come from the shared palette so a PAM call is
 * the same blue here, in the dashboard preview, and in the chat. Two tables drifted apart once
 * already, which defeated the whole point of colour-coding.
 */
const CATEGORY = {
  pam: {
    label: "PAM",
    icon: DatabaseIcon,
    tone: TOOL_TONES.pam.text,
    ring: TOOL_TONES.pam.chip,
    chip: TOOL_TONES.pam.chip,
    surface: `${TOOL_TONES.pam.surface} hover:border-info/40`,
    rail: TOOL_TONES.pam.rail
  },
  brokered: {
    label: "Brokered",
    icon: KeyRoundIcon,
    tone: TOOL_TONES.integration.text,
    ring: TOOL_TONES.integration.chip,
    chip: TOOL_TONES.integration.chip,
    surface: `${TOOL_TONES.integration.surface} hover:border-success/40`,
    rail: TOOL_TONES.integration.rail
  },
  request: {
    label: "Request",
    icon: GlobeIcon,
    tone: TOOL_TONES.integration.text,
    ring: TOOL_TONES.integration.chip,
    chip: TOOL_TONES.integration.chip,
    surface: `${TOOL_TONES.integration.surface} hover:border-success/40`,
    rail: TOOL_TONES.integration.rail
  },
  blocked: {
    label: "Blocked",
    icon: GlobeIcon,
    tone: BLOCKED_TONE.text,
    ring: BLOCKED_TONE.chip,
    chip: BLOCKED_TONE.chip,
    surface: `${BLOCKED_TONE.surface} hover:border-danger/40`,
    rail: BLOCKED_TONE.rail
  },
  shell: {
    label: "Shell",
    icon: TerminalIcon,
    tone: TOOL_TONES.shell.text,
    ring: TOOL_TONES.shell.chip,
    chip: TOOL_TONES.shell.chip,
    surface: "border-border bg-card hover:border-mineshaft-500",
    rail: TOOL_TONES.shell.rail
  }
} satisfies Record<string, TCategory>;

const SOURCE_ICON = {
  [SandboxCommandSource.Agent]: BotIcon,
  [SandboxCommandSource.Terminal]: UserIcon,
  [SandboxCommandSource.Slack]: MessageSquareIcon
};

/**
 * A psql invocation is mostly connection plumbing the reader already knows from the account, so the
 * query is lifted out and the rest dropped. Parsed by hand rather than by pattern: the query is the
 * last quoted argument, and quotes inside it would defeat anything terser.
 */
const extractQuery = (command: string): string | null => {
  const flag = command.indexOf('-c "');
  if (flag === -1) return null;

  const body = command.slice(flag + 4);
  const close = body.lastIndexOf('"');
  return close === -1 ? body.trim() : body.slice(0, close).trim();
};

type TRow = {
  id: string;
  at: string;
  category: TCategory;
  sourceIcon: typeof BotIcon | null;
  sourceLabel: string | null;
  /** The line that matters most, in monospace. */
  headline: string;
  /** Secondary facts, already formatted. Empty means none worth showing. */
  facts: string[];
  result: string;
  failed: boolean;
  /** PAM only: the account this touched, so the row can show its logo and link to it. */
  accountId: string | null;
  resourceType: string | null;
  /** The PAM account's name, used as the link label. */
  target: string | null;
  /** Requests the broker handled while this command was running. */
  requests: TSandboxProxyEntry[];
};

const categoryForCommand = (kind: SandboxCommandKind): TCategory => {
  if (kind === SandboxCommandKind.Pam) return CATEGORY.pam;
  if (kind === SandboxCommandKind.Integration) return CATEGORY.brokered;
  return CATEGORY.shell;
};

const toRow = (entry: TSandboxActivityEntry): TRow => {
  if (entry.type === SandboxActivityType.Proxy) {
    const blocked = entry.decision === "blocked";

    return {
      id: entry.id,
      at: entry.at,
      category: blocked ? CATEGORY.blocked : CATEGORY.request,
      sourceIcon: null,
      sourceLabel: entry.method,
      headline: `${entry.host}${entry.path}`,
      facts: [
        entry.integration ?? "",
        // Named, never valued: this is the header the broker filled in on the way out.
        entry.credential ? `${entry.credential} added by the broker` : ""
      ].filter(Boolean),
      result: entry.status ? String(entry.status) : entry.decision,
      failed: blocked || (entry.status ?? 0) >= 400,
      accountId: null,
      resourceType: null,
      target: null,
      requests: []
    };
  }

  const failed = entry.exitCode !== 0 && entry.exitCode !== null;
  const query = entry.kind === SandboxCommandKind.Pam ? extractQuery(entry.command) : null;

  return {
    id: entry.id,
    at: entry.at,
    category: categoryForCommand(entry.kind),
    sourceIcon: SOURCE_ICON[entry.source] ?? null,
    sourceLabel: entry.source,
    headline: query ?? entry.command,
    facts: [],
    result: failed ? `exit ${entry.exitCode}` : `${(entry.durationMs / 1000).toFixed(2)}s`,
    failed,
    accountId: entry.accountId,
    resourceType: entry.resourceType,
    target: entry.target,
    requests: []
  };
};

const TimelineRow = ({
  row,
  isLast,
  orgId,
  resourceIcon,
  resourceName
}: {
  row: TRow;
  isLast: boolean;
  orgId: string;
  resourceIcon?: string;
  resourceName?: string;
}) => {
  const Icon = row.category.icon;
  const SourceIcon = row.sourceIcon;

  // A brokered request without a known resource gets the shield; otherwise prefer the resource's own
  // mark and fall back to the category icon.
  let nodeGlyph = <Icon className="size-4" />;
  if (resourceIcon) {
    nodeGlyph = (
      <img
        src={`/images/integrations/${resourceIcon}`}
        alt={resourceName ?? "resource"}
        className="size-4 rounded-sm"
      />
    );
  } else if (row.requests.length > 0) {
    nodeGlyph = <ShieldCheckIcon className="size-4" />;
  }

  return (
    <li className="relative flex sandbox-enter gap-3 pb-3">
      {/* The spine runs behind the nodes and stops at the last, so the feed reads as one thread. */}
      {!isLast && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-border" />}

      <span
        className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border ${row.category.ring} ${row.category.tone}`}
      >
        {nodeGlyph}
      </span>

      <div
        className={`relative min-w-0 flex-1 overflow-hidden rounded-md border py-2 pr-3 pl-3.5 transition-colors ${row.category.surface}`}
      >
        {/* Accent rule rather than a heavier fill: enough to read the kind at a glance without the
            feed turning into stripes of colour. */}
        <span className={`absolute inset-y-0 left-0 w-0.5 ${row.category.rail}`} />
        <div className="flex items-center gap-2">
          {row.accountId ? (
            <Link
              to="/organizations/$orgId/pam/accounts"
              params={{ orgId }}
              search={{ accountId: row.accountId }}
              className="shrink-0"
            >
              <Badge variant="neutral" className={`${row.category.chip} hover:underline`}>
                {row.target ?? row.category.label}
              </Badge>
            </Link>
          ) : (
            <Badge variant="neutral" className={row.category.chip}>
              {row.category.label}
            </Badge>
          )}

          {row.sourceLabel && (
            <span className="flex items-center gap-1 text-[11px] text-muted">
              {SourceIcon && <SourceIcon className="size-3" />}
              {row.sourceLabel}
            </span>
          )}

          <span className="ml-auto flex items-center gap-2 text-[11px] text-muted tabular-nums">
            <span className={row.failed ? "text-danger" : undefined}>{row.result}</span>
            <span className="text-muted/40">·</span>
            <span className="text-muted/60">{new Date(row.at).toLocaleTimeString()}</span>
          </span>
        </div>

        <code
          className="mt-1.5 block truncate font-mono text-xs text-foreground"
          title={row.headline}
        >
          {row.headline}
        </code>

        {row.facts.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-muted">{row.facts.join("  ·  ")}</p>
        )}

        {/* What the broker actually did while this command ran, which the command line cannot show. */}
        {row.requests.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 border-l border-border pl-2.5">
            {row.requests.map((request) => {
              const wasBlocked = request.decision === "blocked";
              const tone = wasBlocked ? BLOCKED_TONE : TOOL_TONES.integration;

              return (
                <li key={request.id} className="flex items-center gap-2 text-[11px]">
                  <ArrowUpRightIcon className={`size-3 shrink-0 ${tone.text}`} />
                  <span className="truncate font-mono text-muted">
                    {request.method} {request.host}
                    {request.path}
                  </span>
                  {wasBlocked ? (
                    <span
                      className={`shrink-0 rounded border px-1.5 py-px font-mono text-[10px] ${tone.chip}`}
                    >
                      Blocked
                    </span>
                  ) : (
                    request.credential && (
                      <span
                        className={`shrink-0 rounded border px-1.5 py-px font-mono text-[10px] ${tone.chip}`}
                      >
                        Credential proxied
                      </span>
                    )
                  )}
                  <span
                    className={`ml-auto shrink-0 tabular-nums ${
                      (request.status ?? 0) >= 400 ? "text-danger" : "text-muted/60"
                    }`}
                  >
                    {request.status ?? request.decision}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
};

export const ActivityTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const [entries, setEntries] = useState<TSandboxActivityEntry[]>([]);
  const [isLive, setIsLive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isRunning = sandbox.status === SandboxStatus.Running;

  useEffect(() => {
    if (!isRunning) {
      setEntries([]);
      setIsLive(false);
      return undefined;
    }

    const controller = new AbortController();
    setIsLive(true);

    streamSandboxCommands(
      sandbox.id,
      // Idempotent on id: every connection replays the backlog, so a reconnect, or the second mount
      // React does in development, would otherwise show each event twice.
      (entry) =>
        setEntries((prev) => (prev.some((seen) => seen.id === entry.id) ? prev : [entry, ...prev])),
      controller.signal
    )
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLive(false);
      });

    return () => controller.abort();
  }, [sandbox.id, isRunning]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [entries.length]);

  const rows = useMemo(() => {
    const proxies = entries.filter(
      (entry): entry is TSandboxProxyEntry => entry.type === SandboxActivityType.Proxy
    );
    const claimed = new Set<string>();

    const commandRows = entries
      .filter((entry) => entry.type === SandboxActivityType.Command)
      .map((entry) => {
        const row = toRow(entry);

        // A command is recorded when it finishes, so its window is [at - durationMs, at]. Requests
        // inside that window were almost certainly made by it. This is inference from timing, not a
        // traced link, so two commands overlapping in flight could steal each other's requests.
        const end = new Date(entry.at).getTime();
        const start = end - (entry.type === SandboxActivityType.Command ? entry.durationMs : 0);

        row.requests = proxies.filter((proxy) => {
          const at = new Date(proxy.at).getTime();
          if (claimed.has(proxy.id) || at < start || at > end) return false;
          claimed.add(proxy.id);
          return true;
        });

        // Recoloured once its requests are known: a command whose brokered request was refused is a
        // refusal whatever its exit code. Colouring it green because the shell exited zero
        // contradicted the same event shown red in the dashboard feed.
        if (row.requests.some((request) => request.decision === "blocked")) {
          row.category = CATEGORY.blocked;
        }

        return row;
      });

    // Anything the broker handled outside a command's window still deserves a row of its own.
    const orphans = proxies.filter((proxy) => !claimed.has(proxy.id)).map(toRow);

    // Newest first. Inverting the arrival order alone was not enough: this sort ran afterwards and
    // put it back, so the latest event sat at the bottom and had to be scrolled to.
    return [...commandRows, ...orphans].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );
  }, [entries]);
  // Same metadata the PAM pages use, so a Postgres row carries the Postgres mark rather than a
  // generic database glyph.
  const { map: accountTypeMap } = usePamAccountTypeMap();
  /**
   * Counted over requests, not rows, because that is what the dashboard counts.
   *
   * Per row it disagreed with itself: one command held a proxied request and a blocked one, the row
   * recoloured to blocked, and the footer then printed "0 brokered" directly beneath a green
   * "Credential proxied" badge. Brokered credentials are the whole claim, so the one number that
   * must never read zero while the badge is on screen is that one.
   */
  const { brokered, blockedCount } = useMemo(() => {
    const decisionsFor = (row: TRow): string[] => {
      if (row.requests.length) return row.requests.map((request) => request.decision);
      // A row with no child requests is a proxy event in its own right, unless it is a plain shell
      // command, which reached nothing and counts as neither.
      if (row.category === CATEGORY.blocked) return ["blocked"];
      if (row.category === CATEGORY.request) return ["brokered"];
      return [];
    };

    const decisions = rows.flatMap(decisionsFor);

    return {
      brokered: decisions.filter((decision) => decision === "brokered").length,
      blockedCount: decisions.filter((decision) => decision === "blocked").length
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Live since this sandbox started. Colored entries reached outside the sandbox, brokered on
          the wire so the sandbox never held the credential.
        </CardDescription>
        <CardAction>
          <Badge variant={isLive ? "success" : "neutral"}>
            {isLive && (
              <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current" />
            )}
            {isLive ? "Live" : "Not running"}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <ScrollTextIcon />
              </EmptyMedia>
              <EmptyTitle>{isRunning ? "Nothing has run yet" : "Sandbox is stopped"}</EmptyTitle>
              <EmptyDescription>
                {isRunning
                  ? "Commands and brokered requests appear here the moment they happen."
                  : "Start the sandbox to watch its activity live."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <div ref={scrollRef} className="max-h-[560px] thin-scrollbar overflow-y-auto pr-1">
              <ul className="flex flex-col">
                {rows.map((row, index) => {
                  const meta = row.resourceType
                    ? accountTypeMap[row.resourceType as PamAccountType]
                    : undefined;

                  return (
                    <TimelineRow
                      key={row.id}
                      row={row}
                      isLast={index === rows.length - 1}
                      orgId={sandbox.orgId}
                      resourceIcon={meta?.icon}
                      resourceName={meta?.name}
                    />
                  );
                })}
              </ul>
            </div>

            <p className="mt-1 text-xs text-muted">
              {rows.length} {rows.length === 1 ? "event" : "events"} · {brokered} brokered ·{" "}
              {blockedCount} blocked
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
