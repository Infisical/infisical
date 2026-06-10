import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import {
  createResourcePermissionQueryHook,
  ResourcePermissionResponse
} from "@app/helpers/resourcePermissions";

import {
  TListPkiApplicationsParams,
  TListPkiApplicationsResponse,
  TPkiApplication,
  TPkiApplicationEnrollmentState,
  TPkiApplicationMember,
  TPkiApplicationPermissionSet,
  TPkiApplicationProfile
} from "./types";

export const pkiApplicationKeys = {
  all: ["pki-applications"] as const,
  list: (params?: TListPkiApplicationsParams) =>
    [...pkiApplicationKeys.all, "list", { ...params }] as const,
  byId: (applicationId: string) => [...pkiApplicationKeys.all, "by-id", { applicationId }] as const,
  byName: (name: string) => [...pkiApplicationKeys.all, "by-name", { name }] as const,
  profiles: (applicationId: string) =>
    [...pkiApplicationKeys.all, "profiles", { applicationId }] as const,
  members: (applicationId: string) =>
    [...pkiApplicationKeys.all, "members", { applicationId }] as const,
  getUserApplicationPermissions: (applicationId: string) =>
    ["user-application-permissions", { applicationId }] as const,
  enrollment: (applicationId: string, profileId: string) =>
    [...pkiApplicationKeys.all, "enrollment", { applicationId, profileId }] as const
};

const BASE_URL = "/api/v1/cert-manager/applications";

export const useListPkiApplications = (
  params?: TListPkiApplicationsParams,
  options?: Omit<
    UseQueryOptions<
      TListPkiApplicationsResponse,
      unknown,
      TListPkiApplicationsResponse,
      ReturnType<typeof pkiApplicationKeys.list>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pkiApplicationKeys.list(params),
    queryFn: async () => {
      const { applicationIds, ...rest } = params ?? {};
      const { data } = await apiRequest.get<TListPkiApplicationsResponse>(BASE_URL, {
        params: {
          ...rest,
          ...(applicationIds?.length ? { applicationIds: applicationIds.join(",") } : {})
        }
      });
      return data;
    },
    placeholderData: (previousData) => previousData,
    ...options
  });

export const useGetPkiApplicationByName = (
  name: string,
  options?: Omit<
    UseQueryOptions<
      { application: TPkiApplication },
      unknown,
      TPkiApplication,
      ReturnType<typeof pkiApplicationKeys.byName>
    >,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: pkiApplicationKeys.byName(name),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ application: TPkiApplication }>(
        `${BASE_URL}/by-name/${name}`
      );
      return data;
    },
    enabled: Boolean(name),
    select: (data) => data.application,
    ...options
  });

export const useGetPkiApplicationById = (
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
      const [users, identities, groups] = await Promise.all([
        apiRequest.get<{ memberships: TPkiApplicationMember[] }>(
          `${BASE_URL}/${applicationId}/users`
        ),
        apiRequest.get<{ memberships: TPkiApplicationMember[] }>(
          `${BASE_URL}/${applicationId}/identities`
        ),
        apiRequest.get<{ memberships: TPkiApplicationMember[] }>(
          `${BASE_URL}/${applicationId}/groups`
        )
      ]);
      return [
        ...users.data.memberships,
        ...identities.data.memberships,
        ...groups.data.memberships
      ];
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

export const fetchUserPkiApplicationPermissions = async (applicationId: string) => {
  const { data } = await apiRequest.get<{
    data: ResourcePermissionResponse<TPkiApplicationPermissionSet>;
  }>(`${BASE_URL}/${applicationId}/permissions`);
  return data.data;
};

export const useGetPkiApplicationPermissions =
  createResourcePermissionQueryHook<TPkiApplicationPermissionSet>({
    queryKey: (applicationId) => pkiApplicationKeys.getUserApplicationPermissions(applicationId),
    fetchFn: fetchUserPkiApplicationPermissions
  });
