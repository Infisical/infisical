import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

import { BadRequestError, NotFoundError } from "@app/lib/errors";

const SECRET_SCANNING_PREFIX = "/api/v2/secret-scanning/";

type TSchemaWithShape = { shape?: Record<string, unknown> } | undefined;

// Most Secret Scanning routes are keyed by a data source or finding ID; only routes that declare a
// projectId input need one resolved, so the rest skip the lookup entirely. The ID is read only from where
// the route declares it, so an undeclared query parameter cannot redirect a body-addressed create.
const getDeclaredProjectIdLocation = (
  schema: { querystring?: unknown; body?: unknown } | undefined
): "query" | "body" | null => {
  if ((schema?.querystring as TSchemaWithShape)?.shape?.projectId) return "query";
  if ((schema?.body as TSchemaWithShape)?.shape?.projectId) return "body";
  return null;
};

const readProjectIdFromRequest = (
  req: { query?: unknown; body?: unknown },
  location: "query" | "body"
): string | null => {
  const source = location === "query" ? req.query : req.body;
  const projectId = (source as { projectId?: unknown } | undefined)?.projectId;
  if (typeof projectId === "string" && projectId.trim().length > 0) return projectId.trim();
  return null;
};

export const injectSecretScanningProjectId: FastifyPluginAsync = fp(async (server) => {
  server.decorateRequest("internalSecretScanningProjectId", "");

  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const routePath = req.routeOptions.url ?? "";
    if (!routePath.startsWith(SECRET_SCANNING_PREFIX)) return;
    const location = getDeclaredProjectIdLocation(req.routeOptions.schema);
    if (!location) return;

    const explicit = readProjectIdFromRequest(req, location);
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
