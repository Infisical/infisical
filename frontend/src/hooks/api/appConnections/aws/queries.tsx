import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import {
  TAwsConnectionIamUser,
  TAwsConnectionKmsKey,
  TAwsConnectionListIamUsersResponse,
  TAwsConnectionListKmsKeysResponse,
  TListAwsConnectionIamUsers,
  TListAwsConnectionKmsKeys
} from "./types";

const awsConnectionKeys = {
  all: [...appConnectionKeys.all, "aws"] as const,
  listKmsKeys: (params: TListAwsConnectionKmsKeys) =>
    [...awsConnectionKeys.all, "kms-keys", params] as const,
  listIamUsers: (params: TListAwsConnectionIamUsers) =>
    [...awsConnectionKeys.all, "iam-users", params] as const
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
