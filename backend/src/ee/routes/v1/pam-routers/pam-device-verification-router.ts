import { FastifyRequest } from "fastify";
import z from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { PamDevicePostureScope } from "@app/ee/services/pam-device-posture/pam-device-posture-enums";
import {
  PamDeviceInfoSchema,
  PamDeviceVerificationResponseSchema,
  TPamDevicePostureCheckResult
} from "@app/ee/services/pam-device-posture/pam-device-posture-schemas";
import { PamAccessType } from "@app/ee/services/pam/pam-enums";
import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

const failedChecks = (checks: unknown) =>
  ((checks as TPamDevicePostureCheckResult[] | null) ?? [])
    .filter((check) => !check.passed)
    .map((check) => `${check.provider}: ${check.label}`);

export const registerPamDeviceVerificationRouter = async (server: FastifyZodProvider) => {
  const auditDeviceCheck = async (
    {
      auditLogInfo,
      orgId,
      projectId
    }: { auditLogInfo: FastifyRequest["auditLogInfo"]; orgId: string; projectId: string },
    {
      row,
      account,
      via
    }: {
      row: {
        id: string;
        status: string;
        accessType: string;
        deviceSerialNumber?: string | null;
        checks?: unknown;
        message?: string | null;
      };
      account: { id: string; name: string; folderId?: string | null; folderName?: string | null };
      via: "cli" | "browser";
    }
  ) =>
    server.services.auditLog.createAuditLog({
      ...auditLogInfo,
      orgId,
      projectId,
      event: {
        type: EventType.PAM_DEVICE_POSTURE_CHECK,
        metadata: {
          accountId: account.id,
          accountName: account.name,
          folderId: account.folderId ?? null,
          folderName: account.folderName ?? null,
          accessType: row.accessType,
          status: row.status,
          deviceSerialNumber: row.deviceSerialNumber ?? "",
          failedChecks: failedChecks(row.checks),
          message: row.message ?? null,
          via
        }
      }
    });

  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "createPamDeviceVerification",
      description:
        "Start a device check in the browser. Returns a code the user completes with `infisical pam verify-device <code>` on the device being checked.",
      body: z.object({
        accountId: z.string().uuid().describe("The account the device check is for."),
        accessType: z
          .nativeEnum(PamAccessType)
          .optional()
          .describe("Whether the check is for launching sessions (default) or viewing credentials."),
        forAutoApproval: z
          .boolean()
          .optional()
          .describe("Also check the device against the folder's auto-approval rules that check devices.")
      }),
      response: {
        200: z.object({
          verification: z.object({ id: z.string().uuid(), code: z.string(), expiresAt: z.date() })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const ticket = await server.services.pamDevicePosture.createVerification({
        projectId: req.internalPamProjectId,
        accountId: req.body.accountId,
        accessType: req.body.accessType,
        forAutoApproval: req.body.forAutoApproval,
        actor: req.actor
      });
      return { verification: ticket };
    }
  });

  server.route({
    method: "POST",
    url: "/check",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "checkPamDevice",
      description:
        "Check the caller's device now against the account's device posture policies. The Infisical CLI calls this with the device it runs on.",
      body: z.object({
        accountId: z.string().uuid().describe("The account the device check is for."),
        accessType: z
          .nativeEnum(PamAccessType)
          .optional()
          .describe("Whether the check is for launching sessions (default) or viewing credentials."),
        forAutoApproval: z
          .boolean()
          .optional()
          .describe("Also check the device against the folder's auto-approval rules that check devices."),
        device: PamDeviceInfoSchema.describe("The device to check, as read by the Infisical CLI.")
      }),
      response: {
        200: z.object({
          verification: PamDeviceVerificationResponseSchema.nullable().describe(
            "The result, or null when no device policy applies to this account."
          ),
          appliesTo: z
            .nativeEnum(PamDevicePostureScope)
            .array()
            .describe("Which policies checked the device: the account's template, or the folder's auto-approval rules.")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const result = await server.services.pamDevicePosture.checkDevice({
        projectId: req.internalPamProjectId,
        accountId: req.body.accountId,
        accessType: req.body.accessType,
        forAutoApproval: req.body.forAutoApproval,
        device: req.body.device,
        actor: req.actor
      });
      if (result.row) {
        await auditDeviceCheck(
          { auditLogInfo: req.auditLogInfo, orgId: req.actor.orgId, projectId: req.internalPamProjectId },
          { row: result.row, account: result.account, via: "cli" }
        );
      }
      return { verification: result.verification, appliesTo: result.appliesTo };
    }
  });

  server.route({
    method: "POST",
    url: "/complete",
    config: { rateLimit: writeLimit },
    schema: {
      operationId: "completePamDeviceVerification",
      description: "Complete a browser device verification from the Infisical CLI on the device being checked.",
      body: z.object({
        code: z.string().trim().min(1).max(16),
        device: PamDeviceInfoSchema
      }),
      response: {
        200: z.object({ verification: PamDeviceVerificationResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const { verification, account, row } = await server.services.pamDevicePosture.completeVerification({
        projectId: req.internalPamProjectId,
        code: req.body.code,
        device: req.body.device,
        actor: req.actor
      });
      await auditDeviceCheck(
        { auditLogInfo: req.auditLogInfo, orgId: req.actor.orgId, projectId: req.internalPamProjectId },
        { row, account, via: "browser" }
      );
      return { verification };
    }
  });

  server.route({
    method: "GET",
    url: "/:verificationId",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getPamDeviceVerification",
      description: "Get the status of a device verification the caller started.",
      params: z.object({ verificationId: z.string().uuid() }),
      response: {
        200: z.object({ verification: PamDeviceVerificationResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.OAUTH]),
    handler: async (req) => {
      const verification = await server.services.pamDevicePosture.getVerification({
        projectId: req.internalPamProjectId,
        verificationId: req.params.verificationId,
        actor: req.actor
      });
      return { verification };
    }
  });
};
