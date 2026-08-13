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
};

const CATEGORY = {
  pam: {
    label: "PAM",
    icon: DatabaseIcon,
    tone: "text-info",
    ring: "border-info/30 bg-info/10",
    chip: "border-info/20 bg-info/10 text-info"
  },
  brokered: {
    label: "Brokered",
    icon: KeyRoundIcon,
    tone: "text-success",
    ring: "border-success/30 bg-success/10",
    chip: "border-success/20 bg-success/10 text-success"
  },
  request: {
    label: "Request",
    icon: GlobeIcon,
    tone: "text-success",
    ring: "border-success/30 bg-success/10",
    chip: "border-success/20 bg-success/10 text-success"
  },
  blocked: {
    label: "Blocked",
    icon: GlobeIcon,
    tone: "text-danger",
    ring: "border-danger/30 bg-danger/10",
    chip: "border-danger/20 bg-danger/10 text-danger"
  },
  shell: {
    label: "Shell",
    icon: TerminalIcon,
    tone: "text-muted",
    ring: "border-border bg-container",
    chip: "border-border bg-container text-muted"
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
    <li className="relative flex gap-3 pb-3">
      {/* The spine runs behind the nodes and stops at the last, so the feed reads as one thread. */}
      {!isLast && <span className="absolute top-8 bottom-0 left-[15px] w-px bg-border" />}

      <span
        className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border ${row.category.ring} ${row.category.tone}`}
      >
        {nodeGlyph}
      </span>

      <div className="min-w-0 flex-1 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-mineshaft-500">
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
          <ul className="mt-2 flex flex-col gap-1 border-l border-success/30 pl-2.5">
            {row.requests.map((request) => (
              <li key={request.id} className="flex items-center gap-2 text-[11px]">
                <ArrowUpRightIcon className="size-3 shrink-0 text-success" />
                <span className="truncate font-mono text-muted">
                  {request.method} {request.host}
                  {request.path}
                </span>
                {request.credential && (
                  <span className="shrink-0 rounded border border-success/20 bg-success/10 px-1.5 py-px font-mono text-[10px] text-success">
                    Credential proxied
                  </span>
                )}
                <span
                  className={`ml-auto shrink-0 tabular-nums ${
                    (request.status ?? 0) >= 400 ? "text-danger" : "text-muted/60"
                  }`}
                >
                  {request.status ?? request.decision}
                </span>
              </li>
            ))}
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
        setEntries((prev) => (prev.some((seen) => seen.id === entry.id) ? prev : [...prev, entry])),
      controller.signal
    )
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setIsLive(false);
      });

    return () => controller.abort();
  }, [sandbox.id, isRunning]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
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

        return row;
      });

    // Anything the broker handled outside a command's window still deserves a row of its own.
    const orphans = proxies.filter((proxy) => !claimed.has(proxy.id)).map(toRow);

    return [...commandRows, ...orphans].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
    );
  }, [entries]);
  // Same metadata the PAM pages use, so a Postgres row carries the Postgres mark rather than a
  // generic database glyph.
  const { map: accountTypeMap } = usePamAccountTypeMap();
  const granted = useMemo(
    () => rows.filter((row) => row.category !== CATEGORY.shell).length,
    [rows]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Everything this sandbox did, as it happens. Coloured entries used something it was
          granted, brokered on the wire so the sandbox never held the credential.
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
              {rows.length} events, {granted} of which used a granted resource.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
