import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList, List, ListRow } from "@infisical/cipher/ui/list";
import {
  Sheet,
  SheetAside,
  SheetBody,
  SheetContent,
  SheetFooter
} from "@infisical/cipher/ui/sheet";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Heading, Highlight, Meta } from "@infisical/cipher/ui/text";
import { format } from "date-fns";

import {
  PamAccountType,
  PamResourcePermissionActions,
  PamSessionStatus,
  type TPamSession,
  type TPamSessionLog
} from "@app/hooks/api/pam";
import { isBrokenChunkMarker } from "@app/hooks/api/pam/session-playback/types";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { formatDuration, isMachineSession } from "./session-format";
import { SessionStatus } from "./session-status";

import styles from "./session-logs.module.css";

const decodeBase64Utf8 = (b64: string) => {
  try {
    return new TextDecoder("utf-8").decode(
      Uint8Array.from(atob(b64), (char) => char.charCodeAt(0))
    );
  } catch {
    return b64;
  }
};

const LEGACY_ANSI_ESCAPE_REGEX = new RegExp(
  [
    "\u001B[\\]PX^_][\\s\\S]*?(?:\u0007|\u001B\\\\)",
    "(?:\u001B\\[|\u009B)[0-?]*[ -/]*[@-~]",
    "\u001B[()*+\\-./][ -~]",
    "\u001B[@-Z\\\\-_]"
  ].join("|"),
  "g"
);

