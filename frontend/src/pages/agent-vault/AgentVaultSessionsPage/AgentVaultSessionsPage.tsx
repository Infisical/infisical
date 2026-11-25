import { useMemo, useState } from "react";
import { Link, linkOptions } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  BanIcon,
  BookOpenTextIcon,
  CircleAlertIcon,
  FilterIcon,
  GlobeIcon,
  IdCardIcon,
  LogsIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PencilIcon,
  PlugIcon,
  PlusIcon,
  SearchIcon,
  TriangleAlertIcon
} from "lucide-react";

import { AgentVaultSessionLogUpgradeModal } from "@app/components/agent-vault/AgentVaultSessionLogUpgradeModal";
import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertAction,
  AlertDescription,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
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
  Label,
  OverflowBadgeList,
  PageHeader,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Separator,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission,
  useSubscription,
  useProject,
  useUser
} from "@app/context";
import {
  canActOnAgentVaultSession,
  canManageAgentVaultServices
} from "@app/helpers/agentVaultPermissions";
import { isAgentVaultSessionLogBlockedByPlan } from "@app/helpers/agentVaultSessionLogs";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import {
  AgentVaultSessionScope,
  AgentVaultSessionStatus,
  useGetAgentVaultSession,
  useGetAgentVaultSessionLogHealth,
  useGetAgentVaultSessionLogSettings,
  useListAgentVaultAccessBundles,
  useListAgentVaultServices,
  useListAgentVaultSessions,
  useListAgentVaultSkills
} from "@app/hooks/api/agentVault";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";
import { TAgentVaultSession } from "@app/hooks/api/agentVault/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";
import { SessionLogReadAccessAlert } from "@app/pages/agent-vault/AgentVaultSettingsPage/components/SessionLogReadAccessAlert";
import {
  MetadataFilterEntry,
  MetadataFilterSection
} from "@app/pages/cert-manager/components/MetadataFilterSection";

import { AgentVaultDocsUrls } from "../agent-vault-docs-urls";
import { CreateSessionDialog } from "./components/CreateSessionDialog";
import { EditSessionDialog } from "./components/EditSessionDialog";
import { RevokeSessionDialog } from "./components/RevokeSessionDialog";
import {
  inlineServicesLabel,
  inlineSkillsLabel,
  toAccessItems,
  TSessionAccessItem
} from "./components/sessionAccess";
import { InlineServicesList, SessionSkillsList } from "./components/SessionAccessHoverCard";
import { SessionDetailSheet } from "./components/SessionDetailSheet";
import { SessionExpiry } from "./components/SessionExpiry";
import { SessionIdentity } from "./components/SessionIdentity";
import {
  SESSION_METADATA_MAX_KEYS,
  sessionMetadataRowsSchema
} from "./components/sessionMetadataSchema";
import { SESSION_STATUS_PRESENTATION, SessionStatusBadge } from "./components/SessionStatusBadge";
import { TruncatedText } from "./components/TruncatedText";

const STATUS_OPTIONS = [
  AgentVaultSessionStatus.Active,
  AgentVaultSessionStatus.Revoked,
  AgentVaultSessionStatus.Expired
];

const accessItemIcon = (item: TSessionAccessItem) => {
  if (item.kind === "bundle") return <PackageIcon />;
  if (item.kind === "service") return <PlugIcon />;
  if (item.kind === "skill" || item.kind === "inline-skills") return <BookOpenTextIcon />;
  return <GlobeIcon />;
};

const accessItemKey = (item: TSessionAccessItem) => {
  if (item.kind === "bundle") return `bundle:${item.bundle.id ?? item.bundle.name}`;
  if (item.kind === "service") return `service:${item.service.id}`;
  if (item.kind === "skill") return `skill:${item.skill.id}`;
  return item.kind;
};

const accessItemLabel = (item: TSessionAccessItem) => {
  if (item.kind === "bundle") return item.bundle.name;
  if (item.kind === "service") return item.service.name;
  if (item.kind === "skill") return item.skill.name;
  if (item.kind === "inline-skills") return inlineSkillsLabel(item.skills.length);
  return inlineServicesLabel(item.services.length);
};

