import { z } from "zod";

import { IdentitiesSchema, IdentityOrgMembershipsSchema } from "@app/db/schemas";
import { ApiDocsTags, IDENTITIES } from "@app/lib/api-docs";
import { buildSearchZodSchema, SearchResourceOperators } from "@app/lib/search-resource/search";
import { OrderByDirection } from "@app/lib/types";
import { CharacterType, zodValidateCharacters } from "@app/lib/validator/validate-string";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { IdentityScope, OrgIdentityOrderBy } from "@app/services/identity/identity-types";

const searchResourceZodValidate = zodValidateCharacters([
  CharacterType.AlphaNumeric,
  CharacterType.Spaces,
  CharacterType.Underscore,
  CharacterType.Hyphen,
  CharacterType.ForwardSlash
]);

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
        'Search machine identities (admin-aware). Pass scopes=["organization","project"] (project scope is admin only) to filter by identity scope. Including the "project" scope returns project-scoped identities with their project info, effective roles, and per-scope counts.',
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        orderBy: z
          .nativeEnum(OrgIdentityOrderBy)
          .default(OrgIdentityOrderBy.Name)
          .describe(IDENTITIES.SEARCH.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(IDENTITIES.SEARCH.orderDirection)
          .optional(),
        limit: z.number().max(100).default(50).describe(IDENTITIES.SEARCH.limit),
        offset: z.number().default(0).describe(IDENTITIES.SEARCH.offset),
        scopes: z.array(z.nativeEnum(IdentityScope)).nonempty().optional(),
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
                .describe(IDENTITIES.SEARCH.search.name),
              role: z
                .union([
                  searchResourceZodValidate(z.string().max(255), "Role"),
                  z
                    .object({
                      [SearchResourceOperators.$eq]: searchResourceZodValidate(z.string().max(255), "Role $eq"),
                      [SearchResourceOperators.$in]: searchResourceZodValidate(z.string().max(255), "Role $in").array()
                    })
                    .partial()
                ])
                .describe(IDENTITIES.SEARCH.search.role)
            })
            .describe(IDENTITIES.SEARCH.search.desc)
            .partial()
        )
      }),
      response: {
        200: z.object({
          identities: IdentityOrgMembershipsSchema.omit({ role: true, roleId: true })
            .extend({
              project: z
                .object({
                  id: z.string(),
                  name: z.string(),
                  type: z.string()
                })
                .nullable()
                .optional(),
              roles: z.array(
                z.object({
                  id: z.string(),
                  role: z.string(),
                  customRoleSlug: z.string().nullable().optional(),
                  isTemporary: z.boolean(),
                  temporaryMode: z.string().nullable().optional(),
                  temporaryRange: z.string().nullable().optional(),
                  temporaryAccessStartTime: z.date().nullable().optional(),
                  temporaryAccessEndTime: z.date().nullable().optional()
                })
              ),
              identity: IdentitiesSchema.pick({
                name: true,
                id: true,
                hasDeleteProtection: true,
                orgId: true,
                projectId: true
              }).extend({
                authMethods: z.array(z.string())
              })
            })
            .array(),
          totalCount: z.number(),
          orgCount: z.number().optional(),
          projectCount: z.number().optional()
        })
      }
    },
    handler: async (req) => {
      const { identityMemberships, totalCount, orgCount, projectCount } =
        await server.services.identityV1.searchOrgIdentitiesAdminView({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          searchFilter: req.body.search,
          orgId: req.permission.orgId,
          limit: req.body.limit,
          offset: req.body.offset,
          orderBy: req.body.orderBy,
          orderDirection: req.body.orderDirection,
          scopes: req.body.scopes
        });

      return { identities: identityMemberships, totalCount, orgCount, projectCount };
    }
  });
};
