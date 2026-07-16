import { useState } from "react";
import {
  faCopy,
  faEllipsisV,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faServer,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { formatRelative } from "date-fns";

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
  OrgKmipServerPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteKmipServerById, useGetKmipServers } from "@app/hooks/api/kmipServers";

import { KmipServerDeployModal } from "./components/KmipServerDeployModal";

export const KmipServerTab = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const { data: kmipServers, isPending: isLoading } = useGetKmipServers();
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deleteKmipServer",
      "deployKmipServer"
    ] as const);

    const navigate = useNavigate();

    const deleteKmipServerById = useDeleteKmipServerById();

    const handleDeleteKmipServer = async () => {
      const data = popUp.deleteKmipServer.data as { id: string };
      await deleteKmipServerById.mutateAsync(data.id);

      handlePopUpToggle("deleteKmipServer");
      createNotification({
        type: "success",
        text: "Successfully deleted KMIP server"
      });
    };

    const filteredKmipServers = kmipServers?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex grow items-center gap-x-2">
            <h3 className="text-lg font-medium text-mineshaft-100">KMIP Servers</h3>
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/kms/kmip" />
            <div className="flex grow" />
            <OrgPermissionCan
              I={OrgKmipServerPermissionActions.CreateKmipServers}
              a={OrgPermissionSubjects.KmipServer}
            >
              {(isAllowed) => (
                <Button
                  variant="outline_bg"
                  leftIcon={<FontAwesomeIcon icon={faPlus} />}
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("deployKmipServer")}
                >
                  Create KMIP Server
                </Button>
              )}
            </OrgPermissionCan>
          </div>
        </div>
        <p className="mb-4 text-sm text-mineshaft-400">
          Create and configure KMIP servers that proxy KMIP requests to Infisical KMS
        </p>
        <div>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              placeholder="Search KMIP server..."
              className="flex-1"
            />
          </div>
          <TableContainer className="mt-4">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-2/3">Name</Th>
                  <Th>Created</Th>
                  <Th className="w-5" />
                </Tr>
              </THead>
              <TBody>
                {isLoading && (
                  <TableSkeleton innerKey="kmip-server-table" columns={3} key="kmip-server-table" />
                )}
                {filteredKmipServers?.map((el) => (
                  <Tr
                    key={el.id}
                    className="cursor-pointer hover:bg-mineshaft-700"
                    onClick={() => {
                      navigate({
                        to: "/organizations/$orgId/projects/kms/kmip-servers/$kmipServerId",
                        params: { orgId, kmipServerId: el.id }
                      });
                    }}
                  >
                    <Td>{el.name}</Td>
                    <Td>{formatRelative(new Date(el.createdAt), new Date())}</Td>
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
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(el.id);
                              }}
                            >
                              Copy ID
                            </DropdownMenuItem>
                            <OrgPermissionCan
                              I={OrgKmipServerPermissionActions.DeleteKmipServers}
                              a={OrgPermissionSubjects.KmipServer}
                            >
                              {(isAllowed: boolean) => (
                                <DropdownMenuItem
                                  isDisabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faTrash} />}
                                  className="text-red"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("deleteKmipServer", el);
                                  }}
                                >
                                  Delete KMIP Server
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
            {!isLoading && !filteredKmipServers?.length && (
              <EmptyState
                title={
                  kmipServers?.length
                    ? "No KMIP servers match search..."
                    : "No KMIP servers have been configured"
                }
                icon={kmipServers?.length ? faSearch : faServer}
              />
            )}
            <DeleteActionModal
              isOpen={popUp.deleteKmipServer.isOpen}
              title={`Are you sure you want to delete KMIP server ${
                (popUp?.deleteKmipServer?.data as { name: string })?.name || ""
              }?`}
              onChange={(isOpen) => handlePopUpToggle("deleteKmipServer", isOpen)}
              deleteKey="confirm"
              onDeleteApproved={() => handleDeleteKmipServer()}
            />
            <KmipServerDeployModal
              isOpen={popUp.deployKmipServer.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("deployKmipServer", isOpen)}
            />
          </TableContainer>
        </div>
      </div>
    );
  },
  {
    action: OrgKmipServerPermissionActions.ListKmipServers,
    subject: OrgPermissionSubjects.KmipServer
  }
);
