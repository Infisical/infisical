import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { SearchIcon, SquareIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { DeleteActionModal, PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  PAM_ACCOUNT_TYPE_MAP,
  PamAccountType,
  PamSessionStatus,
  useListPamSessions,
  useTerminatePamSession
} from "@app/hooks/api/pam";
import { TPamSession } from "@app/hooks/api/pam/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { SessionDetailSheet } from "./components/SessionDetailSheet";
import { capitalize, formatDuration, STATUS_BADGE } from "./constants";

export const PamSessionsPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [activeOnly, setActiveOnly] = useState(false);
  const [selectedSession, setSelectedSession] = useState<TPamSession | null>(null);
  const [sessionToTerminate, setSessionToTerminate] = useState<TPamSession | null>(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const offset = (page - 1) * perPage;

  const { data, isPending } = useListPamSessions(currentProject.id, {
    offset,
    limit: perPage,
    search: debouncedSearch || undefined,
    status: activeOnly ? PamSessionStatus.Active : undefined
  });
  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;
  const terminateSession = useTerminatePamSession();

  useEffect(() => {
    if (!selectedSession) return;
    const fresh = sessions.find((s) => s.id === selectedSession.id);
    if (fresh) {
      setSelectedSession(fresh);
    }
  }, [sessions]);

  const requestTerminate = (session: TPamSession, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSessionToTerminate(session);
  };

  const confirmTerminate = async () => {
    if (!sessionToTerminate) return;
    try {
      await terminateSession.mutateAsync({
        sessionId: sessionToTerminate.id,
        projectId: currentProject.id
      });
      createNotification({ text: "Session terminated", type: "success" });
      setSessionToTerminate(null);
    } catch {
      createNotification({ text: "Failed to terminate session", type: "error" });
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  const handleActiveOnlyChange = (checked: boolean) => {
    setActiveOnly(checked);
    setPage(1);
  };

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Sessions" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.PAM}
        title="Sessions"
        description="Monitor and manage active and historical sessions."
      />

      <div className="mb-4 flex items-center gap-4">
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
        {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-muted">
          <Switch checked={activeOnly} onCheckedChange={handleActiveOnlyChange} size="sm" />
          Only show active sessions
        </label>
      </div>

      {!isPending && sessions.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>
              {search || activeOnly ? "No sessions match your filters" : "No sessions found"}
            </EmptyTitle>
            <EmptyDescription>
              {search || activeOnly
                ? "Try adjusting your search or filters."
                : "Sessions will appear here when users connect to resources."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
            {sessions.map((session) => {
              const statusConfig = STATUS_BADGE[session.status];
              const accountTypeDetails =
                session.accountType && PAM_ACCOUNT_TYPE_MAP[session.accountType as PamAccountType];

              return (
                <TableRow key={session.id} onClick={() => setSelectedSession(session)}>
                  <TableCell className="h-[50px]">{session.actorName}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {accountTypeDetails && (
                        <img
                          src={`/images/integrations/${accountTypeDetails.image}`}
                          alt={accountTypeDetails.name}
                          className="size-5 shrink-0 rounded-sm"
                        />
                      )}
                      <span className="text-sm">{session.accountName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{session.folderName ?? "-"}</TableCell>
                  <TableCell>
                    {session.startedAt ? (
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {format(new Date(session.startedAt), "h:mm:ss a")}
                        </span>
                        <span className="text-xs text-muted">
                          {format(new Date(session.startedAt), "M/d/yyyy")}
                        </span>
                      </div>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{formatDuration(session)}</TableCell>
                  <TableCell>
                    <Badge variant={statusConfig.variant}>
                      {statusConfig.dot && (
                        <span className="mr-1.5 inline-block size-1.5 rounded-full bg-product-pam" />
                      )}
                      {capitalize(session.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {session.status === PamSessionStatus.Active && (
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={(e) => requestTerminate(session, e)}
                      >
                        <SquareIcon className="mr-1 size-3" />
                        Terminate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {totalCount > 0 && (
        <Pagination
          count={totalCount}
          page={page}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={(newPerPage) => {
            setPerPage(newPerPage);
            setPage(1);
          }}
        />
      )}

      <SessionDetailSheet
        session={selectedSession}
        isOpen={!!selectedSession}
        onOpenChange={(open) => {
          if (!open) setSelectedSession(null);
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
