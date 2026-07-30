import { useState } from "react";
import {
  faCopy,
  faDoorClosed,
  faEdit,
  faEllipsisV,
  faHeartPulse,
  faInfoCircle,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon, SearchIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Tabs,
  TabsList,
  TabsTrigger
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
              : "Create and configure gateways to access private network resources from Infisical"}
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
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th className="w-1/3">Name</Th>
                    {showPoolsTab && <Th>Pools</Th>}
                    <Th>Connected</Th>
                    <Th>
                      Health Check
                      <Tooltip
                        asChild={false}
                        className="normal-case"
                        content="The last known healthcheck. Triggers every 3 minutes."
                      >
                        <FontAwesomeIcon icon={faInfoCircle} className="ml-2" />
                      </Tooltip>
                    </Th>
                    <Th className="w-5" />
                  </Tr>
                </THead>
                <TBody>
                  {isGatewaysLoading && (
                    <TableSkeleton
                      innerKey="gateway-table"
                      columns={showPoolsTab ? 5 : 4}
                      key="gateway-table"
                    />
                  )}
                  {filteredGateway?.map((el) => {
                    const canNavigate = !el.isV1;
                    return (
                      <Tr
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
                        <Td>
                          <div className="flex items-center gap-2">
                            <span>{el.name}</span>
                            <span className="rounded-sm bg-mineshaft-700 px-1.5 py-0.5 text-xs text-mineshaft-400">
                              Gateway v{el.isV1 ? "1" : "2"}
                            </span>
                          </div>
                        </Td>
                        {showPoolsTab && (
                          <Td>
                            {(gatewayPoolMap.get(el.id) ?? []).length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {(gatewayPoolMap.get(el.id) ?? []).map((poolName) => (
                                  <span
                                    key={poolName}
                                    className="rounded-sm bg-info/15 px-1.5 py-0.5 text-xs text-info"
                                  >
                                    {poolName}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-mineshaft-400">&mdash;</span>
                            )}
                          </Td>
                        )}
                        <Td>
                          {!el.isV1 && el.connectedResourcesCount > 0 ? (
                            <span className="text-mineshaft-200">
                              {el.connectedResourcesCount} resource
                              {el.connectedResourcesCount !== 1 ? "s" : ""}
                            </span>
                          ) : (
                            <span className="text-mineshaft-400">—</span>
                          )}
                        </Td>
                        <Td>
                          <GatewayHealthStatus
                            heartbeat={"heartbeat" in el ? el.heartbeat : null}
                            heartbeatTTL={"heartbeatTTL" in el ? el.heartbeatTTL : null}
                          />
                        </Td>
                        <Td className="w-5" onClick={(e) => e.stopPropagation()}>
                          <Tooltip className="max-w-sm text-center" content="Options">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <IconButton
                                  ariaLabel="Options"
                                  colorSchema="secondary"
                                  className="w-6"
                                  variant="plain"
                                >
                                  <FontAwesomeIcon icon={faEllipsisV} />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  icon={<FontAwesomeIcon icon={faCopy} />}
                                  onClick={() => navigator.clipboard.writeText(el.id)}
                                >
                                  Copy ID
                                </DropdownMenuItem>
                                {!el.isV1 && (!!el.heartbeat || !!el.heartbeatTTL) && (
                                  <DropdownMenuItem
                                    icon={<FontAwesomeIcon icon={faHeartPulse} />}
                                    onClick={() => handleTriggerHealthCheck(el.id)}
                                  >
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
                                        icon={<FontAwesomeIcon icon={faEdit} />}
                                        onClick={() => handlePopUpOpen("editDetails", el)}
                                      >
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
                                      icon={<FontAwesomeIcon icon={faTrash} />}
                                      className="text-red"
                                      onClick={() => handlePopUpOpen("deleteGateway", el)}
                                    >
                                      Delete Gateway
                                    </DropdownMenuItem>
                                  )}
                                </OrgPermissionCan>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </Tooltip>
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
              <Modal
                isOpen={popUp.editDetails.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("editDetails", isOpen)}
              >
                <ModalContent title="Edit Gateway">
                  <EditGatewayDetailsModal
                    gatewayDetails={popUp.editDetails.data}
                    onClose={() => handlePopUpToggle("editDetails")}
                  />
                </ModalContent>
              </Modal>
              {!isGatewaysLoading && !filteredGateway?.length && (
                <EmptyState
                  title={
                    gateways?.length
                      ? "No Gateways match search..."
                      : "No Gateways have been configured"
                  }
                  icon={gateways?.length ? faSearch : faDoorClosed}
                />
              )}
              <DeleteActionModal
                isOpen={popUp.deleteGateway.isOpen}
                title={`Are you sure you want to delete gateway ${(popUp?.deleteGateway?.data as { name: string })?.name || ""}?`}
                onChange={(isOpen) => handlePopUpToggle("deleteGateway", isOpen)}
                deleteKey="confirm"
                onDeleteApproved={() => handleDeleteGateway()}
              />
              <GatewayDeployModal
                isOpen={popUp.deployGateway.isOpen}
                onOpenChange={(isOpen) => handlePopUpToggle("deployGateway", isOpen)}
              />
            </TableContainer>
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
