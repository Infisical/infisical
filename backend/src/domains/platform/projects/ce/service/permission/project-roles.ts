import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

import { ProjectMembershipRole } from "@app/db/schemas";

import {
  ProjectPermissionActions,
  ProjectPermissionAppConnectionActions,
  ProjectPermissionApplicationActions,
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionAuditLogsActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionCertificatePolicyActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionCmekActions,
  ProjectPermissionCodeSigningActions,
  ProjectPermissionCommitsActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionGroupActions,
  ProjectPermissionHoneyTokenActions,
  ProjectPermissionHsmConnectorActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionInsightsActions,
  ProjectPermissionKmipActions,
  ProjectPermissionMemberActions,
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionPkiSyncActions,
  ProjectPermissionPkiTemplateActions,
  ProjectPermissionProjectFolderGrantActions,
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretApprovalRequestActions,
  ProjectPermissionSecretEventActions,
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSecretScanningConfigActions,
  ProjectPermissionSecretScanningDataSourceActions,
  ProjectPermissionSecretScanningFindingActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSecretValidationRuleActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission";

// The built-in project roles every product builds on: admin, member, viewer and no access.
const buildAdminPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  // Admins get full access to everything
  [
    ProjectPermissionSub.SecretImports,
    ProjectPermissionSub.Role,
    ProjectPermissionSub.Integrations,
    ProjectPermissionSub.Webhooks,
    ProjectPermissionSub.ServiceTokens,
    ProjectPermissionSub.Settings,
    ProjectPermissionSub.Environments,
    ProjectPermissionSub.Tags,
    ProjectPermissionSub.IpAllowList,
    ProjectPermissionSub.PkiAlerts,
    ProjectPermissionSub.PkiCollections,
    ProjectPermissionSub.CertificateInventoryViews
  ].forEach((el) => {
    can(
      [
        ProjectPermissionActions.Read,
        ProjectPermissionActions.Edit,
        ProjectPermissionActions.Create,
        ProjectPermissionActions.Delete
      ],
      el
    );
  });

  // Folder read is implied for all, so admins only need write actions on folders
  can(
    [
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete,
      ProjectPermissionSecretFolderActions.ManageAccess
    ],
    ProjectPermissionSub.SecretFolders
  );

  can([ProjectPermissionAuditLogsActions.Read, ProjectPermissionAuditLogsActions.Edit], ProjectPermissionSub.AuditLogs);

  can(
    [
      ProjectPermissionCertificateAuthorityActions.Read,
      ProjectPermissionCertificateAuthorityActions.Create,
      ProjectPermissionCertificateAuthorityActions.Edit,
      ProjectPermissionCertificateAuthorityActions.Delete,
      ProjectPermissionCertificateAuthorityActions.IssueCACertificate,
      ProjectPermissionCertificateAuthorityActions.SignIntermediate
    ],
    ProjectPermissionSub.CertificateAuthorities
  );

  can(
    [
      ProjectPermissionPkiTemplateActions.Read,
      ProjectPermissionPkiTemplateActions.Edit,
      ProjectPermissionPkiTemplateActions.Create,
      ProjectPermissionPkiTemplateActions.Delete,
      ProjectPermissionPkiTemplateActions.IssueCert, // deprecated
      ProjectPermissionPkiTemplateActions.ListCerts // deprecated
    ],
    ProjectPermissionSub.CertificateTemplates
  );

  can(
    [
      ProjectPermissionCertificatePolicyActions.Read,
      ProjectPermissionCertificatePolicyActions.Create,
      ProjectPermissionCertificatePolicyActions.Edit,
      ProjectPermissionCertificatePolicyActions.Delete
    ],
    ProjectPermissionSub.CertificatePolicies
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.SecretApproval
  );

  can(
    [
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionCertificateActions.Edit,
      ProjectPermissionCertificateActions.Create,
      ProjectPermissionCertificateActions.Delete,
      ProjectPermissionCertificateActions.ReadPrivateKey,
      ProjectPermissionCertificateActions.Import
    ],
    ProjectPermissionSub.Certificates
  );

  can(
    [
      ProjectPermissionCertificateProfileActions.Read,
      ProjectPermissionCertificateProfileActions.Edit,
      ProjectPermissionCertificateProfileActions.Create,
      ProjectPermissionCertificateProfileActions.Delete,
      ProjectPermissionCertificateProfileActions.IssueCert,
      ProjectPermissionCertificateProfileActions.RevealAcmeEabSecret,
      ProjectPermissionCertificateProfileActions.RotateAcmeEabSecret,
      ProjectPermissionCertificateProfileActions.ManageApplicationAttachments
    ],
    ProjectPermissionSub.CertificateProfiles
  );

  can(
    [
      ProjectPermissionApplicationActions.Read,
      ProjectPermissionApplicationActions.List,
      ProjectPermissionApplicationActions.Create
    ],
    ProjectPermissionSub.Application
  );

  can(
    [ProjectPermissionCommitsActions.Read, ProjectPermissionCommitsActions.PerformRollback],
    ProjectPermissionSub.Commits
  );

  can(
    [
      ProjectPermissionPkiSubscriberActions.Edit,
      ProjectPermissionPkiSubscriberActions.Read,
      ProjectPermissionPkiSubscriberActions.Create,
      ProjectPermissionPkiSubscriberActions.Delete,
      ProjectPermissionPkiSubscriberActions.IssueCert,
      ProjectPermissionPkiSubscriberActions.ListCerts
    ],
    ProjectPermissionSub.PkiSubscribers
  );

  can(
    [
      ProjectPermissionMemberActions.Create,
      ProjectPermissionMemberActions.Edit,
      ProjectPermissionMemberActions.Delete,
      ProjectPermissionMemberActions.Read,
      ProjectPermissionMemberActions.GrantPrivileges,
      ProjectPermissionMemberActions.AssignRole,
      ProjectPermissionMemberActions.AssignAdditionalPrivileges,
      ProjectPermissionMemberActions.AssumePrivileges
    ],
    ProjectPermissionSub.Member
  );

  can(
    [
      ProjectPermissionGroupActions.Create,
      ProjectPermissionGroupActions.Edit,
      ProjectPermissionGroupActions.Delete,
      ProjectPermissionGroupActions.Read,
      ProjectPermissionGroupActions.GrantPrivileges,
      ProjectPermissionGroupActions.AssignRole
    ],
    ProjectPermissionSub.Groups
  );

  can(
    [
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionIdentityActions.Edit,
      ProjectPermissionIdentityActions.Delete,
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionIdentityActions.GrantPrivileges,
      ProjectPermissionIdentityActions.AssignRole,
      ProjectPermissionIdentityActions.AssignAdditionalPrivileges,
      ProjectPermissionIdentityActions.AssumePrivileges,
      ProjectPermissionIdentityActions.GetToken,
      ProjectPermissionIdentityActions.CreateToken,
      ProjectPermissionIdentityActions.DeleteToken,
      ProjectPermissionIdentityActions.RevokeAuth,
      ProjectPermissionIdentityActions.EditAuth
    ],
    ProjectPermissionSub.Identity
  );

  can(
    [
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Delete
    ],
    ProjectPermissionSub.Secrets
  );

  can(
    [
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      ProjectPermissionDynamicSecretActions.Lease
    ],
    ProjectPermissionSub.DynamicSecrets
  );

  can([ProjectPermissionActions.Edit, ProjectPermissionActions.Delete], ProjectPermissionSub.Project);
  can([ProjectPermissionActions.Read, ProjectPermissionActions.Create], ProjectPermissionSub.SecretRollback);
  can([ProjectPermissionActions.Edit], ProjectPermissionSub.Kms);
  can(
    [
      ProjectPermissionCmekActions.Create,
      ProjectPermissionCmekActions.Edit,
      ProjectPermissionCmekActions.Delete,
      ProjectPermissionCmekActions.Read,
      ProjectPermissionCmekActions.Encrypt,
      ProjectPermissionCmekActions.Decrypt,
      ProjectPermissionCmekActions.Sign,
      ProjectPermissionCmekActions.Verify,
      ProjectPermissionCmekActions.GenerateMac,
      ProjectPermissionCmekActions.VerifyMac,
      ProjectPermissionCmekActions.Rotate,
      ProjectPermissionCmekActions.ExportPrivateKey
    ],
    ProjectPermissionSub.Cmek
  );
  can(
    [
      ProjectPermissionSecretSyncActions.Create,
      ProjectPermissionSecretSyncActions.Edit,
      ProjectPermissionSecretSyncActions.Delete,
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSecretSyncActions.SyncSecrets,
      ProjectPermissionSecretSyncActions.ImportSecrets,
      ProjectPermissionSecretSyncActions.RemoveSecrets
    ],
    ProjectPermissionSub.SecretSyncs
  );

  can(
    [
      ProjectPermissionSecretValidationRuleActions.Create,
      ProjectPermissionSecretValidationRuleActions.Edit,
      ProjectPermissionSecretValidationRuleActions.Delete,
      ProjectPermissionSecretValidationRuleActions.Read
    ],
    ProjectPermissionSub.SecretValidationRules
  );

  can(
    [
      ProjectPermissionPkiSyncActions.Create,
      ProjectPermissionPkiSyncActions.Edit,
      ProjectPermissionPkiSyncActions.Delete,
      ProjectPermissionPkiSyncActions.Read,
      ProjectPermissionPkiSyncActions.SyncCertificates,
      ProjectPermissionPkiSyncActions.ImportCertificates,
      ProjectPermissionPkiSyncActions.RemoveCertificates,
      ProjectPermissionPkiSyncActions.SetPostSyncCommand,
      ProjectPermissionPkiSyncActions.SetHealthCheckCommand,
      ProjectPermissionPkiSyncActions.SetTargetHost
    ],
    ProjectPermissionSub.PkiSyncs
  );

  can(
    [
      ProjectPermissionPkiDiscoveryActions.Read,
      ProjectPermissionPkiDiscoveryActions.Create,
      ProjectPermissionPkiDiscoveryActions.Edit,
      ProjectPermissionPkiDiscoveryActions.Delete,
      ProjectPermissionPkiDiscoveryActions.RunScan
    ],
    ProjectPermissionSub.PkiDiscovery
  );

  can(
    [
      ProjectPermissionPkiCertificateInstallationActions.Read,
      ProjectPermissionPkiCertificateInstallationActions.Edit,
      ProjectPermissionPkiCertificateInstallationActions.Delete
    ],
    ProjectPermissionSub.PkiCertificateInstallations
  );

  can(
    [ProjectPermissionCodeSigningActions.Read, ProjectPermissionCodeSigningActions.Create],
    ProjectPermissionSub.CodeSigners
  );

  can(
    [
      ProjectPermissionKmipActions.CreateClients,
      ProjectPermissionKmipActions.UpdateClients,
      ProjectPermissionKmipActions.DeleteClients,
      ProjectPermissionKmipActions.ReadClients,
      ProjectPermissionKmipActions.GenerateClientCertificates
    ],
    ProjectPermissionSub.Kmip
  );

  can(
    [
      ProjectPermissionSecretRotationActions.Create,
      ProjectPermissionSecretRotationActions.Edit,
      ProjectPermissionSecretRotationActions.Delete,
      ProjectPermissionSecretRotationActions.Read,
      ProjectPermissionSecretRotationActions.ReadGeneratedCredentials,
      ProjectPermissionSecretRotationActions.RotateSecrets
    ],
    ProjectPermissionSub.SecretRotation
  );

  can(
    [
      ProjectPermissionSecretScanningDataSourceActions.Create,
      ProjectPermissionSecretScanningDataSourceActions.Edit,
      ProjectPermissionSecretScanningDataSourceActions.Delete,
      ProjectPermissionSecretScanningDataSourceActions.Read,
      ProjectPermissionSecretScanningDataSourceActions.TriggerScans,
      ProjectPermissionSecretScanningDataSourceActions.ReadScans,
      ProjectPermissionSecretScanningDataSourceActions.ReadResources
    ],
    ProjectPermissionSub.SecretScanningDataSources
  );

  can(
    [ProjectPermissionSecretScanningFindingActions.Read, ProjectPermissionSecretScanningFindingActions.Update],
    ProjectPermissionSub.SecretScanningFindings
  );

  can(
    [ProjectPermissionSecretScanningConfigActions.Read, ProjectPermissionSecretScanningConfigActions.Update],
    ProjectPermissionSub.SecretScanningConfigs
  );

  can(
    [
      ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
      ProjectPermissionSecretEventActions.SubscribeToDeleteEvents,
      ProjectPermissionSecretEventActions.SubscribeToUpdateEvents,
      ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents
    ],
    ProjectPermissionSub.SecretEventSubscriptions
  );

  can(
    [
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionAppConnectionActions.Edit,
      ProjectPermissionAppConnectionActions.Delete,
      ProjectPermissionAppConnectionActions.Read,
      ProjectPermissionAppConnectionActions.Connect,
      ProjectPermissionAppConnectionActions.RotateCredentials
    ],
    ProjectPermissionSub.AppConnections
  );

  can(
    [
      ProjectPermissionHsmConnectorActions.Read,
      ProjectPermissionHsmConnectorActions.Create,
      ProjectPermissionHsmConnectorActions.Edit,
      ProjectPermissionHsmConnectorActions.Delete,
      ProjectPermissionHsmConnectorActions.Test,
      ProjectPermissionHsmConnectorActions.Attach
    ],
    ProjectPermissionSub.HsmConnectors
  );

  can(
    [
      ProjectPermissionHoneyTokenActions.Read,
      ProjectPermissionHoneyTokenActions.ReadCredentials,
      ProjectPermissionHoneyTokenActions.Create,
      ProjectPermissionHoneyTokenActions.Edit,
      ProjectPermissionHoneyTokenActions.Reset,
      ProjectPermissionHoneyTokenActions.Revoke
    ],
    ProjectPermissionSub.HoneyTokens
  );

  can(
    [ProjectPermissionApprovalRequestActions.Read, ProjectPermissionApprovalRequestActions.Create],
    ProjectPermissionSub.ApprovalRequests
  );

  can(
    [ProjectPermissionApprovalRequestGrantActions.Read, ProjectPermissionApprovalRequestGrantActions.Revoke],
    ProjectPermissionSub.ApprovalRequestGrants
  );

  can([ProjectPermissionSecretApprovalRequestActions.Read], ProjectPermissionSub.SecretApprovalRequest);

  can(
    [
      ProjectPermissionProjectFolderGrantActions.ReadGrant,
      ProjectPermissionProjectFolderGrantActions.CreateGrant,
      ProjectPermissionProjectFolderGrantActions.RevokeGrant
    ],
    ProjectPermissionSub.ProjectFolderGrant
  );

  can(
    [
      ProjectPermissionInsightsActions.Read,
      ProjectPermissionInsightsActions.GenerateReport,
      ProjectPermissionInsightsActions.DeleteReport
    ],
    ProjectPermissionSub.Insights
  );

  can(
    [
      ProjectPermissionProxiedServiceActions.Read,
      ProjectPermissionProxiedServiceActions.Create,
      ProjectPermissionProxiedServiceActions.Edit,
      ProjectPermissionProxiedServiceActions.Delete,
      ProjectPermissionProxiedServiceActions.Proxy,
      ProjectPermissionProxiedServiceActions.ReportUsage
    ],
    ProjectPermissionSub.ProxiedServices
  );

  return rules;
};

const buildMemberPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(
    [
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Delete
    ],
    ProjectPermissionSub.Secrets
  );
  can(
    [ProjectPermissionActions.Edit, ProjectPermissionActions.Create, ProjectPermissionActions.Delete],
    ProjectPermissionSub.SecretFolders
  );
  can(
    [
      ProjectPermissionDynamicSecretActions.ReadRootCredential,
      ProjectPermissionDynamicSecretActions.EditRootCredential,
      ProjectPermissionDynamicSecretActions.CreateRootCredential,
      ProjectPermissionDynamicSecretActions.DeleteRootCredential,
      ProjectPermissionDynamicSecretActions.Lease
    ],
    ProjectPermissionSub.DynamicSecrets
  );
  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.SecretImports
  );

  can(
    [ProjectPermissionCommitsActions.Read, ProjectPermissionCommitsActions.PerformRollback],
    ProjectPermissionSub.Commits
  );

  can([ProjectPermissionActions.Read], ProjectPermissionSub.SecretApproval);
  can([ProjectPermissionSecretRotationActions.Read], ProjectPermissionSub.SecretRotation);

  can([ProjectPermissionActions.Read, ProjectPermissionActions.Create], ProjectPermissionSub.SecretRollback);

  can([ProjectPermissionMemberActions.Read, ProjectPermissionMemberActions.Create], ProjectPermissionSub.Member);

  can([ProjectPermissionGroupActions.Read], ProjectPermissionSub.Groups);

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Integrations
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Webhooks
  );

  can(
    [
      ProjectPermissionIdentityActions.Read,
      ProjectPermissionIdentityActions.Edit,
      ProjectPermissionIdentityActions.Create,
      ProjectPermissionIdentityActions.Delete
    ],
    ProjectPermissionSub.Identity
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.ServiceTokens
  );

  can([ProjectPermissionHoneyTokenActions.Read], ProjectPermissionSub.HoneyTokens);

  can(
    [ProjectPermissionProxiedServiceActions.Read, ProjectPermissionProxiedServiceActions.ReportUsage],
    ProjectPermissionSub.ProxiedServices
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Settings
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Environments
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
    ProjectPermissionSub.Tags
  );

  can([ProjectPermissionActions.Read], ProjectPermissionSub.Role);
  can([ProjectPermissionAuditLogsActions.Read], ProjectPermissionSub.AuditLogs);
  can([ProjectPermissionInsightsActions.Read], ProjectPermissionSub.Insights);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.IpAllowList);

  can([ProjectPermissionCertificateAuthorityActions.Read], ProjectPermissionSub.CertificateAuthorities);
  can([ProjectPermissionCertificatePolicyActions.Read], ProjectPermissionSub.CertificatePolicies);
  can([ProjectPermissionCertificateProfileActions.Read], ProjectPermissionSub.CertificateProfiles);
  can([ProjectPermissionCodeSigningActions.Read], ProjectPermissionSub.CodeSigners);
  can(
    [ProjectPermissionApplicationActions.Read, ProjectPermissionApplicationActions.List],
    ProjectPermissionSub.Application
  );

  can(
    [
      ProjectPermissionCmekActions.Create,
      ProjectPermissionCmekActions.Edit,
      ProjectPermissionCmekActions.Delete,
      ProjectPermissionCmekActions.Read,
      ProjectPermissionCmekActions.Encrypt,
      ProjectPermissionCmekActions.Decrypt,
      ProjectPermissionCmekActions.Sign,
      ProjectPermissionCmekActions.Verify,
      ProjectPermissionCmekActions.GenerateMac,
      ProjectPermissionCmekActions.VerifyMac,
      ProjectPermissionCmekActions.Rotate
    ],
    ProjectPermissionSub.Cmek
  );

  can(
    [
      ProjectPermissionSecretSyncActions.Create,
      ProjectPermissionSecretSyncActions.Edit,
      ProjectPermissionSecretSyncActions.Delete,
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSecretSyncActions.SyncSecrets,
      ProjectPermissionSecretSyncActions.ImportSecrets,
      ProjectPermissionSecretSyncActions.RemoveSecrets
    ],
    ProjectPermissionSub.SecretSyncs
  );

  can([ProjectPermissionSecretValidationRuleActions.Read], ProjectPermissionSub.SecretValidationRules);

  can(
    [
      ProjectPermissionSecretScanningDataSourceActions.Read,
      ProjectPermissionSecretScanningDataSourceActions.TriggerScans,
      ProjectPermissionSecretScanningDataSourceActions.ReadScans,
      ProjectPermissionSecretScanningDataSourceActions.ReadResources
    ],
    ProjectPermissionSub.SecretScanningDataSources
  );

  can(
    [ProjectPermissionSecretScanningFindingActions.Read, ProjectPermissionSecretScanningFindingActions.Update],
    ProjectPermissionSub.SecretScanningFindings
  );

  can([ProjectPermissionSecretScanningConfigActions.Read], ProjectPermissionSub.SecretScanningConfigs);

  can(
    [
      ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
      ProjectPermissionSecretEventActions.SubscribeToDeleteEvents,
      ProjectPermissionSecretEventActions.SubscribeToUpdateEvents,
      ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents
    ],
    ProjectPermissionSub.SecretEventSubscriptions
  );

  can(ProjectPermissionAppConnectionActions.Connect, ProjectPermissionSub.AppConnections);

  can(
    [ProjectPermissionHsmConnectorActions.Read, ProjectPermissionHsmConnectorActions.Test],
    ProjectPermissionSub.HsmConnectors
  );

  can([ProjectPermissionApprovalRequestActions.Create], ProjectPermissionSub.ApprovalRequests);

  return rules;
};

const buildViewerPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(
    [ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSecretActions.ReadValue],
    ProjectPermissionSub.Secrets
  );
  can(ProjectPermissionDynamicSecretActions.ReadRootCredential, ProjectPermissionSub.DynamicSecrets);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretImports);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretApproval);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretRollback);
  can(ProjectPermissionSecretRotationActions.Read, ProjectPermissionSub.SecretRotation);
  can(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);
  can(ProjectPermissionGroupActions.Read, ProjectPermissionSub.Groups);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Role);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Integrations);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Webhooks);
  can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.ServiceTokens);
  can(ProjectPermissionHoneyTokenActions.Read, ProjectPermissionSub.HoneyTokens);
  can(
    [ProjectPermissionProxiedServiceActions.Read, ProjectPermissionProxiedServiceActions.ReportUsage],
    ProjectPermissionSub.ProxiedServices
  );
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionAuditLogsActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionInsightsActions.Read, ProjectPermissionSub.Insights);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionCertificateAuthorityActions.Read, ProjectPermissionSub.CertificateAuthorities);
  can(ProjectPermissionCertificateActions.Read, ProjectPermissionSub.Certificates);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.CertificateInventoryViews);
  can(ProjectPermissionPkiTemplateActions.Read, ProjectPermissionSub.CertificateTemplates);
  can(ProjectPermissionCertificatePolicyActions.Read, ProjectPermissionSub.CertificatePolicies);
  can(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);
  can(ProjectPermissionSecretSyncActions.Read, ProjectPermissionSub.SecretSyncs);
  can(ProjectPermissionSecretValidationRuleActions.Read, ProjectPermissionSub.SecretValidationRules);
  can(ProjectPermissionPkiSyncActions.Read, ProjectPermissionSub.PkiSyncs);
  can(
    [ProjectPermissionApplicationActions.Read, ProjectPermissionApplicationActions.List],
    ProjectPermissionSub.Application
  );
  can(ProjectPermissionPkiDiscoveryActions.Read, ProjectPermissionSub.PkiDiscovery);
  can(ProjectPermissionPkiCertificateInstallationActions.Read, ProjectPermissionSub.PkiCertificateInstallations);
  can(ProjectPermissionCodeSigningActions.Read, ProjectPermissionSub.CodeSigners);
  can(ProjectPermissionCommitsActions.Read, ProjectPermissionSub.Commits);

  can(
    [
      ProjectPermissionSecretScanningDataSourceActions.Read,
      ProjectPermissionSecretScanningDataSourceActions.ReadScans,
      ProjectPermissionSecretScanningDataSourceActions.ReadResources
    ],
    ProjectPermissionSub.SecretScanningDataSources
  );

  can([ProjectPermissionSecretScanningFindingActions.Read], ProjectPermissionSub.SecretScanningFindings);

  can([ProjectPermissionSecretScanningConfigActions.Read], ProjectPermissionSub.SecretScanningConfigs);

  can(
    [
      ProjectPermissionSecretEventActions.SubscribeToCreationEvents,
      ProjectPermissionSecretEventActions.SubscribeToDeleteEvents,
      ProjectPermissionSecretEventActions.SubscribeToUpdateEvents,
      ProjectPermissionSecretEventActions.SubscribeToImportMutationEvents
    ],
    ProjectPermissionSub.SecretEventSubscriptions
  );

  return rules;
};

const buildNoAccessProjectPermission = () => {
  const { rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  return rules;
};

// General
export const projectAdminPermissions = buildAdminPermissionRules();
export const projectMemberPermissions = buildMemberPermissionRules();
export const projectViewerPermission = buildViewerPermissionRules();
export const projectNoAccessPermissions = buildNoAccessProjectPermission();

// The roles a project type gets when its product registers none. A product that only adds a role spreads these in.
export const genericProjectRoles = {
  [ProjectMembershipRole.Admin]: projectAdminPermissions,
  [ProjectMembershipRole.Member]: projectMemberPermissions,
  [ProjectMembershipRole.Viewer]: projectViewerPermission,
  [ProjectMembershipRole.NoAccess]: projectNoAccessPermissions
};
