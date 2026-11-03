import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { THoneyTokenDetails, THoneyTokenEvent } from "./types";

export const honeyTokenKeys = {
  all: ["honeyTokens"] as const,
  list: (projectId: string) => [...honeyTokenKeys.all, "list", projectId] as const,
  byId: (honeyTokenId: string) => [...honeyTokenKeys.all, "byId", honeyTokenId] as const,
  events: (honeyTokenId: string) => [...honeyTokenKeys.all, "events", honeyTokenId] as const,
  credentials: (honeyTokenId: string) =>
    [...honeyTokenKeys.all, "credentials", honeyTokenId] as const
};

export const useGetHoneyTokenById = ({
  honeyTokenId,
  projectId,
  enabled = true
}: {
  honeyTokenId: string;
  projectId: string;
  enabled?: boolean;
}) =>
  useQuery({
    queryKey: honeyTokenKeys.byId(honeyTokenId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ honeyToken: THoneyTokenDetails }>(
        `/api/v1/honey-tokens/${honeyTokenId}`,
        { params: { projectId } }
      );
      return data.honeyToken;
    },
    enabled
  });

export const useGetHoneyTokenEvents = ({
  honeyTokenId,
  projectId,
  offset = 0,
  limit = 25,
  enabled = true
}: {
  honeyTokenId: string;
  projectId: string;
  offset?: number;
  limit?: number;
  enabled?: boolean;
}) =>
  useQuery({
    queryKey: [...honeyTokenKeys.events(honeyTokenId), { offset, limit }],
    queryFn: async () => {
      const { data } = await apiRequest.get<{ events: THoneyTokenEvent[]; totalCount: number }>(
        `/api/v1/honey-tokens/${honeyTokenId}/events`,
        { params: { projectId, offset, limit } }
      );
      return data;
    },
    enabled
  });

export const useGetHoneyTokenCredentials = ({
  honeyTokenId,
  projectId,
  enabled = true
}: {
  honeyTokenId: string;
  projectId: string;
  enabled?: boolean;
}) =>
  useQuery({
    queryKey: honeyTokenKeys.credentials(honeyTokenId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ credentials: Record<string, string> }>(
        `/api/v1/honey-tokens/${honeyTokenId}/credentials`,
        { params: { projectId } }
      );
      return data.credentials;
    },
    enabled
  });
