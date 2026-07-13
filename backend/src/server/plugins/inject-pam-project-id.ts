import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const PAM_PREFIX = "/api/v1/pam/";

export const injectPamProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("internalPamProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const routePath = req.routeOptions.url ?? "";
    if (!routePath.startsWith(PAM_PREFIX)) return;

    req.internalPamProjectId = await server.services.pamProjectResolver.resolve(req.permission.orgId);
  });
});
