import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TLiteLLMModel, TLiteLLMTeam, TLiteLLMUser } from "./types";

const litellmConnectionKeys = {
  all: [...appConnectionKeys.all, "litellm"] as const,
  listUsers: (connectionId: string) =>
    [...litellmConnectionKeys.all, "users", connectionId] as const,
  listTeams: (connectionId: string, userId?: string) =>
    [...litellmConnectionKeys.all, "teams", connectionId, { userId }] as const,
  listModels: (connectionId: string) =>
    [...litellmConnectionKeys.all, "models", connectionId] as const
};

export const useListLiteLLMConnectionUsers = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TLiteLLMUser[],
      unknown,
      TLiteLLMUser[],
      ReturnType<typeof litellmConnectionKeys.listUsers>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: litellmConnectionKeys.listUsers(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ users: TLiteLLMUser[] }>(
        `/api/v1/app-connections/litellm/${connectionId}/users`
      );

      return data.users;
    },
    ...options
  });
};

export const useListLiteLLMConnectionTeams = (
  connectionId: string,
  userId?: string,
  options?: Omit<
    UseQueryOptions<
      TLiteLLMTeam[],
      unknown,
      TLiteLLMTeam[],
      ReturnType<typeof litellmConnectionKeys.listTeams>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: litellmConnectionKeys.listTeams(connectionId, userId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ teams: TLiteLLMTeam[] }>(
        `/api/v1/app-connections/litellm/${connectionId}/teams`,
        { params: { userId } }
      );

      return data.teams;
    },
    ...options
  });
};

export const useListLiteLLMConnectionModels = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TLiteLLMModel[],
      unknown,
      TLiteLLMModel[],
      ReturnType<typeof litellmConnectionKeys.listModels>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: litellmConnectionKeys.listModels(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ models: TLiteLLMModel[] }>(
        `/api/v1/app-connections/litellm/${connectionId}/models`
      );

      return data.models;
    },
    ...options
  });
};
