import { z } from "zod";

import { UserNotificationsSchema } from "@app/db/schemas/user-notifications";
import { UnauthorizedError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerNotificationRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/user",
    config: {
      rateLimit: readLimit
    },
    method: "GET",
    schema: {
      response: {
        200: z.object({
          notifications: UserNotificationsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new UnauthorizedError({ message: "This endpoint can only be accessed by users" });
      }

      const notifications = await server.services.notification.listUserNotifications({
        userId: req.auth.userId,
        orgId: req.auth.orgId
      });

      return { notifications };
    }
  });

  server.route({
    url: "/user/:notificationId",
    config: {
      rateLimit: writeLimit
    },
    method: "DELETE",
    schema: {
      params: z.object({
        notificationId: z.string()
      }),
      response: {
        200: z.object({
          notification: UserNotificationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new UnauthorizedError({ message: "This endpoint can only be accessed by users" });
      }

      const notification = await server.services.notification.deleteUserNotification({
        notificationId: req.params.notificationId,
        userId: req.auth.userId
      });

      return { notification };
    }
  });

  server.route({
    url: "/user/:notificationId",
    config: {
      rateLimit: writeLimit
    },
    method: "PATCH",
    schema: {
      params: z.object({
        notificationId: z.string()
      }),
      body: z.object({
        isRead: z.boolean()
      }),
      response: {
        200: z.object({
          notification: UserNotificationsSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new UnauthorizedError({ message: "This endpoint can only be accessed by users" });
      }

      const notification = await server.services.notification.updateUserNotification({
        notificationId: req.params.notificationId,
        userId: req.auth.userId,
        ...req.body
      });

      return { notification };
    }
  });

  // Mark all user notifications as read
  server.route({
    url: "/user/mark-as-read",
    config: {
      rateLimit: writeLimit
    },
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new UnauthorizedError({ message: "This endpoint can only be accessed by users" });
      }

      await server.services.notification.markUserNotificationsAsRead({
        userId: req.auth.userId,
        orgId: req.auth.orgId
      });
    }
  });
};
