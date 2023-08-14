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
  Role = "role"
}

export type OrgPermissionSet =
  | [GeneralPermissionActions, OrgPermissionSubjects.Workspace]
  | [GeneralPermissionActions, OrgPermissionSubjects.Role];

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

  return build();
};

export const adminPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);

  // ws permissions
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Workspace);
  can(GeneralPermissionActions.Read, OrgPermissionSubjects.Role);

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
