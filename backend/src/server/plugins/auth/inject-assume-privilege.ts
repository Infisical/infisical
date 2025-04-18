import { requestContext } from "@fastify/request-context";
import fp from "fastify-plugin";

import { AuthMode } from "@app/services/auth/auth-type";

export const injectAssumePrivilege = fp(async (server: FastifyZodProvider) => {
  server.addHook("onRequest", async (req) => {
    const assumeRoleCookie = req.cookies["infisical-project-assume-privileges"];
    if (req?.auth?.authMode === AuthMode.JWT && assumeRoleCookie) {
      const decodedToken = server.services.assumePrivileges.verifyAssumePrivilegeToken(
        assumeRoleCookie,
        req.auth.tokenVersionId
      );
      if (decodedToken) {
        requestContext.set("projectAssumeRole", decodedToken);
      }
    }
  });
});
