import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

import {
  ProjectPermissionActions,
  ProjectPermissionCertificateActions,
  ProjectPermissionCmekActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionKmipActions,
  ProjectPermissionMemberActions,
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSet,
  ProjectPermissionSshHostActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";

const buildAdminPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  // Admins get full access to everything
  [
    ProjectPermissionSub.SecretFolders,
    ProjectPermissionSub.SecretImports,
    ProjectPermissionSub.SecretApproval,
    ProjectPermissionSub.Role,
    ProjectPermissionSub.Integrations,
    ProjectPermissionSub.Webhooks,
    ProjectPermissionSub.ServiceTokens,
    ProjectPermissionSub.Settings,
    ProjectPermissionSub.Environments,
    ProjectPermissionSub.Tags,
    ProjectPermissionSub.AuditLogs,
    ProjectPermissionSub.IpAllowList,
    ProjectPermissionSub.CertificateAuthorities,
    ProjectPermissionSub.CertificateTemplates,
    ProjectPermissionSub.PkiAlerts,
    ProjectPermissionSub.PkiCollections,
    ProjectPermissionSub.SshCertificateAuthorities,
    ProjectPermissionSub.SshCertificates,
    ProjectPermissionSub.SshCertificateTemplates,
    ProjectPermissionSub.SshHostGroups
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

  can(
    [
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionCertificateActions.Edit,
      ProjectPermissionCertificateActions.Create,
      ProjectPermissionCertificateActions.Delete,
      ProjectPermissionCertificateActions.ReadPrivateKey
    ],
    ProjectPermissionSub.Certificates
  );

  can(
    [
      ProjectPermissionSshHostActions.Edit,
      ProjectPermissionSshHostActions.Read,
      ProjectPermissionSshHostActions.Create,
      ProjectPermissionSshHostActions.Delete,
      ProjectPermissionSshHostActions.IssueHostCert
    ],
    ProjectPermissionSub.SshHosts
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
      ProjectPermissionGroupActions.GrantPrivileges
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
      ProjectPermissionIdentityActions.AssumePrivileges
    ],
    ProjectPermissionSub.Identity
  );

  can(
    [
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.DescribeSecret,
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
      ProjectPermissionCmekActions.Verify
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

  return rules;
};

const buildMemberPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(
    [
      ProjectPermissionSecretActions.DescribeAndReadValue,
      ProjectPermissionSecretActions.DescribeSecret,
      ProjectPermissionSecretActions.ReadValue,
      ProjectPermissionSecretActions.Edit,
      ProjectPermissionSecretActions.Create,
      ProjectPermissionSecretActions.Delete
    ],
    ProjectPermissionSub.Secrets
  );
  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Delete
    ],
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
  can([ProjectPermissionActions.Read], ProjectPermissionSub.AuditLogs);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.IpAllowList);

  // double check if all CRUD are needed for CA and Certificates
  can([ProjectPermissionActions.Read], ProjectPermissionSub.CertificateAuthorities);

  can(
    [
      ProjectPermissionCertificateActions.Read,
      ProjectPermissionCertificateActions.Edit,
      ProjectPermissionCertificateActions.Create,
      ProjectPermissionCertificateActions.Delete
    ],
    ProjectPermissionSub.Certificates
  );

  can([ProjectPermissionActions.Read], ProjectPermissionSub.CertificateTemplates);

  can([ProjectPermissionActions.Read], ProjectPermissionSub.PkiAlerts);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.PkiCollections);

  can([ProjectPermissionActions.Read], ProjectPermissionSub.SshCertificates);
  can([ProjectPermissionActions.Create], ProjectPermissionSub.SshCertificates);
  can([ProjectPermissionActions.Read], ProjectPermissionSub.SshCertificateTemplates);

  can([ProjectPermissionSshHostActions.Read], ProjectPermissionSub.SshHosts);
  can([ProjectPermissionPkiSubscriberActions.Read], ProjectPermissionSub.PkiSubscribers);

  can(
    [
      ProjectPermissionCmekActions.Create,
      ProjectPermissionCmekActions.Edit,
      ProjectPermissionCmekActions.Delete,
      ProjectPermissionCmekActions.Read,
      ProjectPermissionCmekActions.Encrypt,
      ProjectPermissionCmekActions.Decrypt,
      ProjectPermissionCmekActions.Sign,
      ProjectPermissionCmekActions.Verify
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

  return rules;
};

const buildViewerPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(ProjectPermissionSecretActions.DescribeAndReadValue, ProjectPermissionSub.Secrets);
  can(ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSub.Secrets);
  can(ProjectPermissionSecretActions.ReadValue, ProjectPermissionSub.Secrets);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SecretFolders);
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
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.AuditLogs);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.IpAllowList);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.CertificateAuthorities);
  can(ProjectPermissionCertificateActions.Read, ProjectPermissionSub.Certificates);
  can(ProjectPermissionCmekActions.Read, ProjectPermissionSub.Cmek);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SshCertificates);
  can(ProjectPermissionActions.Read, ProjectPermissionSub.SshCertificateTemplates);
  can(ProjectPermissionSecretSyncActions.Read, ProjectPermissionSub.SecretSyncs);

  return rules;
};

const buildNoAccessProjectPermission = () => {
  const { rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);
  return rules;
};

const buildSshHostBootstrapPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(
    [ProjectPermissionSshHostActions.Create, ProjectPermissionSshHostActions.IssueHostCert],
    ProjectPermissionSub.SshHosts
  );

  return rules;
};

const buildCryptographicOperatorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can(
    [
      ProjectPermissionCmekActions.Encrypt,
      ProjectPermissionCmekActions.Decrypt,
      ProjectPermissionCmekActions.Sign,
      ProjectPermissionCmekActions.Verify
    ],
    ProjectPermissionSub.Cmek
  );

  return rules;
};

// General
export const projectAdminPermissions = buildAdminPermissionRules();
export const projectMemberPermissions = buildMemberPermissionRules();
export const projectViewerPermission = buildViewerPermissionRules();
export const projectNoAccessPermissions = buildNoAccessProjectPermission();

// SSH
export const sshHostBootstrapPermissions = buildSshHostBootstrapPermissionRules();

// KMS
export const cryptographicOperatorPermissions = buildCryptographicOperatorPermissionRules();
