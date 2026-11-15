import { useMemo, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Code } from "@infisical/cipher/ui/code";
import { DataTable } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
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

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { formatDuration, isMachineSession } from "./session-format";
import { SessionStatus } from "./session-status";

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

const DESTRUCTIVE_PREFIXES = ["DROP ", "DELETE ", "TRUNCATE ", "ALTER "];
const isDestructive = (text: string) =>
  DESTRUCTIVE_PREFIXES.some((prefix) => text.trimStart().toUpperCase().startsWith(prefix));

type LogRow =
  | { kind: "marker"; id: string; message: string }
  | { kind: "log"; id: string; time: string; text: string; body: string | null };

const SessionLogs = ({ session }: { session: TPamSession }) => {
  const isActive = session.status === PamSessionStatus.Active;
  const {
    data: events = [],
    isPending,
    error
  } = useV4Adapter("pam").useSessionLogs(session.id, true, isActive);
  const [search, setSearch] = useState("");
  const rows = useMemo<LogRow[]>(
    () =>
      events.flatMap((event, index): LogRow[] => {
        if (isBrokenChunkMarker(event))
          return [{ kind: "marker", id: `marker-${event.chunkIndex}`, message: event.message }];
        const text = logText(event);
        if (!text) return [];
        return [
          {
            kind: "log",
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
  const visible = term
    ? rows.filter(
        (row) => row.kind === "log" && `${row.text}\n${row.body ?? ""}`.toLowerCase().includes(term)
      )
    : rows;

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
      <DataTable
        label="Session logs"
        rows={visible}
        loading={isPending && rows.length === 0}
        getRowId={(row) => row.id}
        rowLabel={(row) => (row.kind === "log" ? row.text : row.message)}
        isRowMuted={(row) => row.kind === "marker"}
        columns={[
          {
            id: "time",
            header: "Time",
            width: 168,
            render: (row) => (row.kind === "log" ? <Meta>{row.time}</Meta> : null)
          },
          {
            id: "entry",
            header: "Entry",
            grow: true,
            wrap: true,
            primary: true,
            render: (row) => {
              if (row.kind === "marker") return <Alert tone="warn">{row.message}</Alert>;
              const destructive = isDestructive(row.text);
              return (
                <Stack gap={8}>
                  <Inline gap={8} align="start" wrap={false}>
                    {destructive && <Badge tone="bad">Destructive</Badge>}
                    <Code>{Highlight({ text: row.text, query: search })}</Code>
                  </Inline>
                  {row.body && <Code block code={row.body} wrap maxHeight={240} />}
                </Stack>
              );
            }
          }
        ]}
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon={term ? "search" : "file-text"}
            title={term ? "No logs match your search" : "No logs recorded for this session"}
          />
        }
      />
    </Stack>
  );
};

const SessionBody = ({ session }: { session: TPamSession }) => {
  const { data: accountTypes = [] } = useV4Adapter("pam").useAccountTypes();
  const isActive = session.status === PamSessionStatus.Active;
  const isRdp =
    session.accountType === PamAccountType.Windows ||
    session.accountType === PamAccountType.WindowsAd;
  const duration = formatDuration(session, Date.now());
  const dateOf = (value?: string | null) =>
    value ? format(new Date(value), "MMM d, yyyy h:mm a") : undefined;

  return (
    <Stack gap={24}>
      <DataList
        variant="meta"
        items={[
          ["Status", <SessionStatus key="status" status={session.status} />],
          [
            "Account type",
            accountTypes.find((meta) => meta.type === session.accountType)?.name ??
              session.accountType
          ],
          isMachineSession(session) ? ["Actor", "Machine identity"] : ["Email", session.actorEmail],
          ["Folder", session.folderName || "-"],
          ["Started", dateOf(session.startedAt) ?? "-"],
          ["Ended", dateOf(session.endedAt) ?? "Ongoing"],
          ["Duration", duration ?? "-"],
          ["IP address", <Meta key="ip">{session.actorIp}</Meta>],
          ...(session.reason ? ([["Reason", session.reason]] as const) : [])
        ]}
      />
      <Stack gap={12}>
        <Inline gap={8} align="center">
          <Heading level={3} size="subsection">
            {isRdp ? "Session recording" : "Session logs"}
          </Heading>
          {isActive && (
            <Badge tone="accent" dot>
              Live
            </Badge>
          )}
        </Inline>
        {isRdp ? (
          <EmptyState
            size="sm"
            icon="monitor"
            title="Session replay isn't in v4 yet"
            description="Open this session in the classic app to watch the recording."
          />
        ) : (
          <SessionLogs session={session} />
        )}
      </Stack>
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
  const { can } = pam.useAccountActions(session?.accountId ?? "", Boolean(session?.accountId));
  const canTerminate =
    session?.status === PamSessionStatus.Active &&
    (!session.accountId || can(PamResourcePermissionActions.TerminateSessions));

  return (
    <Sheet open={Boolean(sessionId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{session?.accountName ?? "Session"}</SheetTitle>
          {session && <SheetDescription>{session.actorName}</SheetDescription>}
        </SheetHeader>
        <SheetBody>
          {session && <SessionBody session={session} />}
          {!session && error ? (
            <EmptyState
              size="sm"
              icon="alert"
              title="Could not load this session"
              description={errorMessage(error) || "Please try again."}
            />
          ) : null}
          {!session && !error && (
            <Stack gap={16}>
              <Skeleton height={32} width={240} />
              <Skeleton lines={6} />
            </Stack>
          )}
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {session && canTerminate && (
            <Button variant="destructive" icon="x" onClick={() => onTerminate(session)}>
              Terminate session
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
