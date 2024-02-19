import { z } from "zod";

import { SecretSnapshotsSchema, SecretTagsSchema, SecretVersionsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSnapshotRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:secretSnapshotId",
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
            secretVersions: SecretVersionsSchema.omit({ secretBlindIndex: true })
              .merge(
                z.object({
                  tags: SecretTagsSchema.pick({
                    id: true,
                    slug: true,
                    name: true,
                    color: true
                  }).array()
                })
              )
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
        actorOrgId: req.permission.orgId,
        id: req.params.secretSnapshotId
      });
      return { secretSnapshot };
    }
  });

  server.route({
    method: "POST",
    url: "/:secretSnapshotId/rollback",
    schema: {
      description: "Roll back project secrets to those captured in a secret snapshot version.",
      security: [
        {
          apiKeyAuth: [],
          bearerAuth: []
        }
      ],
      params: z.object({
        secretSnapshotId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretSnapshot: SecretSnapshotsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretSnapshot = await server.services.snapshot.rollbackSnapshot({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        id: req.params.secretSnapshotId
      });
      return { secretSnapshot };
    }
  });
};
