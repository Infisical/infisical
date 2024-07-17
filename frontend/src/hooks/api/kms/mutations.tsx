import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { kmsKeys } from "./queries";

export const useAddAwsExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      slug,
      description,
      credentialType,
      accessKey,
      secretKey,
      assumeRoleArn,
      externalId,
      awsRegion,
      kmsKeyId
    }: {
      slug: string;
      description: string;
      credentialType: string;
      accessKey?: string;
      secretKey?: string;
      assumeRoleArn?: string;
      externalId?: string;
      awsRegion: string;
      kmsKeyId?: string;
    }) => {
      const { data } = await apiRequest.post("/api/v1/external-kms", {
        slug,
        description,
        provider: {
          type: "aws",
          inputs: {
            credential: {
              type: credentialType,
              data: {
                accessKey,
                secretKey,
                assumeRoleArn,
                externalId
              }
            },
            awsRegion,
            kmsKeyId
          }
        }
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(kmsKeys.getExternalKmsList(orgId));
    }
  });
};

export const useUpdateAwsExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kmsId,
      slug,
      description,
      credentialType,
      accessKey,
      secretKey,
      assumeRoleArn,
      externalId,
      awsRegion,
      kmsKeyId
    }: {
      kmsId: string;
      slug?: string;
      description?: string;
      credentialType?: string;
      accessKey?: string;
      secretKey?: string;
      assumeRoleArn?: string;
      externalId?: string;
      awsRegion: string;
      kmsKeyId?: string;
    }) => {
      const { data } = await apiRequest.patch(`/api/v1/external-kms/${kmsId}`, {
        slug,
        description,
        provider: {
          type: "aws",
          inputs: {
            credential: {
              type: credentialType,
              data: {
                accessKey,
                secretKey,
                assumeRoleArn,
                externalId
              }
            },
            awsRegion,
            kmsKeyId
          }
        }
      });

      return data;
    },
    onSuccess: (_, { kmsId }) => {
      queryClient.invalidateQueries(kmsKeys.getExternalKmsList(orgId));
      queryClient.invalidateQueries(kmsKeys.getExternalKmsById(kmsId));
    }
  });
};

export const useRemoveExternalKms = (orgId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (kmsId: string) => {
      const { data } = await apiRequest.delete(`/api/v1/external-kms/${kmsId}`);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(kmsKeys.getExternalKmsList(orgId));
    }
  });
};

export const useUpdateProjectKms = (projectId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (updatedData: { secretManagerKmsKeyId: string }) => {
      const { data } = await apiRequest.patch(`/api/v1/workspace/${projectId}/kms`, updatedData);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(kmsKeys.getActiveProjectKms(projectId));
    }
  });
};
