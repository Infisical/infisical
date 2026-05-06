import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const CERT_MANAGER_PREFIXES = ["/api/v1/cert-manager/", "/api/v1/pki/", "/api/v2/pki/"];

export const injectCertManagerProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("certManagerProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const routePath = req.routerPath ?? "";
    if (!CERT_MANAGER_PREFIXES.some((prefix) => routePath.startsWith(prefix))) return;

    if (routePath === "/api/v1/cert-manager/instance" || routePath.startsWith("/api/v1/cert-manager/instance/")) {
      return;
    }

    req.certManagerProjectId = await server.services.certManagerProjectResolver.resolve(req.permission.orgId);
  });
});
