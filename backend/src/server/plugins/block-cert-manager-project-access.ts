import { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import RE2 from "re2";

import { ForbiddenRequestError } from "@app/lib/errors";

const ACCESS_PATH_RE = new RE2("/(memberships|identities|groups|roles)(/|$|\\?)");

export const blockCertManagerProjectAccess: FastifyPluginAsync = fp(async (server) => {
  server.addHook("preValidation", async (req) => {
    const projectId = (req.params as { projectId?: string } | null)?.projectId;
    if (!projectId) return;

    const routePath = req.routerPath ?? "";
    if (!routePath.startsWith("/api/v1/projects/")) return;
    if (!ACCESS_PATH_RE.test(routePath)) return;

    const isCertManager = await server.services.certManagerProjectResolver.isCertManagerProject(projectId);
    if (isCertManager) {
      throw new ForbiddenRequestError({
        message:
          "This Cert Manager project does not support project-level memberships. Use /api/v1/cert-manager/access/* instead."
      });
    }
  });
});
