/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator } from "@fastify/passport";
import { requestContext } from "@fastify/request-context";
import fastifySession from "@fastify/session";
import { FastifyRequest } from "fastify";
import LdapStrategy from "passport-ldapauth";
import { z } from "zod";

import { LdapGroupMapsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { LDAP_CONFIG_AUDIT_FIELDS, TLDAPConfig } from "@app/ee/services/ldap-config/ldap-config-types";
import {
  isValidLdapFilter,
  sanitizeLdapConfigAuditFields,
  searchGroups
} from "@app/ee/services/ldap-config/ldap-fns";
import { ApiDocsTags, LdapSso } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { pick } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedLdapConfigSchema } from "@app/server/routes/sanitizedSchema/directory-config";
import { AuthMode, ProviderAuthResult } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { resolveAssertedProfileName } from "@app/services/user-alias/user-alias-fns";

export const registerLdapRouter = async (
  server: FastifyZodProvider,
  { isLegacyPath = false }: { isLegacyPath?: boolean } = {}
) => {
  const describeRoute = (description: string) =>
    isLegacyPath ? `Deprecated: use /api/v1/sso/ldap/config instead. ${description}` : description;

  const appCfg = getConfig();
  const passport = new Authenticator({ key: "ldap", userProperty: "passportUser" });
  await server.register(fastifySession, { secret: server.cookieSigningKey });
  await server.register(passport.initialize());
  await server.register(passport.secureSession());

  const getLdapPassportOpts = (req: FastifyRequest, done: any) => {
    const { organizationSlug } = req.body as {
      organizationSlug: string;
    };

    process.nextTick(async () => {
      try {
        const { opts, ldapConfig } = await server.services.ldap.bootLdap(organizationSlug);
        req.ldapConfig = ldapConfig;
        done(null, opts);
      } catch (err) {
        done(err);
      }
    });
  };

  passport.use(
    new LdapStrategy(
      getLdapPassportOpts as any,
      // eslint-disable-next-line
      async (req, user, cb) => {
        try {
          if (!user.mail) throw new BadRequestError({ message: "Invalid request. Missing mail attribute on user." });
          const fastifyReq = req as unknown as FastifyRequest;
          const ldapConfig = (req as unknown as FastifyRequest).ldapConfig as TLDAPConfig;

          let groups: { dn: string; cn: string }[] | undefined;
          if (ldapConfig.groupSearchBase) {
            const groupFilter = "(|(memberUid={{.Username}})(member={{.UserDN}})(uniqueMember={{.UserDN}}))";
            const groupSearchFilter = (ldapConfig.groupSearchFilter || groupFilter)
              .replaceAll("{{.Username}}", user.uid)
              .replaceAll("{{.UserDN}}", user.dn);

            if (!isValidLdapFilter(groupSearchFilter)) {
              throw new Error("Generated LDAP search filter is invalid.");
            }

            groups = await searchGroups(ldapConfig, groupSearchFilter, ldapConfig.groupSearchBase);
          }

          const externalId = ldapConfig.uniqueUserAttribute ? user[ldapConfig.uniqueUserAttribute] : user.uidNumber;
          const username = ldapConfig.uniqueUserAttribute ? externalId : user.uid;

          const callbackPort =
            typeof fastifyReq?.body === "object"
              ? (fastifyReq.body as { callbackPort?: number })?.callbackPort
              : undefined;

          const assertedName = resolveAssertedProfileName({
            givenName: user.givenName,
            familyName: user.sn,
            displayName: user.cn
          });

          const loginResult = await server.services.ldap.ldapLogin({
            externalId,
            username,
            ldapConfigId: ldapConfig.id,
            firstName: assertedName?.firstName ?? "",
            lastName: assertedName?.lastName ?? "",
            email: user.mail,
            groups,
            ip: requestContext.get("ip") || "",
            userAgent: requestContext.get("userAgent") || "",
            callbackPort: callbackPort || undefined,
            orgId: (req as unknown as FastifyRequest).ldapConfig.organization
          });

          return cb(null, loginResult);
        } catch (error) {
          logger.error(error);
          return cb(error, false);
        }
      }
    )
  );

  server.route({
    url: "/login",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      ...(isLegacyPath ? {} : { operationId: "loginWithLdapSso" }),
      body: z.object({
        organizationSlug: z.string().trim(),
        callbackPort: z.coerce.number().optional()
      })
    },
    preValidation: passport.authenticate("ldapauth", {
      session: false
      // failureFlash: true,
      // failureRedirect: "/login/provider/error"
      // this is due to zod type difference
    }) as any,
    handler: (req, res) => {
      const passportResult = req.passportUser;
      const cbPort = passportResult.callbackPort;
      let nextUrl;

      if (passportResult.result === ProviderAuthResult.SESSION) {
        void res.setCookie("jid", passportResult.tokens.refresh, {
          httpOnly: true,
          path: "/api",
          sameSite: "strict",
          secure: appCfg.HTTPS_ENABLED
        });
        const sessionUrl = new URL("/login/select-organization", appCfg.SITE_URL);
        if (cbPort) sessionUrl.searchParams.set("callback_port", String(cbPort));
        nextUrl = sessionUrl.toString();
      } else if (passportResult.result === ProviderAuthResult.SIGNUP_REQUIRED) {
        const signupUrl = new URL("/signup/sso", appCfg.SITE_URL);
        signupUrl.searchParams.set("token", passportResult.signupToken);
        if (cbPort) signupUrl.searchParams.set("callback_port", String(cbPort));
        nextUrl = signupUrl.toString();
      } else {
        throw new BadRequestError({ message: "Unexpected auth result" });
      }

      return res.status(200).send({ nextUrl });
    }
  });

  server.route({
    method: "GET",
    url: "/config",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      ...(isLegacyPath ? {} : { operationId: "getLdapConfig" }),
      hide: false,
      tags: [ApiDocsTags.LdapSso],
      description: describeRoute("Get LDAP config"),
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: z.object({
          id: z.string(),
          organization: z.string(),
          isActive: z.boolean(),
          url: z.string(),
          bindDN: z.string(),
          bindPass: z.string(),
          uniqueUserAttribute: z.string(),
          searchBase: z.string(),
          searchFilter: z.string(),
          groupSearchBase: z.string(),
          groupSearchFilter: z.string(),
          caCert: z.string(),
          clientCertificate: z.string(),
          hasClientKeyCertificate: z.boolean()
        })
      }
    },
    handler: async (req) => {
      const ldap = await server.services.ldap.getLdapCfgWithPermissionCheck({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });
      return ldap;
    }
  });

  server.route({
    method: "POST",
    url: "/config",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      ...(isLegacyPath ? {} : { operationId: "createLdapConfig" }),
      hide: false,
      tags: [ApiDocsTags.LdapSso],
      description: describeRoute("Create LDAP config"),
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        isActive: z.boolean().describe(LdapSso.CREATE_CONFIG.isActive),
        url: z.string().trim().describe(LdapSso.CREATE_CONFIG.url),
        bindDN: z.string().trim().describe(LdapSso.CREATE_CONFIG.bindDN),
        bindPass: z.string().trim().describe(LdapSso.CREATE_CONFIG.bindPass),
        uniqueUserAttribute: z.string().trim().default("uidNumber").describe(LdapSso.CREATE_CONFIG.uniqueUserAttribute),
        searchBase: z.string().trim().describe(LdapSso.CREATE_CONFIG.searchBase),
        searchFilter: z.string().trim().default("(uid={{username}})").describe(LdapSso.CREATE_CONFIG.searchFilter),
        groupSearchBase: z.string().trim().describe(LdapSso.CREATE_CONFIG.groupSearchBase),
        groupSearchFilter: z
          .string()
          .trim()
          .default("(|(memberUid={{.Username}})(member={{.UserDN}})(uniqueMember={{.UserDN}}))")
          .describe(LdapSso.CREATE_CONFIG.groupSearchFilter),
        caCert: z.string().trim().default("").describe(LdapSso.CREATE_CONFIG.caCert),
        clientCertificate: z.string().trim().default("").describe(LdapSso.CREATE_CONFIG.clientCertificate),
        clientKeyCertificate: z.string().trim().default("").describe(LdapSso.CREATE_CONFIG.clientKeyCertificate)
      }),
      response: {
        200: SanitizedLdapConfigSchema
      }
    },
    handler: async (req) => {
      const ldap = await server.services.ldap.createLdapCfg({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_LDAP_CONFIG,
          metadata: {
            ldapConfigId: ldap.id,
            organizationName: ldap.organizationName,
            ...sanitizeLdapConfigAuditFields(pick(req.body, [...LDAP_CONFIG_AUDIT_FIELDS]))
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SSOConfigured,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            provider: "ldap",
            action: "create",
            orgId: req.permission.orgId
          }
        })
        .catch((err) => logger.error(err, "Failed to send SSOConfigured telemetry event"));

      return ldap;
    }
  });

  server.route({
    url: "/config",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      ...(isLegacyPath ? {} : { operationId: "updateLdapConfig" }),
      hide: false,
      tags: [ApiDocsTags.LdapSso],
      description: describeRoute("Update LDAP config"),
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z
        .object({
          isActive: z.boolean().describe(LdapSso.UPDATE_CONFIG.isActive),
          url: z.string().trim().describe(LdapSso.UPDATE_CONFIG.url),
          bindDN: z.string().trim().describe(LdapSso.UPDATE_CONFIG.bindDN),
          bindPass: z.string().trim().describe(LdapSso.UPDATE_CONFIG.bindPass),
          uniqueUserAttribute: z.string().trim().describe(LdapSso.UPDATE_CONFIG.uniqueUserAttribute),
          searchBase: z.string().trim().describe(LdapSso.UPDATE_CONFIG.searchBase),
          searchFilter: z.string().trim().describe(LdapSso.UPDATE_CONFIG.searchFilter),
          groupSearchBase: z.string().trim().describe(LdapSso.UPDATE_CONFIG.groupSearchBase),
          groupSearchFilter: z.string().trim().describe(LdapSso.UPDATE_CONFIG.groupSearchFilter),
          caCert: z.string().trim().describe(LdapSso.UPDATE_CONFIG.caCert),
          clientCertificate: z.string().trim().describe(LdapSso.UPDATE_CONFIG.clientCertificate),
          clientKeyCertificate: z.string().trim().describe(LdapSso.UPDATE_CONFIG.clientKeyCertificate)
        })
        .partial(),
      response: {
        200: SanitizedLdapConfigSchema
      }
    },
    handler: async (req) => {
      const ldap = await server.services.ldap.updateLdapCfg({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_LDAP_CONFIG,
          metadata: {
            ldapConfigId: ldap.id,
            organizationName: ldap.organizationName,
            ...sanitizeLdapConfigAuditFields(pick(req.body, [...LDAP_CONFIG_AUDIT_FIELDS])),
            bindPassUpdated: req.body.bindPass !== undefined,
            caCertUpdated: req.body.caCert !== undefined,
            clientCertificateUpdated:
              req.body.clientCertificate !== undefined || req.body.clientKeyCertificate !== undefined
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.SSOConfigured,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            provider: "ldap",
            action: "update",
            orgId: req.permission.orgId
          }
        })
        .catch((err) => logger.error(err, "Failed to send SSOConfigured telemetry event"));

      return ldap;
    }
  });

  if (!isLegacyPath) {
    server.route({
      method: "DELETE",
      url: "/config",
      config: {
        rateLimit: writeLimit
      },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
      schema: {
        operationId: "deleteLdapConfig",
        hide: false,
        tags: [ApiDocsTags.LdapSso],
        description: "Delete LDAP config",
        security: [
          {
            bearerAuth: []
          }
        ],
        response: {
          200: SanitizedLdapConfigSchema
        }
      },
      handler: async (req) => {
        const ldap = await server.services.ldap.deleteLdapCfg({
          actor: req.permission.type,
          actorId: req.permission.id,
          orgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId
        });

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          event: {
            type: EventType.DELETE_LDAP_CONFIG,
            metadata: {
              ldapConfigId: ldap.id,
              organizationName: ldap.organizationName
            }
          }
        });

        return ldap;
      }
    });
  }

  server.route({
    method: "GET",
    url: "/config/:configId/group-maps",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    schema: {
      ...(isLegacyPath ? {} : { operationId: "listLdapGroupMaps" }),
      hide: false,
      tags: [ApiDocsTags.LdapSso],
      security: [
        {
          bearerAuth: []
        }
      ],
      description: describeRoute("List LDAP group mappings"),
      params: z.object({
        configId: z.string().uuid().describe(LdapSso.GROUP_MAP.configId)
      }),
      response: {
        200: z.array(
          z.object({
            id: z.string().describe(LdapSso.GROUP_MAP.groupMapId),
            ldapConfigId: z.string().describe(LdapSso.GROUP_MAP.ldapConfigId),
            ldapGroupCN: z.string().describe(LdapSso.GROUP_MAP.ldapGroupCN),
            group: z
              .object({
                id: z.string(),
                name: z.string(),
                slug: z.string()
              })
              .describe(LdapSso.GROUP_MAP.group)
          })
        )
      }
    },
    handler: async (req) => {
      const ldapGroupMaps = await server.services.ldap.getLdapGroupMaps({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ldapConfigId: req.params.configId
      });
      return ldapGroupMaps;
    }
  });

  server.route({
    method: "POST",
    url: "/config/:configId/group-maps",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      ...(isLegacyPath ? {} : { operationId: "createLdapGroupMap" }),
      hide: false,
      tags: [ApiDocsTags.LdapSso],
      security: [
        {
          bearerAuth: []
        }
      ],
      description: describeRoute("Create LDAP group mapping"),
      params: z.object({
        configId: z.string().uuid().describe(LdapSso.GROUP_MAP.configId)
      }),
      body: z.object({
        ldapGroupCN: z.string().trim().min(1).describe(LdapSso.GROUP_MAP.ldapGroupCN),
        groupSlug: z.string().trim().min(1).describe(LdapSso.GROUP_MAP.groupSlug)
      }),
      response: {
        200: LdapGroupMapsSchema
      }
    },
    handler: async (req) => {
      const ldapGroupMap = await server.services.ldap.createLdapGroupMap({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ldapConfigId: req.params.configId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.CREATE_LDAP_GROUP_MAP,
          metadata: {
            ldapConfigId: ldapGroupMap.ldapConfigId,
            ldapGroupMapId: ldapGroupMap.id,
            ldapGroupCN: ldapGroupMap.ldapGroupCN,
            groupSlug: ldapGroupMap.groupSlug
          }
        }
      });

      return ldapGroupMap;
    }
  });

  server.route({
    method: "DELETE",
    url: "/config/:configId/group-maps/:groupMapId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      ...(isLegacyPath ? {} : { operationId: "deleteLdapGroupMap" }),
      hide: false,
      tags: [ApiDocsTags.LdapSso],
      security: [
        {
          bearerAuth: []
        }
      ],
      description: describeRoute("Delete LDAP group mapping"),
      params: z.object({
        configId: z.string().uuid().describe(LdapSso.GROUP_MAP.configId),
        groupMapId: z.string().uuid().describe(LdapSso.GROUP_MAP.groupMapId)
      }),
      response: {
        200: LdapGroupMapsSchema
      }
    },
    handler: async (req) => {
      const ldapGroupMap = await server.services.ldap.deleteLdapGroupMap({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ldapConfigId: req.params.configId,
        ldapGroupMapId: req.params.groupMapId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.DELETE_LDAP_GROUP_MAP,
          metadata: {
            ldapConfigId: ldapGroupMap.ldapConfigId,
            ldapGroupMapId: ldapGroupMap.id,
            ldapGroupCN: ldapGroupMap.ldapGroupCN,
            groupSlug: ldapGroupMap.groupSlug
          }
        }
      });

      return ldapGroupMap;
    }
  });

  server.route({
    method: "POST",
    url: "/config/test-connection",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      ...(isLegacyPath ? {} : { operationId: "testLdapConnection" }),
      body: z.object({
        url: z.string().trim(),
        bindDN: z.string().trim(),
        bindPass: z.string().trim(),
        caCert: z.string().trim(),
        clientCertificate: z.string().trim().default(""),
        clientKeyCertificate: z.string().trim().default("")
      }),
      response: {
        200: z.boolean()
      }
    },
    handler: async (req) => {
      const result = await server.services.ldap.testLDAPConnection({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return result;
    }
  });
};
