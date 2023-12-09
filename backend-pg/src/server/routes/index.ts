import { Knex } from "knex";
import { z } from "zod";

import { registerV1EERoutes } from "@app/ee/routes/v1";
import { permissionDalFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import { apiKeyDalFactory } from "@app/services/api-key/api-key-dal";
import { apiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { authDalFactory } from "@app/services/auth/auth-dal";
import { authLoginServiceFactory } from "@app/services/auth/auth-login-service";
import { authPaswordServiceFactory } from "@app/services/auth/auth-password-service";
import { authSignupServiceFactory } from "@app/services/auth/auth-signup-service";
import { incidentContactDalFactory } from "@app/services/org/incident-contacts-dal";
import { orgDalFactory } from "@app/services/org/org-dal";
import { orgRoleDalFactory } from "@app/services/org/org-role-dal";
import { orgRoleServiceFactory } from "@app/services/org/org-role-service";
import { orgServiceFactory } from "@app/services/org/org-service";
import { serverCfgDalFactory } from "@app/services/server-cfg/server-cfg-dal";
import { serverCfgServiceFactory } from "@app/services/server-cfg/server-cfg-service";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { tokenDalFactory } from "@app/services/token/token-dal";
import { tokenServiceFactory } from "@app/services/token/token-service";
import { userDalFactory } from "@app/services/user/user-dal";
import { userServiceFactory } from "@app/services/user/user-service";

import { injectIdentity } from "../plugins/auth/inject-identity";
import { registerV1Routes } from "./v1";
import { registerV2Routes } from "./v2";
import { registerV3Routes } from "./v3";

export const registerRoutes = async (
  server: FastifyZodProvider,
  { db, smtp: smtpService }: { db: Knex; smtp: TSmtpService }
) => {
  // db layers
  const userDal = userDalFactory(db);
  const authDal = authDalFactory(db);
  const authTokenDal = tokenDalFactory(db);
  const orgDal = orgDalFactory(db);
  const incidentContactDal = incidentContactDalFactory(db);
  const orgRoleDal = orgRoleDalFactory(db);
  const serverCfgDal = serverCfgDalFactory(db);
  const apiKeyDal = apiKeyDalFactory(db);

  // ee db layer ops
  const permissionDal = permissionDalFactory(db);

  // ee services
  const permissionService = permissionServiceFactory({ permissionDal });

  // service layers
  const tokenService = tokenServiceFactory({ tokenDal: authTokenDal });
  const userService = userServiceFactory({ userDal });
  const loginService = authLoginServiceFactory({ userDal, smtpService, tokenService });
  const passwordService = authPaswordServiceFactory({
    tokenService,
    smtpService,
    authDal,
    userDal
  });
  const orgService = orgServiceFactory({
    orgRoleDal,
    permissionService,
    orgDal,
    incidentContactDal,
    tokenService,
    smtpService,
    userDal
  });
  const signupService = authSignupServiceFactory({
    tokenService,
    smtpService,
    authDal,
    userDal,
    orgDal,
    orgService
  });
  const orgRoleService = orgRoleServiceFactory({ permissionService, orgRoleDal });
  const serverCfgService = serverCfgServiceFactory({
    userDal,
    authService: loginService,
    serverCfgDal
  });
  const apiKeyService = apiKeyServiceFactory({ apiKeyDal });

  await serverCfgService.initServerCfg();
  // inject all services
  server.decorate("services", {
    login: loginService,
    password: passwordService,
    signup: signupService,
    user: userService,
    permission: permissionService,
    org: orgService,
    orgRole: orgRoleService,
    serverCfg: serverCfgService,
    apiKey: apiKeyService,
    authToken: tokenService
  } as FastifyZodProvider["services"]);

  server.decorate("store", {
    user: userDal
  } as FastifyZodProvider["store"]);

  await server.register(injectIdentity);

  server.route({
    url: "/status",
    method: "GET",
    schema: {
      response: {
        200: z.object({
          date: z.date(),
          message: z.literal("Ok"),
          emailConfigured: z.boolean().optional(),
          inviteOnlySignup: z.boolean().optional(),
          redisConfigured: z.boolean().optional(),
          secretScanningConfigured: z.boolean().optional()
        })
      }
    },
    handler: () => {
      const appCfg = getConfig();
      return {
        date: new Date(),
        message: "Ok" as const,
        emailConfigured: appCfg.isSmtpConfigured,
        inviteOnlySignup: false,
        redisConfigured: false,
        secretScanningConfigured: false
      };
    }
  });

  // register routes for v1
  await server.register(registerV1Routes, { prefix: "/v1" });
  await server.register(registerV2Routes, { prefix: "/v2" });
  await server.register(registerV3Routes, { prefix: "/v3" });

  await server.register(registerV1EERoutes, { prefix: "/ee/v1" });
};
