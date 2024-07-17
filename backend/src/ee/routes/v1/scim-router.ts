import { z } from "zod";

import { ScimTokensSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
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
    config: {
      rateLimit: writeLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        description: req.body.description,
        ttlDays: req.body.ttlDays
      });

      return { scimToken };
    }
  });

  server.route({
    url: "/scim-tokens",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.query.organizationId
      });

      return { scimTokens };
    }
  });

  server.route({
    url: "/scim-tokens/:scimTokenId",
    method: "DELETE",
    config: {
      rateLimit: writeLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
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
                  value: z.string(),
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
        startIndex: req.query.startIndex,
        limit: req.query.count,
        filter: req.query.filter,
        orgId: req.permission.orgId
      });
      return users;
    }
  });

  server.route({
    url: "/Users/:orgMembershipId",
    method: "GET",
    schema: {
      params: z.object({
        orgMembershipId: z.string().trim()
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
              value: z.string(),
              type: z.string().trim()
            })
          ),
          displayName: z.string().trim(),
          active: z.boolean(),
          groups: z.array(
            z.object({
              value: z.string().trim(),
              display: z.string().trim()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const user = await req.server.services.scim.getScimUser({
        orgMembershipId: req.params.orgMembershipId,
        orgId: req.permission.orgId
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
        userName: z.string().trim(),
        name: z.object({
          familyName: z.string().trim(),
          givenName: z.string().trim()
        }),
        emails: z
          .array(
            z.object({
              primary: z.boolean(),
              value: z.string().email(),
              type: z.string().trim()
            })
          )
          .optional(),
        // displayName: z.string().trim(),
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
      const primaryEmail = req.body.emails?.find((email) => email.primary)?.value;

      const user = await req.server.services.scim.createScimUser({
        externalId: req.body.userName,
        email: primaryEmail,
        firstName: req.body.name.givenName,
        lastName: req.body.name.familyName,
        orgId: req.permission.orgId
      });

      return user;
    }
  });

  server.route({
    url: "/Users/:orgMembershipId",
    method: "DELETE",
    schema: {
      params: z.object({
        orgMembershipId: z.string().trim()
      }),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const user = await req.server.services.scim.deleteScimUser({
        orgMembershipId: req.params.orgMembershipId,
        orgId: req.permission.orgId
      });

      return user;
    }
  });

  server.route({
    url: "/Groups",
    method: "POST",
    schema: {
      body: z.object({
        schemas: z.array(z.string()),
        displayName: z.string().trim(),
        members: z
          .array(
            z.object({
              value: z.string(),
              display: z.string()
            })
          )
          .optional() // okta-specific
      }),
      response: {
        200: z.object({
          schemas: z.array(z.string()),
          id: z.string().trim(),
          displayName: z.string().trim(),
          members: z
            .array(
              z.object({
                value: z.string(),
                display: z.string()
              })
            )
            .optional(),
          meta: z.object({
            resourceType: z.string().trim()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const group = await req.server.services.scim.createScimGroup({
        orgId: req.permission.orgId,
        ...req.body
      });

      return group;
    }
  });

  server.route({
    url: "/Groups",
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
              schemas: z.array(z.string()),
              id: z.string().trim(),
              displayName: z.string().trim(),
              members: z.array(z.any()).length(0),
              meta: z.object({
                resourceType: z.string().trim()
              })
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
      const groups = await req.server.services.scim.listScimGroups({
        orgId: req.permission.orgId,
        startIndex: req.query.startIndex,
        filter: req.query.filter,
        limit: req.query.count
      });

      return groups;
    }
  });

  server.route({
    url: "/Groups/:groupId",
    method: "GET",
    schema: {
      params: z.object({
        groupId: z.string().trim()
      }),
      response: {
        200: z.object({
          schemas: z.array(z.string()),
          id: z.string().trim(),
          displayName: z.string().trim(),
          members: z.array(
            z.object({
              value: z.string(),
              display: z.string()
            })
          ),
          meta: z.object({
            resourceType: z.string().trim()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const group = await req.server.services.scim.getScimGroup({
        groupId: req.params.groupId,
        orgId: req.permission.orgId
      });
      return group;
    }
  });

  server.route({
    url: "/Groups/:groupId",
    method: "PUT",
    schema: {
      params: z.object({
        groupId: z.string().trim()
      }),
      body: z.object({
        schemas: z.array(z.string()),
        id: z.string().trim(),
        displayName: z.string().trim(),
        members: z.array(
          z.object({
            value: z.string(), // infisical orgMembershipId
            display: z.string()
          })
        )
      }),
      response: {
        200: z.object({
          schemas: z.array(z.string()),
          id: z.string().trim(),
          displayName: z.string().trim(),
          members: z.array(
            z.object({
              value: z.string(),
              display: z.string()
            })
          ),
          meta: z.object({
            resourceType: z.string().trim()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const group = await req.server.services.scim.updateScimGroupNamePut({
        groupId: req.params.groupId,
        orgId: req.permission.orgId,
        ...req.body
      });

      return group;
    }
  });

  server.route({
    url: "/Groups/:groupId",
    method: "PATCH",
    schema: {
      params: z.object({
        groupId: z.string().trim()
      }),
      body: z.object({
        schemas: z.array(z.string()),
        Operations: z.array(
          z.union([
            z.object({
              op: z.literal("replace"),
              value: z.object({
                id: z.string().trim(),
                displayName: z.string().trim()
              })
            }),
            z.object({
              op: z.literal("remove"),
              path: z.string().trim()
            }),
            z.object({
              op: z.literal("add"),
              path: z.string().trim(),
              value: z.array(
                z.object({
                  value: z.string().trim(),
                  display: z.string().trim().optional()
                })
              )
            })
          ])
        )
      }),
      response: {
        200: z.object({
          schemas: z.array(z.string()),
          id: z.string().trim(),
          displayName: z.string().trim(),
          members: z.array(
            z.object({
              value: z.string(),
              display: z.string()
            })
          ),
          meta: z.object({
            resourceType: z.string().trim()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const group = await req.server.services.scim.updateScimGroupNamePatch({
        groupId: req.params.groupId,
        orgId: req.permission.orgId,
        operations: req.body.Operations
      });

      return group;
    }
  });

  server.route({
    url: "/Groups/:groupId",
    method: "DELETE",
    schema: {
      params: z.object({
        groupId: z.string().trim()
      }),
      response: {
        200: z.object({})
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const group = await req.server.services.scim.deleteScimGroup({
        groupId: req.params.groupId,
        orgId: req.permission.orgId
      });

      return group;
    }
  });

  server.route({
    url: "/Users/:orgMembershipId",
    method: "PUT",
    schema: {
      params: z.object({
        orgMembershipId: z.string().trim()
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
          active: z.boolean(),
          groups: z.array(
            z.object({
              value: z.string().trim(),
              display: z.string().trim()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const user = await req.server.services.scim.replaceScimUser({
        orgMembershipId: req.params.orgMembershipId,
        orgId: req.permission.orgId,
        active: req.body.active
      });
      return user;
    }
  });
};
