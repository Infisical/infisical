import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faCopy,
  faEdit,
  faEllipsisV,
  faInfoCircle,
  faMagnifyingGlass,
  faPlug,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { format, formatRelative } from "date-fns";

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
  PageHeader,
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
  OrgPermissionAppConnectionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { gatewaysQueryKeys, useDeleteGatewayById } from "@app/hooks/api/gateways";

import { EditGatewayDetailsModal } from "./components/EditGatewayDetailsModal";

export const GatewayListPage = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const { data: gateways, isPending: isGatewayLoading } = useQuery(gatewaysQueryKeys.list());

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deleteGateway",
      "editDetails"
    ] as const);

    const deleteGatewayById = useDeleteGatewayById();

    const handleDeleteGateway = async () => {
      await deleteGatewayById.mutateAsync((popUp.deleteGateway.data as { id: string }).id, {
        onSuccess: () => {
          handlePopUpToggle("deleteGateway");
          createNotification({
            type: "success",
            text: "Successfully delete gateway"
          });
        }
      });
    };

    const filteredGateway = gateways?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="bg-bunker-800">
        <Helmet>
          <title>Infisical | Gateways</title>
          <meta property="og:image" content="/images/message.png" />
        </Helmet>
        <div className="flex w-full justify-center bg-bunker-800 text-white">
          <div className="w-full max-w-7xl">
            <PageHeader
              className="w-full"
              title={
                <div className="flex w-full items-center">
                  <span>Gateways</span>
                  <a
                    className="-mt-1.5"
                    href="https://infisical.com/docs/documentation/platform/gateways/overview"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="ml-2 inline-block rounded-md bg-yellow/20 px-1.5 text-sm font-normal text-yellow opacity-80 hover:opacity-100">
                      <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                      <span>Docs</span>
                      <FontAwesomeIcon
                        icon={faArrowUpRightFromSquare}
                        className="mb-[0.07rem] ml-1.5 text-[10px]"
                      />
                    </div>
                  </a>
                </div>
              }
              description="Create and configure gateway to access private network resources from Infisical"
            />
            <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
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
                        <Th>Cert Issued At</Th>
                        <Th>Identity</Th>
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
                      {isGatewayLoading && (
                        <TableSkeleton innerKey="gateway-table" columns={4} key="gateway-table" />
                      )}
                      {filteredGateway?.map((el) => (
                        <Tr key={el.id}>
                          <Td>{el.name}</Td>
                          <Td>{format(new Date(el.issuedAt), "yyyy-MM-dd hh:mm:ss aaa")}</Td>
                          <Td>{el.identity.name}</Td>
                          <Td>
                            {el.heartbeat
                              ? formatRelative(new Date(el.heartbeat), new Date())
                              : "-"}
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
                                  <OrgPermissionCan
                                    I={OrgPermissionAppConnectionActions.Delete}
                                    a={OrgPermissionSubjects.AppConnections}
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
                  {!isGatewayLoading && !filteredGateway?.length && (
                    <EmptyState
                      title={
                        gateways?.length
                          ? "No Gateways match search..."
                          : "No Gateways have been configured"
                      }
                      icon={gateways?.length ? faSearch : faPlug}
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
          </div>
        </div>
      </div>
    );
  },
  {
    action: OrgPermissionAppConnectionActions.Read,
    subject: OrgPermissionSubjects.AppConnections
  }
);
