import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";

import { conditionsMatcher } from "@app/lib/casl";

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
  Scim = "scim",
  Ldap = "ldap",
  Groups = "groups",
  Billing = "billing",
  SecretScanning = "secret-scanning",
  Identity = "identity",
  Kms = "kms"
}

export type OrgPermissionSet =
  | [OrgPermissionActions.Read, OrgPermissionSubjects.Workspace]
  | [OrgPermissionActions.Create, OrgPermissionSubjects.Workspace]
  | [OrgPermissionActions, OrgPermissionSubjects.Role]
  | [OrgPermissionActions, OrgPermissionSubjects.Member]
  | [OrgPermissionActions, OrgPermissionSubjects.Settings]
  | [OrgPermissionActions, OrgPermissionSubjects.IncidentAccount]
  | [OrgPermissionActions, OrgPermissionSubjects.Sso]
  | [OrgPermissionActions, OrgPermissionSubjects.Scim]
  | [OrgPermissionActions, OrgPermissionSubjects.Ldap]
  | [OrgPermissionActions, OrgPermissionSubjects.Groups]
  | [OrgPermissionActions, OrgPermissionSubjects.SecretScanning]
  | [OrgPermissionActions, OrgPermissionSubjects.Billing]
  | [OrgPermissionActions, OrgPermissionSubjects.Identity]
  | [OrgPermissionActions, OrgPermissionSubjects.Kms];

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

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Scim);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Scim);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Scim);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Ldap);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Ldap);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Ldap);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Groups);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Groups);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Groups);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Billing);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Billing);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Billing);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Identity);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Kms);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Kms);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.Kms);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.Kms);

  return build({ conditionsMatcher });
};

export const orgAdminPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.Workspace);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.Member);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Groups);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Role);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Settings);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);
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

export const orgMemberPermissions = buildMemberPermission();

const buildNoAccessPermission = () => {
  const { build } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  return build({ conditionsMatcher });
};

export const orgNoAccessPermissions = buildNoAccessPermission();
