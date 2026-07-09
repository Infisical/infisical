import { z } from "zod";

import { ProxiedServiceCredentialsSchema, ProxiedServicesSchema } from "@app/db/schemas";
import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "@app/ee/services/proxied-service/proxied-service-enums";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const CredentialInputSchema = z
  .object({
    secretKey: z.string().trim().min(1),
    role: z.nativeEnum(ProxiedServiceCredentialRole),
    headerName: z.string().trim().min(1).optional(),
    headerPrefix: z.string().trim().optional(),
    headerPurpose: z.nativeEnum(ProxiedServiceHeaderPurpose).optional(),
    placeholderKey: z.string().trim().min(1).optional(),
    placeholderValue: z.string().trim().min(1).optional(),
    substitutionSurfaces: z.array(z.nativeEnum(ProxiedServiceSubstitutionSurface)).nonempty().optional()
  })
  .superRefine((cred, ctx) => {
    if (cred.role === ProxiedServiceCredentialRole.HeaderRewrite) {
      // either a named header (optionally with a prefix) or a basic-auth purpose, not both
      if (cred.headerPurpose) {
        if (cred.headerName || cred.headerPrefix) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "headerPurpose cannot be combined with headerName or headerPrefix"
          });
        }
      } else if (!cred.headerName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Header rewriting requires either headerName or headerPurpose"
        });
      }
    } else if (!cred.placeholderKey || !cred.placeholderValue || !cred.substitutionSurfaces) {
      // credential substitution
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Credential substitution requires placeholderKey, placeholderValue, and substitutionSurfaces"
      });
    }
  });

const SanitizedCredentialSchema = ProxiedServiceCredentialsSchema.pick({
  id: true,
  serviceId: true,
  secretKey: true,
  role: true,
  headerName: true,
  headerPrefix: true,
  headerPurpose: true,
  placeholderKey: true,
  placeholderValue: true,
  substitutionSurfaces: true
});

const SanitizedServiceSchema = ProxiedServicesSchema.pick({
  id: true,
  name: true,
  hostPattern: true,
  isEnabled: true,
  folderId: true,
  createdAt: true,
  updatedAt: true
});

const ServiceWithCredentialsSchema = SanitizedServiceSchema.extend({
  credentials: SanitizedCredentialSchema.array()
});

const ScopeQuerySchema = z.object({
  projectId: z.string().trim().min(1),
  environment: z.string().trim().min(1),
  secretPath: z.string().trim().default("/")
});

export const registerProxiedServiceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      body: z.object({
        projectId: z.string().trim().min(1),
        environment: z.string().trim().min(1),
        secretPath: z.string().trim().default("/"),
        name: slugSchema({ field: "name" }),
        hostPattern: z.string().trim().min(1),
        isEnabled: z.boolean().optional(),
        credentials: CredentialInputSchema.array()
      }),
      response: {
        200: z.object({ service: ServiceWithCredentialsSchema })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.create(req.body, req.permission);
      return { service };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      querystring: ScopeQuerySchema,
      response: {
        200: z.object({
          services: ServiceWithCredentialsSchema.extend({ canProxy: z.boolean() }).array()
        })
      }
    },
    handler: async (req) => {
      return server.services.proxiedService.list(req.query, req.permission);
    }
  });

  // Distinguishes slug vs id by the presence of scope query params (projectId + environment).
  server.route({
    method: "GET",
    url: "/:serviceIdOrName",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      params: z.object({ serviceIdOrName: z.string().trim().min(1) }),
      querystring: ScopeQuerySchema.partial(),
      response: {
        200: z.object({
          service: ServiceWithCredentialsSchema.extend({ canProxy: z.boolean() })
        })
      }
    },
    handler: async (req) => {
      const { serviceIdOrName } = req.params;
      const { projectId, environment, secretPath } = req.query;
      if (projectId && environment) {
        const service = await server.services.proxiedService.getByName(
          { projectId, environment, secretPath: secretPath ?? "/", name: serviceIdOrName },
          req.permission
        );
        return { service };
      }
      const service = await server.services.proxiedService.getById({ serviceId: serviceIdOrName }, req.permission);
      return { service };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:serviceId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      params: z.object({ serviceId: z.string().uuid() }),
      body: z.object({
        name: slugSchema({ field: "name" }).optional(),
        hostPattern: z.string().trim().min(1).optional(),
        isEnabled: z.boolean().optional(),
        credentials: CredentialInputSchema.array().optional()
      }),
      response: {
        200: z.object({ service: ServiceWithCredentialsSchema })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.updateById(
        { serviceId: req.params.serviceId, ...req.body },
        req.permission
      );
      return { service };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:serviceId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      params: z.object({ serviceId: z.string().uuid() }),
      response: {
        200: z.object({ service: SanitizedServiceSchema })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.deleteById(
        { serviceId: req.params.serviceId },
        req.permission
      );
      return { service };
    }
  });
};
