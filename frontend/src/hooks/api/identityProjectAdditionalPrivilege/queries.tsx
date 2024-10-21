import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetIdentityProejctPrivilegeDetails as TGetIdentityProjectPrivilegeDetails,
  TIdentityProjectPrivilege,
  TListIdentityUserPrivileges as TListIdentityProjectPrivileges
} from "./types";

export const identitiyProjectPrivilegeKeys = {
  details: ({ identityId, privilegeId, projectId }: TGetIdentityProjectPrivilegeDetails) =>
    [
      "identity-user-privilege",
      {
        identityId,
        projectId,
        privilegeId
      }
    ] as const,
  list: ({ projectId, identityId }: TListIdentityProjectPrivileges) =>
    ["identity-user-privileges", { identityId, projectId }] as const
};

export const useGetIdentityProjectPrivilegeDetails = ({
  projectId,
  identityId,
  privilegeId
}: TGetIdentityProjectPrivilegeDetails) => {
  return useQuery({
    enabled: Boolean(projectId && identityId && privilegeId),
    queryKey: identitiyProjectPrivilegeKeys.details({ projectId, privilegeId, identityId }),
    queryFn: async () => {
      const {
        data: { privilege }
      } = await apiRequest.get<{
        privilege: TIdentityProjectPrivilege;
      }>(`/api/v2/identity-project-additional-privilege/${privilegeId}`, {
        params: {
          identityId,
          projectId
        }
      });
      return privilege;
    }
  });
};

export const useListIdentityProjectPrivileges = ({
  projectId,
  identityId
}: TListIdentityProjectPrivileges) => {
  return useQuery({
    enabled: Boolean(projectId && identityId),
    queryKey: identitiyProjectPrivilegeKeys.list({ projectId, identityId }),
    queryFn: async () => {
      const {
        data: { privileges }
      } = await apiRequest.get<{
        privileges: Array<TIdentityProjectPrivilege>;
      }>("/api/v2/identity-project-additional-privilege", {
        params: { identityId, projectId }
      });
      return privileges;
    }
  });
};
