import { TUser } from "@app/db/schemas";
import { TAuthDalFactory } from "@app/services/auth/auth-dal";
import { TAuthLoginFactory } from "@app/services/auth/auth-login-service";
import { TAuthPasswordFactory } from "@app/services/auth/auth-password-service";
import { TAuthSignupFactory } from "@app/services/auth/auth-signup-service";
import { AuthMode } from "@app/services/auth/auth-signup-type";
import { TAuthTokenServiceFactory } from "@app/services/token/token-service";

import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    realIp: string;
    // used for mfa session authentication
    mfa: {
      userId: string;
      user: TUser;
    };
    // identity injection. depending on which kinda of token the information is filled in auth
    auth: {
      authMode: AuthMode.JWT | AuthMode.API_KEY_V2 | AuthMode.API_KEY;
      userId: string;
      user: TUser;
    };
  }

  interface FastifyInstance {
    services: {
      login: TAuthLoginFactory;
      password: TAuthPasswordFactory;
      signup: TAuthSignupFactory;
      authToken: TAuthTokenServiceFactory;
    };

    // this is exclusive use for middlewares in which we need to inject data
    // everywhere else access using service layer
    store: {
      user: Pick<TAuthDalFactory, "getUserById">;
    };
  }
}
