import { Helmet } from "react-helmet";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, PencilIcon, Waypoints } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CopyButton,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import {
  ProjectPermissionAgentGatewayActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useGetAgentGatewayById } from "@app/hooks/api/agentGateways";
import { AgentGatewayUnmatchedHostPolicy } from "@app/hooks/api/agentGateways/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { EditAgentGatewayModal } from "../AgentGatewaysPage/components/EditAgentGatewayModal";
import { AgentGatewayAccessSection } from "./components/AgentGatewayAccessSection";
import { AgentGatewayAllowedHostsSection } from "./components/AgentGatewayAllowedHostsSection";
import { AgentGatewayDeploySection } from "./components/AgentGatewayDeploySection";
import { AgentGatewayServicesSection } from "./components/AgentGatewayServicesSection";
import { AgentGatewaySessionsSection } from "./components/AgentGatewaySessionsSection";
import { AgentGatewayTransportBadge } from "./components/AgentGatewayTransportBadge";

const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-xs text-mineshaft-400">{label}</p>
    <div className="mt-0.5 text-sm text-mineshaft-100">{children}</div>
  </div>
);

export const AgentGatewayDetailsByIDPage = () => {
  const params = useParams({
    from: ROUTE_PATHS.SecretManager.AgentGatewayDetailsByIDPage.id
  });
  const agentGatewayId = params.agentGatewayId as string;
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data: agentGateway, isPending } = useGetAgentGatewayById(agentGatewayId);
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["editAgentGateway"] as const);

  if (isPending) return <PageLoader />;

  if (!agentGateway) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon" />
          <EmptyTitle>Agent Gateway not found</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Helmet>
        <title>{agentGateway.name}</title>
      </Helmet>
      <div className="mx-auto flex max-w-8xl flex-col">
        <Link
          to="/organizations/$orgId/projects/secret-management/$projectId/agent-gateways"
          params={{ orgId: currentOrg?.id ?? "", projectId: currentProject?.id ?? "" }}
          className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition hover:text-mineshaft-400/80"
        >
          <ChevronLeftIcon size={16} />
          Agent Gateways
        </Link>
        <PageHeader
          scope={ProjectType.SecretManager}
          title={agentGateway.name}
          description="Gateway configuration, deployment, and access control."
          icon={Waypoints}
        >
          <ProjectPermissionCan
            I={ProjectPermissionAgentGatewayActions.Edit}
            a={ProjectPermissionSub.AgentGateways}
          >
            {(isAllowed) => (
              <Button
                variant="outline"
                isDisabled={!isAllowed}
                onClick={() => handlePopUpOpen("editAgentGateway")}
              >
                <PencilIcon />
                Edit
              </Button>
            )}
          </ProjectPermissionCan>
        </PageHeader>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[24rem_minmax(0,1fr)]">
          {/* Two independent stacks rather than placed grid cells: a spanning column would stretch the rows
              and leave a hole under whichever card is shorter. */}
          <div className="flex w-full min-w-0 flex-col gap-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-sm font-medium text-mineshaft-100">General</p>
                <DetailRow label="ID">
                  <span className="flex items-center gap-x-2">
                    <code className="font-mono text-xs">{agentGateway.id}</code>
                    <CopyButton value={agentGateway.id} ariaLabel="Copy agent gateway ID" />
                  </span>
                </DetailRow>
                {agentGateway.description && (
                  <DetailRow label="Description">{agentGateway.description}</DetailRow>
                )}
                <DetailRow label="Gateway">
                  <AgentGatewayTransportBadge agentGateway={agentGateway} />
                </DetailRow>
                <DetailRow label="Unmatched Hosts">
                  <Badge
                    variant={
                      agentGateway.unmatchedHostPolicy === AgentGatewayUnmatchedHostPolicy.Block
                        ? "project"
                        : "neutral"
                    }
                  >
                    {agentGateway.unmatchedHostPolicy === AgentGatewayUnmatchedHostPolicy.Block
                      ? "Blocked"
                      : "Allowed"}
                  </Badge>
                </DetailRow>
                <DetailRow label="Local Mode">
                  <Badge variant={agentGateway.isLocalModeEnabled ? "success" : "project"}>
                    {agentGateway.isLocalModeEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </DetailRow>
                <DetailRow label="Last Used">
                  {agentGateway.lastUsedAt
                    ? new Date(agentGateway.lastUsedAt).toLocaleString()
                    : "Never"}
                </DetailRow>
                <DetailRow label="Created">
                  {new Date(agentGateway.createdAt).toLocaleString()}
                </DetailRow>
              </CardContent>
            </Card>
            {/* Access control sits with Details because both answer "what is this thing", and the wide column
                is for the things you act on: how to run it, what it brokers, and what it did. */}
            <AgentGatewayAccessSection agentGateway={agentGateway} />
          </div>
          <div className="flex min-w-0 flex-col gap-y-8">
            <AgentGatewayDeploySection agentGateway={agentGateway} />
            <AgentGatewayServicesSection agentGateway={agentGateway} />
            <AgentGatewaySessionsSection agentGateway={agentGateway} />
            <AgentGatewayAllowedHostsSection agentGateway={agentGateway} />
          </div>
        </div>
      </div>
      <EditAgentGatewayModal
        agentGateway={agentGateway}
        isOpen={popUp.editAgentGateway.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editAgentGateway", isOpen)}
      />
    </>
  );
};
