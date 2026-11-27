import { useEffect, useState } from "react";
import {
  FilterBar,
  type FilterBarField,
  type FilterBarFilter
} from "@infisical/cipher/patterns/filter-bar";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@infisical/cipher/ui/data-table";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Meta, SmallText, StatusText } from "@infisical/cipher/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";

import { hostPatternOf } from "@app/components/agent-vault/service-sheet/serviceSchema";
import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultSessionActions,
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { canManageAgentVaultServices } from "@app/helpers/agentVaultPermissions";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  AgentVaultMemberType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus
} from "@app/hooks/api/agentVault/enums";
import type {
  TAgentVaultSession,
  TAgentVaultSessionInlineService,
  TAgentVaultSessionService,
  TAgentVaultSessionSkill
} from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useDebounce } from "@app/hooks/useDebounce";

import { useProjectPermission } from "../../access/permissions";
import { NoExpiry } from "../../components/no-expiry";
import { usePageSize } from "../../components/use-page-size";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { ServiceIcon } from "../resources/shared";
import { CreateSessionSheet } from "./create-session-sheet";
import { RevokeSessionDialog } from "./revoke-session-dialog";
import { SessionDetailsSheet } from "./session-details-sheet";
import { SessionLogAlerts } from "./session-log-alerts";
import {
  actorName as displayName,
  AGENT_VAULT_DOCS,
  canEditSession,
  describeActor,
  formatSessionExpiry,
  formatTimestamp,
  inlineServiceHookText,
  inlineServicesLabel,
  inlineServiceTarget,
  inlineSkillsLabel,
  isSameSessionMetadata,
  metadataRowsToRecord,
  SESSION_METADATA_MAX_KEYS,
  SESSION_STATUS as STATUS,
  sessionInlineServices,
  sessionInlineSkills,
  sessionMetadataErrors,
  sessionNamedServices,
  sessionNamedSkills,
  useCanActOnSession
} from "./sessions";

const METADATA_FIELD = "metadata";

const FILTER_FIELDS: FilterBarField[] = [
  {
    key: "status",
    label: "Status",
    type: "multi-select",
    options: Object.values(AgentVaultSessionStatus).map((status) => ({
      value: status,
      label: STATUS[status].label
    }))
  },
  { key: METADATA_FIELD, label: "Metadata", type: "key-value", max: SESSION_METADATA_MAX_KEYS }
];

const parseMetadataFilter = (filters: FilterBarFilter[]) => {
  const values = filters.find((filter) => filter.field === METADATA_FIELD)?.values ?? [];
  if (!values.length) return { metadataFilter: undefined, metadataFilterError: undefined };
  const rows = Array.from({ length: values.length / 2 }, (_, index) => ({
    key: values[index * 2],
    value: values[index * 2 + 1]
  }));
  const errors = sessionMetadataErrors(rows);
  const error =
    errors && (errors.rows.map((row) => row.key ?? row.value).find(Boolean) ?? errors.list);
  if (error) return { metadataFilter: undefined, metadataFilterError: error };
  return { metadataFilter: metadataRowsToRecord(rows), metadataFilterError: undefined };
};

const useAppliedMetadataFilter = (filters: FilterBarFilter[]) => {
  const { metadataFilter: typed, metadataFilterError } = parseMetadataFilter(filters);
  const [metadataFilter, setMetadataFilter] = useState(typed);
  if (!metadataFilterError && !isSameSessionMetadata(typed ?? {}, metadataFilter ?? {}))
    setMetadataFilter(typed);
  return { metadataFilter, metadataFilterError };
};

const route = v4Path("/organizations/$orgId/projects/agent-vault/$projectId/sessions");
const TABLE = "agentVaultSessionsTable";

const Identity = ({ session }: { session: TAgentVaultSession }) => (
  <Stack gap={0} style={{ minWidth: 0 }}>
    <Inline gap={8} align="center" wrap={false} style={{ minWidth: 0 }}>
      <Icon
        className="shrink-0"
        name={session.actor.type === AgentVaultMemberType.MachineIdentity ? "machine" : "user"}
      />
      <Tooltip content={describeActor(session.actor)}>
        <span className="truncate">{displayName(session.actor)}</span>
      </Tooltip>
    </Inline>
    {session.onBehalfOf && (
      <Tooltip content={describeActor(session.onBehalfOf)}>
        <Meta mono={false} tabIndex={0}>
          <span className="block truncate">On behalf of {displayName(session.onBehalfOf)}</span>
        </Meta>
      </Tooltip>
    )}
  </Stack>
);

