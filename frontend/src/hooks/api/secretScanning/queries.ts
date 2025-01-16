import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SecretScanningOrderBy, SecretScanningRiskFilter, TSecretScanningGitRisks } from "./types";

export const secretScanningQueryKeys = {
  getInstallationStatus: (orgId: string) => ["secret-scanning-installation-status", { orgId }],
  getRisksByOrganization: (
    orgId: string,
    sort: {
      offset: number;
      limit: number;
      orderBy: SecretScanningOrderBy;
    },
    filter: SecretScanningRiskFilter
  ) => ["secret-scanning-risks", { orgId, sort, filter }]
};

const fetchSecretScanningInstallationStatus = async (organizationId: string) => {
  const { data } = await apiRequest.get<{ appInstallationCompleted: boolean }>(
    `/api/v1/secret-scanning/installation-status/organization/${organizationId}`
  );
  return data;
};

export const useGetSecretScanningInstallationStatus = (orgId: string) =>
  useQuery({
    queryKey: secretScanningQueryKeys.getInstallationStatus(orgId),
    queryFn: () => fetchSecretScanningInstallationStatus(orgId)
  });

const fetchSecretScanningRisksByOrgId = async (
  organizationId: string,
  sort: {
    offset: number;
    limit: number;
    orderBy: SecretScanningOrderBy;
  },
  filter: SecretScanningRiskFilter
) => {
  const params = new URLSearchParams({
    offset: String(sort.offset),
    limit: String(sort.limit),
    orderBy: sort.orderBy,
    ...(filter.resolvedStatus && { resolvedStatus: filter.resolvedStatus }),
    ...(filter.repositoryNames && { repositoryNames: filter.repositoryNames.join(",") })
  });

  const { data } = await apiRequest.get<{
    risks: TSecretScanningGitRisks[];
    totalCount: number;
    repos: string[];
  }>(`/api/v1/secret-scanning/organization/${organizationId}/risks`, {
    params
  });
  return data;
};

export const useGetSecretScanningRisks = (
  orgId: string,
  sort: {
    offset: number;
    limit: number;
    orderBy: SecretScanningOrderBy;
  },
  filter: SecretScanningRiskFilter
) =>
  useQuery({
    queryKey: secretScanningQueryKeys.getRisksByOrganization(orgId, sort, filter),
    queryFn: () => fetchSecretScanningRisksByOrgId(orgId, sort, filter)
  });
