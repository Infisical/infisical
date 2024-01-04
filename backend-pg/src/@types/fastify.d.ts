import "fastify";

import { TUsers } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { TSecretRotationServiceFactory } from "@app/ee/services/secret-rotation/secret-rotation-service";
import { TApiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { TAuthLoginFactory } from "@app/services/auth/auth-login-service";
import { TAuthPasswordFactory } from "@app/services/auth/auth-password-service";
import { TAuthSignupFactory } from "@app/services/auth/auth-signup-service";
import { AuthMode } from "@app/services/auth/auth-signup-type";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityServiceFactory } from "@app/services/identity/identity-service";
import { TIdentityAccessTokenServiceFactory } from "@app/services/identity-access-token/identity-access-token-service";
import { TIdentityProjectServiceFactory } from "@app/services/identity-project/identity-project-service";
import { TIdentityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";
import { TIntegrationServiceFactory } from "@app/services/integration/integration-service";
import { TIntegrationAuthServiceFactory } from "@app/services/integration-auth/integration-auth-service";
import { TOrgRoleServiceFactory } from "@app/services/org/org-role-service";
import { TOrgServiceFactory } from "@app/services/org/org-service";
import { TProjectServiceFactory } from "@app/services/project/project-service";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TProjectEnvServiceFactory } from "@app/services/project-env/project-env-service";
import { TProjectKeyServiceFactory } from "@app/services/project-key/project-key-service";
import { TProjectMembershipServiceFactory } from "@app/services/project-membership/project-membership-service";
import { TProjectRoleServiceFactory } from "@app/services/project-role/project-role-service";
import { TSecretServiceFactory } from "@app/services/secret/secret-service";
import { TSecretFolderServiceFactory } from "@app/services/secret-folder/secret-folder-service";
import { TSecretImportServiceFactory } from "@app/services/secret-import/secret-import-service";
import { TSecretTagServiceFactory } from "@app/services/secret-tag/secret-tag-service";
import { TServiceTokenServiceFactory } from "@app/services/service-token/service-token-service";
import { TSuperAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { TAuthTokenServiceFactory } from "@app/services/token/token-service";
import { TUserDalFactory } from "@app/services/user/user-dal";
import { TUserServiceFactory } from "@app/services/user/user-service";
import { TWebhookServiceFactory } from "@app/services/webhook/webhook-service";

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
      actor: ActorType.USER;
      userId: string;
      tokenVersionId: string; // the session id of token used
      user: TUsers;
    };
    permission: {
      type: ActorType;
      id: string;
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
      project: TProjectServiceFactory;
      projectMembership: TProjectMembershipServiceFactory;
      projectEnv: TProjectEnvServiceFactory;
      projectKey: TProjectKeyServiceFactory;
      projectRole: TProjectRoleServiceFactory;
      secret: TSecretServiceFactory;
      secretTag: TSecretTagServiceFactory;
      secretImport: TSecretImportServiceFactory;
      projectBot: TProjectBotServiceFactory;
      folder: TSecretFolderServiceFactory;
      integration: TIntegrationServiceFactory;
      integrationAuth: TIntegrationAuthServiceFactory;
      webhook: TWebhookServiceFactory;
      serviceToken: TServiceTokenServiceFactory;
      identity: TIdentityServiceFactory;
      identityAccessToken: TIdentityAccessTokenServiceFactory;
      identityProject: TIdentityProjectServiceFactory;
      identityUa: TIdentityUaServiceFactory;
      secretApprovalPolicy: TSecretApprovalPolicyServiceFactory;
      secretApprovalRequest: TSecretApprovalRequestServiceFactory;
      secretRotation: TSecretRotationServiceFactory;
    };

    // this is exclusive use for middlewares in which we need to inject data
    // everywhere else access using service layer
    store: {
      user: Pick<TUserDalFactory, "findById">;
    };
  }
}
