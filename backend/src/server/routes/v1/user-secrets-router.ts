/* eslint-disable @typescript-eslint/no-unused-vars */
import { z } from "zod";

import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
  creditCardSchema,
  newUserSecretDTOSchema,
  secureNoteSchema,
  userSecretSchema,
  webLoginSchema
} from "@app/services/user-secrets/user-secrets-types";

export const registerUserSecretsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get all user secrets",
      querystring: z.object({
        userId: z.string().trim().uuid()
      }),
      response: {
        200: z.object({
          webLogins: webLoginSchema.omit({ type: true }).array(),
          creditCards: creditCardSchema.omit({ type: true }).array(),
          secureNotes: secureNoteSchema.omit({ type: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // return await server.services.userSecrets.getUserSecrets(req.query.userId);

      // DUMMY DATA
      const webLogins = [
        {
          id: "ce12d0a8-1e89-4f48-bc5a-3a36dda05fdf",
          name: "google",
          username: "user1",
          password: "password"
        },
        {
          id: "d6fac21d-f6f9-4a8d-92ce-fb6e99a12b0d",
          name: "my computer",
          username: "user2",
          password: "hunter2"
        },
        {
          id: "3f371341-1459-4f71-b4bb-f39f86b1bb42",
          name: "my secret place",
          username: "user3",
          password: "12345"
        }
      ];

      const creditCards = [
        {
          id: "a0a56b06-acca-4c63-b269-6fa8aded69be",
          name: "visa",
          cardNumber: "1234567890",
          expiryDate: "11/25",
          cvv: "123"
        },
        {
          id: "8467f6a7-a3ab-4096-8868-f878b436d596",
          name: "stolen card",
          cardNumber: "9876543210",
          expiryDate: "1/30",
          cvv: "321"
        }
      ];

      const secureNotes = [
        {
          id: "b9162dd1-8e9f-45fa-a3dd-28927aeeb2ca",
          name: "Note 1",
          content: "hello there"
        },
        {
          id: "5d3c1b99-802f-43ca-bb92-df683083ffff",
          name: "Note 2",
          content: "goodbye"
        }
      ];

      return {
        webLogins,
        creditCards,
        secureNotes
      };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create new user secret",
      body: z.object({
        userId: z.string(),
        userSecret: newUserSecretDTOSchema
      }),
      response: {
        // 200: userSecretSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // return await server.services.userSecrets.createUserSecret(req.body.userId, req.body.userSecret);
    }
  });

  server.route({
    method: "PATCH",
    url: "/:userSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Edit a user secret",
      params: z.object({
        userSecretId: z.string().uuid()
      }),
      body: z.object({
        userId: z.string().uuid(),
        userSecret: userSecretSchema
      }),
      response: {
        200: userSecretSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // return await server.services.userSecrets.updateUserSecret(req.params.userSecretId, req.body.userId, req.body.userSecret);
    }
  });

  server.route({
    method: "DELETE",
    url: "/:userSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Delete a user secret",
      params: z.object({
        userSecretId: z.string().uuid()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      // return await server.services.userSecrets.deleteUserSecret(req.params.userSecretId);
    }
  });
};
