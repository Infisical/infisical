import { useEffect, useMemo, useState } from "react";
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
import { Highlight, Meta, StatusText } from "@infisical/cipher/ui/text";
import { TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { useParams } from "@tanstack/react-router";
import { isAxiosError } from "axios";
import { BanIcon } from "lucide-react";

import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { PamResourcePermissionActions, PamSessionStatus } from "@app/hooks/api/pam";
import type { TPamSession } from "@app/hooks/api/pam/types";
import { useDebounce } from "@app/hooks/useDebounce";
import { ProviderIcon } from "@app/pages/v4/components/provider-icon";

import { errorMessage, failed, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import {
  formatSessionDate,
  formatSessionDuration,
  isMachineSession,
  SESSION_STATUS
} from "./format";

const route = v4Path("/organizations/$orgId/pam/sessions");
const TABLE_PREFERENCE = "pamSessionsTable";
const STATUS_OPTIONS = Object.values(PamSessionStatus).map((status) => ({
  value: status,
  label: SESSION_STATUS[status].label
}));

const Muted = ({ children }: { children: string }) => <Meta mono={false}>{children}</Meta>;

const useNow = () => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

const TerminateItem = ({
  session,
  onSelect
}: {
  session: TPamSession;
  onSelect: (session: TPamSession) => void;
}) => {
  const { can, isLoading } = useV4Adapter("pam").useAccountActions(
    session.accountId ?? "",
    Boolean(session.accountId)
  );
  let reason: string | undefined;
  if (session.status !== PamSessionStatus.Active) reason = "Only active sessions can be terminated";
  else if (session.accountId && isLoading) reason = "Checking your permissions...";
  else if (session.accountId && !can(PamResourcePermissionActions.TerminateSessions))
    reason = "You can't terminate sessions on this account";
  return (
    <DropdownMenuItem
      variant="destructive"
      disabledReason={reason}
      onSelect={() => onSelect(session)}
    >
      <Icon icon={BanIcon} />
      Terminate session
    </DropdownMenuItem>
  );
};

export const PamSessionsPage = () => {
  const { orgId } = useParams({ from: route });
  const pam = useV4Adapter("pam");
  const now = useNow();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE_PREFERENCE, PreferenceKey.PerPage, 20)
  );
  const [terminating, setTerminating] = useState<TPamSession>();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const terminate = pam.useTerminateSession();
  const { data: accountTypes = [] } = pam.useAccountTypes();

  const status = filters.find((filter) => filter.field === "status")?.values[0] as
    | PamSessionStatus
    | undefined;
  const query = debouncedSearch.trim();
  const { data, isPending, error, refetch } = pam.useSessions(orgId, {
    offset: (page - 1) * perPage,
    limit: perPage,
    search: query || undefined,
    status
  });
  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;

  useEffect(() => {
    if (data && page > 1 && (page - 1) * perPage >= totalCount)
      setPage(Math.max(1, Math.ceil(totalCount / perPage)));
  }, [data, page, perPage, totalCount]);

  const typeMap = useMemo(
    () => new Map(accountTypes.map((meta) => [meta.type as string, meta])),
    [accountTypes]
  );

  const columns: DataTableColumn<TPamSession>[] = [
    {
      id: "user",
      header: "User",
      primary: true,
      grow: true,
      text: (session) => session.actorName,
      render: (session) => <Highlight text={session.actorName} query={query} />
    },
    {
      id: "email",
      header: "Email",
      grow: true,
      text: (session) => (isMachineSession(session) ? "Machine identity" : session.actorEmail),
      render: (session) =>
        isMachineSession(session) ? (
          <Muted>Machine identity</Muted>
        ) : (
          <Highlight text={session.actorEmail} query={query} />
        )
    },
    {
      id: "account",
      header: "Account",
      grow: true,
      minWidth: 180,
      text: (session) => session.accountName,
      render: (session) => {
        const meta = typeMap.get(session.accountType);
        return (
          <Inline gap={8} align="center" wrap={false}>
            {meta && <ProviderIcon icon={meta.icon} alt={meta.name} size="sm" />}
            <span className="truncate">
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
          <Muted>None</Muted>
        )
    },
    {
      id: "started",
      header: "Started",
      width: 176,
      render: (session) =>
        session.startedAt ? formatSessionDate(session.startedAt) : <Muted>Not started</Muted>
    },
    {
      id: "duration",
      header: "Duration",
      width: 104,
      render: (session) => formatSessionDuration(session, now) ?? <Muted>None</Muted>
    },
    {
      id: "status",
      header: "Status",
      width: 136,
      render: (session) => {
        const meta = SESSION_STATUS[session.status];
        return session.status === PamSessionStatus.Starting ? (
          <StatusText tone={meta.tone} loading>
            {meta.label}
          </StatusText>
        ) : (
          <StatusText tone={meta.tone} icon={meta.icon}>
            {meta.label}
          </StatusText>
        );
      }
    }
  ];

  const filtering = Boolean(query) || Boolean(status);
  const clearFilters = () => {
    setSearch("");
    setFilters([]);
    setPage(1);
  };

  const confirmTerminate = async () => {
    if (!terminating) return;
    try {
      await terminate.mutateAsync({ sessionId: terminating.id });
      toast({ tone: "ok", title: "Session terminated" });
      setConfirmOpen(false);
    } catch (terminateError) {
      failed("Failed to terminate session", terminateError);
    }
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
  if (error && !data)
    empty = (
      <EmptyState
        size="sm"
        media="bare"
        icon="alert"
        title="Couldn't load sessions"
        description={
          isAxiosError(error) && error.response?.data?.message
            ? errorMessage(error)
            : "Something went wrong on our side. Try again in a moment."
        }
        actions={
          <Button variant="outline" icon="sync" onClick={() => refetch()}>
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
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pam/sessions/overview" />
          }
        />
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
          rows={error && !data ? [] : sessions}
          columns={columns}
          loading={isPending && !error}
          loadingRows={5}
          getRowId={(session) => session.id}
          rowLabel={(session) => `${session.actorName}, ${session.accountName}`}
          rowActions={{
            menuLabel: "Session options",
            renderMenu: (session) => (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(session.id);
                    toast({ tone: "neutral", title: "Copied session ID to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy session ID
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <TerminateItem
                  session={session}
                  onSelect={(selected) => {
                    setTerminating(selected);
                    setConfirmOpen(true);
                  }}
                />
              </>
            )
          }}
          empty={empty}
          pagination={
            totalCount > 10 ? (
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
      <AlertDialog open={confirmOpen && Boolean(terminating)} onOpenChange={setConfirmOpen}>
        <AlertDialogContent tone="danger" icon="alert" confirmText="terminate">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Terminate ${terminating?.actorName}'s session?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {`Their connection to ${terminating?.accountName} drops right away.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={terminate.isPending}
              onClick={confirmTerminate}
            >
              Terminate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
};
