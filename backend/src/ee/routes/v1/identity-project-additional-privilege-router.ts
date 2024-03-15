import ms from "ms";
import { z } from "zod";

import { IdentityProjectAdditionalPrivilegeSchema } from "@app/db/schemas";
import { IdentityProjectAdditionalPrivilegeTemporaryMode } from "@app/ee/services/identity-project-additional-privilege/identity-project-additional-privilege-types";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityProjectAdditionalPrivilegeRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.union([
        z.object({
          identityId: z.string(),
          projectId: z.string(),
          slug: z.string().max(60).trim(),
          name: z.string().trim(),
          description: z.string().trim().optional(),
          permissions: z.any().array(),
          isTemporary: z.literal(false).default(false)
        }),
        z.object({
          identityId: z.string(),
          projectId: z.string(),
          slug: z.string().max(60).trim(),
          name: z.string().trim(),
          description: z.string().trim().optional(),
          permissions: z.any().array(),
          isTemporary: z.literal(true),
          temporaryMode: z.nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode),
          temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
          temporaryAccessStartTime: z.string().datetime()
        })
      ]),
      response: {
        200: z.object({
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilege.create({
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
          temporaryMode: z.nativeEnum(IdentityProjectAdditionalPrivilegeTemporaryMode),
          temporaryRange: z.string().refine((val) => ms(val) > 0, "Temporary range must be a positive number"),
          temporaryAccessStartTime: z.string().datetime()
        })
        .partial(),
      response: {
        200: z.object({
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilege.updateById({
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
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilege.deleteById({
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
          privilege: IdentityProjectAdditionalPrivilegeSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privilege = await server.services.identityProjectAdditionalPrivilege.getPrivilegeDetailsById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });

  server.route({
    url: "/permissions",
    method: "POST",
    schema: {
      body: z.object({
        identityId: z.string(),
        projectId: z.string()
      }),
      response: {
        200: z.object({
          privileges: IdentityProjectAdditionalPrivilegeSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const privileges = await server.services.identityProjectAdditionalPrivilege.listIdentityProjectPrivileges({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        projectId: req.body.projectId,
        identityId: req.body.identityId
      });
      return { privileges };
    }
  });
};
