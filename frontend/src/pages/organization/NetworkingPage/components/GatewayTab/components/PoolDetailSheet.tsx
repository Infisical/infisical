import { useMemo, useState } from "react";
import { faEllipsisV, faHeartPulse, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogConfirmationLabel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FilterableSelect,
  IconButton,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadLabel,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
import { isGatewayHealthy } from "@app/hooks/api/gateways-v2/utils";

import { PoolHealthBadge } from "./PoolHealthBadge";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  pool: TGatewayPool | null;
};

type GatewayOption = {
  label: string;
  value: string;
};

export const PoolDetailSheet = ({ isOpen, onOpenChange, pool }: Props) => {
  const { data: allGateways } = useQuery({
    ...gatewaysQueryKeys.list(),
    enabled: isOpen
  });
  const addGateway = useAddGatewayToPool();
  const removeGateway = useRemoveGatewayFromPool();
  const triggerHealthCheck = useTriggerGatewayV2Heartbeat();
  const [selectedGateways, setSelectedGateways] = useState<GatewayOption[]>([]);
  const [removeConfirmation, setRemoveConfirmation] = useState("");

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["removeGateway"] as const);

  const memberGateways = useMemo(
    () => allGateways?.filter((g) => pool?.memberGatewayIds.includes(g.id)) ?? [],
    [allGateways, pool?.memberGatewayIds]
  );

  const availableGateways = useMemo(
    () => allGateways?.filter((g) => !g.isV1 && !pool?.memberGatewayIds.includes(g.id)) ?? [],
    [allGateways, pool?.memberGatewayIds]
  );

  const gatewayOptions = useMemo(
    () => availableGateways.map((gateway) => ({ label: gateway.name, value: gateway.id })),
    [availableGateways]
  );

  const handleAdd = async () => {
    if (!pool || selectedGateways.length === 0) return;
    try {
      await Promise.all(
        selectedGateways.map(({ value: gatewayId }) =>
          addGateway.mutateAsync({ poolId: pool.id, gatewayId })
        )
      );
      createNotification({
        type: "success",
        text: `${selectedGateways.length} gateway${selectedGateways.length === 1 ? "" : "s"} added to pool`
      });
      setSelectedGateways([]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add gateways";
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

        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-7 rounded-md border border-border bg-container px-5 py-3">
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

          <div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <h4 className="pt-2 text-sm font-medium text-foreground">Member Gateways</h4>
              <OrgPermissionCan
                I={OrgGatewayPoolPermissionActions.EditGatewayPools}
                a={OrgPermissionSubjects.GatewayPool}
              >
                {(isAllowed: boolean) => {
                  const isDisabled = !isAllowed || availableGateways.length === 0;
                  return (
                    <div className="flex min-w-0 items-start gap-2">
                      <FilterableSelect<GatewayOption>
                        isMulti
                        value={selectedGateways}
                        onChange={(value) =>
                          setSelectedGateways(Array.isArray(value) ? [...value] : [])
                        }
                        options={gatewayOptions}
                        placeholder="Select gateways..."
                        isDisabled={isDisabled || addGateway.isPending}
                        menuPosition="fixed"
                        className="w-64"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-0.5"
                        isDisabled={!isAllowed || selectedGateways.length === 0}
                        isPending={addGateway.isPending}
                        onClick={handleAdd}
                      >
                        Add
                      </Button>
                    </div>
                  );
                }}
              </OrgPermissionCan>
            </div>

            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <TableHeadLabel>Name</TableHeadLabel>
                  </TableHead>
                  <TableHead className="w-36">
                    <TableHeadLabel>Status</TableHeadLabel>
                  </TableHead>
                  <TableHead className="w-12" />
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
                  const isOnline = isGatewayHealthy(gw);

                  return (
                    <TableRow key={gw.id}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">{gw.name}</span>
                          {gw.isV1 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="neutral" className="shrink-0">
                                  V1
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>Legacy</TooltipContent>
                            </Tooltip>
                          )}
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
                            <IconButton
                              aria-label="Gateway options"
                              variant="ghost"
                              size="sm"
                              className="p-1.5"
                            >
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="z-[60] min-w-[180px]">
                            {!gw.isV1 && (
                              <DropdownMenuItem onSelect={() => handleHealthCheck(gw.id)}>
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
          </div>
        </div>

        <AlertDialog
          open={popUp.removeGateway.isOpen}
          onOpenChange={(open) => {
            if (!open) setRemoveConfirmation("");
            handlePopUpToggle("removeGateway", open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Gateway from Gateway Pool?</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogConfirmationField>
              <Field>
                <AlertDialogConfirmationLabel
                  htmlFor="remove-gateway-confirmation"
                  confirmationValue={
                    (popUp.removeGateway.data as { name: string } | undefined)?.name
                  }
                />
                <Input
                  id="remove-gateway-confirmation"
                  value={removeConfirmation}
                  onChange={(event) => setRemoveConfirmation(event.target.value)}
                  placeholder={(popUp.removeGateway.data as { name: string } | undefined)?.name}
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            </AlertDialogConfirmationField>
            <AlertDialogDescription asChild>
              <Alert variant="warning" appearance="borderless">
                <AlertDescription>
                  Removing this gateway from the pool may interrupt traffic. The gateway will not be
                  deleted and can be added back.
                </AlertDescription>
              </Alert>
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel isDisabled={removeGateway.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="danger"
                isPending={removeGateway.isPending}
                isDisabled={
                  removeConfirmation !==
                  (popUp.removeGateway.data as { name: string } | undefined)?.name
                }
                onClick={(event) => {
                  event.preventDefault();
                  handleRemove();
                }}
              >
                Remove Gateway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
};
