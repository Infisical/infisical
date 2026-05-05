import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

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
  state: () => [...certManagerInstanceKeys.all, "state"] as const
};

export const useCertManagerInstanceState = () =>
  useQuery({
    queryKey: certManagerInstanceKeys.state(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCertManagerInstanceState>(BASE_URL);
      return data;
    }
  });

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

export const useCertManagerLegacyInstances = () =>
  useQuery({
    queryKey: [...certManagerInstanceKeys.all, "legacy"] as const,
    queryFn: async () => {
      const { data } = await apiRequest.get<TCertManagerLegacyInstancesResponse>(
        `${BASE_URL}/legacy`
      );
      return data;
    }
  });

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
    onSuccess: () => qc.invalidateQueries({ queryKey: certManagerInstanceKeys.all })
  });
};
