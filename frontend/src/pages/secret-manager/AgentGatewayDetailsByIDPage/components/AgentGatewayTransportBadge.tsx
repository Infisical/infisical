import { TAgentGatewayBase } from "@app/hooks/api/agentGateways";

type Props = {
  agentGateway: Pick<TAgentGatewayBase, "gateway" | "gatewayPool">;
};

// The server already decided whether the gateway is reachable and whether its CLI can broker, so this only
// renders that answer. A gateway that is up but too old is a different problem from one that is down, and
// saying so here is what stops someone debugging the wrong thing.
export const AgentGatewayTransportBadge = ({ agentGateway }: Props) => {
  if (agentGateway.gatewayPool) {
    return <span className="text-sm text-mineshaft-300">{agentGateway.gatewayPool.name}</span>;
  }

  if (!agentGateway.gateway) {
    // No Gateway attached is an absent value, not a status: whether local mode is allowed is its own field.
    return <span className="text-sm text-mineshaft-400">&mdash;</span>;
  }

  const { name, isHealthy, supportsAgentProxy } = agentGateway.gateway;

  let label = "Online";
  let dotClass = "bg-green-500";
  if (!isHealthy) {
    label = "Unreachable";
    dotClass = "bg-red-500";
  } else if (!supportsAgentProxy) {
    label = "Needs upgrade";
    dotClass = "bg-yellow-500";
  }

  return (
    <span className="flex items-center gap-x-2 text-sm text-mineshaft-200">
      <span className={`size-1.5 rounded-full ${dotClass}`} />
      {name}
      <span className="text-xs text-mineshaft-400">{label}</span>
    </span>
  );
};
