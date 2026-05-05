import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  createdAt: z.date()
});

const InstanceStateSchema = z.object({
  activeProjectId: z.string().nullable(),
  projects: z.array(ProjectSummarySchema),
  isMultiInstance: z.boolean()
});

const LegacyInstanceSchema = ProjectSummarySchema.extend({
  certificateCount: z.number().int().nonnegative(),
  syncCount: z.number().int().nonnegative(),
  alertCount: z.number().int().nonnegative(),
  isActive: z.boolean()
});

export const registerCertManagerInstanceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/instance",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getCertManagerInstanceState",
      description:
        "Get the active Cert Manager project and the list of legacy Cert Manager projects in this organization.",
      tags: [ApiDocsTags.CertManagerInstance],
      response: { 200: InstanceStateSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const state = await server.services.certManagerInstance.getInstanceState({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_CERT_MANAGER_INSTANCE_STATE,
          metadata: {
            activeProjectId: state.activeProjectId,
            projectCount: state.projects.length,
            isMultiInstance: state.isMultiInstance
          }
        }
      });

      return state;
    }
  });

  server.route({
    method: "GET",
    url: "/instance/legacy",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listCertManagerLegacyInstances",
      description: "List all Cert Manager projects in the organization with their certificate, sync, and alert counts.",
      tags: [ApiDocsTags.CertManagerInstance],
      response: {
        200: z.object({
          activeProjectId: z.string().nullable(),
          instances: z.array(LegacyInstanceSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      return server.services.certManagerInstance.listLegacyInstances({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
    }
  });

  server.route({
    method: "POST",
    url: "/instance/active-project",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "setCertManagerActiveProject",
      description:
        "Set the active Cert Manager project for this organization. New API requests resolve to this project when no projectId is supplied.",
      tags: [ApiDocsTags.CertManagerInstance],
      body: z.object({ projectId: z.string().uuid() }),
      response: {
        200: z.object({
          activeProjectId: z.string(),
          previousActiveProjectId: z.string().nullable(),
          projectName: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.certManagerInstance.setActiveProject(
        {
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        },
        req.body.projectId
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.SET_CERT_MANAGER_ACTIVE_PROJECT,
          metadata: {
            activeProjectId: result.activeProjectId,
            previousActiveProjectId: result.previousActiveProjectId,
            projectName: result.projectName
          }
        }
      });

      return result;
    }
  });
};
