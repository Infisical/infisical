import { useEffect, useState } from "react";
import {
  faCopy,
  faDoorClosed,
  faEllipsisV,
  faInfoCircle,
  faSearch,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { formatRelative } from "date-fns";
import { PlusIcon, SearchIcon } from "lucide-react";

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
  InputGroupInput
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import {
  OrgPermissionSubjects,
  OrgRelayPermissionActions
} from "@app/context/OrgPermissionContext/types";
import { withPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { useDeleteRelayById, useGetRelays } from "@app/hooks/api/relays";

import { RelayDeployModal } from "./components/RelayDeployModal";

const RelayHealthStatus = ({ heartbeat }: { heartbeat?: string }) => {
  const heartbeatDate = heartbeat ? new Date(heartbeat) : null;

  if (!heartbeatDate) {
    return (
      <Tooltip content="No heartbeat data available">
        <span className="cursor-default text-yellow-400">Unregistered</span>
      </Tooltip>
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const isHealthy = heartbeatDate >= oneHourAgo;

  return (
    <Tooltip content={`Last heartbeat: ${heartbeatDate.toLocaleString()}`}>
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
    const { currentOrg } = useOrganization();
    const orgId = currentOrg?.id || "";

    const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
      "deleteRelay",
      "deployRelay"
    ] as const);

    const action = useSearch({
      from: ROUTE_PATHS.Organization.NetworkingPage.id,
      select: (s) => s.action
    });

    const navigate = useNavigate({
      from: ROUTE_PATHS.Organization.NetworkingPage.path
    });

    useEffect(() => {
      if (action === "deploy-relay") {
        handlePopUpOpen("deployRelay");
        navigate({
          search: (prev) => ({ ...prev, action: undefined }),
          replace: true
        });
      }
    }, [action, handlePopUpOpen, navigate]);

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
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>
            Relays
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/gateways/relay-deployment" />
          </CardTitle>
          <CardDescription>
            Create and configure relays to securely access private network resources from Infisical
          </CardDescription>
          <CardAction>
            <Button variant="org" onClick={() => handlePopUpOpen("deployRelay")}>
              <PlusIcon />
              Create Relay
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <InputGroup className="mb-4">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search relay..."
            />
          </InputGroup>
          <TableContainer>
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
                  <TableSkeleton innerKey="relay-table" columns={5} key="relay-table" />
                )}
                {filteredRelays?.map((el) => (
                  <Tr
                    key={el.id}
                    className={el.orgId ? "cursor-pointer hover:bg-mineshaft-700" : ""}
                    onClick={() => {
                      if (el.orgId) {
                        navigate({
                          to: "/organizations/$orgId/networking/relays/$relayId",
                          params: { orgId, relayId: el.id }
                        });
                      }
                    }}
                  >
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
            <RelayDeployModal
              isOpen={popUp.deployRelay.isOpen}
              onOpenChange={(isOpen) => handlePopUpToggle("deployRelay", isOpen)}
            />
          </TableContainer>
        </CardContent>
      </Card>
    );
  },
  { action: OrgRelayPermissionActions.ListRelays, subject: OrgPermissionSubjects.Relay }
);
