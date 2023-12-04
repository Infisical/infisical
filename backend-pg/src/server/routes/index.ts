import { Knex } from "knex";

import { authDalFactory } from "@app/services/auth/auth-dal";
import { authLoginServiceFactory } from "@app/services/auth/auth-login-service";
import { authPaswordServiceFactory } from "@app/services/auth/auth-password-service";
import { authSignupServiceFactory } from "@app/services/auth/auth-signup-service";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { tokenDalFactory } from "@app/services/token/token-dal";
import { tokenServiceFactory } from "@app/services/token/token-service";

import { registerV1Routes } from "./v1";
import { registerV2Routes } from "./v2";
import { registerV3Routes } from "./v3";

export const registerRoutes = async (
  server: FastifyZodProvider,
  { db, smtp }: { db: Knex; smtp: TSmtpService }
) => {
  // db layers
  const authDal = authDalFactory(db);
  const authTokenDal = tokenDalFactory(db);

  // service layers
  const tokenService = tokenServiceFactory({ tokenDal: authTokenDal });
  const loginService = authLoginServiceFactory({ authDal, smtpService: smtp, tokenService });
  const passwordService = authPaswordServiceFactory({ tokenService, smtpService: smtp, authDal });
  const signupService = authSignupServiceFactory({ tokenService, smtpService: smtp, authDal });

  // inject all services
  server.decorate("services", {
    login: loginService,
    password: passwordService,
    signup: signupService
  } as FastifyZodProvider["services"]);

  server.decorate("store", {
    user: authDal
  } as FastifyZodProvider["store"]);

  // register routes for v1
  await server.register(registerV1Routes, { prefix: "/v1" });
  await server.register(registerV2Routes, { prefix: "/v2" });
  await server.register(registerV3Routes, { prefix: "/v3" });
};
