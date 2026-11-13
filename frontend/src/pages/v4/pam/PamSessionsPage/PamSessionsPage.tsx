import { useMemo, useState, useSyncExternalStore } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { MiddleTruncate } from "@infisical/cipher/ui/middle-truncate";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Highlight, Meta, StatusText } from "@infisical/cipher/ui/text";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";

import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  PamResourcePermissionActions,
  PamSessionStatus,
  type TPamAccountTypeMetadata,
  type TPamSession
} from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { actorSubtitle, formatElapsed, formatStarted, isLive, SESSION_STATUS } from "./status";

const TABLE_PREFERENCE = "pamSessionsTable";
const SESSIONS_DOCS = "https://infisical.com/docs/documentation/platform/pam/sessions/overview";

const tickListeners = new Set<() => void>();
let tickNow = Date.now();
let tickTimer: ReturnType<typeof setInterval> | null = null;
const subscribeToTick = (listener: () => void) => {
  tickListeners.add(listener);
  if (!tickTimer)
    tickTimer = setInterval(() => {
      tickNow = Date.now();
      tickListeners.forEach((notify) => notify());
    }, 1000);
  return () => {
    tickListeners.delete(listener);
    if (tickListeners.size === 0 && tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
  };
};

const LiveDuration = ({ startedAt }: { startedAt: string }) => {
  const now = useSyncExternalStore(subscribeToTick, () => tickNow);
  return <>{formatElapsed(now - new Date(startedAt).getTime())}</>;
};

const Duration = ({ session }: { session: TPamSession }) => {
  if (!session.startedAt) return <Meta mono={false}>Not started</Meta>;
  if (session.status === PamSessionStatus.Active)
    return <LiveDuration startedAt={session.startedAt} />;
  if (!session.endedAt) return <Meta mono={false}>Unknown</Meta>;
  return (
    <>
      {formatElapsed(new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime())}
    </>
  );
};

const SessionMenu = ({
  session,
  onTerminate
}: {
  session: TPamSession;
  onTerminate: (session: TPamSession) => void;
}) => {
  const live = isLive(session);
  const { can, isLoading } = useV4Adapter("pam").useAccountActions(
    session.accountId ?? "",
    live && Boolean(session.accountId)
  );
  let terminateReason: string | undefined;
  if (session.accountId && isLoading) terminateReason = "Checking your permissions";
  else if (session.accountId && !can(PamResourcePermissionActions.TerminateSessions))
    terminateReason = "You can't terminate sessions on this account";

  return (
    <>
      <DropdownMenuItem
        onSelect={() => {
          navigator.clipboard.writeText(session.id);
          toast({ tone: "ok", title: "Session ID copied to clipboard" });
        }}
      >
        <Icon name="copy" />
        Copy session ID
      </DropdownMenuItem>
      {live && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabledReason={terminateReason}
            onSelect={() => onTerminate(session)}
          >
            <Icon name="x" />
            Terminate session
          </DropdownMenuItem>
        </>
      )}
    </>
  );
};

