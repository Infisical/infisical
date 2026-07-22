import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CopyIcon,
  DoorClosedIcon,
  HeartPulseIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
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
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgGatewayPoolPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useSubscription } from "@app/context/SubscriptionContext";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useListGatewayPools } from "@app/hooks/api/gateway-pools";
import { gatewaysQueryKeys, useDeleteGatewayById } from "@app/hooks/api/gateways";
import { useDeleteGatewayV2ById, useTriggerGatewayV2Heartbeat } from "@app/hooks/api/gateways-v2";

import { CreateGatewayPoolModal } from "./components/CreateGatewayPoolModal";
import { EditGatewayDetailsModal } from "./components/EditGatewayDetailsModal";
import { GatewayDeployModal } from "./components/GatewayDeployModal";
import { GatewayHealthStatus } from "./components/GatewayHealthStatus";
import { GatewayPoolsContent } from "./components/GatewayPoolsContent";

export const GatewayTab = withPermission(
  () => {
    const navigate = useNavigate();
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";
    const [activeSubTab, setActiveSubTab] = useState<"all-gateways" | "gateway-pools">(
      "all-gateways"
    );
    const { subscription } = useSubscription();
    const showPoolsTab = subscription?.gatewayPool;
    const [search, setSearch] = useState("");
    const [poolSearch, setPoolSearch] = useState("");
    const { data: gateways, isPending: isGatewaysLoading } = useQuery({
      ...gatewaysQueryKeys.listWithTokens(),
      refetchInterval: 15_000
    });
    const { data: pools } = useListGatewayPools({ enabled: Boolean(showPoolsTab) });

    // Build reverse map: gatewayId -> pool names
    const gatewayPoolMap = new Map<string, string[]>();
    if (showPoolsTab && pools) {
      pools.forEach((pool) => {
        pool.memberGatewayIds.forEach((gwId) => {
          const existing = gatewayPoolMap.get(gwId) ?? [];
          existing.push(pool.name);
          gatewayPoolMap.set(gwId, existing);
        });
      });
    }

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deployGateway",
      "deleteGateway",
      "editDetails",
      "createPool",
      "upgradePlan"
    ] as const);

    const deleteGatewayById = useDeleteGatewayById();
    const deleteGatewayV2ById = useDeleteGatewayV2ById();
    const triggerGatewayV2Heartbeat = useTriggerGatewayV2Heartbeat();

    const handleTriggerHealthCheck = async (id: string) => {
      try {
        await triggerGatewayV2Heartbeat.mutateAsync(id);
        createNotification({
          type: "success",
          text: "Health check successful - gateway is healthy"
        });
      } catch {
        createNotification({ type: "error", text: "Health check failed - gateway is unreachable" });
      }
    };

    const handleDeleteGateway = async () => {
      const data = popUp.deleteGateway.data as { id: string; isV1: boolean };
      if (data.isV1) {
        await deleteGatewayById.mutateAsync(data.id);
      } else {
        await deleteGatewayV2ById.mutateAsync(data.id);
      }
      handlePopUpToggle("deleteGateway");
      createNotification({ type: "success", text: "Successfully deleted gateway" });
    };

    const filteredGateway = gateways?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            Gateways
            <DocumentationLinkBadge
              href={
                activeSubTab === "gateway-pools"
                  ? "https://infisical.com/docs/documentation/platform/gateways/gateway-pools"
                  : "https://infisical.com/docs/documentation/platform/gateways/overview"
              }
            />
          </CardTitle>
          <CardDescription>
            {activeSubTab === "gateway-pools"
              ? "Pool gateways for high availability and automatic failover"
              : "Create and manage network gateways from Infisical"}
          </CardDescription>
          <CardAction>
            {activeSubTab === "all-gateways" ? (
              <OrgPermissionCan
                I={OrgGatewayPermissionActions.CreateGateways}
                a={OrgPermissionSubjects.Gateway}
              >
                {(isAllowed: boolean) => (
                  <Button
                    variant="org"
                    onClick={() => handlePopUpOpen("deployGateway")}
                    isDisabled={!isAllowed}
                  >
                    <PlusIcon />
                    Create Gateway
                  </Button>
                )}
              </OrgPermissionCan>
            ) : (
              <OrgPermissionCan
                I={OrgGatewayPoolPermissionActions.CreateGatewayPools}
                a={OrgPermissionSubjects.GatewayPool}
              >
                {(isAllowed: boolean) => (
                  <Button
                    variant="org"
                    onClick={() => {
                      if (!subscription?.gatewayPool) {
                        handlePopUpOpen("upgradePlan");
                        return;
                      }
                      handlePopUpOpen("createPool");
                    }}
                    isDisabled={!isAllowed}
                  >
                    <PlusIcon />
                    Create Pool
                  </Button>
                )}
              </OrgPermissionCan>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Tabs
              value={activeSubTab}
              onValueChange={(value) => setActiveSubTab(value as "all-gateways" | "gateway-pools")}
            >
              <TabsList variant="filled">
                <TabsTrigger value="all-gateways">All Gateways</TabsTrigger>
                <TabsTrigger value="gateway-pools">Gateway Pools</TabsTrigger>
              </TabsList>
            </Tabs>
            {activeSubTab === "all-gateways" ? (
              <InputGroup className="w-1/2 min-w-64">
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search gateway..."
                />
              </InputGroup>
            ) : (
              <InputGroup className="w-1/2 min-w-64">
                <InputGroupAddon align="inline-start">
                  <SearchIcon />
                </InputGroupAddon>
                <InputGroupInput
                  value={poolSearch}
                  onChange={(e) => setPoolSearch(e.target.value)}
                  placeholder="Search pool..."
                />
              </InputGroup>
            )}
          </div>
          {activeSubTab === "gateway-pools" ? (
            <GatewayPoolsContent search={poolSearch} />
          ) : (
            <>
              {!isGatewaysLoading && !filteredGateway?.length ? (
                <Empty className="border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      {gateways?.length ? <SearchIcon /> : <DoorClosedIcon />}
                    </EmptyMedia>
                    <EmptyTitle>
                      {gateways?.length
                        ? "No gateways match your search"
                        : "No gateways configured"}
                    </EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3">Name</TableHead>
                      {showPoolsTab && <TableHead>Pools</TableHead>}
                      <TableHead>Connected</TableHead>
                      <TableHead>
                        Health Check
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon className="ml-2 inline size-3.5" />
                          </TooltipTrigger>
                          <TooltipContent>
                            The last known health check. Triggers every 3 minutes.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isGatewaysLoading &&
                      Array.from({ length: 3 }).map((_, row) => (
                        <TableRow key={`gateway-skeleton-${row}`}>
                          {Array.from({ length: showPoolsTab ? 5 : 4 }).map((__, cell) => (
                            <TableCell key={`gateway-skeleton-${row}-${cell}`}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    {filteredGateway?.map((el) => {
                      const canNavigate = !el.isV1;
                      return (
                        <TableRow
                          key={el.id}
                          className={
                            canNavigate ? "cursor-pointer hover:bg-mineshaft-700" : undefined
                          }
                          onClick={
                            canNavigate
                              ? () =>
                                  navigate({
                                    to: "/organizations/$orgId/networking/gateways/$gatewayId",
                                    params: { orgId, gatewayId: el.id }
                                  })
                              : undefined
                          }
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{el.name}</span>
                              <Badge variant="neutral">Gateway v{el.isV1 ? "1" : "2"}</Badge>
                            </div>
                          </TableCell>
                          {showPoolsTab && (
                            <TableCell>
                              {(gatewayPoolMap.get(el.id) ?? []).length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {(gatewayPoolMap.get(el.id) ?? []).map((poolName) => (
                                    <Badge key={poolName} variant="info">
                                      {poolName}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-mineshaft-400">&mdash;</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            {!el.isV1 && el.connectedResourcesCount > 0 ? (
                              <span className="text-mineshaft-200">
                                {el.connectedResourcesCount} resource
                                {el.connectedResourcesCount !== 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="text-mineshaft-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <GatewayHealthStatus
                              heartbeat={"heartbeat" in el ? el.heartbeat : null}
                              heartbeatTTL={"heartbeatTTL" in el ? el.heartbeatTTL : null}
                            />
                          </TableCell>
                          <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton aria-label="Gateway options" variant="ghost" size="sm">
                                  <MoreHorizontalIcon />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => navigator.clipboard.writeText(el.id)}
                                >
                                  <CopyIcon />
                                  Copy ID
                                </DropdownMenuItem>
                                {!el.isV1 && (!!el.heartbeat || !!el.heartbeatTTL) && (
                                  <DropdownMenuItem onClick={() => handleTriggerHealthCheck(el.id)}>
                                    <HeartPulseIcon />
                                    Trigger Health Check
                                  </DropdownMenuItem>
                                )}
                                {el.isV1 && (
                                  <OrgPermissionCan
                                    I={OrgGatewayPermissionActions.EditGateways}
                                    a={OrgPermissionSubjects.Gateway}
                                  >
                                    {(isAllowed: boolean) => (
                                      <DropdownMenuItem
                                        isDisabled={!isAllowed}
                                        onClick={() => handlePopUpOpen("editDetails", el)}
                                      >
                                        <PencilIcon />
                                        Edit Details
                                      </DropdownMenuItem>
                                    )}
                                  </OrgPermissionCan>
                                )}
                                <OrgPermissionCan
                                  I={OrgGatewayPermissionActions.DeleteGateways}
                                  a={OrgPermissionSubjects.Gateway}
                                >
                                  {(isAllowed: boolean) => (
                                    <DropdownMenuItem
                                      isDisabled={!isAllowed}
                                      variant="danger"
                                      onClick={() => handlePopUpOpen("deleteGateway", el)}
                                    >
                                      <TrashIcon />
                                      Delete Gateway
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              <Dialog
                open={popUp.editDetails.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("editDetails", isOpen)}
              >
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit Gateway</DialogTitle>
                  </DialogHeader>
                  <EditGatewayDetailsModal
                    gatewayDetails={popUp.editDetails.data}
                    onClose={() => handlePopUpToggle("editDetails")}
                  />
                </DialogContent>
              </Dialog>
              <AlertDialog
                open={popUp.deleteGateway.isOpen}
                onOpenChange={(open) => handlePopUpToggle("deleteGateway", open)}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {(popUp.deleteGateway.data as { name?: string })?.name || "gateway"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the gateway from your organization.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="danger"
                      isPending={deleteGatewayById.isPending || deleteGatewayV2ById.isPending}
                      onClick={handleDeleteGateway}
                    >
                      Delete Gateway
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <GatewayDeployModal
                isOpen={popUp.deployGateway.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("deployGateway", isOpen)}
              />
            </>
          )}
        </CardContent>
        <CreateGatewayPoolModal
          isOpen={popUp.createPool.isOpen}
          onToggle={(isOpen) => handlePopUpToggle("createPool", isOpen)}
        />
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Your current plan does not include access to gateway pools. To unlock this feature, please upgrade to Infisical Enterprise plan."
          isEnterpriseFeature
        />
      </Card>
    );
  },
  { action: OrgGatewayPermissionActions.ListGateways, subject: OrgPermissionSubjects.Gateway }
);
