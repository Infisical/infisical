import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  CreateUnixLinuxLocalAccountRotationSchema,
  UnixLinuxLocalAccountRotationGeneratedCredentialsSchema,
  UnixLinuxLocalAccountRotationSchema,
  TUnixLinuxLocalAccountRotation,
  UpdateUnixLinuxLocalAccountRotationSchema
} from "@app/ee/services/secret-rotation-v2/unix-linux-local-account-rotation";
import { ApiDocsTags, SecretRotations } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerUnixLinuxLocalAccountRotationRouter = async (server: FastifyZodProvider) => {
  // Register standard CRUD endpoints
  registerSecretRotationEndpoints({
    type: SecretRotation.UnixLinuxLocalAccount,
    server,
    responseSchema: UnixLinuxLocalAccountRotationSchema,
    createSchema: CreateUnixLinuxLocalAccountRotationSchema,
    updateSchema: UpdateUnixLinuxLocalAccountRotationSchema,
    generatedCredentialsSchema: UnixLinuxLocalAccountRotationGeneratedCredentialsSchema
  });

  // Add reconcile endpoint for Unix/Linux Local Account rotation
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
        "Reconcile Unix/Linux Local Account rotation credentials. This operation uses the SSH app connection credentials to reset the password when credentials are out of sync.",
      params: z.object({
        rotationId: z.string().uuid().describe(SecretRotations.RECONCILE.rotationId)
      }),
      response: {
        200: z.object({
          message: z.string(),
          reconciled: z.boolean(),
          secretRotation: UnixLinuxLocalAccountRotationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationId } = req.params;

      const result = await server.services.secretRotationV2.reconcileUnixLinuxLocalAccountRotation(
        { rotationId },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.secretRotation.projectId,
        event: {
          type: EventType.RECONCILE_SECRET_ROTATION,
          metadata: {
            type: SecretRotation.UnixLinuxLocalAccount,
            rotationId,
            reconciled: result.reconciled
          }
        }
      });

      return {
        message: result.message,
        reconciled: result.reconciled,
        secretRotation: result.secretRotation as TUnixLinuxLocalAccountRotation
      };
    }
  });
};
