import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

import {
  ProjectPermissionActions,
  ProjectPermissionApprovalRequestActions,
  ProjectPermissionApprovalRequestGrantActions,
  ProjectPermissionCertificateProfileActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub
} from "@app/domains/platform/organizations-projects/ce/module";

// The roles a certificate application membership holds, and what a project admin gets on an application without one.
export enum ApplicationPermissionSub {
  Application = "certificate-application",
  ApplicationEnrollment = "certificate-application-enrollment",
  ApprovalPolicies = "approval-policies",
  Certificates = "certificates",
  CertificateInventoryViews = "certificate-inventory-views",
  PkiSyncs = "pki-syncs",
  PkiAlerts = "pki-alerts",
  ApprovalRequests = "approval-requests",
  ApprovalRequestGrants = "approval-request-grants",
  Member = "member"
}

export enum ApplicationPermissionActions {
  Read = "read",
  Edit = "edit",
  Delete = "delete",
  ManageProfiles = "manage-profiles"
}

export enum ApplicationEnrollmentPermissionActions {
  Read = "read",
  Edit = "edit",
  RevealAcmeEabSecret = "reveal-acme-eab-secret",
  RotateAcmeEabSecret = "rotate-acme-eab-secret",
  GenerateScepChallenge = "generate-scep-challenge"
}

export enum ApplicationApprovalPolicyPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum ApplicationCertificatePermissionActions {
  Read = "read",
  List = "list",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  ReadPrivateKey = "read-private-key",
  Import = "import"
}

export enum ApplicationPkiSyncPermissionActions {
  Read = "read",
  List = "list",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  SyncCertificates = "sync-certificates",
  ImportCertificates = "import-certificates",
  RemoveCertificates = "remove-certificates",
  SetPostSyncCommand = "set-post-sync-command",
  SetHealthCheckCommand = "set-health-check-command",
  SetTargetHost = "set-target-host"
}

export type ApplicationPermissionSet =
  | [ApplicationPermissionActions, ApplicationPermissionSub.Application]
  | [ApplicationEnrollmentPermissionActions, ApplicationPermissionSub.ApplicationEnrollment]
  | [ApplicationApprovalPolicyPermissionActions, ApplicationPermissionSub.ApprovalPolicies]
  | [ApplicationCertificatePermissionActions, ApplicationPermissionSub.Certificates]
  | [ProjectPermissionActions, ApplicationPermissionSub.CertificateInventoryViews]
  | [ApplicationPkiSyncPermissionActions, ApplicationPermissionSub.PkiSyncs]
  | [ProjectPermissionActions, ApplicationPermissionSub.PkiAlerts]
  | [ProjectPermissionApprovalRequestActions, ApplicationPermissionSub.ApprovalRequests]
  | [ProjectPermissionApprovalRequestGrantActions, ApplicationPermissionSub.ApprovalRequestGrants]
  | [ProjectPermissionMemberActions, ApplicationPermissionSub.Member]
  | [ProjectPermissionCertificateProfileActions, ProjectPermissionSub.CertificateProfiles];

const buildApplicationAdminPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ApplicationPermissionSet>>(createMongoAbility);

  can(
    [ApplicationPermissionActions.Read, ApplicationPermissionActions.Edit, ApplicationPermissionActions.Delete],
    ApplicationPermissionSub.Application
  );

  can(
    [
      ApplicationEnrollmentPermissionActions.Read,
      ApplicationEnrollmentPermissionActions.Edit,
      ApplicationEnrollmentPermissionActions.RevealAcmeEabSecret,
      ApplicationEnrollmentPermissionActions.RotateAcmeEabSecret,
      ApplicationEnrollmentPermissionActions.GenerateScepChallenge
    ],
    ApplicationPermissionSub.ApplicationEnrollment
  );

  can(
    [
      ApplicationApprovalPolicyPermissionActions.Read,
      ApplicationApprovalPolicyPermissionActions.Create,
      ApplicationApprovalPolicyPermissionActions.Edit,
      ApplicationApprovalPolicyPermissionActions.Delete
    ],
    ApplicationPermissionSub.ApprovalPolicies
  );

  can(
    [
      ApplicationCertificatePermissionActions.Read,
      ApplicationCertificatePermissionActions.List,
      ApplicationCertificatePermissionActions.Create,
      ApplicationCertificatePermissionActions.Edit,
      ApplicationCertificatePermissionActions.Delete,
      ApplicationCertificatePermissionActions.ReadPrivateKey,
      ApplicationCertificatePermissionActions.Import
    ],
    ApplicationPermissionSub.Certificates
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Delete
    ],
    ApplicationPermissionSub.CertificateInventoryViews
  );

  can(
    [
      ApplicationPkiSyncPermissionActions.Read,
      ApplicationPkiSyncPermissionActions.List,
      ApplicationPkiSyncPermissionActions.Create,
      ApplicationPkiSyncPermissionActions.Edit,
      ApplicationPkiSyncPermissionActions.Delete,
      ApplicationPkiSyncPermissionActions.SyncCertificates,
      ApplicationPkiSyncPermissionActions.ImportCertificates,
      ApplicationPkiSyncPermissionActions.RemoveCertificates,
      ApplicationPkiSyncPermissionActions.SetPostSyncCommand,
      ApplicationPkiSyncPermissionActions.SetHealthCheckCommand,
      ApplicationPkiSyncPermissionActions.SetTargetHost
    ],
    ApplicationPermissionSub.PkiSyncs
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Delete
    ],
    ApplicationPermissionSub.PkiAlerts
  );

  can(
    [ProjectPermissionApprovalRequestActions.Read, ProjectPermissionApprovalRequestActions.Create],
    ApplicationPermissionSub.ApprovalRequests
  );

  can(
    [ProjectPermissionApprovalRequestGrantActions.Read, ProjectPermissionApprovalRequestGrantActions.Revoke],
    ApplicationPermissionSub.ApprovalRequestGrants
  );

  can(
    [
      ProjectPermissionMemberActions.Read,
      ProjectPermissionMemberActions.Create,
      ProjectPermissionMemberActions.Edit,
      ProjectPermissionMemberActions.Delete,
      ProjectPermissionMemberActions.GrantPrivileges,
      ProjectPermissionMemberActions.AssignRole
    ],
    ApplicationPermissionSub.Member
  );

  can(
    [ProjectPermissionCertificateProfileActions.Read, ProjectPermissionCertificateProfileActions.IssueCert],
    ProjectPermissionSub.CertificateProfiles
  );

  return rules;
};

const buildApplicationOperatorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ApplicationPermissionSet>>(createMongoAbility);

  can([ApplicationPermissionActions.Read], ApplicationPermissionSub.Application);
  can(
    [ApplicationEnrollmentPermissionActions.Read, ApplicationEnrollmentPermissionActions.GenerateScepChallenge],
    ApplicationPermissionSub.ApplicationEnrollment
  );
  can([ApplicationApprovalPolicyPermissionActions.Read], ApplicationPermissionSub.ApprovalPolicies);

  can(
    [
      ApplicationCertificatePermissionActions.Read,
      ApplicationCertificatePermissionActions.List,
      ApplicationCertificatePermissionActions.Create,
      ApplicationCertificatePermissionActions.Edit,
      ApplicationCertificatePermissionActions.ReadPrivateKey,
      ApplicationCertificatePermissionActions.Import
    ],
    ApplicationPermissionSub.Certificates
  );

  can(
    [
      ProjectPermissionActions.Read,
      ProjectPermissionActions.Create,
      ProjectPermissionActions.Edit,
      ProjectPermissionActions.Delete
    ],
    ApplicationPermissionSub.CertificateInventoryViews
  );

  can(
    [
      ApplicationPkiSyncPermissionActions.Read,
      ApplicationPkiSyncPermissionActions.List,
      ApplicationPkiSyncPermissionActions.SyncCertificates
    ],
    ApplicationPermissionSub.PkiSyncs
  );
  can([ProjectPermissionActions.Read], ApplicationPermissionSub.PkiAlerts);

  can(
    [ProjectPermissionApprovalRequestActions.Read, ProjectPermissionApprovalRequestActions.Create],
    ApplicationPermissionSub.ApprovalRequests
  );
  can([ProjectPermissionApprovalRequestGrantActions.Read], ApplicationPermissionSub.ApprovalRequestGrants);

  can(
    [ProjectPermissionCertificateProfileActions.Read, ProjectPermissionCertificateProfileActions.IssueCert],
    ProjectPermissionSub.CertificateProfiles
  );

  return rules;
};

const buildApplicationAuditorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ApplicationPermissionSet>>(createMongoAbility);

  can([ApplicationPermissionActions.Read], ApplicationPermissionSub.Application);
  can([ApplicationEnrollmentPermissionActions.Read], ApplicationPermissionSub.ApplicationEnrollment);
  can([ApplicationApprovalPolicyPermissionActions.Read], ApplicationPermissionSub.ApprovalPolicies);
  can(
    [ApplicationCertificatePermissionActions.Read, ApplicationCertificatePermissionActions.List],
    ApplicationPermissionSub.Certificates
  );
  can([ProjectPermissionActions.Read], ApplicationPermissionSub.CertificateInventoryViews);
  can(
    [ApplicationPkiSyncPermissionActions.Read, ApplicationPkiSyncPermissionActions.List],
    ApplicationPermissionSub.PkiSyncs
  );
  can([ProjectPermissionActions.Read], ApplicationPermissionSub.PkiAlerts);
  can([ProjectPermissionApprovalRequestActions.Read], ApplicationPermissionSub.ApprovalRequests);
  can([ProjectPermissionApprovalRequestGrantActions.Read], ApplicationPermissionSub.ApprovalRequestGrants);
  can([ProjectPermissionCertificateProfileActions.Read], ProjectPermissionSub.CertificateProfiles);

  return rules;
};

const buildProjectAdminApplicationFallbackRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ApplicationPermissionSet>>(createMongoAbility);

  can(
    [ApplicationPermissionActions.Read, ApplicationPermissionActions.ManageProfiles],
    ApplicationPermissionSub.Application
  );

  can(
    [
      ProjectPermissionMemberActions.Read,
      ProjectPermissionMemberActions.Create,
      ProjectPermissionMemberActions.Edit,
      ProjectPermissionMemberActions.Delete,
      ProjectPermissionMemberActions.GrantPrivileges,
      ProjectPermissionMemberActions.AssignRole
    ],
    ApplicationPermissionSub.Member
  );

  can(
    [ApplicationCertificatePermissionActions.Read, ApplicationCertificatePermissionActions.List],
    ApplicationPermissionSub.Certificates
  );

  return rules;
};

export const applicationAdminPermissions = buildApplicationAdminPermissionRules();
export const applicationOperatorPermissions = buildApplicationOperatorPermissionRules();
export const applicationAuditorPermissions = buildApplicationAuditorPermissionRules();
export const projectAdminApplicationFallbackPermissions = buildProjectAdminApplicationFallbackRules();