type TAccessItem =
  | { kind: "bundle"; bundle: NonNullable<TAgentVaultSession["accessBundle"]> }
  | { kind: "service"; service: Extract<TAgentVaultSessionService, { isInline: false }> }
  | { kind: "inline"; services: TAgentVaultSessionInlineService[] }
  | { kind: "skill"; skill: TAgentVaultSessionSkill }
  | { kind: "inline-skills"; skills: TAgentVaultSessionSkill[] };

const ACCESS_ITEMS_SHOWN = 2;

const toAccessItems = (session: TAgentVaultSession): TAccessItem[] => {
  const inline = sessionInlineServices(session);
  const inlineSkills = sessionInlineSkills(session);
  return [
    ...(session.accessBundle ? [{ kind: "bundle" as const, bundle: session.accessBundle }] : []),
    ...sessionNamedServices(session).map((service) => ({ kind: "service" as const, service })),
    ...(inline.length ? [{ kind: "inline" as const, services: inline }] : []),
    ...sessionNamedSkills(session).map((skill) => ({ kind: "skill" as const, skill })),
    ...(inlineSkills.length ? [{ kind: "inline-skills" as const, skills: inlineSkills }] : [])
  ];
};

const accessItemKey = (item: TAccessItem) => {
  if (item.kind === "bundle") return `bundle:${item.bundle.id ?? item.bundle.name}`;
  if (item.kind === "service") return `service:${item.service.id}`;
  if (item.kind === "skill") return `skill:${item.skill.id}`;
  return item.kind;
};

const accessItemLabel = (item: TAccessItem) => {
  if (item.kind === "bundle") return item.bundle.name;
  if (item.kind === "service") return item.service.name;
  if (item.kind === "skill") return item.skill.name;
  if (item.kind === "inline-skills") return inlineSkillsLabel(item.skills.length);
  return inlineServicesLabel(item.services.length);
};

const InlineAccessHoverCard = ({
  label,
  rows,
  children
}: {
  label: string;
  rows: { id: string; name: string; detail?: string; media: React.ReactNode }[];
  children: React.ReactNode;
}) => (
  <HoverCard openDelay={150} closeDelay={100}>
    <HoverCardTrigger asChild>{children}</HoverCardTrigger>
    <HoverCardContent align="start">
      <Stack gap={8}>
        <SmallText muted>Sent with the session when it was created.</SmallText>
        <List label={label} variant="bare" size="sm">
          {rows.map((row) => (
            <ListRow
              key={row.id}
              value={row.id}
              label={row.name}
              title={row.name}
              description={row.detail}
              media={row.media}
            />
          ))}
        </List>
      </Stack>
    </HoverCardContent>
  </HoverCard>
);

const AccessBadge = ({
  item,
  orgId,
  projectId
}: {
  item: TAccessItem;
  orgId: string;
  projectId: string;
}) => {
  if (item.kind === "bundle" && item.bundle.id)
    return (
      <Badge tone="outline" asChild style={{ minWidth: 0 }} title={item.bundle.name}>
        <Link
          to={v4Path(
            "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
          )}
          params={{ orgId, projectId, accessBundleId: item.bundle.id }}
        >
          <Icon name="package" className="shrink-0" />
          <span className="truncate">{item.bundle.name}</span>
        </Link>
      </Badge>
    );
  if (item.kind === "bundle")
    return (
      <Badge reason={`${item.bundle.name} (deleted)`} tone="soft" style={{ minWidth: 0 }}>
        <Icon name="package" className="shrink-0" />
        <span className="truncate">{item.bundle.name}</span>
      </Badge>
    );
  if (item.kind === "service")
    return (
      <Tooltip content={item.service.description ?? "A project service this session names"}>
        <Badge tone="outline" tabIndex={0} style={{ minWidth: 0 }}>
          <Icon name="proxy" className="shrink-0" />
          <span className="truncate">{item.service.name}</span>
        </Badge>
      </Tooltip>
    );
  if (item.kind === "skill")
    return (
      <Tooltip content={item.skill.description}>
        <Badge tone="outline" tabIndex={0} style={{ minWidth: 0 }}>
          <Icon name="book" className="shrink-0" />
          <span className="truncate">{item.skill.name}</span>
        </Badge>
      </Tooltip>
    );
  if (item.kind === "inline-skills")
    return (
      <InlineAccessHoverCard
        label="Inline skills"
        rows={item.skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          detail: skill.description,
          media: <Icon name="book" />
        }))}
      >
        <Badge tone="outline" tabIndex={0} style={{ minWidth: 0 }}>
          <Icon name="book" className="shrink-0" />
          <span className="truncate">{accessItemLabel(item)}</span>
        </Badge>
      </InlineAccessHoverCard>
    );
  return (
    <InlineAccessHoverCard
      label="Inline services"
      rows={item.services.map((service) => {
        const target = inlineServiceTarget(service);
        return {
          id: service.id,
          name: service.name,
          detail:
            [target === service.name ? null : target, inlineServiceHookText(service)]
              .filter(Boolean)
              .join(" · ") || undefined,
          media: <ServiceIcon hostPattern={hostPatternOf(service)} serviceType={service.type} />
        };
      })}
    >
      <Badge tone="outline" tabIndex={0} style={{ minWidth: 0 }}>
        <Icon name="proxy" className="shrink-0" />
        <span className="truncate">{accessItemLabel(item)}</span>
      </Badge>
    </InlineAccessHoverCard>
  );
};

