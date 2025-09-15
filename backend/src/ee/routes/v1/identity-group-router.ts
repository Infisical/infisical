import { z } from "zod";

import { IdentityGroupsSchema, OrgMembershipRole } from "@app/db/schemas";
import { EFilterReturnedIdentities } from "@app/ee/services/identity-group/identity-group-types";
import { ApiDocsTags, IDENTITY_GROUPS } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityGroupRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentityGroups],
      body: z.object({
        name: z.string().trim().min(1).max(50).describe(IDENTITY_GROUPS.CREATE.name),
        slug: slugSchema({ min: 5, max: 36 }).optional().describe(IDENTITY_GROUPS.CREATE.slug),
        role: z.string().trim().min(1).default(OrgMembershipRole.NoAccess).describe(IDENTITY_GROUPS.CREATE.role)
      }),
      response: {
        200: IdentityGroupsSchema
      }
    },
    handler: async (req) => {
      const identityGroup = await server.services.identityGroup.createIdentityGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return identityGroup;
    }
  });

  server.route({
    url: "/:id",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentityGroups],
      params: z.object({
        id: z.string().trim().describe(IDENTITY_GROUPS.GET_BY_ID.id)
      }),
      response: {
        200: IdentityGroupsSchema
      }
    },
    handler: async (req) => {
      const identityGroup = await server.services.identityGroup.getIdentityGroupById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });

      return identityGroup;
    }
  });

  server.route({
    url: "/:id",
    method: "PATCH",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentityGroups],
      params: z.object({
        id: z.string().trim().describe(IDENTITY_GROUPS.UPDATE.id)
      }),
      body: z.object({
        name: z.string().trim().min(1).max(50).optional().describe(IDENTITY_GROUPS.UPDATE.name),
        slug: slugSchema({ min: 5, max: 36 }).optional().describe(IDENTITY_GROUPS.UPDATE.slug),
        role: z.string().trim().min(1).optional().describe(IDENTITY_GROUPS.UPDATE.role)
      }),
      response: {
        200: IdentityGroupsSchema
      }
    },
    handler: async (req) => {
      const identityGroup = await server.services.identityGroup.updateIdentityGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id,
        ...req.body
      });

      return identityGroup;
    }
  });

  server.route({
    url: "/:id",
    method: "DELETE",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentityGroups],
      params: z.object({
        id: z.string().trim().describe(IDENTITY_GROUPS.DELETE.id)
      }),
      response: {
        200: IdentityGroupsSchema
      }
    },
    handler: async (req) => {
      const identityGroup = await server.services.identityGroup.deleteIdentityGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id
      });

      return identityGroup;
    }
  });

  server.route({
    url: "/:id/identities",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentityGroups],
      params: z.object({
        id: z.string().trim().describe(IDENTITY_GROUPS.LIST_IDENTITIES.id)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0).describe(IDENTITY_GROUPS.LIST_IDENTITIES.offset),
        limit: z.coerce.number().min(1).max(100).default(20).describe(IDENTITY_GROUPS.LIST_IDENTITIES.limit),
        search: z.string().trim().optional().describe(IDENTITY_GROUPS.LIST_IDENTITIES.search),
        filter: z.nativeEnum(EFilterReturnedIdentities).optional().describe(IDENTITY_GROUPS.LIST_IDENTITIES.filter)
      }),
      response: {
        200: z.object({
          identities: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              authMethod: z.string().nullable(),
              isPartOfGroup: z.boolean(),
              joinedGroupAt: z.date().nullable()
            })
          ),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { identities, totalCount } = await server.services.identityGroup.listIdentityGroupIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id,
        ...req.query
      });

      return {
        identities,
        totalCount
      };
    }
  });

  server.route({
    url: "/:id/identities/:identityId",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentityGroups],
      params: z.object({
        id: z.string().trim().describe(IDENTITY_GROUPS.ADD_IDENTITY.id),
        identityId: z.string().trim().describe(IDENTITY_GROUPS.ADD_IDENTITY.identityId)
      }),
      response: {
        200: z.object({
          identityGroup: IdentityGroupsSchema
        })
      }
    },
    handler: async (req) => {
      const { identityGroup } = await server.services.identityGroup.addIdentityToGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id,
        identityId: req.params.identityId
      });

      return { identityGroup };
    }
  });

  server.route({
    url: "/:id/identities/:identityId",
    method: "DELETE",
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.IdentityGroups],
      params: z.object({
        id: z.string().trim().describe(IDENTITY_GROUPS.REMOVE_IDENTITY.id),
        identityId: z.string().trim().describe(IDENTITY_GROUPS.REMOVE_IDENTITY.identityId)
      }),
      response: {
        200: z.object({
          identityGroup: IdentityGroupsSchema
        })
      }
    },
    handler: async (req) => {
      const { identityGroup } = await server.services.identityGroup.removeIdentityFromGroup({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.id,
        identityId: req.params.identityId
      });

      return { identityGroup };
    }
  });
};
