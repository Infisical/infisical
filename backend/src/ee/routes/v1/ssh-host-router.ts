import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { sanitizedSshHost } from "@app/ee/services/ssh-host/ssh-host-schema";
import { isValidHostname } from "@app/ee/services/ssh-host/ssh-host-validators";
import { SSH_HOSTS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { publicSshCaLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerSshHostRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.array(
          sanitizedSshHost.extend({
            loginMappings: z.array(
              z.object({
                loginUser: z.string(),
                allowedPrincipals: z.array(z.string())
              })
            )
          })
        )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const hosts = await server.services.sshHost.listSshHosts({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      // TODO: consider adding audit log

      return hosts;
    }
  });

  server.route({
    method: "GET",
    url: "/:sshHostId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        sshHostId: z.string().describe(SSH_HOSTS.GET.sshHostId)
      }),
      response: {
        200: sanitizedSshHost.extend({
          loginMappings: z.array(
            z.object({
              loginUser: z.string(),
              allowedPrincipals: z.array(z.string())
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const host = await server.services.sshHost.getSshHost({
        sshHostId: req.params.sshHostId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: host.projectId,
        event: {
          type: EventType.GET_SSH_HOST,
          metadata: {
            sshHostId: host.id,
            hostname: host.hostname
          }
        }
      });

      return host;
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Add an SSH Host",
      body: z.object({
        projectId: z.string().describe(SSH_HOSTS.CREATE.projectId),
        hostname: z
          .string()
          .min(1)
          .refine((v) => isValidHostname(v), {
            message: "Hostname must be a valid hostname"
          })
          .describe(SSH_HOSTS.CREATE.hostname),
        userCertTtl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .default("8h")
          .describe(SSH_HOSTS.CREATE.userCertTtl),
        hostCertTtl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .default("1y")
          .describe(SSH_HOSTS.CREATE.hostCertTtl),
        loginMappings: z
          .object({
            loginUser: z.string().describe(SSH_HOSTS.CREATE.loginUser), // TODO: reinforce validation
            allowedPrincipals: z.array(z.string()).describe(SSH_HOSTS.CREATE.allowedPrincipals) // TODO: reinforce validation
          })
          .array()
          .default([])
          .describe(SSH_HOSTS.CREATE.loginMappings),
        userSshCaId: z.string().describe(SSH_HOSTS.CREATE.userSshCaId).optional(),
        hostSshCaId: z.string().describe(SSH_HOSTS.CREATE.hostSshCaId).optional()
      }),
      response: {
        200: sanitizedSshHost.extend({
          loginMappings: z.array(
            z.object({
              loginUser: z.string(),
              allowedPrincipals: z.array(z.string())
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const host = await server.services.sshHost.createSshHost({
        ...req.body,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: host.projectId,
        event: {
          type: EventType.CREATE_SSH_HOST,
          metadata: {
            sshHostId: host.id,
            hostname: host.hostname,
            userCertTtl: host.userCertTtl,
            hostCertTtl: host.hostCertTtl,
            loginMappings: host.loginMappings,
            userSshCaId: host.userSshCaId,
            hostSshCaId: host.hostSshCaId
          }
        }
      });

      return host;
    }
  });

  server.route({
    method: "PATCH",
    url: "/:sshHostId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Update SSH Host",
      params: z.object({
        sshHostId: z.string().trim().describe(SSH_HOSTS.UPDATE.sshHostId)
      }),
      body: z.object({
        hostname: z
          .string()
          .min(1)
          .refine((v) => isValidHostname(v), {
            message: "Hostname must be a valid hostname"
          })
          .optional()
          .describe(SSH_HOSTS.UPDATE.hostname),
        userCertTtl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
          .describe(SSH_HOSTS.UPDATE.userCertTtl),
        hostCertTtl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .optional()
          .describe(SSH_HOSTS.UPDATE.hostCertTtl),
        loginMappings: z
          .object({
            loginUser: z.string().describe(SSH_HOSTS.CREATE.loginUser),
            allowedPrincipals: z.array(z.string()).describe(SSH_HOSTS.CREATE.allowedPrincipals)
          })
          .array()
          .optional()
          .describe(SSH_HOSTS.CREATE.loginMappings)
      }),
      response: {
        200: sanitizedSshHost.extend({
          loginMappings: z.array(
            z.object({
              loginUser: z.string(),
              allowedPrincipals: z.array(z.string())
            })
          )
        })
      }
    },
    handler: async (req) => {
      const host = await server.services.sshHost.updateSshHost({
        sshHostId: req.params.sshHostId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: host.projectId,
        event: {
          type: EventType.UPDATE_SSH_HOST,
          metadata: {
            sshHostId: host.id,
            hostname: host.hostname,
            userCertTtl: host.userCertTtl,
            hostCertTtl: host.hostCertTtl,
            loginMappings: host.loginMappings,
            userSshCaId: host.userSshCaId,
            hostSshCaId: host.hostSshCaId
          }
        }
      });

      return host;
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sshHostId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        sshHostId: z.string().describe(SSH_HOSTS.DELETE.sshHostId)
      }),
      response: {
        200: sanitizedSshHost.extend({
          loginMappings: z.array(
            z.object({
              loginUser: z.string(),
              allowedPrincipals: z.array(z.string())
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const host = await server.services.sshHost.deleteSshHost({
        sshHostId: req.params.sshHostId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: host.projectId,
        event: {
          type: EventType.DELETE_SSH_HOST,
          metadata: {
            sshHostId: host.id,
            hostname: host.hostname
          }
        }
      });

      return host;
    }
  });

  server.route({
    method: "POST",
    url: "/:sshHostId/issue-user-cert",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Issue SSH certificate for user",
      params: z.object({
        sshHostId: z.string().describe(SSH_HOSTS.ISSUE_SSH_CREDENTIALS.sshHostId)
      }),
      body: z.object({
        loginUser: z.string().describe(SSH_HOSTS.ISSUE_SSH_CREDENTIALS.loginUser)
      }),
      response: {
        200: z.object({
          serialNumber: z.string().describe(SSH_HOSTS.ISSUE_SSH_CREDENTIALS.serialNumber),
          signedKey: z.string().describe(SSH_HOSTS.ISSUE_SSH_CREDENTIALS.signedKey),
          privateKey: z.string().describe(SSH_HOSTS.ISSUE_SSH_CREDENTIALS.privateKey),
          publicKey: z.string().describe(SSH_HOSTS.ISSUE_SSH_CREDENTIALS.publicKey),
          keyAlgorithm: z.nativeEnum(SshCertKeyAlgorithm).describe(SSH_HOSTS.ISSUE_SSH_CREDENTIALS.keyAlgorithm)
        })
      }
    },
    handler: async (req) => {
      const { serialNumber, signedPublicKey, privateKey, publicKey, keyAlgorithm, host, principals } =
        await server.services.sshHost.issueSshHostUserCert({
          sshHostId: req.params.sshHostId,
          loginUser: req.body.loginUser,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.ISSUE_SSH_HOST_USER_CERT,
          metadata: {
            sshHostId: req.params.sshHostId,
            hostname: host.hostname,
            loginUser: req.body.loginUser,
            principals,
            ttl: host.userCertTtl
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.IssueSshHostUserCert,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          sshHostId: req.params.sshHostId,
          hostname: host.hostname,
          principals,
          ...req.auditLogInfo
        }
      });

      return {
        serialNumber,
        signedKey: signedPublicKey,
        privateKey,
        publicKey,
        keyAlgorithm
      };
    }
  });

  server.route({
    method: "POST",
    url: "/:sshHostId/issue-host-cert",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Issue SSH certificate for host",
      params: z.object({
        sshHostId: z.string().describe(SSH_HOSTS.DELETE.sshHostId)
      }),
      body: z.object({
        publicKey: z.string().describe(SSH_HOSTS.ISSUE_HOST_CERT.publicKey)
      }),
      response: {
        200: z.object({
          serialNumber: z.string().describe(SSH_HOSTS.ISSUE_HOST_CERT.serialNumber),
          signedKey: z.string().describe(SSH_HOSTS.ISSUE_HOST_CERT.signedKey)
        })
      }
    },
    handler: async (req) => {
      const { host, principals, serialNumber, signedPublicKey } = await server.services.sshHost.issueSshHostHostCert({
        sshHostId: req.params.sshHostId,
        publicKey: req.body.publicKey,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.ISSUE_SSH_HOST_HOST_CERT,
          metadata: {
            sshHostId: req.params.sshHostId,
            hostname: host.hostname,
            principals,
            serialNumber,
            ttl: host.hostCertTtl
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.IssueSshHostHostCert,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          sshHostId: req.params.sshHostId,
          hostname: host.hostname,
          principals,
          ...req.auditLogInfo
        }
      });

      return {
        serialNumber,
        signedKey: signedPublicKey
      };
    }
  });

  server.route({
    method: "GET",
    url: "/:sshHostId/user-ca-public-key",
    config: {
      rateLimit: publicSshCaLimit
    },
    schema: {
      description: "Get public key of the user SSH CA linked to the host",
      params: z.object({
        sshHostId: z.string().trim().describe(SSH_HOSTS.GET_USER_CA_PUBLIC_KEY.sshHostId)
      }),
      response: {
        200: z.string()
      }
    },
    handler: async (req) => {
      const publicKey = await server.services.sshHost.getSshHostUserCaPk(req.params.sshHostId);
      return publicKey;
    }
  });
};
