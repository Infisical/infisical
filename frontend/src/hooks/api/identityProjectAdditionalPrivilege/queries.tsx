import { PackRule, unpackRules } from "@casl/ability/extra";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TProjectPermission } from "../roles/types";
import {
  TGetIdentityProejctPrivilegeDetails as TGetIdentityProjectPrivilegeDetails,
  TIdentityProjectPrivilege,
  TListIdentityUserPrivileges as TListIdentityProjectPrivileges
} from "./types";

export const identitiyProjectPrivilegeKeys = {
  details: ({ identityId, slug, projectSlug }: TGetIdentityProjectPrivilegeDetails) =>
    [
      "identity-user-privilege",
      {
        identityId,
        projectSlug,
        slug
      }
    ] as const,
  list: ({ projectSlug, identityId }: TListIdentityProjectPrivileges) =>
    ["identity-user-privileges", { identityId, projectSlug }] as const
};

export const useGetIdentityProjectPrivilegeDetails = ({
  projectSlug,
  identityId,
  slug
}: TGetIdentityProjectPrivilegeDetails) => {
  return useQuery({
    enabled: Boolean(projectSlug && identityId && slug),
    queryKey: identitiyProjectPrivilegeKeys.details({ projectSlug, slug, identityId }),
    queryFn: async () => {
      const {
        data: { privilege }
      } = await apiRequest.get<{
        privilege: Omit<TIdentityProjectPrivilege, "permissions"> & { permissions: unknown };
      }>(`/api/v1/additional-privilege/identity/${slug}`, {
        params: {
          identityId,
          projectSlug
        }
      });
      return {
        ...privilege,
        permissions: unpackRules(privilege.permissions as PackRule<TProjectPermission>[])
      };
    }
  });
};

export const useListIdentityProjectPrivileges = ({
  projectSlug,
  identityId
}: TListIdentityProjectPrivileges) => {
  return useQuery({
    enabled: Boolean(projectSlug && identityId),
    queryKey: identitiyProjectPrivilegeKeys.list({ projectSlug, identityId }),
    queryFn: async () => {
      const {
        data: { privileges }
      } = await apiRequest.get<{
        privileges: Array<
          Omit<TIdentityProjectPrivilege, "permissions"> & { permissions: unknown }
        >;
      }>("/api/v1/additional-privilege/identity", {
        params: { identityId, projectSlug, unpacked: false }
      });
      return privileges.map((el) => ({
        ...el,
        permissions: unpackRules(el.permissions as PackRule<TProjectPermission>[])
      }));
    }
  });
};