const cleanLegacyTerminalOutput = (raw: string) =>
  raw
    .replace(LEGACY_ANSI_ESCAPE_REGEX, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();

const logText = (log: TPamSessionLog) => {
  if ("input" in log && "output" in log) return [log.input, log.output].filter(Boolean).join(" ");
  if ("data" in log) {
    if (log.eventType === "resize") return "";
    const data = decodeBase64Utf8(log.data);
    return log.rendered ? data.trim() : cleanLegacyTerminalOutput(data);
  }
  if ("method" in log) return `${log.method} ${log.url}`;
  if ("status" in log) return `Response ${log.status}`;
  return "";
};

const logBody = (log: TPamSessionLog) => {
  if (!("body" in log) || !log.body) return null;
  const decoded = decodeBase64Utf8(log.body);
  try {
    return JSON.stringify(JSON.parse(decoded), null, 2);
  } catch {
    return decoded;
  }
};

const RdpReplay = lazy(() => import("./rdp-replay"));

const SessionRecording = ({ session }: { session: TPamSession }) => {
  const {
    data: events = [],
    isPending,
    error
  } = useV4Adapter("pam").useSessionLogs(
    session.id,
    true,
    session.status === PamSessionStatus.Active
  );
  const loading = <Skeleton height={320} />;
  if (error)
    return (
      <Alert tone="bad" title="Could not load the session recording">
        {typeof error === "string" ? error : undefined}
      </Alert>
    );
  if (isPending && events.length === 0) return loading;
  return (
    <Suspense fallback={loading}>
      <RdpReplay logs={events} />
    </Suspense>
  );
};

const DESTRUCTIVE_PREFIXES = ["DROP ", "DELETE ", "TRUNCATE ", "ALTER "];
const isDestructive = (text: string) =>
  DESTRUCTIVE_PREFIXES.some((prefix) => text.trimStart().toUpperCase().startsWith(prefix));

type LogLine = { id: string; time: string; text: string; body: string | null };

type LogMarker = { kind: "marker"; id: string; message: string };

type LogGroup = LogMarker | { kind: "group"; id: string; time: string; lines: LogLine[] };

const LogEntry = ({ line, query }: { line: LogLine; query: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const measure = useCallback((node: HTMLElement | null) => {
    if (!node) return undefined;
    const observer = new ResizeObserver(() => setOverflows(node.scrollWidth > node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const term = query.trim().toLowerCase();
  const bodyMatch = Boolean(term && line.body?.toLowerCase().includes(term));
  const showBody = Boolean(line.body) && (expanded || bodyMatch);
  const expandable = overflows || expanded || Boolean(line.body) || line.text.includes("\n");
  const destructive = isDestructive(line.text);
  const content = (
    <>
      <Icon name="chev-right" className={styles.chevron} data-hidden={!expandable || undefined} />
      <code ref={measure} className={styles.text} data-expanded={expanded || undefined}>
        <Highlight text={line.text} query={query} />
      </code>
      {destructive && <Badge tone="bad">Destructive</Badge>}
    </>
  );
  return (
    <div className={styles.entry}>
      {expandable ? (
        <button
          type="button"
          className={styles.line}
          aria-expanded={showBody || expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {content}
        </button>
      ) : (
        <div className={styles.line}>{content}</div>
      )}
      {showBody && line.body && <Code block code={line.body} wrap maxHeight={384} />}
    </div>
  );
};

const SessionLogs = ({ session }: { session: TPamSession }) => {
  const {
    data: events = [],
    isPending,
    error
  } = useV4Adapter("pam").useSessionLogs(
    session.id,
    true,
    session.status === PamSessionStatus.Active
  );
  const [search, setSearch] = useState("");
  const entries = useMemo(
    () =>
      events.flatMap((event, index): (LogMarker | (LogLine & { kind: "line" }))[] => {
        if (isBrokenChunkMarker(event))
          return [{ kind: "marker", id: `marker-${event.chunkIndex}`, message: event.message }];
        const text = logText(event);
        if (!text) return [];
        return [
          {
            kind: "line",
            id: `log-${event.timestamp}-${index}`,
            time: format(new Date(event.timestamp), "MMM d, h:mm:ss a"),
            text,
            body: logBody(event)
          }
        ];
      }),
    [events]
  );
  const term = search.trim().toLowerCase();
  const groups: LogGroup[] = [];
  entries.forEach((entry) => {
    if (
      term &&
      (entry.kind === "marker" ||
        !`${entry.text}\n${entry.body ?? ""}`.toLowerCase().includes(term))
    )
      return;
    const last = groups.at(-1);
    if (entry.kind === "line" && last?.kind === "group" && last.time === entry.time)
      last.lines.push(entry);
    else if (entry.kind === "line")
      groups.push({ kind: "group", id: entry.id, time: entry.time, lines: [entry] });
    else groups.push(entry);
  });

  if (error)
    return (
      <Alert tone="bad" title="Could not load the session logs">
        {typeof error === "string" ? error : undefined}
      </Alert>
    );

  return (
    <Stack gap={12}>
      <Input
        icon="search"
        aria-label="Search logs"
        placeholder="Search logs..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <List
        label="Session logs"
        loading={isPending && entries.length === 0}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon={term ? "search" : "file-text"}
            title={term ? "No logs match your search" : "No logs recorded for this session"}
          />
        }
      >
        {groups.map((group) =>
          group.kind === "marker" ? (
            <ListRow
              key={group.id}
              value={group.id}
              label={group.message}
              title={<Alert tone="warn">{group.message}</Alert>}
            />
          ) : (
            <ListRow
              key={group.id}
              value={group.id}
              label={group.time}
              title={<Meta>{group.time}</Meta>}
            >
              <Stack gap={4}>
                {group.lines.map((line) => (
                  <LogEntry key={line.id} line={line} query={search} />
                ))}
              </Stack>
            </ListRow>
          )
        )}
      </List>
    </Stack>
  );
};

const SessionSummary = ({ session }: { session: TPamSession }) => {
  const duration = formatDuration(session, Date.now());
  const dateOf = (value?: string | null) =>
    value ? format(new Date(value), "MMM d, yyyy h:mm a") : undefined;
  return (
    <DataList
      variant="props"
      items={[
        ["Status", <SessionStatus key="status" status={session.status} />],
        isMachineSession(session) ? ["Actor", "Machine identity"] : ["Email", session.actorEmail],
        ["Folder", session.folderName || "-"],
        ["Started", dateOf(session.startedAt) ?? "-"],
        ["Ended", dateOf(session.endedAt) ?? "Ongoing"],
        ["Duration", duration ?? "-"],
        ["IP address", <Meta key="ip">{session.actorIp}</Meta>],
        ...(session.reason ? ([["Reason", session.reason]] as const) : [])
      ]}
    />
  );
};

const isRdpSession = (session?: TPamSession) =>
  session?.accountType === PamAccountType.Windows ||
  session?.accountType === PamAccountType.WindowsAd;

const SessionMain = ({ session, error }: { session?: TPamSession; error: unknown }) => {
  if (session) {
    const isRdp = isRdpSession(session);
    return (
      <Stack gap={12}>
        <Inline gap={8} align="center">
          <Heading level={3} size="subsection">
            {isRdp ? "Session recording" : "Session logs"}
          </Heading>
          {session.status === PamSessionStatus.Active && (
            <Badge tone="accent" dot>
              Live
            </Badge>
          )}
        </Inline>
        {isRdp ? <SessionRecording session={session} /> : <SessionLogs session={session} />}
      </Stack>
    );
  }
  if (error)
    return (
      <EmptyState
        size="sm"
        icon="alert"
        title="Could not load this session"
        description={errorMessage(error) || "Please try again."}
      />
    );
  return (
    <Stack gap={16}>
      <Skeleton height={32} width={240} />
      <Skeleton lines={6} />
    </Stack>
  );
};

export const SessionSheet = ({
  sessionId,
  onClose,
  onTerminate
}: {
  sessionId?: string;
  onClose: () => void;
  onTerminate: (session: TPamSession) => void;
}) => {
  const pam = useV4Adapter("pam");
  const { data: session, error } = pam.useSession(sessionId ?? "");
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const { can } = pam.useAccountActions(session?.accountId ?? "", Boolean(session?.accountId));
  const meta = accountTypes.find((entry) => entry.type === session?.accountType);
  const isRdp = isRdpSession(session);
  const canTerminate =
    session?.status === PamSessionStatus.Active &&
    (!session.accountId || can(PamResourcePermissionActions.TerminateSessions));

  return (
    <Sheet open={Boolean(sessionId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="xl">
        <SheetAside
          mainLabel={isRdp ? "Recording" : "Logs"}
          media={meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="md" />}
          title={session?.accountName ?? "Session"}
          description={session?.actorName}
          badges={meta && <Badge tone="outline">{meta.name}</Badge>}
        >
          {session ? <SessionSummary session={session} /> : <Skeleton lines={6} />}
        </SheetAside>
        <SheetBody>
          <SessionMain session={session} error={error} />
        </SheetBody>
        {session && canTerminate && (
          <SheetFooter>
            <Button variant="destructive" icon="x" onClick={() => onTerminate(session)}>
              Terminate session
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
};
