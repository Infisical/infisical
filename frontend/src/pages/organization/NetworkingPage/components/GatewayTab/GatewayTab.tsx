import { useState } from "react";
import {
  faArrowsRotate,
  faClock,
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
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { gatewaysQueryKeys, useDeleteGatewayById } from "@app/hooks/api/gateways";
import {
  useDeleteGatewayEnrollmentToken,
  useDeleteGatewayV2ById,
  useTriggerGatewayV2Heartbeat
} from "@app/hooks/api/gateways-v2";
import { GatewayHealthCheckStatus } from "@app/hooks/api/gateways-v2/types";

import { EditGatewayDetailsModal } from "./components/EditGatewayDetailsModal";
import { GatewayConnectedResourcesDrawer } from "./components/GatewayConnectedResourcesDrawer";
import { GatewayDeployModal } from "./components/GatewayDeployModal";
import { ReEnrollGatewayModal } from "./components/ReEnrollGatewayModal";

const GatewayHealthStatus = ({
  heartbeat,
  lastHealthCheckStatus,
  isPending,
  isExpired
}: {
  heartbeat?: string | null;
  lastHealthCheckStatus?: GatewayHealthCheckStatus | null;
  isPending?: boolean;
  isExpired?: boolean;
}) => {
  if (isExpired) {
    return (
      <Tooltip content="Enrollment token has expired. Re-enroll to generate a new one.">
        <span className="inline-flex cursor-default items-center gap-1.5 text-red-400">
          Expired
        </span>
      </Tooltip>
    );
  }

  if (isPending) {
    return (
      <Tooltip content="Waiting for gateway to enroll using the CLI command">
        <span className="inline-flex cursor-default items-center gap-1.5 text-yellow-500">
          <FontAwesomeIcon icon={faClock} className="size-3" />
          Pending
        </span>
      </Tooltip>
    );
  }

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

type GatewayConnectedCellProps = {
  isV1: boolean;
  connectedResourcesCount: number;
  onClick: () => void;
};

const GatewayConnectedCell = ({
  isV1,
  connectedResourcesCount,
  onClick
}: GatewayConnectedCellProps) => {
  if (isV1 || connectedResourcesCount === 0) {
    return <span className="text-mineshaft-400">—</span>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex cursor-pointer items-center gap-1.5 text-mineshaft-200 underline decoration-mineshaft-400 underline-offset-2 hover:text-mineshaft-100 hover:decoration-mineshaft-300"
    >
      <span>
        {connectedResourcesCount} resource{connectedResourcesCount !== 1 ? "s" : ""}
      </span>
    </button>
  );
};

export const GatewayTab = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const [selectedGateway, setSelectedGateway] = useState<{
      id: string;
      name: string;
    } | null>(null);
    const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deployGateway",
      "deleteGateway",
      "editDetails",
      "connectedResources",
      "reEnrollGateway"
    ] as const);

    const deleteGatewayById = useDeleteGatewayById();
    const deleteGatewayV2ById = useDeleteGatewayV2ById();
    const deleteEnrollmentToken = useDeleteGatewayEnrollmentToken();
    const triggerGatewayV2Heartbeat = useTriggerGatewayV2Heartbeat();

    const handleTriggerHealthCheck = async (id: string) => {
      try {
        await triggerGatewayV2Heartbeat.mutateAsync(id);
        createNotification({
          type: "success",
          text: "Health check successful - gateway is healthy"
        });
      } catch {
        createNotification({
          type: "error",
          text: "Health check failed - gateway is unreachable"
        });
      }
    };

    const handleDeleteGateway = async () => {
      const data = popUp.deleteGateway.data as {
        id: string;
        isV1: boolean;
        isPending: boolean;
        isTokenOnly: boolean;
      };
      if (data.isTokenOnly) {
        await deleteEnrollmentToken.mutateAsync(data.id);
      } else if (data.isV1) {
        await deleteGatewayById.mutateAsync(data.id);
      } else {
        await deleteGatewayV2ById.mutateAsync(data.id);
      }

      handlePopUpToggle("deleteGateway");
      createNotification({
        type: "success",
        text: data.isTokenOnly
          ? "Successfully deleted enrollment token"
          : "Successfully deleted gateway"
      });
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
                  <TableSkeleton innerKey="gateway-table" columns={5} key="gateway-table" />
                )}
                {filteredGateway?.map((el) => (
                  <Tr key={el.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span>{el.name}</span>
                        {"isExpired" in el && el.isExpired ? (
                          <span className="rounded-sm bg-red-900/30 px-1.5 py-0.5 text-xs text-red-400">
                            Expired
                          </span>
                        ) : el.isPending ? (
                          <span className="rounded-sm bg-yellow-900/30 px-1.5 py-0.5 text-xs text-yellow-500">
                            Pending
                          </span>
                        ) : (
                          <span className="rounded-sm bg-mineshaft-700 px-1.5 py-0.5 text-xs text-mineshaft-400">
                            Gateway v{el.isV1 ? "1" : "2"}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td>
                      {el.isPending ? (
                        <span className="text-mineshaft-400">—</span>
                      ) : (
                        <GatewayConnectedCell
                          isV1={el.isV1}
                          connectedResourcesCount={
                            "connectedResourcesCount" in el ? el.connectedResourcesCount : 0
                          }
                          onClick={() => {
                            setSelectedGateway({ id: el.id, name: el.name });
                            handlePopUpOpen("connectedResources");
                          }}
                        />
                      )}
                    </Td>
                    <Td>
                      <GatewayHealthStatus
                        heartbeat={"heartbeat" in el ? el.heartbeat : null}
                        lastHealthCheckStatus={
                          "lastHealthCheckStatus" in el ? el.lastHealthCheckStatus : null
                        }
                        isPending={el.isPending}
                        isExpired={"isExpired" in el ? el.isExpired : false}
                      />
                    </Td>
                    <Td className="w-5">
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
                            {!el.isV1 && !el.isPending && (
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
                            {!el.isV1 &&
                              (el.isPending ||
                                ("identityId" in el && !el.identityId)) && (
                              <OrgPermissionCan
                                I={OrgGatewayPermissionActions.EditGateways}
                                a={OrgPermissionSubjects.Gateway}
                              >
                                {(isAllowed: boolean) => (
                                  <DropdownMenuItem
                                    isDisabled={!isAllowed}
                                    icon={<FontAwesomeIcon icon={faArrowsRotate} />}
                                    onClick={() => handlePopUpOpen("reEnrollGateway", el)}
                                  >
                                    Re-enroll
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
                                  {el.isTokenOnly ? "Delete Token" : "Delete Gateway"}
                                </DropdownMenuItem>
                              )}
                            </OrgPermissionCan>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Tooltip>
                    </Td>
                  </Tr>
                ))}
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
              title={`Are you sure you want to delete ${
                (popUp?.deleteGateway?.data as { isTokenOnly?: boolean })?.isTokenOnly
                  ? "enrollment token"
                  : "gateway"
              } ${(popUp?.deleteGateway?.data as { name: string })?.name || ""}?`}
              onChange={(isOpen) => handlePopUpToggle("deleteGateway", isOpen)}
              deleteKey="confirm"
              onDeleteApproved={() => handleDeleteGateway()}
            />
            <GatewayDeployModal
              isOpen={popUp.deployGateway.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("deployGateway", isOpen)}
            />
            <ReEnrollGatewayModal
              isOpen={popUp.reEnrollGateway.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("reEnrollGateway", isOpen)}
              gatewayData={
                popUp.reEnrollGateway.data as {
                  id: string;
                  name: string;
                  isPending: boolean;
                  isTokenOnly: boolean;
                } | null
              }
            />
            {selectedGateway && (
              <GatewayConnectedResourcesDrawer
                isOpen={popUp.connectedResources.isOpen}
                onOpenChange={(isOpen) => {
                  handlePopUpToggle("connectedResources", isOpen);
                  if (!isOpen) setSelectedGateway(null);
                }}
                gatewayId={selectedGateway.id}
                gatewayName={selectedGateway.name}
              />
            )}
          </TableContainer>
        </div>
      </div>
    );
  },
  { action: OrgGatewayPermissionActions.ListGateways, subject: OrgPermissionSubjects.Gateway }
);
