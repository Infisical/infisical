import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { BadRequestError } from "@app/lib/errors";

const CERT_MANAGER_PREFIXES = ["/api/v1/cert-manager/", "/api/v1/pki/", "/api/v2/pki/"];

const readProjectIdFromRequest = (req: { query?: unknown; body?: unknown }): string | null => {
  const fromQuery = (req.query as { projectId?: unknown } | undefined)?.projectId;
  if (typeof fromQuery === "string" && fromQuery.length > 0) return fromQuery;
  const fromBody = (req.body as { projectId?: unknown } | undefined)?.projectId;
  if (typeof fromBody === "string" && fromBody.length > 0) return fromBody;
  return null;
};

export const injectCertManagerProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("internalCertManagerProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const routePath = req.routerPath ?? "";
    if (!CERT_MANAGER_PREFIXES.some((prefix) => routePath.startsWith(prefix))) return;

    if (routePath === "/api/v1/cert-manager/instance" || routePath.startsWith("/api/v1/cert-manager/instance/")) {
      return;
    }

    const explicit = readProjectIdFromRequest(req);
    if (explicit) {
      const isCertManager = await server.services.certManagerProjectResolver.isCertManagerProject(explicit);
      if (!isCertManager) {
        throw new BadRequestError({
          message: "The supplied projectId does not reference a Certificate Manager project."
        });
      }
      req.internalCertManagerProjectId = explicit;
      return;
    }

    req.internalCertManagerProjectId = await server.services.certManagerProjectResolver.resolve(req.permission.orgId);
  });
});
