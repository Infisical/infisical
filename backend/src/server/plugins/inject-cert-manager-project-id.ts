import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { BadRequestError } from "@app/lib/errors";

const CERT_MANAGER_PREFIXES = ["/api/v1/cert-manager/", "/api/v1/pki/", "/api/v2/pki/"];

const readProjectIdFromRequest = (req: { query?: unknown; body?: unknown; params?: unknown }): string | null => {
  const fromQuery = (req.query as { projectId?: unknown } | undefined)?.projectId;
  if (typeof fromQuery === "string" && fromQuery.length > 0) return fromQuery;
  const fromBody = (req.body as { projectId?: unknown } | undefined)?.projectId;
  if (typeof fromBody === "string" && fromBody.length > 0) return fromBody;
  const params = req.params as { projectId?: unknown; workspaceId?: unknown } | undefined;
  const fromParams = params?.projectId ?? params?.workspaceId;
  if (typeof fromParams === "string" && fromParams.length > 0) return fromParams;
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
      req.internalCertManagerProjectId = explicit;
      return;
    }

    try {
      req.internalCertManagerProjectId = await server.services.certManagerProjectResolver.resolve(req.permission.orgId);
    } catch (err) {
      // Swallow only the resolver's expected "no project / no default" errors so endpoints that infer the
      // project from another entity (profileId, certId, alertId, etc.) keep working.
      if (!(err instanceof BadRequestError)) throw err;
    }
  });
});
