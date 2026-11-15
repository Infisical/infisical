import { useEffect, useState } from "react";
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
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { RowLink } from "@infisical/cipher/ui/row-link";
import { Meta } from "@infisical/cipher/ui/text";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";

import { PageTitle } from "@app/components/PageTitle";
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
import { useDebounce } from "@app/hooks/useDebounce";
import { usePamSheetState } from "@app/hooks/usePamSheetState";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { formatDuration, isMachineSession } from "./session-format";
import { SessionSheet } from "./session-sheet";
import { SessionStatus } from "./session-status";

const route = v4Path("/organizations/$orgId/pam/sessions");
const TABLE = "pamSessionsTable";

const AccountCell = ({ session, orgId }: { session: TPamSession; orgId: string }) => {
  const pam = useV4Adapter("pam");
  const { data: accountTypes = [] } = pam.useAccountTypes();
  const { can } = pam.useAccountActions(session.accountId ?? "", Boolean(session.accountId));
  const meta = accountTypes.find((entry) => entry.type === session.accountType);
  return (
    <Inline gap={8} align="center" wrap={false}>
      {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
      {session.accountId && can(PamResourcePermissionActions.ReadAccounts) ? (
        <RowLink
          link={{
            to: v4Path("/organizations/$orgId/$"),
            params: {
              orgId,
              _splat: `pam/accounts/${session.accountType}/${session.accountId}/access`
            }
          }}
        >
          {session.accountName}
        </RowLink>
      ) : (
        <span>{session.accountName}</span>
      )}
    </Inline>
  );
};

const FolderCell = ({ session, orgId }: { session: TPamSession; orgId: string }) => {
  const { can } = useV4Adapter("pam").useFolderActions(
    session.folderId ?? "",
    Boolean(session.folderId)
  );
  if (!session.folderName) return <Meta>-</Meta>;
  if (session.folderId && can(PamResourcePermissionActions.ReadFolder))
    return (
      <RowLink
        link={{
          to: v4Path("/organizations/$orgId/$"),
          params: { orgId, _splat: `pam/accounts/${session.folderId}` }
        }}
      >
        {session.folderName}
      </RowLink>
    );
  return <span>{session.folderName}</span>;
};

const SessionMenu = ({
  session,
  onOpen,
  onTerminate
}: {
  session: TPamSession;
  onOpen: () => void;
  onTerminate: () => void;
}) => {
  const { can } = useV4Adapter("pam").useAccountActions(
    session.accountId ?? "",
    Boolean(session.accountId)
  );
  let reason: string | undefined;
  if (session.status !== PamSessionStatus.Active)
    reason = "Only an active session can be terminated";
  else if (session.accountId && !can(PamResourcePermissionActions.TerminateSessions))
    reason = "You don't have permission to terminate this session";
  return (
    <>
      <DropdownMenuItem onSelect={onOpen}>
        <Icon name="file-text" />
        View details
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={Boolean(reason)}
        description={reason}
        onSelect={onTerminate}
      >
        <Icon name="x" />
        Terminate session
      </DropdownMenuItem>
    </>
  );
};

const TerminateDialog = ({
  session,
  projectId,
  onClose
}: {
  session?: TPamSession;
  projectId: string;
  onClose: () => void;
}) => {
  const terminate = useV4Adapter("pam").useTerminateSession();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(session)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        size="sm"
        tone="danger"
        icon="x"
        confirmText="terminate"
        pending={pending}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Terminate session</AlertDialogTitle>
          <AlertDialogDescription>
            {`${session?.actorName}'s connection to ${session?.accountName} is dropped immediately.`}
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
                await terminate.mutateAsync({ sessionId: session.id, projectId });
                saved("Session terminated");
                onClose();
              } catch (error) {
                failed("Could not terminate the session", error);
              } finally {
                setPending(false);
              }
            }}
          >
            Terminate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const PamSessionsPage = () => {
  const { orgId } = useParams({ from: route });
  const pam = useV4Adapter("pam");
  const { data: projectId = "" } = useV4Adapter("access").usePamProjectId(orgId);
  const sheet = usePamSheetState("sessionId");
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [terminating, setTerminating] = useState<TPamSession>();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );
  const status = filters.find((filter) => filter.field === "status")?.values[0] as
    | PamSessionStatus
    | undefined;

  const { data, isPending } = pam.useSessions(projectId, {
    offset: (page - 1) * perPage,
    limit: perPage,
    search: debouncedSearch.trim() || undefined,
    status
  });
  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;
  const now = Date.now();

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(totalCount / perPage));
    if (!isPending && page > lastPage) setPage(lastPage);
  }, [totalCount, page, perPage, isPending]);

  const isFiltered = Boolean(search.trim() || status);

  const columns: DataTableColumn<TPamSession>[] = [
    {
      id: "user",
      header: "User",
      primary: true,
      width: 240,
      text: (row) => row.actorName,
      render: (row) => row.actorName,
      secondary: (row) => (isMachineSession(row) ? "Machine identity" : row.actorEmail)
    },
    {
      id: "account",
      header: "Account",
      grow: true,
      minWidth: 200,
      render: (row) => <AccountCell session={row} orgId={orgId} />
    },
    {
      id: "folder",
      header: "Folder",
      width: 192,
      render: (row) => <FolderCell session={row} orgId={orgId} />
    },
    {
      id: "started",
      header: "Started",
      width: 184,
      render: (row) => (
        <Meta mono={false}>
          {row.startedAt ? format(new Date(row.startedAt), "MMM d, yyyy h:mm a") : "-"}
        </Meta>
      )
    },
    {
      id: "duration",
      header: "Duration",
      width: 112,
      render: (row) => <Meta>{formatDuration(row, now) ?? "-"}</Meta>
    },
    {
      id: "status",
      header: "Status",
      width: 128,
      render: (row) => <SessionStatus status={row.status} />
    }
  ];

  return (
    <TooltipProvider>
      <PageTitle title="Sessions" />
      <Stack gap={24}>
        <PageHeader
          title="Sessions"
          badges={
            <DocumentationLink
              href="https://infisical.com/docs/documentation/platform/pam/sessions/overview"
              subject="sessions"
            />
          }
        />
        <FilterBar
          label="Session filters"
          fields={[
            {
              key: "status",
              label: "Status",
              type: "select",
              options: [
                { value: PamSessionStatus.Active, label: "Active" },
                { value: PamSessionStatus.Ended, label: "Ended" }
              ]
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
              placeholder="Search by account, user, or folder..."
              slashShortcut
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
          loading={isPending}
          getRowId={(row) => row.id}
          rowLabel={(row) => `${row.actorName} on ${row.accountName}`}
          // v4-check-ignore row-activate-navigates -- opens the session sheet in place; the search param only keeps it addressable
          onRowActivate={(row) => sheet.openSheet(row.id)}
          rowActions={{
            menuLabel: "Session options",
            renderMenu: (row) => (
              <SessionMenu
                session={row}
                onOpen={() => sheet.openSheet(row.id)}
                onTerminate={() => setTerminating(row)}
              />
            )
          }}
          empty={
            isFiltered ? (
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
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                size="sm"
                media="bare"
                icon="terminal"
                title="No sessions yet"
                description="Sessions appear here when users connect to accounts."
              />
            )
          }
          pagination={
            totalCount > 0 ? (
              <Pagination
                label="Session pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={totalCount}
                pageSize={perPage}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={(next) => {
                  setPerPage(next);
                  setPage(1);
                  setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
                }}
              />
            ) : undefined
          }
        />
      </Stack>
      <SessionSheet
        sessionId={sheet.selectedId}
        onClose={sheet.closeSheet}
        onTerminate={setTerminating}
      />
      <TerminateDialog
        session={terminating}
        projectId={projectId}
        onClose={() => setTerminating(undefined)}
      />
    </TooltipProvider>
  );
};
