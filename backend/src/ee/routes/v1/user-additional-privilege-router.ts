import slugify from "@sindresorhus/slugify";
import ms from "ms";
import { z } from "zod";

import { ProjectUserAdditionalPrivilegeSchema } from "@app/db/schemas";
import { ProjectUserAdditionalPrivilegeTemporaryMode } from "@app/ee/services/project-user-additional-privilege/project-user-additional-privilege-types";
import { alphaNumericNanoId } from "@app/lib/nanoid";
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
          slug: z
            .string()
            .min(1)
            .max(60)
            .trim()
            .default(`privilege-${slugify(alphaNumericNanoId(12))}`)
            .refine((v) => slugify(v) === v, {
              message: "Slug must be a valid slug"
            }),
          permissions: z.any().array(),
          isTemporary: z.literal(false).default(false)
        }),
        z.object({
          projectMembershipId: z.string(),
          slug: z
            .string()
            .min(1)
            .max(60)
            .trim()
            .default(`privilege-${slugify(alphaNumericNanoId(12))}`)
            .refine((v) => slugify(v) === v, {
              message: "Slug must be a valid slug"
            }),
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
        actorAuthMethod: req.permission.authMethod,
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
          slug: z
            .string()
            .max(60)
            .trim()
            .refine((v) => v.toLowerCase() === v, "Slug must be lowercase")
            .refine((v) => slugify(v) === v, {
              message: "Slug must be a valid slug"
            }),
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
        actorAuthMethod: req.permission.authMethod,
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
        actorAuthMethod: req.permission.authMethod,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        projectMembershipId: z.string()
      }),
      response: {
        200: z.object({
          privileges: ProjectUserAdditionalPrivilegeSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const privileges = await server.services.projectUserAdditionalPrivilege.listPrivileges({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectMembershipId: req.query.projectMembershipId
      });
      return { privileges };
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
        actorAuthMethod: req.permission.authMethod,
        privilegeId: req.params.privilegeId
      });
      return { privilege };
    }
  });
};
