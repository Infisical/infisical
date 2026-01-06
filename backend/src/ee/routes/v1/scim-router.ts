import { z } from "zod";

import { ScimEventsSchema, ScimTokensSchema } from "@app/db/schemas";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const ScimUserSchema = z.object({
  schemas: z.array(z.string()),
  id: z.string().trim(),
  userName: z.string().trim(),
  name: z
    .object({
      familyName: z.string().trim().optional(),
      givenName: z.string().trim().optional()
    })
    .optional(),
  emails: z
    .array(
      z.object({
        primary: z.boolean(),
        value: z.string().email(),
        type: z.string().trim().default("work")
      })
    )
    .optional(),
  displayName: z.string().trim(),
  active: z.boolean()
});

const ScimGroupSchema = z.object({
  schemas: z.array(z.string()),
  id: z.string().trim(),
  displayName: z.string().trim(),
  members: z
    .array(
      z.object({
        value: z.string(),
        display: z.string().optional()
      })
    )
    .optional(),
  meta: z.object({
    resourceType: z.string().trim()
  })
});

export const registerScimRouter = async (server: FastifyZodProvider) => {
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
        ttlDays: z.number().min(0).max(730).default(0)
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

  server.route({
    url: "/scim-events",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      querystring: z.object({
        fromDate: z.string().trim().optional(),
        limit: z.coerce.number().min(1).max(100).default(30).optional(),
        offset: z.coerce.number().min(0).default(0).optional()
      }),
      response: {
        200: z.object({
          scimEvents: z.array(ScimEventsSchema)
        })
      }
    },
    handler: async (req) => {
      const scimEvents = await server.services.scim.listScimEvents({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        orgId: req.permission.orgId,
        fromDate: req.query.fromDate,
        limit: req.query.limit,
        offset: req.query.offset
      });

      return { scimEvents };
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
          Resources: z.array(ScimUserSchema),
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
        200: ScimUserSchema
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
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        schemas: z.array(z.string()),
        userName: z.string().trim(),
        name: z
          .object({
            familyName: z.string().trim().optional(),
            givenName: z.string().trim().optional()
          })
          .optional(),
        emails: z
          .array(
            z.object({
              primary: z.boolean(),
              value: z.string().email()
            })
          )
          .optional(),
        active: z.boolean().default(true)
      }),
      response: {
        200: ScimUserSchema
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const primaryEmail = req.body.emails?.find((email) => email.primary)?.value;

      const user = await req.server.services.scim.createScimUser({
        externalId: req.body.userName,
        email: primaryEmail,
        firstName: req.body?.name?.givenName,
        lastName: req.body?.name?.familyName,
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
    url: "/Users/:orgMembershipId",
    method: "PUT",
    schema: {
      params: z.object({
        orgMembershipId: z.string().trim()
      }),
      body: z.object({
        schemas: z.array(z.string()),
        userName: z.string().trim(),
        name: z
          .object({
            familyName: z.string().trim().optional(),
            givenName: z.string().trim().optional()
          })
          .optional(),
        emails: z
          .array(
            z.object({
              primary: z.boolean(),
              value: z.string().email()
            })
          )
          .optional(),
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
              type: z.string().trim().default("work")
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
      const user = await req.server.services.scim.replaceScimUser({
        orgMembershipId: req.params.orgMembershipId,
        orgId: req.permission.orgId,
        firstName: req.body?.name?.givenName,
        lastName: req.body?.name?.familyName,
        active: req.body?.active,
        email: primaryEmail,
        externalId: req.body.userName
      });
      return user;
    }
  });

  server.route({
    url: "/Users/:orgMembershipId",
    method: "PATCH",
    schema: {
      params: z.object({
        orgMembershipId: z.string().trim()
      }),
      body: z.object({
        schemas: z.array(z.string()),
        Operations: z.array(
          z.union([
            z.object({
              op: z.union([z.literal("remove"), z.literal("Remove")]),
              path: z.string().trim(),
              value: z
                .object({
                  value: z.string()
                })
                .array()
                .optional()
            }),
            z.object({
              op: z.union([z.literal("add"), z.literal("Add"), z.literal("replace"), z.literal("Replace")]),
              path: z.string().trim().optional(),
              value: z.any().optional()
            })
          ])
        )
      }),
      response: {
        200: ScimUserSchema
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const user = await req.server.services.scim.updateScimUser({
        orgMembershipId: req.params.orgMembershipId,
        orgId: req.permission.orgId,
        operations: req.body.Operations
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
          .optional()
      }),
      response: {
        200: ScimGroupSchema
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
        filter: z.string().trim().optional(),
        excludedAttributes: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          Resources: z.array(ScimGroupSchema),
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
        limit: req.query.count,
        isMembersExcluded: req.query.excludedAttributes === "members"
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
        200: ScimGroupSchema
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
            value: z.string(),
            display: z.string()
          })
        )
      }),
      response: {
        200: ScimGroupSchema
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const group = await req.server.services.scim.replaceScimGroup({
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
              op: z.union([z.literal("remove"), z.literal("Remove")]),
              path: z.string().trim(),
              value: z
                .object({
                  value: z.string()
                })
                .array()
                .optional()
            }),
            z.object({
              op: z.union([z.literal("add"), z.literal("Add"), z.literal("replace"), z.literal("Replace")]),
              path: z.string().trim().optional(),
              value: z.any()
            })
          ])
        )
      }),
      response: {
        200: ScimGroupSchema
      }
    },
    onRequest: verifyAuth([AuthMode.SCIM_TOKEN]),
    handler: async (req) => {
      const group = await req.server.services.scim.updateScimGroup({
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
};
