import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificateTemplate } from "../certificateTemplates/types";
import { CaType } from "./enums";
import { TCertificateAuthority, TUnifiedCertificateAuthority } from "./types";

export const caKeys = {
  getCaById: (caId: string) => [{ caId }, "ca"],
  getCaByNameAndProjectId: (caName: string, projectId: string) => [{ caName, projectId }, "ca"],
  listCasByTypeAndProjectId: (type: CaType, projectId: string) => [{ type, projectId }, "cas"],
  listCasByProjectId: (projectId: string) => [{ projectId }, "cas"],
  getCaCerts: (caId: string) => [{ caId }, "ca-cert"],
  getCaCrls: (caId: string) => [{ caId }, "ca-crls"],
  getCaCert: (caId: string) => [{ caId }, "ca-cert"],
  getCaCsr: (caId: string) => [{ caId }, "ca-csr"],
  getCaCrl: (caId: string) => [{ caId }, "ca-crl"],
  getCaCertTemplates: (caId: string) => [{ caId }, "ca-cert-templates"],
  getCaEstConfig: (caId: string) => [{ caId }, "ca-est-config"]
};

export const useGetCa = ({
  caName,
  projectId,
  type
}: {
  caName: string;
  projectId: string;
  type: CaType;
}) => {
  return useQuery({
    queryKey: caKeys.getCaByNameAndProjectId(caName, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TUnifiedCertificateAuthority>(
        `/api/v1/pki/ca/${type}/${caName}?projectId=${projectId}`
      );
      return data;
    },
    enabled: Boolean(caName && projectId && type)
  });
};

export const useListCasByTypeAndProjectId = (type: CaType, projectId: string) => {
  return useQuery({
    queryKey: caKeys.listCasByTypeAndProjectId(type, projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TUnifiedCertificateAuthority[]>(
        `/api/v1/pki/ca/${type}?projectId=${projectId}`
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
      }>(`/api/v2/pki/ca?projectId=${projectId}`);

      return data.certificateAuthorities;
    }
  });
};

export const useGetCaById = (caId: string) => {
  return useQuery({
    queryKey: caKeys.getCaById(caId),
    queryFn: async () => {
      const {
        data: { ca }
      } = await apiRequest.get<{ ca: TCertificateAuthority }>(`/api/v1/pki/ca/${caId}`);
      return ca;
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
      >(`/api/v1/pki/ca/${caId}/ca-certificates`); // TODO: consider updating endpoint structure
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
      }>(`/api/v1/pki/ca/${caId}/certificate`); // TODO: consider updating endpoint structure
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
      }>(`/api/v1/pki/ca/${caId}/csr`);
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
      >(`/api/v1/pki/ca/${caId}/crls`);
      return data;
    },
    enabled: Boolean(caId)
  });
};

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
