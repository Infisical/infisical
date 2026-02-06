import { registerSecretRouter } from "./secret-router";

export const registerV4Routes = async (server: FastifyZodProvider) => {
  await server.register(registerSecretRouter, { prefix: "/secrets" });
};
