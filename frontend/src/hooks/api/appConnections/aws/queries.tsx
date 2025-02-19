import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { appConnectionKeys } from "@app/hooks/api/appConnections";

import {
  TAwsConnectionKmsKey,
  TAwsConnectionListKmsKeysResponse,
  TListAwsConnectionKmsKeys
} from "./types";

const awsConnectionKeys = {
  all: [...appConnectionKeys.all, "aws"] as const,
  listKmsKeys: (params: TListAwsConnectionKmsKeys) =>
    [...awsConnectionKeys.all, "kms-keys", params] as const
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
