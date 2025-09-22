import { useState } from "react";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faCopy,
  faDoorClosed,
  faEdit,
  faEllipsisV,
  faInfoCircle,
  faMagnifyingGlass,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";

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
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { gatewaysQueryKeys, useDeleteGatewayById } from "@app/hooks/api/gateways";
import { useDeleteGatewayV2ById } from "@app/hooks/api/gateways-v2";

import { EditGatewayDetailsModal } from "./components/EditGatewayDetailsModal";

const GatewayHealthStatus = ({ heartbeat }: { heartbeat?: string }) => {
  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const isHealthy = heartbeatDate && heartbeatDate >= oneHourAgo;
  const tooltipContent = heartbeatDate
    ? `Last heartbeat: ${heartbeatDate.toLocaleString()}`
    : "No heartbeat data available";

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
    const [search, setSearch] = useState("");
    const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deleteGateway",
      "editDetails"
    ] as const);

    const deleteGatewayById = useDeleteGatewayById();
    const deleteGatewayV2ById = useDeleteGatewayV2ById();

    const handleDeleteGateway = async () => {
      const data = popUp.deleteGateway.data as { id: string; isV1: boolean };
      if (data.isV1) {
        await deleteGatewayById.mutateAsync(data.id);
      } else {
        await deleteGatewayV2ById.mutateAsync(data.id);
      }

      handlePopUpToggle("deleteGateway");
      createNotification({
        type: "success",
        text: "Successfully deleted gateway"
      });
    };

    const filteredGateway = gateways?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-mineshaft-100">Gateways</h3>
            <a
              href="https://infisical.com/docs/documentation/platform/gateways/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="inline-block rounded-md bg-yellow/20 px-1.5 py-0.5 text-sm font-normal text-yellow opacity-80 hover:opacity-100">
                <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                <span>Docs</span>
                <FontAwesomeIcon
                  icon={faArrowUpRightFromSquare}
                  className="mb-[0.07rem] ml-1.5 text-[10px]"
                />
              </div>
            </a>
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
                  <Th className="w-1/2">Name</Th>
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
                {filteredGateway?.map((el) => (
                  <Tr key={el.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span>{el.name}</span>
                        <span className="rounded bg-mineshaft-700 px-1.5 py-0.5 text-xs text-mineshaft-400">
                          Gateway v{el.isV1 ? "1" : "2"}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <GatewayHealthStatus heartbeat={el.heartbeat} />
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
              title={`Are you sure you want to delete gateway ${
                (popUp?.deleteGateway?.data as { name: string })?.name || ""
              }?`}
              onChange={(isOpen) => handlePopUpToggle("deleteGateway", isOpen)}
              deleteKey="confirm"
              onDeleteApproved={() => handleDeleteGateway()}
            />
          </TableContainer>
        </div>
      </div>
    );
  },
  { action: OrgGatewayPermissionActions.ListGateways, subject: OrgPermissionSubjects.Gateway }
);
