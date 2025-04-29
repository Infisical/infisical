import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSshHostGroup } from "./types";

export const sshHostGroupKeys = {
  getSshHostGroupById: (sshHostGroupId: string) => [{ sshHostGroupId }, "ssh-host-group"]
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
