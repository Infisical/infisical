import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TLiteLLMModel, TLiteLLMTeam, TLiteLLMUser } from "./types";

const litellmConnectionKeys = {
  all: [...appConnectionKeys.all, "litellm"] as const,
  listUsers: (connectionId: string, search?: string) =>
    [...litellmConnectionKeys.all, "users", connectionId, { search }] as const,
  listTeams: (connectionId: string, search?: string) =>
    [...litellmConnectionKeys.all, "teams", connectionId, { search }] as const,
  listModels: (connectionId: string) =>
    [...litellmConnectionKeys.all, "models", connectionId] as const
};

export const useListLiteLLMConnectionUsers = (
  connectionId: string,
  search?: string,
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
    queryKey: litellmConnectionKeys.listUsers(connectionId, search),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ users: TLiteLLMUser[] }>(
        `/api/v1/app-connections/litellm/${connectionId}/users`,
        { params: { search } }
      );

      return data.users;
    },
    ...options
  });
};

export const useListLiteLLMConnectionTeams = (
  connectionId: string,
  search?: string,
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
    queryKey: litellmConnectionKeys.listTeams(connectionId, search),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ teams: TLiteLLMTeam[] }>(
        `/api/v1/app-connections/litellm/${connectionId}/teams`,
        { params: { search } }
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
