import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSecretScanningGitRisks } from "./types";

export const secretScanningQueryKeys = {
  getInstallationStatus: (orgId: string) => ["secret-scanning-installation-status", { orgId }],
  getRisksByOrganizatio: (orgId: string) => ["secret-scanning-risks", { orgId }]
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

const fetchSecretScanningRisksByOrgId = async (oranizationId: string) => {
  const { data } = await apiRequest.get<{ risks: TSecretScanningGitRisks[] }>(
    `/api/v1/secret-scanning/organization/${oranizationId}/risks`
  );
  return data.risks;
};

export const useGetSecretScanningRisks = (orgId: string) =>
  useQuery({
    queryKey: secretScanningQueryKeys.getRisksByOrganizatio(orgId),
    queryFn: () => fetchSecretScanningRisksByOrgId(orgId)
  });
