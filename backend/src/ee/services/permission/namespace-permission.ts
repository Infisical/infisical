import { AbilityBuilder, createMongoAbility, ForcedSubject, MongoAbility } from "@casl/ability";
import { z } from "zod";

import {
  CASL_ACTION_SCHEMA_ENUM,
  CASL_ACTION_SCHEMA_NATIVE_ENUM
} from "@app/ee/services/permission/permission-schemas";
import { PermissionConditionSchema } from "@app/ee/services/permission/permission-types";
import { PermissionConditionOperators } from "@app/lib/casl";
import { NamespaceMembershipRole } from "@app/db/schemas";

export const isCustomNamespaceRole = (slug: string) =>
  !Object.values(NamespaceMembershipRole).includes(slug as NamespaceMembershipRole);

export enum NamespacePermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
}

export enum NamespacePermissionMemberActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  AssumePrivileges = "assume-privileges"
}

export enum NamespacePermissionAppConnectionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  Connect = "connect"
}

export enum NamespacePermissionAuditLogsActions {
  Read = "read"
}

export enum NamespacePermissionMachineIdentityAuthTemplateActions {
  ListTemplates = "list-templates",
  EditTemplates = "edit-templates",
  CreateTemplates = "create-templates",
  DeleteTemplates = "delete-templates",
  UnlinkTemplates = "unlink-templates",
  AttachTemplates = "attach-templates"
}

export enum NamespacePermissionAdminConsoleAction {
  AccessAllProjects = "access-all-projects"
}

export enum NamespacePermissionSecretShareAction {
  ManageSettings = "manage-settings"
}

export enum NamespacePermissionGatewayActions {
  // is there a better word for this. This mean can an identity be a gateway
  CreateGateways = "create-gateways",
  ListGateways = "list-gateways",
  EditGateways = "edit-gateways",
  DeleteGateways = "delete-gateways",
  AttachGateways = "attach-gateways"
}

export enum NamespacePermissionIdentityActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  RevokeAuth = "revoke-auth",
  CreateToken = "create-token",
  GetToken = "get-token",
  DeleteToken = "delete-token"
}

export enum NamespacePermissionGroupActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  AddMembers = "add-members",
  RemoveMembers = "remove-members"
}

export enum NamespacePermissionBillingActions {
  Read = "read",
  ManageBilling = "manage-billing"
}

export enum NamespacePermissionSubjects {
  Project = "project",
  Role = "role",
  Member = "member",
  Settings = "settings",
  Groups = "groups",
  SecretScanning = "secret-scanning",
  Identity = "identity",
  Kms = "kms",
  MachineIdentityAuthTemplate = "machine-identity-auth-template",
  AuditLogs = "audit-logs",
  ProjectTemplates = "project-templates",
  AppConnections = "app-connections",
  Kmip = "kmip",
  Gateway = "gateway",
  SecretShare = "secret-share"
}

export type AppConnectionSubjectFields = {
  connectionId: string;
};

export type NamespacePermissionSet =
  | [NamespacePermissionActions.Create, NamespacePermissionSubjects.Project]
  | [NamespacePermissionActions, NamespacePermissionSubjects.Role]
  | [NamespacePermissionMemberActions, NamespacePermissionSubjects.Member]
  | [NamespacePermissionActions, NamespacePermissionSubjects.Settings]
  | [NamespacePermissionGroupActions, NamespacePermissionSubjects.Groups]
  | [NamespacePermissionActions, NamespacePermissionSubjects.SecretScanning]
  | [NamespacePermissionIdentityActions, NamespacePermissionSubjects.Identity]
  | [NamespacePermissionActions, NamespacePermissionSubjects.Kms]
  | [NamespacePermissionAuditLogsActions, NamespacePermissionSubjects.AuditLogs]
  | [NamespacePermissionActions, NamespacePermissionSubjects.ProjectTemplates]
  | [NamespacePermissionGatewayActions, NamespacePermissionSubjects.Gateway]
  | [
      NamespacePermissionAppConnectionActions,
      (
        | NamespacePermissionSubjects.AppConnections
        | (ForcedSubject<NamespacePermissionSubjects.AppConnections> & AppConnectionSubjectFields)
      )
    ]
  | [NamespacePermissionMachineIdentityAuthTemplateActions, NamespacePermissionSubjects.MachineIdentityAuthTemplate]
  | [NamespacePermissionSecretShareAction, NamespacePermissionSubjects.SecretShare];

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

