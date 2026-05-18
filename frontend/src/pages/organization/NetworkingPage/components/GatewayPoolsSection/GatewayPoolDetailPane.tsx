import { useMemo, useState } from "react";
import { faEllipsisV, faHeartPulse, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeftIcon, CopyIcon, EllipsisVerticalIcon, PenIcon, TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton as V2IconButton } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  OrgGatewayPoolPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  useAddGatewayToPool,
  useDeleteGatewayPool,
  useListGatewayPools,
  useRemoveGatewayFromPool
} from "@app/hooks/api/gateway-pools";
import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { useTriggerGatewayV2Heartbeat } from "@app/hooks/api/gateways-v2";
import { GatewayHealthCheckStatus } from "@app/hooks/api/gateways-v2/types";

import { EditGatewayPoolModal } from "../GatewayTab/components/EditGatewayPoolModal";
import { PoolConnectedResourcesDrawer } from "../GatewayTab/components/PoolConnectedResourcesDrawer";

type Props = {
  poolId: string | null;
  onBack?: () => void;
};

const PoolHealthBadge = ({ pool }: { pool: TGatewayPool }) => {
  if (pool.memberCount === 0) return <Badge variant="neutral">No members</Badge>;
  if (pool.healthyMemberCount === pool.memberCount) {
    return (
      <Badge variant="success">
        {pool.healthyMemberCount}/{pool.memberCount} healthy
      </Badge>
    );
  }
  if (pool.healthyMemberCount === 0) {
    return <Badge variant="danger">0/{pool.memberCount} healthy</Badge>;
  }
  return (
    <Badge variant="warning">
      {pool.healthyMemberCount}/{pool.memberCount} healthy
    </Badge>
  );
};

