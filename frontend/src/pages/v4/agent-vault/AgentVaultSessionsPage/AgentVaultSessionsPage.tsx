import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";

import { FilterBar, type FilterBarFilter } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "@app/components/v4/ui/data-table";
import { DocumentationLinkBadge } from "@app/components/v4/ui/documentation-link-badge";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyState,
  EmptyTitle
} from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Pagination } from "@app/components/v4/ui/pagination";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Meta, StatusText } from "@app/components/v4/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@app/components/v4/ui/toggle-group";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";
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
import type { TAgentVaultSession, TAgentVaultSessionActor } from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { useDebounce } from "@app/hooks/useDebounce";

import { useV4Adapter } from "../../data/adapters";

const route = "/v4/organizations/$orgId/projects/agent-vault/$projectId/sessions";
const NOT_PORTED = "Not available in v4 yet";
const TABLE = "agentVaultSessionsTable";

const STATUS: Record<
  AgentVaultSessionStatus,
  { label: string; tone: "ok" | "bad" | "neutral"; icon: "check-c" | "x" | "clock" }
> = {
  [AgentVaultSessionStatus.Active]: { label: "Active", tone: "ok", icon: "check-c" },
  [AgentVaultSessionStatus.Revoked]: { label: "Revoked", tone: "bad", icon: "x" },
  [AgentVaultSessionStatus.Expired]: { label: "Expired", tone: "neutral", icon: "clock" }
};

const displayName = (actor: TAgentVaultSessionActor) => {
  if (actor.type !== AgentVaultMemberType.User) return actor.name;
  const fullName = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return fullName || actor.username || actor.email || "Unknown";
};

const describeActor = (actor: TAgentVaultSessionActor) => {
  const name = displayName(actor);
  if (actor.id === null) return `"${name}" was deleted`;
  if (actor.type === AgentVaultMemberType.MachineIdentity) return `${actor.id} (machine identity)`;
  const subtitle = actor.email || actor.username;
  return name === subtitle ? subtitle : `${name} (${subtitle})`;
};

