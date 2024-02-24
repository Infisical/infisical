import { z } from "zod";

import { ScimTokensSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerScimRouter = async (server: FastifyZodProvider) => {
  server.addContentTypeParser("application/scim+json", { parseAs: "string" }, (_, body, done) => {
    try {
      const strBody = body instanceof Buffer ? body.toString() : body;

      const json: unknown = JSON.parse(strBody);
      done(null, json);
    } catch (err) {
      const error = err as Error;
      done(error, undefined);
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
        ttlDays: z.number().min(0).default(0)
      }),
      response: {
        200: z.object({
          scimToken: z.string().trim()
        })
      }
    },
    handler: async (req) => {
      const { scimToken } = await server.services.scim.createScimToken({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        orgId: req.body.organizationId,
        description: req.body.description,
        ttlDays: req.body.ttlDays
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
      const scimTokens = await server.services.scim.listScimTokens({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        orgId: req.query.organizationId
      });

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
      const scimToken = await server.services.scim.deleteScimToken({
        scimTokenId: req.params.scimTokenId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId
      });

      return { scimToken };
    }
  });

  // SCIM server endpoints
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
        200: z.object({
          Resources: z.array(
            z.object({
              id: z.string().trim(),
              userName: z.string().trim(),
              name: z.object({
                familyName: z.string().trim(),
                givenName: z.string().trim()
              }),
              emails: z.array(
                z.object({
                  primary: z.boolean(),
                  value: z.string().email(),
                  type: z.string().trim()
                })
              ),
              displayName: z.string().trim(),
              active: z.boolean()
            })
          ),
          itemsPerPage: z.number(),
          schemas: z.array(z.string()),
          startIndex: z.number(),
          totalResults: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const users = await req.server.services.scim.listScimUsers({
        offset: req.query.startIndex,
        limit: req.query.count,
        filter: req.query.filter,
        orgId: req.permission.orgId as string
      });
      return users;
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
          emails: z.array(
            z.object({
              primary: z.boolean(),
              value: z.string().email(),
              type: z.string().trim()
            })
          ),
          displayName: z.string().trim(),
          active: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const user = await req.server.services.scim.getScimUser({
        userId: req.params.userId,
        orgId: req.permission.orgId as string
      });
      return user;
    }
  });

  server.route({
    url: "/Users",
    method: "POST",
    schema: {
      body: z.object({
        schemas: z.array(z.string()),
        userName: z.string().trim().email(),
        name: z.object({
          familyName: z.string().trim(),
          givenName: z.string().trim()
        }),
        // emails: z.array( // optional?
        //   z.object({
        //     primary: z.boolean(),
        //     value: z.string().email(),
        //     type: z.string().trim()
        //   })
        // ),
        // displayName: z.string().trim(),
        active: z.boolean()
      }),
      response: {
        200: z.object({
          schemas: z.array(z.string()),
          id: z.string().trim(),
          userName: z.string().trim().email(),
          name: z.object({
            familyName: z.string().trim(),
            givenName: z.string().trim()
          }),
          emails: z.array(
            z.object({
              primary: z.boolean(),
              value: z.string().email(),
              type: z.string().trim()
            })
          ),
          displayName: z.string().trim(),
          active: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const user = await req.server.services.scim.createScimUser({
        email: req.body.userName,
        firstName: req.body.name.givenName,
        lastName: req.body.name.familyName,
        orgId: req.permission.orgId as string
      });

      return user;
    }
  });

  server.route({
    url: "/Users/:userId",
    method: "PATCH",
    schema: {
      params: z.object({
        userId: z.string().trim()
      }),
      body: z.object({
        schemas: z.array(z.string()),
        Operations: z.array(
          z.object({
            op: z.string().trim(),
            path: z.string().trim().optional(),
            value: z.union([
              z.object({
                active: z.boolean()
              }),
              z.string().trim()
            ])
          })
        )
      }),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const user = await req.server.services.scim.updateScimUser({
        userId: req.params.userId,
        orgId: req.permission.orgId as string,
        operations: req.body.Operations
      });
      return user;
    }
  });

  server.route({
    url: "/Users/:userId",
    method: "PUT",
    schema: {
      params: z.object({
        userId: z.string().trim()
      }),
      body: z.object({
        schemas: z.array(z.string()),
        id: z.string().trim(),
        userName: z.string().trim(),
        name: z.object({
          familyName: z.string().trim(),
          givenName: z.string().trim()
        }),
        displayName: z.string().trim(),
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
          emails: z.array(
            z.object({
              primary: z.boolean(),
              value: z.string().email(),
              type: z.string().trim()
            })
          ),
          displayName: z.string().trim(),
          active: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const user = await req.server.services.scim.replaceScimUser({
        userId: req.params.userId,
        orgId: req.permission.orgId as string,
        active: req.body.active
      });
      return user;
    }
  });
};
