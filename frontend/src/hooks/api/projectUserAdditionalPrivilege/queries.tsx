import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TProjectPermission } from "../roles/types";
import { TProjectUserPrivilege } from "./types";

export const projectUserPrivilegeKeys = {
  details: (privilegeId: string) => ["project-user-privilege", { privilegeId }] as const
};

const fetchProjectUserPrivilegeDetails = async (privilegeId: string) => {
  const {
    data: { privilege }
  } = await apiRequest.get<{
    privilege: Omit<TProjectUserPrivilege, "permissions"> & { permissions: unknown };
  }>(`/api/v1/additional-privilege/users/${privilegeId}`);
  return {
    ...privilege,
    permissions: unpackRules(privilege.permissions as PackRule<TProjectPermission>[])
  };
};

export const useGetProjectUserPrivilegeDetails = (privilegeId: string) => {
  return useQuery({
    enabled: Boolean(privilegeId),
    queryKey: projectUserPrivilegeKeys.details(privilegeId),
    queryFn: () => fetchProjectUserPrivilegeDetails(privilegeId)
  });
};
