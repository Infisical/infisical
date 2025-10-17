import { useState } from "react";
import {
  faArrowUpRightFromSquare,
  faBookOpen,
  faCopy,
  faDoorClosed,
  faEllipsisV,
  faInfoCircle,
  faMagnifyingGlass,
  faPlus,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteRelayById, useGetRelays } from "@app/hooks/api/relays";

import { DeployRelayModal } from "../GatewayTab/components/DeployRelayModal";

const RelayHealthStatus = ({ heartbeat }: { heartbeat?: string }) => {
  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const isHealthy = !heartbeatDate || heartbeatDate >= oneHourAgo;
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

export const RelayTab = withPermission(
  () => {
    const [search, setSearch] = useState("");
    const { data: relays, isPending: isRelaysLoading } = useGetRelays();

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deleteRelay",
      "deployRelay"
    ] as const);

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
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex grow items-center gap-2">
            <h3 className="text-lg font-medium text-mineshaft-100">Relays</h3>
            <a
              href="https://infisical.com/docs/documentation/platform/gateways/relay-deployment"
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
            <div className="flex grow" />
            <Button
              variant="outline_bg"
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => handlePopUpOpen("deployRelay")}
            >
              Deploy Relay
            </Button>
          </div>
        </div>
        <p className="mb-4 text-sm text-mineshaft-400">
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
                            <span className="rounded-sm bg-mineshaft-700 px-1.5 py-0.5 text-xs text-mineshaft-400">
                              Managed
                            </span>
                          </Tooltip>
                        )}
                      </div>
                    </Td>
                    <Td>{el.host}</Td>
                    <Td>{formatRelative(new Date(el.createdAt), new Date())}</Td>
                    <Td>
                      <RelayHealthStatus heartbeat={el.heartbeat} />
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
            <DeployRelayModal
              isOpen={popUp.deployRelay.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("deployRelay", isOpen)}
            />
          </TableContainer>
        </div>
      </div>
    );
  },
  { action: OrgRelayPermissionActions.ListRelays, subject: OrgPermissionSubjects.Relay }
);
