import { z } from "zod";

import {
  OrgMembershipsSchema,
  ProjectMembershipRole,
  ProjectMembershipsSchema,
  UserEncryptionKeysSchema,
  UsersSchema
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:workspaceId/memberships",
    method: "GET",
    schema: {
      description: "Return project user memberships",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          memberships: ProjectMembershipsSchema.merge(
            z.object({
              user: UsersSchema.pick({
                email: true,
                firstName: true,
                lastName: true,
                id: true
              }).merge(UserEncryptionKeysSchema.pick({ publicKey: true }))
            })
          )
            .omit({ createdAt: true, updatedAt: true })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const memberships = await server.services.projectMembership.getProjectMemberships({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId
      });
      return { memberships };
    }
  });

  server.route({
    url: "/:workspaceId/memberships",
    method: "POST",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      body: z.object({
        members: z
          .object({
            orgMembershipId: z.string().trim(),
            workspaceEncryptedKey: z.string().trim(),
            workspaceEncryptedNonce: z.string().trim()
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          data: OrgMembershipsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.projectMembership.addUsersToProject({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        members: req.body.members.map((member) => ({
          ...member,
          projectRole: ProjectMembershipRole.Member
        }))
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.params.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.ADD_BATCH_WORKSPACE_MEMBER,
          metadata: data.map(({ userId }) => ({
            userId: userId || "",
            email: ""
          }))
        }
      });

      return { data, success: true };
    }
  });

  server.route({
    url: "/:workspaceId/memberships/:membershipId",
    method: "PATCH",
    schema: {
      description: "Update project user membership",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim(),
        membershipId: z.string().trim()
      }),
      body: z.object({
        role: z.string().trim()
      }),
      response: {
        200: z.object({
          membership: ProjectMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.projectMembership.updateProjectMembership({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        membershipId: req.params.membershipId,
        role: req.body.role
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.UPDATE_USER_WORKSPACE_ROLE,
          metadata: {
            userId: membership.userId,
            newRole: req.body.role,
            oldRole: membership.role,
            email: ""
          }
        }
      });
      return { membership };
    }
  });

  server.route({
    url: "/:workspaceId/memberships/:membershipId",
    method: "DELETE",
    schema: {
      description: "Delete project user membership",
      security: [
        {
          bearerAuth: [],
          apiKeyAuth: []
        }
      ],
      params: z.object({
        workspaceId: z.string().trim(),
        membershipId: z.string().trim()
      }),
      response: {
        200: z.object({
          membership: ProjectMembershipsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const membership = await server.services.projectMembership.deleteProjectMembership({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.params.workspaceId,
        membershipId: req.params.membershipId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.REMOVE_WORKSPACE_MEMBER,
          metadata: {
            userId: membership.userId,
            email: ""
          }
        }
      });
      return { membership };
    }
  });
};
