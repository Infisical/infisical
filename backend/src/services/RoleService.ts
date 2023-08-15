import { AbilityBuilder, MongoAbility, RawRuleOf, createMongoAbility } from "@casl/ability";
import { MembershipOrg } from "../models";
import { IRole } from "../models/role";
import { BadRequestError, UnauthorizedRequestError } from "../utils/errors";

export enum GeneralPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum OrgPermissionSubjects {
  Workspace = "workspace",
  Role = "role",
  Member = "member",
  Settings = "settings",
  ServiceAccount = "service-account",
  IncidentAccount = "incident-contact",
  Sso = "sso",
  Billing = "billing"
}

export type OrgPermissionSet =
  | [GeneralPermissionActions, OrgPermissionSubjects.Workspace]
  | [GeneralPermissionActions, OrgPermissionSubjects.Role]
  | [GeneralPermissionActions, OrgPermissionSubjects.Member]
  | [GeneralPermissionActions, OrgPermissionSubjects.Settings]
  | [GeneralPermissionActions, OrgPermissionSubjects.ServiceAccount]
  | [GeneralPermissionActions, OrgPermissionSubjects.IncidentAccount]
  | [GeneralPermissionActions, OrgPermissionSubjects.Sso]
  | [GeneralPermissionActions, OrgPermissionSubjects.Billing];

const buildAdminPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  // ws permissions
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Workspace);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Workspace);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Workspace);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Workspace);
  // role permission
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Role);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Role);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Role);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Role);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Member);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Member);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Member);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Member);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.Settings);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.Settings);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.Settings);

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.ServiceAccount);
  can(GeneralPermissionActions.Create, OrgPermissionSubjects.ServiceAccount);
  can(GeneralPermissionActions.Edit, OrgPermissionSubjects.ServiceAccount);
  can(GeneralPermissionActions.Delete, OrgPermissionSubjects.ServiceAccount);

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

  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Workspace);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Member);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Role);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Billing);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Sso);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.ServiceAccount);

  return build();
};

export const memberPermissions = buildMemberPermission();

export const getUserOrgPermissions = async (userId: string, orgId: string) => {
  // TODO(akhilmhdh): speed this up by pulling from cache later
  const orgMembership = await MembershipOrg.findOne({ user: userId, organization: orgId })
    .populate<{ customRole: IRole & { permissions: RawRuleOf<MongoAbility<OrgPermissionSet>>[] } }>(
      "customRole"
    )
    .exec();

  if (!orgMembership || (orgMembership.role === "custom" && !orgMembership.customRole)) {
    throw UnauthorizedRequestError({ message: "User doesn't belong to organization" });
  }

  if (orgMembership.role === "admin" || orgMembership.role === "owner") return adminPermissions;

  if (orgMembership.role === "member") return memberPermissions;

  if (orgMembership.role === "custom") {
    const permission = createMongoAbility<OrgPermissionSet>(orgMembership.customRole.permissions);
    return permission;
  }

  throw BadRequestError({ message: "User role not found" });
};
