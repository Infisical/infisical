import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { apiRequest } from "@app/config/request";

import { ResourceAwsAuth, ResourceRef, ResourceTokenAuth } from "./types";

const buildPathSegment = (type: ResourceRef["type"]) => {
  if (type === "gateway") return "gateways";
  throw new Error(`Unsupported resource type: ${type as string}`);
};

// 404 from these endpoints means "method not attached", which is a valid query result for the
// UI — not an error. Treating it as `null` keeps the query in success state with a falsy
// `data`, so observers can simply check `data` to know whether the method is attached.
// Without this, react-query would keep the stale `data` from before the row was deleted and
// the UI would still render the method as attached until a hard refresh.
const isNotFound = (err: unknown) => isAxiosError(err) && err.response?.status === 404;

export const resourceAuthMethodQueryKeys = {
  all: () => ["resource-auth-method"] as const,
  awsAuth: ({ type, id }: ResourceRef) =>
    [...resourceAuthMethodQueryKeys.all(), "aws", type, id] as const,
  tokenAuth: ({ type, id }: ResourceRef) =>
    [...resourceAuthMethodQueryKeys.all(), "token", type, id] as const
};

export const useGetResourceAwsAuth = (resource: ResourceRef, enabled = true) => {
  return useQuery({
    queryKey: resourceAuthMethodQueryKeys.awsAuth(resource),
    enabled: enabled && Boolean(resource.id),
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<ResourceAwsAuth | null> => {
      try {
        const { data } = await apiRequest.get<{ resourceAwsAuth: ResourceAwsAuth }>(
          `/api/v1/resource-aws-auth/${buildPathSegment(resource.type)}/${resource.id}`
        );
        return data.resourceAwsAuth;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    retry: false
  });
};

export const useGetResourceTokenAuth = (resource: ResourceRef, enabled = true) => {
  return useQuery({
    queryKey: resourceAuthMethodQueryKeys.tokenAuth(resource),
    enabled: enabled && Boolean(resource.id),
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<ResourceTokenAuth | null> => {
      try {
        const { data } = await apiRequest.get<{ resourceTokenAuth: ResourceTokenAuth }>(
          `/api/v1/resource-token-auth/${buildPathSegment(resource.type)}/${resource.id}`
        );
        return data.resourceTokenAuth;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    retry: false
  });
};
