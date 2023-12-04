import { TUser } from "@app/db/schemas";
import { TAuthDalFactory } from "@app/services/auth/auth-dal";
import { TAuthLoginFactory } from "@app/services/auth/auth-login-service";
import { TAuthPasswordFactory } from "@app/services/auth/auth-password-service";
import { TAuthSignupFactory } from "@app/services/auth/auth-signup-service";

import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    realIp: string;
    // used for mfa session authentication
    mfa: {
      userId: string;
      user: TUser;
    };
  }

  interface FastifyInstance {
    services: {
      login: TAuthLoginFactory;
      password: TAuthPasswordFactory;
      signup: TAuthSignupFactory;
    };

    // this is exclusive use for middlewares in which we need to inject data
    // everywhere else access using service layer
    store: {
      user: Pick<TAuthDalFactory, "getUserById">;
    };
  }
}
