import { z } from "zod";

import { SshCertKeyAlgorithm } from "@app/ee/services/ssh-certificate/ssh-certificate-types";
import { sanitizedSshHost } from "@app/ee/services/ssh-host/ssh-host-schema";
import { isValidHostname } from "@app/ee/services/ssh-host/ssh-host-validators";
import { SSH_HOSTS } from "@app/lib/api-docs";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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

      // TODO: audit log
      // await server.services.auditLog.createAuditLog({
      //   ...req.auditLogInfo,
      //   projectId: certificateTemplate.projectId,
      //   event: {
      //     type: EventType.GET_SSH_CERTIFICATE_TEMPLATE,
      //     metadata: {
      //       certificateTemplateId: certificateTemplate.id
      //     }
      //   }
      // });

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

      // TODO: audit log
      // await server.services.auditLog.createAuditLog({
      //   ...req.auditLogInfo,
      //   projectId: certificateTemplate.projectId,
      //   event: {
      //     type: EventType.GET_SSH_CERTIFICATE_TEMPLATE,
      //     metadata: {
      //       certificateTemplateId: certificateTemplate.id
      //     }
      //   }
      // });

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
      description: "Create SSH Host",
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

      // TODO: audit log
      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: ca.projectId,
      //     event: {
      //       type: EventType.CREATE_SSH_CERTIFICATE_TEMPLATE,
      //       metadata: {
      //         certificateTemplateId: certificateTemplate.id,
      //         sshCaId: ca.id,
      //         name: certificateTemplate.name,
      //         ttl: certificateTemplate.ttl,
      //         maxTTL: certificateTemplate.maxTTL,
      //         allowedUsers: certificateTemplate.allowedUsers,
      //         allowedHosts: certificateTemplate.allowedHosts,
      //         allowUserCertificates: certificateTemplate.allowUserCertificates,
      //         allowHostCertificates: certificateTemplate.allowHostCertificates,
      //         allowCustomKeyIds: certificateTemplate.allowCustomKeyIds
      //       }
      //     }
      //   });

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
          .describe(SSH_HOSTS.UPDATE.hostname),
        userCertTtl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .default("1h")
          .describe(SSH_HOSTS.UPDATE.userCertTtl),
        hostCertTtl: z
          .string()
          .refine((val) => ms(val) > 0, "TTL must be a positive number")
          .default("1y")
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

      // TODO: audit log
      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: ca.projectId,
      //     event: {
      //       type: EventType.UPDATE_SSH_CA,
      //       metadata: {
      //         sshCaId: ca.id,
      //         friendlyName: ca.friendlyName,
      //         status: ca.status as SshCaStatus
      //       }
      //     }
      //   });

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

      // TODO: audit log
      //   await server.services.auditLog.createAuditLog({
      //     ...req.auditLogInfo,
      //     projectId: certificateTemplate.projectId,
      //     event: {
      //       type: EventType.DELETE_SSH_CERTIFICATE_TEMPLATE,
      //       metadata: {
      //         certificateTemplateId: certificateTemplate.id
      //       }
      //     }
      //   });

      return host;
    }
  });

  server.route({
    method: "POST",
    url: "/:sshHostId/issue",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Issue SSH credentials (certificate + key)",
      params: z.object({
        sshHostId: z.string().describe(SSH_HOSTS.DELETE.sshHostId)
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
      const { serialNumber, signedPublicKey, privateKey, publicKey, keyAlgorithm } =
        await server.services.sshHost.issueSshCredsFromHost({
          sshHostId: req.params.sshHostId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

      // TODO: add audit log

      // await server.services.auditLog.createAuditLog({
      //   ...req.auditLogInfo,
      //   orgId: req.permission.orgId,
      //   event: {
      //     type: EventType.ISSUE_SSH_CREDS,
      //     metadata: {
      //       certificateTemplateId: certificateTemplate.id,
      //       keyAlgorithm: req.body.keyAlgorithm,
      //       certType: req.body.certType,
      //       principals: req.body.principals,
      //       ttl: String(ttl),
      //       keyId
      //     }
      //   }
      // });
      // await server.services.telemetry.sendPostHogEvents({
      //   event: PostHogEventTypes.IssueSshCreds,
      //   distinctId: getTelemetryDistinctId(req),
      //   properties: {
      //     certificateTemplateId: req.body.certificateTemplateId,
      //     principals: req.body.principals,
      //     ...req.auditLogInfo
      //   }
      // });

      return {
        serialNumber,
        signedKey: signedPublicKey,
        privateKey,
        publicKey,
        keyAlgorithm
      };
    }
  });
};
