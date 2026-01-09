import { z } from "zod";

import { SecretSharingSchema } from "@app/db/schemas";
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
  "image/webp"
];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export const registerSecretSharingRouter = async (server: FastifyZodProvider) => {
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
              hasLogoUrl: z.boolean(),
              hasFaviconUrl: z.boolean(),
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
            hasLogoUrl: Boolean(orgBrandConfig.logoUrl),
            hasFaviconUrl: Boolean(orgBrandConfig.faviconUrl),
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

  // Endpoint to proxy external branding images
  server.route({
    method: "GET",
    url: "/public/:id/branding/:assetType",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      params: z.object({
        id: z.string(),
        assetType: z.enum(["logo", "favicon"])
      })
    },
    handler: async (req, res) => {
      const { id, assetType } = req.params;

      const orgId = await req.server.services.secretSharing.getSharedSecretOrgId(id);

      if (!orgId) {
        throw new NotFoundError({ message: "Shared secret not found or has no organization" });
      }

      const orgBrandConfig = await req.server.services.secretSharing.getOrgBrandConfig(orgId);

      if (!orgBrandConfig) {
        throw new NotFoundError({ message: "No branding configured for this organization" });
      }

      const imageUrl = assetType === "logo" ? orgBrandConfig.logoUrl : orgBrandConfig.faviconUrl;

      if (!imageUrl) {
        throw new NotFoundError({ message: `No ${assetType} configured for this organization` });
      }

      // Fetch image
      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new BadRequestError({ message: `Failed to fetch ${assetType}` });
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const contentLength = response.headers.get("content-length");

      // Validate content type
      if (!ALLOWED_IMAGE_CONTENT_TYPES.some((allowed) => contentType.startsWith(allowed))) {
        throw new BadRequestError({ message: "Invalid image type" });
      }

      // Validate size
      if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_SIZE) {
        throw new BadRequestError({ message: "Image too large" });
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());

      void res.header("Content-Type", contentType);
      void res.header("Cache-Control", "public, max-age=3600"); // Cache for 1 hour

      return res.send(imageBuffer);
    }
  });
};
