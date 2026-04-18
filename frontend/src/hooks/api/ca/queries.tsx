import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificateTemplate } from "../certificateTemplates/types";
import { CaRenewalStatus, CaSigningConfigType, CaType } from "./enums";
import {
  TAzureAdCsTemplate,
  TInternalCertificateAuthority,
  TUnifiedCertificateAuthority
} from "./types";

export const caKeys = {
  getCaById: (caId: string) => [{ caId }, "ca"],
  getCaByNameAndProjectId: (caName: string, projectId: string) => [{ caName, projectId }, "ca"],
  listCasByTypeAndProjectId: (type: CaType, projectId: string) => [{ type, projectId }, "cas"],
  listCasByProjectId: (projectId: string) => [{ projectId }, "cas"],
  listExternalCasByProjectId: (projectId: string) => [{ projectId }, "external-cas"],
  getCaCerts: (caId: string) => [{ caId }, "ca-cert"],
  getCaCrls: (caId: string) => [{ caId }, "ca-crls"],
  getCaCert: (caId: string) => [{ caId }, "ca-cert"],
  getCaCsr: (caId: string) => [{ caId }, "ca-csr"],
  getCaCrl: (caId: string) => [{ caId }, "ca-crl"],
  getCaCertTemplates: (caId: string) => [{ caId }, "ca-cert-templates"],
  getCaEstConfig: (caId: string) => [{ caId }, "ca-est-config"],
  getAzureAdcsTemplates: (caId: string, projectId: string) => [
    { caId, projectId },
    "azure-adcs-templates"
  ],
  getCaSigningConfig: (caId: string) => [{ caId }, "ca-signing-config"],
  getCaAutoRenewal: (caId: string) => [{ caId }, "ca-auto-renewal"]
};

export const useGetCa = ({
  caId,
  type,
  options
}: {
  caId: string;
  type: CaType;
  options?: { enabled?: boolean };
}) => {
  return useQuery({
    queryKey: caKeys.getCaById(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TUnifiedCertificateAuthority>(
        `/api/v1/cert-manager/ca/${type}/${caId}`
      );
      return data;
    },
    enabled: options?.enabled !== undefined ? options.enabled : Boolean(caId && type)
  });
};

export const useListCasByTypeAndProjectId = (type: CaType, projectId: string) => {
  return useQuery({
    queryKey: caKeys.listCasByTypeAndProjectId(type, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TUnifiedCertificateAuthority[]>(
        `/api/v1/cert-manager/ca/${type}?projectId=${projectId}`
      );

      return data;
    }
  });
};

export const useListCasByProjectId = (projectId: string) => {
  return useQuery({
    queryKey: caKeys.listCasByProjectId(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateAuthorities: TUnifiedCertificateAuthority[];
      }>(`/api/v1/cert-manager/ca?projectId=${projectId}`);

      return data.certificateAuthorities;
    }
  });
};

export const useListExternalCasByProjectId = (projectId: string) => {
  return useQuery({
    queryKey: caKeys.listExternalCasByProjectId(projectId),
    queryFn: async () => {
      const [acmeResponse, azureAdCsResponse, awsPcaResponse, awsAcmPublicCaResponse] =
        await Promise.allSettled([
          apiRequest.get<TUnifiedCertificateAuthority[]>(
            `/api/v1/cert-manager/ca/${CaType.ACME}?projectId=${projectId}`
          ),
          apiRequest.get<TUnifiedCertificateAuthority[]>(
            `/api/v1/cert-manager/ca/${CaType.AZURE_AD_CS}?projectId=${projectId}`
          ),
          apiRequest.get<TUnifiedCertificateAuthority[]>(
            `/api/v1/cert-manager/ca/${CaType.AWS_PCA}?projectId=${projectId}`
          ),
          apiRequest.get<TUnifiedCertificateAuthority[]>(
            `/api/v1/cert-manager/ca/${CaType.AWS_ACM_PUBLIC_CA}?projectId=${projectId}`
          )
        ]);

      const allCas: TUnifiedCertificateAuthority[] = [];

      if (acmeResponse.status === "fulfilled") {
        allCas.push(...acmeResponse.value.data);
      }

      if (azureAdCsResponse.status === "fulfilled") {
        allCas.push(...azureAdCsResponse.value.data);
      }

      if (awsPcaResponse.status === "fulfilled") {
        allCas.push(...awsPcaResponse.value.data);
      }

      if (awsAcmPublicCaResponse.status === "fulfilled") {
        allCas.push(...awsAcmPublicCaResponse.value.data);
      }

      return allCas;
    }
  });
};

