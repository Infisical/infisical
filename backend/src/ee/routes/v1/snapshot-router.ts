import { z } from "zod";

import { SecretSnapshotsSchema } from "@app/db/schemas/secret-snapshots";
import { ApiDocsTags, PROJECTS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedTagSchema, secretRawSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSnapshotRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:secretSnapshotId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        secretSnapshotId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretSnapshot: z.object({
            id: z.string().uuid(),
            projectId: z.string(),
            environment: z.object({
              id: z.string().uuid(),
              slug: z.string(),
              name: z.string()
            }),
            secretVersions: secretRawSchema
              .omit({ _id: true, environment: true, workspace: true, type: true })
              .extend({
                secretValueHidden: z.boolean(),
                secretId: z.string(),
                tags: SanitizedTagSchema.array(),
                isRotatedSecret: z.boolean().optional()
              })
              .array(),
            folderVersion: z.object({ id: z.string(), name: z.string() }).array(),
            createdAt: z.date(),
            updatedAt: z.date()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretSnapshot = await server.services.snapshot.getSnapshotData({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.secretSnapshotId
      });

      return { secretSnapshot };
    }
  });

  server.route({
    method: "POST",
    url: "/:secretSnapshotId/rollback",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      deprecated: true,
      tags: [ApiDocsTags.Projects],
      description: "(Deprecated) Roll back project secrets to those captured in a secret snapshot version.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretSnapshotId: z.string().trim().describe(PROJECTS.ROLLBACK_TO_SNAPSHOT.secretSnapshotId)
      }),
      response: {
        200: z.object({
          secretSnapshot: SecretSnapshotsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      throw new Error(
        "This endpoint is deprecated. Please use the new PIT recovery system. More information is available at: https://infisical.com/docs/documentation/platform/pit-recovery."
      );

      const secretSnapshot = await server.services.snapshot.rollbackSnapshot({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.secretSnapshotId
      });
      return { secretSnapshot };
    }
  });
};
