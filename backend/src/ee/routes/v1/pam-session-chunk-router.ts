import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamRecordingStorageBackend } from "@app/ee/services/pam-session-recording-storage/pam-session-recording-storage-enums";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const GATEWAY_TOKEN_HEADER = "x-gateway-upload-token";

const ChunkPlaybackSchema = z.object({
  chunkIndex: z.number().int().nonnegative().max(999999),
  startElapsedMs: z.number(),
  endElapsedMs: z.number(),
  storageBackend: z.nativeEnum(PamRecordingStorageBackend),
  externalChunkObjectKey: z.string().nullable(),
  ciphertextSha256: z.string(),
  ciphertextBytes: z.number(),
  iv: z.string(),
  presignedGetUrl: z.string().nullable()
});

export const registerPamSessionChunkRouter = async (server: FastifyZodProvider) => {
  // Mint a presigned PUT URL for a single chunk. Gateway-authenticated
  server.route({
    method: "POST",
    url: "/:sessionId/chunks/presigned-put",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Mint a presigned PUT URL for a session recording chunk (gateway only)",
      params: z.object({ sessionId: z.string().uuid() }),
      body: z.object({
        chunkIndex: z.number().int().nonnegative().max(999999),
        ciphertextBytes: z.number().int().positive(),
        isKeyframe: z.boolean().optional()
      }),
      response: {
        200: z.object({
          url: z.string(),
          objectKey: z.string(),
          method: z.literal("PUT"),
          expiresInSeconds: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const uploadToken = req.headers[GATEWAY_TOKEN_HEADER];
      if (typeof uploadToken !== "string" || !uploadToken) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.PAM_SESSION_UPLOAD_TOKEN_INVALID,
            metadata: { sessionId: req.params.sessionId, chunkIndex: req.body.chunkIndex }
          }
        });
        throw new BadRequestError({
          message: `Missing ${GATEWAY_TOKEN_HEADER} header: required for chunk upload`
        });
      }

      try {
        return await server.services.pamSessionChunk.requestPresignedPut(
          {
            sessionId: req.params.sessionId,
            chunkIndex: req.body.chunkIndex,
            ciphertextBytes: req.body.ciphertextBytes,
            isKeyframe: req.body.isKeyframe,
            uploadToken
          },
          req.permission
        );
      } catch (err) {
        const msg = (err as Error)?.message ?? "";
        if (msg.includes("Invalid upload token")) {
          await server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            orgId: req.permission.orgId,
            event: {
              type: EventType.PAM_SESSION_UPLOAD_TOKEN_INVALID,
              metadata: { sessionId: req.params.sessionId, chunkIndex: req.body.chunkIndex }
            }
          });
        }
        throw err;
      }
    }
  });

  // Submit chunk metadata after the gateway has uploaded ciphertext to S3,
  // OR (for Postgres backend) submit ciphertext + metadata in one call
  server.route({
    method: "POST",
    url: "/:sessionId/chunks",
    config: { rateLimit: writeLimit },
    schema: {
      description: "Record chunk metadata after upload, or upload ciphertext for Postgres backend",
      params: z.object({ sessionId: z.string().uuid() }),
      body: z.object({
        chunkIndex: z.number().int().nonnegative().max(999999),
        startElapsedMs: z.number(),
        endElapsedMs: z.number(),
        ciphertextSha256: z.string(),
        ciphertextBytes: z.number().int().positive(),
        iv: z.string(),
        keyframeObjectKey: z.string().nullable().optional(),
        keyframeSizeBytes: z.number().int().nonnegative().nullable().optional(),

        // Base64 inline ciphertext for Postgres backend
        ciphertext: z.string().optional()
      }),
      response: {
        200: z.object({
          ok: z.literal(true),
          storageBackend: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const uploadToken = req.headers[GATEWAY_TOKEN_HEADER];
      if (typeof uploadToken !== "string" || !uploadToken) {
        throw new BadRequestError({
          message: `Missing ${GATEWAY_TOKEN_HEADER} header: required for chunk upload`
        });
      }

      let ciphertextBuf: Buffer | undefined;
      if (req.body.ciphertext) {
        const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
        if (!BASE64_RE.test(req.body.ciphertext)) {
          throw new BadRequestError({ message: "ciphertext must be valid base64" });
        }
        ciphertextBuf = Buffer.from(req.body.ciphertext, "base64");
      }

      const result = await server.services.pamSessionChunk.recordChunk(
        {
          sessionId: req.params.sessionId,
          chunkIndex: req.body.chunkIndex,
          startElapsedMs: req.body.startElapsedMs,
          endElapsedMs: req.body.endElapsedMs,
          ciphertextSha256Base64: req.body.ciphertextSha256,
          ciphertextBytes: req.body.ciphertextBytes,
          ivBase64: req.body.iv,
          keyframeObjectKey: req.body.keyframeObjectKey ?? undefined,
          keyframeSizeBytes: req.body.keyframeSizeBytes ?? undefined,
          ciphertext: ciphertextBuf,
          uploadToken
        },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: result.projectId,
        event: {
          type: EventType.PAM_SESSION_CHUNK_UPLOAD,
          metadata: {
            sessionId: req.params.sessionId,
            chunkIndex: req.body.chunkIndex,
            storageBackend: result.storageBackend,
            ciphertextBytes: req.body.ciphertextBytes
          }
        }
      });

      return { ok: true as const, storageBackend: result.storageBackend };
    }
  });

  // User-facing playback endpoint: returns the unwrapped session key, chunk metadata, and presigned GET URLs
  // For Postgres-backed chunks, the frontend instead calls /:sessionId/chunks/:chunkIndex/ciphertext to fetch bytes
  server.route({
    method: "GET",
    url: "/:sessionId/playback",
    config: { rateLimit: readLimit },
    schema: {
      description: "Get playback bundle: session key + chunk metadata + presigned GET URLs",
      params: z.object({ sessionId: z.string().uuid() }),
      response: {
        200: z.object({
          legacy: z.boolean(),
          sessionKey: z.string().nullable(),
          projectId: z.string().optional(),
          storageBackend: z.string().optional(),
          chunks: z.array(ChunkPlaybackSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pamSessionChunk.getPlaybackBundle(req.params.sessionId, req.permission);
      if (result.legacy) {
        return { legacy: true, sessionKey: null, chunks: [] };
      }
      return {
        legacy: false,
        sessionKey: result.sessionKey,
        projectId: result.projectId,
        storageBackend: result.storageBackend,
        chunks: result.chunks
      };
    }
  });

  // Postgres-backed chunk ciphertext fetch (since there's no presigned GET URL for inline blobs)
  // Returns raw ciphertext bytes for the browser to verify + decrypt
  server.route({
    method: "GET",
    url: "/:sessionId/chunks/:chunkIndex/ciphertext",
    config: { rateLimit: readLimit },
    schema: {
      params: z.object({
        sessionId: z.string().uuid(),
        chunkIndex: z.coerce.number().int().nonnegative().max(999999)
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req, reply) => {
      const { ciphertext } = await server.services.pamSessionChunk.getChunkCiphertext(
        req.params.sessionId,
        req.params.chunkIndex,
        req.permission
      );
      void reply.header("Content-Type", "application/octet-stream");
      void reply.header("Cache-Control", "no-store");
      return reply.send(ciphertext);
    }
  });

  // Storage backend constants exposed to the gateway for sanity checks (read-only)
  server.route({
    method: "GET",
    url: "/recording-storage-backends",
    config: { rateLimit: readLimit },
    schema: {
      response: {
        200: z.object({
          backends: z.array(z.string())
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async () => ({
      backends: Object.values(PamRecordingStorageBackend)
    })
  });
};