export const useGetInternalCaById = (caId: string) => {
  return useQuery({
    queryKey: caKeys.getCaById(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TInternalCertificateAuthority>(
        `/api/v1/cert-manager/ca/internal/${caId}`
      );
      return data;
    },
    enabled: Boolean(caId)
  });
};

export const useGetCaCerts = (caId: string) => {
  return useQuery({
    queryKey: caKeys.getCaCerts(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<
        {
          certificate: string;
          certificateChain: string;
          serialNumber: string;
          version: number;
        }[]
      >(`/api/v1/cert-manager/ca/internal/${caId}/ca-certificates`);
      return data;
    },
    enabled: Boolean(caId)
  });
};

export const useGetCaCert = (caId: string) => {
  return useQuery({
    queryKey: caKeys.getCaCert(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificate: string;
        certificateChain: string;
        serialNumber: string;
      }>(`/api/v1/cert-manager/ca/internal/${caId}/certificate`);
      return data;
    },
    enabled: Boolean(caId)
  });
};

export const useGetCaCsr = (caId: string) => {
  return useQuery({
    queryKey: caKeys.getCaCsr(caId),
    queryFn: async () => {
      const {
        data: { csr }
      } = await apiRequest.get<{
        csr: string;
      }>(`/api/v1/cert-manager/ca/internal/${caId}/csr`);
      return csr;
    },
    enabled: Boolean(caId)
  });
};

export const useGetCaCrls = (caId: string) => {
  return useQuery({
    queryKey: caKeys.getCaCrls(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<
        {
          id: string;
          crl: string;
        }[]
      >(`/api/v1/cert-manager/ca/internal/${caId}/crls`);
      return data;
    },
    enabled: Boolean(caId)
  });
};

// TODO: DEPRECATE
export const useGetCaCertTemplates = (caId: string) => {
  return useQuery({
    queryKey: caKeys.getCaCertTemplates(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificateTemplates: TCertificateTemplate[];
      }>(`/api/v1/pki/ca/${caId}/certificate-templates`);
      return data;
    },
    enabled: Boolean(caId)
  });
};

export type TCaSigningConfig = {
  id: string;
  caId: string;
  type: CaSigningConfigType;
  parentCaId: string | null;
  appConnectionId: string | null;
  destinationConfig: Record<string, unknown> | null;
  lastExternalCertificateId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TCaAutoRenewalConfig = {
  autoRenewalEnabled: boolean;
  autoRenewalDaysBeforeExpiry: number | null;
  lastRenewalStatus: CaRenewalStatus | null;
  lastRenewalMessage: string | null;
  lastRenewalAt: string | null;
};

export const useGetCaSigningConfig = (caId: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: caKeys.getCaSigningConfig(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCaSigningConfig | null>(
        `/api/v1/cert-manager/ca/internal/${caId}/signing-config`
      );
      return data;
    },
    enabled: options?.enabled !== undefined ? options.enabled : Boolean(caId)
  });
};

export const useGetCaAutoRenewal = (caId: string, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: caKeys.getCaAutoRenewal(caId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCaAutoRenewalConfig>(
        `/api/v1/cert-manager/ca/internal/${caId}/auto-renewal`
      );
      return data;
    },
    enabled: options?.enabled !== undefined ? options.enabled : Boolean(caId),
    refetchInterval: (query) => {
      const { data } = query.state;
      if (data?.lastRenewalStatus === CaRenewalStatus.PENDING) return 10_000;
      return false;
    }
  });
};

export const useGetAzureAdcsTemplates = ({
  caId,
  projectId,
  isAzureAdcsCa
}: {
  caId: string;
  projectId: string;
  isAzureAdcsCa: boolean;
}) => {
  return useQuery({
    queryKey: caKeys.getAzureAdcsTemplates(caId, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        templates: TAzureAdCsTemplate[];
      }>(`/api/v1/cert-manager/ca/azure-ad-cs/${caId}/templates?projectId=${projectId}`);
      return data;
    },
    enabled: Boolean(caId && projectId && isAzureAdcsCa)
  });
};
