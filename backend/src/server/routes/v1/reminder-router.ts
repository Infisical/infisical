import { z } from "zod";

import { RemindersSchema } from "@app/db/schemas/reminders";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerReminderRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/:projectId/reminder",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().uuid()
      }),
      body: z.object({
        message: z.string().trim(),
        repeatDays: z.number().min(1).nullable().optional(),
        nextReminderDate: z.string().datetime().nullable().optional(),
        secretId: z.string().uuid(),
        recipients: z.string().array().optional()
      }),
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
        projectId: req.params.projectId,
        reminder: req.body
      });
      return { message: "Successfully created reminder" };
    }
  });

  server.route({
    url: "/:projectId/reminder/:secretId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().uuid(),
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
        secretId: req.params.secretId,
        projectId: req.params.projectId
      });
      return { reminder };
    }
  });

  server.route({
    url: "/:projectId/reminder/:secretId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().uuid(),
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
        secretId: req.params.secretId,
        projectId: req.params.projectId
      });
      return { message: "Successfully deleted reminder" };
    }
  });
};
