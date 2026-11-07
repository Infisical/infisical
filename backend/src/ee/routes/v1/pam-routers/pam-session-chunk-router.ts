import RE2 from "re2";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamRecordingStorageBackend } from "@app/ee/services/pam-session-recording/pam-recording-enums";
import { PamAccountType } from "@app/ee/services/pam/pam-enums";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
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
  objectVersionId: z.string().nullable().optional(),
  ciphertextSha256: z.string(),
  ciphertextBytes: z.number(),
  iv: z.string(),
  presignedGetUrl: z.string().nullable()
});

export const registerPamSessionChunkRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:sessionId/chunks/presigned-put",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "pamSessionChunkPresignedPut",
      description: "Request a presigned URL for uploading a session recording chunk",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({ sessionId: z.string().uuid().describe("The ID of the session") }),
      body: z.object({
        chunkIndex: z.number().int().nonnegative().max(999999).describe("Sequential chunk index"),
        ciphertextBytes: z.number().int().positive().describe("Size of the encrypted chunk in bytes"),
        ciphertextSha256Base64: z
          .string()
          .length(44)
          .optional()
          .describe("SHA-256 checksum of Web App ciphertext, base64 encoded"),
        isKeyframe: z.boolean().optional().describe("Whether this chunk is a keyframe")
      }),
      response: {
        200: z.union([
          z.object({
            url: z.string(),
            objectKey: z.string(),
            method: z.literal("PUT"),
            expiresInSeconds: z.number(),
            headers: z.record(z.string()).optional(),
            alreadyUploaded: z.literal(false).optional()
          }),
          z.object({ alreadyUploaded: z.literal(true), objectVersionId: z.string().nullable() })
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const uploadToken = req.headers[GATEWAY_TOKEN_HEADER];
      if (typeof uploadToken !== "string" || !uploadToken) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalPamProjectId,
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
            ciphertextSha256Base64: req.body.ciphertextSha256Base64,
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
            projectId: req.internalPamProjectId,
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

  server.route({
    method: "POST",
    url: "/:sessionId/chunks",
    bodyLimit: 32 * 1024 * 1024,
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "pamSessionRecordChunk",
      description: "Record a session recording chunk",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({ sessionId: z.string().uuid().describe("The ID of the session") }),
      body: z.object({
        chunkIndex: z.number().int().nonnegative().max(999999).describe("Sequential chunk index"),
        startElapsedMs: z.number().describe("Start time offset in milliseconds"),
        endElapsedMs: z.number().describe("End time offset in milliseconds"),
        ciphertextSha256: z.string().describe("SHA-256 hash of the ciphertext"),
        ciphertextBytes: z.number().int().positive().describe("Size of the encrypted chunk in bytes"),
        iv: z.string().describe("Initialization vector for decryption"),
        objectVersionId: z.string().min(1).max(1024).optional().describe("Exact object version returned by storage"),
        keyframeObjectKey: z.string().nullable().optional().describe("Object key for the keyframe in storage"),
        keyframeSizeBytes: z.number().int().nonnegative().nullable().optional().describe("Size of the keyframe"),
        ciphertext: z.string().optional().describe("Base64-encoded ciphertext for inline storage")
      }),
      response: {
        200: z.object({
          ok: z.literal(true),
          storageBackend: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const uploadToken = req.headers[GATEWAY_TOKEN_HEADER];
      if (typeof uploadToken !== "string" || !uploadToken) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.internalPamProjectId,
          event: {
            type: EventType.PAM_SESSION_UPLOAD_TOKEN_INVALID,
            metadata: { sessionId: req.params.sessionId, chunkIndex: req.body.chunkIndex }
          }
        });
        throw new BadRequestError({
          message: `Missing ${GATEWAY_TOKEN_HEADER} header: required for chunk upload`
        });
      }

      let ciphertextBuf: Buffer | undefined;
      if (req.body.ciphertext) {
        const BASE64_RE = new RE2(/^[A-Za-z0-9+/]*={0,2}$/);
        if (!BASE64_RE.test(req.body.ciphertext)) {
          throw new BadRequestError({ message: "ciphertext must be valid base64" });
        }
        ciphertextBuf = Buffer.from(req.body.ciphertext, "base64");
      }

      let result;
      try {
        result = await server.services.pamSessionChunk.recordChunk(
          {
            sessionId: req.params.sessionId,
            chunkIndex: req.body.chunkIndex,
            startElapsedMs: req.body.startElapsedMs,
            endElapsedMs: req.body.endElapsedMs,
            ciphertextSha256Base64: req.body.ciphertextSha256,
            ciphertextBytes: req.body.ciphertextBytes,
            ivBase64: req.body.iv,
            objectVersionId: req.body.objectVersionId,
            keyframeObjectKey: req.body.keyframeObjectKey ?? undefined,
            keyframeSizeBytes: req.body.keyframeSizeBytes ?? undefined,
            ciphertext: ciphertextBuf,
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
            projectId: req.internalPamProjectId,
            event: {
              type: EventType.PAM_SESSION_UPLOAD_TOKEN_INVALID,
              metadata: { sessionId: req.params.sessionId, chunkIndex: req.body.chunkIndex }
            }
          });
        }
        throw err;
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: result.projectId,
        event: {
          type: EventType.PAM_SESSION_CHUNK_UPLOAD,
          metadata: {
            sessionId: req.params.sessionId,
            accountId: result.accountId ?? undefined,
            chunkIndex: req.body.chunkIndex,
            storageBackend: result.storageBackend,
            ciphertextBytes: req.body.ciphertextBytes
          }
        }
      });

      return { ok: true as const, storageBackend: result.storageBackend };
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId/playback",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "pamSessionPlayback",
      description: "Get playback data for a session recording",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({ sessionId: z.string().uuid().describe("The ID of the session") }),
      querystring: z.object({
        verifyCursor: z.coerce
          .number()
          .int()
          .min(0)
          .max(10000)
          .optional()
          .describe("Offset for the next page of recording availability checks")
      }),
      response: {
        200: z.object({
          sessionComplete: z.boolean(),
          sessionKey: z.string(),
          projectId: z.string(),
          storageBackend: z.string(),
          chunks: z.array(ChunkPlaybackSchema),
          manifest: z
            .object({
              status: z.enum(["complete", "incomplete", "mismatch"]),
              statusDetail: z.string().nullable(),
              canonicalSha256: z.string(),
              signature: z.string().nullable(),
              signingKeyId: z.string().nullable(),
              alg: z.string().nullable(),
              finalizedAt: z.date(),
              canonical: z.unknown()
            })
            .nullable()
            .optional(),
          coverage: z
            .object({
              expectedChunks: z.number(),
              presentChunks: z.number(),
              missingIndices: z.array(z.number()),
              tailSealed: z.boolean(),
              gaps: z.array(z.object({ fromElapsedUs: z.number(), toElapsedUs: z.number(), reason: z.string() }))
            })
            .optional(),
          integrity: z
            .object({ manifestStatus: z.string(), manifestSignatureVerified: z.boolean(), checkpointCount: z.number() })
            .optional(),
          availability: z
            .object({
              verifiedChunks: z.number(),
              checkedChunks: z.number(),
              verifyCursor: z.number().nullable(),
              storageBackend: z.string(),
              protection: z.literal("participant-level"),
              retentionLock: z.literal("not-verified"),
              versionPinned: z.boolean()
            })
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const session = await server.services.pamSession.getSessionById(req.params.sessionId, {
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      if (session?.accountType === PamAccountType.WebApp)
        return server.services.pamWebRecording.getPlayback(
          req.params.sessionId,
          req.permission,
          req.query.verifyCursor ?? 0,
          req.auditLogInfo
        );
      const result = await server.services.pamSessionChunk.getSessionPlayback(req.params.sessionId, req.permission);
      return {
        sessionComplete: result.sessionComplete,
        sessionKey: result.sessionKey,
        projectId: result.projectId,
        storageBackend: result.storageBackend,
        chunks: result.chunks
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId/chunks/:chunkIndex/ciphertext",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "pamSessionChunkCiphertext",
      description: "Get the ciphertext for a specific recording chunk",
      tags: [ApiDocsTags.PamSessions],
      params: z.object({
        sessionId: z.string().uuid().describe("The ID of the session"),
        chunkIndex: z.coerce.number().int().nonnegative().max(999999).describe("The chunk index to retrieve")
      })
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
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

  server.route({
    method: "GET",
    url: "/recording-storage-backends",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "pamSessionRecordingStorageBackends",
      description: "List available recording storage backends",
      tags: [ApiDocsTags.PamSessions],
      response: {
        200: z.object({
          backends: z.array(z.string())
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.IDENTITY_ACCESS_TOKEN,
      AuthMode.GATEWAY_ACCESS_TOKEN,
      AuthMode.OAUTH
    ]),
    handler: async () => ({
      backends: Object.values(PamRecordingStorageBackend)
    })
  });
};