const PoolDetail = ({ pool, onBack }: { pool: TGatewayPool; onBack?: () => void }) => {
  const { data: allGateways } = useQuery(gatewaysQueryKeys.list());
  const addGateway = useAddGatewayToPool();
  const removeGateway = useRemoveGatewayFromPool();
  const triggerHealthCheck = useTriggerGatewayV2Heartbeat();
  const deletePool = useDeleteGatewayPool();
  const [isAddGatewayOpen, setIsAddGatewayOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "removeGateway",
    "editPool",
    "deletePool"
  ] as const);

  const memberGateways = useMemo(
    () => allGateways?.filter((g) => pool.memberGatewayIds.includes(g.id)) ?? [],
    [allGateways, pool.memberGatewayIds]
  );

  const availableGateways = useMemo(
    () => allGateways?.filter((g) => !g.isV1 && !pool.memberGatewayIds.includes(g.id)) ?? [],
    [allGateways, pool.memberGatewayIds]
  );

  const handleAdd = async (gatewayId: string) => {
    try {
      await addGateway.mutateAsync({ poolId: pool.id, gatewayId });
      createNotification({ type: "success", text: "Gateway added to pool" });
    } catch (err: unknown) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to add gateway"
      });
    }
  };

  const handleRemove = async () => {
    const gwData = popUp.removeGateway.data as { id: string; name: string } | undefined;
    if (!gwData) return;
    try {
      await removeGateway.mutateAsync({ poolId: pool.id, gatewayId: gwData.id });
      handlePopUpToggle("removeGateway", false);
      createNotification({ type: "success", text: `Removed "${gwData.name}" from pool` });
    } catch (err: unknown) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to remove gateway"
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deletePool.mutateAsync(pool.id);
      createNotification({ type: "success", text: `Pool "${pool.name}" deleted` });
      handlePopUpToggle("deletePool", false);
    } catch (err: unknown) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete pool"
      });
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-medium">
          {onBack && (
            <button type="button" onClick={onBack} className="dashboard:hidden">
              <ChevronLeftIcon size={18} />
            </button>
          )}
          {pool.name}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <EllipsisVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={2}>
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(pool.id);
                createNotification({ type: "info", text: "Pool ID copied" });
              }}
            >
              <CopyIcon />
              Copy ID
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handlePopUpOpen("editPool", pool)}>
              <PenIcon />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="danger" onClick={() => handlePopUpOpen("deletePool", pool)}>
              <TrashIcon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">General</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          <DetailGroup>
            <Detail className="flex-row items-center gap-4">
              <DetailLabel className="w-32 shrink-0">Health</DetailLabel>
              <DetailValue>
                <PoolHealthBadge pool={pool} />
              </DetailValue>
            </Detail>
            <Detail className="flex-row items-center gap-4">
              <DetailLabel className="w-32 shrink-0">Total Gateways</DetailLabel>
              <DetailValue>{pool.memberCount}</DetailValue>
            </Detail>
            <Detail className="flex-row items-center gap-4">
              <DetailLabel className="w-32 shrink-0">Connected Resources</DetailLabel>
              <DetailValue>
                {pool.connectedResourcesCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setResourcesOpen(true)}
                    className="cursor-pointer text-mineshaft-200 underline decoration-mineshaft-400 underline-offset-2 hover:text-mineshaft-100"
                  >
                    {pool.connectedResourcesCount} resource
                    {pool.connectedResourcesCount !== 1 ? "s" : ""}
                  </button>
                ) : (
                  <span className="text-muted">&mdash;</span>
                )}
              </DetailValue>
            </Detail>
            <Detail className="flex-row items-center gap-4">
              <DetailLabel className="w-32 shrink-0">Created</DetailLabel>
              <DetailValue>{format(new Date(pool.createdAt), "PPpp")}</DetailValue>
            </Detail>
          </DetailGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Member Gateways</CardTitle>
            <OrgPermissionCan
              I={OrgGatewayPoolPermissionActions.EditGatewayPools}
              a={OrgPermissionSubjects.GatewayPool}
            >
              {(isAllowed: boolean) => (
                <Popover open={isAddGatewayOpen} onOpenChange={setIsAddGatewayOpen} modal>
                  <PopoverTrigger asChild>
                    <Button
                      size="xs"
                      variant="outline"
                      isDisabled={!isAllowed || availableGateways.length === 0}
                    >
                      <FontAwesomeIcon icon={faPlus} className="mr-1" />
                      Add
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="z-[60] w-56 p-0">
                    <Command>
                      <CommandInput placeholder="Search gateways..." />
                      <CommandList>
                        <CommandEmpty>No gateways available.</CommandEmpty>
                        <CommandGroup>
                          {availableGateways.map((gw) => (
                            <CommandItem
                              key={gw.id}
                              value={gw.id}
                              keywords={[gw.name]}
                              onSelect={() => {
                                setIsAddGatewayOpen(false);
                                handleAdd(gw.id);
                              }}
                            >
                              {gw.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </OrgPermissionCan>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {memberGateways.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-accent">
                    No gateways in this pool
                  </TableCell>
                </TableRow>
              )}
              {memberGateways.map((gw) => {
                const hasHeartbeat =
                  "heartbeat" in gw &&
                  gw.heartbeat &&
                  new Date(gw.heartbeat).getTime() > Date.now() - 60 * 60 * 1000;
                const isNotFailed =
                  !("lastHealthCheckStatus" in gw) ||
                  gw.lastHealthCheckStatus !== GatewayHealthCheckStatus.Failed;
                const isOnline = hasHeartbeat && isNotFailed;

                return (
                  <TableRow key={gw.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{gw.name}</span>
                        <Badge variant="neutral">v{gw.isV1 ? "1" : "2"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isOnline ? "success" : "danger"}>
                        {isOnline ? "Healthy" : "Unreachable"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <V2IconButton
                            ariaLabel="Options"
                            variant="plain"
                            size="sm"
                            className="p-1.5"
                          >
                            <FontAwesomeIcon icon={faEllipsisV} />
                          </V2IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="z-[60] min-w-[180px]">
                          {!gw.isV1 && (
                            <DropdownMenuItem
                              onSelect={async () => {
                                try {
                                  await triggerHealthCheck.mutateAsync(gw.id);
                                  createNotification({
                                    type: "success",
                                    text: "Health check successful"
                                  });
                                } catch {
                                  createNotification({
                                    type: "error",
                                    text: "Health check failed"
                                  });
                                }
                              }}
                            >
                              <FontAwesomeIcon icon={faHeartPulse} />
                              Trigger health check
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            variant="danger"
                            onSelect={() =>
                              handlePopUpOpen("removeGateway", { id: gw.id, name: gw.name })
                            }
                          >
                            <FontAwesomeIcon icon={faTrash} />
                            Remove from pool
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <EditGatewayPoolModal
        isOpen={popUp.editPool.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("editPool", isOpen)}
        pool={popUp.editPool.data as TGatewayPool}
      />
      <DeleteActionModal
        isOpen={popUp.deletePool.isOpen}
        title={`Delete pool "${pool.name}"?`}
        onChange={(isOpen) => handlePopUpToggle("deletePool", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleDelete}
      />
      <DeleteActionModal
        isOpen={popUp.removeGateway.isOpen}
        title={`Remove "${(popUp.removeGateway.data as { name: string })?.name ?? ""}" from pool?`}
        onChange={(isOpen) => handlePopUpToggle("removeGateway", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleRemove}
      />
      {resourcesOpen && (
        <PoolConnectedResourcesDrawer
          isOpen={resourcesOpen}
          onOpenChange={setResourcesOpen}
          poolId={pool.id}
          poolName={pool.name}
        />
      )}
    </div>
  );
};

export const GatewayPoolDetailPane = ({ poolId, onBack }: Props) => {
  const { data: pools } = useListGatewayPools({ refetchInterval: 15_000 });
  const pool = pools?.find((p) => p.id === poolId) ?? null;

  if (!poolId) {
    return (
      <Empty className="h-full w-full">
        <EmptyHeader>
          <EmptyTitle>Select a pool to view details</EmptyTitle>
          <EmptyDescription>
            Choose a pool from the list to see its member gateways and connected resources.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!pool) {
    return (
      <Empty className="h-full w-full">
        <EmptyHeader>
          <EmptyTitle>Loading...</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return <PoolDetail pool={pool} onBack={onBack} />;
};
