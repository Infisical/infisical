import jwt from "jsonwebtoken";
import { z } from "zod";
import { ScimTokensSchema } from "@app/db/schemas";

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
      querystring: z.object({
        startIndex: z.coerce.number().default(1),
        count: z.coerce.number().default(20),
        filter: z.string().trim().optional()
      }),
      response: {
        200: z.object({ // TODO: audit the response
          Resources: z.array(z.object({
            id: z.string().trim(),
            userName: z.string().trim(),
            name: z.object({
              familyName: z.string().trim(),
              givenName: z.string().trim()
            }),
            emails: z.array(z.object({
              primary: z.boolean(),
              value: z.string().email(),
              type: z.string().trim()
            })),
            displayName: z.string().trim(),
            active: z.boolean()
          })),
          itemsPerPage: z.number(),
          schemas: z.array(z.string()),
          startIndex: z.number(),
          totalResults: z.number(),
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const res = await req.server.services.scim.listUsers({
        offset: req.query.startIndex,
        limit: req.query.count,
        filter: req.query.filter
      });
      return res;
    }
  });

  server.route({
    url: "/Users/:userId",
    method: "GET",
    schema: {
      params: z.object({
        userId: z.string().trim()
      }),
      response: {
        201: z.object({
          schemas: z.array(z.string()),
          id: z.string().trim(),
          userName: z.string().trim(),
          name: z.object({
            familyName: z.string().trim(),
            givenName: z.string().trim()
          }),
          emails: z.array(z.object({
            primary: z.boolean(),
            value: z.string().email(),
            type: z.string().trim()
          })),
          displayName: z.string().trim(),
          active: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const res = await req.server.services.scim.getUser(req.params.userId);
      return res;
    }
  });

  server.route({
    url: "/Users",
    method: "POST",
    schema: {
      body: z.object({
        schemas: z.array(z.string()),
        userName: z.string().trim(),
        name: z.object({
          familyName: z.string().trim(),
          givenName: z.string().trim()
        }),
        emails: z.array(z.object({
          primary: z.boolean(),
          value: z.string().email(),
          type: z.string().trim()
        })),
        displayName: z.string().trim(),
        // locale: z.string().trim(),
        // externalId: z.string().trim(),
        // groups: z.array(z.object({
        //   value: z.string().trim()
        // })),
        // password: z.string().trim(),
        active: z.boolean()
      }),
      response: {
        200: z.object({
          schemas: z.array(z.string()),
          id: z.string().trim(),
          userName: z.string().trim(),
          name: z.object({
            familyName: z.string().trim(),
            givenName: z.string().trim()
          }),
          emails: z.array(z.object({
            primary: z.boolean(),
            value: z.string().email(),
            type: z.string().trim()
          })),
          displayName: z.string().trim(),
          active: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req, reply) => {
      const user = await req.server.services.scim.createUser({
        email: req.body.emails[0].value,
        firstName: req.body.name.givenName,
        lastName: req.body.name.familyName,
        orgId: req.permission.orgId as string
      });

      reply.code(201);
      return user;
    }
  });

  server.route({
    url: "/Users/:userId",
    method: "PATCH",
    schema: {
      body: z.object({}),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      // TODO: update a user's attr
      return {};
    }
  });

  server.route({
    url: "/Users/:userId",
    method: "PUT",
    schema: {
      body: z.object({}),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      // TODO: update a user's profile
      return {};
    }
  });

  server.route({
    url: "/scim-tokens",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        organizationId: z.string().trim(),
        description: z.string().trim().default(""),
        ttl: z.number().min(0).default(0)
      }),
      response: {
        200: z.object({
          scimToken: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const { scimToken } = await server.services.scim.createScimToken({
        organizationId: req.body.organizationId,
        description: req.body.description,
        ttl: req.body.ttl
      });

      return { scimToken };
    }
  });

  server.route({
    url: "/scim-tokens",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      querystring: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          scimTokens: z.array(ScimTokensSchema)
        })
      }
    },
    handler: async (req) => {
      const scimTokens = await server.services.scim.getScimTokens(req.query.organizationId);
      return { scimTokens };
    }
  });

  server.route({
    url: "/scim-tokens/:scimTokenId",
    method: "DELETE",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        scimTokenId: z.string().trim()
      }),
      response: {
        200: z.object({
          scimToken: ScimTokensSchema
        })
      }
    },
    handler: async (req) => {
      const scimToken = await server.services.scim.deleteScimToken(req.params.scimTokenId);
      return { scimToken };
    }
  });
};
