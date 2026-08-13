import { useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "@tanstack/react-router";
import { MoreHorizontalIcon, Trash2Icon, Waypoints } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import {
  ProjectPermissionAgentGatewayActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useDebounce, usePopUp } from "@app/hooks";
import { useListAgentGateways } from "@app/hooks/api/agentGateways";
import { TAgentGatewayListItem } from "@app/hooks/api/agentGateways/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AgentGatewayTransportBadge } from "../AgentGatewayDetailsByIDPage/components/AgentGatewayTransportBadge";
import { CreateAgentGatewayModal } from "./components/CreateAgentGatewayModal";
import { DeleteAgentGatewayModal } from "./components/DeleteAgentGatewayModal";

export const AgentGatewaysPage = () => {
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const projectId = currentProject?.id ?? "";
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "createAgentGateway",
    "deleteAgentGateway"
  ] as const);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);
  const { data, isPending } = useListAgentGateways({ projectId, search: debouncedSearch });
  const agentGateways = data?.agentGateways ?? [];

  return (
    <>
      <Helmet>
        <title>Agent Gateways</title>
      </Helmet>
      <div className="mx-auto flex max-w-8xl flex-col">
        <PageHeader
          scope={ProjectType.SecretManager}
          title="Agent Gateways"
          description="Deploy gateways that broker agent requests to proxied services, and control who can use them."
          icon={Waypoints}
        />
        <Card>
          <CardHeader>
            <CardTitle>Agent Gateways</CardTitle>
            <CardDescription>
              Create and manage gateways that broker agent traffic to proxied services.
            </CardDescription>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionAgentGatewayActions.Create}
                a={ProjectPermissionSub.AgentGateways}
              >
                {(isAllowed) => (
                  <Button
                    variant="project"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("createAgentGateway")}
                  >
                    Create Agent Gateway
                  </Button>
                )}
              </ProjectPermissionCan>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Input
              className="mb-4"
              placeholder="Search gateways..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {!isPending && !agentGateways.length ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Waypoints />
                  </EmptyMedia>
                  <EmptyTitle>
                    {search ? "No gateways match your search" : "No agent gateways yet"}
                  </EmptyTitle>
                  {!search && (
                    <EmptyDescription>
                      An agent gateway brokers your agents&apos; requests to the services you
                      connect to it.
                    </EmptyDescription>
                  )}
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Proxied Services</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Gateway</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentGateways.map((agentGateway) => (
                    <TableRow
                      key={agentGateway.id}
                      className="cursor-pointer"
                      onClick={() =>
                        navigate({
                          to: "/organizations/$orgId/projects/secret-management/$projectId/agent-gateways/$agentGatewayId",
                          params: {
                            orgId: currentOrg?.id ?? "",
                            projectId,
                            agentGatewayId: agentGateway.id
                          }
                        })
                      }
                    >
                      <TableCell>{agentGateway.name}</TableCell>
                      <TableCell className="text-mineshaft-300">
                        {agentGateway.proxiedServiceCount === 1
                          ? "1 Service"
                          : `${agentGateway.proxiedServiceCount} Services`}
                      </TableCell>
                      <TableCell className="text-mineshaft-300">
                        {agentGateway.accessCount === 1
                          ? "1 Principal"
                          : `${agentGateway.accessCount} Principals`}
                      </TableCell>
                      <TableCell>
                        <AgentGatewayTransportBadge agentGateway={agentGateway} />
                      </TableCell>
                      <TableCell className="w-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            {/* The row navigates, so the trigger has to keep its click to itself. */}
                            <IconButton
                              variant="ghost"
                              size="xs"
                              aria-label="Agent gateway options"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontalIcon />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <ProjectPermissionCan
                              I={ProjectPermissionAgentGatewayActions.Delete}
                              a={ProjectPermissionSub.AgentGateways}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  variant="danger"
                                  isDisabled={!isAllowed}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("deleteAgentGateway", agentGateway);
                                  }}
                                >
                                  <Trash2Icon />
                                  Delete Agent Gateway
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      <CreateAgentGatewayModal
        isOpen={popUp.createAgentGateway.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createAgentGateway", isOpen)}
        projectId={projectId}
      />
      <DeleteAgentGatewayModal
        agentGateway={popUp.deleteAgentGateway.data as TAgentGatewayListItem | undefined}
        isOpen={popUp.deleteAgentGateway.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteAgentGateway", isOpen)}
      />
    </>
  );
};
