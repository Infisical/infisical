import { z } from "zod";

import { SecretSnapshotsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProjectRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:workspaceId/secret-snapshots",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/"),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().default(20)
      }),
      response: {
        200: z.object({
          secretSnapshots: SecretSnapshotsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretSnapshots = await server.services.snapshot.listSnapshots({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.params.workspaceId,
        ...req.query
      });
      return { secretSnapshots };
    }
  });

  server.route({
    method: "GET",
    url: "/:workspaceId/secret-snapshots/count",
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/")
      }),
      response: {
        200: z.object({
          count: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const count = await server.services.snapshot.projectSecretSnapshotCount({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: req.params.workspaceId,
        environment: req.query.environment,
        path: req.query.path
      });
      return { count };
    }
  });
};
