import { useState } from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CopyButton,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Tabs,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { TAgentGateway } from "@app/hooks/api/agentGateways";

import { AgentGatewayTransportBadge } from "./AgentGatewayTransportBadge";

type Props = {
  agentGateway: TAgentGateway;
};

enum DeployMode {
  Local = "local",
  Remote = "remote"
}

const CommandBlock = ({ command, badge }: { command: string; badge?: string }) => (
  <div className="rounded border border-mineshaft-600 bg-mineshaft-900">
    <div className="flex items-center justify-between border-b border-mineshaft-600 px-3 py-2">
      <span className="text-xs text-mineshaft-300">Command</span>
      {badge && (
        <span className="rounded bg-mineshaft-700 px-2 py-0.5 text-xs text-mineshaft-200">
          {badge}
        </span>
      )}
    </div>
    <div className="flex items-center justify-between gap-x-2 px-3 py-2.5">
      <code className="overflow-x-auto font-mono text-xs text-mineshaft-100">{command}</code>
      <CopyButton value={command} ariaLabel="Copy command" />
    </div>
  </div>
);

// Which mode applies is a property of where the agent runs, not of the agent gateway, so both are offered
// when both are possible: the same object serves a sandboxed local run and a fleet behind a deployed gateway.
// A gateway that permits only one of them shows that one, with no toggle to choose the impossible option.
export const AgentGatewayDeploySection = ({ agentGateway }: Props) => {
  const hasTransport = Boolean(agentGateway.gateway || agentGateway.gatewayPool);
  const canRunLocally = agentGateway.isLocalModeEnabled;
  const [mode, setMode] = useState(hasTransport ? DeployMode.Remote : DeployMode.Local);

  // Keeps the shown mode honest if the agent gateway is edited while this page is open.
  const activeMode = (() => {
    if (!canRunLocally) return DeployMode.Remote;
    if (!hasTransport) return DeployMode.Local;
    return mode;
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Deployment</CardTitle>
        <CardDescription>
          {activeMode === DeployMode.Local
            ? "Run the broker and your agent together on your machine, with nothing to install."
            : "Broker agent traffic through an existing Infisical gateway."}
        </CardDescription>
        {canRunLocally && hasTransport && (
          <CardAction>
            <Tabs value={activeMode} onValueChange={(next) => setMode(next as DeployMode)}>
              <TabsList>
                <TabsTrigger value={DeployMode.Local}>Local</TabsTrigger>
                <TabsTrigger value={DeployMode.Remote}>Remote</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-y-4">
        {activeMode === DeployMode.Local ? (
          <div className="flex flex-col gap-y-4">
            {canRunLocally ? (
              <>
                <CommandBlock
                  command={`infisical secrets agent gateway run --name ${agentGateway.name} -- <sub-process>`}
                  badge="No installation"
                />
                <p className="text-xs text-mineshaft-400">
                  Runs the broker and your agent together in a local sandbox. Replace
                  &lt;sub-process&gt; with the command that starts your agent.
                </p>
              </>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon" />
                  <EmptyTitle>Local mode is disabled</EmptyTitle>
                  <EmptyDescription>
                    Enable local mode on this agent gateway to run an agent on your own machine.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-y-4">
            {hasTransport ? (
              <>
                <div className="flex items-center justify-between rounded border border-mineshaft-600 px-3 py-2.5">
                  <AgentGatewayTransportBadge agentGateway={agentGateway} />
                  <span className="text-xs text-mineshaft-400">
                    {agentGateway.gatewayPool ? "Gateway Pool" : "Gateway"}
                  </span>
                </div>
                <p className="text-xs text-mineshaft-400">
                  Traffic is brokered through this gateway. Change it in the agent gateway&apos;s
                  settings.
                </p>
                <div>
                  <p className="mb-2 text-sm font-medium text-mineshaft-100">Connect your agent</p>
                  <CommandBlock
                    command={`infisical secrets agent gateway connect --name ${agentGateway.name} -- <sub-command>`}
                  />
                  <p className="mt-2 text-xs text-mineshaft-400">
                    Runs your agent with its requests brokered through this gateway. Replace
                    &lt;sub-command&gt; with the command that starts your agent.
                  </p>
                </div>
              </>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon" />
                  <EmptyTitle>No gateway assigned</EmptyTitle>
                  <EmptyDescription>
                    Assign a gateway to this agent gateway to broker agent traffic remotely.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
