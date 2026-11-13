import { useState, useSyncExternalStore } from "react";
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
import { DocumentationLinkBadge } from "@infisical/cipher/ui/documentation-link-badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  PamSessionStatus,
  type TPamAccountTypeMetadata,
  type TPamSession
} from "@app/hooks/api/pam";
import { useDebounce } from "@app/hooks/useDebounce";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { isMachineSession, sessionDuration } from "./format";

const route = v4Path("/organizations/$orgId/pam/sessions");
const TABLE_PREFERENCE = "pamSessionsTable";
const DOCS_URL = "https://infisical.com/docs/documentation/platform/pam/sessions/overview";

const STATUS: Record<PamSessionStatus, { label: string; tone: "ok" | "bad" | "neutral" }> = {
  [PamSessionStatus.Starting]: { label: "Starting", tone: "neutral" },
  [PamSessionStatus.Active]: { label: "Active", tone: "ok" },
  [PamSessionStatus.Ended]: { label: "Ended", tone: "neutral" },
  [PamSessionStatus.Terminated]: { label: "Terminated", tone: "bad" }
};

const STATUS_ICON = {
  [PamSessionStatus.Active]: "monitor",
  [PamSessionStatus.Ended]: "check",
  [PamSessionStatus.Terminated]: "x"
} as const;

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

const LiveDuration = ({ session }: { session: TPamSession }) => {
  const now = useSyncExternalStore(subscribeToTick, () => tickNow);
  return <span>{sessionDuration(session, now)}</span>;
};

const Duration = ({ session }: { session: TPamSession }) => {
  if (!session.startedAt) return <Meta>-</Meta>;
  if (session.status === PamSessionStatus.Active) return <LiveDuration session={session} />;
  return <span>{sessionDuration(session, Date.now())}</span>;
};

const Status = ({ status }: { status: PamSessionStatus }) => {
  const { label, tone } = STATUS[status];
  if (status === PamSessionStatus.Starting)
    return (
      <StatusText tone={tone} loading>
        {label}
      </StatusText>
    );
  return (
    <StatusText tone={tone} icon={STATUS_ICON[status]}>
      {label}
    </StatusText>
  );
};

const SessionMenu = ({
  session,
  onCopy,
  onTerminate
}: {
  session: TPamSession;
  onCopy: (session: TPamSession) => void;
  onTerminate: (session: TPamSession) => void;
}) => {
  const pam = useV4Adapter("pam");
  const isActive = session.status === PamSessionStatus.Active;
  const { data: permission, isPending } = pam.useAccountPermission(
    session.accountId ?? "",
    isActive && Boolean(session.accountId)
  );
  const canTerminate =
    !session.accountId ||
    Boolean(
      permission?.permission.can(
        PamResourcePermissionActions.TerminateSessions,
        PamResourcePermissionSub.PamResource
      )
    );

  let terminateReason: string | undefined;
  if (!isActive) terminateReason = "Only an active session can be terminated";
  else if (session.accountId && isPending) terminateReason = "Checking your permissions";
  else if (!canTerminate) terminateReason = "You don't have terminate permission";

  return (
    <>
      <DropdownMenuItem onSelect={() => onCopy(session)}>
        <Icon name="copy" />
        Copy session ID
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={Boolean(terminateReason)}
        description={terminateReason}
        onSelect={() => onTerminate(session)}
      >
        <Icon name="x" />
        Terminate session
      </DropdownMenuItem>
    </>
  );
};

const sessionColumns = (
  typeMap: ReadonlyMap<string, TPamAccountTypeMetadata>
): DataTableColumn<TPamSession>[] => [
  {
    id: "user",
    header: "User",
    primary: true,
    grow: true,
    minWidth: 200,
    text: (session) => session.actorName,
    render: (session) => (
      <Stack gap={0} style={{ minWidth: 0 }}>
        <span>{session.actorName}</span>
        <Meta mono={false}>
          {isMachineSession(session) ? "Machine identity" : session.actorEmail}
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
          <span>{session.accountName}</span>
        </Inline>
      );
    }
  },
  {
    id: "folder",
    header: "Folder",
    width: 184,
    text: (session) => session.folderName ?? "",
    render: (session) => session.folderName ?? <Meta>-</Meta>
  },
  {
    id: "started",
    header: "Started",
    width: 184,
    render: (session) =>
      session.startedAt ? (
        format(new Date(session.startedAt), "MMM d, yyyy h:mm a")
      ) : (
        <Meta mono={false}>Not started</Meta>
      )
  },
  {
    id: "duration",
    header: "Duration",
    width: 104,
    render: (session) => <Duration session={session} />
  },
  {
    id: "status",
    header: "Status",
    width: 136,
    render: (session) => <Status status={session.status} />
  }
];

