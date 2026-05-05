import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

export const injectCertManagerProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("certManagerProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const routePath = req.routerPath ?? "";
    if (routePath === "/api/v1/cert-manager/instance" || routePath.startsWith("/api/v1/cert-manager/instance/")) {
      return;
    }

    req.certManagerProjectId = await server.services.certManagerProjectResolver.resolve(req.permission.orgId);
  });
});
