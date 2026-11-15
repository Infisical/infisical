import { useEffect, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
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
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import {
  AgentVaultMemberType,
  AgentVaultSessionScope,
  AgentVaultSessionStatus
} from "@app/hooks/api/agentVault/enums";
import type { TAgentVaultSession } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { useAgentVaultCreateIntent } from "@app/hooks/useAgentVaultCreateIntent";
import { useDebounce } from "@app/hooks/useDebounce";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { CreateSessionSheet } from "./create-session-sheet";
import { RevokeSessionDialog } from "./revoke-session-dialog";
import { SessionDetailsSheet } from "./session-details-sheet";
import { SessionLogAlerts } from "./session-log-alerts";
import {
  actorName as displayName,
  AGENT_VAULT_DOCS,
  canEditSessionLabel,
  describeActor,
  formatSessionExpiry,
  formatTimestamp,
  inlineServicesLabel,
  SESSION_STATUS as STATUS
} from "./sessions";

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

const Access = ({
  session,
  orgId,
  projectId
}: {
  session: TAgentVaultSession;
  orgId: string;
  projectId: string;
}) => {
  const { accessBundle, services } = session;
  if (!accessBundle && !services.length) return <Meta>-</Meta>;
  return (
    <Inline gap={4} align="center" style={{ minWidth: 0 }}>
      {accessBundle?.id && (
        <Badge tone="outline" asChild style={{ maxWidth: "100%" }} title={accessBundle.name}>
          <Link
            to={v4Path(
              "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles/$accessBundleId"
            )}
            params={{ orgId, projectId, accessBundleId: accessBundle.id }}
          >
            <Icon name="package" className="shrink-0" />
            <span className="truncate">{accessBundle.name}</span>
          </Link>
        </Badge>
      )}
      {accessBundle && !accessBundle.id && (
        <Tooltip content={`${accessBundle.name} (deleted)`}>
          <Badge tone="soft" tabIndex={0} style={{ maxWidth: "100%" }}>
            <Icon name="package" className="shrink-0" />
            <span className="truncate">{accessBundle.name}</span>
          </Badge>
        </Tooltip>
      )}
      {services.length > 0 && (
        <Tooltip content={services.map((service) => service.name).join(", ")}>
          <Badge tone="outline" tabIndex={0}>
            <Icon name="globe" />
            {inlineServicesLabel(services.length)}
          </Badge>
        </Tooltip>
      )}
    </Inline>
  );
};

const Expiry = ({ session }: { session: TAgentVaultSession }) => {
  if (session.status === AgentVaultSessionStatus.Revoked) return <Meta>-</Meta>;
  if (!session.expiresAt)
    return (
      <Tooltip content="This session runs until someone revokes it.">
        <span>Never</span>
      </Tooltip>
    );
  return (
    <Tooltip content={formatTimestamp(session.expiresAt)}>
      <span>{formatSessionExpiry(session.expiresAt)}</span>
    </Tooltip>
  );
};

const SessionMenu = ({
  session,
  onView,
  onEditLabel,
  onRevoke
}: {
  session: TAgentVaultSession;
  onView: () => void;
  onEditLabel: () => void;
  onRevoke: () => void;
}) => {
  const isActive = session.status === AgentVaultSessionStatus.Active;
  return (
    <>
      <DropdownMenuItem onSelect={onView}>
        <Icon name="file-text" />
        View details
      </DropdownMenuItem>
      {canEditSessionLabel(session) && (
        <DropdownMenuItem onSelect={onEditLabel}>
          <Icon name="pencil" />
          {session.label ? "Edit label" : "Add label"}
        </DropdownMenuItem>
      )}
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
  );
};

const ScopeToggle = ({
  isAdmin,
  scope,
  onChange
}: {
  isAdmin: boolean;
  scope: AgentVaultSessionScope;
  onChange: (next: AgentVaultSessionScope) => void;
}) => (
  <Tooltip content={isAdmin ? undefined : "Only admins can see every session"}>
    <ToggleGroup
      type="single"
      aria-label="Session scope"
      value={isAdmin ? scope : AgentVaultSessionScope.Mine}
      disabled={!isAdmin}
      onValueChange={(next) => {
        if (next) onChange(next as AgentVaultSessionScope);
      }}
    >
      <ToggleGroupItem value={AgentVaultSessionScope.All}>All sessions</ToggleGroupItem>
      <ToggleGroupItem value={AgentVaultSessionScope.Mine}>My sessions</ToggleGroupItem>
    </ToggleGroup>
  </Tooltip>
);

const SessionsEmpty = ({
  orgId,
  projectId,
  isAdmin,
  isFiltered,
  hasReachableBundles,
  onClearFilters
}: {
  orgId: string;
  projectId: string;
  isAdmin: boolean;
  isFiltered: boolean;
  hasReachableBundles: boolean;
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
  if (hasReachableBundles)
    return (
      <EmptyState
        size="sm"
        media="bare"
        icon="agent"
        title="No sessions yet"
        description="Create a session to get a token an agent can run with."
      />
    );
  if (!isAdmin)
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
      description="Sessions need an access bundle, and agents need a proxy to route through."
      actions={
        <Button variant="outline" asChild>
          <Link
            to={v4Path("/organizations/$orgId/projects/agent-vault/$projectId/access-bundles")}
            params={{ orgId, projectId }}
          >
            Go to access bundles
          </Link>
        </Button>
      }
    />
  );
};

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
  const { data: permission } = agentVault.useProjectPermission({ projectId });
  const isAdmin = Boolean(
    permission?.memberships.some((membership) =>
      membership.roles.some(({ role }) => role === ProjectMembershipRole.Admin)
    )
  );

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

  const { data, isPending } = agentVault.useSessions(orgId, projectId, {
    scope: isAdmin ? scope : AgentVaultSessionScope.Mine,
    statuses,
    search: debouncedSearch.trim() || undefined,
    limit: perPage,
    offset: (page - 1) * perPage
  });
  const { data: accessBundles } = agentVault.useAccessBundles(orgId, projectId, { limit: 1 });

  const sessions = data?.sessions ?? [];
  const totalCount = data?.totalCount ?? 0;

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(totalCount / perPage));
    if (!isPending && page > lastPage) setPage(lastPage);
  }, [totalCount, page, perPage, isPending]);

  const isFiltered = Boolean(debouncedSearch.trim()) || statuses.length > 0;
  const hasReachableBundles = (accessBundles?.totalCount ?? 0) > 0;
  useAgentVaultCreateIntent(() => setIsCreateOpen(true), hasReachableBundles);

  const columns: DataTableColumn<TAgentVaultSession>[] = [
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
          onClick={() => setSessionId(row.id)}
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

  const rowActions: DataTableRowActions<TAgentVaultSession> = {
    menuLabel: "Session options",
    renderMenu: (row) => (
      <SessionMenu
        session={row}
        onView={() => setSessionId(row.id)}
        onEditLabel={() => setSessionId(row.id, true)}
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
                hasReachableBundles ? undefined : "Sessions need an access bundle you can use"
              }
              onClick={() => setIsCreateOpen(true)}
            >
              Create session
            </Button>
          }
        />
        {isAdmin && <SessionLogAlerts orgId={orgId} projectId={projectId} />}
        <FilterBar
          label="Session filters"
          fields={[
            {
              key: "status",
              label: "Status",
              type: "multi-select",
              options: Object.values(AgentVaultSessionStatus).map((status) => ({
                value: status,
                label: STATUS[status].label
              }))
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
              placeholder="Search by label, identity, email, or access bundle..."
              kbd="/"
              maxLength={255}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          }
          actions={
            <ScopeToggle
              isAdmin={isAdmin}
              scope={scope}
              onChange={(next) => {
                setScope(next);
                setPage(1);
                setUserTablePreference(TABLE, PreferenceKey.SessionScope, next);
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
          rowLabel={(row) => row.label ?? displayName(row.actor)}
          rowActions={rowActions}
          // v4-check-ignore row-activate-navigates -- opens the session sheet in place; the search param only keeps it addressable
          onRowActivate={(row) => setSessionId(row.id)}
          empty={
            <SessionsEmpty
              orgId={orgId}
              projectId={projectId}
              isAdmin={isAdmin}
              isFiltered={isFiltered}
              hasReachableBundles={hasReachableBundles}
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
          isAdmin={isAdmin}
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
          isAdmin={isAdmin}
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
