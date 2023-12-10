import { TUsers } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TApiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { TAuthLoginFactory } from "@app/services/auth/auth-login-service";
import { TAuthPasswordFactory } from "@app/services/auth/auth-password-service";
import { TAuthSignupFactory } from "@app/services/auth/auth-signup-service";
import { AuthMode } from "@app/services/auth/auth-signup-type";
import { TOrgRoleServiceFactory } from "@app/services/org/org-role-service";
import { TOrgServiceFactory } from "@app/services/org/org-service";
import { TSuperAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { TAuthTokenServiceFactory } from "@app/services/token/token-service";
import { TUserDalFactory } from "@app/services/user/user-dal";
import { TUserServiceFactory } from "@app/services/user/user-service";

import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    realIp: string;
    // used for mfa session authentication
    mfa: {
      userId: string;
      user: TUsers;
    };
    // identity injection. depending on which kinda of token the information is filled in auth
    auth: {
      authMode: AuthMode.JWT | AuthMode.API_KEY_V2 | AuthMode.API_KEY;
      userId: string;
      tokenVersionId: string; // the session id of token used
      user: TUsers;
    };
    // passport data
    passportUser: {
      isCompleted: string;
      providerAuthToken: string;
    };
  }

  interface FastifyInstance {
    services: {
      login: TAuthLoginFactory;
      password: TAuthPasswordFactory;
      signup: TAuthSignupFactory;
      authToken: TAuthTokenServiceFactory;
      permission: TPermissionServiceFactory;
      org: TOrgServiceFactory;
      orgRole: TOrgRoleServiceFactory;
      superAdmin: TSuperAdminServiceFactory;
      user: TUserServiceFactory;
      apiKey: TApiKeyServiceFactory;
    };

    // this is exclusive use for middlewares in which we need to inject data
    // everywhere else access using service layer
    store: {
      user: Pick<TUserDalFactory, "findById">;
    };
  }
}
