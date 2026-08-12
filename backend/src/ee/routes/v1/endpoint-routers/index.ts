import { registerEndpointAgentRouter } from "./endpoint-agent-router";
import { registerEndpointDeviceRouter } from "./endpoint-device-router";
import { registerEndpointEgressRuleRouter } from "./endpoint-egress-rule-router";
import { registerEndpointEventRouter } from "./endpoint-event-router";
import { registerEndpointProjectRouter } from "./endpoint-project-router";

export const registerEndpointRouters = async (server: FastifyZodProvider) => {
  await server.register(registerEndpointProjectRouter);
  await server.register(registerEndpointDeviceRouter, { prefix: "/devices" });
  await server.register(registerEndpointEgressRuleRouter, { prefix: "/egress-rules" });
  await server.register(registerEndpointEventRouter, { prefix: "/events" });
  await server.register(registerEndpointAgentRouter, { prefix: "/agent" });
};
