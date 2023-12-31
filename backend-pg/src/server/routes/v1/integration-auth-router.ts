import { z } from "zod";

import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { integrationAuthPubSchema } from "../sanitizedSchemas";

export const registerIntegrationAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/integration-options",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      response: {
        200: z.object({
          integrationOptions: z
            .object({
              name: z.string(),
              slug: z.string(),
              image: z.string(),
              isAvailable: z.boolean().optional(),
              type: z.string(),
              clientId: z.string().optional(),
              docsLink: z.string().optional()
            })
            .array()
        })
      }
    },
    handler: async () => {
      const integrationOptions = await server.services.integrationAuth.getIntegrationOptions();
      return { integrationOptions };
    }
  });

  server.route({
    url: "/:integrationAuthId",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      response: {
        200: z.object({
          integrationAuth: integrationAuthPubSchema
        })
      }
    },
    handler: async (req) => {
      const integrationAuth = await server.services.integrationAuth.getIntegrationAuth({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId
      });
      return { integrationAuth };
    }
  });

  server.route({
    url: "/:integrationAuthId",
    method: "DELETE",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      response: {
        200: z.object({
          integrationAuth: integrationAuthPubSchema
        })
      }
    },
    handler: async (req) => {
      const integrationAuth = await server.services.integrationAuth.deleteIntegrationAuth({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId
      });
      return { integrationAuth };
    }
  });

  server.route({
    url: "/oauth-token",
    method: "POST",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        integration: z.string().trim(),
        accessId: z.string().trim().optional(),
        accessToken: z.string().trim().optional(),
        url: z.string().url().trim().optional(),
        namespace: z.string().trim().optional(),
        refreshToken: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          integrationAuth: integrationAuthPubSchema
        })
      }
    },
    handler: async (req) => {
      const integrationAuth = await server.services.integrationAuth.saveIntegrationToken({
        actorId: req.permission.id,
        actor: req.permission.type,
        projectId: req.body.workspaceId,
        ...req.body
      });
      return { integrationAuth };
    }
  });

  server.route({
    url: "/:integrationAuthId/apps",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        teamId: z.string().trim().optional(),
        workspaceSlug: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          apps: z
            .object({
              name: z.string(),
              appId: z.string().optional(),
              owner: z.string().optional()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const apps = await server.services.integrationAuth.getIntegrationApps({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        ...req.query
      });
      return { apps };
    }
  });

  server.route({
    url: "/:integrationAuthId/teams",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      response: {
        200: z.object({
          teams: z
            .object({
              name: z.string(),
              id: z.string().optional()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const teams = await server.services.integrationAuth.getIntegrationAuthTeams({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId
      });
      return { teams };
    }
  });

  server.route({
    url: "/:integrationAuthId/vercel/branches",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        appId: z.string().trim()
      }),
      response: {
        200: z.object({
          branches: z.string().array()
        })
      }
    },
    handler: async (req) => {
      const branches = await server.services.integrationAuth.getVercelBranches({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { branches };
    }
  });

  server.route({
    url: "/:integrationAuthId/checkly/groups",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        accountId: z.string().trim()
      }),
      response: {
        200: z.object({
          groups: z.object({ name: z.string(), groupId: z.number() }).array()
        })
      }
    },
    handler: async (req) => {
      const groups = await server.services.integrationAuth.getChecklyGroups({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        accountId: req.query.accountId
      });
      return { groups };
    }
  });

  server.route({
    url: "/:integrationAuthId/qovery/orgs",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      response: {
        200: z.object({
          orgs: z.object({ name: z.string(), orgId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const orgs = await server.services.integrationAuth.getQoveryOrgs({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId
      });
      return { orgs };
    }
  });

  server.route({
    url: "/:integrationAuthId/qovery/projects",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        orgId: z.string().trim()
      }),
      response: {
        200: z.object({
          projects: z.object({ name: z.string(), projectId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const projects = await server.services.integrationAuth.getQoveryProjects({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        orgId: req.query.orgId
      });
      return { projects };
    }
  });

  server.route({
    url: "/:integrationAuthId/qovery/environments",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          environments: z.object({ name: z.string(), environmentId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const environments = await server.services.integrationAuth.getQoveryEnvs({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        projectId: req.query.projectId
      });
      return { environments };
    }
  });

  server.route({
    url: "/:integrationAuthId/qovery/apps",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        environmentId: z.string().trim()
      }),
      response: {
        200: z.object({
          apps: z.object({ name: z.string(), appId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const apps = await server.services.integrationAuth.getQoveryApps({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        environmentId: req.query.environmentId
      });
      return { apps };
    }
  });

  server.route({
    url: "/:integrationAuthId/qovery/containers",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        environmentId: z.string().trim()
      }),
      response: {
        200: z.object({
          containers: z.object({ name: z.string(), appId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const containers = await server.services.integrationAuth.getQoveryContainers({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        environmentId: req.query.environmentId
      });
      return { containers };
    }
  });

  server.route({
    url: "/:integrationAuthId/qovery/jobs",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        environmentId: z.string().trim()
      }),
      response: {
        200: z.object({
          jobs: z.object({ name: z.string(), appId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const jobs = await server.services.integrationAuth.getQoveryJobs({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        environmentId: req.query.environmentId
      });
      return { jobs };
    }
  });

  server.route({
    url: "/:integrationAuthId/railway/environments",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        appId: z.string().trim()
      }),
      response: {
        200: z.object({
          environments: z.object({ name: z.string(), environmentId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const environments = await server.services.integrationAuth.getRailwayEnvironments({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { environments };
    }
  });

  server.route({
    url: "/:integrationAuthId/railway/services",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        appId: z.string().trim()
      }),
      response: {
        200: z.object({
          services: z.object({ name: z.string(), serviceId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const services = await server.services.integrationAuth.getRailwayServices({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { services };
    }
  });

  server.route({
    url: "/:integrationAuthId/bitbucket/workspaces",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      response: {
        200: z.object({
          workspaces: z
            .object({
              name: z.string(),
              slug: z.string(),
              uuid: z.string(),
              type: z.string(),
              is_private: z.boolean(),
              created_on: z.string(),
              updated_on: z.string()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const workspaces = await server.services.integrationAuth.getBitbucketWorkspaces({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId
      });
      return { workspaces };
    }
  });

  server.route({
    url: "/:integrationAuthId/northflank/secret-groups",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        appId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretGroups: z
            .object({
              name: z.string(),
              groupId: z.string()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const secretGroups = await server.services.integrationAuth.getNorthFlankSecretGroups({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { secretGroups };
    }
  });

  server.route({
    url: "/:integrationAuthId/teamcity/build-configs",
    method: "GET",
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        appId: z.string().trim()
      }),
      response: {
        200: z.object({
          buildConfigs: z
            .object({
              name: z.string(),
              buildConfigId: z.string()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const buildConfigs = await server.services.integrationAuth.getTeamcityBuildConfigs({
        actorId: req.permission.id,
        actor: req.permission.type,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { buildConfigs };
    }
  });
};
