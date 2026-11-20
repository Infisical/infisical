import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import { TJenkinsFolder } from "./types";

const jenkinsConnectionKeys = {
  all: [...appConnectionKeys.all, "jenkins"] as const,
  listFolders: (connectionId: string) =>
    [...jenkinsConnectionKeys.all, "folders", connectionId] as const
};

export const useJenkinsConnectionListFolders = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TJenkinsFolder[],
      unknown,
      TJenkinsFolder[],
      ReturnType<typeof jenkinsConnectionKeys.listFolders>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: jenkinsConnectionKeys.listFolders(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ folders: TJenkinsFolder[] }>(
        `/api/v1/app-connections/jenkins/${connectionId}/folders`
      );

      return data.folders;
    },
    ...options
  });
};
