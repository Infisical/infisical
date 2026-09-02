import { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { BotIcon, MoreHorizontalIcon, SearchIcon, TicketIcon, UserIcon } from "lucide-react";

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  OverflowBadgeList,
  PageHeader,
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
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  useListAgentVaultAccessBundles,
  useListAgentVaultSessions
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultAccessBundleListItem,
  TAgentVaultMintedSession,
  TAgentVaultSession
} from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { CreateSessionSheet } from "./components/CreateSessionSheet";
import { RevokeSessionDialog } from "./components/RevokeSessionDialog";
import { SessionCreatedDialog } from "./components/SessionCreatedDialog";
import { SessionExpiry } from "./components/SessionExpiry";
import { SessionStatusBadge } from "./components/SessionStatusBadge";

const ALL_STATUSES = "all";

export const AgentVaultSessionsPage = () => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<AgentVaultSessionStatus | typeof ALL_STATUSES>(
    ALL_STATUSES
  );
  const [scope, setScope] = useState(AgentVaultSessionScope.All);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultSessionsTable", PreferenceKey.PerPage, 20)
  );
  const [sessionToRevoke, setSessionToRevoke] = useState<TAgentVaultSession | null>(null);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const navigate = useNavigate();
  const { accessBundleId: initialAccessBundleId } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/sessions"
  });
  const isCreateOpen = isCreateSheetOpen || Boolean(initialAccessBundleId);
  const handleCreateOpenChange = (isOpen: boolean) => {
    setIsCreateSheetOpen(isOpen);
    if (!isOpen && initialAccessBundleId) {
      navigate({
        to: "/organizations/$orgId/agent-vault/sessions",
        params: { orgId: currentOrg.id },
        search: {},
        replace: true
      });
    }
  };
  // Held on the page rather than inside the sheet so closing the sheet does not take the one-time
  // token reveal with it.
  const [mintedSession, setMintedSession] = useState<TAgentVaultMintedSession | null>(null);
  const [mintedBundles, setMintedBundles] = useState<TAgentVaultAccessBundleListItem[]>([]);

  const { data, isPending } = useListAgentVaultSessions({
    scope: isAdmin ? scope : AgentVaultSessionScope.Mine,
    status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const { data: accessBundles } = useListAgentVaultAccessBundles();

  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;

  // The list endpoint takes no search parameter, so this narrows the page already fetched.
  const displayedSessions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter(
      (session) =>
        session.actorName.toLowerCase().includes(term) ||
        session.accessBundles.some((bundle) => bundle.name.toLowerCase().includes(term))
    );
  }, [sessions, search]);

  const isFiltered = Boolean(search.trim()) || statusFilter !== ALL_STATUSES;
  const hasReachableBundles = (accessBundles?.length ?? 0) > 0;

  let emptyTitle: string;
  let emptyDescription: string;
  if (isFiltered) {
    emptyTitle = "No sessions match these filters";
    emptyDescription = "Try a different search term or status.";
  } else if (!hasReachableBundles) {
    emptyTitle = isAdmin ? "No sessions yet" : "No access bundles granted to you";
    emptyDescription = isAdmin
      ? "Create an access bundle first, then mint a session over it. Agents also need a proxy to route through."
      : "Ask an Agent Vault admin to grant you an access bundle.";
  } else {
    emptyTitle = "No sessions yet";
    emptyDescription = "Create a session to get a token an agent can run with.";
  }

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Sessions" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={TicketIcon}
        title="Sessions"
        description="What an agent runs with. Each session carries a fixed set of access bundles."
      />

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            A session names one actor, the access bundles it carries, and when it expires.
          </CardDescription>
          <CardAction>
            <Button
              variant="av"
              isDisabled={!hasReachableBundles}
              onClick={() => setIsCreateSheetOpen(true)}
            >
              Create Session
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <div className="flex-1">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search identity or access bundle..."
              />
            </InputGroup>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as AgentVaultSessionStatus | typeof ALL_STATUSES);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={ALL_STATUSES}>All Statuses</SelectItem>
              <SelectItem value={AgentVaultSessionStatus.Active}>Active</SelectItem>
              <SelectItem value={AgentVaultSessionStatus.Revoked}>Revoked</SelectItem>
              <SelectItem value={AgentVaultSessionStatus.Expired}>Expired</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Select
              value={scope}
              onValueChange={(value) => {
                setScope(value as AgentVaultSessionScope);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Session scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={AgentVaultSessionScope.All}>All Sessions</SelectItem>
                <SelectItem value={AgentVaultSessionScope.Mine}>My Sessions</SelectItem>
              </SelectContent>
            </Select>
          )}
        </CardContent>

        {!isPending && displayedSessions.length === 0 ? (
          <CardContent>
            <Empty className="border" frame="dashed">
              <EmptyHeader>
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
              {!isFiltered && !hasReachableBundles && isAdmin && (
                <Button variant="av" asChild>
                  <Link
                    to="/organizations/$orgId/agent-vault/access-bundles"
                    params={{ orgId: currentOrg.id }}
                  >
                    Go to Access Bundles
                  </Link>
                </Button>
              )}
            </Empty>
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Identity</TableHead>
                <TableHead>Access Bundles</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead variant="action" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                Array.from({ length: 5 }).map((_, index) => (
                  // eslint-disable-next-line react/no-array-index-key
                  <TableRow key={`session-skeleton-${index}`}>
                    {Array.from({ length: 6 }).map((__, cell) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <TableCell key={`session-skeleton-${index}-${cell}`}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!isPending &&
                displayedSessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {session.identityId ? (
                          <BotIcon className="size-4 text-muted" />
                        ) : (
                          <UserIcon className="size-4 text-muted" />
                        )}
                        {session.actorName}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-72">
                        <OverflowBadgeList
                          items={session.accessBundles}
                          getKey={(bundle) => bundle.id ?? bundle.name}
                          getLabel={(bundle) => bundle.name}
                          getVariant={(bundle) => (bundle.id ? "av" : "neutral")}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm">
                            {format(new Date(session.createdAt), "MMM d, yyyy")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {format(new Date(session.createdAt), "MMM d, yyyy h:mm a")}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <SessionExpiry expiresAt={session.expiresAt} />
                    </TableCell>
                    <TableCell>
                      <SessionStatusBadge status={session.status} />
                    </TableCell>
                    <TableCell variant="action">
                      {session.status === AgentVaultSessionStatus.Active && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton variant="ghost" size="xs" aria-label="Open session actions">
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent sideOffset={2} align="end">
                            <DropdownMenuItem onClick={() => setSessionToRevoke(session)}>
                              Revoke Session
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
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
                setUserTablePreference(
                  "agentVaultSessionsTable",
                  PreferenceKey.PerPage,
                  newPerPage
                );
              }}
            />
          </CardContent>
        )}
      </Card>

      <CreateSessionSheet
        isOpen={isCreateOpen}
        onOpenChange={handleCreateOpenChange}
        initialAccessBundleId={initialAccessBundleId}
        onCreated={(session, bundles) => {
          setMintedSession(session);
          setMintedBundles(bundles);
        }}
      />

      <SessionCreatedDialog
        session={mintedSession}
        accessBundles={mintedBundles}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setMintedSession(null);
            setMintedBundles([]);
          }
        }}
      />

      <RevokeSessionDialog
        session={sessionToRevoke}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSessionToRevoke(null);
        }}
      />
    </div>
  );
};