const Access = ({
  session,
  orgId,
  projectId
}: {
  session: TAgentVaultSession;
  orgId: string;
  projectId: string;
}) => {
  const items = toAccessItems(session);
  const hidden = items.slice(ACCESS_ITEMS_SHOWN);
  return (
    <Inline gap={4} align="center" wrap={false} style={{ minWidth: 0 }}>
      {items.slice(0, ACCESS_ITEMS_SHOWN).map((item) => (
        <AccessBadge key={accessItemKey(item)} item={item} orgId={orgId} projectId={projectId} />
      ))}
      {hidden.length > 0 && (
        <Tooltip content={hidden.map(accessItemLabel).join(", ")}>
          <Meta tabIndex={0}>+{hidden.length}</Meta>
        </Tooltip>
      )}
    </Inline>
  );
};

const Expiry = ({ session }: { session: TAgentVaultSession }) => {
  if (!session.expiresAt) return <NoExpiry />;
  return (
    <Tooltip content={formatTimestamp(session.expiresAt)}>
      <span>{formatSessionExpiry(session.expiresAt)}</span>
    </Tooltip>
  );
};

const SessionMenu = ({
  session,
  canEdit,
  canRevoke,
  onView,
  onEdit,
  onRevoke
}: {
  session: TAgentVaultSession;
  canEdit: boolean;
  canRevoke: boolean;
  onView: () => void;
  onEdit: () => void;
  onRevoke: () => void;
}) => {
  const isActive = session.status === AgentVaultSessionStatus.Active;
  return (
    <>
      <DropdownMenuItem onSelect={onView}>
        <Icon name="file-text" />
        View details
      </DropdownMenuItem>
      {canEditSession(session) && canEdit && (
        <DropdownMenuItem onSelect={onEdit}>
          <Icon name="pencil" />
          Edit session
        </DropdownMenuItem>
      )}
      {canRevoke && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={!isActive}
            description={isActive ? undefined : "Only an active session can be revoked"}
            onSelect={onRevoke}
          >
            <Icon name="x" />
            Revoke session
          </DropdownMenuItem>
        </>
      )}
    </>
  );
};

const ScopeToggle = ({
  scope,
  onChange
}: {
  scope: AgentVaultSessionScope;
  onChange: (next: AgentVaultSessionScope) => void;
}) => (
  <ToggleGroup
    type="single"
    aria-label="Session scope"
    value={scope}
    onValueChange={(next) => {
      if (next) onChange(next as AgentVaultSessionScope);
    }}
  >
    <ToggleGroupItem value={AgentVaultSessionScope.All}>All sessions</ToggleGroupItem>
    <ToggleGroupItem value={AgentVaultSessionScope.Mine}>My sessions</ToggleGroupItem>
  </ToggleGroup>
);

