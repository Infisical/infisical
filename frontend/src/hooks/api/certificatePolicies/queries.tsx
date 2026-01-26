import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCertificatePolicy,
  TGetCertificatePolicyByIdDTO,
  TListCertificatePoliciesDTO
} from "./types";

export const certificatePolicyKeys = {
  listPolicies: ({ projectId, ...el }: { limit?: number; offset?: number; projectId: string }) => [
    "list-certificate-policies",
    projectId,
    el
  ],
  getPolicyById: (id: string) => ["certificate-policy", id]
};

export const useListCertificatePolicies = ({
  projectId,
  limit = 20,
  offset = 0
}: TListCertificatePoliciesDTO) => {
  return useQuery({
    queryKey: certificatePolicyKeys.listPolicies({ projectId, limit, offset }),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificatePolicies: TCertificatePolicy[];
        totalCount: number;
      }>("/api/v1/cert-manager/certificate-policies", {
        params: {
          projectId,
          limit,
          offset
        }
      });
      return data;
    },
    enabled: Boolean(projectId)
  });
};

export const useGetCertificatePolicyById = ({ policyId }: TGetCertificatePolicyByIdDTO) => {
  return useQuery({
    queryKey: certificatePolicyKeys.getPolicyById(policyId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificatePolicy: TCertificatePolicy;
      }>(`/api/v1/cert-manager/certificate-policies/${policyId}`);
      return data.certificatePolicy;
    },
    enabled: Boolean(policyId)
  });
};
