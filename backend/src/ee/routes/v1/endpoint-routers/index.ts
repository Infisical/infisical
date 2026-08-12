import { registerEndpointAgentRouter } from "./endpoint-agent-router";
import { registerEndpointCounterRouter } from "./endpoint-counter-router";
import { registerEndpointDeviceRouter } from "./endpoint-device-router";
import { registerEndpointEventRouter } from "./endpoint-event-router";
import { registerEndpointNetworkRuleRouter } from "./endpoint-network-rule-router";
import { registerEndpointProjectRouter } from "./endpoint-project-router";

export const registerEndpointRouters = async (server: FastifyZodProvider) => {
  await server.register(registerEndpointProjectRouter);
  await server.register(registerEndpointDeviceRouter, { prefix: "/devices" });
  await server.register(registerEndpointNetworkRuleRouter, { prefix: "/network-rules" });
  await server.register(registerEndpointEventRouter, { prefix: "/events" });
  await server.register(registerEndpointCounterRouter, { prefix: "/counters" });
  await server.register(registerEndpointAgentRouter, { prefix: "/agent" });
};