const SessionsEmpty = ({
  orgId,
  projectId,
  canManageServices,
  isFiltered,
  canStartSession,
  onClearFilters
}: {
  orgId: string;
  projectId: string;
  canManageServices: boolean;
  isFiltered: boolean;
  canStartSession: boolean;
  onClearFilters: () => void;
}) => {
  if (isFiltered)
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="search"
        title="No sessions match these filters"
        actions={
          <Button variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  if (canStartSession)
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="id-card"
        title="No sessions yet"
        description="Create a session to get a token an agent can run with."
      />
    );
  if (!canManageServices)
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="package"
        title="No access bundles granted to you"
        description="Ask an admin to grant you an access bundle."
      />
    );
  return (
    <EmptyState
      size="sm"
      media="bare"
      icon="id-card"
      title="No sessions yet"
      description="Add a service first, then create a session with it, on its own or through an access bundle. Agents also need a proxy to route through."
      actions={
        <Button variant="outline" asChild>
          <Link
            to={v4Path("/organizations/$orgId/projects/agent-vault/$projectId/services")}
            params={{ orgId, projectId }}
          >
            Go to services
          </Link>
        </Button>
      }
    />
  );
};

const useCanStartSession = (orgId: string, projectId: string) => {
  const { permission } = useProjectPermission(projectId);
  const resources = useV4Adapter("agentVaultResources");
  const { data: accessBundles } = useV4Adapter("agentVault").useAccessBundles(orgId, projectId, {
    limit: 1
  });
  const { data: nameableServices } = resources.useServices(projectId, { limit: 1 });
  const { data: nameableSkills } = resources.useSkills(
    projectId,
    { limit: 1 },
    {
      enabled: permission.can(
        ProjectPermissionAgentVaultSkillActions.Read,
        ProjectPermissionSub.AgentVaultSkills
      )
    }
  );
  return (
    (accessBundles?.totalCount ?? 0) > 0 ||
    (nameableServices?.totalCount ?? 0) > 0 ||
    (nameableSkills?.totalCount ?? 0) > 0
  );
};

const sessionColumns = ({
  orgId,
  projectId,
  onOpen
}: {
  orgId: string;
  projectId: string;
  onOpen: (sessionId: string) => void;
}): DataTableColumn<TAgentVaultSession>[] => [
  {
    id: "label",
    header: "Label",
    primary: true,
    width: 224,
    text: (row) => row.label ?? "",
    render: (row) => (
      <Button
        variant="link"
        underline="hover"
        onClick={() => onOpen(row.id)}
        title={row.label ?? undefined}
        style={{ maxWidth: "100%" }}
      >
        {row.label ? (
          <span className="truncate">{row.label}</span>
        ) : (
          <Meta mono={false}>No label</Meta>
        )}
      </Button>
    )
  },
  {
    id: "identity",
    header: "Identity",
    grow: true,
    minWidth: 208,
    text: (row) => displayName(row.actor),
    render: (row) => <Identity session={row} />
  },
  {
    id: "access",
    header: "Access",
    width: 264,
    render: (row) =>
      toAccessItems(row).length ? (
        <Access session={row} orgId={orgId} projectId={projectId} />
      ) : null
  },
  {
    id: "created",
    header: "Created",
    width: 176,
    render: (row) => (
      <Meta mono={false}>{format(new Date(row.createdAt), "MMM dd, yyyy hh:mm a")}</Meta>
    )
  },
  {
    id: "expires",
    header: "Expires",
    width: 112,
    render: (row) =>
      row.status === AgentVaultSessionStatus.Revoked ? null : <Expiry session={row} />
  },
  {
    id: "status",
    header: "Status",
    width: 112,
    render: (row) => {
      const { label, tone, icon } = STATUS[row.status];
      return (
        <StatusText tone={tone} icon={icon}>
          {label}
        </StatusText>
      );
    }
  }
];

