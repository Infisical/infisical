import type {
  TAccessSharedSecretRequest,
  TAccessSharedSecretResponse,
  TBrandingConfig,
  TCreatedSharedSecret,
  TCreateSecretRequestRequestDTO,
  TCreateSharedSecretRequest,
  TDeleteSecretRequestDTO,
  TDeleteSharedSecretRequestDTO,
  TRevealedSecretRequest,
  TRevealSecretRequestValueRequest,
  TSharedSecret,
  TSharedSecretPublicDetails
} from "@app/hooks/api/secretSharing/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type BrandingAssetType = "brand-logo" | "brand-favicon";

export type SecretSharingPage = { secrets: TSharedSecret[]; totalCount: number };

export type SecretSharingAdapter = {
  useSharedSecrets: (dto: { offset: number; limit: number }) => V4QueryResult<SecretSharingPage>;
  useSecretRequests: (dto: { offset: number; limit: number }) => V4QueryResult<SecretSharingPage>;
  useCreateSharedSecret: V4Mutation<TCreateSharedSecretRequest, TCreatedSharedSecret>;
  useCreateSecretRequest: V4Mutation<TCreateSecretRequestRequestDTO, TCreatedSharedSecret>;
  useDeleteSharedSecret: V4Mutation<TDeleteSharedSecretRequestDTO, unknown>;
  useDeleteSecretRequest: V4Mutation<TDeleteSecretRequestDTO, unknown>;
  useRevealSecretRequestValue: V4Mutation<
    TRevealSecretRequestValueRequest,
    TRevealedSecretRequest["secretRequest"]
  >;
  useBrandingEntitlement: (orgId: string) => V4QueryResult<boolean>;
  useBrandingConfig: () => V4QueryResult<TBrandingConfig>;
  useBrandingAsset: (
    assetType: BrandingAssetType,
    enabled: boolean
  ) => V4QueryResult<string | null>;
  useUploadBrandingAsset: V4Mutation<{ assetType: BrandingAssetType; file: File }, unknown>;
  useDeleteBrandingAsset: V4Mutation<{ assetType: BrandingAssetType }, unknown>;
};

export type SecretSharingPublicAdapter = {
  useSharedSecretDetails: (sharedSecretId: string) => V4QueryResult<TSharedSecretPublicDetails>;
  useSharedSecretBranding: (sharedSecretId: string) => V4QueryResult<TBrandingConfig>;
  useAccessSharedSecret: () => {
    mutate: (variables: TAccessSharedSecretRequest) => void;
    data: TAccessSharedSecretResponse | undefined;
    error: unknown;
    isPending: boolean;
    isError: boolean;
  };
  useCreatePublicSharedSecret: V4Mutation<TCreateSharedSecretRequest, TCreatedSharedSecret>;
  brandingAssetUrl: (sharedSecretId: string, assetType: BrandingAssetType) => string;
};
