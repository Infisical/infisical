import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TBrandingConfig,
  TGetSecretRequestByIdResponse,
  TSharedSecret,
  TViewSharedSecretResponse
} from "./types";

export const secretSharingKeys = {
  allSharedSecrets: () => ["sharedSecrets"] as const,
  specificSharedSecrets: ({ offset, limit }: { offset: number; limit: number }) =>
    [...secretSharingKeys.allSharedSecrets(), { offset, limit }] as const,
  allSecretRequests: () => ["secretRequests"] as const,
  specificSecretRequests: ({ offset, limit }: { offset: number; limit: number }) =>
    [...secretSharingKeys.allSecretRequests(), { offset, limit }] as const,
  getSecretById: (arg: { id: string; hashedHex: string | null; password?: string }) => [
    "shared-secret",
    arg
  ],
  getSecretRequestById: (arg: { id: string }) => ["secret-request", arg] as const,
  brandingAssets: () => ["brandingAssets"] as const
};

export const useGetSharedSecrets = ({
  offset = 0,
  limit = 25
}: {
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: secretSharingKeys.specificSharedSecrets({ offset, limit }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const { data } = await apiRequest.get<{ secrets: TSharedSecret[]; totalCount: number }>(
        "/api/v1/secret-sharing/shared",
        {
          params
        }
      );
      return data;
    }
  });
};

export const useGetSecretRequests = ({
  offset = 0,
  limit = 25
}: {
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: secretSharingKeys.specificSecretRequests({ offset, limit }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ secrets: TSharedSecret[]; totalCount: number }>(
        "/api/v1/secret-sharing/requests",
        {
          params: {
            offset: String(offset),
            limit: String(limit)
          }
        }
      );
      return data;
    }
  });
};
export const useGetActiveSharedSecretById = ({
  sharedSecretId,
  hashedHex,
  password
}: {
  sharedSecretId: string;
  hashedHex: string | null;
  password?: string;
}) => {
  return useQuery({
    queryKey: secretSharingKeys.getSecretById({
      id: sharedSecretId,
      hashedHex,
      password
    }),
    queryFn: async () => {
      const { data } = await apiRequest.post<TViewSharedSecretResponse>(
        `/api/v1/secret-sharing/shared/public/${sharedSecretId}`,
        {
          ...(hashedHex && { hashedHex }),
          password
        }
      );

      return data;
    },
    enabled: Boolean(sharedSecretId)
  });
};

export const useGetSecretRequestById = ({ secretRequestId }: { secretRequestId: string }) => {
  return useQuery({
    queryKey: secretSharingKeys.getSecretRequestById({ id: secretRequestId }),
    queryFn: async () => {
      const { data } = await apiRequest.get<TGetSecretRequestByIdResponse>(
        `/api/v1/secret-sharing/requests/${secretRequestId}`
      );

      return data.secretRequest;
    }
  });
};

export const useGetBrandingConfig = () => {
  return useQuery({
    queryKey: secretSharingKeys.brandingAssets(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBrandingConfig>(
        "/api/v1/secret-sharing/shared/branding"
      );
      return data;
    }
  });
};