const Sessions = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const agentVault = useV4Adapter("agentVault");
  const navigate = useNavigate();
  const { sessionId } = useSearch({ from: route });
  const [focusLabel, setFocusLabel] = useState(false);
  const [sessionToRevoke, setSessionToRevoke] = useState<TAgentVaultSession | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const setSessionId = (next: string | undefined, labelIntent = false) => {
    setFocusLabel(labelIntent);
    navigate({
      to: route,
      params: { orgId, projectId },
      search: (prev) => ({ ...prev, sessionId: next })
    });
  };
  const { permission } = useProjectPermission(projectId);
  const canActOn = useCanActOnSession(projectId);
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
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [scope, setScope] = useState(() => {
    const stored = getUserTablePreference(
      TABLE,
      PreferenceKey.SessionScope,
      AgentVaultSessionScope.All
    );
    return Object.values(AgentVaultSessionScope).includes(stored)
      ? stored
      : AgentVaultSessionScope.All;
  });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = usePageSize(TABLE, 20);

  const statuses = (filters.find((filter) => filter.field === "status")?.values ??
    []) as AgentVaultSessionStatus[];
  const { metadataFilter, metadataFilterError } = useAppliedMetadataFilter(filters);

  const { data, isPending } = agentVault.useSessions(orgId, projectId, {
    scope: canReadAnySession ? scope : AgentVaultSessionScope.Mine,
    statuses,
    search: debouncedSearch.trim() || undefined,
    metadata: metadataFilter,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const canStartSession = useCanStartSession(orgId, projectId);

  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(totalCount / perPage));
    if (!isPending && page > lastPage) setPage(lastPage);
  }, [totalCount, page, perPage, isPending]);

  const isFiltered =
    Boolean(debouncedSearch.trim()) || statuses.length > 0 || Boolean(metadataFilter);
  useAgentVaultCreateIntent(() => setIsCreateOpen(true), canStartSession);

  const columns = sessionColumns({ orgId, projectId, onOpen: (id) => setSessionId(id) });

  const rowActions: DataTableRowActions<TAgentVaultSession> = {
    menuLabel: "Session options",
    renderMenu: (row) => (
      <SessionMenu
        session={row}
        canEdit={canActOn(row, "edit")}
        canRevoke={canActOn(row, "revoke")}
        onView={() => setSessionId(row.id)}
        onEdit={() => setSessionId(row.id, true)}
        onRevoke={() => setSessionToRevoke(row)}
      />
    )
  };

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Sessions"
          badges={<DocumentationLink href={AGENT_VAULT_DOCS.sessions} subject="sessions" />}
          actions={
            <Button
              variant="accent"
              icon="plus"
              disabledReason={
                canStartSession
                  ? undefined
                  : "Sessions need an access bundle, a service, or a skill you can use"
              }
              onClick={() => setIsCreateOpen(true)}
            >
              Create session
            </Button>
          }
        />
        {canReadSessionLogSettings && <SessionLogAlerts orgId={orgId} projectId={projectId} />}
        <FilterBar
          label="Session filters"
          fields={FILTER_FIELDS}
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setPage(1);
          }}
          search={
            <Input
              icon="search"
              aria-label="Search sessions"
              placeholder="Search by label, identity, email, or access bundle..."
              slashShortcut
              maxLength={255}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
          actions={
            canReadAnySession ? (
              <ScopeToggle
                scope={scope}
                onChange={(next) => {
                  setScope(next);
                  setPage(1);
                  setUserTablePreference(TABLE, PreferenceKey.SessionScope, next);
                }}
              />
            ) : undefined
          }
        />
        {metadataFilterError && <Alert tone="bad">{metadataFilterError}</Alert>}
        <DataTable
          filtered={isFiltered}
          label="Sessions"
          rows={sessions}
          columns={columns}
          loading={isPending}
          getRowId={(row) => row.id}
          rowLabel={(row) => row.label ?? displayName(row.actor)}
          rowActions={rowActions}
          // v4-check-ignore row-activate-navigates -- opens the session sheet in place; the search param only keeps it addressable
          onRowActivate={(row) => setSessionId(row.id)}
          empty={
            <SessionsEmpty
              orgId={orgId}
              projectId={projectId}
              canManageServices={canManageServices}
              isFiltered={isFiltered}
              canStartSession={canStartSession}
              onClearFilters={() => {
                setSearch("");
                setFilters([]);
                setPage(1);
              }}
            />
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
                }}
              />
            ) : undefined
          }
        />
        <SessionDetailsSheet
          orgId={orgId}
          projectId={projectId}
          sessionId={sessionId}
          loaded={sessions.find((session) => session.id === sessionId)}
          focusLabel={focusLabel}
          onClose={() => setSessionId(undefined)}
          onRevoke={setSessionToRevoke}
        />
        <RevokeSessionDialog
          orgId={orgId}
          projectId={projectId}
          session={sessionToRevoke}
          onClose={() => setSessionToRevoke(null)}
        />
        <CreateSessionSheet
          orgId={orgId}
          projectId={projectId}
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      </Stack>
    </TooltipProvider>
  );
};

export const AgentVaultSessionsPage = () => {
  const { orgId, projectId } = useParams({ from: route });
  return <Sessions key={projectId} orgId={orgId} projectId={projectId} />;
};
