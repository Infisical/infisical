export enum ProjectMembershipRole {
  Admin = "admin",
  Member = "member",
  Custom = "custom",
  Viewer = "viewer",
  NoAccess = "no-access",
  SshHostBootstrapper = "ssh-host-bootstrapper",
  KmsCryptographicOperator = "cryptographic-operator",
  Agent = "agent",
  AgentProxy = "agent-proxy"
}

export type TGetProjectRolesDTO = {
  projectId?: string;
};

export type TProjectRole = {
  slug: string;
  name: string;
  projectId: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  description?: string | null;
  permissions: TProjectPermission[];
};

export type TOrgRole = {
  slug: string;
  name: string;
  orgId: string;
  id: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  permissions: TPermission[];
};

export type TPermission = {
  conditions?: Record<string, any>;
  action: string | string[];
  subject: string;
};

export type TProjectPermission = {
  conditions?: Record<string, any>;
  inverted?: boolean;
  action: string | string[];
  subject: string | string[];
};

export type TGetUserOrgPermissionsDTO = {
  orgId: string;
};

export type TGetUserProjectPermissionDTO = {
  projectId: string;
};

export type TCreateOrgRoleDTO = {
  orgId: string;
  name: string;
  description?: string;
  slug: string;
  permissions: TPermission[];
};

export type TUpdateOrgRoleDTO = {
  orgId: string;
  id: string;
} & Partial<Omit<TCreateOrgRoleDTO, "orgId">>;

export type TDeleteOrgRoleDTO = {
  orgId: string;
  id: string;
};

export type TCreateProjectRoleDTO = {
  projectId: string;
  projectType?: string;
  name: string;
  description?: string | null;
  slug: string;
  permissions: TProjectPermission[];
};

export type TUpdateProjectRoleDTO = {
  projectId: string;
  projectType?: string;
  id: string;
} & Partial<Omit<TCreateProjectRoleDTO, "orgId">>;

export type TDeleteProjectRoleDTO = {
  projectId: string;
  projectType?: string;
  id: string;
};
