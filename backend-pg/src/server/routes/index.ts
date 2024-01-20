import { Knex } from "knex";
import { z } from "zod";

import { registerV1EERoutes } from "@app/ee/routes/v1";
import { auditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { auditLogQueueServiceFactory } from "@app/ee/services/audit-log/audit-log-queue";
import { auditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-service";
import { licenseDALFactory } from "@app/ee/services/license/license-dal";
import { licenseServiceFactory } from "@app/ee/services/license/license-service";
import { permissionDALFactory } from "@app/ee/services/permission/permission-dal";
import { permissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { samlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { samlConfigServiceFactory } from "@app/ee/services/saml-config/saml-config-service";
import { secretApprovalPolicyApproverDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-approver-dal";
import { secretApprovalPolicyDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-dal";
import { secretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { secretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { secretApprovalRequestReviewerDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-reviewer-dal";
import { secretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { secretApprovalRequestServiceFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-service";
import { secretRotationDALFactory } from "@app/ee/services/secret-rotation/secret-rotation-dal";
import { secretRotationQueueFactory } from "@app/ee/services/secret-rotation/secret-rotation-queue";
import { secretRotationServiceFactory } from "@app/ee/services/secret-rotation/secret-rotation-service";
import { gitAppDALFactory } from "@app/ee/services/secret-scanning/git-app-dal";
import { gitAppInstallSessionDALFactory } from "@app/ee/services/secret-scanning/git-app-install-session-dal";
import { secretScanningDALFactory } from "@app/ee/services/secret-scanning/secret-scanning-dal";
import { secretScanningQueueFactory } from "@app/ee/services/secret-scanning/secret-scanning-queue";
import { secretScanningServiceFactory } from "@app/ee/services/secret-scanning/secret-scanning-service";
import { secretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { snapshotDALFactory } from "@app/ee/services/secret-snapshot/snapshot-dal";
import { snapshotFolderDALFactory } from "@app/ee/services/secret-snapshot/snapshot-folder-dal";
import { snapshotSecretDALFactory } from "@app/ee/services/secret-snapshot/snapshot-secret-dal";
import { trustedIpDALFactory } from "@app/ee/services/trusted-ip/trusted-ip-dal";
import { trustedIpServiceFactory } from "@app/ee/services/trusted-ip/trusted-ip-service";
import { getConfig } from "@app/lib/config/env";
import { TQueueServiceFactory } from "@app/queue";
import { apiKeyDALFactory } from "@app/services/api-key/api-key-dal";
import { apiKeyServiceFactory } from "@app/services/api-key/api-key-service";
import { authDALFactory } from "@app/services/auth/auth-dal";
import { authLoginServiceFactory } from "@app/services/auth/auth-login-service";
import { authPaswordServiceFactory } from "@app/services/auth/auth-password-service";
import { authSignupServiceFactory } from "@app/services/auth/auth-signup-service";
import { tokenDALFactory } from "@app/services/auth-token/auth-token-dal";
import { tokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { identityDALFactory } from "@app/services/identity/identity-dal";
import { identityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { identityServiceFactory } from "@app/services/identity/identity-service";
import { identityAccessTokenDALFactory } from "@app/services/identity-access-token/identity-access-token-dal";
import { identityAccessTokenServiceFactory } from "@app/services/identity-access-token/identity-access-token-service";
import { identityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";
import { identityProjectServiceFactory } from "@app/services/identity-project/identity-project-service";
import { identityUaClientSecretDALFactory } from "@app/services/identity-ua/identity-ua-client-secret-dal";
import { identityUaDALFactory } from "@app/services/identity-ua/identity-ua-dal";
import { identityUaServiceFactory } from "@app/services/identity-ua/identity-ua-service";
import { integrationDALFactory } from "@app/services/integration/integration-dal";
import { integrationServiceFactory } from "@app/services/integration/integration-service";
import { integrationAuthDALFactory } from "@app/services/integration-auth/integration-auth-dal";
import { integrationAuthServiceFactory } from "@app/services/integration-auth/integration-auth-service";
import { incidentContactDALFactory } from "@app/services/org/incident-contacts-dal";
import { orgBotDALFactory } from "@app/services/org/org-bot-dal";
import { orgDALFactory } from "@app/services/org/org-dal";
import { orgRoleDALFactory } from "@app/services/org/org-role-dal";
import { orgRoleServiceFactory } from "@app/services/org/org-role-service";
import { orgServiceFactory } from "@app/services/org/org-service";
import { projectDALFactory } from "@app/services/project/project-dal";
import { projectServiceFactory } from "@app/services/project/project-service";
import { projectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { projectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { projectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { projectEnvServiceFactory } from "@app/services/project-env/project-env-service";
import { projectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { projectKeyServiceFactory } from "@app/services/project-key/project-key-service";
import { projectMembershipDALFactory } from "@app/services/project-membership/project-membership-dal";
import { projectMembershipServiceFactory } from "@app/services/project-membership/project-membership-service";
import { projectRoleDALFactory } from "@app/services/project-role/project-role-dal";
import { projectRoleServiceFactory } from "@app/services/project-role/project-role-service";
import { secretBlindIndexDALFactory } from "@app/services/secret/secret-blind-index-dal";
import { secretDALFactory } from "@app/services/secret/secret-dal";
import { secretQueueFactory } from "@app/services/secret/secret-queue";
import { secretServiceFactory } from "@app/services/secret/secret-service";
import { secretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { secretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { secretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { secretFolderServiceFactory } from "@app/services/secret-folder/secret-folder-service";
import { secretFolderVersionDALFactory } from "@app/services/secret-folder/secret-folder-version-dal";
import { secretImportDALFactory } from "@app/services/secret-import/secret-import-dal";
import { secretImportServiceFactory } from "@app/services/secret-import/secret-import-service";
import { secretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";
import { secretTagServiceFactory } from "@app/services/secret-tag/secret-tag-service";
import { serviceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { serviceTokenServiceFactory } from "@app/services/service-token/service-token-service";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { superAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { superAdminServiceFactory } from "@app/services/super-admin/super-admin-service";
import { userDALFactory } from "@app/services/user/user-dal";
import { userServiceFactory } from "@app/services/user/user-service";
import { webhookDALFactory } from "@app/services/webhook/webhook-dal";
import { webhookServiceFactory } from "@app/services/webhook/webhook-service";

import { injectAuditLogInfo } from "../plugins/audit-log";
import { injectIdentity } from "../plugins/auth/inject-identity";
import { injectPermission } from "../plugins/auth/inject-permission";
import { registerSecretScannerGhApp } from "../plugins/secret-scanner";
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
  server.register(registerSecretScannerGhApp, { prefix: "/ss-webhook" });

  // db layers
  const userDAL = userDALFactory(db);
  const authDAL = authDALFactory(db);
  const authTokenDAL = tokenDALFactory(db);
  const orgDAL = orgDALFactory(db);
  const orgBotDAL = orgBotDALFactory(db);
  const incidentContactDAL = incidentContactDALFactory(db);
  const orgRoleDAL = orgRoleDALFactory(db);
  const superAdminDAL = superAdminDALFactory(db);
  const apiKeyDAL = apiKeyDALFactory(db);

  const projectDAL = projectDALFactory(db);
  const projectMembershipDAL = projectMembershipDALFactory(db);
  const projectRoleDAL = projectRoleDALFactory(db);
  const projectEnvDAL = projectEnvDALFactory(db);
  const projectKeyDAL = projectKeyDALFactory(db);
  const projectBotDAL = projectBotDALFactory(db);

  const secretDAL = secretDALFactory(db);
  const secretTagDAL = secretTagDALFactory(db);
  const folderDAL = secretFolderDALFactory(db);
  const folderVersionDAL = secretFolderVersionDALFactory(db);
  const secretImportDAL = secretImportDALFactory(db);
  const secretVersionDAL = secretVersionDALFactory(db);
  const secretVersionTagDAL = secretVersionTagDALFactory(db);
  const secretBlindIndexDAL = secretBlindIndexDALFactory(db);

  const integrationDAL = integrationDALFactory(db);
  const integrationAuthDAL = integrationAuthDALFactory(db);
  const webhookDAL = webhookDALFactory(db);
  const serviceTokenDAL = serviceTokenDALFactory(db);

  const identityDAL = identityDALFactory(db);
  const identityAccessTokenDAL = identityAccessTokenDALFactory(db);
  const identityOrgMembershipDAL = identityOrgDALFactory(db);
  const identityProjectDAL = identityProjectDALFactory(db);

  const identityUaDAL = identityUaDALFactory(db);
  const identityUaClientSecretDAL = identityUaClientSecretDALFactory(db);

  const auditLogDAL = auditLogDALFactory(db);
  const trustedIpDAL = trustedIpDALFactory(db);

  // ee db layer ops
  const permissionDAL = permissionDALFactory(db);
  const samlConfigDAL = samlConfigDALFactory(db);
  const sapApproverDAL = secretApprovalPolicyApproverDALFactory(db);
  const secretApprovalPolicyDAL = secretApprovalPolicyDALFactory(db);
  const secretApprovalRequestDAL = secretApprovalRequestDALFactory(db);
  const sarReviewerDAL = secretApprovalRequestReviewerDALFactory(db);
  const sarSecretDAL = secretApprovalRequestSecretDALFactory(db);

  const secretRotationDAL = secretRotationDALFactory(db);
  const snapshotDAL = snapshotDALFactory(db);
  const snapshotSecretDAL = snapshotSecretDALFactory(db);
  const snapshotFolderDAL = snapshotFolderDALFactory(db);

  const gitAppInstallSessionDAL = gitAppInstallSessionDALFactory(db);
  const gitAppOrgDAL = gitAppDALFactory(db);
  const secretScanningDAL = secretScanningDALFactory(db);
  const licenseDAL = licenseDALFactory(db);

  const permissionService = permissionServiceFactory({
    permissionDAL,
    orgRoleDAL,
    projectRoleDAL,
    serviceTokenDAL
  });
  const licenseService = licenseServiceFactory({ permissionService, orgDAL, licenseDAL });
  const trustedIpService = trustedIpServiceFactory({
    licenseService,
    projectDAL,
    trustedIpDAL,
    permissionService
  });
  const auditLogQueue = auditLogQueueServiceFactory({
    auditLogDAL,
    queueService,
    projectDAL,
    licenseService
  });
  const auditLogService = auditLogServiceFactory({ auditLogDAL, permissionService, auditLogQueue });
  const sapService = secretApprovalPolicyServiceFactory({
    projectMembershipDAL,
    projectEnvDAL,
    secretApprovalPolicyApproverDAL: sapApproverDAL,
    permissionService,
    secretApprovalPolicyDAL
  });
  const samlService = samlConfigServiceFactory({
    permissionService,
    orgBotDAL,
    orgDAL,
    userDAL,
    samlConfigDAL,
    licenseService
  });

  const tokenService = tokenServiceFactory({ tokenDAL: authTokenDAL, userDAL });
  const userService = userServiceFactory({ userDAL });
  const loginService = authLoginServiceFactory({ userDAL, smtpService, tokenService });
  const passwordService = authPaswordServiceFactory({
    tokenService,
    smtpService,
    authDAL,
    userDAL
  });
  const orgService = orgServiceFactory({
    licenseService,
    samlConfigDAL,
    orgRoleDAL,
    permissionService,
    orgDAL,
    incidentContactDAL,
    tokenService,
    smtpService,
    userDAL,
    orgBotDAL
  });
  const signupService = authSignupServiceFactory({
    tokenService,
    smtpService,
    authDAL,
    userDAL,
    orgDAL,
    orgService,
    licenseService
  });
  const orgRoleService = orgRoleServiceFactory({ permissionService, orgRoleDAL });
  const superAdminService = superAdminServiceFactory({
    userDAL,
    authService: loginService,
    serverCfgDAL: superAdminDAL,
    orgService
  });
  const apiKeyService = apiKeyServiceFactory({ apiKeyDAL, userDAL });

  const secretScanningQueue = secretScanningQueueFactory({
    smtpService,
    secretScanningDAL,
    queueService,
    orgMembershipDAL: orgDAL
  });
  const secretScanningService = secretScanningServiceFactory({
    permissionService,
    gitAppOrgDAL,
    gitAppInstallSessionDAL,
    secretScanningDAL,
    secretScanningQueue
  });
  const projectService = projectServiceFactory({
    permissionService,
    projectDAL,
    secretBlindIndexDAL,
    projectEnvDAL,
    projectMembershipDAL,
    folderDAL,
    licenseService
  });
  const projectMembershipService = projectMembershipServiceFactory({
    projectMembershipDAL,
    projectDAL,
    permissionService,
    orgDAL,
    userDAL,
    smtpService,
    projectKeyDAL,
    projectRoleDAL,
    licenseService
  });
  const projectEnvService = projectEnvServiceFactory({
    permissionService,
    projectEnvDAL,
    licenseService,
    projectDAL,
    folderDAL
  });
  const projectKeyService = projectKeyServiceFactory({
    permissionService,
    projectKeyDAL,
    projectMembershipDAL
  });
  const projectRoleService = projectRoleServiceFactory({ permissionService, projectRoleDAL });

  const snapshotService = secretSnapshotServiceFactory({
    permissionService,
    licenseService,
    folderDAL,
    secretDAL,
    snapshotDAL,
    snapshotFolderDAL,
    snapshotSecretDAL,
    secretVersionDAL,
    folderVersionDAL,
    secretTagDAL,
    secretVersionTagDAL
  });
  const webhookService = webhookServiceFactory({
    permissionService,
    webhookDAL,
    projectEnvDAL
  });

  const secretTagService = secretTagServiceFactory({ secretTagDAL, permissionService });
  const folderService = secretFolderServiceFactory({
    permissionService,
    folderDAL,
    folderVersionDAL,
    projectEnvDAL,
    snapshotService
  });
  const secretImportService = secretImportServiceFactory({
    projectEnvDAL,
    folderDAL,
    permissionService,
    secretImportDAL,
    secretDAL
  });
  const projectBotService = projectBotServiceFactory({ permissionService, projectBotDAL });
  const integrationAuthService = integrationAuthServiceFactory({
    integrationAuthDAL,
    integrationDAL,
    permissionService,
    projectBotDAL,
    projectBotService
  });
  const secretQueueService = secretQueueFactory({
    queueService,
    secretDAL,
    folderDAL,
    integrationAuthService,
    projectBotService,
    integrationDAL,
    secretImportDAL,
    projectEnvDAL,
    webhookDAL
  });
  const secretService = secretServiceFactory({
    folderDAL,
    secretVersionDAL,
    secretVersionTagDAL,
    secretBlindIndexDAL,
    permissionService,
    secretDAL,
    secretTagDAL,
    snapshotService,
    secretQueueService,
    secretImportDAL,
    projectBotService
  });
  const sarService = secretApprovalRequestServiceFactory({
    permissionService,
    folderDAL,
    sarSecretDAL,
    sarReviewerDAL,
    secretVersionDAL,
    secretBlindIndexDAL,
    secretApprovalRequestDAL,
    secretService,
    snapshotService,
    secretQueueService
  });
  const secretRotationQueue = secretRotationQueueFactory({
    secretRotationDAL,
    queue: queueService,
    secretDAL,
    secretVersionDAL,
    projectBotService
  });
  const secretRotationService = secretRotationServiceFactory({
    permissionService,
    secretRotationDAL,
    secretRotationQueue,
    projectDAL,
    licenseService,
    secretDAL,
    folderDAL
  });

  const integrationService = integrationServiceFactory({
    permissionService,
    folderDAL,
    integrationDAL,
    integrationAuthDAL,
    secretQueueService
  });
  const serviceTokenService = serviceTokenServiceFactory({
    projectEnvDAL,
    serviceTokenDAL,
    permissionService
  });

  const identityService = identityServiceFactory({
    permissionService,
    identityDAL,
    identityOrgMembershipDAL
  });
  const identityAccessTokenService = identityAccessTokenServiceFactory({ identityAccessTokenDAL });
  const identityProjectService = identityProjectServiceFactory({
    permissionService,
    projectDAL,
    identityProjectDAL,
    identityOrgMembershipDAL
  });
  const identityUaService = identityUaServiceFactory({
    identityOrgMembershipDAL,
    permissionService,
    identityDAL,
    identityAccessTokenDAL,
    identityUaClientSecretDAL,
    identityUaDAL,
    licenseService
  });

  await superAdminService.initServerCfg();
  // setup the communication with license key server
  await licenseService.init();
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
    snapshot: snapshotService,
    saml: samlService,
    auditLog: auditLogService,
    secretScanning: secretScanningService,
    license: licenseService,
    trustedIp: trustedIpService
  });

  server.decorate<FastifyZodProvider["store"]>("store", {
    user: userDAL
  });

  await server.register(injectIdentity, { userDAL, serviceTokenDAL });
  await server.register(injectPermission);
  await server.register(injectAuditLogInfo);

  server.route({
    url: "/api/status",
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
      const cfg = getConfig();

      return {
        date: new Date(),
        message: "Ok" as const,
        emailConfigured: cfg.isSmtpConfigured,
        inviteOnlySignup: false,
        redisConfigured: false,
        secretScanningConfigured: false
      };
    }
  });

  // register routes for v1
  await server.register(
    async (v1Server) => {
      await v1Server.register(registerV1EERoutes);
      await v1Server.register(registerV1Routes);
    },
    { prefix: "/api/v1" }
  );
  await server.register(registerV2Routes, { prefix: "/api/v2" });
  await server.register(registerV3Routes, { prefix: "/api/v3" });
};
