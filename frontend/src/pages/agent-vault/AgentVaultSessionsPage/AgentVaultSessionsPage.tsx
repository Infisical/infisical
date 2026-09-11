import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, linkOptions } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BanIcon,
  BotIcon,
  IdCardIcon,
  MoreHorizontalIcon,
  PackageIcon,
  SearchIcon,
  UserIcon
} from "lucide-react";

import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
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
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  useListAgentVaultAccessBundles,
  useListAgentVaultSessions
} from "@app/hooks/api/agentVault";
import { TAgentVaultMintedSession, TAgentVaultSession } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { AgentVaultDocsUrls } from "../agent-vault-docs-urls";
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
  const [debouncedSearch] = useDebounce(search);
  const [statusFilter, setStatusFilter] = useState<AgentVaultSessionStatus | typeof ALL_STATUSES>(
    ALL_STATUSES
  );
  const [scope, setScope] = useState(AgentVaultSessionScope.Mine);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultSessionsTable", PreferenceKey.PerPage, 20)
  );
  const [sessionToRevoke, setSessionToRevoke] = useState<TAgentVaultSession | null>(null);
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);
  const [mintedSession, setMintedSession] = useState<TAgentVaultMintedSession | null>(null);

  const { data, isPending } = useListAgentVaultSessions({
    scope: isAdmin ? scope : AgentVaultSessionScope.Mine,
    status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
    search: debouncedSearch.trim() || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const { data: accessBundles } = useListAgentVaultAccessBundles();

  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;

  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  // The debounced term, not the typed one: the rows on screen were fetched with this, so keying the copy
  // off the live input would caption a stale result set.
  const isFiltered = Boolean(debouncedSearch.trim()) || statusFilter !== ALL_STATUSES;
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
      : "Ask an admin to grant you an access bundle.";
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
        icon={IdCardIcon}
        title="Sessions"
        description="What an agent runs with. Each session carries one access bundle."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            Sessions
            <DocumentationLinkBadge href={AgentVaultDocsUrls.sessions} />
          </CardTitle>
          <CardDescription>
            A session names one actor, the access bundle it carries, and when it expires.
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by identity, email, or access bundle..."
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

        {!isPending && sessions.length === 0 ? (
          <CardContent>
            <Empty className="border">
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
                <TableHead>Access Bundle</TableHead>
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
                sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex w-fit items-center gap-2">
                            {session.identityId ? (
                              <BotIcon className="size-4 text-muted" />
                            ) : (
                              <UserIcon className="size-4 text-muted" />
                            )}
                            {session.actorName}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {session.identityId
                            ? `${session.identityId} (machine identity)`
                            : session.actorEmail}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-72">
                        <OverflowBadgeList
                          items={session.accessBundles}
                          getKey={(bundle) => bundle.id ?? bundle.name}
                          getLabel={(bundle) => bundle.name}
                          icon={<PackageIcon />}
                          getClassName={(bundle) => (bundle.id ? undefined : "text-muted")}
                          getTooltip={(bundle) =>
                            bundle.id ? bundle.name : `${bundle.name} (deleted)`
                          }
                          getLinkProps={(bundle) =>
                            bundle.id
                              ? linkOptions({
                                  to: "/organizations/$orgId/agent-vault/access-bundles/$accessBundleId",
                                  params: { orgId: currentOrg.id, accessBundleId: bundle.id }
                                })
                              : undefined
                          }
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
                            <DropdownMenuItem
                              variant="danger"
                              onClick={() => setSessionToRevoke(session)}
                            >
                              <BanIcon />
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
          // The card lays its children out with gap-5, which reads as a gap under the table.
          <CardContent className="-mt-5 pt-0">
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
        isOpen={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        onCreated={setMintedSession}
      />

      <SessionCreatedDialog
        session={mintedSession}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMintedSession(null);
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