const TerminateSessionDialog = ({
  session,
  onClose
}: {
  session: TPamSession | null;
  onClose: () => void;
}) => {
  const terminate = useV4Adapter("pam").useTerminateSession();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(session)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" icon="x" confirmText="terminate">
        <AlertDialogHeader>
          <AlertDialogTitle>Terminate this session?</AlertDialogTitle>
          <AlertDialogDescription>
            {session
              ? `${session.actorName}'s connection to ${session.accountName} drops immediately.`
              : undefined}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={async () => {
              if (!session) return;
              setPending(true);
              try {
                await terminate.mutateAsync({ sessionId: session.id });
                saved("Session terminated");
                onClose();
              } catch (error) {
                failed("Couldn't terminate the session", error);
              } finally {
                setPending(false);
              }
            }}
          >
            Terminate session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const PamSessionsPage = () => {
  const pam = useV4Adapter("pam");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, 20)
  );
  const [toTerminate, setToTerminate] = useState<TPamSession | null>(null);

  const status = filters.find((filter) => filter.field === "status")?.values[0] as
    | PamSessionStatus
    | undefined;
  const query = debouncedSearch.trim();
  const { data, isPending, error, refetch } = pam.useSessions({
    offset: (page - 1) * perPage,
    limit: perPage,
    search: query || undefined,
    status
  });
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const typeMap = useMemo(
    () => new Map<string, TPamAccountTypeMetadata>(accountTypes.map((meta) => [meta.type, meta])),
    [accountTypes]
  );

  const sessions = error ? [] : (data?.sessions ?? []);
  const totalCount = error ? 0 : (data?.totalCount ?? 0);
  const filtering = Boolean(query) || Boolean(status);

  const columns: DataTableColumn<TPamSession>[] = [
    {
      id: "user",
      header: "User",
      primary: true,
      grow: true,
      minWidth: 200,
      text: (session) => session.actorName,
      render: (session) => (
        <Stack gap={0}>
          <span>
            <Highlight text={session.actorName} query={query} />
          </span>
          <Meta mono={false}>
            <MiddleTruncate text={actorSubtitle(session)} keepEnd={18} />
          </Meta>
        </Stack>
      )
    },
    {
      id: "account",
      header: "Account",
      width: 220,
      text: (session) => session.accountName,
      render: (session) => {
        const meta = typeMap.get(session.accountType);
        return (
          <Inline gap={8} align="center" wrap={false}>
            {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
            <span>
              <Highlight text={session.accountName} query={query} />
            </span>
          </Inline>
        );
      }
    },
    {
      id: "folder",
      header: "Folder",
      width: 180,
      text: (session) => session.folderName ?? "",
      render: (session) =>
        session.folderName ? (
          <Highlight text={session.folderName} query={query} />
        ) : (
          <Meta mono={false}>None</Meta>
        )
    },
    {
      id: "started",
      header: "Started",
      width: 184,
      render: (session) =>
        session.startedAt ? formatStarted(session.startedAt) : <Meta mono={false}>Not started</Meta>
    },
    {
      id: "duration",
      header: "Duration",
      width: 112,
      render: (session) => <Duration session={session} />
    },
    {
      id: "status",
      header: "Status",
      width: 136,
      render: (session) => {
        const config = SESSION_STATUS[session.status];
        if (session.status === PamSessionStatus.Starting)
          return (
            <StatusText tone={config.tone} loading>
              {config.label}
            </StatusText>
          );
        return (
          <StatusText tone={config.tone} icon={config.icon}>
            {config.label}
          </StatusText>
        );
      }
    }
  ];

  const clearFilters = () => {
    setSearch("");
    setFilters([]);
    setPage(1);
  };

  let empty = (
    <EmptyState
      size="sm"
      media="bare"
      icon="monitor"
      title="No sessions yet"
      description="Sessions appear here when someone connects to an account."
    />
  );
  if (error)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="alert"
        title="Couldn't load sessions"
        actions={
          <Button variant="outline" onClick={() => refetch()}>
            Try again
          </Button>
        }
      />
    );
  else if (filtering)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No sessions match your filters"
        actions={
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    );

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Sessions"
          badges={
            <Tooltip content="Documentation">
              <Button variant="ghost" size="icon-lg" asChild>
                <a
                  href={SESSIONS_DOCS}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Sessions documentation (opens in a new tab)"
                >
                  <Icon name="external" />
                </a>
              </Button>
            </Tooltip>
          }
        />
        <FilterBar
          label="Session filters"
          fields={[
            {
              key: "status",
              label: "Status",
              type: "select",
              options: Object.values(PamSessionStatus).map((value) => ({
                value,
                label: SESSION_STATUS[value].label
              }))
            }
          ]}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          search={
            <Input
              icon="search"
              aria-label="Search sessions"
              placeholder="Search by user, account or folder..."
              kbd="/"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
        />
        <DataTable
          label="Sessions"
          rows={sessions}
          columns={columns}
          loading={isPending && !error}
          loadingRows={5}
          getRowId={(session) => session.id}
          rowLabel={(session) => `${session.actorName}, ${session.accountName}`}
          rowActions={{
            menuLabel: "Session options",
            renderMenu: (session) => <SessionMenu session={session} onTerminate={setToTerminate} />
          }}
          empty={empty}
          pagination={
            !isPending && totalCount > 10 ? (
              <Pagination
                label="Session pages"
                variant="compact"
                page={page}
                total={totalCount}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPerPage(size);
                  setPage(1);
                  setUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, size);
                }}
              />
            ) : undefined
          }
        />
      </Stack>
      <TerminateSessionDialog session={toTerminate} onClose={() => setToTerminate(null)} />
    </TooltipProvider>
  );
};
