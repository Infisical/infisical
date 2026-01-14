import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { certificatePolicyKeys } from "./queries";
import {
  TCertificatePolicy,
  TCreateCertificatePolicyDTO,
  TDeleteCertificatePolicyDTO,
  TUpdateCertificatePolicyDTO
} from "./types";

export const useCreateCertificatePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificatePolicy, object, TCreateCertificatePolicyDTO>({
    mutationFn: async (data) => {
      const { data: response } = await apiRequest.post<{
        certificatePolicy: TCertificatePolicy;
      }>("/api/v1/cert-manager/certificate-policies", data);
      return response.certificatePolicy;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: certificatePolicyKeys.listPolicies({ projectId })
      });
    }
  });
};

export const useUpdateCertificatePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificatePolicy, object, TUpdateCertificatePolicyDTO>({
    mutationFn: async ({ policyId, ...data }) => {
      const { data: response } = await apiRequest.patch<{
        certificatePolicy: TCertificatePolicy;
      }>(`/api/v1/cert-manager/certificate-policies/${policyId}`, data);
      return response.certificatePolicy;
    },
    onSuccess: (policy, { policyId }) => {
      queryClient.invalidateQueries({
        queryKey: certificatePolicyKeys.listPolicies({ projectId: policy.projectId })
      });
      queryClient.invalidateQueries({
        queryKey: certificatePolicyKeys.getPolicyById(policyId)
      });
    }
  });
};

export const useDeleteCertificatePolicy = () => {
  const queryClient = useQueryClient();
  return useMutation<TCertificatePolicy, object, TDeleteCertificatePolicyDTO>({
    mutationFn: async ({ policyId }) => {
      const { data: response } = await apiRequest.delete<{
        certificatePolicy: TCertificatePolicy;
      }>(`/api/v1/cert-manager/certificate-policies/${policyId}`);
      return response.certificatePolicy;
    },
    onSuccess: (policy, { policyId }) => {
      queryClient.invalidateQueries({
        queryKey: certificatePolicyKeys.listPolicies({ projectId: policy.projectId })
      });
      queryClient.removeQueries({
        queryKey: certificatePolicyKeys.getPolicyById(policyId)
      });
    }
  });
};
