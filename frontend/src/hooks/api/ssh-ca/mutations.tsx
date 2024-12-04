import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { organizationKeys } from "../organization/queries";
import {
  TCreateSshCaDTO,
  TDeleteSshCaDTO,
  TIssueSshCredsDTO,
  TIssueSshCredsResponse,
  TSshCertificateAuthority,
  TUpdateSshCaDTO} from "./types";

export const sshCaKeys = {
  getSshCaById: (caId: string) => [{ caId }, "ssh-ca"]
};

export const useCreateSshCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateAuthority, {}, TCreateSshCaDTO>({
    mutationFn: async (body) => {
      const {
        data: { ca }
      } = await apiRequest.post<{ ca: TSshCertificateAuthority }>("/api/v1/ssh/ca/", body);
      return ca;
    },
    onSuccess: ({ orgId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgSshCas({ orgId }));
    }
  });
};

export const useUpdateSshCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateAuthority, {}, TUpdateSshCaDTO>({
    mutationFn: async ({ caId, ...body }) => {
      const {
        data: { ca }
      } = await apiRequest.patch<{ ca: TSshCertificateAuthority }>(`/api/v1/ssh/ca/${caId}`, body);
      return ca;
    },
    onSuccess: ({ orgId }, { caId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgSshCas({ orgId }));
      queryClient.invalidateQueries(sshCaKeys.getSshCaById(caId));
    }
  });
};

export const useDeleteSshCa = () => {
  const queryClient = useQueryClient();
  return useMutation<TSshCertificateAuthority, {}, TDeleteSshCaDTO>({
    mutationFn: async ({ caId }) => {
      const {
        data: { ca }
      } = await apiRequest.delete<{ ca: TSshCertificateAuthority }>(`/api/v1/ssh/ca/${caId}`);
      return ca;
    },
    onSuccess: ({ orgId }) => {
      queryClient.invalidateQueries(organizationKeys.getOrgSshCas({ orgId }));
    }
  });
};

export const useIssueSshCreds = () => {
  return useMutation<TIssueSshCredsResponse, {}, TIssueSshCredsDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TIssueSshCredsResponse>("/api/v1/ssh/issue", body);
      return data;
    }
  });
};
