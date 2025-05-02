import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { loginMappingSchema, sanitizedSshHost } from "@app/ee/services/ssh-host/ssh-host-schema";
import { sanitizedSshHostGroup } from "@app/ee/services/ssh-host-group/ssh-host-group-schema";
import { EHostGroupMembershipFilter } from "@app/ee/services/ssh-host-group/ssh-host-group-types";
import { ApiDocsTags, SSH_HOST_GROUPS } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSshHostGroupRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:sshHostGroupId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshHostGroups],
      description: "Get SSH Host Group",
      params: z.object({
        sshHostGroupId: z.string().describe(SSH_HOST_GROUPS.GET.sshHostGroupId)
      }),
      response: {
        200: sanitizedSshHostGroup.extend({
          loginMappings: z.array(loginMappingSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sshHostGroup = await server.services.sshHostGroup.getSshHostGroup({
        sshHostGroupId: req.params.sshHostGroupId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshHostGroup.projectId,
        event: {
          type: EventType.GET_SSH_HOST_GROUP,
          metadata: {
            sshHostGroupId: sshHostGroup.id,
            name: sshHostGroup.name
          }
        }
      });

      return sshHostGroup;
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshHostGroups],
      description: "Create SSH Host Group",
      body: z.object({
        projectId: z.string().describe(SSH_HOST_GROUPS.CREATE.projectId),
        name: slugSchema({ min: 1, max: 64, field: "name" }).describe(SSH_HOST_GROUPS.CREATE.name),
        loginMappings: z.array(loginMappingSchema).default([]).describe(SSH_HOST_GROUPS.CREATE.loginMappings)
      }),
      response: {
        200: sanitizedSshHostGroup.extend({
          loginMappings: z.array(loginMappingSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sshHostGroup = await server.services.sshHostGroup.createSshHostGroup({
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshHostGroup.projectId,
        event: {
          type: EventType.CREATE_SSH_HOST_GROUP,
          metadata: {
            sshHostGroupId: sshHostGroup.id,
            name: sshHostGroup.name,
            loginMappings: sshHostGroup.loginMappings
          }
        }
      });

      return sshHostGroup;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:sshHostGroupId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshHostGroups],
      description: "Update SSH Host Group",
      params: z.object({
        sshHostGroupId: z.string().trim().describe(SSH_HOST_GROUPS.UPDATE.sshHostGroupId)
      }),
      body: z.object({
        name: slugSchema({ min: 1, max: 64, field: "name" }).describe(SSH_HOST_GROUPS.UPDATE.name).optional(),
        loginMappings: z.array(loginMappingSchema).optional().describe(SSH_HOST_GROUPS.UPDATE.loginMappings)
      }),
      response: {
        200: sanitizedSshHostGroup.extend({
          loginMappings: z.array(loginMappingSchema)
        })
      }
    },
    handler: async (req) => {
      const sshHostGroup = await server.services.sshHostGroup.updateSshHostGroup({
        sshHostGroupId: req.params.sshHostGroupId,
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshHostGroup.projectId,
        event: {
          type: EventType.UPDATE_SSH_HOST_GROUP,
          metadata: {
            sshHostGroupId: sshHostGroup.id,
            name: sshHostGroup.name,
            loginMappings: sshHostGroup.loginMappings
          }
        }
      });

      return sshHostGroup;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sshHostGroupId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshHostGroups],
      description: "Delete SSH Host Group",
      params: z.object({
        sshHostGroupId: z.string().describe(SSH_HOST_GROUPS.DELETE.sshHostGroupId)
      }),
      response: {
        200: sanitizedSshHostGroup.extend({
          loginMappings: z.array(loginMappingSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const sshHostGroup = await server.services.sshHostGroup.deleteSshHostGroup({
        sshHostGroupId: req.params.sshHostGroupId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshHostGroup.projectId,
        event: {
          type: EventType.DELETE_SSH_HOST_GROUP,
          metadata: {
            sshHostGroupId: sshHostGroup.id,
            name: sshHostGroup.name
          }
        }
      });

      return sshHostGroup;
    }
  });

  server.route({
    method: "GET",
    url: "/:sshHostGroupId/hosts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshHostGroups],
      description: "Get SSH Hosts in a Host Group",
      params: z.object({
        sshHostGroupId: z.string().describe(SSH_HOST_GROUPS.GET.sshHostGroupId)
      }),
      querystring: z.object({
        filter: z.nativeEnum(EHostGroupMembershipFilter).optional().describe(SSH_HOST_GROUPS.GET.filter)
      }),
      response: {
        200: z.object({
          hosts: sanitizedSshHost
            .pick({
              id: true,
              hostname: true,
              alias: true
            })
            .merge(
              z.object({
                isPartOfGroup: z.boolean(),
                joinedGroupAt: z.date().nullable()
              })
            )
            .array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { sshHostGroup, hosts, totalCount } = await server.services.sshHostGroup.listSshHostGroupHosts({
        sshHostGroupId: req.params.sshHostGroupId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshHostGroup.projectId,
        event: {
          type: EventType.GET_SSH_HOST_GROUP_HOSTS,
          metadata: {
            sshHostGroupId: req.params.sshHostGroupId,
            name: sshHostGroup.name
          }
        }
      });

      return { hosts, totalCount };
    }
  });

  server.route({
    method: "POST",
    url: "/:sshHostGroupId/hosts/:hostId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshHostGroups],
      description: "Add an SSH Host to a Host Group",
      params: z.object({
        sshHostGroupId: z.string().describe(SSH_HOST_GROUPS.ADD_HOST.sshHostGroupId),
        hostId: z.string().describe(SSH_HOST_GROUPS.ADD_HOST.hostId)
      }),
      response: {
        200: sanitizedSshHost.extend({
          loginMappings: z.array(loginMappingSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { sshHostGroup, sshHost } = await server.services.sshHostGroup.addHostToSshHostGroup({
        sshHostGroupId: req.params.sshHostGroupId,
        hostId: req.params.hostId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshHost.projectId,
        event: {
          type: EventType.ADD_HOST_TO_SSH_HOST_GROUP,
          metadata: {
            sshHostGroupId: sshHostGroup.id,
            sshHostId: sshHost.id,
            hostname: sshHost.hostname
          }
        }
      });

      return sshHost;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sshHostGroupId/hosts/:hostId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.SshHostGroups],
      description: "Remove an SSH Host from a Host Group",
      params: z.object({
        sshHostGroupId: z.string().describe(SSH_HOST_GROUPS.DELETE_HOST.sshHostGroupId),
        hostId: z.string().describe(SSH_HOST_GROUPS.DELETE_HOST.hostId)
      }),
      response: {
        200: sanitizedSshHost.extend({
          loginMappings: z.array(loginMappingSchema)
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { sshHostGroup, sshHost } = await server.services.sshHostGroup.removeHostFromSshHostGroup({
        sshHostGroupId: req.params.sshHostGroupId,
        hostId: req.params.hostId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: sshHost.projectId,
        event: {
          type: EventType.REMOVE_HOST_FROM_SSH_HOST_GROUP,
          metadata: {
            sshHostGroupId: sshHostGroup.id,
            sshHostId: sshHost.id,
            hostname: sshHost.hostname
          }
        }
      });

      return sshHost;
    }
  });
};