const SessionsTable = ({
  projectId,
  search,
  status,
  isFiltered,
  onClearFilters,
  page,
  onPageChange,
  onTerminate
}: {
  projectId: string;
  search: string;
  status?: PamSessionStatus;
  isFiltered: boolean;
  onClearFilters: () => void;
  page: number;
  onPageChange: (page: number) => void;
  onTerminate: (session: TPamSession) => void;
}) => {
  const pam = useV4Adapter("pam");
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, 20)
  );
  const { data, isPending, error } = pam.useSessions(projectId, {
    offset: (page - 1) * perPage,
    limit: perPage,
    search: search || undefined,
    status
  });
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const typeMap = new Map<string, TPamAccountTypeMetadata>(
    accountTypes.map((meta) => [meta.type, meta])
  );

  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;

  const copyId = (session: TPamSession) => {
    navigator.clipboard.writeText(session.id);
    toast({ tone: "neutral", title: "Session ID copied to clipboard" });
  };

  const columns = sessionColumns(typeMap);

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
        icon="alert-c"
        title="Couldn't load sessions"
        description={error instanceof Error ? error.message : undefined}
      />
    );
  else if (isFiltered)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No sessions match your filters"
        actions={
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );

  return (
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
        renderMenu: (session) => (
          <SessionMenu session={session} onCopy={copyId} onTerminate={onTerminate} />
        )
      }}
      empty={empty}
      pagination={
        totalCount > 0 ? (
          <Pagination
            label="Session pages"
            variant="compact"
            page={page}
            onPageChange={onPageChange}
            total={totalCount}
            pageSize={perPage}
            pageSizeOptions={[10, 20, 50, 100]}
            onPageSizeChange={(size) => {
              setPerPage(size);
              onPageChange(1);
              setUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, size);
            }}
          />
        ) : undefined
      }
    />
  );
};

export const PamSessionsPage = () => {
  const { orgId } = useParams({ from: route });
  const pam = useV4Adapter("pam");
  const { data: projectId, error: projectError } = useV4Adapter("access").usePamProjectId(orgId);
  const { data: capabilities } = pam.useAccessCapabilities();
  const terminate = pam.useTerminateSession();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [page, setPage] = useState(1);
  const [terminating, setTerminating] = useState<TPamSession>();

  const status = filters.find((filter) => filter.field === "status")?.values[0] as
    | PamSessionStatus
    | undefined;
  const isFiltered = Boolean(search.trim()) || Boolean(status);
  const canView = capabilities?.canViewSessions !== false;

  const clearFilters = () => {
    setSearch("");
    setFilters([]);
    setPage(1);
  };

  let table = (
    <DataTable<TPamSession>
      label="Sessions"
      rows={[]}
      columns={sessionColumns(new Map())}
      loading
      loadingRows={5}
      getRowId={(session) => session.id}
      rowLabel={(session) => session.actorName}
      rowActions={{ menuLabel: "Session options", renderMenu: () => null }}
    />
  );
  if (!canView)
    table = (
      <EmptyState
        size="sm"
        icon="lock"
        title="You don't have access to sessions"
        description="Ask a PAM admin for permission to view sessions."
      />
    );
  else if (projectError)
    table = (
      <EmptyState
        size="sm"
        icon="alert-c"
        title="Couldn't load sessions"
        description={projectError instanceof Error ? projectError.message : undefined}
      />
    );
  else if (projectId)
    table = (
      <SessionsTable
        projectId={projectId}
        search={debouncedSearch.trim()}
        status={status}
        isFiltered={isFiltered}
        onClearFilters={clearFilters}
        page={page}
        onPageChange={setPage}
        onTerminate={setTerminating}
      />
    );

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Sessions"
          badges={<DocumentationLinkBadge href={DOCS_URL} variant="minified" />}
        />
        {canView && (
          <FilterBar
            label="Session filters"
            fields={[
              {
                key: "status",
                label: "Status",
                type: "select",
                options: Object.values(PamSessionStatus).map((value) => ({
                  value,
                  label: STATUS[value].label
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
                maxLength={255}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            }
          />
        )}
        {table}
      </Stack>
      <AlertDialog
        open={Boolean(terminating)}
        onOpenChange={(open) => !open && setTerminating(undefined)}
      >
        <AlertDialogContent tone="danger" icon="x" confirmText="terminate">
          <AlertDialogHeader>
            <AlertDialogTitle>Terminate this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {terminating
                ? `${terminating.actorName}'s connection to ${terminating.accountName} drops immediately.`
                : undefined}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={terminate.isPending}
              onClick={async () => {
                if (!terminating || !projectId) return;
                try {
                  await terminate.mutateAsync({ sessionId: terminating.id, projectId });
                  saved("Session terminated");
                  setTerminating(undefined);
                } catch (error) {
                  failed("Failed to terminate session", error);
                }
              }}
            >
              Terminate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};
