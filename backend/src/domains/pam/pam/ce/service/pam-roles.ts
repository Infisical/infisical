import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

import {
  ProjectPermissionGroupActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub,
  projectAdminPermissions
} from "@app/domains/platform/organizations-projects/ce/module";

// PAM project roles and the roles a PAM folder or account membership holds.
export enum PamResourcePermissionSub {
  PamResource = "pam-resource" // folders and accounts
}

export enum PamResourcePermissionActions {
  ReadFolder = "read-folder",
  EditFolder = "edit-folder",
  DeleteFolder = "delete-folder",
  ReadAccounts = "read-accounts",
  CreateAccounts = "create-accounts",
  EditAccounts = "edit-accounts",
  DeleteAccounts = "delete-accounts",
  LaunchSessions = "launch-sessions",
  ViewSessions = "view-sessions",
  TerminateSessions = "terminate-sessions",
  ViewCredentials = "view-credentials",
  ApproveRequests = "approve-requests",
  RevokeGrants = "revoke-grants",
  ManagePolicies = "manage-policies",
  ManageRotation = "manage-rotation",
  ManageMembers = "manage-members",
  ViewAuditLogs = "view-audit-logs"
}

export type PamResourcePermissionSet = [PamResourcePermissionActions, PamResourcePermissionSub.PamResource];

// PAM product membership is stored as plain project membership (PamProductRole.Admin/Member are the
// `admin`/`member` project role slugs), so these two sets are what those slugs mean inside a PAM
// project. The split exists to constrain members, not admins: everything a product member is entitled
// to comes from their resource-level (folder/account) memberships, which PAM resolves separately and
// which are not project role rules at all. Their project ability is directory visibility and nothing
// more. Managing identities, users and groups is a product admin responsibility — a member who inherited
// the generic Member identity rules could attach an auth method to a product admin identity and log in
// with its PAM access.
const buildPamProjectMemberPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<ProjectPermissionSet>>(createMongoAbility);

  can([ProjectPermissionMemberActions.Read], ProjectPermissionSub.Member);
  can([ProjectPermissionGroupActions.Read], ProjectPermissionSub.Groups);
  can([ProjectPermissionIdentityActions.Read], ProjectPermissionSub.Identity);

  return rules;
};

const buildPamResourceAdminPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<PamResourcePermissionSet>>(createMongoAbility);
  can(
    [
      PamResourcePermissionActions.ReadFolder,
      PamResourcePermissionActions.EditFolder,
      PamResourcePermissionActions.DeleteFolder,
      PamResourcePermissionActions.ReadAccounts,
      PamResourcePermissionActions.CreateAccounts,
      PamResourcePermissionActions.EditAccounts,
      PamResourcePermissionActions.DeleteAccounts,
      PamResourcePermissionActions.LaunchSessions,
      PamResourcePermissionActions.ViewSessions,
      PamResourcePermissionActions.TerminateSessions,
      PamResourcePermissionActions.ViewCredentials,
      PamResourcePermissionActions.ApproveRequests,
      PamResourcePermissionActions.RevokeGrants,
      PamResourcePermissionActions.ManagePolicies,
      PamResourcePermissionActions.ManageRotation,
      PamResourcePermissionActions.ManageMembers,
      PamResourcePermissionActions.ViewAuditLogs
    ],
    PamResourcePermissionSub.PamResource
  );
  return rules;
};

const buildPamResourceOperatorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<PamResourcePermissionSet>>(createMongoAbility);
  can(
    [
      PamResourcePermissionActions.ReadFolder,
      PamResourcePermissionActions.ReadAccounts,
      PamResourcePermissionActions.LaunchSessions,
      PamResourcePermissionActions.ViewCredentials
    ],
    PamResourcePermissionSub.PamResource
  );
  return rules;
};

const buildPamResourceConnectorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<PamResourcePermissionSet>>(createMongoAbility);
  can(
    [
      PamResourcePermissionActions.ReadFolder,
      PamResourcePermissionActions.ReadAccounts,
      PamResourcePermissionActions.LaunchSessions
    ],
    PamResourcePermissionSub.PamResource
  );
  return rules;
};

const buildPamResourceAuditorPermissionRules = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<PamResourcePermissionSet>>(createMongoAbility);
  can(
    [
      PamResourcePermissionActions.ReadFolder,
      PamResourcePermissionActions.ReadAccounts,
      PamResourcePermissionActions.ViewSessions,
      PamResourcePermissionActions.ViewAuditLogs
    ],
    PamResourcePermissionSub.PamResource
  );
  return rules;
};

// The product admin owns the PAM project, so it keeps the full project Admin ability it has always had.
export const pamProjectAdminPermissions = projectAdminPermissions;
export const pamProjectMemberPermissions = buildPamProjectMemberPermissionRules();
export const pamResourceAdminPermissions = buildPamResourceAdminPermissionRules();
export const pamResourceOperatorPermissions = buildPamResourceOperatorPermissionRules();
export const pamResourceConnectorPermissions = buildPamResourceConnectorPermissionRules();
export const pamResourceAuditorPermissions = buildPamResourceAuditorPermissionRules();
