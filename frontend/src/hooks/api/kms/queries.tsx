import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { Kms, KmsListEntry } from "./types";

export const kmsKeys = {
  getExternalKmsList: (orgId: string) => ["get-all-external-kms", { orgId }],
  getExternalKmsById: (id: string) => ["get-external-kms", { id }],
  getActiveProjectKms: (projectId: string) => ["get-active-project-kms", { projectId }]
};

export const useGetExternalKmsList = (orgId: string) => {
  return useQuery({
    queryKey: kmsKeys.getExternalKmsList(orgId),
    queryFn: async () => {
      const {
        data: { externalKmsList }
      } = await apiRequest.get<{ externalKmsList: KmsListEntry[] }>("/api/v1/external-kms");
      return externalKmsList;
    }
  });
};

export const useGetExternalKmsById = (kmsId: string) => {
  return useQuery({
    queryKey: kmsKeys.getExternalKmsById(kmsId),
    enabled: Boolean(kmsId),
    queryFn: async () => {
      const {
        data: { externalKms }
      } = await apiRequest.get<{ externalKms: Kms }>(`/api/v1/external-kms/${kmsId}`);
      return externalKms;
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
          slug: string;
          isExternal: string;
        };
      }>(`/api/v1/workspace/${projectId}/kms`);
      return secretManagerKmsKey;
    }
  });
};

export const fetchProjectKmsBackup = async (projectId: string) => {
  const { data } = await apiRequest.get<{
    secretManager: string;
  }>(`/api/v1/workspace/${projectId}/kms/backup`);

  return data;
};
