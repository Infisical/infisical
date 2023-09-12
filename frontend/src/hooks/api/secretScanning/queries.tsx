import { useMutation } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { GitRisks, RiskStatus, UpdateRiskStatusDTO } from "./types";

/**
 * Will create a new Infisical Radar integration session and return the success state
 * @param {string} installationId - The ID of the installation
 * @param {string} sessionId - The ID of the session
 * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating success.
 */
export const linkGitAppInstallationWithOrganization = async (installationId: string, sessionId: string): Promise<boolean> => {
  const { data: { installationLink } } = await apiRequest.post("/api/v1/secret-scanning/link-installation", {
    installationId,
    sessionId,
  })
  
  return installationLink;
}

/**
 * Will return the installation status of Infisical Radar for the given organization
 * @param {string} organizationId - The ID of the organization
 * @returns {Promise<boolean>} - A promise that resolves to a boolean indicating the installation status.
 */
export const getInstallationStatus = async (organizationId: string): Promise<boolean> => {
  const { data: { appInstallationComplete } } = await apiRequest.get(`/api/v1/secret-scanning/installation-status/organization/${organizationId}`)
  
  return appInstallationComplete;
}

/**
 * Will create a new secret scanning session and return the session ID for the given organization
 * @param {string} organizationId - The ID of the organization
 * @returns {Promise<string>} - A promise that resolves to the session ID.
 */
export const createSecretScanningSession = async (organizationId: string): Promise<string> => {
  const { data: { sessionId } } = await apiRequest.post(`/api/v1/secret-scanning/create-installation-session/organization/${organizationId}`, {
    organizationId,
  })
  
  return sessionId;
}

/**
 * Will create a new Infisical Radar integration session and return the success state
 * @param {string} organizationId - The ID of the organization
 * @returns {Promise<GitRisks[]>} - A promise that resolves to an array of GitRisks.
 */
export const getRisksByOrganization = async (organizationId: string): Promise<GitRisks[]> => {
  const { data: { risks } } = await apiRequest.get(`/api/v1/secret-scanning/organization/${organizationId}/risks`)
  
  return risks;
}

/**
 * Updates the risk status [status] for the selected risk ID [riskId] (default: UNRESOLVED) and given organization
 * @returns {object} - An object containing the `updateRiskStatus` function.
 */
export const useUpdateRiskStatus = () => {
  const updateRiskStatusMutation = useMutation<GitRisks[], Error, UpdateRiskStatusDTO>({
    mutationFn: async ({ organizationId, riskId, status }) => {
      const { data } = await apiRequest.post(`/api/v1/secret-scanning/organization/${organizationId}/risks/${riskId}/status`, {
        status,
      });
      return data;
    },
  });

  const updateRiskStatus = async (organizationId: string, riskId: string, status: RiskStatus) => {
    const result = await updateRiskStatusMutation.mutateAsync({ organizationId, riskId, status });
    return result;
  };

  return { updateRiskStatus };
};
