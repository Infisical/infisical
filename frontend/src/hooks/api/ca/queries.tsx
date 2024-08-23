import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TCertificateAuthority } from "./types";

export const caKeys = {
  getCaById: (caId: string) => [{ caId }, "ca"],
  getCaCerts: (caId: string) => [{ caId }, "ca-cert"],
  getCaCrls: (caId: string) => [{ caId }, "ca-crls"],
  getCaCert: (caId: string) => [{ caId }, "ca-cert"],
  getCaCsr: (caId: string) => [{ caId }, "ca-csr"],
  getCaCrl: (caId: string) => [{ caId }, "ca-crl"]
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
