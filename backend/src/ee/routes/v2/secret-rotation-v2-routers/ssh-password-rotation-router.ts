import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  CreateSshPasswordRotationSchema,
  SshPasswordRotationGeneratedCredentialsSchema,
  SshPasswordRotationSchema,
  TSshPasswordRotation,
  UpdateSshPasswordRotationSchema
} from "@app/ee/services/secret-rotation-v2/ssh-password";
import { ApiDocsTags, SecretRotations } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerSshPasswordRotationRouter = async (server: FastifyZodProvider) => {
  // Register standard CRUD endpoints
  registerSecretRotationEndpoints({
    type: SecretRotation.SshPassword,
    server,
    responseSchema: SshPasswordRotationSchema,
    createSchema: CreateSshPasswordRotationSchema,
    updateSchema: UpdateSshPasswordRotationSchema,
    generatedCredentialsSchema: SshPasswordRotationGeneratedCredentialsSchema
  });

  // Add reconcile endpoint for SSH password rotation
  server.route({
    method: "POST",
    url: "/:rotationId/reconcile",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SecretRotations],
      description:
        "Reconcile SSH password rotation credentials. This operation uses the SSH app connection credentials to reset the password when credentials are out of sync.",
      params: z.object({
        rotationId: z.string().uuid().describe(SecretRotations.RECONCILE.rotationId)
      }),
      response: {
        200: z.object({
          message: z.string(),
          reconciled: z.boolean(),
          secretRotation: SshPasswordRotationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationId } = req.params;

      const result = await server.services.secretRotationV2.reconcileSshPasswordRotation(
        { rotationId },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.secretRotation.projectId,
        event: {
          type: EventType.RECONCILE_SECRET_ROTATION,
          metadata: {
            type: SecretRotation.SshPassword,
            rotationId,
            reconciled: result.reconciled
          }
        }
      });

      return {
        message: result.message,
        reconciled: result.reconciled,
        secretRotation: result.secretRotation as TSshPasswordRotation
      };
    }
  });
};
