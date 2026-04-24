import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TOnaProject } from "./types";

const onaConnectionKeys = {
  all: [...appConnectionKeys.all, "ona"] as const,
  listProjects: (connectionId: string) =>
    [...onaConnectionKeys.all, "projects", connectionId] as const
};

export const useOnaConnectionListProjects = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TOnaProject[],
      unknown,
      TOnaProject[],
      ReturnType<typeof onaConnectionKeys.listProjects>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: onaConnectionKeys.listProjects(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TOnaProject[]>(
        `/api/v1/app-connections/ona/${connectionId}/projects`
      );

      return data;
    },
    ...options
  });
};
