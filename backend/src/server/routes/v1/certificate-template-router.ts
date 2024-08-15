import { z } from "zod";

import { CertificateTemplatesSchema } from "@app/db/schemas/certificate-templates";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const sanitizedCertificateTemplate = CertificateTemplatesSchema.pick({
  id: true,
  caId: true,
  name: true,
  commonName: true,
  ttl: true
});

export const registerCertificateTemplateRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:certificateTemplateId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        certificateTemplateId: z.string()
      }),
      response: {
        200: z.object({
          certificateTemplate: sanitizedCertificateTemplate.merge(
            z.object({
              projectId: z.string(),
              caName: z.string()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplate.getCertTemplate({
        id: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { certificateTemplate };
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
        caId: z.string(),
        name: z.string(),
        commonName: z.string(),
        ttl: z.string()
      }),
      response: {
        200: z.object({
          certificateTemplate: sanitizedCertificateTemplate
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplate.createCertTemplate({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return { certificateTemplate };
    }
  });

  server.route({
    method: "PATCH",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({}),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {}
  });

  server.route({
    method: "DELETE",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({}),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {}
  });
};
