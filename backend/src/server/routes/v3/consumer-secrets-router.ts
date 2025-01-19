import { z } from "zod";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { ConsumerSecretRawSchema } from "@app/services/consumer-secrets/consumer-secrets-types";

export const registerConsumerSecretsRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/all",  // api/v3/consumersecrets/all
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({}),
      response: {
        200: z.object({
          consumerSecretsData: ConsumerSecretRawSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const consumerSecretsData = await server.services.consumerSecrets.getAllMyConsumerSecrets(/* userId = */ req.permission.id, /* orgId = */ req.permission.orgId);
      return { consumerSecretsData }
    }
  });

  server.route({
    method: "POST",
    url: "/create",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        plaintextSecret: z.string(),
      }),
      response: {
        200: z.boolean(),
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.consumerSecrets.createConsumerSecret(req.permission.orgId, req.permission.id, req.body.plaintextSecret);
      return true;
    },
  })

  server.route({
    method: "DELETE",
    url: "/delete/:secretId",  // api/v3/consumersecrets/delete/<secretUUID>
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        secretId: z.string().uuid()
      }),
      response: {
        200: z.boolean()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.consumerSecrets.deleteConsumerSecret(
          /* org = */ req.permission.orgId,
          /* user = */ req.permission.id,
          /* secretId */ req.params.secretId);
      return true;
    }
  });
};