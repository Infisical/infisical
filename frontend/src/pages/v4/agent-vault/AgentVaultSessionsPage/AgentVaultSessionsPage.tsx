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
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { PageHeader } from "@infisical/cipher/ui/page-header";
import { Pagination } from "@infisical/cipher/ui/pagination";
import { Meta, StatusText } from "@infisical/cipher/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { Tooltip, TooltipProvider } from "@infisical/cipher/ui/tooltip";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";

import {
  ProjectPermissionActions,
  ProjectPermissionAgentVaultSessionActions,
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
  TAgentVaultSessionNamedService
} from "@app/hooks/api/agentVault/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useDebounce } from "@app/hooks/useDebounce";

import { useProjectPermission } from "../../access/permissions";
import { NoExpiry } from "../../components/no-expiry";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
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
  inlineServicesLabel,
  metadataRowsToRecord,
  SESSION_STATUS as STATUS,
  sessionMetadataErrors,
  sessionInlineServices,
  sessionNamedServices,
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
  { key: METADATA_FIELD, label: "Metadata", type: "text", placeholder: "key=value", verb: "is" }
];

const parseMetadataFilter = (filters: FilterBarFilter[]) => {
  const query = filters.find((filter) => filter.field === METADATA_FIELD)?.values[0];
  if (!query?.trim()) return { metadataFilter: undefined, metadataFilterError: undefined };
  const separator = query.indexOf("=");
  if (separator === -1)
    return {
      metadataFilter: undefined,
      metadataFilterError: "Filter metadata as key=value, such as env=production."
    };
  const rows = [{ key: query.slice(0, separator), value: query.slice(separator + 1) }];
  if (!rows[0].key.trim()) return { metadataFilter: undefined, metadataFilterError: "Enter a key" };
  if (!rows[0].value.trim())
    return { metadataFilter: undefined, metadataFilterError: "Enter a value" };
  const errors = sessionMetadataErrors(rows);
  const error = errors && (errors.rows[0].key ?? errors.rows[0].value ?? errors.list);
  if (error) return { metadataFilter: undefined, metadataFilterError: error };
  return { metadataFilter: metadataRowsToRecord(rows), metadataFilterError: undefined };
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
  | { kind: "service"; service: TAgentVaultSessionNamedService }
  | { kind: "inline"; services: TAgentVaultSessionInlineService[] };

const ACCESS_ITEMS_SHOWN = 2;

const toAccessItems = (session: TAgentVaultSession): TAccessItem[] => {
  const inline = sessionInlineServices(session);
  return [
    ...(session.accessBundle ? [{ kind: "bundle" as const, bundle: session.accessBundle }] : []),
    ...sessionNamedServices(session).map((service) => ({ kind: "service" as const, service })),
    ...(inline.length ? [{ kind: "inline" as const, services: inline }] : [])
  ];
};

const accessItemKey = (item: TAccessItem) => {
  if (item.kind === "bundle") return `bundle:${item.bundle.id ?? item.bundle.name}`;
  if (item.kind === "service") return `service:${item.service.id}`;
  return "inline";
};

const accessItemLabel = (item: TAccessItem) => {
  if (item.kind === "bundle") return item.bundle.name;
  if (item.kind === "service") return item.service.name;
  return inlineServicesLabel(item.services.length);
};

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
      <Tooltip content={`${item.bundle.name} (deleted)`}>
        <Badge tone="soft" tabIndex={0} style={{ minWidth: 0 }}>
          <Icon name="package" className="shrink-0" />
          <span className="truncate">{item.bundle.name}</span>
        </Badge>
      </Tooltip>
    );
  if (item.kind === "service")
    return (
      <Tooltip content={item.service.description ?? "A project service this session names"}>
        <Badge tone="outline" tabIndex={0} style={{ minWidth: 0 }}>
          <Icon name="link" className="shrink-0" />
          <span className="truncate">{item.service.name}</span>
        </Badge>
      </Tooltip>
    );
  return (
    <Tooltip content={item.services.map((service) => service.name).join(", ")}>
      <Badge tone="outline" tabIndex={0} style={{ minWidth: 0 }}>
        <Icon name="globe" className="shrink-0" />
        <span className="truncate">{accessItemLabel(item)}</span>
      </Badge>
    </Tooltip>
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
  if (!items.length) return <Meta>-</Meta>;
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
  if (session.status === AgentVaultSessionStatus.Revoked) return null;
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
        icon="agent"
        title="No sessions yet"
        description="Create a session to get a token an agent can run with."
      />
    );
  if (!canManageServices)
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="agent"
        title="No access bundles granted to you"
        description="Ask an admin to grant you an access bundle."
      />
    );
  return (
    <EmptyState
      size="sm"
      media="bare"
      icon="agent"
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
  const { data: accessBundles } = useV4Adapter("agentVault").useAccessBundles(orgId, projectId, {
    limit: 1
  });
  const { data: nameableServices } = useV4Adapter("agentVaultResources").useServices(projectId, {
    limit: 1
  });
  return (accessBundles?.totalCount ?? 0) > 0 || (nameableServices?.totalCount ?? 0) > 0;
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
    render: (row) => <Access session={row} orgId={orgId} projectId={projectId} />
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
    render: (row) => <Expiry session={row} />
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
  const [perPage, setPerPage] = useState(() =>
    getUserTablePreference(TABLE, PreferenceKey.PerPage, 20)
  );

  const statuses = (filters.find((filter) => filter.field === "status")?.values ??
    []) as AgentVaultSessionStatus[];
  const { metadataFilter, metadataFilterError } = parseMetadataFilter(filters);

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
                  : "Sessions need an access bundle or a service you can use"
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
                  setUserTablePreference(TABLE, PreferenceKey.PerPage, next);
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
