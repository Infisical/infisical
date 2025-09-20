import { ForcedSubject, MongoAbility } from "@casl/ability";

export enum NamespacePermissionActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete"
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

export enum NamespacePermissionKmipActions {
  Proxy = "proxy",
  Setup = "setup"
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

export type NamespacePermissionIdentitySubjectFields = {
  identityId: string;
};

export enum NamespacePermissionGroupActions {
  Read = "read",
  Create = "create",
  Edit = "edit",
  Delete = "delete",
  GrantPrivileges = "grant-privileges",
  AddMembers = "add-members",
  RemoveMembers = "remove-members"
}

export enum NamespacePermissionSubjects {
  Project = "project",
  Role = "role",
  Member = "member",
  Settings = "settings",
  Groups = "groups",
  Identity = "identity",
  Kms = "kms",
  MachineIdentityAuthTemplate = "machine-identity-auth-template",
  AuditLogs = "audit-logs",
  ProjectTemplates = "project-templates",
  AppConnections = "app-connections",
  Gateway = "gateway"
}

export type NamespacePermissionAppConnectionSubjectFields = {
  connectionId: string;
};

export type NamespacePermissionSet =
  | [NamespacePermissionActions.Create, NamespacePermissionSubjects.Project]
  | [NamespacePermissionActions, NamespacePermissionSubjects.Role]
  | [NamespacePermissionActions, NamespacePermissionSubjects.Member]
  | [NamespacePermissionActions, NamespacePermissionSubjects.Settings]
  | [NamespacePermissionGroupActions, NamespacePermissionSubjects.Groups]
  | [
      NamespacePermissionIdentityActions,
      (
        | NamespacePermissionSubjects.Identity
        | (ForcedSubject<NamespacePermissionSubjects.Identity> &
            NamespacePermissionIdentitySubjectFields)
      )
    ]
  | [NamespacePermissionActions, NamespacePermissionSubjects.Kms]
  | [NamespacePermissionAuditLogsActions, NamespacePermissionSubjects.AuditLogs]
  | [NamespacePermissionActions, NamespacePermissionSubjects.ProjectTemplates]
  | [NamespacePermissionGatewayActions, NamespacePermissionSubjects.Gateway]
  | [
      NamespacePermissionAppConnectionActions,
      (
        | NamespacePermissionSubjects.AppConnections
        | (ForcedSubject<NamespacePermissionSubjects.AppConnections> &
            NamespacePermissionAppConnectionSubjectFields)
      )
    ]
  | [
      NamespacePermissionMachineIdentityAuthTemplateActions,
      NamespacePermissionSubjects.MachineIdentityAuthTemplate
    ];

export type TNamespacePermission = MongoAbility<NamespacePermissionSet>;
