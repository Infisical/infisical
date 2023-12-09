import { Types } from "mongoose";
import { AbilityBuilder, MongoAbility, RawRuleOf, createMongoAbility } from "@casl/ability";
import { 
  IIdentity,
  IdentityMembershipOrg,
  MembershipOrg
} from "../../models";
import { ActorType, IRole, Role } from "../models";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import { ACCEPTED, ADMIN, CUSTOM, MEMBER, NO_ACCESS} from "../../variables";
import { conditionsMatcher } from "./ProjectRoleService";
import { AuthData } from "../../interfaces/middleware";

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
  SecretScanning = "secret-scanning",
  Identity = "identity"
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
  | [OrgPermissionActions, OrgPermissionSubjects.Billing]
  | [OrgPermissionActions, OrgPermissionSubjects.Identity];

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

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Identity);

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

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Identity);

  return build({ conditionsMatcher });
};

export const memberPermissions = buildMemberPermission();

const buildNoAccessPermission = () => {
  const { build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  return build({ conditionsMatcher });
}

export const noAccessPermissions = buildNoAccessPermission();

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

  if (membership.role === ADMIN) return { permission: adminPermissions, membership };

  if (membership.role === MEMBER) return { permission: memberPermissions, membership };
  
  if (membership.role === NO_ACCESS) return { permission: noAccessPermissions, membership }

  if (membership.role === CUSTOM) {
    const permission = createMongoAbility<OrgPermissionSet>(membership.customRole.permissions, {
      conditionsMatcher
    });
    return { permission, membership };
  }

  throw BadRequestError({ message: "User role not found" });
};

/**
 * Return permissions for user/service pertaining to organization with id [organizationId]
 * 
 * Note: should not rely on this function for ST V2 authorization logic
 * b/c ST V2 does not support role-based access control but also not organization-level resources
 */
 export const getAuthDataOrgPermissions = async ({
  authData,
  organizationId
}: {
  authData: AuthData;
  organizationId: Types.ObjectId;
}) => {
  let role: "admin" | "member" | "no-access" | "custom";
  let customRole;
  
  switch (authData.actor.type) {
    case ActorType.USER: {
      const membershipOrg = await MembershipOrg.findOne({
        user: authData.authPayload._id,
        organization: organizationId,
        status: ACCEPTED
      })
      .populate<{ customRole: IRole & { permissions: RawRuleOf<MongoAbility<OrgPermissionSet>>[] } }>(
        "customRole"
      )
      .exec();
      
      if (!membershipOrg || (membershipOrg.role === "custom" && !membershipOrg.customRole)) {
        throw UnauthorizedRequestError({ message: "User doesn't belong to organization" });
      }
      
      role = membershipOrg.role;
      customRole = membershipOrg.customRole;
      break;
    }
    case ActorType.SERVICE: {
      throw UnauthorizedRequestError({
        message: "Failed to access organization-level resources with service token"
      });
    }
    case ActorType.IDENTITY: {
      const identityMembershipOrg = await IdentityMembershipOrg.findOne({
        identity: authData.authPayload._id,
        organization: organizationId
      })
      .populate<{
        customRole: IRole & { permissions: RawRuleOf<MongoAbility<OrgPermissionSet>>[] };
        identity: IIdentity
      }>("customRole identity")
      .exec();
      
      if (!identityMembershipOrg || (identityMembershipOrg.role === "custom" && !identityMembershipOrg.customRole)) {
        throw UnauthorizedRequestError();
      }
      
      role = identityMembershipOrg.role;
      customRole = identityMembershipOrg.customRole;
      break;
    }
    default:
      throw UnauthorizedRequestError();
  }

  switch (role) {
    case ADMIN:
      return { permission: adminPermissions };
    case MEMBER:
      return { permission: memberPermissions };
    case NO_ACCESS:
      return { permission: noAccessPermissions };
    case CUSTOM: {
      if (!customRole) throw UnauthorizedRequestError();
      return {
        permission: createMongoAbility<OrgPermissionSet>(
          customRole.permissions, 
          { conditionsMatcher }
        )
      };
    }
  }
}

export const getOrgRolePermissions = async (role: string, orgId: string) => {
  const isCustomRole = ![ADMIN, MEMBER, NO_ACCESS].includes(role);
  if (isCustomRole) {
    const orgRole = await Role.findOne({
      slug: role,
      isOrgRole: true,
      organization: new Types.ObjectId(orgId)
    });

    if (!orgRole) throw BadRequestError({ message: "Org Role not found" });
    
    return createMongoAbility<OrgPermissionSet>(orgRole.permissions as RawRuleOf<MongoAbility<OrgPermissionSet>>[], {
      conditionsMatcher
    });
  }

  switch (role) {
    case ADMIN:
      return adminPermissions;
    case MEMBER:
      return memberPermissions;
    case NO_ACCESS:
      return noAccessPermissions;
    default:
      throw BadRequestError({ message: "User org role not found" });
  }
}

/**
 * Extracts and formats permissions from a CASL Ability object or a raw permission set. 
 * @param ability
 * @returns 
 */
const extractPermissions = (ability: any) => {
  return ability.A.map((permission: any) => `${permission.action}_${permission.subject}`);
}

/**
 * Compares two sets of permissions to determine if the first set is at least as privileged as the second set.
 * The function checks if all permissions in the second set are contained within the first set and if the first set has equal or more permissions.
 * 
*/
export const isAtLeastAsPrivilegedOrg = (permissions1: MongoAbility<OrgPermissionSet> | OrgPermissionSet, permissions2: MongoAbility<OrgPermissionSet> | OrgPermissionSet) => {

  const set1 = new Set(extractPermissions(permissions1));
  const set2 = new Set(extractPermissions(permissions2));
  
  for (const perm of set2) {
    if (!set1.has(perm)) {
      return false;
    }
  }

  return set1.size >= set2.size;
}