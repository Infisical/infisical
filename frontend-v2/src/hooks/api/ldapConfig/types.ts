export type LDAPGroupMap = {
  id: string;
  ldapConfigId: string;
  ldapGroupCN: string;
  group: {
    id: string;
    name: string;
    slug: string;
  };
};
