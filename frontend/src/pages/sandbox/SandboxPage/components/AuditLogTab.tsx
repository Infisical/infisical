import { useEffect, useRef, useState } from "react";
import {
  BotIcon,
  KeyRoundIcon,
  MessageSquareIcon,
  ScrollTextIcon,
  ServerIcon,
  TerminalIcon
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
import {
  SandboxCommandKind,
  SandboxCommandSource,
  SandboxStatus,
  streamSandboxCommands,
  TSandbox,
  TSandboxCommandEntry
} from "@app/hooks/api/sandboxes";

/**
 * Every command the sandbox runs, live. The three kinds are the point of the page: a command that
 * reached a PAM account or a brokered host used a credential the sandbox never held, and should not
 * look like ordinary shell work.
 */

const KIND_META: Record<
  SandboxCommandKind,
  { label: string; icon: typeof ServerIcon; className: string; rail: string }
> = {
  [SandboxCommandKind.Pam]: {
    label: "PAM",
    icon: ServerIcon,
    className: "border-info/20 bg-info/10 text-info",
    rail: "bg-info"
  },
  [SandboxCommandKind.Integration]: {
    label: "Brokered",
    icon: KeyRoundIcon,
    className: "border-success/20 bg-success/10 text-success",
    rail: "bg-success"
  },
  [SandboxCommandKind.Shell]: {
    label: "Shell",
    icon: TerminalIcon,
    className: "border-border bg-container text-muted",
    rail: "bg-border"
  }
};

const SOURCE_META: Record<SandboxCommandSource, { label: string; icon: typeof BotIcon }> = {
  [SandboxCommandSource.Agent]: { label: "Agent", icon: BotIcon },
  [SandboxCommandSource.Terminal]: { label: "Terminal", icon: TerminalIcon },
  [SandboxCommandSource.Slack]: { label: "Slack", icon: MessageSquareIcon }
};

const CommandRow = ({ entry }: { entry: TSandboxCommandEntry }) => {
  const kind = KIND_META[entry.kind] ?? KIND_META[SandboxCommandKind.Shell];
  const source = SOURCE_META[entry.source] ?? SOURCE_META[SandboxCommandSource.Terminal];
  const KindIcon = kind.icon;
  const SourceIcon = source.icon;
  const failed = entry.exitCode !== 0 && entry.exitCode !== null;

  return (
    <li className="relative flex gap-3 rounded-md border border-border bg-card py-2.5 pr-3 pl-4">
      {/* The rail carries the classification at a glance, so a scan does not depend on reading badges. */}
      <span className={`absolute top-2 bottom-2 left-0 w-0.5 rounded-full ${kind.rail}`} />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral" className={kind.className}>
            <KindIcon className="size-3" />
            {kind.label}
          </Badge>
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <SourceIcon className="size-3" />
            {source.label}
          </span>
          {entry.target && (
            <span className="truncate font-mono text-[11px] text-muted">{entry.target}</span>
          )}
        </div>

        <code className="block truncate font-mono text-xs text-foreground" title={entry.command}>
          {entry.command}
        </code>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 text-[11px] text-muted tabular-nums">
        <span>{new Date(entry.at).toLocaleTimeString()}</span>
        <span className={failed ? "text-danger" : undefined}>
          {failed ? `exit ${entry.exitCode}` : `${(entry.durationMs / 1000).toFixed(2)}s`}
        </span>
      </div>
    </li>
  );
};

export const AuditLogTab = ({ sandbox }: { sandbox: TSandbox }) => {
  const [entries, setEntries] = useState<TSandboxCommandEntry[]>([]);
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
      (entry) => setEntries((prev) => [...prev, entry]),
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
        <CardDescription>
          Every command this sandbox runs, whoever asked for it. Commands that reached a PAM account
          or a brokered host used a credential the sandbox never held.
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
        {entries.length === 0 ? (
          <Empty frame="dashed">
            <EmptyHeader>
              <EmptyMedia>
                <ScrollTextIcon />
              </EmptyMedia>
              <EmptyTitle>{isRunning ? "Nothing has run yet" : "Sandbox is stopped"}</EmptyTitle>
              <EmptyDescription>
                {isRunning
                  ? "Commands appear here the moment they run, from the agent, the terminal or Slack."
                  : "Start the sandbox to watch its commands live."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div ref={scrollRef} className="max-h-[560px] thin-scrollbar overflow-y-auto">
            <ul className="flex flex-col gap-1.5">
              {entries.map((entry) => (
                <CommandRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
