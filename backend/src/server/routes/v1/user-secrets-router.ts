import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { UserSecretType } from "@app/services/user-secrets/user-secrets-types";

export const registerUserSecretsRouter = async (server: FastifyZodProvider) => {
  // Create User Secret
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z
        .object({
          secretType: z.enum([UserSecretType.WEB_LOGIN, UserSecretType.CREDIT_CARD, UserSecretType.SECURE_NOTE]),
          name: z
            .string()
            .min(1, "Please enter a name for your secret")
            .max(100, "Please enter less than 100 characters"),
          loginURL: z.string().url().optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          isUsernameSecret: z.boolean().default(false),
          cardNumber: z
            .string()
            .regex(/^\d{13,19}$/, "Please enter a valid card number")
            .optional(),
          cardExpiry: z
            .string()
            .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Invalid expiry date format. Use MM/YY format.")
            .optional(),
          cardCvv: z.union([z.string().regex(/^\d{3,4}$/, "Please enter a valid cvv"), z.literal("")]).optional(),
          secureNote: z.string().optional()
        })
        .superRefine((data, ctx) => {
          switch (data.secretType) {
            case UserSecretType.WEB_LOGIN:
              if (!data.username) {
                ctx.addIssue({
                  path: ["username"],
                  message: "Username is required",
                  code: z.ZodIssueCode.custom
                });
              }
              if (!data.password) {
                ctx.addIssue({
                  path: ["password"],
                  message: "Password is required",
                  code: z.ZodIssueCode.custom
                });
              }
              break;

            case UserSecretType.CREDIT_CARD:
              if (!data.cardNumber) {
                ctx.addIssue({
                  path: ["cardNumber"],
                  message: "Card number is required",
                  code: z.ZodIssueCode.custom
                });
              }
              if (!data.cardExpiry) {
                ctx.addIssue({
                  path: ["cardExpiry"],
                  message: "Expiry date is required",
                  code: z.ZodIssueCode.custom
                });
              }
              break;

            case UserSecretType.SECURE_NOTE:
              if (!data.secureNote) {
                ctx.addIssue({
                  path: ["secureNote"],
                  message: "Secure note is required",
                  code: z.ZodIssueCode.custom
                });
              }
              break;

            default:
              break;
          }
        }),
      response: {
        200: z.object({
          id: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const userSecret = await req.server.services.userSecrets.createUserSecret({
        actorId: req.permission.id,
        ...req.body
      });
      return { id: userSecret.id };
    }
  });

  // Update User Secret
  server.route({
    method: "PUT",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string().uuid("Invalid ID format")
      }),
      body: z
        .object({
          secretType: z.enum([UserSecretType.WEB_LOGIN, UserSecretType.CREDIT_CARD, UserSecretType.SECURE_NOTE]),
          name: z
            .string()
            .min(1, "Please enter a name for your secret")
            .max(100, "Please enter less than 100 characters"),
          loginURL: z.string().url().optional(),
          username: z.string().optional(),
          password: z.string().optional(),
          isUsernameSecret: z.boolean().default(false),
          cardNumber: z
            .string()
            .regex(/^\d{13,19}$/, "Please enter a valid card number")
            .optional(),
          cardExpiry: z
            .string()
            .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, "Invalid expiry date format. Use MM/YY format.")
            .optional(),
          cardCvv: z.union([z.string().regex(/^\d{3,4}$/, "Please enter a valid cvv"), z.literal("")]).optional(),
          secureNote: z.string().optional()
        })
        .superRefine((data, ctx) => {
          switch (data.secretType) {
            case UserSecretType.WEB_LOGIN:
              if (!data.username) {
                ctx.addIssue({
                  path: ["username"],
                  message: "Username is required",
                  code: z.ZodIssueCode.custom
                });
              }
              if (!data.password) {
                ctx.addIssue({
                  path: ["password"],
                  message: "Password is required",
                  code: z.ZodIssueCode.custom
                });
              }
              break;

            case UserSecretType.CREDIT_CARD:
              if (!data.cardNumber) {
                ctx.addIssue({
                  path: ["cardNumber"],
                  message: "Card number is required",
                  code: z.ZodIssueCode.custom
                });
              }
              if (!data.cardExpiry) {
                ctx.addIssue({
                  path: ["cardExpiry"],
                  message: "Expiry date is required",
                  code: z.ZodIssueCode.custom
                });
              }
              break;

            case UserSecretType.SECURE_NOTE:
              if (!data.secureNote) {
                ctx.addIssue({
                  path: ["secureNote"],
                  message: "Secure note is required",
                  code: z.ZodIssueCode.custom
                });
              }
              break;

            default:
              break;
          }
        }),
      response: {
        200: z.object({
          id: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secret = await req.server.services.userSecrets.updateUserSecret(req.params.id, {
        actorId: req.permission.id,
        ...req.body
      });
      return { id: secret.id };
    }
  });

  // Get All User Secrets
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0),
        limit: z.coerce.number().min(1).max(100).default(25),
        secretType: z
          .enum([UserSecretType.WEB_LOGIN, UserSecretType.CREDIT_CARD, UserSecretType.SECURE_NOTE])
          .optional()
      }),
      response: {
        200: z.object({
          secrets: z.array(
            z.object({
              id: z.string().uuid(),
              secretType: z.enum([UserSecretType.WEB_LOGIN, UserSecretType.CREDIT_CARD, UserSecretType.SECURE_NOTE]),
              name: z.string(),
              loginURL: z.string().url().nullable(),
              username: z.string().nullable(),
              password: z.string().nullable(),
              isUsernameSecret: z.boolean(),
              cardNumber: z.string().nullable(),
              cardExpiry: z.string().nullable(),
              cardCvv: z.string().nullable(),
              secureNote: z.string().nullable(),
              createdAt: z.date(),
              updatedAt: z.date()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { offset, limit, secretType } = req.query;
      const secrets = await req.server.services.userSecrets.getAllUserSecrets(req.permission.id, {
        offset,
        limit,
        secretType
      });
      return { secrets };
    }
  });

  // Delete User Secret
  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string().uuid("Invalid ID format")
      }),
      response: {
        200: z.object({
          id: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secret = await req.server.services.userSecrets.deleteUserSecret(req.params.id);
      return { id: secret.id };
    }
  });
};
