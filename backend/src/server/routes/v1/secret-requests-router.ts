import { z } from "zod";

import { SecretSharingSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretSharingAccessType } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SecretSharingType } from "@app/services/secret-sharing/secret-sharing-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerSecretRequestsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          secretRequest: SecretSharingSchema.omit({
            encryptedSecret: true,
            tag: true,
            iv: true,
            encryptedValue: true
          }).extend({
            isSecretValueSet: z.boolean(),
            requester: z.object({
              organizationName: z.string(),
              firstName: z.string().nullish(),
              lastName: z.string().nullish(),
              username: z.string()
            })
          })
        })
      }
    },
    handler: async (req) => {
      const secretRequest = await req.server.services.secretSharing.getSecretRequestById({
        id: req.params.id,
        actorOrgId: req.permission?.orgId,
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorAuthMethod: req.permission?.authMethod
      });

      return { secretRequest };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/set-value",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        secretValue: z.string()
      }),
      response: {
        200: z.object({
          secretRequest: SecretSharingSchema.omit({
            encryptedSecret: true,
            tag: true,
            iv: true,
            encryptedValue: true
          })
        })
      }
    },
    handler: async (req) => {
      const secretRequest = await req.server.services.secretSharing.setSecretRequestValue({
        id: req.params.id,
        actorOrgId: req.permission?.orgId,
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorAuthMethod: req.permission?.authMethod,
        secretValue: req.body.secretValue
      });

      return { secretRequest };
    }
  });

  server.route({
    method: "POST",
    url: "/:id/reveal-value",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          secretRequest: SecretSharingSchema.omit({
            encryptedSecret: true,
            tag: true,
            iv: true,
            encryptedValue: true
          }).extend({
            secretValue: z.string()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretRequest = await req.server.services.secretSharing.revealSecretRequestValue({
        id: req.params.id,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod
      });

      return { secretRequest };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          secretRequest: SecretSharingSchema.omit({
            encryptedSecret: true,
            tag: true,
            iv: true,
            encryptedValue: true
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretRequest = await req.server.services.secretSharing.deleteSharedSecretById({
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        sharedSecretId: req.params.id,
        orgId: req.permission.orgId,
        actor: req.permission.type,
        type: SecretSharingType.Request
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretRequestDeleted,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          secretRequestId: req.params.id,
          organizationId: req.permission.orgId,
          ...req.auditLogInfo
        }
      });
      return { secretRequest };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0),
        limit: z.coerce.number().min(1).max(100).default(25)
      }),
      response: {
        200: z.object({
          secrets: z.array(SecretSharingSchema),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secrets, totalCount } = await req.server.services.secretSharing.getSharedSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        type: SecretSharingType.Request,
        ...req.query
      });

      return {
        secrets,
        totalCount
      };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        name: z.string().max(50).optional(),
        expiresAt: z.string(),
        accessType: z.nativeEnum(SecretSharingAccessType).default(SecretSharingAccessType.Organization)
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const shareRequest = await req.server.services.secretSharing.createSecretRequest({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_SECRET_REQUEST,
          metadata: {
            accessType: req.body.accessType,
            name: req.body.name,
            id: shareRequest.id
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretRequestCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          secretRequestId: shareRequest.id,
          organizationId: req.permission.orgId,
          secretRequestName: req.body.name,
          ...req.auditLogInfo
        }
      });

      return { id: shareRequest.id };
    }
  });
};
