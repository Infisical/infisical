import { requestContext } from "@fastify/request-context";
import fp from "fastify-plugin";

import { AuthMode } from "@app/services/auth/auth-type";

export const injectAssumePrivilege = fp(async (server: FastifyZodProvider) => {
  server.addHook("onRequest", async (req, res) => {
    const assumeRoleCookie = req.cookies["infisical-project-assume-privileges"];
    try {
      if (req?.auth?.authMode === AuthMode.JWT && assumeRoleCookie) {
        const decodedToken = server.services.assumePrivileges.verifyAssumePrivilegeToken(
          assumeRoleCookie,
          req.auth.tokenVersionId
        );
        if (decodedToken) {
          requestContext.set("assumedPrivilegeDetails", decodedToken);
        }
      }
    } catch (error) {
      req.log.error({ error }, "Failed to verify assume privilege token");
      void res.clearCookie("infisical-project-assume-privileges");
    }
  });
});
