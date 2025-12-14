import DOMPurify from "isomorphic-dompurify";
import { z } from "zod";

import {
  IdentitiesSchema,
  OrganizationsSchema,
  OrgMembershipsSchema,
  OrgMembershipStatus,
  SuperAdminSchema,
  UsersSchema
} from "@app/db/schemas";
import { getLicenseKeyConfig } from "@app/ee/services/license/license-fns";
import { LicenseType } from "@app/ee/services/license/license-types";
import { getConfig, overridableKeys } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { invalidateCacheLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { addAuthOriginDomainCookie } from "@app/server/lib/cookie";
import { GenericResourceNameSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifySuperAdmin } from "@app/server/plugins/auth/superAdmin";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { CacheType, LoginMethod } from "@app/services/super-admin/super-admin-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

export const registerAdminRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/config",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          config: SuperAdminSchema.omit({
            createdAt: true,
            updatedAt: true,
            encryptedSlackClientId: true,
            encryptedSlackClientSecret: true,
            encryptedMicrosoftTeamsAppId: true,
            encryptedMicrosoftTeamsClientSecret: true,
            encryptedMicrosoftTeamsBotId: true,
            encryptedGitHubAppConnectionClientId: true,
            encryptedGitHubAppConnectionClientSecret: true,
            encryptedGitHubAppConnectionSlug: true,
            encryptedGitHubAppConnectionId: true,
            encryptedGitHubAppConnectionPrivateKey: true,
            encryptedEnvOverrides: true
          }).extend({
            isMigrationModeOn: z.boolean(),
            defaultAuthOrgSlug: z.string().nullable(),
            defaultAuthOrgAuthEnforced: z.boolean().nullish(),
            defaultAuthOrgAuthMethod: z.string().nullish(),
            isSecretScanningDisabled: z.boolean(),
            kubernetesAutoFetchServiceAccountToken: z.boolean(),
            paramsFolderSecretDetectionEnabled: z.boolean(),
            isOfflineUsageReportsEnabled: z.boolean()
          })
        })
      }
    },
    handler: async () => {
      const config = await getServerCfg();
      const serverEnvs = getConfig();

      const licenseKeyConfig = getLicenseKeyConfig();
      const hasOfflineLicense = licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline;

      return {
        config: {
          ...config,
          fipsEnabled: crypto.isFipsModeEnabled(),
          isMigrationModeOn: serverEnvs.MAINTENANCE_MODE,
          isSecretScanningDisabled: serverEnvs.DISABLE_SECRET_SCANNING,
          kubernetesAutoFetchServiceAccountToken: serverEnvs.KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN,
          paramsFolderSecretDetectionEnabled: serverEnvs.PARAMS_FOLDER_SECRET_DETECTION_ENABLED,
          isOfflineUsageReportsEnabled: hasOfflineLicense
        }
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        allowSignUp: z.boolean().optional(),
        allowedSignUpDomain: z.string().optional().nullable(),
        trustSamlEmails: z.boolean().optional(),
        trustLdapEmails: z.boolean().optional(),
        trustOidcEmails: z.boolean().optional(),
        defaultAuthOrgId: z.string().optional().nullable(),
        enabledLoginMethods: z
          .nativeEnum(LoginMethod)
          .array()
          .optional()
          .refine((methods) => !methods || methods.length > 0, {
            message: "At least one login method should be enabled."
          }),
        slackClientId: z.string().optional(),
        slackClientSecret: z.string().optional(),
        microsoftTeamsAppId: z.string().optional(),
        microsoftTeamsClientSecret: z.string().optional(),
        microsoftTeamsBotId: z.string().optional(),
        gitHubAppConnectionClientId: z.string().optional(),
        gitHubAppConnectionClientSecret: z.string().optional(),
        gitHubAppConnectionSlug: z.string().optional(),
        gitHubAppConnectionId: z.string().optional(),
        gitHubAppConnectionPrivateKey: z.string().optional(),
        authConsentContent: z
          .string()
          .trim()
          .refine((content) => DOMPurify.sanitize(content) === content, {
            message: "Auth consent content contains unsafe HTML."
          })
          .optional(),
        pageFrameContent: z
          .string()
          .trim()
          .refine((content) => DOMPurify.sanitize(content) === content, {
            message: "Page frame content contains unsafe HTML."
          })
          .optional(),
        envOverrides: z.record(z.enum(Array.from(overridableKeys) as [string, ...string[]]), z.string()).optional()
      }),
      response: {
        200: z.object({
          config: SuperAdminSchema.omit({
            encryptedEnvOverrides: true
          }).extend({
            defaultAuthOrgSlug: z.string().nullable()
          })
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const config = await server.services.superAdmin.updateServerCfg(req.body, req.permission.id);
      return { config };
    }
  });

  server.route({
    method: "GET",
    url: "/user-management/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        searchTerm: z.string().default(""),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().max(100).default(20),
        // TODO: remove this once z.coerce.boolean() is supported
        adminsOnly: z
          .string()
          .transform((val) => val === "true")
          .default("false")
      }),
      response: {
        200: z.object({
          users: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true,
            superAdmin: true
          }).array(),
          total: z.number()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const result = await server.services.superAdmin.getUsers({
        ...req.query
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/organization-management/organizations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        searchTerm: z.string().default(""),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().max(100).default(20)
      }),
      response: {
        200: z.object({
          organizations: OrganizationsSchema.extend({
            members: z
              .object({
                user: z.object({
                  id: z.string(),
                  email: z.string().nullish(),
                  username: z.string(),
                  firstName: z.string().nullish(),
                  lastName: z.string().nullish()
                }),
                membershipId: z.string(),
                role: z.string(),
                roleId: z.string().nullish(),
                status: z.string().nullish()
              })
              .array(),
            projects: z
              .object({
                name: z.string(),
                id: z.string(),
                slug: z.string(),
                createdAt: z.date()
              })
              .array()
          }).array(),
          total: z.number()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const result = await server.services.superAdmin.getOrganizations({
        ...req.query
      });

      return result;
    }
  });

  server.route({
    method: "DELETE",
    url: "/organization-management/organizations/:organizationId/memberships/:membershipId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string(),
        membershipId: z.string()
      }),
      response: {
        200: z.object({
          organizationMembership: OrgMembershipsSchema
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const organizationMembership = await server.services.superAdmin.deleteOrganizationMembership(
        req.params.organizationId,
        req.params.membershipId,
        req.permission.id,
        req.permission.type
      );

      return {
        organizationMembership: {
          ...organizationMembership,
          status: organizationMembership?.status || OrgMembershipStatus.Accepted
        }
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/organization-management/organizations/:organizationId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string()
      }),
      response: {
        200: z.object({
          organization: OrganizationsSchema
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const organization = await server.services.superAdmin.deleteOrganization(req.params.organizationId);

      return {
        organization
      };
    }
  });

  server.route({
    method: "GET",
    url: "/identity-management/identities",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        searchTerm: z.string().default(""),
        offset: z.coerce.number().default(0),
        limit: z.coerce.number().max(100).default(20)
      }),
      response: {
        200: z.object({
          identities: IdentitiesSchema.pick({
            name: true,
            id: true
          })
            .extend({
              isInstanceAdmin: z.boolean()
            })
            .array(),
          total: z.number()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const result = await server.services.superAdmin.getIdentities({
        ...req.query
      });

      return result;
    }
  });

  server.route({
    method: "GET",
    url: "/integrations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          slack: z.object({
            clientId: z.string(),
            clientSecret: z.string(),
            govEnabled: z.boolean()
          }),
          microsoftTeams: z.object({
            appId: z.string(),
            clientSecret: z.string(),
            botId: z.string()
          }),
          gitHubAppConnection: z.object({
            clientId: z.string(),
            clientSecret: z.string(),
            appSlug: z.string(),
            appId: z.string(),
            privateKey: z.string()
          })
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async () => {
      const adminIntegrationsConfig = await server.services.superAdmin.getAdminIntegrationsConfig();

      return adminIntegrationsConfig;
    }
  });

  server.route({
    method: "GET",
    url: "/env-overrides",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.record(
          z.string(),
          z.object({
            name: z.string(),
            fields: z
              .object({
                key: z.string(),
                value: z.string(),
                hasEnvEntry: z.boolean(),
                description: z.string().optional()
              })
              .array()
          })
        )
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async () => {
      const envOverrides = await server.services.superAdmin.getEnvOverridesOrganized();
      return envOverrides;
    }
  });

  server.route({
    method: "DELETE",
    url: "/user-management/users/:userId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          users: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true
          })
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const users = await server.services.superAdmin.deleteUser(req.params.userId);

      return {
        users
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/user-management/users",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        userIds: z.string().array()
      }),
      response: {
        200: z.object({
          users: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true
          }).array()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const users = await server.services.superAdmin.deleteUsers(req.body.userIds);

      return {
        users
      };
    }
  });

  server.route({
    method: "PATCH",
    url: "/user-management/users/:userId/admin-access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        userId: z.string()
      })
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      await server.services.superAdmin.grantServerAdminAccessToUser(req.params.userId);
    }
  });

  server.route({
    method: "GET",
    url: "/encryption-strategies",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          strategies: z
            .object({
              strategy: z.nativeEnum(RootKeyEncryptionStrategy),
              enabled: z.boolean()
            })
            .array()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },

    handler: async () => {
      const encryptionDetails = await server.services.superAdmin.getConfiguredEncryptionStrategies();
      return encryptionDetails;
    }
  });

  server.route({
    method: "PATCH",
    url: "/encryption-strategies",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        strategy: z.nativeEnum(RootKeyEncryptionStrategy)
      })
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      await server.services.superAdmin.updateRootEncryptionStrategy(req.body.strategy);
    }
  });

  server.route({
    method: "POST",
    url: "/signup",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        email: z.string().email().trim(),
        password: z.string().trim(),
        firstName: z.string().trim(),
        lastName: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          message: z.string(),
          user: UsersSchema,
          organization: OrganizationsSchema,
          token: z.string(),
          new: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const appCfg = getConfig();
      const serverCfg = await getServerCfg();
      if (serverCfg.initialized) throw new BadRequestError({ message: "Admin account has already been set up" });
      const { user, token, organization } = await server.services.superAdmin.adminSignUp({
        ...req.body,
        ip: req.realIp,
        userAgent: req.headers["user-agent"] || ""
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.AdminInit,
        distinctId: user.user.username ?? "",
        properties: {
          username: user.user.username,
          email: user.user.email ?? "",
          lastName: user.user.lastName || "",
          firstName: user.user.firstName || ""
        }
      });

      void res.setCookie("jid", token.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      addAuthOriginDomainCookie(res);

      return {
        message: "Successfully set up admin account",
        user: user.user,
        token: token.access,
        organization,
        new: "123"
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/identity-management/identities/:identityId/super-admin-access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        identityId: z.string()
      }),
      response: {
        200: z.object({
          identity: IdentitiesSchema.pick({
            name: true,
            id: true
          })
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const identity = await server.services.superAdmin.deleteIdentitySuperAdminAccess(
        req.params.identityId,
        req.permission.id
      );

      return {
        identity
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/user-management/users/:userId/admin-access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          user: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true
          })
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const user = await server.services.superAdmin.deleteUserSuperAdminAccess(req.params.userId);

      return {
        user
      };
    }
  });

  server.route({
    method: "POST",
    url: "/bootstrap",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      body: z.object({
        email: z.string().email().trim().min(1),
        password: z.string().trim().min(1),
        organization: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          message: z.string(),
          user: UsersSchema.pick({
            username: true,
            firstName: true,
            lastName: true,
            email: true,
            id: true,
            superAdmin: true
          }),
          organization: OrganizationsSchema.pick({
            id: true,
            name: true,
            slug: true
          }),
          identity: IdentitiesSchema.pick({
            id: true,
            name: true
          }).extend({
            credentials: z.object({
              token: z.string()
            }) // would just be Token AUTH for now
          })
        })
      }
    },
    handler: async (req) => {
      const { user, organization, machineIdentity } = await server.services.superAdmin.bootstrapInstance({
        ...req.body,
        organizationName: req.body.organization
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.AdminInit,
        distinctId: user.user.username ?? "",
        properties: {
          username: user.user.username,
          email: user.user.email ?? "",
          lastName: user.user.lastName || "",
          firstName: user.user.firstName || ""
        }
      });

      return {
        message: "Successfully bootstrapped instance",
        user: user.user,
        organization,
        identity: machineIdentity
      };
    }
  });

  server.route({
    method: "POST",
    url: "/invalidate-cache",
    config: {
      rateLimit: invalidateCacheLimit
    },
    schema: {
      body: z.object({
        type: z.nativeEnum(CacheType)
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      await server.services.superAdmin.invalidateCache(req.body.type);

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.InvalidateCache,
        organizationId: req.permission.orgId,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          ...req.auditLogInfo
        }
      });

      return {
        message: "Cache invalidation job started"
      };
    }
  });

  server.route({
    method: "GET",
    url: "/invalidating-cache-status",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          invalidating: z.boolean()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async () => {
      const invalidating = await server.services.superAdmin.checkIfInvalidatingCache();

      return {
        invalidating
      };
    }
  });

  server.route({
    method: "POST",
    url: "/organization-management/organizations",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        name: GenericResourceNameSchema,
        inviteAdminEmails: z.string().email().array().min(1)
      }),
      response: {
        200: z.object({
          organization: OrganizationsSchema
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const organization = await server.services.superAdmin.createOrganization(req.body, req.permission);
      return { organization };
    }
  });

  server.route({
    method: "POST",
    url: "/organization-management/organizations/:organizationId/memberships/:membershipId/resend-invite",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string(),
        membershipId: z.string()
      }),
      response: {
        200: z.object({
          organizationMembership: OrgMembershipsSchema
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const organizationMembership = await server.services.superAdmin.resendOrgInvite(req.params, req.permission);

      return {
        organizationMembership: {
          ...organizationMembership,
          status: organizationMembership?.status || OrgMembershipStatus.Accepted
        }
      };
    }
  });

  server.route({
    method: "POST",
    url: "/organization-management/organizations/:organizationId/access",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        organizationId: z.string()
      }),
      response: {
        200: z.object({
          organizationMembership: OrgMembershipsSchema
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async (req) => {
      const organizationMembership = await server.services.superAdmin.joinOrganization(
        req.params.organizationId,
        req.permission
      );
      return {
        organizationMembership: {
          ...organizationMembership,
          status: organizationMembership?.status || OrgMembershipStatus.Accepted
        }
      };
    }
  });

  server.route({
    method: "POST",
    url: "/usage-report/generate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      response: {
        200: z.object({
          csvContent: z.string(),
          signature: z.string(),
          filename: z.string()
        })
      }
    },
    onRequest: (req, res, done) => {
      verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])(req, res, () => {
        verifySuperAdmin(req, res, done);
      });
    },
    handler: async () => {
      const result = await server.services.offlineUsageReport.generateUsageReportCSV();

      return {
        csvContent: result.csvContent,
        signature: result.signature,
        filename: result.filename
      };
    }
  });
};
