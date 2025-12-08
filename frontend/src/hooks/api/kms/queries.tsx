import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { ExternalKmsProvider, Kms, KmsListEntry } from "./types";

export const kmsKeys = {
  getExternalKmsList: (orgId: string) => ["get-all-external-kms", { orgId }],
  getExternalKmsById: (id: string) => ["get-external-kms", { id }],
  getActiveProjectKms: (projectId: string) => ["get-active-project-kms", { projectId }]
};

export const useGetExternalKmsList = (orgId: string, { enabled }: { enabled?: boolean } = {}) => {
  return useQuery({
    queryKey: kmsKeys.getExternalKmsList(orgId),
    enabled,
    queryFn: async () => {
      const {
        data: { externalKmsList }
      } = await apiRequest.get<{ externalKmsList: KmsListEntry[] }>("/api/v1/external-kms");
      return externalKmsList;
    }
  });
};

export const useGetExternalKmsById = ({
  kmsId,
  provider
}: {
  kmsId: string;
  provider: ExternalKmsProvider;
}) => {
  return useQuery({
    queryKey: kmsKeys.getExternalKmsById(kmsId),
    enabled: Boolean(kmsId),
    queryFn: async () => {
      const { data } = await apiRequest.get<Kms>(`/api/v1/external-kms/${provider}/${kmsId}`);
      return data;
    }
  });
};

export const useGetActiveProjectKms = (projectId: string) => {
  return useQuery({
    queryKey: kmsKeys.getActiveProjectKms(projectId),
    enabled: Boolean(projectId),
    queryFn: async () => {
      const {
        data: { secretManagerKmsKey }
      } = await apiRequest.get<{
        secretManagerKmsKey: {
          id: string;
          name: string;
          isExternal: string;
        };
      }>(`/api/v1/projects/${projectId}/kms`);
      return secretManagerKmsKey;
    }
  });
};

export const fetchProjectKmsBackup = async (projectId: string) => {
  const { data } = await apiRequest.get<{
    secretManager: string;
  }>(`/api/v1/projects/${projectId}/kms/backup`);

  return data;
};
