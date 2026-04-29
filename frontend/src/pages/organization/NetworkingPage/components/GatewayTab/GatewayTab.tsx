import { useState } from "react";
import {
  faCopy,
  faDoorClosed,
  faEdit,
  faEllipsisV,
  faHeartPulse,
  faInfoCircle,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
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
import { DocumentationLinkBadge } from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { gatewaysQueryKeys, useDeleteGatewayById } from "@app/hooks/api/gateways";
import { useDeleteGatewayV2ById, useTriggerGatewayV2Heartbeat } from "@app/hooks/api/gateways-v2";
import { GatewayHealthCheckStatus } from "@app/hooks/api/gateways-v2/types";

import { EditGatewayDetailsModal } from "./components/EditGatewayDetailsModal";
import { GatewayDeployModal } from "./components/GatewayDeployModal";

const GatewayHealthStatus = ({
  heartbeat,
  lastHealthCheckStatus
}: {
  heartbeat?: string | null;
  lastHealthCheckStatus?: GatewayHealthCheckStatus | null;
}) => {
  if (!heartbeat && !lastHealthCheckStatus) {
    return (
      <Tooltip content="Gateway has not connected yet">
        <span className="cursor-default text-yellow-500">Unregistered</span>
      </Tooltip>
    );
  }

  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;
  const isHealthy = lastHealthCheckStatus === GatewayHealthCheckStatus.Healthy;

  const tooltipContent = heartbeatDate
    ? `Last health check: ${heartbeatDate.toLocaleString()}`
    : "No health check data available";

  return (
    <Tooltip content={tooltipContent}>
      <span className={`cursor-default ${isHealthy ? "text-green-400" : "text-red-400"}`}>
        {isHealthy ? "Healthy" : "Unreachable"}
      </span>
    </Tooltip>
  );
};

export const GatewayTab = withPermission(
  () => {
    const navigate = useNavigate();
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";
    const [search, setSearch] = useState("");
    const { data: gateways, isPending: isGatewaysLoading } = useQuery({
      ...gatewaysQueryKeys.listWithTokens(),
      refetchInterval: 15_000
    });

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deployGateway",
      "deleteGateway",
      "editDetails"
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
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex grow items-center gap-x-2">
            <h3 className="text-lg font-medium text-mineshaft-100">Gateways</h3>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/gateways/overview" />
            <div className="flex grow" />
            <OrgPermissionCan
              I={OrgGatewayPermissionActions.CreateGateways}
              a={OrgPermissionSubjects.Gateway}
            >
              {(isAllowed: boolean) => (
                <Button
                  variant="outline_bg"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  onClick={() => handlePopUpOpen("deployGateway")}
                  isDisabled={!isAllowed}
                >
                  Create Gateway
                </Button>
              )}
            </OrgPermissionCan>
          </div>
        </div>
        <p className="mb-4 text-sm text-mineshaft-400">
          Create and configure gateway to access private network resources from Infisical
        </p>
        <div>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              placeholder="Search gateway..."
              className="flex-1"
            />
          </div>
          <TableContainer className="mt-4">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-1/3">Name</Th>
                  <Th>Connected</Th>
                  <Th>
                    Health Check
                    <Tooltip
                      asChild={false}
                      className="normal-case"
                      content="The last known healthcheck. Triggers every 1 hour."
                    >
                      <FontAwesomeIcon icon={faInfoCircle} className="ml-2" />
                    </Tooltip>
                  </Th>
                  <Th className="w-5" />
                </Tr>
              </THead>
              <TBody>
                {isGatewaysLoading && (
                  <TableSkeleton innerKey="gateway-table" columns={4} key="gateway-table" />
                )}
                {filteredGateway?.map((el) => {
                  const canNavigate = !el.isV1;
                  return (
                    <Tr
                      key={el.id}
                      className={canNavigate ? "cursor-pointer hover:bg-mineshaft-700" : undefined}
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
                          lastHealthCheckStatus={
                            "lastHealthCheckStatus" in el ? el.lastHealthCheckStatus : null
                          }
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
                              {!el.isV1 &&
                                ("heartbeat" in el
                                  ? !!el.heartbeat || !!el.lastHealthCheckStatus
                                  : false) && (
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
        </div>
      </div>
    );
  },
  { action: OrgGatewayPermissionActions.ListGateways, subject: OrgPermissionSubjects.Gateway }
);
