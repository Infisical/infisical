import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSshCertificateTemplate } from "../sshCertificateTemplates/types";
import { TSshCertificateAuthority } from "./types";

export const sshCaKeys = {
  getSshCaById: (caId: string) => [{ caId }, "ssh-ca"],
  getSshCaCertTemplates: (caId: string) => [{ caId }, "ssh-ca-cert-templates"]
};

export const useGetSshCaById = (caId: string) => {
  return useQuery({
    queryKey: sshCaKeys.getSshCaById(caId),
    queryFn: async () => {
      const {
        data: { ca }
      } = await apiRequest.get<{ ca: TSshCertificateAuthority }>(`/api/v1/ssh/ca/${caId}`);
      return ca;
    },
    enabled: Boolean(caId)
  });
};

export const useGetSshCaCertTemplates = (caId: string) => {
  return useQuery({
    queryKey: sshCaKeys.getSshCaCertTemplates(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateTemplates: TSshCertificateTemplate[];
      }>(`/api/v1/ssh/ca/${caId}/certificate-templates`);
      return data;
    },
    enabled: Boolean(caId)
  });
};
