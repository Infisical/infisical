import { registerGatewayV3Router } from "./gateway-router";

export const registerV3EERoutes = async (server: FastifyZodProvider) => {
  await server.register(registerGatewayV3Router, { prefix: "/gateways" });
};
