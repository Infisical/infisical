import { AbilityBuilder, createMongoAbility, ForcedSubject, MongoAbility } from "@casl/ability";
import { z } from "zod";

import {
  CASL_ACTION_SCHEMA_ENUM,
  CASL_ACTION_SCHEMA_NATIVE_ENUM
} from "@app/ee/services/permission/permission-schemas";
import { PermissionConditionSchema } from "@app/ee/services/permission/permission-types";
import { PermissionConditionOperators } from "@app/lib/casl";

export enum OrgPermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum OrgPermissionAppConnectionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  Connect = "connect"
}

export enum OrgPermissionAdminConsoleAction {
  AccessAllProjects = "access-all-projects"
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
  Kms = "kms",
  AdminConsole = "organization-admin-console",
  AuditLogs = "audit-logs",
  ProjectTemplates = "project-templates",
  AppConnections = "app-connections"
}

export type AppConnectionSubjectFields = {
  connectionId: string;
};

export type OrgPermissionSet =
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
  | [OrgPermissionActions, OrgPermissionSubjects.Kms]
  | [OrgPermissionActions, OrgPermissionSubjects.AuditLogs]
  | [OrgPermissionActions, OrgPermissionSubjects.ProjectTemplates]
  | [
      OrgPermissionAppConnectionActions,
      (
        | OrgPermissionSubjects.AppConnections
        | (ForcedSubject<OrgPermissionSubjects.AppConnections> & AppConnectionSubjectFields)
      )
    ]
  | [OrgPermissionAdminConsoleAction, OrgPermissionSubjects.AdminConsole];

const AppConnectionConditionSchema = z
  .object({
    connectionId: z.union([
      z.string(),
      z
        .object({
          [PermissionConditionOperators.$EQ]: PermissionConditionSchema[PermissionConditionOperators.$EQ],
          [PermissionConditionOperators.$NEQ]: PermissionConditionSchema[PermissionConditionOperators.$NEQ],
          [PermissionConditionOperators.$IN]: PermissionConditionSchema[PermissionConditionOperators.$IN]
        })
        .partial()
    ])
  })
  .partial();

export const OrgPermissionSchema = z.discriminatedUnion("subject", [
  z.object({
    subject: z.literal(OrgPermissionSubjects.Workspace).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_ENUM([OrgPermissionActions.Create]).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Role).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Member).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Settings).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.IncidentAccount).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Sso).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Scim).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Ldap).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Groups).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.SecretScanning).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Billing).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Identity).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.Kms).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.AuditLogs).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.ProjectTemplates).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionActions).describe("Describe what action an entity can take.")
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.AppConnections).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionAppConnectionActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: AppConnectionConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(OrgPermissionSubjects.AdminConsole).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(OrgPermissionAdminConsoleAction).describe(
      "Describe what action an entity can take."
    )
  })
]);

const buildAdminPermission = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  // ws permissions
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

  can(OrgPermissionActions.Read, OrgPermissionSubjects.AuditLogs);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.AuditLogs);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.AuditLogs);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.AuditLogs);

  can(OrgPermissionActions.Read, OrgPermissionSubjects.ProjectTemplates);
  can(OrgPermissionActions.Create, OrgPermissionSubjects.ProjectTemplates);
  can(OrgPermissionActions.Edit, OrgPermissionSubjects.ProjectTemplates);
  can(OrgPermissionActions.Delete, OrgPermissionSubjects.ProjectTemplates);

  can(OrgPermissionAppConnectionActions.Read, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionAppConnectionActions.Create, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionAppConnectionActions.Edit, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionAppConnectionActions.Delete, OrgPermissionSubjects.AppConnections);
  can(OrgPermissionAppConnectionActions.Connect, OrgPermissionSubjects.AppConnections);

  can(OrgPermissionAdminConsoleAction.AccessAllProjects, OrgPermissionSubjects.AdminConsole);

  return rules;
};

export const orgAdminPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);

  can(OrgPermissionActions.Create, OrgPermissionSubjects.Workspace);
  can(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
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

  can(OrgPermissionActions.Read, OrgPermissionSubjects.AuditLogs);

  can(OrgPermissionAppConnectionActions.Connect, OrgPermissionSubjects.AppConnections);

  return rules;
};

export const orgMemberPermissions = buildMemberPermission();

const buildNoAccessPermission = () => {
  const { rules } = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  return rules;
};

export const orgNoAccessPermissions = buildNoAccessPermission();
