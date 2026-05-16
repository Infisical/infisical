import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { BUNDLED_IMAGE_DIR } from "@app/services/announcement/announcement-service";
import { AuthMode } from "@app/services/auth/auth-type";

const AnnouncementSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  imageUrl: z.string().nullable(),
  link: z.string().nullable(),
  linkLabel: z.string().nullable(),
  published: z.string()
});

const ASSET_FILENAME_RE = /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/;
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif"
};

export const registerAnnouncementRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/recent",
    config: {
      rateLimit: readLimit
    },
    method: "GET",
    schema: {
      operationId: "listRecentAnnouncements",
      response: {
        200: z.object({
          announcements: AnnouncementSchema.array(),
          lastSeenAnnouncementId: z.string().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // this is to appease the type derivation below
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new UnauthorizedError({ message: "This endpoint can only be accessed by users" });
      }
      return server.services.announcement.listRecentAnnouncements({ userId: req.auth.userId });
    }
  });

  server.route({
    url: "/seen",
    config: {
      rateLimit: writeLimit
    },
    method: "POST",
    schema: {
      operationId: "markAnnouncementSeen",
      body: z.object({
        announcementId: z.string().min(1).max(255)
      }),
      response: {
        200: z.object({
          lastSeenAnnouncementId: z.string().nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // this is to appease the type derivation below
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new UnauthorizedError({ message: "This endpoint can only be accessed by users" });
      }
      return server.services.announcement.markAnnouncementSeen({
        userId: req.auth.userId,
        announcementId: req.body.announcementId
      });
    }
  });

  // Serves images baked into the image at build time (see scripts/bake-announcements.ts).
  // Filenames are content-hashed so caching is safe to be long-lived and immutable.
  server.route({
    url: "/assets/:filename",
    config: {
      rateLimit: readLimit
    },
    method: "GET",
    schema: {
      params: z.object({
        filename: z.string()
      })
    },
    handler: async (req, reply) => {
      const { filename } = req.params;
      if (!ASSET_FILENAME_RE.test(filename)) {
        throw new NotFoundError({ message: "Asset not found" });
      }

      const filePath = path.join(BUNDLED_IMAGE_DIR, filename);
      try {
        await stat(filePath);
      } catch {
        throw new NotFoundError({ message: "Asset not found" });
      }

      const ext = path.extname(filename).toLowerCase();
      return reply
        .type(MIME_BY_EXT[ext] ?? "application/octet-stream")
        .header("cache-control", "public, max-age=31536000, immutable")
        .header("x-content-type-options", "nosniff")
        .send(createReadStream(filePath));
    }
  });
};
