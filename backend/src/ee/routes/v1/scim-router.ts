import jwt from "jsonwebtoken";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode, AuthTokenType } from "@app/services/auth/auth-type";

export const registerScimRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "GET",
    schema: {
      params: z.object({}),
      response: {
        200: z.object({})
      }
    },
    // onRequest: verifyAuth([AuthMode.JWT]),
    handler: async () => {
      return {
        hello: "world"
      };
    }
  });

  server.route({
    url: "/Users",
    method: "GET",
    schema: {
      params: z.object({}),
      response: {
        200: z.object({})
      }
    },
    // onRequest: verifyAuth([]),
    handler: async () => {
      return {
        hello: "world"
      };
    }
  });

  server.route({
    url: "/tokens/organizations/:organizationId", // api/v1/scim/token/organizations/:organizationId
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      body: z.object({
        description: z.string().trim(),
        ttl: z.number().min(0).default(0)
      }),
      response: {
        200: z.object({
          scimToken: z.string().trim()
        })
      }
    },
    handler: async () => {
      // TODO: create SCIM token logic
      // TODO: create SCIM token controller

      const appCfg = getConfig();
      const scimToken = jwt.sign(
        {
          authTokenType: AuthTokenType.SCIM_TOKEN
        },
        appCfg.AUTH_SECRET,
        {
          // expiresIn: identityAccessToken.accessTokenMaxTTL === 0 ? undefined : identityAccessToken.accessTokenMaxTTL
        }
      ); // TODO: add expiration

      return { scimToken };
    }
  });

  server.route({
    url: "/tokens/organizations/:organizationId", // api/v1/scim/token/organizations/:organizationId
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          scimToken: z.string().trim()
        })
      }
    },
    handler: async () => {
      // TODO: put into service file

      const appCfg = getConfig();
      const scimToken = jwt.sign(
        {
          authTokenType: AuthTokenType.SCIM_TOKEN
        },
        appCfg.AUTH_SECRET,
        {
          // expiresIn: identityAccessToken.accessTokenMaxTTL === 0 ? undefined : identityAccessToken.accessTokenMaxTTL
        }
      ); // TODO: add expiration

      return { scimToken };
    }
  });
};
