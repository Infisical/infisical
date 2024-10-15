import { z } from "zod";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import {
    CreateSecretSchema,
    SanitizedSecretSchema,
    UpdateSecretSchema
} from '@app/services/consumer-secret/consumer-secret-types';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Define the schema for querystring
const ListQuerySchema = z.object({
  offset: z.coerce.number().min(0).max(100).default(0),
  limit: z.coerce.number().min(1).max(100).default(25)
});

// Infer types from Zod schemas
type ListQueryType = z.infer<typeof ListQuerySchema>;
type CreateSecretType = z.infer<typeof CreateSecretSchema>;
type UpdateSecretType = z.infer<typeof UpdateSecretSchema>;

export const registerConsumerSecretRouter = async (server: FastifyInstance) => {

  // List consumer secrets route
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: ListQuerySchema,
      response: {
        200: z.object({
          secrets: z.array(SanitizedSecretSchema),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req: FastifyRequest<{ Querystring: ListQueryType }>, res: FastifyReply) => {
      const { secrets, totalCount } = await server.services.consumerSecret.listConsumerSecrets({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        ...req.query
      });
      return res.send({ secrets, totalCount });
    }
  });

  // Create a new consumer secret route
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: CreateSecretSchema,
      response: {
        200: z.object({
          secret: SanitizedSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req: FastifyRequest<{ Body: CreateSecretType }>, res: FastifyReply) => {
      const createDTO = {
        ...req.body,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
      };
      const secret = await server.services.consumerSecret.createConsumerSecret(createDTO);
      return res.send({ secret });
    }
  });

  // Update consumer secret route
  server.route({
    method: "PATCH",
    url: "/:consumerSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ consumerSecretId: z.string().trim() }),
      body: UpdateSecretSchema,
      response: {
        200: z.object({
          secret: SanitizedSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req: FastifyRequest<{ Params: { consumerSecretId: string }, Body: UpdateSecretType }>, res: FastifyReply) => {
      const updateDTO = {
        ...req.body,
        id: req.params.consumerSecretId,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId
      };
      const secret = await server.services.consumerSecret.updateConsumerSecret(updateDTO);
      return res.send({ secret });
    }
  });

  // Delete consumer secret route
  server.route({
    method: "DELETE",
    url: "/:consumerSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({ consumerSecretId: z.string().trim() }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req: FastifyRequest<{ Params: { consumerSecretId: string } }>, res: FastifyReply) => {
      const deleteDTO = {
        id: req.params.consumerSecretId
      };
      await server.services.consumerSecret.deleteConsumerSecret(deleteDTO);
      return res.send({ message: "Successfully deleted user secret" });
    }
  });

  return undefined;
};
