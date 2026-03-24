import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  CreateHpIloRotationSchema,
  HpIloRotationGeneratedCredentialsSchema,
  HpIloRotationSchema,
  THpIloRotation,
  UpdateHpIloRotationSchema
} from "@app/ee/services/secret-rotation-v2/hp-ilo-rotation";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { ApiDocsTags, SecretRotations } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerSecretRotationEndpoints } from "./secret-rotation-v2-endpoints";

export const registerHpIloRotationRouter = async (server: FastifyZodProvider) => {
  registerSecretRotationEndpoints({
    type: SecretRotation.HpIloLocalAccount,
    server,
    responseSchema: HpIloRotationSchema,
    createSchema: CreateHpIloRotationSchema,
    updateSchema: UpdateHpIloRotationSchema,
    generatedCredentialsSchema: HpIloRotationGeneratedCredentialsSchema
  });

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
        "Reconcile HP iLO Local Account rotation credentials. This operation uses the SSH app connection credentials to reset the password when credentials are out of sync.",
      params: z.object({
        rotationId: z.string().uuid().describe(SecretRotations.RECONCILE.rotationId)
      }),
      response: {
        200: z.object({
          message: z.string(),
          reconciled: z.boolean(),
          secretRotation: HpIloRotationSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { rotationId } = req.params;

      const result = await server.services.secretRotationV2.reconcileLocalAccountRotation(
        { rotationId, type: SecretRotation.HpIloLocalAccount },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.secretRotation.projectId,
        event: {
          type: EventType.RECONCILE_SECRET_ROTATION,
          metadata: {
            type: SecretRotation.HpIloLocalAccount,
            rotationId,
            reconciled: result.reconciled
          }
        }
      });

      return {
        message: result.message,
        reconciled: result.reconciled,
        secretRotation: result.secretRotation as THpIloRotation
      };
    }
  });
};
