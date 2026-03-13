import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TVenafiApplication, TVenafiIssuingTemplate } from "./types";

const venafiConnectionKeys = {
  all: [...appConnectionKeys.all, "venafi"] as const,
  listApplications: (connectionId: string) =>
    [...venafiConnectionKeys.all, "applications", connectionId] as const,
  listIssuingTemplates: (connectionId: string, applicationId: string) =>
    [...venafiConnectionKeys.all, "issuing-templates", connectionId, applicationId] as const
};

export const useVenafiConnectionListApplications = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TVenafiApplication[],
      unknown,
      TVenafiApplication[],
      ReturnType<typeof venafiConnectionKeys.listApplications>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: venafiConnectionKeys.listApplications(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TVenafiApplication[]>(
        `/api/v1/app-connections/venafi/${connectionId}/venafi-applications`
      );

      return data;
    },
    ...options
  });
};

export const useVenafiConnectionListIssuingTemplates = (
  connectionId: string,
  applicationId: string,
  options?: Omit<
    UseQueryOptions<
      TVenafiIssuingTemplate[],
      unknown,
      TVenafiIssuingTemplate[],
      ReturnType<typeof venafiConnectionKeys.listIssuingTemplates>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: venafiConnectionKeys.listIssuingTemplates(connectionId, applicationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TVenafiIssuingTemplate[]>(
        `/api/v1/app-connections/venafi/${connectionId}/venafi-issuing-templates`,
        { params: { applicationId } }
      );

      return data;
    },
    ...options
  });
};
