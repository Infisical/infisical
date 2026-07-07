import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Activity, Ban, SearchIcon, Video } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  PamAccountType,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  PamSessionStatus,
  useListPamSessions,
  usePamAccountActions,
  usePamAccountTypeMap,
  usePamFolderActions,
  useTerminatePamSession
} from "@app/hooks/api/pam";
import { usePamAccountPermission } from "@app/hooks/api/pam/queries";
import { TPamSession } from "@app/hooks/api/pam/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useDebounce } from "@app/hooks/useDebounce";
import { usePamSheetState } from "@app/hooks/usePamSheetState";

import { LiveDot } from "../components/LiveDot";
import { PamDocsUrls } from "../pam-docs-urls";
import { SessionDetailSheet } from "./components/SessionDetailSheet";
import { capitalize, formatDuration, STATUS_BADGE } from "./constants";

const TerminateCell = ({
  session,
  onTerminate
}: {
  session: TPamSession;
  onTerminate: (session: TPamSession, e?: React.MouseEvent) => void;
}) => {
  const { data: perm } = usePamAccountPermission(session.accountId ?? "");
  const canTerminate = perm?.permission.can(
    PamResourcePermissionActions.TerminateSessions,
    PamResourcePermissionSub.PamResource
  );

  if (session.status !== PamSessionStatus.Active || !canTerminate) return null;

  return (
    <Button variant="danger" size="xs" onClick={(e) => onTerminate(session, e)}>
      <Ban className="mr-1 size-3" />
      Terminate
    </Button>
  );
};

const AccountNameCell = ({ session, search }: { session: TPamSession; search: string }) => {
  const { currentOrg } = useOrganization();
  const { can } = usePamAccountActions(session.accountId ?? "", Boolean(session.accountId));
  const name = <HighlightText text={session.accountName} highlight={search} />;

  if (session.accountId && can(PamResourcePermissionActions.ReadAccounts)) {
    return (
      <Link
        to="/organizations/$orgId/pam/accounts"
        params={{ orgId: currentOrg.id }}
        search={{ accountId: session.accountId }}
        onClick={(e) => e.stopPropagation()}
        className="text-sm hover:underline"
      >
        {name}
      </Link>
    );
  }

  return <span className="text-sm">{name}</span>;
};

const FolderNameCell = ({ session, search }: { session: TPamSession; search: string }) => {
  const { currentOrg } = useOrganization();
  const { can } = usePamFolderActions(session.folderId ?? "", Boolean(session.folderId));

  if (!session.folderName) return <span className="text-muted">—</span>;

  const name = <HighlightText text={session.folderName} highlight={search} />;

  if (session.folderId && can(PamResourcePermissionActions.ReadFolder)) {
    return (
      <Link
        to="/organizations/$orgId/pam/accounts"
        params={{ orgId: currentOrg.id }}
        search={{ folderId: session.folderId }}
        onClick={(e) => e.stopPropagation()}
        className="hover:underline"
      >
        {name}
      </Link>
    );
  }

  return name;
};

