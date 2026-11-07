import { z } from "zod";

import { verifyProductMembership } from "@app/ee/services/pam/pam-permission";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const counter = z.number().int().min(0).max(0x7fffffff);
const elapsed = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const token = z.string().min(1).max(128).describe("Session recording upload token");
const canonicalText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => !/[\uD800-\uDFFF]/u.test(value), "Use valid Unicode text");
const gap = z
  .object({ fromElapsedUs: elapsed, toElapsedUs: elapsed, reason: canonicalText(500) })
  .refine((value) => value.toElapsedUs >= value.fromElapsedUs);
const params = z.object({ sessionId: z.string().uuid().describe("Browser session ID") });
export const registerPamWebRecordingRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/:sessionId/recording/final",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "reportPamWebRecordingFinal",
      tags: [ApiDocsTags.PamSessions],
      params,
      body: z.object({
        chunksEmitted: counter.describe("Final number of chunks emitted"),
        lastEndElapsedMs: elapsed.describe("Terminal recording offset in milliseconds"),
        gaps: z.array(gap).max(1000).describe("Known capture gaps"),
        droppedCaptureFrames: counter.describe("Capture frames omitted by sampling or failure"),
        droppedMoves: counter.describe("Pointer movements coalesced before dispatch"),
        terminalEventIncluded: z.boolean().describe("Whether the terminal lifecycle event is captured"),
        recordingFailed: z.boolean().default(false).describe("Sticky logger or capture failure"),
        uploadToken: token
      }),
      response: {
        200: z.object({
          recordingFinal: z.object({
            chunksEmitted: counter,
            lastEndElapsedMs: elapsed,
            gaps: z.array(gap),
            droppedCaptureFrames: counter,
            droppedMoves: counter,
            terminalEventIncluded: z.boolean(),
            recordingFailed: z.boolean()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { uploadToken, ...final } = req.body;
      await server.services.pamWebRecording.recordFinal(req.params.sessionId, final, uploadToken, req.permission);
      return { recordingFinal: final };
    }
  });
  server.route({
    method: "POST",
    url: "/:sessionId/recording/finalize",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "finalizePamWebRecording",
      tags: [ApiDocsTags.PamSessions],
      params,
      body: z.object({
        chunkCount: counter.describe("Expected final chunk count"),
        lastEndElapsedMs: elapsed.describe("Terminal recording offset in milliseconds"),
        endReason: canonicalText(64).describe("Reason the browser ended"),
        chainHeadBase64: z.string().length(44).describe("Final SHA-256 recording chain, base64 encoded"),
        uploadToken: token
      }),
      response: {
        200: z.object({
          manifest: z.object({
            status: z.enum(["complete", "incomplete", "mismatch"]),
            statusDetail: z.string().nullable(),
            canonicalSha256: z.string(),
            signature: z.string().nullable(),
            signingKeyId: z.string().uuid().nullable(),
            alg: z.string().nullable(),
            finalizedAt: z.date()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.GATEWAY_ACCESS_TOKEN]),
    handler: (req) =>
      server.services.pamWebRecording.finalize({ ...req.body, sessionId: req.params.sessionId }, req.permission)
  });
};
export const registerPamRecordingSigningKeysRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/recording-signing-keys",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamRecordingSigningKeys",
      tags: [ApiDocsTags.PamSessions],
      response: {
        200: z.object({
          keys: z.array(
            z.object({ id: z.string().uuid(), alg: z.string(), publicKeyPem: z.string(), createdAt: z.date() })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await verifyProductMembership(server.services.permission, req.internalPamProjectId, {
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });
      return server.services.pamWebRecording.signingKeys(req.permission.orgId);
    }
  });
};
