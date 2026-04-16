import { useMemo, useState } from "react";
import { faEllipsisV, faHeartPulse, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, IconButton } from "@app/components/v2";
import {
  Badge,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import {
  OrgGatewayPoolPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useAddGatewayToPool, useRemoveGatewayFromPool } from "@app/hooks/api/gateway-pools";
import { TGatewayPool } from "@app/hooks/api/gateway-pools/types";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { useTriggerGatewayV2Heartbeat } from "@app/hooks/api/gateways-v2";
import { GatewayHealthCheckStatus } from "@app/hooks/api/gateways-v2/types";

import { PoolHealthBadge } from "./PoolHealthBadge";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pool: TGatewayPool | null;
};

export const PoolDetailSheet = ({ isOpen, onOpenChange, pool }: Props) => {
  const { data: allGateways } = useQuery({
    ...gatewaysQueryKeys.list(),
    enabled: isOpen
  });
  const addGateway = useAddGatewayToPool();
  const removeGateway = useRemoveGatewayFromPool();
  const triggerHealthCheck = useTriggerGatewayV2Heartbeat();
  const [isAddGatewayOpen, setIsAddGatewayOpen] = useState(false);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["removeGateway"] as const);

  const memberGateways = useMemo(
    () => allGateways?.filter((g) => pool?.memberGatewayIds.includes(g.id)) ?? [],
    [allGateways, pool?.memberGatewayIds]
  );

  const availableGateways = useMemo(
    () => allGateways?.filter((g) => !g.isV1 && !pool?.memberGatewayIds.includes(g.id)) ?? [],
    [allGateways, pool?.memberGatewayIds]
  );

  const handleAdd = async (gatewayId: string) => {
    if (!pool) return;
    try {
      await addGateway.mutateAsync({ poolId: pool.id, gatewayId });
      createNotification({ type: "success", text: "Gateway added to pool" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add gateway";
      createNotification({ type: "error", text: message });
    }
  };

  const handleRemove = async () => {
    if (!pool) return;
    const gwData = popUp.removeGateway.data as { id: string; name: string } | undefined;
    if (!gwData) return;
    try {
      await removeGateway.mutateAsync({ poolId: pool.id, gatewayId: gwData.id });
      handlePopUpToggle("removeGateway", false);
      createNotification({ type: "success", text: `Removed "${gwData.name}" from pool` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to remove gateway";
      createNotification({ type: "error", text: message });
    }
  };

  const handleHealthCheck = async (gatewayId: string) => {
    try {
      await triggerHealthCheck.mutateAsync(gatewayId);
      createNotification({ type: "success", text: "Health check successful" });
    } catch {
      createNotification({ type: "error", text: "Health check failed - gateway is unreachable" });
    }
  };

  if (!pool) return null;

  const createdDate = new Date(pool.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric"
  });

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{pool.name}</SheetTitle>
        </SheetHeader>

        <div className="mx-4 flex items-center gap-7 rounded-md border border-border bg-container px-5 py-3">
          <div>
            <div className="text-xs text-accent">Health</div>
            <div className="mt-0.5 text-sm font-medium">
              <PoolHealthBadge pool={pool} />
            </div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-xs text-accent">Total Gateways</div>
            <div className="mt-0.5 text-sm font-medium text-foreground">{pool.memberCount}</div>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <div className="text-xs text-accent">Created</div>
            <div className="mt-0.5 text-sm font-medium text-foreground">{createdDate}</div>
          </div>
        </div>

        <div className="px-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">Member Gateways</h4>
            <OrgPermissionCan
              I={OrgGatewayPoolPermissionActions.EditGatewayPools}
              a={OrgPermissionSubjects.GatewayPool}
            >
              {(isAllowed: boolean) => {
                const isDisabled = !isAllowed || availableGateways.length === 0;
                return (
                  <Popover open={isAddGatewayOpen} onOpenChange={setIsAddGatewayOpen} modal>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline_bg"
                        size="xs"
                        leftIcon={<FontAwesomeIcon icon={faPlus} />}
                        isDisabled={isDisabled}
                      >
                        Add Gateway
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
                );
              }}
            </OrgPermissionCan>
          </div>

          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead>Name</UnstableTableHead>
                <UnstableTableHead>Status</UnstableTableHead>
                <UnstableTableHead className="w-5" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {memberGateways.length === 0 && (
                <UnstableTableRow>
                  <UnstableTableCell colSpan={3} className="text-center text-sm text-accent">
                    No gateways in this pool
                  </UnstableTableCell>
                </UnstableTableRow>
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
                  <UnstableTableRow key={gw.id}>
                    <UnstableTableCell>
                      <div className="flex items-center gap-2">
                        <span>{gw.name}</span>
                        <Badge variant="neutral">Gateway v{gw.isV1 ? "1" : "2"}</Badge>
                      </div>
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <Badge variant={isOnline ? "success" : "danger"}>
                        {isOnline ? "Healthy" : "Unreachable"}
                      </Badge>
                    </UnstableTableCell>
                    <UnstableTableCell>
                      <UnstableDropdownMenu>
                        <UnstableDropdownMenuTrigger asChild>
                          <IconButton
                            ariaLabel="Options"
                            variant="plain"
                            size="sm"
                            className="p-1.5"
                          >
                            <FontAwesomeIcon icon={faEllipsisV} />
                          </IconButton>
                        </UnstableDropdownMenuTrigger>
                        <UnstableDropdownMenuContent align="end" className="z-[60] min-w-[180px]">
                          {!gw.isV1 && (
                            <UnstableDropdownMenuItem onSelect={() => handleHealthCheck(gw.id)}>
                              <FontAwesomeIcon icon={faHeartPulse} />
                              Trigger health check
                            </UnstableDropdownMenuItem>
                          )}
                          <UnstableDropdownMenuItem
                            variant="danger"
                            onSelect={() =>
                              handlePopUpOpen("removeGateway", { id: gw.id, name: gw.name })
                            }
                          >
                            <FontAwesomeIcon icon={faTrash} />
                            Remove from pool
                          </UnstableDropdownMenuItem>
                        </UnstableDropdownMenuContent>
                      </UnstableDropdownMenu>
                    </UnstableTableCell>
                  </UnstableTableRow>
                );
              })}
            </UnstableTableBody>
          </UnstableTable>
        </div>

        <DeleteActionModal
          isOpen={popUp.removeGateway.isOpen}
          title={`Remove "${(popUp.removeGateway.data as { name: string } | undefined)?.name ?? ""}" from pool?`}
          onChange={(open) => handlePopUpToggle("removeGateway", open)}
          deleteKey="confirm"
          buttonText="Remove"
          onDeleteApproved={handleRemove}
        />
      </SheetContent>
    </Sheet>
  );
};