export const PamSessionsPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { map: accountTypeMap } = usePamAccountTypeMap();

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const sessionSheet = usePamSheetState("sessionId");
  const [sessionToTerminate, setSessionToTerminate] = useState<TPamSession | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("pamSessionsTable", PreferenceKey.PerPage, 20)
  );

  const offset = (page - 1) * perPage;

  const { data, isPending } = useListPamSessions(currentProject.id, {
    offset,
    limit: perPage,
    search: debouncedSearch || undefined,
    status: statusFilter === "all" ? undefined : (statusFilter as PamSessionStatus)
  });
  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;
  const terminateSession = useTerminatePamSession();

  const query = search.trim().toLowerCase();
  const displayedSessions = query
    ? sessions.filter((session) =>
        `${session.actorName} ${session.actorEmail} ${session.accountName} ${session.folderName ?? ""}`
          .toLowerCase()
          .includes(query)
      )
    : sessions;

  const requestTerminate = (session: TPamSession, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSessionToTerminate(session);
  };

  const confirmTerminate = async () => {
    if (!sessionToTerminate) return;
    await terminateSession.mutateAsync({
      sessionId: sessionToTerminate.id,
      projectId: currentProject.id
    });
    createNotification({ text: "Session terminated", type: "success" });
    setSessionToTerminate(null);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Sessions" })}</title>
      </Helmet>
      <PageHeader scope={ProjectType.PAM} icon={Video} title="Sessions" />

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>
            Sessions
            <DocumentationLinkBadge href={PamDocsUrls.sessions.overview} />
          </CardTitle>
          <CardDescription>Monitor and manage active and historical sessions.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex-1">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={handleSearchChange}
                placeholder="Search by account, user, or folder..."
              />
            </InputGroup>
          </div>
          <Select value={statusFilter} onValueChange={handleStatusChange}>
            <SelectTrigger>
              <Activity className="mr-1.5 size-4 text-muted" />
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value={PamSessionStatus.Active}>Active</SelectItem>
              <SelectItem value={PamSessionStatus.Ended}>Ended</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>

        {!isPending && displayedSessions.length === 0 ? (
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {search || statusFilter !== "all"
                    ? "No sessions match your filters"
                    : "No sessions found"}
                </EmptyTitle>
                <EmptyDescription>
                  {search || statusFilter !== "all"
                    ? "Try adjusting your search or filters."
                    : "Sessions will appear here when users connect to resources."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Folder</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i + 1}`}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <TableCell key={`cell-${j + 1}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {displayedSessions.map((session) => {
                const statusConfig = STATUS_BADGE[session.status];
                const accountTypeDetails =
                  session.accountType && accountTypeMap[session.accountType as PamAccountType];

                return (
                  <TableRow key={session.id} onClick={() => sessionSheet.openSheet(session.id)}>
                    <TableCell className="h-[50px]">
                      <div className="flex flex-col">
                        <span className="text-sm">
                          <HighlightText text={session.actorName} highlight={search} />
                        </span>
                        <span className="text-xs text-muted">
                          <HighlightText text={session.actorEmail} highlight={search} />
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {accountTypeDetails && (
                          <img
                            src={`/images/integrations/${accountTypeDetails.icon}`}
                            alt={accountTypeDetails.name}
                            className="size-5 shrink-0 rounded-sm"
                          />
                        )}
                        <AccountNameCell session={session} search={search} />
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <FolderNameCell session={session} search={search} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {session.startedAt ? (
                        format(new Date(session.startedAt), "MMM d, yyyy h:mm a")
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {session.startedAt ? (
                        formatDuration(session)
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusConfig.variant}>
                        {session.status === PamSessionStatus.Active && <LiveDot />}
                        {capitalize(session.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <TerminateCell session={session} onTerminate={requestTerminate} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {totalCount > 0 && (
          <CardContent>
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={(newPerPage) => {
                setPerPage(newPerPage);
                setPage(1);
                setUserTablePreference("pamSessionsTable", PreferenceKey.PerPage, newPerPage);
              }}
            />
          </CardContent>
        )}
      </Card>

      <SessionDetailSheet
        sessionId={sessionSheet.selectedId}
        isOpen={sessionSheet.isOpen}
        onOpenChange={(open) => {
          if (!open) sessionSheet.closeSheet();
        }}
        onTerminate={requestTerminate}
      />

      <DeleteActionModal
        isOpen={!!sessionToTerminate}
        onChange={(open) => {
          if (!open) setSessionToTerminate(null);
        }}
        title="Terminate Session"
        subTitle="Are you sure you want to terminate this session? The user's connection will be immediately dropped."
        deleteKey="terminate"
        buttonText="Terminate"
        onDeleteApproved={confirmTerminate}
      />
    </div>
  );
};
