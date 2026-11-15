import type { TAdcsTemplate, TAzureAdCsTemplate } from "@app/hooks/api/ca/types";
import type {
  TCertificatePolicy,
  TCreateCertificatePolicyDTO,
  TDeleteCertificatePolicyDTO,
  TGetCertificatePolicyByIdDTO,
  TListCertificatePoliciesDTO,
  TUpdateCertificatePolicyDTO
} from "@app/hooks/api/certificatePolicies/types";
import type {
  TCertificateProfile,
  TCertificateProfileWithDetails,
  TCreateCertificateProfileDTO,
  TDeleteCertificateProfileDTO,
  TGetCertificateProfileByIdDTO,
  TListCertificateProfilesDTO,
  TUpdateCertificateProfileDTO
} from "@app/hooks/api/certificateProfiles/types";
import type { SubscriptionPlan } from "@app/hooks/api/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type PkiPoliciesAdapter = {
  usePolicies: (
    dto: TListCertificatePoliciesDTO
  ) => V4QueryResult<{ certificatePolicies: TCertificatePolicy[]; totalCount: number }>;
  usePolicy: (dto: TGetCertificatePolicyByIdDTO) => V4QueryResult<TCertificatePolicy>;
  useCreatePolicy: V4Mutation<TCreateCertificatePolicyDTO, TCertificatePolicy>;
  useUpdatePolicy: V4Mutation<TUpdateCertificatePolicyDTO, TCertificatePolicy>;
  useDeletePolicy: V4Mutation<TDeleteCertificatePolicyDTO, TCertificatePolicy>;
  useProfiles: (
    dto: TListCertificateProfilesDTO
  ) => V4QueryResult<{ certificateProfiles: TCertificateProfile[]; totalCount: number }>;
  useProfile: (dto: TGetCertificateProfileByIdDTO) => V4QueryResult<TCertificateProfileWithDetails>;
  useCreateProfile: V4Mutation<TCreateCertificateProfileDTO, TCertificateProfile>;
  useUpdateProfile: V4Mutation<TUpdateCertificateProfileDTO, TCertificateProfile>;
  useDeleteProfile: V4Mutation<TDeleteCertificateProfileDTO, TCertificateProfile>;
  useAzureAdcsTemplates: (dto: {
    caId: string;
    isAzureAdcsCa: boolean;
  }) => V4QueryResult<{ templates: TAzureAdCsTemplate[] }>;
  useAdcsTemplates: (dto: {
    caId: string;
    isAdcsCa: boolean;
  }) => V4QueryResult<{ templates: TAdcsTemplate[] }>;
  useSubscription: (orgId: string) => V4QueryResult<SubscriptionPlan>;
};
