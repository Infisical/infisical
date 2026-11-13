import { keepPreviousData, useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import {
  TAwsConnectionIamUser,
  TAwsConnectionKmsKey,
  TAwsConnectionListIamUsersResponse,
  TAwsConnectionListKmsKeysResponse,
  TAwsConnectionProvisioningTemplateResponse,
  TAwsProvisioningTemplateResponse,
  TGetAwsConnectionProvisioningTemplate,
  TGetAwsProvisioningTemplate,
  TListAwsConnectionIamUsers,
  TListAwsConnectionKmsKeys
} from "./types";

export const awsConnectionKeys = {
  all: [...appConnectionKeys.all, "aws"] as const,
  listKmsKeys: (params: TListAwsConnectionKmsKeys) =>
    [...awsConnectionKeys.all, "kms-keys", params] as const,
  listIamUsers: (params: TListAwsConnectionIamUsers) =>
    [...awsConnectionKeys.all, "iam-users", params] as const,
  provisioningTemplate: (params: TGetAwsProvisioningTemplate) =>
    [...awsConnectionKeys.all, "provisioning-template", params] as const,
  allConnectionProvisioningTemplates: () =>
    [...awsConnectionKeys.all, "connection-provisioning-template"] as const,
  connectionProvisioningTemplate: (params: TGetAwsConnectionProvisioningTemplate) =>
    [...awsConnectionKeys.all, "connection-provisioning-template", params] as const
};

export const useGetAwsConnectionProvisioningTemplate = (
  params: TGetAwsConnectionProvisioningTemplate,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: awsConnectionKeys.connectionProvisioningTemplate(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAwsConnectionProvisioningTemplateResponse>(
        `/api/v1/app-connections/aws/${params.connectionId}/provisioning-template`,
        {
          params: {
            useCases: params.useCases.join(","),
            region: params.region
          }
        }
      );

      return data.provisioningTemplate;
    },
    placeholderData: keepPreviousData,
    retry: false,
    ...options
  });
};

export const useGetAwsProvisioningTemplate = (
  params: TGetAwsProvisioningTemplate,
  options?: { enabled?: boolean }
) => {
  return useQuery({
    queryKey: awsConnectionKeys.provisioningTemplate(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAwsProvisioningTemplateResponse>(
        "/api/v1/app-connections/aws/provisioning-template",
        {
          params: {
            projectId: params.projectId ?? undefined,
            partition: params.partition,
            region: params.region,
            useCases: params.useCases.join(","),
            roleName: params.roleName,
            stackName: params.stackName
          }
        }
      );

      return data.provisioningTemplate;
    },
    placeholderData: keepPreviousData,
    retry: false,
    ...options
  });
};

export const useListAwsConnectionKmsKeys = (
  { connectionId, ...params }: TListAwsConnectionKmsKeys,
  options?: Omit<
    UseQueryOptions<
      TAwsConnectionKmsKey[],
      unknown,
      TAwsConnectionKmsKey[],
      ReturnType<typeof awsConnectionKeys.listKmsKeys>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: awsConnectionKeys.listKmsKeys({ connectionId, ...params }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAwsConnectionListKmsKeysResponse>(
        `/api/v1/app-connections/aws/${connectionId}/kms-keys`,
        { params }
      );

      return data.kmsKeys;
    },
    ...options
  });
};

export const useListAwsConnectionIamUsers = (
  { connectionId }: TListAwsConnectionIamUsers,
  options?: Omit<
    UseQueryOptions<
      TAwsConnectionIamUser[],
      unknown,
      TAwsConnectionIamUser[],
      ReturnType<typeof awsConnectionKeys.listIamUsers>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: awsConnectionKeys.listIamUsers({ connectionId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TAwsConnectionListIamUsersResponse>(
        `/api/v1/app-connections/aws/${connectionId}/users`
      );

      return data.iamUsers;
    },
    ...options
  });
};
