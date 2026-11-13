import { useMemo, useState } from "react";
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
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Highlight, StatusText } from "@infisical/cipher/ui/text";
import { useParams } from "@tanstack/react-router";

import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  PamResourcePermissionActions,
  PamSessionStatus,
  type TPamSession
} from "@app/hooks/api/pam";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { useDebounced } from "../../access/org/use-debounced";
import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import {
  formatSessionDate,
  formatSessionDuration,
  isMachineIdentitySession,
  SESSION_STATUS
} from "./status";

const route = v4Path("/organizations/$orgId/pam/sessions");
const TABLE_PREFERENCE = "pamSessionsTable";

const STATUS_OPTIONS = [
  PamSessionStatus.Active,
  PamSessionStatus.Starting,
  PamSessionStatus.Ended,
  PamSessionStatus.Terminated
].map((status) => ({ value: status, label: SESSION_STATUS[status].label }));

const sessionLabel = (session: TPamSession) => `${session.actorName} on ${session.accountName}`;

const TerminateAction = ({
  session,
  onTerminate
}: {
  session: TPamSession;
  onTerminate: (session: TPamSession) => void;
}) => {
  const isActive = session.status === PamSessionStatus.Active;
  const { can } = useV4Adapter("pam").useAccountActions(
    session.accountId ?? "",
    isActive && Boolean(session.accountId)
  );
  if (!isActive) return null;
  if (session.accountId && !can(PamResourcePermissionActions.TerminateSessions)) return null;
  return (
    <Button variant="danger-ghost" size="sm" onClick={() => onTerminate(session)}>
      Terminate
      <span className="sr-only">{` session for ${sessionLabel(session)}`}</span>
    </Button>
  );
};

const TerminateSessionDialog = ({
  projectId,
  session,
  onClose
}: {
  projectId: string;
  session: TPamSession | null;
  onClose: () => void;
}) => {
  const terminate = useV4Adapter("pam").useTerminateSession();
  return (
    <AlertDialog open={Boolean(session)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" icon="x" confirmText="terminate">
        <AlertDialogHeader>
          <AlertDialogTitle>Terminate this session?</AlertDialogTitle>
          <AlertDialogDescription>
            {session
              ? `${session.actorName}'s connection to ${session.accountName} drops immediately.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={terminate.isPending}
            onClick={async () => {
              if (!session) return;
              try {
                await terminate.mutateAsync({ sessionId: session.id, projectId });
                saved("Session terminated");
                onClose();
              } catch (error) {
                failed("Failed to terminate session", error);
              }
            }}
          >
            Terminate Session
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const PamSessionsPage = () => {
  const { orgId } = useParams({ from: route });
  const pam = useV4Adapter("pam");
  const project = useV4Adapter("access").usePamProjectId(orgId);
  const projectId = project.data ?? "";
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search.trim());
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, 20)
  );
  const [sessionToTerminate, setSessionToTerminate] = useState<TPamSession | null>(null);

  const status = filters.find((filter) => filter.field === "status")?.values[0];
  const sessions = pam.useSessions(
    projectId,
    { offset: (page - 1) * perPage, limit: perPage, search: debouncedSearch || undefined, status },
    { enabled: Boolean(projectId) }
  );
  const error = project.error ?? sessions.error;
  const isPending = !error && (project.isPending || sessions.isPending);
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const typeMap = useMemo(
    () => new Map(accountTypes.map((meta) => [meta.type as string, meta])),
    [accountTypes]
  );
  const totalCount = sessions.data?.totalCount ?? 0;

  const columns: DataTableColumn<TPamSession>[] = [
    {
      id: "user",
      header: "User",
      primary: true,
      grow: true,
      text: (session) => session.actorName,
      render: (session) => <Highlight text={session.actorName} query={debouncedSearch} />
    },
    {
      id: "email",
      header: "Email",
      grow: true,
      render: (session) =>
        isMachineIdentitySession(session) ? (
          "Machine identity"
        ) : (
          <Highlight text={session.actorEmail} query={debouncedSearch} />
        )
    },
    {
      id: "account",
      header: "Account",
      width: 176,
      text: (session) => session.accountName,
      render: (session) => {
        const meta = typeMap.get(session.accountType);
        return (
          <Inline gap={8} align="center" wrap={false}>
            {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
            <span>
              <Highlight text={session.accountName} query={debouncedSearch} />
            </span>
          </Inline>
        );
      }
    },
    {
      id: "folder",
      header: "Folder",
      width: 160,
      text: (session) => session.folderName ?? "",
      render: (session) =>
        session.folderName ? (
          <Highlight text={session.folderName} query={debouncedSearch} />
        ) : (
          "None"
        )
    },
    {
      id: "started",
      header: "Started",
      width: 184,
      render: (session) =>
        session.startedAt ? formatSessionDate(session.startedAt) : "Not started"
    },
    {
      id: "duration",
      header: "Duration",
      width: 88,
      render: (session) =>
        session.startedAt
          ? formatSessionDuration(
              session.startedAt,
              session.status === PamSessionStatus.Active ? null : session.endedAt
            )
          : "None"
    },
    {
      id: "status",
      header: "Status",
      width: 120,
      render: (session) => {
        const { label, tone, icon } = SESSION_STATUS[session.status];
        return (
          <StatusText tone={tone} icon={icon}>
            {label}
          </StatusText>
        );
      }
    },
    {
      id: "actions",
      header: "Actions",
      hideHeader: true,
      actions: true,
      width: 112,
      render: (session) => <TerminateAction session={session} onTerminate={setSessionToTerminate} />
    }
  ];

  const isFiltering = Boolean(search.trim()) || Boolean(status);

  let empty = (
    <EmptyState
      size="sm"
      media="bare"
      icon="monitor"
      title="No sessions yet"
      description="Sessions appear here when someone connects to an account."
    />
  );
  if (error) {
    empty = <EmptyState size="sm" media="bare" icon="alert" title="Couldn't load sessions" />;
  } else if (isFiltering) {
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No sessions match your filters"
        actions={
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setFilters([]);
              setPage(1);
            }}
          >
            Clear Filters
          </Button>
        }
      />
    );
  }

  return (
    <Stack gap={24}>
      <PageHeader title="Sessions" />
      <FilterBar
        label="Session filters"
        fields={[{ key: "status", label: "Status", type: "select", options: STATUS_OPTIONS }]}
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setPage(1);
        }}
        search={
          <Input
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
        rows={error ? [] : (sessions.data?.sessions ?? [])}
        columns={columns}
        loading={isPending}
        loadingRows={5}
        getRowId={(session) => session.id}
        rowLabel={sessionLabel}
        empty={empty}
        pagination={
          !isPending && !error && totalCount > 10 ? (
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
      <TerminateSessionDialog
        projectId={projectId}
        session={sessionToTerminate}
        onClose={() => setSessionToTerminate(null)}
      />
    </Stack>
  );
};
