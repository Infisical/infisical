import { Knex } from "knex";
import { z } from "zod";

import { registerV1EERoutes } from "@app/ee/routes/v1";
import { permissionDalFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { sapApproverDalFactory } from "@app/ee/services/secret-approval-policy/sap-approver-dal";
import { secretApprovalPolicyDalFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-dal";
import { secretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { sarReviewerDalFactory } from "@app/ee/services/secret-approval-request/sar-reviewer-dal";
import { sarSecretDalFactory } from "@app/ee/services/secret-approval-request/sar-secret-dal";
import { secretApprovalRequestDalFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { secretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { secretRotationDalFactory } from "@app/ee/services/secret-rotation/secret-rotation-dal";
import { secretRotationQueueFactory } from "@app/ee/services/secret-rotation/secret-rotation-queue";
import { secretRotationServiceFactory } from "@app/ee/services/secret-rotation/secret-rotation-service";
import { secretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { snapshotDalFactory } from "@app/ee/services/secret-snapshot/snapshot-dal";
import { snapshotFolderDalFactory } from "@app/ee/services/secret-snapshot/snapshot-folder-dal";
import { snapshotSecretDalFactory } from "@app/ee/services/secret-snapshot/snapshot-secret-dal";
import { getConfig } from "@app/lib/config/env";
import { TQueueServiceFactory } from "@app/queue";
import { apiKeyDalFactory } from "@app/services/api-key/api-key-dal";
import { apiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { authDalFactory } from "@app/services/auth/auth-dal";
import { authLoginServiceFactory } from "@app/services/auth/auth-login-service";
import { authPaswordServiceFactory } from "@app/services/auth/auth-password-service";
import { authSignupServiceFactory } from "@app/services/auth/auth-signup-service";
import { tokenDalFactory } from "@app/services/auth-token/auth-token-dal";
import { tokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { identityDalFactory } from "@app/services/identity/identity-dal";
import { identityOrgDalFactory } from "@app/services/identity/identity-org-dal";
import { identityServiceFactory } from "@app/services/identity/identity-service";
import { identityAccessTokenDalFactory } from "@app/services/identity-access-token/identity-access-token-dal";
import { identityAccessTokenServiceFactory } from "@app/services/identity-access-token/identity-access-token-service";
import { identityProjectDalFactory } from "@app/services/identity-project/identity-project-dal";
import { identityProjectServiceFactory } from "@app/services/identity-project/identity-project-service";
import { identityUaClientSecretDalFactory } from "@app/services/identity-ua/identity-ua-client-secret-dal";
import { identityUaDalFactory } from "@app/services/identity-ua/identity-ua-dal";
import { identityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";
import { integrationDalFactory } from "@app/services/integration/integration-dal";
import { integrationServiceFactory } from "@app/services/integration/integration-service";
import { integrationAuthDalFactory } from "@app/services/integration-auth/integration-auth-dal";
import { integrationAuthServiceFactory } from "@app/services/integration-auth/integration-auth-service";
import { incidentContactDalFactory } from "@app/services/org/incident-contacts-dal";
import { orgDalFactory } from "@app/services/org/org-dal";
import { orgRoleDalFactory } from "@app/services/org/org-role-dal";
import { orgRoleServiceFactory } from "@app/services/org/org-role-service";
import { orgServiceFactory } from "@app/services/org/org-service";
import { projectDalFactory } from "@app/services/project/project-dal";
import { projectServiceFactory } from "@app/services/project/project-service";
import { projectBotDalFactory } from "@app/services/project-bot/project-bot-dal";
import { projectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { projectEnvDalFactory } from "@app/services/project-env/project-env-dal";
import { projectEnvServiceFactory } from "@app/services/project-env/project-env-service";
import { projectKeyDalFactory } from "@app/services/project-key/project-key-dal";
import { projectKeyServiceFactory } from "@app/services/project-key/project-key-service";
import { projectMembershipDalFactory } from "@app/services/project-membership/project-membership-dal";
import { projectMembershipServiceFactory } from "@app/services/project-membership/project-membership-service";
import { projectRoleDalFactory } from "@app/services/project-role/project-role-dal";
import { projectRoleServiceFactory } from "@app/services/project-role/project-role-service";
import { secretBlindIndexDalFactory } from "@app/services/secret/secret-blind-index-dal";
import { secretDalFactory } from "@app/services/secret/secret-dal";
import { secretServiceFactory } from "@app/services/secret/secret-service";
import { secretVersionDalFactory } from "@app/services/secret/secret-version-dal";
import { secretFolderDalFactory } from "@app/services/secret-folder/secret-folder-dal";
import { secretFolderServiceFactory } from "@app/services/secret-folder/secret-folder-service";
import { secretFolderVersionDalFactory } from "@app/services/secret-folder/secret-folder-version-dal";
import { secretImportDalFactory } from "@app/services/secret-import/secret-import-dal";
import { secretImportServiceFactory } from "@app/services/secret-import/secret-import-service";
import { secretTagDalFactory } from "@app/services/secret-tag/secret-tag-dal";
import { secretTagServiceFactory } from "@app/services/secret-tag/secret-tag-service";
import { serviceTokenDalFactory } from "@app/services/service-token/service-token-dal";
import { serviceTokenServiceFactory } from "@app/services/service-token/service-token-service";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { superAdminDalFactory } from "@app/services/super-admin/super-admin-dal";
import { superAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { userDalFactory } from "@app/services/user/user-dal";
import { userServiceFactory } from "@app/services/user/user-service";
import { webhookDalFactory } from "@app/services/webhook/webhook-dal";
import { webhookServiceFactory } from "@app/services/webhook/webhook-service";

import { injectIdentity } from "../plugins/auth/inject-identity";
import { injectPermission } from "../plugins/auth/inject-permission";
import { registerV1Routes } from "./v1";
import { registerV2Routes } from "./v2";
import { registerV3Routes } from "./v3";

export const registerRoutes = async (
  server: FastifyZodProvider,
  {
    db,
    smtp: smtpService,
    queue: queueService
  }: { db: Knex; smtp: TSmtpService; queue: TQueueServiceFactory }
) => {
  // db layers
  const userDal = userDalFactory(db);
  const authDal = authDalFactory(db);
  const authTokenDal = tokenDalFactory(db);
  const orgDal = orgDalFactory(db);
  const incidentContactDal = incidentContactDalFactory(db);
  const orgRoleDal = orgRoleDalFactory(db);
  const superAdminDal = superAdminDalFactory(db);
  const apiKeyDal = apiKeyDalFactory(db);

  const projectDal = projectDalFactory(db);
  const projectMembershipDal = projectMembershipDalFactory(db);
  const projectRoleDal = projectRoleDalFactory(db);
  const projectEnvDal = projectEnvDalFactory(db);
  const projectKeyDal = projectKeyDalFactory(db);
  const projectBotDal = projectBotDalFactory(db);

  const secretDal = secretDalFactory(db);
  const secretTagDal = secretTagDalFactory(db);
  const folderDal = secretFolderDalFactory(db);
  const folderVersionDal = secretFolderVersionDalFactory(db);
  const secretImportDal = secretImportDalFactory(db);
  const secretVersionDal = secretVersionDalFactory(db);
  const secretBlindIndexDal = secretBlindIndexDalFactory(db);

  const integrationDal = integrationDalFactory(db);
  const integrationAuthDal = integrationAuthDalFactory(db);
  const webhookDal = webhookDalFactory(db);
  const serviceTokenDal = serviceTokenDalFactory(db);

  const identityDal = identityDalFactory(db);
  const identityAccessTokenDal = identityAccessTokenDalFactory(db);
  const identityOrgMembershipDal = identityOrgDalFactory(db);
  const identityProjectDal = identityProjectDalFactory(db);

  const identityUaDal = identityUaDalFactory(db);
  const identityUaClientSecretDal = identityUaClientSecretDalFactory(db);

  // ee db layer ops
  const permissionDal = permissionDalFactory(db);
  const sapApproverDal = sapApproverDalFactory(db);
  const secretApprovalPolicyDal = secretApprovalPolicyDalFactory(db);
  const secretApprovalRequestDal = secretApprovalRequestDalFactory(db);
  const sarReviewerDal = sarReviewerDalFactory(db);
  const sarSecretDal = sarSecretDalFactory(db);

  const secretRotationDal = secretRotationDalFactory(db);
  const snapshotDal = snapshotDalFactory(db);
  const snapshotSecretDal = snapshotSecretDalFactory(db);
  const snapshotFolderDal = snapshotFolderDalFactory(db);

  const permissionService = permissionServiceFactory({ permissionDal, orgRoleDal, projectRoleDal });
  const sapService = secretApprovalPolicyServiceFactory({
    projectMembershipDal,
    projectEnvDal,
    sapApproverDal,
    permissionService,
    secretApprovalPolicyDal
  });
  const sarService = secretApprovalRequestServiceFactory({
    permissionService,
    folderDal,
    secretDal,
    sarSecretDal,
    sarReviewerDal,
    secretVersionDal,
    secretBlindIndexDal,
    secretApprovalRequestDal
  });

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
  const superAdminService = superAdminServiceFactory({
    userDal,
    authService: loginService,
    serverCfgDal: superAdminDal
  });
  const apiKeyService = apiKeyServiceFactory({ apiKeyDal });

  const projectService = projectServiceFactory({
    permissionService,
    projectDal,
    secretBlindIndexDal,
    projectEnvDal,
    projectMembershipDal,
    folderDal
  });
  const projectMembershipService = projectMembershipServiceFactory({
    projectMembershipDal,
    projectDal,
    permissionService,
    orgDal,
    userDal,
    smtpService,
    projectKeyDal,
    projectRoleDal
  });
  const projectEnvService = projectEnvServiceFactory({ permissionService, projectEnvDal });
  const projectKeyService = projectKeyServiceFactory({
    permissionService,
    projectKeyDal,
    projectMembershipDal
  });
  const projectRoleService = projectRoleServiceFactory({ permissionService, projectRoleDal });

  const snapshotService = secretSnapshotServiceFactory({
    folderDal,
    secretDal,
    snapshotDal,
    snapshotFolderDal,
    snapshotSecretDal,
    secretVersionDal,
    folderVersionDal,
    permissionService
  });

  const secretService = secretServiceFactory({
    folderDal,
    secretVersionDal,
    secretBlindIndexDal,
    permissionService,
    secretDal,
    secretTagDal,
    snapshotService
  });
  const secretTagService = secretTagServiceFactory({ secretTagDal, permissionService });
  const folderService = secretFolderServiceFactory({
    permissionService,
    folderDal,
    folderVersionDal,
    projectEnvDal,
    snapshotService
  });
  const secretImportService = secretImportServiceFactory({
    projectEnvDal,
    folderDal,
    permissionService,
    secretImportDal,
    secretDal
  });
  const projectBotService = projectBotServiceFactory({ permissionService, projectBotDal });

  const secretRotationQueue = secretRotationQueueFactory({
    secretRotationDal,
    queue: queueService,
    secretDal,
    secretVersionDal,
    projectBotService
  });
  const secretRotationService = secretRotationServiceFactory({
    permissionService,
    projectEnvDal,
    secretRotationDal,
    secretRotationQueue
  });

  const integrationService = integrationServiceFactory({
    permissionService,
    folderDal,
    integrationDal,
    integrationAuthDal
  });
  const integrationAuthService = integrationAuthServiceFactory({
    integrationAuthDal,
    integrationDal,
    permissionService,
    projectBotDal,
    projectBotService
  });
  const webhookService = webhookServiceFactory({
    permissionService,
    webhookDal,
    projectEnvDal
  });
  const serviceTokenService = serviceTokenServiceFactory({
    projectEnvDal,
    serviceTokenDal,
    permissionService
  });

  const identityService = identityServiceFactory({
    permissionService,
    identityDal,
    identityOrgMembershipDal
  });
  const identityAccessTokenService = identityAccessTokenServiceFactory({ identityAccessTokenDal });
  const identityProjectService = identityProjectServiceFactory({
    permissionService,
    projectDal,
    identityProjectDal,
    identityOrgMembershipDal
  });
  const identityUaService = identityUaServiceFactory({
    identityOrgMembershipDal,
    permissionService,
    identityDal,
    identityAccessTokenDal,
    identityUaClientSecretDal,
    identityUaDal
  });

  await superAdminService.initServerCfg();
  // inject all services
  server.decorate<FastifyZodProvider["services"]>("services", {
    login: loginService,
    password: passwordService,
    signup: signupService,
    user: userService,
    permission: permissionService,
    org: orgService,
    orgRole: orgRoleService,
    apiKey: apiKeyService,
    authToken: tokenService,
    superAdmin: superAdminService,
    project: projectService,
    projectMembership: projectMembershipService,
    projectKey: projectKeyService,
    projectEnv: projectEnvService,
    projectRole: projectRoleService,
    secret: secretService,
    secretTag: secretTagService,
    folder: folderService,
    secretImport: secretImportService,
    projectBot: projectBotService,
    integration: integrationService,
    integrationAuth: integrationAuthService,
    webhook: webhookService,
    serviceToken: serviceTokenService,
    identity: identityService,
    identityAccessToken: identityAccessTokenService,
    identityProject: identityProjectService,
    identityUa: identityUaService,
    secretApprovalPolicy: sapService,
    secretApprovalRequest: sarService,
    secretRotation: secretRotationService,
    snapshot: snapshotService
  });

  server.decorate<FastifyZodProvider["store"]>("store", {
    user: userDal
  });

  await server.register(injectIdentity);
  await server.register(injectPermission);

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
