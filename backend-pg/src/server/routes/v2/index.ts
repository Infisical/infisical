import { registerMfaRouter } from "./mfa-router";
import { registerProjectRouter } from "./project-router";
import { registerUserRouter } from "./user-router";

export const registerV2Routes = async (server: FastifyZodProvider) => {
  await server.register(registerMfaRouter, { prefix: "/auth" });
  await server.register(registerUserRouter, { prefix: "/users" });
  await server.register(
    async (projectServer) => {
      projectServer.register(registerProjectRouter);
    },
    { prefix: "/workspace" }
  );
};
