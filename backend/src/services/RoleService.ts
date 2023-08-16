import { AbilityBuilder, MongoAbility, RawRuleOf, createMongoAbility } from "@casl/ability";
import { MembershipOrg } from "../models";
import { IRole } from "../models/role";
import { BadRequestError, UnauthorizedRequestError } from "../utils/errors";
import { ACCEPTED } from "../variables";

export enum GeneralPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum WorkspacePermissionActions {
  Read = "read",
  Create = "create"
}

export enum OrgPermissionSubjects {
  Workspace = "workspace",
  Role = "role",
  Member = "member",
  Settings = "settings",
  IncidentAccount = "incident-contact",
  Sso = "sso",
  Billing = "billing",
  SecretScanning = "secret-scanning"
}

export type OrgPermissionSet =
  | [WorkspacePermissionActions, OrgPermissionSubjects.Workspace]
  | [GeneralPermissionActions, OrgPermissionSubjects.Role]
  | [GeneralPermissionActions, OrgPermissionSubjects.Member]
  | [GeneralPermissionActions, OrgPermissionSubjects.Settings]
  | [GeneralPermissionActions, OrgPermissionSubjects.IncidentAccount]
  | [GeneralPermissionActions, OrgPermissionSubjects.Sso]
  | [GeneralPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [GeneralPermissionActions, OrgPermissionSubjects.Billing];

const buildAdminPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  // ws permissions
  can(WorkspacePermissionActions.Read, OrgPermissionSubjects.Workspace);
  can(WorkspacePermissionActions.Create, OrgPermissionSubjects.Workspace);
  // role permission
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Role);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Role);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Role);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Role);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Member);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Member);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Member);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Member);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.SecretScanning);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.SecretScanning);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.SecretScanning);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.SecretScanning);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Settings);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Settings);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Settings);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.IncidentAccount);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.IncidentAccount);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.IncidentAccount);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Sso);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Sso);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Sso);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Sso);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Billing);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Billing);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Billing);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Billing);

  return build();
};

export const adminPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);

  can(WorkspacePermissionActions.Read, OrgPermissionSubjects.Workspace);
  can(WorkspacePermissionActions.Create, OrgPermissionSubjects.Workspace);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Member);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Role);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Billing);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Sso);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.SecretScanning);

  return build();
};

export const memberPermissions = buildMemberPermission();

export const getUserOrgPermissions = async (userId: string, orgId: string) => {
  // TODO(akhilmhdh): speed this up by pulling from cache later
  const membership = await MembershipOrg.findOne({
    user: userId,
    organization: orgId,
    status: ACCEPTED
  })
    .populate<{ customRole: IRole & { permissions: RawRuleOf<MongoAbility<OrgPermissionSet>>[] } }>(
      "customRole"
    )
    .exec();

  if (!membership || (membership.role === "custom" && !membership.customRole)) {
    throw UnauthorizedRequestError({ message: "User doesn't belong to organization" });
  }

  if (membership.role === "admin" || membership.role === "owner")
    return { permission: adminPermissions, membership };

  if (membership.role === "member") return { permission: memberPermissions, membership };

  if (membership.role === "custom") {
    const permission = createMongoAbility<OrgPermissionSet>(membership.customRole.permissions);
    return { permission, membership };
  }

  throw BadRequestError({ message: "User role not found" });
};
