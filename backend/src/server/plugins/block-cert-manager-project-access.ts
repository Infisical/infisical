import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import RE2 from "re2";

import { ForbiddenRequestError } from "@app/lib/errors";

const ACCESS_PATH_RE = new RE2("/(memberships|identity-memberships|groups|roles)(/|$|\\?)");
const PROJECT_ROUTE_PREFIX_RE = new RE2("^/api/v[12]/(projects|workspace)/");

export const blockCertManagerProjectAccess: FastifyPluginAsync = fp(async (server) => {
  server.addHook("preValidation", async (req) => {
    if (!req.permission?.orgId) return;

    const params = req.params as { projectId?: string; workspaceId?: string } | null;
    const projectId = params?.projectId ?? params?.workspaceId;
    if (!projectId) return;

    const routePath = req.routerPath ?? "";
    if (!PROJECT_ROUTE_PREFIX_RE.test(routePath)) return;
    if (!ACCESS_PATH_RE.test(routePath)) return;

    const isCertManager = await server.services.certManagerProjectResolver.isCertManagerProject(
      projectId,
      req.permission.orgId
    );
    if (isCertManager) {
      throw new ForbiddenRequestError({
        message:
          "This Certificate Manager project does not support project-level memberships. Use /api/v1/cert-manager/access/* instead."
      });
    }
  });
});