export const NamespacePermissionSchema = z.discriminatedUnion("subject", [
  z.object({
    subject: z.literal(NamespacePermissionSubjects.Project).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_ENUM([NamespacePermissionActions.Create]).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.Role).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.Member).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionMemberActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.Settings).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.Groups).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionGroupActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.SecretScanning).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.Identity).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionIdentityActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.Kms).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.AuditLogs).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionAuditLogsActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z
      .literal(NamespacePermissionSubjects.ProjectTemplates)
      .describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.AppConnections).describe("The entity this permission pertains to."),
    inverted: z.boolean().optional().describe("Whether rule allows or forbids."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionAppConnectionActions).describe(
      "Describe what action an entity can take."
    ),
    conditions: AppConnectionConditionSchema.describe(
      "When specified, only matching conditions will be allowed to access given resource."
    ).optional()
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.SecretShare).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionSecretShareAction).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z
      .literal(NamespacePermissionSubjects.MachineIdentityAuthTemplate)
      .describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionMachineIdentityAuthTemplateActions).describe(
      "Describe what action an entity can take."
    )
  }),
  z.object({
    subject: z.literal(NamespacePermissionSubjects.Gateway).describe("The entity this permission pertains to."),
    action: CASL_ACTION_SCHEMA_NATIVE_ENUM(NamespacePermissionGatewayActions).describe(
      "Describe what action an entity can take."
    )
  })
]);

const buildAdminPermission = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<NamespacePermissionSet>>(createMongoAbility);
  // ws permissions
  can(NamespacePermissionActions.Create, NamespacePermissionSubjects.Project);
  // role permission
  can(NamespacePermissionActions.Read, NamespacePermissionSubjects.Role);
  can(NamespacePermissionActions.Create, NamespacePermissionSubjects.Role);
  can(NamespacePermissionActions.Edit, NamespacePermissionSubjects.Role);
  can(NamespacePermissionActions.Delete, NamespacePermissionSubjects.Role);

  can(NamespacePermissionMemberActions.Read, NamespacePermissionSubjects.Member);
  can(NamespacePermissionMemberActions.Create, NamespacePermissionSubjects.Member);
  can(NamespacePermissionMemberActions.Edit, NamespacePermissionSubjects.Member);
  can(NamespacePermissionMemberActions.Delete, NamespacePermissionSubjects.Member);
  can(NamespacePermissionMemberActions.GrantPrivileges, NamespacePermissionSubjects.Member);
  can(NamespacePermissionMemberActions.AssumePrivileges, NamespacePermissionSubjects.Member);

  can(NamespacePermissionActions.Read, NamespacePermissionSubjects.SecretScanning);
  can(NamespacePermissionActions.Create, NamespacePermissionSubjects.SecretScanning);
  can(NamespacePermissionActions.Edit, NamespacePermissionSubjects.SecretScanning);
  can(NamespacePermissionActions.Delete, NamespacePermissionSubjects.SecretScanning);

  can(NamespacePermissionActions.Read, NamespacePermissionSubjects.Settings);
  can(NamespacePermissionActions.Create, NamespacePermissionSubjects.Settings);
  can(NamespacePermissionActions.Edit, NamespacePermissionSubjects.Settings);
  can(NamespacePermissionActions.Delete, NamespacePermissionSubjects.Settings);

  can(NamespacePermissionGroupActions.Read, NamespacePermissionSubjects.Groups);
  can(NamespacePermissionGroupActions.Create, NamespacePermissionSubjects.Groups);
  can(NamespacePermissionGroupActions.Edit, NamespacePermissionSubjects.Groups);
  can(NamespacePermissionGroupActions.Delete, NamespacePermissionSubjects.Groups);
  can(NamespacePermissionGroupActions.GrantPrivileges, NamespacePermissionSubjects.Groups);
  can(NamespacePermissionGroupActions.AddMembers, NamespacePermissionSubjects.Groups);
  can(NamespacePermissionGroupActions.RemoveMembers, NamespacePermissionSubjects.Groups);

  can(NamespacePermissionIdentityActions.Read, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.Create, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.Edit, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.Delete, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.GrantPrivileges, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.RevokeAuth, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.CreateToken, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.GetToken, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.DeleteToken, NamespacePermissionSubjects.Identity);

  can(NamespacePermissionActions.Read, NamespacePermissionSubjects.Kms);
  can(NamespacePermissionActions.Create, NamespacePermissionSubjects.Kms);
  can(NamespacePermissionActions.Edit, NamespacePermissionSubjects.Kms);
  can(NamespacePermissionActions.Delete, NamespacePermissionSubjects.Kms);

  can(NamespacePermissionAuditLogsActions.Read, NamespacePermissionSubjects.AuditLogs);

  can(NamespacePermissionActions.Read, NamespacePermissionSubjects.ProjectTemplates);
  can(NamespacePermissionActions.Create, NamespacePermissionSubjects.ProjectTemplates);
  can(NamespacePermissionActions.Edit, NamespacePermissionSubjects.ProjectTemplates);
  can(NamespacePermissionActions.Delete, NamespacePermissionSubjects.ProjectTemplates);

  can(NamespacePermissionAppConnectionActions.Read, NamespacePermissionSubjects.AppConnections);
  can(NamespacePermissionAppConnectionActions.Create, NamespacePermissionSubjects.AppConnections);
  can(NamespacePermissionAppConnectionActions.Edit, NamespacePermissionSubjects.AppConnections);
  can(NamespacePermissionAppConnectionActions.Delete, NamespacePermissionSubjects.AppConnections);
  can(NamespacePermissionAppConnectionActions.Connect, NamespacePermissionSubjects.AppConnections);

  can(NamespacePermissionGatewayActions.ListGateways, NamespacePermissionSubjects.Gateway);
  can(NamespacePermissionGatewayActions.CreateGateways, NamespacePermissionSubjects.Gateway);
  can(NamespacePermissionGatewayActions.EditGateways, NamespacePermissionSubjects.Gateway);
  can(NamespacePermissionGatewayActions.DeleteGateways, NamespacePermissionSubjects.Gateway);
  can(NamespacePermissionGatewayActions.AttachGateways, NamespacePermissionSubjects.Gateway);

  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.ListTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.EditTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.CreateTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.DeleteTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.UnlinkTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );

  can(NamespacePermissionSecretShareAction.ManageSettings, NamespacePermissionSubjects.SecretShare);

  return rules;
};

