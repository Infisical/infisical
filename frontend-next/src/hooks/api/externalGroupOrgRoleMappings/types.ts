export type TSyncExternalGroupOrgRoleMappingsDTO = {
  mappings: {
    groupName: string;
    roleSlug: string;
  }[];
};

export type TExternalGroupOrgRoleMapping = {
  id: string;
  groupName: string;
  role: string;
  roleId: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
};

export type TExternalGroupOrgRoleMappingList = TExternalGroupOrgRoleMapping[];
