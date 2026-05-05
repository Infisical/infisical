import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TListPkiApplicationsResponse,
  TPkiApplication,
  TPkiApplicationEnrollmentState,
  TPkiApplicationListItem,
  TPkiApplicationMember,
  TPkiApplicationProfile
} from "./types";

export const pkiApplicationKeys = {
  all: ["pki-applications"] as const,
  list: (search?: string) => [...pkiApplicationKeys.all, "list", { search }] as const,
  byId: (applicationId: string) => [...pkiApplicationKeys.all, "by-id", { applicationId }] as const,
  bySlug: (slug: string) => [...pkiApplicationKeys.all, "by-slug", { slug }] as const,
  profiles: (applicationId: string) =>
    [...pkiApplicationKeys.all, "profiles", { applicationId }] as const,
  members: (applicationId: string) =>
    [...pkiApplicationKeys.all, "members", { applicationId }] as const,
  enrollment: (applicationId: string, profileId: string) =>
    [...pkiApplicationKeys.all, "enrollment", { applicationId, profileId }] as const
};

const BASE_URL = "/api/v1/cert-manager/applications";

export const useListPkiApplications = (
  search?: string,
  options?: Omit<
    UseQueryOptions<
      TListPkiApplicationsResponse,
      unknown,
      TPkiApplicationListItem[],
      ReturnType<typeof pkiApplicationKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pkiApplicationKeys.list(search),
    queryFn: async () => {
      const { data } = await apiRequest.get<TListPkiApplicationsResponse>(BASE_URL, {
        params: { search }
      });
      return data;
    },
    select: (data) => data.applications,
    ...options
  });

export const useGetPkiApplication = (
  applicationId: string,
  options?: Omit<
    UseQueryOptions<
      { application: TPkiApplication },
      unknown,
      TPkiApplication,
      ReturnType<typeof pkiApplicationKeys.byId>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pkiApplicationKeys.byId(applicationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ application: TPkiApplication }>(
        `${BASE_URL}/${applicationId}`
      );
      return data;
    },
    enabled: Boolean(applicationId),
    select: (data) => data.application,
    ...options
  });

export const useGetPkiApplicationBySlug = (
  slug: string,
  options?: Omit<
    UseQueryOptions<
      { application: TPkiApplication },
      unknown,
      TPkiApplication,
      ReturnType<typeof pkiApplicationKeys.bySlug>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pkiApplicationKeys.bySlug(slug),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ application: TPkiApplication }>(
        `${BASE_URL}/slug/${slug}`
      );
      return data;
    },
    enabled: Boolean(slug),
    select: (data) => data.application,
    ...options
  });

export const useListPkiApplicationProfiles = (applicationId: string) =>
  useQuery({
    queryKey: pkiApplicationKeys.profiles(applicationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ profiles: TPkiApplicationProfile[] }>(
        `${BASE_URL}/${applicationId}/profiles`
      );
      return data.profiles;
    },
    enabled: Boolean(applicationId)
  });

export const useListPkiApplicationMembers = (applicationId: string) =>
  useQuery({
    queryKey: pkiApplicationKeys.members(applicationId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ memberships: TPkiApplicationMember[] }>(
        `${BASE_URL}/${applicationId}/memberships`
      );
      return data.memberships;
    },
    enabled: Boolean(applicationId)
  });

export const useGetPkiApplicationEnrollment = (applicationId: string, profileId: string) =>
  useQuery({
    queryKey: pkiApplicationKeys.enrollment(applicationId, profileId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TPkiApplicationEnrollmentState>(
        `${BASE_URL}/${applicationId}/profiles/${profileId}/enrollment`
      );
      return data;
    },
    enabled: Boolean(applicationId && profileId)
  });
