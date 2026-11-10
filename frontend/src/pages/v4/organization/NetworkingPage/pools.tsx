import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { format } from "date-fns";
import { HeartPulseIcon, PencilIcon } from "lucide-react";

import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList } from "@app/components/v4/ui/list";
import { MultiSelect } from "@app/components/v4/ui/multi-select";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { StatusText } from "@app/components/v4/ui/text";
import {
  OrgGatewayPoolPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type {
  TGatewayPool,
  TGatewayPoolConnectedResources
} from "@app/hooks/api/gateway-pools/types";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

import { useOrgPermission } from "../../access/permissions";
import { toast } from "../../access/toast";
import { RESTRICTED, usePagedList } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { ConfirmDialog } from "../../networking/confirm-dialog";
import { PoolHealth } from "../../networking/health";
import { NameDialog } from "../../networking/name-dialog";

const resourcesLabel = (count: number) => `${count} resource${count === 1 ? "" : "s"}`;

const matchesAll = () => true;
const compare = (a: TGatewayPool, b: TGatewayPool, columnId: string) => {
  if (columnId === "connected")
    return a.connectedResourcesCount - b.connectedResourcesCount || a.name.localeCompare(b.name);
  if (columnId === "health")
    return a.healthyMemberCount - b.healthyMemberCount || a.name.localeCompare(b.name);
  return a.name.localeCompare(b.name);
};

const usePoolPermissions = () => {
  const { permission } = useOrgPermission();
  const can = (action: OrgGatewayPoolPermissionActions) =>
    permission.can(action, OrgPermissionSubjects.GatewayPool);
  return {
    canEdit: can(OrgGatewayPoolPermissionActions.EditGatewayPools),
    canDelete: can(OrgGatewayPoolPermissionActions.DeleteGatewayPools)
  };
};

type ResourceRow = { id: string; name: string; type: string; location: string; href?: string };

const resourceRows = (orgId: string, resources?: TGatewayPoolConnectedResources): ResourceRow[] =>
  resources
    ? [
        ...resources.kubernetesAuths.map((auth) => ({
          id: auth.id,
          name: auth.identityName ?? auth.identityId,
          type: "Kubernetes auth",
          location: "Machine identity",
          href: orgHref(orgId, `/identities/${auth.identityId}`)
        })),
        ...resources.pkiDiscoveryConfigs.map((config) => ({
          id: config.id,
          name: config.name,
          type: "PKI discovery",
          location: config.projectName ?? "PKI discovery"
        })),
        ...resources.appConnections.map((connection) => ({
          id: connection.id,
          name: connection.name,
          type: "App connection",
          location: [connection.app, connection.projectName].filter(Boolean).join(", ")
        })),
        ...resources.dynamicSecrets.map((secret) => ({
          id: secret.id,
          name: secret.name,
          type: "Dynamic secret",
          location: [secret.type, secret.environmentSlug, secret.projectName]
            .filter(Boolean)
            .join(", ")
        }))
      ]
    : [];

const PoolResourcesSheet = ({
  pool,
  onOpenChange
}: {
  pool?: { id: string; name: string };
  onOpenChange: (open: boolean) => void;
}) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const go = useGo();
  const { data, isPending } = useV4Adapter("networking").usePoolResources(pool?.id ?? "");
  const rows = resourceRows(orgId, data);
  const columns: DataTableColumn<ResourceRow>[] = [
    {
      id: "name",
      header: "Name",
      grow: true,
      render: (row) =>
        row.href ? (
          <RowLink {...go.link(row.href)} title={row.name}>
            {row.name}
          </RowLink>
        ) : (
          row.name
        )
    },
    { id: "type", header: "Type", width: 150, render: (row) => row.type },
    { id: "location", header: "Location", width: 180, render: (row) => row.location }
  ];
  return (
    <Sheet open={Boolean(pool)} onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Connected resources</SheetTitle>
          <SheetDescription>{pool?.name}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <DataTable
            label="Connected resources"
            rows={rows}
            loading={isPending}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            empty={<EmptyState size="sm" icon="link" title="No resources connected to this pool" />}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};

export const PoolSheet = ({
  pool,
  onOpenChange
}: {
  pool?: TGatewayPool;
  onOpenChange: (open: boolean) => void;
}) => {
  const networking = useV4Adapter("networking");
  const { canEdit } = usePoolPermissions();
  const { data: gateways = [] } = networking.useConnectedGateways(Boolean(pool));
  const addGateway = networking.useAddGatewayToPool();
  const removeGateway = networking.useRemoveGatewayFromPool();
  const heartbeat = networking.useTriggerGatewayHeartbeat();
  const [selected, setSelected] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TGatewayV2>();
  const members = gateways.filter((gateway) => pool?.memberGatewayIds.includes(gateway.id));
  const available = gateways.filter((gateway) => !pool?.memberGatewayIds.includes(gateway.id));

  const columns: DataTableColumn<TGatewayV2>[] = [
    { id: "name", header: "Name", grow: true, render: (gateway) => gateway.name },
    {
      id: "status",
      header: "Status",
      width: 140,
      render: (gateway) =>
        isGatewayHealthy(gateway) ? (
          <StatusText tone="ok" icon="check-c">
            Healthy
          </StatusText>
        ) : (
          <StatusText tone="bad" icon="x">
            Unreachable
          </StatusText>
        )
    }
  ];

  let addReason: string | undefined;
  if (!canEdit) addReason = RESTRICTED;
  else if (!available.length) addReason = "Every connected gateway is already in this pool";

  return (
    <Sheet
      open={Boolean(pool)}
      onOpenChange={(open) => {
        if (!open) setSelected([]);
        onOpenChange(open);
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>{pool?.name}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {pool && (
            <Stack gap={24}>
              <DataList
                variant="props"
                density="compact"
                items={[
                  ["Health", <PoolHealth key="health" pool={pool} />, { span: "half" }],
                  ["Total gateways", String(pool.memberCount), { span: "half" }],
                  ["Created", format(new Date(pool.createdAt), "PP")]
                ]}
              />
              <Card
                variant="framed"
                title="Member gateways"
                action={
                  <Inline gap={8} align="center" wrap={false}>
                    <MultiSelect
                      label="Select gateways"
                      placeholder="Select gateways"
                      size="sm"
                      options={available.map((gateway) => ({
                        value: gateway.id,
                        label: gateway.name
                      }))}
                      value={selected}
                      onChange={setSelected}
                      disabled={Boolean(addReason) || adding}
                    />
                    <Button
                      variant="outline"
                      size="xs"
                      loading={adding}
                      disabledReason={addReason}
                      disabled={!selected.length}
                      onClick={async () => {
                        setAdding(true);
                        try {
                          await Promise.all(
                            selected.map((gatewayId) =>
                              addGateway.mutateAsync({ poolId: pool.id, gatewayId })
                            )
                          );
                          toast({
                            tone: "ok",
                            title: `${selected.length} gateway${selected.length === 1 ? "" : "s"} added to pool`
                          });
                          setSelected([]);
                        } catch {
                          // The global mutation handler reports the API error.
                        } finally {
                          setAdding(false);
                        }
                      }}
                    >
                      Add
                    </Button>
                  </Inline>
                }
              >
                <DataTable
                  label="Member gateways"
                  rows={members}
                  columns={columns}
                  getRowId={(gateway) => gateway.id}
                  rowLabel={(gateway) => gateway.name}
                  rowActions={{
                    inline: [
                      {
                        label: "Trigger health check",
                        icon: HeartPulseIcon,
                        onSelect: async (gateway) => {
                          try {
                            await heartbeat.mutateAsync(gateway.id);
                            toast({ tone: "ok", title: "Health check successful" });
                          } catch {
                            toast({
                              tone: "bad",
                              title: "Health check failed, the gateway is unreachable"
                            });
                          }
                        }
                      }
                    ],
                    renderMenu: (gateway) => (
                      <DropdownMenuItem
                        variant="destructive"
                        disabled={!canEdit}
                        description={canEdit ? undefined : RESTRICTED}
                        onSelect={() => setRemoving(gateway)}
                      >
                        <Icon name="trash" />
                        Remove from pool
                      </DropdownMenuItem>
                    )
                  }}
                  empty={<EmptyState size="sm" icon="globe" title="No gateways in this pool" />}
                />
              </Card>
            </Stack>
          )}
        </SheetBody>
      </SheetContent>
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={`Remove ${removing?.name ?? "gateway"} from ${pool?.name ?? "the pool"}?`}
        description="Removing this gateway from the pool may interrupt traffic. The gateway is not deleted and can be added back."
        confirmText={removing?.name ?? ""}
        action="Remove gateway"
        onConfirm={async () => {
          if (!removing || !pool) return;
          await removeGateway.mutateAsync({ poolId: pool.id, gatewayId: removing.id });
          toast({ tone: "ok", title: `Removed "${removing.name}" from pool` });
        }}
      />
    </Sheet>
  );
};

export const PoolsTable = ({
  search,
  onOpenPool,
  onUpgrade
}: {
  search: string;
  onOpenPool: (poolId: string) => void;
  onUpgrade: () => void;
}) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const networking = useV4Adapter("networking");
  const { data: subscription } = networking.useSubscription(orgId);
  const isEnterprise = Boolean(subscription?.gatewayPool);
  const { data: pools = [], isPending } = networking.usePools({
    enabled: isEnterprise,
    refetchInterval: 15_000
  });
  const updatePool = networking.useUpdatePool();
  const deletePool = networking.useDeletePool();
  const { canEdit, canDelete } = usePoolPermissions();
  const [editing, setEditing] = useState<TGatewayPool>();
  const [deleting, setDeleting] = useState<TGatewayPool>();
  const [resourcesOf, setResourcesOf] = useState<TGatewayPool>();
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return pools.filter((pool) => pool.name.toLowerCase().includes(needle));
  }, [pools, search]);
  const list = usePagedList({
    rows: visible,
    matches: matchesAll,
    compare,
    initialSort: { columnId: "name", direction: "asc" }
  });

  let empty = <EmptyState size="sm" icon="globe" title="No gateway pools yet" />;
  if (pools.length)
    empty = <EmptyState size="sm" icon="search" title="No gateway pools match your search" />;
  if (!isEnterprise)
    empty = (
      <EmptyState
        size="sm"
        icon="globe"
        title="Gateway pools need an Enterprise plan"
        actions={
          <Button variant="outline" onClick={onUpgrade}>
            Learn more
          </Button>
        }
      />
    );

  const columns: DataTableColumn<TGatewayPool>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      text: (pool) => pool.name,
      render: (pool) => (
        <Button variant="link" underline="hover" onClick={() => onOpenPool(pool.id)}>
          {pool.name}
        </Button>
      )
    },
    {
      id: "connected",
      header: "Connected",
      sortable: true,
      width: 160,
      render: (pool) =>
        pool.connectedResourcesCount > 0 ? (
          <Button
            variant="link"
            underline="hover"
            data-row-interactive=""
            onClick={() => setResourcesOf(pool)}
          >
            {resourcesLabel(pool.connectedResourcesCount)}
          </Button>
        ) : (
          <span aria-label="None">-</span>
        )
    },
    {
      id: "health",
      header: "Health",
      sortable: true,
      width: 160,
      render: (pool) => <PoolHealth pool={pool} />
    }
  ];

  return (
    <>
      <DataTable
        label="Gateway pools"
        rows={list.pageRows}
        loading={isEnterprise && isPending}
        columns={columns}
        getRowId={(pool) => pool.id}
        rowLabel={(pool) => pool.name}
        sort={list.sort}
        onSortChange={list.setSort}
        pagination={list.pagination}
        onRowActivate={(pool) => onOpenPool(pool.id)}
        rowActions={{
          inline: [
            {
              label: "Edit pool",
              icon: PencilIcon,
              disabledReason: () => (canEdit ? undefined : RESTRICTED),
              onSelect: setEditing
            }
          ],
          renderMenu: (pool) => (
            <>
              <DropdownMenuItem onSelect={() => onOpenPool(pool.id)}>
                <Icon name="settings" />
                Manage gateways
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!pool.connectedResourcesCount}
                description={pool.connectedResourcesCount ? undefined : "No connected resources"}
                onSelect={() => setResourcesOf(pool)}
              >
                <Icon name="link" />
                View resources
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!canDelete}
                description={canDelete ? undefined : RESTRICTED}
                onSelect={() => setDeleting(pool)}
              >
                <Icon name="trash" />
                Delete pool
              </DropdownMenuItem>
            </>
          )
        }}
        empty={empty}
      />
      <NameDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(undefined)}
        title="Edit gateway pool"
        initialName={editing?.name}
        submitLabel="Save changes"
        taken={pools.filter((pool) => pool.id !== editing?.id).map((pool) => pool.name)}
        onSubmit={async (name) => {
          if (!editing) return;
          await updatePool.mutateAsync({ poolId: editing.id, name });
          toast({ tone: "ok", title: "Pool updated" });
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "gateway pool"}?`}
        description="This permanently removes the gateway pool from your organization and cannot be undone."
        confirmText={deleting?.name ?? ""}
        action="Delete pool"
        onConfirm={async () => {
          if (!deleting) return;
          await deletePool.mutateAsync(deleting.id);
          toast({ tone: "ok", title: `Pool "${deleting.name}" deleted` });
        }}
      />
      <PoolResourcesSheet
        pool={resourcesOf}
        onOpenChange={(open) => !open && setResourcesOf(undefined)}
      />
    </>
  );
};
