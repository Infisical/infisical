import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags } from "@app/lib/api-docs";
import { SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { SignerIdParamsSchema } from "./schemas";

export const registerSignerSigningRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:signerId/sign",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "signData",
      tags: [ApiDocsTags.PkiSigners],
      description: "Sign a pre-hashed digest with a code signing signer",
      params: SignerIdParamsSchema,
      body: z.object({
        data: z.string().min(1).max(172), // 128 bytes max in base64 = ceil(128/3)*4 = 172 chars
        signingAlgorithm: z.nativeEnum(SigningAlgorithm),
        isDigest: z.boolean().default(false),
        clientMetadata: z
          .object({
            tool: z.string().max(128).optional(),
            hostname: z.string().max(256).optional(),
            reportedIp: z.string().max(64).optional()
          })
          .optional()
      }),
      response: {
        200: z.object({
          signature: z.string(),
          signingAlgorithm: z.string(),
          signerId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      let actorName: string | undefined;
      if (req.auth.authMode === AuthMode.JWT) {
        actorName = `${req.auth.user.firstName ?? ""} ${req.auth.user.lastName ?? ""}`.trim() || undefined;
      } else if (req.auth.authMode === AuthMode.IDENTITY_ACCESS_TOKEN) {
        actorName = req.auth.identityName ?? undefined;
      }

      const result = await server.services.pkiSigner.sign({
        signerId: req.params.signerId,
        ...req.body,
        actorName,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.PKI_SIGNER_SIGN,
          metadata: {
            signerId: req.params.signerId,
            name: result.signerName,
            signingAlgorithm: req.body.signingAlgorithm
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.CodeSigningOperation,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          orgId: req.permission.orgId,
          signerId: req.params.signerId
        }
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/:signerId/public-key",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getSignerPublicKey",
      tags: [ApiDocsTags.PkiSigners],
      description: "Get the public key for a code signing signer",
      params: SignerIdParamsSchema,
      response: {
        200: z.object({
          publicKey: z.string(),
          algorithm: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const result = await server.services.pkiSigner.getPublicKey({
        signerId: req.params.signerId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: result.projectId,
        event: {
          type: EventType.GET_PKI_SIGNER_PUBLIC_KEY,
          metadata: {
            signerId: req.params.signerId,
            name: result.signerName
          }
        }
      });

      return result;
    }
  });
};
