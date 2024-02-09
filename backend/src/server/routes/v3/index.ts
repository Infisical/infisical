import { registerLoginRouter } from "./login-router";
import { registerSecretBlindIndexRouter } from "./secret-blind-index-router";
import { registerSecretRouter } from "./secret-router";
import { registerSignupRouter } from "./signup-router";
import { registerUserRouter } from "./user-router";

export const registerV3Routes = async (server: FastifyZodProvider) => {
  await server.register(registerSignupRouter, { prefix: "/signup" });
  await server.register(registerLoginRouter, { prefix: "/auth" });
  await server.register(registerUserRouter, { prefix: "/users" });
  await server.register(registerSecretRouter, { prefix: "/secrets" });
  await server.register(registerSecretBlindIndexRouter, { prefix: "/workspaces" });
};