const accessItemTooltip = (item: TSessionAccessItem) => {
  if (item.kind === "bundle" && !item.bundle.id) return `${item.bundle.name} (deleted)`;
  if (item.kind === "service")
    return item.service.description ?? "A project service picked when this session was created";
  if (item.kind === "skill") return item.skill.description;
  return undefined;
};

const accessItemHoverCard = (item: TSessionAccessItem) => {
  if (item.kind === "inline") return <InlineServicesList services={item.services} />;
  if (item.kind === "inline-skills") return <SessionSkillsList skills={item.skills} isInline />;
  return undefined;
};

export const AgentVaultSessionsPage = () => {
  const { projectId } = useProject();
  const { currentOrg } = useOrganization();
  const { permission } = useProjectPermission();
  const { user } = useUser();
  const canReadAnySession = permission.can(
    ProjectPermissionAgentVaultSessionActions.ReadAny,
    ProjectPermissionSub.AgentVaultSessions
  );
  const canReadSessionLogSettings = permission.can(
    ProjectPermissionActions.Read,
    ProjectPermissionSub.Settings
  );
  const canManageServices = canManageAgentVaultServices(permission);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const [statuses, setStatuses] = useState<AgentVaultSessionStatus[]>([]);
  const [pendingMetadataFilters, setPendingMetadataFilters] = useState<MetadataFilterEntry[]>([]);
  const [appliedMetadataFilters, setAppliedMetadataFilters] = useState<MetadataFilterEntry[]>([]);
  const metadataFilter = useMemo(() => {
    const entries = appliedMetadataFilters
      .map(({ key, value }) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key && value);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }, [appliedMetadataFilters]);
  // The same limits the API applies, checked here so a refused filter never reads as "no sessions match".
  const metadataFilterErrors = useMemo(() => {
    const errors: (string | undefined)[] = pendingMetadataFilters.map(() => undefined);
    const result = sessionMetadataRowsSchema.safeParse(pendingMetadataFilters);
    if (!result.success) {
      result.error.issues.forEach((issue) => {
        const [row] = issue.path;
        if (typeof row === "number" && !errors[row]) errors[row] = issue.message;
      });
    }
    return errors;
  }, [pendingMetadataFilters]);
  const [scope, setScope] = useState(() => {
    const stored = getUserTablePreference(
      "agentVaultSessionsTable",
      PreferenceKey.SessionScope,
      AgentVaultSessionScope.All
    );
    return Object.values(AgentVaultSessionScope).includes(stored)
      ? stored
      : AgentVaultSessionScope.All;
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference("agentVaultSessionsTable", PreferenceKey.PerPage, 20)
  );
  const [sessionToRevoke, setSessionToRevoke] = useState<TAgentVaultSession | null>(null);
  const [sessionToEdit, setSessionToEdit] = useState<TAgentVaultSession | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { id: openSessionId, openSheet } = useAgentVaultSheetState();

  const { data, isPending } = useListAgentVaultSessions(projectId, {
    scope: canReadAnySession ? scope : AgentVaultSessionScope.Mine,
    statuses,
    search: debouncedSearch.trim() || undefined,
    metadata: metadataFilter,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  // A session needs a bundle the caller reaches or a service or skill they can pick. A member can pick only the
  // services and skills in their bundles, so only someone who reaches every bundle can have them and no bundle.
  const { data: accessBundles } = useListAgentVaultAccessBundles(projectId, { limit: 1 });
  const { data: pickableServices } = useListAgentVaultServices(projectId, { limit: 1 });
  // Without Read on skills the caller can pick none, and the list would only answer 403.
  const canReadSkills = permission.can(
    ProjectPermissionAgentVaultSkillActions.Read,
    ProjectPermissionSub.AgentVaultSkills
  );
  const { data: pickableSkills } = useListAgentVaultSkills(
    projectId,
    { limit: 1 },
    { enabled: canReadSkills }
  );
  const { data: sessionLogState } = useGetAgentVaultSessionLogSettings(
    projectId,
    canReadSessionLogSettings
  );
  const { data: sessionLogHealth } = useGetAgentVaultSessionLogHealth(
    projectId,
    canReadSessionLogSettings
  );
  const { subscription } = useSubscription();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const sessionLogSettings = sessionLogState?.settings ?? null;
  // Covers a saved choice the plan dropped and the unsaved default the plan never included.
  const isSessionLogBlockedByPlan = isAgentVaultSessionLogBlockedByPlan(
    sessionLogSettings,
    subscription
  );

  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;

  const loadedOpenSession = sessions.find((session) => session.id === openSessionId);
  const { data: fetchedOpenSession, isPending: isFetchingOpenSession } = useGetAgentVaultSession(
    projectId,
    openSessionId
  );
  const openSession = fetchedOpenSession ?? loadedOpenSession;
  const isOpenSessionPending = Boolean(openSessionId) && !openSession && isFetchingOpenSession;

  useResetPageHelper({ totalCount, offset: (page - 1) * perPage, setPage });

  // The debounced term, not the typed one: the rows on screen were fetched with this, so keying the copy
  // off the live input would caption a stale result set.
  const isFiltered =
    Boolean(debouncedSearch.trim()) || statuses.length > 0 || Boolean(metadataFilter);
  const canStartSession =
    (accessBundles?.totalCount ?? 0) > 0 ||
    (pickableServices?.totalCount ?? 0) > 0 ||
    (pickableSkills?.totalCount ?? 0) > 0;
  useAgentVaultCreateIntent(() => setIsCreateDialogOpen(true), canStartSession);

  let emptyTitle: string;
  let emptyDescription: string;
  if (isFiltered) {
    emptyTitle = "No sessions match these filters";
    emptyDescription = "Try a different search term, status or metadata.";
  } else if (!canStartSession) {
    emptyTitle = canManageServices ? "No sessions yet" : "No access bundles granted to you";
    emptyDescription = canManageServices
      ? "Add a service first, then create a session with it, on its own or through an access bundle. Agents also need a proxy to route through."
      : "Ask an admin to grant you an access bundle.";
  } else {
    emptyTitle = "No sessions yet";
    emptyDescription = "Create a session to get a token an agent can run with.";
  }

  const emptyState = (
    <CardContent>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
        {!isFiltered && !canStartSession && canManageServices && (
          <Button variant="av" asChild>
            <Link
              to="/organizations/$orgId/projects/agent-vault/$projectId/services"
              params={{ orgId: currentOrg.id, projectId }}
            >
              Go to Services
            </Link>
          </Button>
        )}
      </Empty>
    </CardContent>
  );

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Sessions" />
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={IdCardIcon}
        title="Sessions"
        description="Create sessions that let your agents reach the services they need."
      />

      <div className="flex flex-col gap-8">
        {sessionLogHealth?.connectionError &&
          sessionLogSettings?.enabled &&
          !isSessionLogBlockedByPlan && (
            <Alert variant="danger">
              <CircleAlertIcon />
              <AlertDescription>
                <p>{sessionLogHealth.connectionError}</p>
                <AlertAction>
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to="/organizations/$orgId/projects/agent-vault/$projectId/settings"
                      params={{ orgId: currentOrg.id, projectId }}
                      search={{ selectedTab: "tab-session-logs" }}
                    >
                      Go to Settings
                    </Link>
                  </Button>
                </AlertAction>
              </AlertDescription>
            </Alert>
          )}

        {isSessionLogBlockedByPlan && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              <p>
                {sessionLogSettings?.storage.type === AgentVaultSessionLogStorageType.External
                  ? "Your plan no longer includes external storage. Upgrade to see recorded logs and keep recording. Recorded logs stay in your bucket."
                  : "Your plan doesn't include default storage, so session logs aren't being recorded. Upgrade to record and view them."}
              </p>
              <AlertAction>
                <Button variant="outline" size="sm" onClick={() => setIsUpgradeOpen(true)}>
                  Upgrade
                </Button>
              </AlertAction>
            </AlertDescription>
          </Alert>
        )}

        {sessionLogSettings && !sessionLogSettings.enabled && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              <p>
                Sessions aren&apos;t being logged, so there is no record of what your agents
                reached.
              </p>
              <AlertAction>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/organizations/$orgId/projects/agent-vault/$projectId/settings"
                    params={{ orgId: currentOrg.id, projectId }}
                    search={{ selectedTab: "tab-session-logs" }}
                  >
                    Go to Settings
                  </Link>
                </Button>
              </AlertAction>
            </AlertDescription>
          </Alert>
        )}

        {canReadSessionLogSettings && !sessionLogHealth?.connectionError && (
          <SessionLogReadAccessAlert />
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              Sessions
              <DocumentationLinkBadge href={AgentVaultDocsUrls.sessions} />
            </CardTitle>
            <CardDescription>
              A session defines who holds it, the services it can reach, and when it expires.
            </CardDescription>
            <CardAction>
              <Button
                variant="av"
                isDisabled={!canStartSession}
                onClick={() => setIsCreateDialogOpen(true)}
              >
                <PlusIcon />
                Create Session
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <InputGroup className="flex-1">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                maxLength={255}
                placeholder="Search by label, identity, email, or access bundle..."
              />
            </InputGroup>
            <Popover>
              <PopoverTrigger asChild>
                <IconButton
                  aria-label="Filter sessions"
                  variant={statuses.length || metadataFilter ? "av" : "outline"}
                >
                  <FilterIcon />
                </IconButton>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="flex max-h-(--radix-popover-content-available-height) flex-col gap-3 overflow-y-auto"
              >
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-accent">Status</span>
                  {STATUS_OPTIONS.map((status) => {
                    const {
                      label,
                      icon: Icon,
                      iconClassName
                    } = SESSION_STATUS_PRESENTATION[status];
                    const checkboxId = `session-status-filter-${status}`;
                    return (
                      <div key={status} className="flex items-center gap-2">
                        <Checkbox
                          id={checkboxId}
                          variant="av"
                          isChecked={statuses.includes(status)}
                          onCheckedChange={() => {
                            setStatuses((prev) =>
                              prev.includes(status)
                                ? prev.filter((s) => s !== status)
                                : [...prev, status]
                            );
                            setPage(1);
                          }}
                        />
                        <Label htmlFor={checkboxId}>
                          <Icon className={cn("size-4", iconClassName)} />
                          {label}
                        </Label>
                      </div>
                    );
                  })}
                </div>
                <Separator />
                <MetadataFilterSection
                  entries={pendingMetadataFilters}
                  onChange={setPendingMetadataFilters}
                  labelClassName="normal-case text-accent"
                  clearClassName="text-muted hover:text-foreground"
                  errors={metadataFilterErrors}
                  maxEntries={SESSION_METADATA_MAX_KEYS}
                />
                <Button
                  variant="av"
                  size="sm"
                  isDisabled={
                    metadataFilterErrors.some(Boolean) ||
                    JSON.stringify(pendingMetadataFilters) ===
                      JSON.stringify(appliedMetadataFilters)
                  }
                  onClick={() => {
                    setAppliedMetadataFilters(pendingMetadataFilters);
                    setPage(1);
                  }}
                >
                  Apply
                </Button>
              </PopoverContent>
            </Popover>
            {canReadAnySession && (
              <Tabs
                value={scope}
                onValueChange={(value) => {
                  setScope(value as AgentVaultSessionScope);
                  setPage(1);
                  setUserTablePreference(
                    "agentVaultSessionsTable",
                    PreferenceKey.SessionScope,
                    value
                  );
                }}
              >
                <TabsList variant="filled">
                  <TabsTrigger value={AgentVaultSessionScope.All}>All Sessions</TabsTrigger>
                  <TabsTrigger value={AgentVaultSessionScope.Mine}>My Sessions</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </CardContent>

          {!isPending && sessions.length === 0 ? (
            emptyState
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {/* w-px holds the column to its capped content, so a long label truncates at the column's edge */}
                  <TableHead className="w-px">Label</TableHead>
                  <TableHead>Identity</TableHead>
                  <TableHead>Access</TableHead>
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
                      {Array.from({ length: 7 }).map((__, cell) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <TableCell key={`session-skeleton-${index}-${cell}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                {!isPending &&
                  sessions.map((session) => (
                    <TableRow
                      key={session.id}
                      onClick={() => openSheet(session.id)}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        {session.label ? (
                          <TruncatedText text={session.label} className="max-w-60" />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <SessionIdentity session={session} />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-72">
                          <OverflowBadgeList
                            items={toAccessItems(session)}
                            getKey={accessItemKey}
                            getLabel={accessItemLabel}
                            getIcon={accessItemIcon}
                            getClassName={(item) =>
                              item.kind === "bundle" && !item.bundle.id ? "text-muted" : undefined
                            }
                            getHoverCard={accessItemHoverCard}
                            getTooltip={accessItemTooltip}
                            getLinkProps={(item) =>
                              item.kind === "bundle" && item.bundle.id
                                ? linkOptions({
                                    to: "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId",
                                    params: {
                                      orgId: currentOrg.id,
                                      projectId,
                                      accessBundleId: item.bundle.id
                                    }
                                  })
                                : undefined
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(session.createdAt), "MMM dd, yyyy hh:mm a")}
                      </TableCell>
                      <TableCell>
                        {session.status === AgentVaultSessionStatus.Revoked ? (
                          <span className="text-muted">—</span>
                        ) : (
                          <SessionExpiry expiresAt={session.expiresAt} />
                        )}
                      </TableCell>
                      <TableCell>
                        <SessionStatusBadge status={session.status} />
                      </TableCell>
                      <TableCell variant="action">
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                aria-label="View session logs"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openSheet(session.id);
                                }}
                              >
                                <LogsIcon />
                              </IconButton>
                            </TooltipTrigger>
                            <TooltipContent>View Session Logs</TooltipContent>
                          </Tooltip>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                variant="ghost"
                                size="xs"
                                aria-label="Open session actions"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontalIcon />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              sideOffset={2}
                              align="end"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <DropdownMenuItem onClick={() => openSheet(session.id)}>
                                <LogsIcon />
                                View Session Logs
                              </DropdownMenuItem>
                              {/* The API refuses edits once the session's owner, or the user it acts on behalf of, is deleted */}
                              {session.actor.id !== null &&
                                session.onBehalfOf?.id !== null &&
                                canActOnAgentVaultSession(permission, user.id, session, "edit") && (
                                  <DropdownMenuItem onClick={() => setSessionToEdit(session)}>
                                    <PencilIcon />
                                    Edit Session
                                  </DropdownMenuItem>
                                )}
                              {canActOnAgentVaultSession(
                                permission,
                                user.id,
                                session,
                                "revoke"
                              ) && (
                                <DropdownMenuItem
                                  variant="danger"
                                  isDisabled={session.status !== AgentVaultSessionStatus.Active}
                                  onClick={() => setSessionToRevoke(session)}
                                >
                                  <BanIcon />
                                  Revoke Session
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}

          {totalCount > 0 && (
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
      </div>

      <CreateSessionDialog isOpen={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen} />

      <RevokeSessionDialog
        session={sessionToRevoke}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSessionToRevoke(null);
        }}
      />

      <SessionDetailSheet
        session={openSession}
        isPending={isOpenSessionPending}
        onRevoke={setSessionToRevoke}
        onEdit={setSessionToEdit}
      />

      <EditSessionDialog
        session={sessionToEdit}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSessionToEdit(null);
        }}
      />

      <AgentVaultSessionLogUpgradeModal
        isOpen={isUpgradeOpen}
        onOpenChange={setIsUpgradeOpen}
        storageType={sessionLogSettings?.storage.type}
      />
    </div>
  );
};
