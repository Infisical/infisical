import { useCallback } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";

import { mergePersonalSecrets } from "../secrets/queries";
import { SecretV3RawResponse, SecretV3RawSanitized, TGetProjectSecretsKey } from "../types";
import { TGetUserSecretsDTO, TGetUserSecretsKey } from "./types";

export const userSecretKeys = {
  // this is also used in secretSnapshot part
  getUserSecret: ({ workspaceId, environment }: TGetUserSecretsKey) =>
    [{ workspaceId, environment }, "secrets"] as const
};

export const fetchUserSecrets = async ({ workspaceId, environment }: TGetProjectSecretsKey) => {
  const { data } = await apiRequest.get<SecretV3RawResponse>("/api/v3/user-secrets/raw", {
    params: {
      environment,
      workspaceId
    }
  });

  return data;
};

export const useGetUserSecrets = ({
  workspaceId,
  environment,
  options
}: TGetUserSecretsDTO & {
  options?: Omit<
    UseQueryOptions<
      SecretV3RawResponse,
      unknown,
      SecretV3RawSanitized[],
      ReturnType<typeof userSecretKeys.getUserSecret>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    // wait for all values to be available
    enabled: Boolean(workspaceId && environment) && (options?.enabled ?? true),
    queryKey: userSecretKeys.getUserSecret({ workspaceId, environment }),
    queryFn: () => fetchUserSecrets({ workspaceId, environment }),
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const serverResponse = error.response?.data as { message: string };
        createNotification({
          title: "Error fetching users secrets",
          type: "error",
          text: serverResponse.message
        });
      }
    },
    select: useCallback(
      (data: Awaited<ReturnType<typeof fetchUserSecrets>>) => mergePersonalSecrets(data.secrets),
      []
    )
  });