const Identity = ({ session }: { session: TAgentVaultSession }) => (
  <Stack gap={0} style={{ minWidth: 0 }}>
    <Inline gap={8} align="center" wrap={false}>
      <Icon
        name={session.actor.type === AgentVaultMemberType.MachineIdentity ? "machine" : "user"}
      />
      <Tooltip content={describeActor(session.actor)}>
        <span>{displayName(session.actor)}</span>
      </Tooltip>
    </Inline>
    {session.onBehalfOf && (
      <Tooltip content={describeActor(session.onBehalfOf)}>
        <Meta mono={false} tabIndex={0}>
          On behalf of {displayName(session.onBehalfOf)}
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
    <Inline gap={4} align="center">
      {accessBundle?.id && (
        <Badge tone="outline" asChild>
          <Link
            to="/v4/organizations/$orgId/projects/$"
            params={{
              orgId,
              _splat: `agent-vault/${projectId}/access-bundles/${accessBundle.id}`
            }}
          >
            <Icon name="folder" />
            {accessBundle.name}
          </Link>
        </Badge>
      )}
      {accessBundle && !accessBundle.id && (
        <Tooltip content={`${accessBundle.name} (deleted)`}>
          <Badge tone="soft" tabIndex={0}>
            <Icon name="folder" />
            {accessBundle.name}
          </Badge>
        </Tooltip>
      )}
      {services.length > 0 && (
        <Tooltip content={services.map((service) => service.name).join(", ")}>
          <Badge tone="outline" tabIndex={0}>
            <Icon name="globe" />
            {services.length === 1 ? "1 inline service" : `${services.length} inline services`}
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
  const expiry = new Date(session.expiresAt);
  const hasPassed = expiry.getTime() <= Date.now();
  return (
    <Tooltip content={format(expiry, "MMM d, yyyy h:mm a")}>
      <span>
        {`${hasPassed ? "" : "in "}${formatDistanceToNowStrict(expiry, { addSuffix: hasPassed })}`}
      </span>
    </Tooltip>
  );
};

const Sessions = ({ orgId, projectId }: { orgId: string; projectId: string }) => {
  const agentVault = useV4Adapter("agentVault");
  const navigate = useNavigate();
  const { sessionId } = useSearch({ from: route });
  const setSessionId = (next: string | undefined) =>
    navigate({
      to: route,
      params: { orgId, projectId },
      search: (prev) => ({ ...prev, sessionId: next })
    });
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

  const openPlaceholder = (path: string) =>
    navigate({ to: "/v4/organizations/$orgId/$", params: { orgId, _splat: path } });

  const columns: DataTableColumn<TAgentVaultSession>[] = [
    {
      id: "label",
      header: "Label",
      primary: true,
      width: 224,
      text: (row) => row.label ?? "",
      render: (row) => (
        <RowLink
          to={route}
          params={{ orgId, projectId }}
          search={(prev) => ({ ...prev, sessionId: row.id })}
          title={row.label ?? undefined}
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {row.label ?? <Meta mono={false}>No label</Meta>}
        </RowLink>
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
    inline: [
      {
        label: (row) => `View session logs for ${row.label ?? displayName(row.actor)}`,
        icon: "history",
        onSelect: (row) => setSessionId(row.id)
      }
    ],
    menuLabel: "Session options",
    renderMenu: (row) => {
      const isLabelEditable = row.actor.id !== null && row.onBehalfOf?.id !== null;
      return (
        <>
          <DropdownMenuItem
            disabled
            description={
              isLabelEditable
                ? NOT_PORTED
                : "The session's owner, or the user it acts on behalf of, was deleted"
            }
          >
            <Icon name="file" />
            {row.label ? "Edit label" : "Add label"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled
            description={
              row.status === AgentVaultSessionStatus.Active
                ? NOT_PORTED
                : "Only an active session can be revoked"
            }
          >
            <Icon name="x" />
            Revoke session
          </DropdownMenuItem>
        </>
      );
    }
  };

  let emptyTitle = "No sessions yet";
  let emptyDescription = "A session gives an agent a token to run with.";
  if (!hasReachableBundles) {
    emptyTitle = isAdmin ? "No sessions yet" : "No access bundles granted to you";
    emptyDescription = isAdmin
      ? "Sessions need an access bundle, and agents need a proxy to route through."
      : "Ask an admin to grant you an access bundle.";
  }

  return (
    <TooltipProvider>
      <Stack gap={24}>
        <PageHeader
          title="Sessions"
          description="Tokens that let your agents reach the services they need."
          badges={
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/agent-vault/sessions" />
          }
          actions={
            <Tooltip content={NOT_PORTED}>
              <Button variant="accent" icon="plus" aria-disabled>
                Create session
              </Button>
            </Tooltip>
          }
        />
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
            <Tooltip content={isAdmin ? undefined : "Only admins can see every session"}>
              <ToggleGroup
                type="single"
                aria-label="Session scope"
                value={isAdmin ? scope : AgentVaultSessionScope.Mine}
                disabled={!isAdmin}
                onValueChange={(next) => {
                  if (!next) return;
                  setScope(next as AgentVaultSessionScope);
                  setPage(1);
                  setUserTablePreference(TABLE, PreferenceKey.SessionScope, next);
                }}
              >
                <ToggleGroupItem value={AgentVaultSessionScope.All}>All sessions</ToggleGroupItem>
                <ToggleGroupItem value={AgentVaultSessionScope.Mine}>My sessions</ToggleGroupItem>
              </ToggleGroup>
            </Tooltip>
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
          empty={
            isFiltered ? (
              <EmptyState
                size="sm"
                media="bare"
                icon="search"
                title="No sessions match these filters"
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
                icon="agent"
                title={emptyTitle}
                description={emptyDescription}
                actions={
                  !hasReachableBundles && isAdmin ? (
                    <Button
                      variant="outline"
                      onClick={() =>
                        openPlaceholder(`projects/agent-vault/${projectId}/access-bundles`)
                      }
                    >
                      Go to access bundles
                    </Button>
                  ) : undefined
                }
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
        <Sheet open={Boolean(sessionId)} onOpenChange={(open) => !open && setSessionId(undefined)}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>
                {sessions.find((session) => session.id === sessionId)?.label ?? sessionId}
              </SheetTitle>
            </SheetHeader>
            <SheetBody>
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>This page isn&apos;t in v4 yet</EmptyTitle>
                  <EmptyDescription>
                    {`/organizations/${orgId}/projects/agent-vault/${projectId}/sessions?sessionId=${sessionId}`}{" "}
                    hasn&apos;t been ported to the new app. The demo shows the pages that have.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </SheetBody>
          </SheetContent>
        </Sheet>
      </Stack>
    </TooltipProvider>
  );
};

export const AgentVaultSessionsPage = () => {
  const { orgId, projectId } = useParams({ from: route });
  return <Sessions key={projectId} orgId={orgId} projectId={projectId} />;
};
