import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { EHostGroupMembershipFilter, TListSshHostGroupHostsResponse, TSshHostGroup } from "./types";

export const sshHostGroupKeys = {
  getSshHostGroupById: (sshHostGroupId: string) => [{ sshHostGroupId }, "ssh-host-group"],
  allSshHostGroupHosts: () => ["ssh-host-group-hosts"] as const,
  forSshHostGroupHosts: (sshHostGroupId: string) =>
    [...sshHostGroupKeys.allSshHostGroupHosts(), sshHostGroupId] as const,
  specificSshHostGroupHosts: ({
    sshHostGroupId,
    filter
  }: {
    sshHostGroupId: string;
    filter?: EHostGroupMembershipFilter;
  }) => [...sshHostGroupKeys.forSshHostGroupHosts(sshHostGroupId), { filter }] as const
};

export const useGetSshHostGroupById = (sshHostGroupId: string) => {
  return useQuery({
    queryKey: sshHostGroupKeys.getSshHostGroupById(sshHostGroupId),
    queryFn: async () => {
      const { data: sshHostGroup } = await apiRequest.get<TSshHostGroup>(
        `/api/v1/ssh/host-groups/${sshHostGroupId}`
      );
      return sshHostGroup;
    },
    enabled: Boolean(sshHostGroupId)
  });
};

export const useListSshHostGroupHosts = ({
  sshHostGroupId,
  filter
}: {
  sshHostGroupId: string;
  filter?: EHostGroupMembershipFilter;
}) => {
  return useQuery({
    queryKey: sshHostGroupKeys.specificSshHostGroupHosts({ sshHostGroupId, filter }),
    queryFn: async () => {
      const params = new URLSearchParams({
        ...(filter ? { filter } : {})
      });

      const { data } = await apiRequest.get<TListSshHostGroupHostsResponse>(
        `/api/v1/ssh/host-groups/${sshHostGroupId}/hosts`,
        {
          params
        }
      );
      return data;
    },
    enabled: Boolean(sshHostGroupId),
    staleTime: 0,
    gcTime: 0
  });
};
