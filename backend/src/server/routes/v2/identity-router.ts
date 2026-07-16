import { z } from "zod";

import { IdentitiesSchema } from "@app/db/schemas";
import { ApiDocsTags, IDENTITIES_V2 } from "@app/lib/api-docs";
import { buildSearchZodSchema, SearchResourceOperators } from "@app/lib/search-resource/search";
import { OrderByDirection } from "@app/lib/types";
import { CharacterType, zodValidateCharacters } from "@app/lib/validator/validate-string";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { OrgIdentitySearchOrderBy, SearchIdentitiesScope } from "@app/services/identity-v2/identity-types";

const searchResourceZodValidate = zodValidateCharacters([
  CharacterType.AlphaNumeric,
  CharacterType.Spaces,
  CharacterType.Underscore,
  CharacterType.Hyphen,
  CharacterType.ForwardSlash
]);

const roleSchema = z.object({
  id: z.string(),
  role: z.string(),
  customRoleId: z.string().nullable().optional(),
  customRoleName: z.string().nullable().optional(),
  customRoleSlug: z.string().nullable().optional(),
  customRoleDescription: z.string().nullable().optional(),
  isTemporary: z.boolean(),
  temporaryMode: z.string().nullable().optional(),
  temporaryRange: z.string().nullable().optional(),
  temporaryAccessStartTime: z.date().nullable().optional(),
  temporaryAccessEndTime: z.date().nullable().optional()
});

const identityMembershipResponseSchema = z.object({
  id: z.string(),
  identityId: z.string(),
  scope: z.nativeEnum(SearchIdentitiesScope),
  orgId: z.string(),
  projectId: z.string().nullable().optional(),
  project: z
    .object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      type: z.string()
    })
    .nullable()
    .optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAuthMethod: z.string().nullable().optional(),
  lastLoginTime: z.date().nullable().optional(),
  roles: z.array(roleSchema),
  identity: IdentitiesSchema.pick({ name: true, id: true, hasDeleteProtection: true, orgId: true }).extend({
    authMethods: z.array(z.string()),
    activeLockoutAuthMethods: z.array(z.string())
  })
});

export const registerIdentityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/search",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "searchMachineIdentitiesV2",
      tags: [ApiDocsTags.Identities],
      description:
        "Search machine identities across organization and/or project scopes. Returns identities the caller has access to, each annotated with all roles assigned to that membership.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        scope: z
          .array(z.nativeEnum(SearchIdentitiesScope))
          .min(1)
          .default([SearchIdentitiesScope.OrganizationScope])
          .describe(IDENTITIES_V2.SEARCH.scope)
          .optional(),
        orderBy: z
          .nativeEnum(OrgIdentitySearchOrderBy)
          .default(OrgIdentitySearchOrderBy.Name)
          .describe(IDENTITIES_V2.SEARCH.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(IDENTITIES_V2.SEARCH.orderDirection)
          .optional(),
        limit: z.number().int().min(1).max(100).default(50).describe(IDENTITIES_V2.SEARCH.limit),
        offset: z.number().int().min(0).default(0).describe(IDENTITIES_V2.SEARCH.offset),
        search: buildSearchZodSchema(
          z
            .object({
              name: z
                .union([
                  searchResourceZodValidate(z.string().max(255), "Name"),
                  z
                    .object({
                      [SearchResourceOperators.$eq]: searchResourceZodValidate(z.string().max(255), "Name $eq"),
                      [SearchResourceOperators.$contains]: searchResourceZodValidate(
                        z.string().max(255),
                        "Name $contains"
                      ),
                      [SearchResourceOperators.$in]: searchResourceZodValidate(z.string().max(255), "Name $in").array()
                    })
                    .partial()
                ])
                .describe(IDENTITIES_V2.SEARCH.search.name),
              role: z
                .union([
                  searchResourceZodValidate(z.string().max(255), "Role"),
                  z
                    .object({
                      [SearchResourceOperators.$eq]: searchResourceZodValidate(z.string().max(255), "Role $eq"),
                      [SearchResourceOperators.$contains]: searchResourceZodValidate(
                        z.string().max(255),
                        "Role $contains"
                      ),
                      [SearchResourceOperators.$in]: searchResourceZodValidate(z.string().max(255), "Role $in").array()
                    })
                    .partial()
                ])
                .describe(IDENTITIES_V2.SEARCH.search.role)
            })
            .describe(IDENTITIES_V2.SEARCH.search.desc)
            .partial()
        )
      }),
      response: {
        200: z.object({
          identities: identityMembershipResponseSchema.array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => {
      const { identityMemberships, totalCount } = await server.services.identityV2.searchOrgIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        searchFilter: req.body.search,
        scope: req.body.scope ?? [SearchIdentitiesScope.OrganizationScope],
        limit: req.body.limit,
        offset: req.body.offset,
        orderBy: req.body.orderBy,
        orderDirection: req.body.orderDirection
      });

      return { identities: identityMemberships, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/search/count",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "countMachineIdentitiesV2",
      tags: [ApiDocsTags.Identities],
      description:
        "Return per-scope counts of machine identities matching the given search filter. The response contains a count for every scope passed in the request body (zero when the caller has no access to that scope).",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        scope: z
          .array(z.nativeEnum(SearchIdentitiesScope))
          .min(1)
          .default([SearchIdentitiesScope.OrganizationScope, SearchIdentitiesScope.ProjectScope])
          .describe(IDENTITIES_V2.SEARCH_COUNT.scope),
        search: buildSearchZodSchema(
          z
            .object({
              name: z
                .union([
                  searchResourceZodValidate(z.string().max(255), "Name"),
                  z
                    .object({
                      [SearchResourceOperators.$eq]: searchResourceZodValidate(z.string().max(255), "Name $eq"),
                      [SearchResourceOperators.$contains]: searchResourceZodValidate(
                        z.string().max(255),
                        "Name $contains"
                      ),
                      [SearchResourceOperators.$in]: searchResourceZodValidate(z.string().max(255), "Name $in").array()
                    })
                    .partial()
                ])
                .describe(IDENTITIES_V2.SEARCH_COUNT.search.name),
              role: z
                .union([
                  searchResourceZodValidate(z.string().max(255), "Role"),
                  z
                    .object({
                      [SearchResourceOperators.$eq]: searchResourceZodValidate(z.string().max(255), "Role $eq"),
                      [SearchResourceOperators.$contains]: searchResourceZodValidate(
                        z.string().max(255),
                        "Role $contains"
                      ),
                      [SearchResourceOperators.$in]: searchResourceZodValidate(z.string().max(255), "Role $in").array()
                    })
                    .partial()
                ])
                .describe(IDENTITIES_V2.SEARCH_COUNT.search.role)
            })
            .describe(IDENTITIES_V2.SEARCH_COUNT.search.desc)
            .partial()
        )
      }),
      response: {
        200: z.object({
          counts: z.object({
            organization: z.number().optional(),
            project: z.number().optional()
          })
        })
      }
    },
    handler: async (req) => {
      const counts = await server.services.identityV2.countOrgIdentities({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        searchFilter: req.body.search,
        scope: req.body.scope
      });

      return { counts };
    }
  });
};