export const namespaceAdminPermissions = buildAdminPermission();

const buildMemberPermission = () => {
  const { can, rules } = new AbilityBuilder<MongoAbility<NamespacePermissionSet>>(createMongoAbility);

  can(NamespacePermissionActions.Create, NamespacePermissionSubjects.Project);
  can(NamespacePermissionMemberActions.Read, NamespacePermissionSubjects.Member);
  can(NamespacePermissionGroupActions.Read, NamespacePermissionSubjects.Groups);
  can(NamespacePermissionActions.Read, NamespacePermissionSubjects.Role);
  can(NamespacePermissionActions.Read, NamespacePermissionSubjects.Settings);

  can(NamespacePermissionActions.Read, NamespacePermissionSubjects.SecretScanning);
  can(NamespacePermissionActions.Create, NamespacePermissionSubjects.SecretScanning);
  can(NamespacePermissionActions.Edit, NamespacePermissionSubjects.SecretScanning);
  can(NamespacePermissionActions.Delete, NamespacePermissionSubjects.SecretScanning);

  can(NamespacePermissionIdentityActions.Read, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.Create, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.Edit, NamespacePermissionSubjects.Identity);
  can(NamespacePermissionIdentityActions.Delete, NamespacePermissionSubjects.Identity);

  can(NamespacePermissionAuditLogsActions.Read, NamespacePermissionSubjects.AuditLogs);

  can(NamespacePermissionAppConnectionActions.Connect, NamespacePermissionSubjects.AppConnections);
  can(NamespacePermissionGatewayActions.ListGateways, NamespacePermissionSubjects.Gateway);
  can(NamespacePermissionGatewayActions.CreateGateways, NamespacePermissionSubjects.Gateway);
  can(NamespacePermissionGatewayActions.AttachGateways, NamespacePermissionSubjects.Gateway);

  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.ListTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.UnlinkTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );
  can(
    NamespacePermissionMachineIdentityAuthTemplateActions.AttachTemplates,
    NamespacePermissionSubjects.MachineIdentityAuthTemplate
  );

  return rules;
};

export const namespaceMemberPermissions = buildMemberPermission();

const buildNoAccessPermission = () => {
  const { rules } = new AbilityBuilder<MongoAbility<NamespacePermissionSet>>(createMongoAbility);
  return rules;
};

export const namespaceNoAccessPermissions = buildNoAccessPermission();
