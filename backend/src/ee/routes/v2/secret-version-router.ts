import { z } from "zod";

import { SecretVersionsV2Schema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretVersionRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "DELETE",
    url: "/:versionId/redact-value",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        versionId: z.string()
      }),
      response: {
        200: z.object({
          secretVersion: SecretVersionsV2Schema.omit({ encryptedValue: true, encryptedComment: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secretVersion, projectId, environment, secretPath, secretKey, secretId } =
        await server.services.secret.redactSecretVersionValue({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          versionId: req.params.versionId
        });

      await server.services.auditLog.createAuditLog({
        projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.REDACT_SECRET_VERSION_VALUE,
          metadata: {
            environment,
            secretPath,
            secretId,
            secretKey,
            secretVersionId: secretVersion.id,
            secretVersion: secretVersion.version
          }
        }
      });

      return { secretVersion };
    }
  });
};
