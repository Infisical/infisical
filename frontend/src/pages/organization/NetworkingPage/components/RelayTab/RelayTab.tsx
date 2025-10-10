import { useState } from "react";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faCopy,
  faDoorClosed,
  faEllipsisV,
  faMagnifyingGlass,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatRelative } from "date-fns";

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
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteRelayById, useGetRelays } from "@app/hooks/api/relays";

export const RelayTab = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const { data: relays, isPending: isRelaysLoading } = useGetRelays();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteRelay"] as const);

    const deleteRelayById = useDeleteRelayById();

    const handleDeleteRelay = async () => {
      const data = popUp.deleteRelay.data as { id: string };
      await deleteRelayById.mutateAsync(data.id);

      handlePopUpToggle("deleteRelay");
      createNotification({
        type: "success",
        text: "Successfully deleted relay"
      });
    };

    const filteredRelays = relays?.filter((el) =>
      el.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
      <div className="border-mineshaft-600 bg-mineshaft-900 mb-6 rounded-lg border p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-mineshaft-100 text-lg font-medium">Relays</h3>
            <a
              href="https://infisical.com/docs/documentation/platform/gateways/relay-deployment"
              target="_blank"
              rel="noopener noreferrer"
            >
              <div className="bg-yellow/20 text-yellow inline-block rounded-md px-1.5 py-0.5 text-sm font-normal opacity-80 hover:opacity-100">
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
        <p className="text-mineshaft-400 mb-4 text-sm">
          Create and configure relays to securely access private network resources from Infisical
        </p>
        <div>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              placeholder="Search relay..."
              className="flex-1"
            />
          </div>
          <TableContainer className="mt-4">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-1/3">Name</Th>
                  <Th>Host</Th>
                  <Th>Created</Th>
                  <Th className="w-5" />
                </Tr>
              </THead>
              <TBody>
                {isRelaysLoading && (
                  <TableSkeleton innerKey="relay-table" columns={4} key="relay-table" />
                )}
                {filteredRelays?.map((el) => (
                  <Tr key={el.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span>{el.name}</span>
                        {!el.orgId && (
                          <Tooltip content="This is a managed relay provided by Infisical">
                            <span className="bg-mineshaft-700 text-mineshaft-400 rounded-sm px-1.5 py-0.5 text-xs">
                              Managed
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </Td>
                    <Td>{el.host}</Td>
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
                              onClick={() => navigator.clipboard.writeText(el.id)}
                            >
                              Copy ID
                            </DropdownMenuItem>
                            <OrgPermissionCan
                              I={OrgRelayPermissionActions.DeleteRelays}
                              a={OrgPermissionSubjects.Relay}
                            >
                              {(isAllowed: boolean) => (
                                <DropdownMenuItem
                                  isDisabled={!isAllowed || !el.orgId}
                                  icon={<FontAwesomeIcon icon={faTrash} />}
                                  className="text-red"
                                  onClick={() => handlePopUpOpen("deleteRelay", el)}
                                >
                                  Delete Relay
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
            {!isRelaysLoading && !filteredRelays?.length && (
              <EmptyState
                title={
                  relays?.length ? "No Relays match search..." : "No Relays have been configured"
                }
                icon={relays?.length ? faSearch : faDoorClosed}
              />
            )}
            <DeleteActionModal
              isOpen={popUp.deleteRelay.isOpen}
              title={`Are you sure you want to delete relay ${
                (popUp?.deleteRelay?.data as { name: string })?.name || ""
              }?`}
              onChange={(isOpen) => handlePopUpToggle("deleteRelay", isOpen)}
              deleteKey="confirm"
              onDeleteApproved={() => handleDeleteRelay()}
            />
          </TableContainer>
        </div>
      </div>
    );
  },
  { action: OrgRelayPermissionActions.ListRelays, subject: OrgPermissionSubjects.Relay }
);
