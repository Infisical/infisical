import { z } from "zod";

import { EmailDomainsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerEmailDomainRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        domain: z.string().trim().toLowerCase().min(1).describe("The domain to verify (e.g., company.com)")
      }),
      response: {
        200: z.object({
          emailDomain: EmailDomainsSchema
        })
      }
    },
    handler: async (req) => {
      const emailDomain = await server.services.emailDomain.createEmailDomain({
        domain: req.body.domain,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
      });

      return { emailDomain };
    }
  });

  server.route({
    method: "POST",
    url: "/:emailDomainId/verify",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        emailDomainId: z.string().uuid().describe("The ID of the email domain to verify")
      }),
      response: {
        200: z.object({
          emailDomain: EmailDomainsSchema
          // existingSubdomains: z.array(
          //   EmailDomainsSchema.pick({
          //     id: true,
          //     domain: true,
          //     orgId: true
          //   })
          // ),
          // existingParentDomains: z.array(
          //   EmailDomainsSchema.pick({
          //     id: true,
          //     domain: true,
          //     orgId: true
          //   })
          // )
        })
      }
    },
    handler: async (req) => {
      const result = await server.services.emailDomain.verifyEmailDomain({
        emailDomainId: req.params.emailDomainId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      response: {
        200: z.object({
          emailDomains: z.array(EmailDomainsSchema)
        })
      }
    },
    handler: async (req) => {
      const emailDomains = await server.services.emailDomain.listEmailDomains({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
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
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        emailDomainId: z.string().uuid().describe("The ID of the email domain to delete")
      }),
      response: {
        200: z.object({
          emailDomain: EmailDomainsSchema
        })
      }
    },
    handler: async (req) => {
      const emailDomain = await server.services.emailDomain.deleteEmailDomain({
        emailDomainId: req.params.emailDomainId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
      });

      return { emailDomain };
    }
  });
};
