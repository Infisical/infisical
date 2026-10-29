import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";
import { publicEndpointLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

import {
  SHARED_SECRET_MAX_VIEWS,
  SHARED_SECRET_NAME_MAX_LENGTH,
  SHARED_SECRET_VALUE_MAX_LENGTH,
  TSharedSecret,
  TSharedSecretActor
} from "../model/shared-secret";
import { TSharedSecretService } from "../service/shared-secret-service";

const SharedSecretResponseSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string().nullable(),
  expiresAt: z.date(),
  remainingViews: z.number().nullable()
});

const toSharedSecretResponse = (sharedSecret: TSharedSecret) => ({
  id: sharedSecret.id,
  orgId: sharedSecret.orgId,
  name: sharedSecret.name,
  expiresAt: sharedSecret.expiresAt,
  remainingViews: sharedSecret.remainingViews
});

const toSharedSecretActor = (permission: { type: ActorType; id: string; orgId: string }): TSharedSecretActor => {
  if (permission.type === ActorType.USER) return { type: "user", id: permission.id, orgId: permission.orgId };
  if (permission.type === ActorType.IDENTITY) return { type: "identity", id: permission.id, orgId: permission.orgId };
  throw new BadRequestError({ message: "Shared secrets can only be managed by users and machine identities" });
};

export const registerSharedSecretRouter = async (
  server: FastifyZodProvider,
  { sharedSecretService }: { sharedSecretService: TSharedSecretService }
) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      body: z.object({
        name: z.string().trim().max(SHARED_SECRET_NAME_MAX_LENGTH).optional(),
        value: z.string().min(1).max(SHARED_SECRET_VALUE_MAX_LENGTH),
        expiresAt: z.coerce.date(),
        maxViews: z.number().int().min(1).max(SHARED_SECRET_MAX_VIEWS).optional()
      }),
      response: { 200: z.object({ sharedSecret: SharedSecretResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sharedSecret = await sharedSecretService.createSharedSecret(toSharedSecretActor(req.permission), req.body);
      return { sharedSecret: toSharedSecretResponse(sharedSecret) };
    }
  });

  server.route({
    method: "POST",
    url: "/:sharedSecretId/views",
    config: { rateLimit: publicEndpointLimit },
    schema: {
      hide: true,
      params: z.object({ sharedSecretId: z.string().uuid() }),
      response: {
        200: z.object({
          sharedSecret: z.object({
            id: z.string().uuid(),
            name: z.string().nullable(),
            value: z.string(),
            remainingViews: z.number().nullable()
          })
        })
      }
    },
    handler: async (req) => {
      const { sharedSecret, value } = await sharedSecretService.viewSharedSecret(req.params.sharedSecretId);
      return {
        sharedSecret: {
          id: sharedSecret.id,
          name: sharedSecret.name,
          value,
          remainingViews: sharedSecret.remainingViews
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sharedSecretId",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true,
      params: z.object({ sharedSecretId: z.string().uuid() }),
      response: { 200: z.object({ sharedSecret: SharedSecretResponseSchema }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sharedSecret = await sharedSecretService.deleteSharedSecret(
        toSharedSecretActor(req.permission),
        req.params.sharedSecretId
      );
      return { sharedSecret: toSharedSecretResponse(sharedSecret) };
    }
  });
};
