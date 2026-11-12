import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { HeartPulseIcon, PencilIcon } from "lucide-react";

import { FilterBar } from "@app/components/v4/patterns/filter-bar";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import { DropdownMenuItem, DropdownMenuSeparator } from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import { Switch } from "@app/components/v4/ui/switch";
import { Tabs } from "@app/components/v4/ui/tabs";
import {
  OrgGatewayPermissionActions,
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import type { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";

import { useOrgPermission } from "../../access/permissions";
import { toast } from "../../access/toast";
import { AccessRestricted, RESTRICTED, usePagedList } from "../../access/ui";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, useGo, v4Path } from "../../links";
import { ConfirmDialog } from "../../networking/confirm-dialog";
import { GatewayHealth, isGatewayRegistered } from "../../networking/health";
import { NameDialog } from "../../networking/name-dialog";
import type { NetworkingDialog } from "./NetworkingPage";
import { PoolSheet, PoolsTable } from "./pools";

type GatewayView = "all-gateways" | "gateway-pools";

const matches = (gateway: TGatewayV2, needle: string) =>
  gateway.name.toLowerCase().includes(needle);

const compare = (a: TGatewayV2, b: TGatewayV2, columnId: string) => {
  if (columnId === "connected")
    return a.connectedResourcesCount - b.connectedResourcesCount || a.name.localeCompare(b.name);
  return a.name.localeCompare(b.name);
};

const resourcesLabel = (count: number) => `${count} resource${count === 1 ? "" : "s"}`;

const Enforcement = ({ onUpgrade }: { onUpgrade: () => void }) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const org = useV4Adapter("org");
  const { data: organization } = org.useOrganization(orgId);
  const { data: subscription } = useV4Adapter("networking").useSubscription(orgId);
  const update = org.useUpdateOrganization();
  const { permission } = useOrgPermission();
  const canEdit = permission.can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  const required = Boolean(organization?.requireGatewayPools);
  return (
    <Card
      title={
        <Inline gap={8} align="center">
          Require gateway pools
          {required && <Badge tone="ok">Active</Badge>}
        </Inline>
      }
      description="Resources connect only through a gateway pool, not an individual gateway. Resources already using an individual gateway keep working."
      action={
        <Switch
          aria-label="Require gateway pools"
          checked={required}
          disabled={!canEdit || update.isPending}
          title={canEdit ? undefined : RESTRICTED}
          onChange={async (next) => {
            if (next && !subscription?.gatewayPool) {
              onUpgrade();
              return;
            }
            await update.mutateAsync({ orgId, requireGatewayPools: next });
            toast({
              tone: "ok",
              title: next
                ? "Resources in this organization now require a gateway pool"
                : "Resources in this organization can now use individual gateways"
            });
          }}
        />
      }
    />
  );
};

