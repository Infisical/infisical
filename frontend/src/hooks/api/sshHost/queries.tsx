import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSshHost } from "./types";

export const sshHostKeys = {
  getSshHostById: (sshHostId: string) => [{ sshHostId }, "ssh-host"],
  getSshHostUserCaPublicKey: (sshHostId: string) => [{ sshHostId }, "ssh-host-user-ca-public-key"]
};

export const useGetSshHostById = (sshHostId: string) => {
  return useQuery({
    queryKey: sshHostKeys.getSshHostById(sshHostId),
    queryFn: async () => {
      const { data: sshHost } = await apiRequest.get<TSshHost>(`/api/v1/ssh/hosts/${sshHostId}`);
      return sshHost;
    },
    enabled: Boolean(sshHostId)
  });
};

export const fetchSshHostUserCaPublicKey = async (sshHostId: string): Promise<string> => {
  const { data } = await apiRequest.get<string>(
    `/api/v1/ssh/hosts/${sshHostId}/user-ca-public-key`
  );
  return data;
};
