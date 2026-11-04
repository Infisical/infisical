import { FastifyRequest } from "fastify";

import { TGenericPermission } from "@app/lib/types";

export const actorContext = (req: FastifyRequest): TGenericPermission => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

// The project a list, create or project-level request acts on: the projectId it sent, checked against the caller's
// org, or the temporary fallback for clients that predate projects.
export const resolveRequestedProjectId = (req: FastifyRequest, projectId: string | undefined) =>
  req.server.services.agentVaultProjectResolver.resolve(req.permission.orgId, projectId, {
    route: `${req.method} ${req.routeOptions.url ?? ""}`,
    actorId: req.permission.id,
    actorType: req.permission.type,
    userAgent: req.headers["user-agent"]
  });
