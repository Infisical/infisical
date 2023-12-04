import { registerPasswordRouter } from "./password-router";

export const registerV1Routes = async (server: FastifyZodProvider) => {
  await server.register(registerPasswordRouter, { prefix: "/password" });
};
