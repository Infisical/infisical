import { z } from "zod";

import { RemindersSchema } from "@app/db/schemas/reminders";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretReminderRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:secretId",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        secretId: z.string().uuid()
      }),
      body: z
        .object({
          message: z.string().trim().max(1024).optional(),
          repeatDays: z.number().min(1).nullable().optional(),
          nextReminderDate: z.string().datetime().nullable().optional(),
          fromDate: z.string().datetime().nullable().optional(),
          recipients: z.string().array().optional()
        })
        .refine((data) => {
          return data.repeatDays || data.nextReminderDate;
        }, "At least one of repeatDays or nextReminderDate is required"),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.reminder.createReminder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        reminder: {
          secretId: req.params.secretId,
          message: req.body.message,
          repeatDays: req.body.repeatDays,
          nextReminderDate: req.body.nextReminderDate,
          fromDate: req.body.fromDate,
          recipients: req.body.recipients
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_SECRET_REMINDER,
          metadata: {
            secretId: req.params.secretId,
            message: req.body.message,
            repeatDays: req.body.repeatDays,
            nextReminderDate: req.body.nextReminderDate,
            recipients: req.body.recipients
          }
        }
      });

      return { message: "Successfully created reminder" };
    }
  });

  server.route({
    url: "/:secretId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSecretReminder",
      params: z.object({
        secretId: z.string().uuid()
      }),
      response: {
        200: z.object({
          reminder: RemindersSchema.extend({
            recipients: z.string().array().optional()
          })
            .optional()
            .nullable()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const reminder = await server.services.reminder.getReminder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        secretId: req.params.secretId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_SECRET_REMINDER,
          metadata: {
            secretId: req.params.secretId
          }
        }
      });
      return { reminder };
    }
  });

  server.route({
    url: "/:secretId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteSecretReminder",
      params: z.object({
        secretId: z.string().uuid()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.reminder.deleteReminder({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        secretId: req.params.secretId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_SECRET_REMINDER,
          metadata: {
            secretId: req.params.secretId
          }
        }
      });
      return { message: "Successfully deleted reminder" };
    }
  });
};
