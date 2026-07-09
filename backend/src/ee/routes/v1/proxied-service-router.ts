import { z } from "zod";

import { ProxiedServiceCredentialsSchema, ProxiedServicesSchema } from "@app/db/schemas";
import {
  ProxiedServiceCredentialRole,
  ProxiedServiceHeaderPurpose,
  ProxiedServiceSubstitutionSurface
} from "@app/ee/services/proxied-service/proxied-service-enums";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// One host label: alphanumerics and internal hyphens, optionally a single leading "*." wildcard.
const HOST_LABELS_RE = /^(?:\*\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

// Validates the comma-separated hostPattern grammar so malformed values fail at creation
// instead of silently never matching at proxy time.
const hostPatternSchema = z
  .string()
  .trim()
  .min(1, "Host pattern is required")
  .max(255)
  .superRefine((raw, ctx) => {
    const segments = raw.split(",").map((s) => s.trim());
    segments.forEach((seg) => {
      if (seg === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Host pattern has an empty entry" });
        return;
      }
      if (seg.includes("://")) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" must not include a scheme (e.g. https://)` });
        return;
      }
      let hostPort = seg;
      const slashIdx = hostPort.indexOf("/");
      if (slashIdx !== -1) hostPort = hostPort.slice(0, slashIdx); // path portion is free-form
      let host = hostPort;
      const colonIdx = hostPort.lastIndexOf(":");
      if (colonIdx !== -1) {
        const portStr = hostPort.slice(colonIdx + 1);
        host = hostPort.slice(0, colonIdx);
        const port = Number(portStr);
        if (!/^\d+$/.test(portStr) || port < 1 || port > 65535) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" has an invalid port` });
          return;
        }
      }
      if (!HOST_LABELS_RE.test(host)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `"${seg}" is not a valid host pattern` });
      }
    });
  });

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

// Cross-credential rules that cannot be checked one row at a time: basic-auth pairing,
// unique header names / placeholders, and header-rewrite modes that cannot coexist.
const CredentialsArraySchema = CredentialInputSchema.array()
  .min(1, "At least one credential is required")
  .superRefine((credentials, ctx) => {
    const headerNameCounts = new Map<string, number>();
    const placeholderKeys = new Set<string>();
    const placeholderValues = new Set<string>();
    let usernameCount = 0;
    let passwordCount = 0;

    credentials.forEach((cred, i) => {
      if (cred.role === ProxiedServiceCredentialRole.HeaderRewrite) {
        if (cred.headerPurpose === ProxiedServiceHeaderPurpose.Username) usernameCount += 1;
        else if (cred.headerPurpose === ProxiedServiceHeaderPurpose.Password) passwordCount += 1;
        else if (cred.headerName) {
          const key = cred.headerName.toLowerCase();
          headerNameCounts.set(key, (headerNameCounts.get(key) ?? 0) + 1);
        }
      } else {
        if (cred.placeholderKey) {
          if (placeholderKeys.has(cred.placeholderKey)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Duplicate placeholder env var "${cred.placeholderKey}"`,
              path: [i, "placeholderKey"]
            });
          }
          placeholderKeys.add(cred.placeholderKey);
        }
        if (cred.placeholderValue) {
          if (placeholderValues.has(cred.placeholderValue)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Two credentials share the same placeholder value",
              path: [i, "placeholderValue"]
            });
          }
          placeholderValues.add(cred.placeholderValue);
        }
      }
    });

    headerNameCounts.forEach((count, name) => {
      if (count > 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Header "${name}" is set by more than one credential`
        });
      }
    });

    if (usernameCount > 1 || passwordCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Basic auth allows at most one username and one password credential"
      });
    }
    if (usernameCount !== passwordCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Basic auth requires both a username and a password credential"
      });
    }
    // Basic auth already owns the Authorization header, so it cannot coexist with named header rewrites.
    if (usernameCount + passwordCount > 0 && headerNameCounts.size > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Basic auth cannot be combined with other header-rewrite credentials on the same service"
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
        hostPattern: hostPatternSchema,
        isEnabled: z.boolean().optional(),
        credentials: CredentialsArraySchema
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
      // No scope params: this must be a lookup by ID. Reject a bare name so it never hits the uuid column.
      if (!z.string().uuid().safeParse(serviceIdOrName).success) {
        throw new BadRequestError({
          message: "projectId and environment query params are required when fetching a proxied service by name"
        });
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
        hostPattern: hostPatternSchema.optional(),
        isEnabled: z.boolean().optional(),
        credentials: CredentialsArraySchema.optional()
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
