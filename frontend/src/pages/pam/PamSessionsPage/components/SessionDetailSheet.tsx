import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ChevronRightIcon,
  ClipboardListIcon,
  SearchIcon,
  SquareIcon,
  TerminalIcon
} from "lucide-react";

import {
  Badge,
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Sheet,
  SheetContent,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import {
  PAM_ACCOUNT_TYPE_MAP,
  PamAccountType,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  PamSessionStatus,
  useGetPamSessionLogs
} from "@app/hooks/api/pam";
import { usePamAccountPermission } from "@app/hooks/api/pam/queries";
import { TPamSession, TPamSessionLog } from "@app/hooks/api/pam/types";

import { capitalize, formatDuration, STATUS_BADGE } from "../constants";

type Props = {
  session: TPamSession | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTerminate: (session: TPamSession) => void;
};

const getLogText = (log: TPamSessionLog): string => {
  if ("input" in log && "output" in log) {
    return [log.input, log.output].filter(Boolean).join(" ");
  }
  if ("data" in log) {
    return log.data;
  }
  if ("method" in log) {
    return `${log.method} ${log.url}`;
  }
  if ("status" in log) {
    return `Response ${log.status}`;
  }
  return "";
};

const DESTRUCTIVE_PREFIXES = ["DROP ", "DELETE ", "TRUNCATE ", "ALTER "];

const isDestructiveQuery = (text: string): boolean => {
  const upper = text.trimStart().toUpperCase();
  return DESTRUCTIVE_PREFIXES.some((prefix) => upper.startsWith(prefix));
};

const LogEntry = ({ log }: { log: TPamSessionLog }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const text = getLogText(log);

  const textRef = useCallback(
    (node: HTMLParagraphElement | null) => {
      if (node && !expanded) {
        setOverflows(node.scrollWidth > node.clientWidth);
      }
    },
    [expanded]
  );

  if (!text) return null;

  const destructive = isDestructiveQuery(text);
  const toggleExpand = overflows ? () => setExpanded((prev) => !prev) : undefined;

  const content = (
    <>
      <p className="mb-1 text-xs text-muted">
        {format(new Date(log.timestamp), "M/d/yyyy, h:mm:ss a")}
      </p>
      <div className="flex items-start gap-1.5">
        {overflows && (
          <ChevronRightIcon
            className={`mt-0.5 size-3.5 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        )}
        <p
          ref={textRef}
          className={`font-mono text-xs ${expanded ? "break-all whitespace-pre-wrap" : "truncate"} ${destructive ? "text-red-400" : ""}`}
        >
          {text}
        </p>
      </div>
    </>
  );

  if (overflows) {
    return (
      <button
        type="button"
        className="w-full cursor-pointer border-b border-border px-4 py-3 text-left transition-colors hover:bg-white/[0.06]"
        onClick={toggleExpand}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="border-b border-border px-4 py-3">
      {content}
    </div>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div>
    <p className="text-xs font-medium tracking-wider text-muted uppercase">{label}</p>
    <p className="mt-0.5 text-sm">{value || "-"}</p>
  </div>
);

export const SessionDetailSheet = ({ session, isOpen, onOpenChange, onTerminate }: Props) => {
  const [logSearch, setLogSearch] = useState("");

  useEffect(() => {
    setLogSearch("");
  }, [session?.id]);

  const { data: accountPerm } = usePamAccountPermission(session?.accountId ?? "");
  const canTerminate = accountPerm?.permission.can(
    PamResourcePermissionActions.TerminateSessions,
    PamResourcePermissionSub.PamResource
  );

  const {
    logs,
    isLoading: isLogsLoading,
    hasMore,
    loadMore,
    isLoadingMore
  } = useGetPamSessionLogs(
    session?.id ?? "",
    session?.status === PamSessionStatus.Active,
    isOpen && !!session
  );

  const filteredLogs = useMemo(() => {
    if (!logSearch.trim()) return logs;
    const term = logSearch.trim().toLowerCase();
    return logs.filter((log) => getLogText(log).toLowerCase().includes(term));
  }, [logs, logSearch]);

  if (!session) return null;

  const statusConfig = STATUS_BADGE[session.status];
  const accountTypeDetails =
    session.accountType && PAM_ACCOUNT_TYPE_MAP[session.accountType as PamAccountType];
  const shortId = session.id.slice(0, 8);

  const handleTerminate = () => {
    onTerminate(session);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 p-0 sm:max-w-5xl">
        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border p-6">
            <div className="flex size-12 items-center justify-center rounded-md bg-bunker-700">
              {accountTypeDetails ? (
                <img
                  src={`/images/integrations/${accountTypeDetails.image}`}
                  alt={accountTypeDetails.name}
                  className="size-7 rounded-sm"
                />
              ) : (
                <TerminalIcon className="size-6 text-muted" />
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div>
                <h3 className="text-base font-semibold">
                  Session · <span className="font-mono">{shortId}</span>
                </h3>
                <p className="text-xs text-muted">{session.actorName}</p>
              </div>
              <Badge variant={statusConfig.variant}>
                {session.status === PamSessionStatus.Active && (
                  <span className="mr-1.5 inline-block size-1.5 rounded-full bg-product-pam" />
                )}
                {capitalize(session.status)}
              </Badge>
            </div>

            <div className="flex flex-col gap-4 border-t border-border pt-4">
              <InfoRow
                label="Account"
                value={
                  accountTypeDetails
                    ? `${session.accountName} (${accountTypeDetails.name})`
                    : session.accountName
                }
              />
              <InfoRow label="Folder" value={session.folderName} />
              <InfoRow label="Host" value={session.selectedHost ?? session.resourceName} />
              <InfoRow
                label="Started"
                value={
                  session.startedAt
                    ? format(new Date(session.startedAt), "MMM d, yyyy HH:mm:ss")
                    : null
                }
              />
              <InfoRow
                label="Ended"
                value={
                  session.endedAt
                    ? format(new Date(session.endedAt), "MMM d, yyyy HH:mm:ss")
                    : "Ongoing"
                }
              />
              <InfoRow label="Duration" value={formatDuration(session)} />
              <InfoRow label="IP Address" value={session.actorIp} />
              {session.reason && <InfoRow label="Reason" value={session.reason} />}
              {session.status === PamSessionStatus.Active && canTerminate && (
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={handleTerminate}
                >
                  <SquareIcon className="mr-1.5 size-3.5" />
                  Terminate session
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden">
            <Tabs defaultValue="logs" className="flex flex-1 flex-col overflow-hidden">
              <TabsList variant="pam" className="border-b border-border px-4 pt-4">
                <TabsTrigger value="logs">
                  <ClipboardListIcon className="mr-1.5 size-3.5" />
                  Session Logs
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="logs"
                className="flex flex-1 flex-col overflow-hidden p-4 data-[state=active]:mt-0"
              >
                <div className="mb-3">
                  <InputGroup>
                    <InputGroupAddon>
                      <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="Search logs..."
                    />
                  </InputGroup>
                </div>

                <div className="flex-1 overflow-y-auto rounded-md border border-border bg-bunker-800">
                  {isLogsLoading && (
                    <div className="flex flex-col gap-2 p-4">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={`log-skeleton-${i + 1}`} className="h-4 w-full" />
                      ))}
                    </div>
                  )}
                  {!isLogsLoading && filteredLogs.length === 0 && (
                    <div className="flex items-center justify-center p-8 text-sm text-muted">
                      {logSearch
                        ? "No logs match your search"
                        : "No logs recorded for this session"}
                    </div>
                  )}
                  {!isLogsLoading && filteredLogs.length > 0 && (
                    <div>
                      {filteredLogs.map((log, i) => (
                        <LogEntry key={`log-${log.timestamp}-${i + 1}`} log={log} />
                      ))}
                      {hasMore && (
                        <div className="flex justify-center p-3">
                          <Button
                            variant="outline"
                            size="xs"
                            isPending={isLoadingMore}
                            onClick={loadMore}
                          >
                            Load more
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
