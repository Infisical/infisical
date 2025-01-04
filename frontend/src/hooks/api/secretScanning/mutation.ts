import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { RiskStatus, TGitAppOrg, TSecretScanningGitRisks } from "./types";

export const useCreateNewInstallationSession = () => {
  return useMutation<{ sessionId: string }, object, { organizationId: string }>({
    mutationFn: async (opt) => {
      const { data } = await apiRequest.post(
        "/api/v1/secret-scanning/create-installation-session/organization",
        opt
      );
      return data;
    }
  });
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
