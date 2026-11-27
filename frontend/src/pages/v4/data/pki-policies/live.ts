import { useGetAdcsTemplates, useGetAzureAdcsTemplates } from "@app/hooks/api/ca/queries";
import {
  useCreateCertificatePolicy,
  useDeleteCertificatePolicy,
  useUpdateCertificatePolicy
} from "@app/hooks/api/certificatePolicies/mutations";
import {
  useGetCertificatePolicyById,
  useListCertificatePolicies
} from "@app/hooks/api/certificatePolicies/queries";
import {
  useCreateCertificateProfile,
  useDeleteCertificateProfile,
  useUpdateCertificateProfile
} from "@app/hooks/api/certificateProfiles/mutations";
import {
  useGetCertificateProfileById,
  useListCertificateProfiles
} from "@app/hooks/api/certificateProfiles/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { PkiPoliciesAdapter } from "./contract";

export const pkiPoliciesLive: PkiPoliciesAdapter = {
  usePolicies: useListCertificatePolicies,
  usePolicy: useGetCertificatePolicyById,
  useCreatePolicy: useCreateCertificatePolicy,
  useUpdatePolicy: useUpdateCertificatePolicy,
  useDeletePolicy: useDeleteCertificatePolicy,
  useProfiles: useListCertificateProfiles,
  useProfile: useGetCertificateProfileById,
  useCreateProfile: useCreateCertificateProfile,
  useUpdateProfile: useUpdateCertificateProfile,
  useDeleteProfile: useDeleteCertificateProfile,
  useAzureAdcsTemplates: useGetAzureAdcsTemplates,
  useAdcsTemplates: useGetAdcsTemplates,
  useSubscription: (orgId) => useGetOrgSubscription({ orgID: orgId })
};
