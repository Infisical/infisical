import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCertificate,
  TCertificateRequestDetails,
  TListCertificateRequestsParams,
  TListCertificateRequestsResponse
} from "./types";

export const certKeys = {
  getCertById: (serialNumber: string) => [{ serialNumber }, "cert"],
  getCertBody: (serialNumber: string) => [{ serialNumber }, "certBody"],
  getCertBundle: (serialNumber: string) => [{ serialNumber }, "certBundle"],
  getCertificateRequest: (requestId: string, projectSlug: string) => [
    { requestId, projectSlug },
    "certificateRequest"
  ],
  listCertificateRequests: (params: TListCertificateRequestsParams) => [
    "certificateRequests",
    "list",
    params.projectSlug,
    params.offset,
    params.limit,
    params.search,
    params.status,
    params.fromDate,
    params.toDate,
    params.profileIds,
    params.sortBy,
    params.sortOrder
  ]
};

export const useGetCert = (serialNumber: string) => {
  return useQuery({
    queryKey: certKeys.getCertById(serialNumber),
    queryFn: async () => {
      const {
        data: { certificate }
      } = await apiRequest.get<{ certificate: TCertificate }>(
        `/api/v1/pki/certificates/${serialNumber}`
      );
      return certificate;
    },
    enabled: Boolean(serialNumber)
  });
};

export const useGetCertBody = (serialNumber: string) => {
  return useQuery({
    queryKey: certKeys.getCertBody(serialNumber),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificate: string;
        certificateChain: string;
        serialNumber: string;
      }>(`/api/v1/pki/certificates/${serialNumber}/certificate`);
      return data;
    },
    enabled: Boolean(serialNumber)
  });
};

export const useGetCertBundle = (serialNumber: string) => {
  return useQuery({
    queryKey: certKeys.getCertBundle(serialNumber),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        certificate: string;
        certificateChain: string;
        serialNumber: string;
        privateKey: string | null;
      }>(`/api/v1/pki/certificates/${serialNumber}/bundle`);
      return data;
    },
    enabled: Boolean(serialNumber)
  });
};

export const useListCertificateRequests = (params: TListCertificateRequestsParams) => {
  return useQuery({
    queryKey: certKeys.listCertificateRequests(params),
    queryFn: async () => {
      const searchParams = new URLSearchParams();

      searchParams.append("projectSlug", params.projectSlug);

      if (params.offset !== undefined) searchParams.append("offset", params.offset.toString());
      if (params.limit !== undefined) searchParams.append("limit", params.limit.toString());
      if (params.search) searchParams.append("search", params.search);
      if (params.status) searchParams.append("status", params.status);
      if (params.fromDate) searchParams.append("fromDate", params.fromDate.toISOString());
      if (params.toDate) searchParams.append("toDate", params.toDate.toISOString());
      if (params.profileIds && params.profileIds.length > 0) {
        params.profileIds.forEach((id) => {
          searchParams.append("profileIds", id);
        });
      }
      if (params.sortBy) searchParams.append("sortBy", params.sortBy);
      if (params.sortOrder) searchParams.append("sortOrder", params.sortOrder);

      const { data } = await apiRequest.get<TListCertificateRequestsResponse>(
        `/api/v1/cert-manager/certificates/certificate-requests?${searchParams.toString()}`
      );
      return data;
    },
    enabled: Boolean(params.projectSlug),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchInterval: false
  });
};

export const useGetCertificateRequest = (requestId: string, projectSlug: string) => {
  return useQuery({
    queryKey: certKeys.getCertificateRequest(requestId, projectSlug),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCertificateRequestDetails>(
        `/api/v1/cert-manager/certificates/certificate-requests/${requestId}?projectSlug=${projectSlug}`
      );
      return data;
    },
    enabled: Boolean(requestId) && Boolean(projectSlug)
  });
};
