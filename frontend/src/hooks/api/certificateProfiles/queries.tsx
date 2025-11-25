import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCertificateProfile,
  TCertificateProfileWithDetails,
  TGetCertificateProfileByIdDTO,
  TGetCertificateProfileBySlugDTO,
  TGetProfileCertificatesDTO,
  TGetProfileMetricsDTO,
  TListCertificateProfilesDTO,
  TProfileCertificate,
  TRevealAcmeEabSecretDTO
} from "./types";

export const certificateProfileKeys = {
  list: (params: {
    projectId: string;
    limit?: number;
    offset?: number;
    search?: string;
    includeConfigs?: boolean;
    enrollmentType?: string;
    expiringDays?: number;
  }) => ["certificate-profiles", "list", params],
  getById: (profileId: string) => ["certificate-profiles", "get-by-id", profileId],
  getBySlug: (projectId: string, slug: string) => [
    "certificate-profiles",
    "get-by-slug",
    projectId,
    slug
  ],
  getCertificates: (profileId: string, params?: Omit<TGetProfileCertificatesDTO, "profileId">) => [
    "certificate-profiles",
    "certificates",
    profileId,
    params
  ],
  getMetrics: (profileId: string, params?: Omit<TGetProfileMetricsDTO, "profileId">) => [
    "certificate-profiles",
    "metrics",
    profileId,
    params
  ],
  revealAcmeEabSecret: (profileId: string) => [
    "certificate-profiles",
    "reveal-acme-eab-secret",
    profileId
  ]
};

export const useListCertificateProfiles = ({
  projectId,
  limit = 20,
  offset = 0,
  search,
  includeConfigs = false,
  enrollmentType
}: TListCertificateProfilesDTO) => {
  return useQuery({
    queryKey: certificateProfileKeys.list({
      projectId,
      limit,
      offset,
      search,
      includeConfigs,
      enrollmentType
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateProfiles: TCertificateProfile[];
        totalCount: number;
      }>("/api/v1/cert-manager/certificate-profiles", {
        params: {
          projectId,
          limit,
          offset,
          search,
          includeConfigs,
          enrollmentType
        }
      });
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetCertificateProfileById = ({ profileId }: TGetCertificateProfileByIdDTO) => {
  return useQuery({
    queryKey: certificateProfileKeys.getById(profileId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateProfile: TCertificateProfileWithDetails;
      }>(`/api/v1/cert-manager/certificate-profiles/${profileId}`);
      return data.certificateProfile;
    },
    enabled: Boolean(profileId)
  });
};

export const useGetCertificateProfileBySlug = ({
  projectId,
  slug
}: TGetCertificateProfileBySlugDTO) => {
  return useQuery({
    queryKey: certificateProfileKeys.getBySlug(projectId, slug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateProfile: TCertificateProfile;
      }>(`/api/v1/cert-manager/certificate-profiles/slug/${slug}`, {
        params: { projectId }
      });
      return data.certificateProfile;
    },
    enabled: Boolean(projectId && slug)
  });
};

export const useRevealAcmeEabSecret = ({ profileId }: TRevealAcmeEabSecretDTO) => {
  return useQuery({
    queryKey: certificateProfileKeys.revealAcmeEabSecret(profileId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        eabKid: string;
        eabSecret: string;
      }>(`/api/v1/cert-manager/certificate-profiles/${profileId}/acme/eab-secret/reveal`);
      return data;
    },
    enabled: Boolean(profileId)
  });
};

export const useGetProfileCertificates = ({
  profileId,
  offset = 0,
  limit = 20,
  status,
  search
}: TGetProfileCertificatesDTO) => {
  return useQuery({
    queryKey: certificateProfileKeys.getCertificates(profileId, { offset, limit, status, search }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificates: TProfileCertificate[];
      }>(`/api/v1/cert-manager/certificate-profiles/${profileId}/certificates`, {
        params: {
          offset,
          limit,
          status,
          search
        }
      });
      return data.certificates;
    },
    enabled: Boolean(profileId)
  });
};
