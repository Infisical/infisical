import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

const BASE_URL = "/api/v1/cert-manager/instance";

export type TCertManagerInstanceProject = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type TCertManagerInstanceState = {
  activeProjectId: string | null;
  projects: TCertManagerInstanceProject[];
  isMultiInstance: boolean;
};

export const certManagerInstanceKeys = {
  all: ["cert-manager-instance"] as const,
  state: (orgId: string) => [...certManagerInstanceKeys.all, "state", { orgId }] as const,
  legacy: (orgId: string) => [...certManagerInstanceKeys.all, "legacy", { orgId }] as const
};

export const useCertManagerInstanceState = () => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id;
  return useQuery({
    queryKey: certManagerInstanceKeys.state(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCertManagerInstanceState>(BASE_URL);
      return data;
    },
    enabled: Boolean(orgId)
  });
};

export type TCertManagerLegacyInstance = TCertManagerInstanceProject & {
  certificateCount: number;
  syncCount: number;
  alertCount: number;
  isActive: boolean;
};

export type TCertManagerLegacyInstancesResponse = {
  activeProjectId: string | null;
  instances: TCertManagerLegacyInstance[];
};

export const useCertManagerLegacyInstances = () => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id;
  return useQuery({
    queryKey: certManagerInstanceKeys.legacy(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCertManagerLegacyInstancesResponse>(
        `${BASE_URL}/legacy`
      );
      return data;
    },
    enabled: Boolean(orgId)
  });
};

export const useSetCertManagerActiveProject = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (projectId: string) => {
      const { data } = await apiRequest.post<{
        activeProjectId: string;
        previousActiveProjectId: string | null;
        projectName: string;
      }>(`${BASE_URL}/active-project`, { projectId });
      return data;
    },
    onSuccess: () => qc.invalidateQueries()
  });
};
