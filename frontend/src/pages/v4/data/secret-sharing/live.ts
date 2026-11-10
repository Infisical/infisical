import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  useAccessSharedSecret,
  useCreatePublicSharedSecret,
  useCreateSecretRequest,
  useCreateSharedSecret,
  useDeleteBrandingAsset,
  useDeleteSecretRequest,
  useDeleteSharedSecret,
  useRevealSecretRequestValue,
  useUploadBrandingAsset
} from "@app/hooks/api/secretSharing/mutations";
import {
  secretSharingKeys,
  useGetBrandingConfig,
  useGetSecretRequests,
  useGetSharedSecretBranding,
  useGetSharedSecretById,
  useGetSharedSecrets
} from "@app/hooks/api/secretSharing/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type {
  BrandingAssetType,
  SecretSharingAdapter,
  SecretSharingPublicAdapter
} from "./contract";

const readAsDataUrl = (blob: Blob) =>
  new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });

const useBrandingAsset = (assetType: BrandingAssetType, enabled: boolean) =>
  useQuery({
    queryKey: [...secretSharingKeys.brandingAssets(), assetType],
    enabled,
    queryFn: async () => {
      const { data } = await apiRequest.get<Blob>(`/api/v1/shared-secrets/branding/${assetType}`, {
        responseType: "blob"
      });
      return readAsDataUrl(data);
    }
  });

export const secretSharingLive: SecretSharingAdapter = {
  useSharedSecrets: useGetSharedSecrets,
  useSecretRequests: useGetSecretRequests,
  useCreateSharedSecret,
  useCreateSecretRequest,
  useDeleteSharedSecret,
  useDeleteSecretRequest,
  useRevealSecretRequestValue,
  useBrandingEntitlement: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return { data: data ? Boolean(data.secretShareExternalBranding) : undefined, isPending, error };
  },
  useBrandingConfig: useGetBrandingConfig,
  useBrandingAsset,
  useUploadBrandingAsset,
  useDeleteBrandingAsset
};

export const secretSharingPublicLive: SecretSharingPublicAdapter = {
  useSharedSecretDetails: (sharedSecretId) => useGetSharedSecretById({ sharedSecretId }),
  useSharedSecretBranding: (sharedSecretId) => useGetSharedSecretBranding({ sharedSecretId }),
  useAccessSharedSecret,
  useCreatePublicSharedSecret,
  brandingAssetUrl: (sharedSecretId, assetType) =>
    `/api/v1/shared-secrets/public/${sharedSecretId}/branding/${assetType}`
};
