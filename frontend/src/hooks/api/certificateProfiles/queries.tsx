import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCertificateProfile,
  TCertificateProfileMetrics,
  TCertificateProfileWithDetails,
  TGetCertificateProfileByIdDTO,
  TGetCertificateProfileBySlugDTO,
  TGetProfileCertificatesDTO,
  TGetProfileMetricsDTO,
  TListCertificateProfilesDTO,
  TProfileCertificate
} from "./types";

export const certificateProfileKeys = {
  list: (params: {
    projectId: string;
    limit?: number;
    offset?: number;
    search?: string;
    includeMetrics?: boolean;
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
  ]
};

export const useListCertificateProfiles = ({
  projectId,
  limit = 20,
  offset = 0,
  search,
  includeMetrics = false,
  includeConfigs = false,
  enrollmentType,
  expiringDays = 7
}: TListCertificateProfilesDTO) => {
  return useQuery({
    queryKey: certificateProfileKeys.list({
      projectId,
      limit,
      offset,
      search,
      includeMetrics,
      includeConfigs,
      enrollmentType,
      expiringDays
    }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateProfiles: TCertificateProfile[];
        totalCount: number;
      }>("/api/v1/pki/certificate-profiles", {
        params: {
          projectId,
          limit,
          offset,
          search,
          includeMetrics,
          includeConfigs,
          enrollmentType,
          expiringDays
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
      }>(`/api/v1/pki/certificate-profiles/${profileId}`);
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
      }>(`/api/v1/pki/certificate-profiles/slug/${slug}`, {
        params: { projectId }
      });
      return data.certificateProfile;
    },
    enabled: Boolean(projectId && slug)
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
      }>(`/api/v1/pki/certificate-profiles/${profileId}/certificates`, {
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

export const useGetProfileMetrics = ({ profileId, expiringDays = 7 }: TGetProfileMetricsDTO) => {
  return useQuery({
    queryKey: certificateProfileKeys.getMetrics(profileId, { expiringDays }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        metrics: TCertificateProfileMetrics;
      }>(`/api/v1/pki/certificate-profiles/${profileId}/metrics`, {
        params: { expiringDays }
      });
      return data.metrics;
    },
    enabled: Boolean(profileId)
  });
};
