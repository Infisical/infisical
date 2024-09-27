import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { INTEGRATION_AUTH } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { integrationAuthPubSchema } from "../sanitizedSchemas";

export const registerIntegrationAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/integration-options",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "List of integrations available.",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
          integrationOptions: z
            .object({
              name: z.string(),
              slug: z.string(),
              clientSlug: z.string().optional(),
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
    method: "GET",
    url: "/:integrationAuthId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Get details of an integration authorization by auth object id.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        integrationAuthId: z.string().trim().describe(INTEGRATION_AUTH.GET.integrationAuthId)
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId
      });
      return { integrationAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Remove all integration's auth object from the project.",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        integration: z.string().trim().describe(INTEGRATION_AUTH.DELETE.integration),
        projectId: z.string().trim().describe(INTEGRATION_AUTH.DELETE.projectId)
      }),
      response: {
        200: z.object({
          integrationAuth: integrationAuthPubSchema.array()
        })
      }
    },
    handler: async (req) => {
      const integrationAuth = await server.services.integrationAuth.deleteIntegrationAuths({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        integration: req.query.integration,
        projectId: req.query.projectId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.UNAUTHORIZE_INTEGRATION,
          metadata: {
            integration: req.query.integration
          }
        }
      });

      return { integrationAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:integrationAuthId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Remove an integration auth object by object id.",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        integrationAuthId: z.string().trim().describe(INTEGRATION_AUTH.DELETE_BY_ID.integrationAuthId)
      }),
      response: {
        200: z.object({
          integrationAuth: integrationAuthPubSchema
        })
      }
    },
    handler: async (req) => {
      const integrationAuth = await server.services.integrationAuth.deleteIntegrationAuthById({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: integrationAuth.projectId,
        event: {
          type: EventType.UNAUTHORIZE_INTEGRATION,
          metadata: {
            integration: integrationAuth.integration
          }
        }
      });

      return { integrationAuth };
    }
  });

  server.route({
    method: "POST",
    url: "/oauth-token",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        code: z.string().trim(),
        integration: z.string().trim(),
        url: z.string().trim().url().optional()
      }),
      response: {
        200: z.object({
          integrationAuth: integrationAuthPubSchema
        })
      }
    },
    handler: async (req) => {
      const integrationAuth = await server.services.integrationAuth.oauthExchange({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.body.workspaceId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.AUTHORIZE_INTEGRATION,
          metadata: {
            integration: integrationAuth.integration
          }
        }
      });
      return { integrationAuth };
    }
  });

  server.route({
    method: "POST",
    url: "/access-token",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Create the integration authentication object required for syncing secrets.",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        workspaceId: z.string().trim().describe(INTEGRATION_AUTH.CREATE_ACCESS_TOKEN.workspaceId),
        integration: z.string().trim().describe(INTEGRATION_AUTH.CREATE_ACCESS_TOKEN.integration),
        accessId: z.string().trim().optional().describe(INTEGRATION_AUTH.CREATE_ACCESS_TOKEN.accessId),
        accessToken: z.string().trim().optional().describe(INTEGRATION_AUTH.CREATE_ACCESS_TOKEN.accessToken),
        awsAssumeIamRoleArn: z
          .string()
          .url()
          .trim()
          .optional()
          .describe(INTEGRATION_AUTH.CREATE_ACCESS_TOKEN.awsAssumeIamRoleArn),
        url: z.string().url().trim().optional().describe(INTEGRATION_AUTH.CREATE_ACCESS_TOKEN.url),
        namespace: z.string().trim().optional().describe(INTEGRATION_AUTH.CREATE_ACCESS_TOKEN.namespace),
        refreshToken: z.string().trim().optional().describe(INTEGRATION_AUTH.CREATE_ACCESS_TOKEN.refreshToken)
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.body.workspaceId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
        event: {
          type: EventType.AUTHORIZE_INTEGRATION,
          metadata: {
            integration: integrationAuth.integration
          }
        }
      });
      return { integrationAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/apps",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        teamId: z.string().trim().optional(),
        azureDevOpsOrgName: z.string().trim().optional(),
        workspaceSlug: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          apps: z
            .object({
              name: z.string(),
              appId: z.coerce.string().optional(),
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        ...req.query
      });
      return { apps };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/teams",
    config: {
      rateLimit: readLimit
    },
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
              id: z.string()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const teams = await server.services.integrationAuth.getIntegrationAuthTeams({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId
      });
      return { teams };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/vercel/branches",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { branches };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/checkly/groups",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        accountId: req.query.accountId
      });
      return { groups };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/github/orgs",
    config: {
      rateLimit: readLimit
    },
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
      const orgs = await server.services.integrationAuth.getGithubOrgs({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        id: req.params.integrationAuthId
      });
      if (!orgs) throw new Error("No organization found.");

      return { orgs };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/github/envs",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        repoOwner: z.string().trim(),
        repoName: z.string().trim()
      }),
      response: {
        200: z.object({
          envs: z.object({ name: z.string(), envId: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const envs = await server.services.integrationAuth.getGithubEnvs({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        actorAuthMethod: req.permission.authMethod,
        repoName: req.query.repoName,
        repoOwner: req.query.repoOwner
      });
      if (!envs) throw new Error("No organization found.");

      return { envs };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/qovery/orgs",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId
      });
      return { orgs };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/aws-secrets-manager/kms-keys",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      querystring: z.object({
        region: z.string().trim()
      }),
      response: {
        200: z.object({
          kmsKeys: z.object({ id: z.string(), alias: z.string() }).array()
        })
      }
    },
    handler: async (req) => {
      const kmsKeys = await server.services.integrationAuth.getAwsKmsKeys({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        region: req.query.region
      });
      return { kmsKeys };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/qovery/projects",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        orgId: req.query.orgId
      });
      return { projects };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/qovery/environments",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        projectId: req.query.projectId
      });
      return { environments };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/qovery/apps",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        environmentId: req.query.environmentId
      });
      return { apps };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/qovery/containers",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        environmentId: req.query.environmentId
      });
      return { containers };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/qovery/jobs",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        environmentId: req.query.environmentId
      });
      return { jobs };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/heroku/pipelines",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        integrationAuthId: z.string().trim()
      }),
      response: {
        200: z.object({
          pipelines: z
            .object({
              app: z.object({ appId: z.string() }),
              stage: z.string(),
              pipeline: z.object({ name: z.string(), pipelineId: z.string() })
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const pipelines = await server.services.integrationAuth.getHerokuPipelines({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId
      });
      return { pipelines };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/railway/environments",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { environments };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/railway/services",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { services };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/bitbucket/workspaces",
    config: {
      rateLimit: readLimit
    },
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
              updated_on: z.string().optional()
            })
            .array()
        })
      }
    },
    handler: async (req) => {
      const workspaces = await server.services.integrationAuth.getBitbucketWorkspaces({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId
      });
      return { workspaces };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/northflank/secret-groups",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { secretGroups };
    }
  });

  server.route({
    method: "GET",
    url: "/:integrationAuthId/teamcity/build-configs",
    config: {
      rateLimit: readLimit
    },
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        id: req.params.integrationAuthId,
        appId: req.query.appId
      });
      return { buildConfigs };
    }
  });
};
