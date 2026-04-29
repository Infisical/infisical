import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { gatewaysQueryKeys } from "../gateways/queries";
import { gatewaysV2QueryKeys } from "../gateways-v2/queries";
import { resourceAuthMethodQueryKeys } from "./queries";
import {
  AttachAwsAuthDTO,
  AttachTokenAuthDTO,
  ResourceAwsAuth,
  ResourceRef,
  ResourceTokenAuth,
  UpdateAwsAuthDTO
} from "./types";

const buildPathSegment = (type: ResourceRef["type"]) => {
  if (type === "gateway") return "gateways";
  throw new Error(`Unsupported resource type: ${type as string}`);
};

const invalidateResourceQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  resource: ResourceRef,
  method: "aws" | "token"
) => {
  // Only invalidate the method that was actually touched — sibling methods are unaffected.
  const key =
    method === "aws"
      ? resourceAuthMethodQueryKeys.awsAuth(resource)
      : resourceAuthMethodQueryKeys.tokenAuth(resource);
  queryClient.invalidateQueries({ queryKey: key });

  if (resource.type === "gateway") {
    // Gateway list responses include enrollmentTokenStatus and connection state that can shift
    // when auth methods change (e.g. token-auth attach can produce a fresh enrollment token).
    queryClient.invalidateQueries(gatewaysQueryKeys.list());
    queryClient.invalidateQueries(gatewaysQueryKeys.listWithTokens());
    queryClient.invalidateQueries({ queryKey: gatewaysV2QueryKeys.byIdKey(resource.id) });
  }
};

export const useAddResourceAwsAuth = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resource, ...body }: AttachAwsAuthDTO) => {
      const { data } = await apiRequest.post<{ resourceAwsAuth: ResourceAwsAuth }>(
        `/api/v1/resource-aws-auth/${buildPathSegment(resource.type)}/${resource.id}`,
        body
      );
      return data.resourceAwsAuth;
    },
    onSuccess: (_, variables) => invalidateResourceQueries(queryClient, variables.resource, "aws")
  });
};

export const useUpdateResourceAwsAuth = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resource, ...body }: UpdateAwsAuthDTO) => {
      const { data } = await apiRequest.patch<{ resourceAwsAuth: ResourceAwsAuth }>(
        `/api/v1/resource-aws-auth/${buildPathSegment(resource.type)}/${resource.id}`,
        body
      );
      return data.resourceAwsAuth;
    },
    onSuccess: (_, variables) => invalidateResourceQueries(queryClient, variables.resource, "aws")
  });
};

export const useDeleteResourceAwsAuth = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resource }: { resource: ResourceRef }) => {
      const { data } = await apiRequest.delete<{ resourceAwsAuth: ResourceAwsAuth }>(
        `/api/v1/resource-aws-auth/${buildPathSegment(resource.type)}/${resource.id}`
      );
      return data.resourceAwsAuth;
    },
    onSuccess: (_, variables) => invalidateResourceQueries(queryClient, variables.resource, "aws")
  });
};

export const useAddResourceTokenAuth = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resource }: AttachTokenAuthDTO) => {
      const { data } = await apiRequest.post<{ resourceTokenAuth: ResourceTokenAuth }>(
        `/api/v1/resource-token-auth/${buildPathSegment(resource.type)}/${resource.id}`
      );
      return data.resourceTokenAuth;
    },
    onSuccess: (_, variables) => invalidateResourceQueries(queryClient, variables.resource, "token")
  });
};

export const useDeleteResourceTokenAuth = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resource }: { resource: ResourceRef }) => {
      const { data } = await apiRequest.delete<{ resourceTokenAuth: ResourceTokenAuth }>(
        `/api/v1/resource-token-auth/${buildPathSegment(resource.type)}/${resource.id}`
      );
      return data.resourceTokenAuth;
    },
    onSuccess: (_, variables) => invalidateResourceQueries(queryClient, variables.resource, "token")
  });
};

// Token generation goes through the legacy v3 endpoint (useConfigureGatewayTokenAuth in
// gateways-v2/mutations.tsx) because the deployed CLI relies on it. We don't expose a v1
// generate-token mutation here to avoid a second URL pointing at the same operation.
