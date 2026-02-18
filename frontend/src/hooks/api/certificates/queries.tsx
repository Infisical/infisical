import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TCertificate,
  TCertificateByIdResponse,
  TCertificateRequestDetails,
  TListCertificateRequestsParams,
  TListCertificateRequestsResponse
} from "./types";

export const certKeys = {
  getCertById: (serialNumber: string) => [{ serialNumber }, "cert"],
  getCertBody: (serialNumber: string) => [{ serialNumber }, "certBody"],
  getCertBundle: (serialNumber: string) => [{ serialNumber }, "certBundle"],
  getCertificateById: (certificateId: string) => [{ certificateId }, "certificateById"],
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

export const useGetCertificateById = (certificateId: string) => {
  return useQuery({
    queryKey: certKeys.getCertificateById(certificateId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TCertificateByIdResponse>(
        `/api/v1/cert-manager/certificates/${certificateId}`
      );
      return data;
    },
    enabled: Boolean(certificateId)
  });
};

const DATE_RANGE_DAYS = 90;

export const useListCertificateRequests = (params: TListCertificateRequestsParams) => {
  return useQuery({
    queryKey: certKeys.listCertificateRequests(params),
    queryFn: async () => {
      const now = Date.now();
      const daysInMs = DATE_RANGE_DAYS * 24 * 60 * 60 * 1000;

      const { data } = await apiRequest.get<TListCertificateRequestsResponse>(
        "/api/v1/cert-manager/certificates/certificate-requests",
        {
          params: {
            projectSlug: params.projectSlug,
            offset: params.offset,
            limit: params.limit,
            search: params.search,
            status: params.status,
            fromDate: (params.fromDate || new Date(now - daysInMs)).toISOString(),
            toDate: (params.toDate || new Date(now)).toISOString(),
            profileIds: params.profileIds?.join(","),
            sortBy: params.sortBy,
            sortOrder: params.sortOrder
          }
        }
      );
      return data;
    },
    enabled: Boolean(params.projectSlug),
    placeholderData: (previousData) => previousData
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
