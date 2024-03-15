import ms from "ms";
import { z } from "zod";

import { ProjectUserAdditionalPrivilegeSchema } from "@app/db/schemas";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.union([
        z.object({
          projectMembershipId: z.string(),
          slug: z.string().max(60).trim(),
          name: z.string().trim(),
          description: z.string().trim().optional(),
          permissions: z.any().array(),
          isTemporary: z.literal(false).default(false)
        }),
        z.object({
          projectMembershipId: z.string(),
          slug: z.string().max(60).trim(),
          name: z.string().trim(),
          description: z.string().trim().optional(),
          permissions: z.any().array(),
          isTemporary: z.literal(true),
          temporaryMode: z.nativeEnum(ProjectUserAdditionalPrivilegeTemporaryMode),
          temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
          temporaryAccessStartTime: z.string().datetime()
        })
      ]),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.create({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        ...req.body,
        permissions: JSON.stringify(req.body.permissions)
      });
      return { privilege };
    }
  });

  server.route({
    url: "/:privilegeId",
    method: "PATCH",
    schema: {
      params: z.object({
        privilegeId: z.string()
      }),
      body: z
        .object({
          slug: z.string().max(60).trim(),
          name: z.string().trim(),
          description: z.string().trim().optional(),
          permissions: z.any().array(),
          isTemporary: z.boolean(),
          temporaryMode: z.nativeEnum(ProjectUserAdditionalPrivilegeTemporaryMode),
          temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
          temporaryAccessStartTime: z.string().datetime()
        })
        .partial(),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.updateById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        ...req.body,
        permissions: req.body.permissions ? JSON.stringify(req.body.permissions) : undefined,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });

  server.route({
    url: "/:privilegeId",
    method: "DELETE",
    schema: {
      params: z.object({
        privilegeId: z.string()
      }),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.deleteById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });

  server.route({
    url: "/:privilegeId",
    method: "GET",
    schema: {
      params: z.object({
        privilegeId: z.string()
      }),
      response: {
        200: z.object({
          privilege: ProjectUserAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privilege = await server.services.projectUserAdditionalPrivilege.getPrivilegeDetailsById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });
};
