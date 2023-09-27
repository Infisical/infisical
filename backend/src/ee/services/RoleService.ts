import { AbilityBuilder, MongoAbility, RawRuleOf, createMongoAbility } from "@casl/ability";
import { MembershipOrg } from "../../models";
import { IRole } from "../models/role";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import { ACCEPTED } from "../../variables";
import { conditionsMatcher } from "./ProjectRoleService";

export enum OrgPermissionActions {
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
  IncidentAccount = "incident-contact",
  Sso = "sso",
  Billing = "billing",
  SecretScanning = "secret-scanning"
}

export type OrgPermissionSet =
  | [OrgPermissionActions.Read, OrgPermissionSubjects.Workspace]
  | [OrgPermissionActions.Create, OrgPermissionSubjects.Workspace]
  | [OrgPermissionActions, OrgPermissionSubjects.Role]
  | [OrgPermissionActions, OrgPermissionSubjects.Member]
  | [OrgPermissionActions, OrgPermissionSubjects.Settings]
  | [OrgPermissionActions, OrgPermissionSubjects.IncidentAccount]
  | [OrgPermissionActions, OrgPermissionSubjects.Sso]
  | [OrgPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [OrgPermissionActions, OrgPermissionSubjects.Billing];

const buildAdminPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  // ws permissions
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Workspace);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);
  // role permission
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Role);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Member);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.SecretScanning);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Settings);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Settings);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.IncidentAccount);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.IncidentAccount);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.IncidentAccount);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Sso);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Sso);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Sso);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Billing);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Billing);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Billing);

  return build({ conditionsMatcher });
};

export const adminPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Workspace);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Sso);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.SecretScanning);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.SecretScanning);

  return build({ conditionsMatcher });
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

  if (membership.role === "admin") return { permission: adminPermissions, membership };

  if (membership.role === "member") return { permission: memberPermissions, membership };

  if (membership.role === "custom") {
    const permission = createMongoAbility<OrgPermissionSet>(membership.customRole.permissions, {
      conditionsMatcher
    });
    return { permission, membership };
  }

  throw BadRequestError({ message: "User role not found" });
};
