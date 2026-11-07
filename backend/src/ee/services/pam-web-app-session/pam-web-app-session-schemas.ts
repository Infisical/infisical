import { z } from "zod";

import { auditSafeText } from "@app/server/lib/schemas";

import { WEB_WORKER_STATES } from "./pam-web-app-session-types";

export const CreateWebAppSessionSchema = z.object({
  accountId: z.string().uuid().describe("The Web App account to launch"),
  reason: auditSafeText(z.string().trim().max(500), { allowMultiline: true })
    .refine((value) => !/[\uD800-\uDFFF]/u.test(value), "Use valid Unicode text")
    .optional()
    .describe("Reason for opening the app"),
  mfaSessionId: z.string().max(64).optional().describe("Completed MFA verification"),
  idempotencyKey: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional()
    .describe("A key for retrying this exact launch")
});
export const WebAppSessionViewSchema = z.object({
  id: z.string().uuid(),
  accountId: z.string().uuid().nullish(),
  accountName: z.string(),
  accountType: z.string(),
  folderName: z.string().nullish(),
  status: z.string(),
  startedAt: z.date().nullish(),
  expiresAt: z.date(),
  endedAt: z.date().nullish(),
  reason: z.string().nullish(),
  webApp: z.object({
    allocationGen: z.number().int(),
    controllerGen: z.number().int(),
    workerState: z.enum(WEB_WORKER_STATES),
    workerStateReason: z.string().nullable(),
    lastWorkerContactAt: z.date().nullable(),
    leaseUntil: z.date().nullable(),
    reconnectDeadlineAt: z.date().nullable(),
    stopConfirmedAt: z.date().nullable(),
    stopConfirmation: z.enum(["confirmed", "pending", "not-confirmed"]),
    startOrigin: z.string(),
    allowTypedNavigation: z.boolean(),
    reconnectGraceSeconds: z.number().int(),
    gatewayName: z.string().nullable()
  }),
  recording: z.object({
    state: z.enum([
      "initializing",
      "recording",
      "finalizing",
      "complete",
      "incomplete",
      "mismatch",
      "failed",
      "unavailable"
    ]),
    protection: z.literal("participant-level"),
    chunksEmitted: z.number().int(),
    chunksVerified: z.number().int()
  })
});
const counter = z.number().int().min(0).max(0x7fffffff);
export const WebAppStateReportSchema = z.object({
  reportSeq: counter.min(1).describe("Monotonically increasing report sequence"),
  allocationGen: counter.min(1).describe("Platform-issued allocation generation"),
  controllerGen: counter.describe("Last platform-issued controller generation observed"),
  state: z.enum(WEB_WORKER_STATES).describe("Current browser worker state"),
  reason: z.string().max(500).optional().describe("Reason for a worker state change"),
  chunksEmitted: counter.describe("Number of recording chunks emitted"),
  lastFrameSeq: counter.describe("Last recorded frame sequence"),
  uploadToken: z.string().min(1).max(128).describe("Session recording upload token")
});
