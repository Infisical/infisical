import fastifyMultipart from "@fastify/multipart";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, SECRET_SHARING } from "@app/lib/api-docs";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { SecretSharingAccessType } from "@app/lib/types";
import {
  publicEndpointLimit,
  publicSecretShareCreationLimit,
  readLimit,
  writeLimit
} from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SecretSharingType } from "@app/services/secret-sharing/secret-sharing-types";

import { SanitizedSecretSharingSchema } from "../sanitizedSchemas";

const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/webp"
];
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB

export const registerSecretSharingRouter = async (server: FastifyZodProvider) => {
  // Allow multipart file uploads
  await server.register(fastifyMultipart, {
    limits: {
      fileSize: MAX_IMAGE_SIZE
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SecretSharing],
      description:
        "List all shared secrets created by the authenticated user or identity in their current organization.",
      operationId: "listSharedSecrets",
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0).describe(SECRET_SHARING.LIST.offset),
        limit: z.coerce.number().min(1).max(100).default(25).describe(SECRET_SHARING.LIST.limit)
      }),
      response: {
        200: z.object({
          secrets: z.array(SanitizedSecretSharingSchema),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { secrets, totalCount } = await req.server.services.secretSharing.getSharedSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        type: SecretSharingType.Share,
        ...req.query
      });

      return {
        secrets,
        totalCount
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:id",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SecretSharing],
      description:
        "Returns the full shared secret object without revealing the secret value. Authentication is required for shared secrets that are scoped to an organization.",
      operationId: "getSharedSecretById",
      params: z.object({
        id: z.string().describe(SECRET_SHARING.GET_BY_ID.id)
      }),
      response: {
        200: SanitizedSecretSharingSchema.extend({
          isPasswordProtected: z.boolean().describe("Whether the shared secret is protected by a password.")
        })
      }
    },
    handler: async (req) => {
      return req.server.services.secretSharing.getSharedSecretById(
        req.params.id,
        req.permission?.orgId,
        req.permission?.id
      );
    }
  });

  server.route({
    method: "POST",
    url: "/:id/access",
    config: {
      rateLimit: publicEndpointLimit
    },

    schema: {
      hide: false,
      tags: [ApiDocsTags.SecretSharing],
      description:
        "Access a shared secret by its ID. If the secret is password protected, you must provide the password in the request body. Returns the secret value if access is granted, or an error if access is denied. The endpoint requires authentication if the shared secret is scoped to an organization.",
      operationId: "accessSharedSecret",
      params: z.object({
        id: z.string().describe(SECRET_SHARING.ACCESS.id)
      }),
      body: z.object({
        password: z.string().optional().describe(SECRET_SHARING.ACCESS.password)
      }),
      response: {
        200: SanitizedSecretSharingSchema.extend({
          orgName: z.string().optional(),
          secretValue: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.accessSharedSecret({
        sharedSecretId: req.params.id,
        password: req.body.password,
        orgId: req.permission?.orgId,
        actorId: req.permission?.id
      });

      if (sharedSecret.orgId) {
        await server.services.auditLog.createAuditLog({
          orgId: sharedSecret.orgId,
          ...req.auditLogInfo,
          event: {
            type: EventType.READ_SHARED_SECRET,
            metadata: {
              id: req.params.id,
              name: sharedSecret.name || undefined,
              accessType: sharedSecret.accessType
            }
          }
        });
      }

      return sharedSecret;
    }
  });

  server.route({
    method: "POST",
    url: "/public",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: true,
      operationId: "createPublicSharedSecret",
      body: z
        .object({
          secretValue: z.string().max(10_000),
          password: z.string().optional(),
          expiresIn: z.string(),
          maxViews: z.number().min(1).optional()
        })
        .superRefine((data, ctx) => {
          const duration = ms(data.expiresIn);

          if (duration > ms("30d")) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Expiration time cannot exceed 30 days",
              path: ["expiresIn"]
            });
          }

          if (duration < ms("5m")) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Expiration time cannot be less than 5 minutes",
              path: ["expiresIn"]
            });
          }
        }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.createPublicSharedSecret({
        ...req.body,
        accessType: SecretSharingAccessType.Anyone
      });
      return { id: sharedSecret.id };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: publicSecretShareCreationLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SecretSharing],
      description: "Create a new shared secret that can be accessed by a link.",
      operationId: "createSharedSecret",
      body: z
        .object({
          name: z.string().max(50).optional().describe(SECRET_SHARING.CREATE.name),
          password: z.string().optional().describe(SECRET_SHARING.CREATE.password),
          secretValue: z.string().describe(SECRET_SHARING.CREATE.secretValue),
          expiresIn: z.string().default("30d").describe(SECRET_SHARING.CREATE.expiresIn),
          maxViews: z.number().min(1).optional().describe(SECRET_SHARING.CREATE.maxViews),
          accessType: z
            .nativeEnum(SecretSharingAccessType)
            .default(SecretSharingAccessType.Organization)
            .describe(SECRET_SHARING.CREATE.accessType),
          authorizedEmails: z
            .string()
            .email()
            .array()
            .max(100)
            .optional()
            .transform((val) => (val ? [...new Set(val)] : undefined))
            .describe(SECRET_SHARING.CREATE.authorizedEmails)
        })
        .superRefine((data, ctx) => {
          const duration = ms(data.expiresIn);

          if (duration > ms("30d")) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Expiration time cannot exceed 30 days",
              path: ["expiresIn"]
            });
          }

          if (duration < ms("5m")) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Expiration time cannot be less than 5 minutes",
              path: ["expiresIn"]
            });
          }
        }),
      response: {
        200: SanitizedSecretSharingSchema.extend({
          sharedSecretLink: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.createSharedSecret({
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
          type: EventType.CREATE_SHARED_SECRET,
          metadata: {
            accessType: req.body.accessType,
            expiresAt: sharedSecret.expiresAt.toISOString(),
            expiresAfterViews: req.body.maxViews,
            name: req.body.name,
            id: sharedSecret.id,
            usingPassword: !!req.body.password
          }
        }
      });

      return sharedSecret;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SecretSharing],
      description: "Delete a shared secret by its ID.",
      operationId: "deleteSharedSecret",
      params: z.object({
        id: z.string().describe(SECRET_SHARING.DELETE.id)
      }),
      response: {
        200: SanitizedSecretSharingSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { id } = req.params;
      const deletedSharedSecret = await req.server.services.secretSharing.deleteSharedSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        sharedSecretId: id,
        type: SecretSharingType.Share
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_SHARED_SECRET,
          metadata: {
            id,
            name: deletedSharedSecret.name || undefined
          }
        }
      });

      return deletedSharedSecret;
    }
  });

  // Serve branding images from database - public (using shared secret ID)
  server.route({
    method: "GET",
    url: "/public/:id/branding/:assetType",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      params: z.object({
        id: z.string(),
        assetType: z.enum(["brand-logo", "brand-favicon"])
      })
    },
    handler: async (req, res) => {
      const { id, assetType } = req.params;

      const orgId = await req.server.services.secretSharing.getSharedSecretOrgId(id);

      if (!orgId) {
        throw new NotFoundError({ message: "Shared secret not found or has no organization" });
      }

      const asset = await req.server.services.secretSharing.getBrandingAsset(orgId, assetType);

      if (!asset) {
        throw new NotFoundError({ message: `No ${assetType} configured for this organization` });
      }

      void res.header("Content-Type", asset.contentType);
      void res.header("Cache-Control", "public, max-age=3600"); // Cache for 1 hour

      return res.send(asset.data);
    }
  });

  // Upload branding asset
  server.route({
    method: "POST",
    url: "/branding/:assetType",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        assetType: z.enum(["brand-logo", "brand-favicon"])
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { assetType } = req.params;
      const file = await req.file();

      if (!file) {
        throw new BadRequestError({ message: "No file uploaded" });
      }

      const buffer = await file.toBuffer();

      // Validate size
      if (buffer.length > MAX_IMAGE_SIZE) {
        throw new BadRequestError({ message: `File too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB` });
      }

      // Validate content type
      const contentType = file.mimetype;
      if (!ALLOWED_IMAGE_CONTENT_TYPES.includes(contentType)) {
        throw new BadRequestError({
          message: `Invalid file type. Allowed types: ${ALLOWED_IMAGE_CONTENT_TYPES.join(", ")}`
        });
      }

      await req.server.services.secretSharing.uploadBrandingAsset(
        req.permission.orgId,
        assetType,
        buffer,
        contentType,
        req.permission
      );

      return { message: `Successfully uploaded ${assetType}` };
    }
  });

  // Delete branding asset
  server.route({
    method: "DELETE",
    url: "/branding/:assetType",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        assetType: z.enum(["brand-logo", "brand-favicon"])
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { assetType } = req.params;

      await req.server.services.secretSharing.deleteBrandingAsset(req.permission.orgId, assetType, req.permission);

      return { message: `Successfully deleted ${assetType}` };
    }
  });

  // Get branding config.
  // When authenticated (no query param): returns branding config for the user's current org.
  // When public (with sharedSecretId query param): resolves the org from the shared secret.
  server.route({
    method: "GET",
    url: "/branding",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      querystring: z.object({
        sharedSecretId: z.string().optional()
      }),
      response: {
        200: z.object({
          hasLogo: z.boolean(),
          hasFavicon: z.boolean(),
          primaryColor: z.string().optional(),
          secondaryColor: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      let orgId: string | null = null;

      if (req.query.sharedSecretId) {
        orgId = await req.server.services.secretSharing.getSharedSecretOrgId(req.query.sharedSecretId);

        if (!orgId) {
          throw new NotFoundError({ message: "Shared secret not found or has no organization" });
        }
      } else if (req.permission?.orgId) {
        orgId = req.permission.orgId;
      } else {
        throw new BadRequestError({ message: "Either authentication or a sharedSecretId query parameter is required" });
      }

      const config = await req.server.services.secretSharing.getOrgBrandConfig(
        orgId,
        req.query.sharedSecretId ? undefined : req.permission
      );

      return {
        hasLogo: config?.hasLogo ?? false,
        hasFavicon: config?.hasFavicon ?? false,
        primaryColor: config?.primaryColor,
        secondaryColor: config?.secondaryColor
      };
    }
  });

  // Get branding asset for current org - authenticated (for settings page preview)
  server.route({
    method: "GET",
    url: "/branding/:assetType",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        assetType: z.enum(["brand-logo", "brand-favicon"])
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, res) => {
      const { assetType } = req.params;

      const asset = await req.server.services.secretSharing.getBrandingAsset(
        req.permission.orgId,
        assetType,
        req.permission
      );

      if (!asset) {
        throw new NotFoundError({ message: `No ${assetType} configured for this organization` });
      }

      void res.header("Content-Type", asset.contentType);
      void res.header("Cache-Control", "private, max-age=300");

      return res.send(asset.data);
    }
  });
};
