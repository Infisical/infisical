import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TProjectPermission } from "../roles/types";
import { TIdentityProjectPrivilege } from "./types";

export const identitiyProjectPrivilegeKeys = {
  details: (privilegeId: string) => ["project-user-privilege", { privilegeId }] as const
};

const fetchIdentityProjectPrivilegeDetails = async (privilegeId: string) => {
  const {
    data: { privilege }
  } = await apiRequest.get<{
    privilege: Omit<TIdentityProjectPrivilege, "permissions"> & { permissions: unknown };
  }>(`/api/v1/additional-privilege/identity/${privilegeId}`);
  return {
    ...privilege,
    permissions: unpackRules(privilege.permissions as PackRule<TProjectPermission>[])
  };
};

export const useGetIdentityProjectPrivilegeDetails = (privilegeId: string) => {
  return useQuery({
    enabled: Boolean(privilegeId),
    queryKey: identitiyProjectPrivilegeKeys.details(privilegeId),
    queryFn: () => fetchIdentityProjectPrivilegeDetails(privilegeId)
  });
};
