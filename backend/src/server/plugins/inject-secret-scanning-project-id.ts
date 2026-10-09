import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { BadRequestError, NotFoundError } from "@app/lib/errors";

const SECRET_SCANNING_PREFIX = "/api/v2/secret-scanning/";

type TSchemaWithShape = { shape?: Record<string, unknown> } | undefined;

// Most Secret Scanning routes are keyed by a data source or finding ID; only routes that declare a
// projectId input need one resolved, so the rest skip the lookup entirely.
const routeAcceptsProjectId = (schema: { querystring?: unknown; body?: unknown } | undefined) =>
  Boolean(
    (schema?.querystring as TSchemaWithShape)?.shape?.projectId || (schema?.body as TSchemaWithShape)?.shape?.projectId
  );

const readProjectIdFromRequest = (req: { query?: unknown; body?: unknown }): string | null => {
  const fromQuery = (req.query as { projectId?: unknown } | undefined)?.projectId;
  if (typeof fromQuery === "string" && fromQuery.trim().length > 0) return fromQuery.trim();
  const fromBody = (req.body as { projectId?: unknown } | undefined)?.projectId;
  if (typeof fromBody === "string" && fromBody.trim().length > 0) return fromBody.trim();
  return null;
};

export const injectSecretScanningProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("internalSecretScanningProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const routePath = req.routeOptions.url ?? "";
    if (!routePath.startsWith(SECRET_SCANNING_PREFIX)) return;
    if (!routeAcceptsProjectId(req.routeOptions.schema)) return;

    const explicit = readProjectIdFromRequest(req);
    if (explicit) {
      const isValidForOrg = await server.services.secretScanningV2ProjectResolver.isSecretScanningProject(
        explicit,
        req.permission.orgId
      );
      if (!isValidForOrg) {
        throw new NotFoundError({
          message: `Secret Scanning project with ID '${explicit}' not found in this organization`
        });
      }
      req.internalSecretScanningProjectId = explicit;
      return;
    }

    // Never creates the project: these routes accept tokens whose scopes are only checked later, against it.
    const activeProjectId = await server.services.secretScanningV2ProjectResolver.findActiveProjectId(
      req.permission.orgId
    );
    if (!activeProjectId) {
      throw new BadRequestError({
        message:
          "This organization has no Secret Scanning project yet. Open Secret Scanning in Infisical to set it up, or pass a projectId."
      });
    }
    req.internalSecretScanningProjectId = activeProjectId;
  });
});
