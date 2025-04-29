import { z } from "zod";

import { sanitizedSshHost, loginMappingSchema } from "@app/ee/services/ssh-host/ssh-host-schema";
import { sanitizedSshHostGroup } from "@app/ee/services/ssh-host-group/ssh-host-group-schema";
import { SSH_HOST_GROUPS } from "@app/lib/api-docs";
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

      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: host.projectId,
      //     event: {
      //       type: EventType.GET_SSH_HOST,
      //       metadata: {
      //         sshHostId: host.id,
      //         hostname: host.hostname
      //       }
      //     }
      //   });

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
      description: "Create SSH Host Group",
      body: z.object({
        projectId: z.string().describe(SSH_HOST_GROUPS.CREATE.projectId),
        name: slugSchema({ min: 0, max: 64, field: "name" }).describe(SSH_HOST_GROUPS.CREATE.name),
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

      // TODO: audit logs
      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: host.projectId,
      //     event: {
      //       type: EventType.CREATE_SSH_HOST,
      //       metadata: {
      //         sshHostId: host.id,
      //         hostname: host.hostname,
      //         alias: host.alias ?? null,
      //         userCertTtl: host.userCertTtl,
      //         hostCertTtl: host.hostCertTtl,
      //         loginMappings: host.loginMappings,
      //         userSshCaId: host.userSshCaId,
      //         hostSshCaId: host.hostSshCaId
      //       }
      //     }
      //   });

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
      description: "Update SSH Host",
      params: z.object({
        sshHostGroupId: z.string().trim().describe(SSH_HOST_GROUPS.UPDATE.sshHostGroupId)
      }),
      body: z.object({
        name: slugSchema({ min: 0, max: 64, field: "name" }).describe(SSH_HOST_GROUPS.UPDATE.name).optional(),
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

      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: host.projectId,
      //     event: {
      //       type: EventType.UPDATE_SSH_HOST,
      //       metadata: {
      //         sshHostId: host.id,
      //         hostname: host.hostname,
      //         alias: host.alias,
      //         userCertTtl: host.userCertTtl,
      //         hostCertTtl: host.hostCertTtl,
      //         loginMappings: host.loginMappings,
      //         userSshCaId: host.userSshCaId,
      //         hostSshCaId: host.hostSshCaId
      //       }
      //     }
      //   });

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

      // TODO: audit log
      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: host.projectId,
      //     event: {
      //       type: EventType.DELETE_SSH_HOST,
      //       metadata: {
      //         sshHostId: host.id,
      //         hostname: host.hostname
      //       }
      //     }
      //   });

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
      params: z.object({
        sshHostGroupId: z.string().describe(SSH_HOST_GROUPS.GET.sshHostGroupId)
      }),
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0).describe(SSH_HOST_GROUPS.LIST_HOSTS.offset),
        limit: z.coerce.number().min(1).max(100).default(10).describe(SSH_HOST_GROUPS.LIST_HOSTS.limit)
      }),
      response: {
        200: z.object({
          hosts: z.array(sanitizedSshHost),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      console.log("list hosts in group pre");
      const { hosts, totalCount } = await server.services.sshHostGroup.listSshHostGroupHosts({
        sshHostGroupId: req.params.sshHostGroupId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });
      console.log("list hosts in group post");

      // TODO: audit logs
      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: host.projectId,
      //     event: {
      //       type: EventType.GET_SSH_HOST,
      //       metadata: {
      //         sshHostId: host.id,
      //         hostname: host.hostname
      //       }
      //     }
      //   });

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
      console.log("add host to group pre");

      const host = await server.services.sshHostGroup.addHostToSshHostGroup({
        sshHostGroupId: req.params.sshHostGroupId,
        hostId: req.params.hostId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      console.log("add host to group post");

      // TODO: audit logs
      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: host.projectId,
      //     event: {
      //       type: EventType.GET_SSH_HOST,
      //       metadata: {
      //         sshHostId: host.id,
      //         hostname: host.hostname
      //       }
      //     }
      //   });

      return host;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sshHostGroupId/hosts/:hostId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
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
      console.log("remove host from group pre");

      const host = await server.services.sshHostGroup.removeHostFromSshHostGroup({
        sshHostGroupId: req.params.sshHostGroupId,
        hostId: req.params.hostId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      console.log("remove host from group post");

      // TODO: audit logs
      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: host.projectId,
      //     event: {
      //       type: EventType.GET_SSH_HOST,
      //       metadata: {
      //         sshHostId: host.id,
      //         hostname: host.hostname
      //       }
      //     }
      //   });

      return host;
    }
  });
};
