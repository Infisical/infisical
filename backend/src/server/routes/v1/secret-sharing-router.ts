import fastifyMultipart from "@fastify/multipart";
import { z } from "zod";

import { SecretSharingSchema } from "@app/db/schemas/secret-sharing";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
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
      operationId: "listSharedSecrets",
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
    method: "POST",
    url: "/public/:id",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      operationId: "getPublicSharedSecret",
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        hashedHex: z.string().min(1).optional(),
        password: z.string().optional()
      }),
      response: {
        200: z.object({
          isPasswordProtected: z.boolean(),
          brandingConfig: z
            .object({
              hasLogo: z.boolean(),
              hasFavicon: z.boolean(),
              primaryColor: z.string().optional(),
              secondaryColor: z.string().optional()
            })
            .optional(),
          secret: SecretSharingSchema.pick({
            encryptedValue: true,
            iv: true,
            tag: true,
            expiresAt: true,
            expiresAfterViews: true,
            accessType: true
          })
            .extend({
              orgName: z.string().optional(),
              secretValue: z.string().optional()
            })
            .optional(),
          error: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.getSharedSecretById({
        sharedSecretId: req.params.id,
        hashedHex: req.body.hashedHex,
        password: req.body.password,
        orgId: req.permission?.orgId,
        actorId: req.permission?.id
      });

      let brandingConfig;

      if (sharedSecret.secretOrgId) {
        const orgBrandConfig = await req.server.services.secretSharing.getOrgBrandConfig(sharedSecret.secretOrgId);

        if (orgBrandConfig) {
          brandingConfig = {
            hasLogo: orgBrandConfig.hasLogo,
            hasFavicon: orgBrandConfig.hasFavicon,
            primaryColor: orgBrandConfig.primaryColor,
            secondaryColor: orgBrandConfig.secondaryColor
          };
        }

        // Verify that secret was actually returned
        if (sharedSecret.secret) {
          await server.services.auditLog.createAuditLog({
            orgId: sharedSecret.secretOrgId,
            ...req.auditLogInfo,
            event: {
              type: EventType.READ_SHARED_SECRET,
              metadata: {
                id: req.params.id,
                name: sharedSecret.secret.name || undefined,
                accessType: sharedSecret.secret.accessType
              }
            }
          });
        }
      }

      return { ...sharedSecret, brandingConfig };
    }
  });

  server.route({
    method: "POST",
    url: "/public",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "createPublicSharedSecret",
      body: z.object({
        secretValue: z.string().max(10_000),
        password: z.string().optional(),
        expiresAt: z.string(),
        expiresAfterViews: z.number().min(1).optional()
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
      operationId: "createSharedSecret",
      body: z.object({
        name: z.string().max(50).optional(),
        password: z.string().optional(),
        secretValue: z.string(),
        expiresAt: z.string(),
        expiresAfterViews: z.number().min(1).optional(),
        accessType: z.nativeEnum(SecretSharingAccessType).default(SecretSharingAccessType.Organization),
        emails: z
          .string()
          .email()
          .array()
          .max(100)
          .optional()
          .transform((val) => (val ? [...new Set(val)] : undefined))
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
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
            expiresAt: req.body.expiresAt,
            expiresAfterViews: req.body.expiresAfterViews,
            name: req.body.name,
            id: sharedSecret.id,
            usingPassword: !!req.body.password
          }
        }
      });

      return { id: sharedSecret.id };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sharedSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteSharedSecret",
      params: z.object({
        sharedSecretId: z.string()
      }),
      response: {
        200: SecretSharingSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { sharedSecretId } = req.params;
      const deletedSharedSecret = await req.server.services.secretSharing.deleteSharedSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        sharedSecretId,
        type: SecretSharingType.Share
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_SHARED_SECRET,
          metadata: {
            id: sharedSecretId,
            name: deletedSharedSecret.name || undefined
          }
        }
      });

      return { ...deletedSharedSecret };
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

  // Get branding config for current org
  server.route({
    method: "GET",
    url: "/branding",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          hasLogo: z.boolean(),
          hasFavicon: z.boolean(),
          primaryColor: z.string().optional(),
          secondaryColor: z.string().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const config = await req.server.services.secretSharing.getOrgBrandConfig(req.permission.orgId, req.permission);

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
