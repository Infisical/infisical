import ms from "ms";
import { z } from "zod";

import { CertificateTemplatesSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { validateTemplateRegexField } from "@app/services/certificate-template/certificate-template-validators";

const sanitizedCertificateTemplate = CertificateTemplatesSchema.pick({
  id: true,
  caId: true,
  name: true,
  commonName: true,
  subjectAlternativeName: true,
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
        name: z.string().min(1),
        commonName: validateTemplateRegexField,
        subjectAlternativeName: validateTemplateRegexField,
        ttl: z.string().refine((val) => ms(val) > 0, "TTL must be a positive number")
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
    url: "/:certificateTemplateId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        caId: z.string().optional(),
        name: z.string().min(1).optional(),
        commonName: validateTemplateRegexField.optional(),
        subjectAlternativeName: validateTemplateRegexField.optional(),
        ttl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
      }),
      params: z.object({
        certificateTemplateId: z.string()
      }),
      response: {
        200: z.object({
          certificateTemplate: sanitizedCertificateTemplate
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplate.updateCertTemplate({
        ...req.body,
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
    method: "DELETE",
    url: "/:certificateTemplateId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        certificateTemplateId: z.string()
      }),
      response: {
        200: z.object({
          certificateTemplate: sanitizedCertificateTemplate
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const certificateTemplate = await server.services.certificateTemplate.deleteCertTemplate({
        id: req.params.certificateTemplateId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { certificateTemplate };
    }
  });
};
