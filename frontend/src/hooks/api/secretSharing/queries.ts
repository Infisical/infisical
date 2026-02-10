import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TBrandingConfig,
  TGetSecretRequestByIdResponse,
  TSharedSecret,
  TSharedSecretPublicDetails
} from "./types";

export const secretSharingKeys = {
  allSharedSecrets: () => ["sharedSecrets"] as const,
  specificSharedSecrets: ({ offset, limit }: { offset: number; limit: number }) =>
    [...secretSharingKeys.allSharedSecrets(), { offset, limit }] as const,
  allSecretRequests: () => ["secretRequests"] as const,
  specificSecretRequests: ({ offset, limit }: { offset: number; limit: number }) =>
    [...secretSharingKeys.allSecretRequests(), { offset, limit }] as const,
  getSharedSecretDetails: (id: string) => ["shared-secret", id] as const,
  getSecretRequestById: (arg: { id: string }) => ["secret-request", arg] as const,
  brandingAssets: () => ["brandingAssets"] as const,
  sharedSecretBranding: (id: string) => ["shared-secret-branding", id] as const
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
        "/api/v1/secret-sharing",
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
export const useGetSharedSecretById = ({ sharedSecretId }: { sharedSecretId: string }) => {
  return useQuery({
    queryKey: secretSharingKeys.getSharedSecretDetails(sharedSecretId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TSharedSecretPublicDetails>(
        `/api/v1/secret-sharing/${sharedSecretId}`
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

      return data;
    }
  });
};

export const useGetBrandingConfig = () => {
  return useQuery({
    queryKey: secretSharingKeys.brandingAssets(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBrandingConfig>("/api/v1/secret-sharing/branding");
      return data;
    }
  });
};

export const useGetSharedSecretBranding = ({ sharedSecretId }: { sharedSecretId: string }) => {
  return useQuery({
    queryKey: secretSharingKeys.sharedSecretBranding(sharedSecretId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TBrandingConfig>("/api/v1/secret-sharing/branding", {
        params: { sharedSecretId }
      });
      return data;
    },
    enabled: Boolean(sharedSecretId)
  });
};
