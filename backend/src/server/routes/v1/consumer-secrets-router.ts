import { z } from "zod";

import { ConsumerSecretsSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerConsumerSecretsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.array(ConsumerSecretsSchema)
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req): Promise<z.infer<typeof ConsumerSecretsSchema>[]> => {
      const consumerSecrets = await req.server.services.consumerSecret.getConsumerSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return consumerSecrets;
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        type: z.string(),
        username: z.string().optional(),
        password: z.string().optional(),
        cardNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        cvv: z.string().optional(),
        title: z.string().optional(),
        content: z.string().optional()
      }),
      response: {
        200: z.object({
          id: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req): Promise<{ id: string }> => {
      const { type, username, password, cardNumber, expiryDate, cvv, title, content } = req.body;
      const consumerSecret = await req.server.services.consumerSecret.createConsumerSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        type,
        username,
        password,
        cardNumber,
        expiryDate,
        cvv,
        title,
        content
      });
      return { id: consumerSecret.id };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:consumerSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        consumerSecretId: z.string().uuid()
      }),
      response: {
        200: ConsumerSecretsSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req): Promise<z.infer<typeof ConsumerSecretsSchema>> => {
      const { consumerSecretId } = req.params;
      const deletedConsumerSecret = await req.server.services.consumerSecret.deleteConsumerSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        consumerSecretId
      });

      return { ...deletedConsumerSecret };
    }
  });

  server.route({
    method: "PUT",
    url: "/:consumerSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        consumerSecretId: z.string().uuid()
      }),
      body: z.object({
        type: z.string(),
        username: z.string().optional(),
        password: z.string().optional(),
        cardNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        cvv: z.string().optional(),
        title: z.string().optional(),
        content: z.string().optional()
      }),
      response: {
        200: ConsumerSecretsSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req): Promise<z.infer<typeof ConsumerSecretsSchema>> => {
      const { consumerSecretId } = req.params;
      const { type, username, password, cardNumber, expiryDate, cvv, title, content } = req.body;
      const updatedConsumerSecret = await req.server.services.consumerSecret.updateConsumerSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: consumerSecretId,
        type,
        username,
        password,
        cardNumber,
        expiryDate,
        cvv,
        title,
        content
      });

      return { ...updatedConsumerSecret };
    }
  });
};
