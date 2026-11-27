import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { EmailDomainResponseSchema } from "@app/ee/services/email-domain/email-domain-fns";
import { ApiDocsTags, EMAIL_DOMAINS } from "@app/lib/api-docs";
import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerEmailDomainRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "createEmailDomain",
      tags: [ApiDocsTags.EmailDomains],
      description: "Create email domain",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        domain: z.string().trim().toLowerCase().min(1).max(255).describe(EMAIL_DOMAINS.CREATE.domain)
      }),
      response: {
        200: z.object({
          emailDomain: EmailDomainResponseSchema
        })
      }
    },
    handler: async (req) => {
      const emailDomain = await server.services.emailDomain.createEmailDomain({
        domain: req.body.domain,
        actor: req.actor,
        orgId: req.actor.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.actor.orgId,
        event: {
          type: EventType.CREATE_EMAIL_DOMAIN,
          metadata: {
            emailDomainId: emailDomain.id,
            domain: emailDomain.domain
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.EmailDomainCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.actor.orgId,
          properties: { emailDomainId: emailDomain.id, domain: emailDomain.domain }
        })
        .catch(() => {});

      return { emailDomain };
    }
  });

  server.route({
    method: "POST",
    url: "/:emailDomainId/verify",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "verifyEmailDomain",
      tags: [ApiDocsTags.EmailDomains],
      description: "Verify email domain",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        emailDomainId: z.string().uuid().describe(EMAIL_DOMAINS.VERIFY.emailDomainId)
      }),
      response: {
        200: z.object({
          emailDomain: EmailDomainResponseSchema
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.emailDomain.verifyEmailDomain({
        emailDomainId: req.params.emailDomainId,
        actor: req.actor,
        orgId: req.actor.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.actor.orgId,
        event: {
          type: EventType.VERIFY_EMAIL_DOMAIN,
          metadata: {
            emailDomainId: result.emailDomain.id,
            domain: result.emailDomain.domain
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.EmailDomainVerified,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.actor.orgId,
          properties: {
            emailDomainId: result.emailDomain.id,
            domain: result.emailDomain.domain
          }
        })
        .catch(() => {});

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      hide: false,
      operationId: "listEmailDomains",
      tags: [ApiDocsTags.EmailDomains],
      description: "List email domains",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
          emailDomains: z.array(EmailDomainResponseSchema)
        })
      }
    },
    handler: async (req) => {
      const emailDomains = await server.services.emailDomain.listEmailDomains({
        actor: req.actor,
        orgId: req.actor.orgId
      });

      return { emailDomains };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:emailDomainId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteEmailDomain",
      tags: [ApiDocsTags.EmailDomains],
      description: "Delete email domain",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        emailDomainId: z.string().uuid().describe(EMAIL_DOMAINS.DELETE.emailDomainId)
      }),
      response: {
        200: z.object({
          emailDomain: EmailDomainResponseSchema
        })
      }
    },
    handler: async (req) => {
      const emailDomain = await server.services.emailDomain.deleteEmailDomain({
        emailDomainId: req.params.emailDomainId,
        actor: req.actor,
        orgId: req.actor.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.actor.orgId,
        event: {
          type: EventType.DELETE_EMAIL_DOMAIN,
          metadata: {
            emailDomainId: emailDomain.id,
            domain: emailDomain.domain
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.EmailDomainDeleted,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.actor.orgId,
          properties: {
            emailDomainId: emailDomain.id,
            domain: emailDomain.domain
          }
        })
        .catch(() => {});

      return { emailDomain };
    }
  });
};