export const GatewaysPanel = ({
  view,
  onViewChange,
  dialog,
  onDialogChange
}: {
  view: GatewayView;
  onViewChange: (view: GatewayView) => void;
  dialog?: NetworkingDialog;
  onDialogChange: (dialog?: NetworkingDialog) => void;
}) => {
  const { orgId } = useParams({ from: v4Path("/organizations/$orgId") });
  const navigate = useNavigate();
  const go = useGo();
  const networking = useV4Adapter("networking");
  const { permission, isPending: permissionPending } = useOrgPermission();
  const { data: subscription } = networking.useSubscription(orgId);
  const showPools = Boolean(subscription?.gatewayPool);
  const { data: gateways = [], isPending } = networking.useGateways();
  const { data: pools = [] } = networking.usePools({
    enabled: showPools,
    refetchInterval: 15_000
  });
  const createGateway = networking.useCreateGateway();
  const updateGateway = networking.useUpdateGateway();
  const deleteGateway = networking.useDeleteGateway();
  const createPool = networking.useCreatePool();
  const heartbeat = networking.useTriggerGatewayHeartbeat();
  const [poolSearch, setPoolSearch] = useState("");
  const [renaming, setRenaming] = useState<TGatewayV2>();
  const [deleting, setDeleting] = useState<TGatewayV2>();
  const [poolId, setPoolId] = useState<string>();
  const list = usePagedList({
    rows: gateways,
    matches,
    compare,
    initialSort: { columnId: "name", direction: "asc" }
  });
  const poolsByGateway = useMemo(() => {
    const map = new Map<string, TGatewayPool[]>();
    pools.forEach((pool) =>
      pool.memberGatewayIds.forEach((gatewayId) =>
        map.set(gatewayId, [...(map.get(gatewayId) ?? []), pool])
      )
    );
    return map;
  }, [pools]);

  const can = (action: OrgGatewayPermissionActions) =>
    permission.can(action, OrgPermissionSubjects.Gateway);

  if (!permissionPending && !can(OrgGatewayPermissionActions.ListGateways))
    return <AccessRestricted requirement="list Gateways" />;

  const canEdit = can(OrgGatewayPermissionActions.EditGateways);
  const canDelete = can(OrgGatewayPermissionActions.DeleteGateways);
  const isPools = view === "gateway-pools";

  const checkHealth = async (gateway: TGatewayV2) => {
    try {
      await heartbeat.mutateAsync(gateway.id);
      toast({ tone: "ok", title: "Health check successful, the gateway is healthy" });
    } catch {
      toast({ tone: "bad", title: "Health check failed, the gateway is unreachable" });
    }
  };

  const columns: DataTableColumn<TGatewayV2>[] = [
    {
      id: "name",
      header: "Name",
      sortable: true,
      grow: true,
      text: (gateway) => gateway.name,
      render: (gateway) => (
        <RowLink
          link={go.link(orgHref(orgId, `/networking/gateways/${gateway.id}`))}
          title={gateway.name}
        >
          {gateway.name}
        </RowLink>
      )
    },
    ...(showPools
      ? [
          {
            id: "pools",
            header: "Pools",
            width: 240,
            render: (gateway: TGatewayV2) => {
              const memberOf = poolsByGateway.get(gateway.id) ?? [];
              if (!memberOf.length) return <span aria-label="No pools">-</span>;
              return (
                <Inline gap={4} wrap>
                  {memberOf.map((pool) => (
                    <Button
                      key={pool.id}
                      variant="link"
                      underline="hover"
                      data-row-interactive=""
                      onClick={() => setPoolId(pool.id)}
                    >
                      {pool.name}
                    </Button>
                  ))}
                </Inline>
              );
            }
          }
        ]
      : []),
    {
      id: "connected",
      header: "Connected",
      sortable: true,
      width: 140,
      render: (gateway) =>
        gateway.connectedResourcesCount > 0 ? (
          resourcesLabel(gateway.connectedResourcesCount)
        ) : (
          <span aria-label="None">-</span>
        )
    },
    {
      id: "health",
      header: "Health check",
      width: 160,
      render: (gateway) => <GatewayHealth gateway={gateway} />
    }
  ];

  return (
    <Stack gap={24}>
      <FilterBar
        label={isPools ? "Gateway pool filters" : "Gateway filters"}
        fields={[]}
        value={[]}
        onChange={() => undefined}
        search={
          <Input
            icon="search"
            aria-label={isPools ? "Search gateway pools" : "Search gateways"}
            placeholder={isPools ? "Search pools" : "Search gateways"}
            kbd="/"
            value={isPools ? poolSearch : list.search}
            onChange={(event) =>
              isPools ? setPoolSearch(event.target.value) : list.setSearch(event.target.value)
            }
          />
        }
        actions={
          <Tabs
            variant="segmented"
            label="Gateway view"
            value={view}
            onChange={(value) => onViewChange(value as GatewayView)}
            tabs={[
              { value: "all-gateways", label: "All gateways", content: null },
              { value: "gateway-pools", label: "Gateway pools", content: null }
            ]}
          />
        }
      />
      {isPools ? (
        <PoolsTable
          search={poolSearch}
          onOpenPool={setPoolId}
          onUpgrade={() => onDialogChange("upgrade")}
        />
      ) : (
        <DataTable
          label="Gateways"
          rows={list.pageRows}
          loading={isPending}
          columns={columns}
          getRowId={(gateway) => gateway.id}
          rowLabel={(gateway) => gateway.name}
          sort={list.sort}
          onSortChange={list.setSort}
          pagination={list.pagination}
          rowActions={{
            inline: [
              {
                label: "Trigger health check",
                icon: HeartPulseIcon,
                disabledReason: (gateway) =>
                  isGatewayRegistered(gateway) ? undefined : "This gateway is not registered yet",
                onSelect: checkHealth
              }
            ],
            renderMenu: (gateway) => (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    navigator.clipboard?.writeText(gateway.id);
                    toast({ tone: "neutral", title: "Gateway ID copied to clipboard" });
                  }}
                >
                  <Icon name="copy" />
                  Copy ID
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canEdit}
                  description={canEdit ? undefined : RESTRICTED}
                  onSelect={() => setRenaming(gateway)}
                >
                  <Icon icon={PencilIcon} />
                  Rename gateway
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  description={canDelete ? undefined : RESTRICTED}
                  onSelect={() => setDeleting(gateway)}
                >
                  <Icon name="trash" />
                  Delete gateway
                </DropdownMenuItem>
              </>
            )
          }}
          empty={
            gateways.length ? (
              <EmptyState
                size="sm"
                icon="search"
                title="No gateways match your search"
                actions={
                  <Button variant="link" onClick={() => list.setSearch("")}>
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState size="sm" icon="globe" title="No gateways yet" />
            )
          }
        />
      )}
      <Enforcement onUpgrade={() => onDialogChange("upgrade")} />
      <NameDialog
        open={dialog === "gateway"}
        onOpenChange={(open) => !open && onDialogChange(undefined)}
        title="Create gateway"
        description="Create a gateway to securely proxy Infisical traffic into your infrastructure."
        placeholder="prod-us-east"
        submitLabel="Create gateway"
        taken={gateways.map((gateway) => gateway.name)}
        onSubmit={async (name) => {
          const gateway = await createGateway.mutateAsync({
            name,
            authMethod: { method: "token" }
          });
          navigate({
            to: v4Path("/organizations/$orgId/networking/gateways/$gatewayId"),
            params: { orgId, gatewayId: gateway.id }
          });
        }}
      />
      <NameDialog
        open={dialog === "pool"}
        onOpenChange={(open) => !open && onDialogChange(undefined)}
        title="Create gateway pool"
        description="Group gateways for high availability and automatic failover."
        placeholder="us-primary"
        submitLabel="Create pool"
        taken={pools.map((pool) => pool.name)}
        onSubmit={async (name) => {
          await createPool.mutateAsync({ name });
          toast({ tone: "ok", title: `Pool "${name}" created` });
        }}
      />
      <NameDialog
        open={Boolean(renaming)}
        onOpenChange={(open) => !open && setRenaming(undefined)}
        title="Rename gateway"
        initialName={renaming?.name}
        placeholder="prod-us-east"
        submitLabel="Save changes"
        onSubmit={async (name) => {
          if (!renaming) return;
          await updateGateway.mutateAsync({ gatewayId: renaming.id, name });
          toast({ tone: "ok", title: "Gateway renamed" });
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={`Delete ${deleting?.name ?? "gateway"}?`}
        description="This permanently removes the gateway from your organization and cannot be undone."
        confirmText={deleting?.name ?? ""}
        action="Delete gateway"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteGateway.mutateAsync(deleting.id);
          toast({ tone: "ok", title: "Successfully deleted gateway" });
        }}
      />
      <PoolSheet
        pool={pools.find((pool) => pool.id === poolId)}
        onOpenChange={(open) => !open && setPoolId(undefined)}
      />
    </Stack>
  );
};
