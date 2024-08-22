/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { IncomingMessage } from "node:http";

import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
import { FastifyRequest } from "fastify";
import LdapStrategy from "passport-ldapauth";
import { z } from "zod";

import { LdapConfigsSchema, LdapGroupMapsSchema } from "@app/db/schemas";
import { TLDAPConfig } from "@app/ee/services/ldap-config/ldap-config-types";
import { isValidLdapFilter, searchGroups } from "@app/ee/services/ldap-config/ldap-fns";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerLdapRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const passport = new Authenticator({ key: "ldap", userProperty: "passportUser" });
  await server.register(fastifySession, { secret: appCfg.COOKIE_SECRET_SIGN_KEY });
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
      async (req: IncomingMessage, user, cb) => {
        try {
          if (!user.mail) throw new BadRequestError({ message: "Invalid request. Missing mail attribute on user." });
          const ldapConfig = (req as unknown as FastifyRequest).ldapConfig as TLDAPConfig;

          let groups: { dn: string; cn: string }[] | undefined;
          if (ldapConfig.groupSearchBase) {
            const groupFilter = "(|(memberUid={{.Username}})(member={{.UserDN}})(uniqueMember={{.UserDN}}))";
            const groupSearchFilter = (ldapConfig.groupSearchFilter || groupFilter)
              .replace(/{{\.Username}}/g, user.uid)
              .replace(/{{\.UserDN}}/g, user.dn);

            if (!isValidLdapFilter(groupSearchFilter)) {
              throw new Error("Generated LDAP search filter is invalid.");
            }

            groups = await searchGroups(ldapConfig, groupSearchFilter, ldapConfig.groupSearchBase);
          }

          const externalId = ldapConfig.uniqueUserAttribute ? user[ldapConfig.uniqueUserAttribute] : user.uidNumber;
          const username = ldapConfig.uniqueUserAttribute ? externalId : user.uid;

          const { isUserCompleted, providerAuthToken } = await server.services.ldap.ldapLogin({
            externalId,
            username,
            ldapConfigId: ldapConfig.id,
            firstName: user.givenName ?? user.cn ?? "",
            lastName: user.sn ?? "",
            email: user.mail,
            groups,
            relayState: ((req as unknown as FastifyRequest).body as { RelayState?: string }).RelayState,
            orgId: (req as unknown as FastifyRequest).ldapConfig.organization
          });

          return cb(null, { isUserCompleted, providerAuthToken });
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
    schema: {
      body: z.object({
        organizationSlug: z.string().trim()
      })
    },
    preValidation: passport.authenticate("ldapauth", {
      session: false
      // failureFlash: true,
      // failureRedirect: "/login/provider/error"
      // this is due to zod type difference
    }) as any,
    handler: (req, res) => {
      let nextUrl;
      if (req.passportUser.isUserCompleted) {
        nextUrl = `${appCfg.SITE_URL}/login/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`;
      } else {
        nextUrl = `${appCfg.SITE_URL}/signup/sso?token=${encodeURIComponent(req.passportUser.providerAuthToken)}`;
      }

      return res.status(200).send({
        nextUrl
      });
    }
  });

  server.route({
    method: "GET",
    url: "/config",
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
          caCert: z.string()
        })
      }
    },
    handler: async (req) => {
      const ldap = await server.services.ldap.getLdapCfgWithPermissionCheck({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.query.organizationId,
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
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z.object({
        organizationId: z.string().trim(),
        isActive: z.boolean(),
        url: z.string().trim(),
        bindDN: z.string().trim(),
        bindPass: z.string().trim(),
        uniqueUserAttribute: z.string().trim().default("uidNumber"),
        searchBase: z.string().trim(),
        searchFilter: z.string().trim().default("(uid={{username}})"),
        groupSearchBase: z.string().trim(),
        groupSearchFilter: z
          .string()
          .trim()
          .default("(|(memberUid={{.Username}})(member={{.UserDN}})(uniqueMember={{.UserDN}}))"),
        caCert: z.string().trim().default("")
      }),
      response: {
        200: LdapConfigsSchema
      }
    },
    handler: async (req) => {
      const ldap = await server.services.ldap.createLdapCfg({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.body.organizationId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return ldap;
    }
  });

  server.route({
    url: "/config",
    method: "PATCH",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      body: z
        .object({
          isActive: z.boolean(),
          url: z.string().trim(),
          bindDN: z.string().trim(),
          bindPass: z.string().trim(),
          uniqueUserAttribute: z.string().trim(),
          searchBase: z.string().trim(),
          searchFilter: z.string().trim(),
          groupSearchBase: z.string().trim(),
          groupSearchFilter: z.string().trim(),
          caCert: z.string().trim()
        })
        .partial()
        .merge(z.object({ organizationId: z.string() })),
      response: {
        200: LdapConfigsSchema
      }
    },
    handler: async (req) => {
      const ldap = await server.services.ldap.updateLdapCfg({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.body.organizationId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return ldap;
    }
  });

  server.route({
    method: "GET",
    url: "/config/:configId/group-maps",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        configId: z.string().trim()
      }),
      response: {
        200: z.array(
          z.object({
            id: z.string(),
            ldapConfigId: z.string(),
            ldapGroupCN: z.string(),
            group: z.object({
              id: z.string(),
              name: z.string(),
              slug: z.string()
            })
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
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        configId: z.string().trim()
      }),
      body: z.object({
        ldapGroupCN: z.string().trim(),
        groupSlug: z.string().trim()
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
      return ldapGroupMap;
    }
  });

  server.route({
    method: "DELETE",
    url: "/config/:configId/group-maps/:groupMapId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        configId: z.string().trim(),
        groupMapId: z.string().trim()
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
      return ldapGroupMap;
    }
  });

  server.route({
    method: "POST",
    url: "/config/:configId/test-connection",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    schema: {
      params: z.object({
        configId: z.string().trim()
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
        ldapConfigId: req.params.configId
      });
      return result;
    }
  });
};
