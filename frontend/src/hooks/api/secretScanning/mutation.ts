import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  RiskStatus,
  SecretScanningResolvedStatus,
  TGitAppOrg,
  TSecretScanningGitRisks
} from "./types";

export const useCreateNewInstallationSession = () => {
  return useMutation<{ sessionId: string; gitAppSlug: string }, object, { organizationId: string }>(
    {
      mutationFn: async (opt) => {
        const { data } = await apiRequest.post(
          "/api/v1/secret-scanning/create-installation-session/organization",
          opt
        );
        return data;
      }
    }
  );
};

export const useUpdateRiskStatus = () => {
  return useMutation<
    TSecretScanningGitRisks,
    object,
    { organizationId: string; riskId: string; status: RiskStatus }
  >({
    mutationFn: async (opt) => {
      const { data } = await apiRequest.post<TSecretScanningGitRisks>(
        `/api/v1/secret-scanning/organization/${opt.organizationId}/risks/${opt.riskId}/status`,
        { status: opt.status }
      );
      return data;
    }
  });
};

export const useLinkGitAppInstallationWithOrg = () => {
  return useMutation<TGitAppOrg, object, { sessionId: string; installationId: string }>({
    mutationFn: async (opt) => {
      const { data } = await apiRequest.post<TGitAppOrg>(
        "/api/v1/secret-scanning/link-installation",
        opt
      );
      return data;
    }
  });
};

export const useExportSecretScanningRisks = () => {
  return useMutation<
    TSecretScanningGitRisks[],
    object,
    {
      orgId: string;
      filter: {
        repositoryNames?: string[];
        resolvedStatus?: SecretScanningResolvedStatus;
      };
    }
  >({
    mutationFn: async ({ filter, orgId }) => {
      const params = new URLSearchParams({
        ...(filter.resolvedStatus && { resolvedStatus: filter.resolvedStatus }),
        ...(filter.repositoryNames && { repositoryNames: filter.repositoryNames.join(",") })
      });

      const { data } = await apiRequest.get<{
        risks: TSecretScanningGitRisks[];
      }>(`/api/v1/secret-scanning/organization/${orgId}/risks/export`, {
        params
      });
      return data.risks;
    }
  });
};
