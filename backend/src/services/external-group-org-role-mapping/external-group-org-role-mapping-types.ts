export type TExternalGroupOrgMembershipRoleMappingDTO = {
  groupName: string;
  roleSlug: string;
};

export type TSyncExternalGroupOrgMembershipRoleMappingsDTO = {
  mappings: TExternalGroupOrgMembershipRoleMappingDTO[];
};
