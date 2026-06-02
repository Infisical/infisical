import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { extractGoDaddyErrorMessage } from "@app/services/app-connection/godaddy/godaddy-connection-errors";

type TCreateCertificateRequest = {
  commonName: string;
  csr: string;
  period: number;
  productType: string;
  rootType?: string;
  subjectAlternativeNames?: string[];
};

type TCreateCertificateResponse = {
  certificateId: string;
};

type TRenewCertificateRequest = {
  commonName?: string;
  csr?: string;
  period?: number;
  rootType?: string;
  subjectAlternativeNames?: string[];
};

type TGetCertificateResponse = {
  certificateId: string;
  status: string;
  commonName?: string;
  serialNumber?: string;
  validStart?: string;
  validEnd?: string;
  productType?: string;
  subjectAlternativeNames?: { subjectAlternativeName: string; status?: string }[];
};

type TCertificateBundleResponse = {
  pems: {
    certificate: string;
    cross?: string;
    intermediate?: string;
    root?: string;
  };
  serialNumber?: string;
};

export type TGoDaddyApiClient = ReturnType<typeof createGoDaddyApiClient>;

export const createGoDaddyApiClient = (authHeader: string, baseURL: string) => {
  const headers = {
    Authorization: authHeader,
    "Content-Type": "application/json"
  };

  const wrap = <T>(fn: () => Promise<T>, action: string) =>
    fn().catch((error: unknown) => {
      if (error instanceof AxiosError) {
        throw new BadRequestError({
          message: `GoDaddy ${action} failed: ${extractGoDaddyErrorMessage(error)}`
        });
      }
      throw error;
    });

  const createCertificate = async (body: TCreateCertificateRequest) =>
    wrap(async () => {
      const { data } = await request.post<TCreateCertificateResponse>(`${baseURL}/v1/certificates`, body, { headers });
      return data;
    }, "certificate order placement");

  const getCertificate = async (certificateId: string) =>
    wrap(async () => {
      const { data } = await request.get<TGetCertificateResponse>(`${baseURL}/v1/certificates/${certificateId}`, {
        headers
      });
      return data;
    }, `certificate lookup for ${certificateId}`);

  const downloadCertificate = async (certificateId: string) =>
    wrap(async () => {
      const { data } = await request.get<TCertificateBundleResponse>(
        `${baseURL}/v1/certificates/${certificateId}/download`,
        { headers }
      );
      return data;
    }, `certificate download for ${certificateId}`);

  // GoDaddy renewal operates on the existing certificate id (POST .../renew → 202, no body),
  // so the renewed certificate keeps the same GoDaddy id. Only available 60 days before to 30 days
  // after the previous certificate's expiry — outside that window GoDaddy rejects the request.
  const renewCertificate = async (certificateId: string, body: TRenewCertificateRequest) =>
    wrap(async () => {
      await request.post(`${baseURL}/v1/certificates/${certificateId}/renew`, body, { headers });
    }, `certificate renewal for ${certificateId}`);

  const revokeCertificate = async (certificateId: string, reason: string) =>
    wrap(async () => {
      await request.post(`${baseURL}/v1/certificates/${certificateId}/revoke`, { reason }, { headers });
    }, `certificate revocation for ${certificateId}`);

  const cancelCertificate = async (certificateId: string) =>
    wrap(async () => {
      await request.post(`${baseURL}/v1/certificates/${certificateId}/cancel`, null, { headers });
    }, `certificate cancellation for ${certificateId}`);

  return {
    createCertificate,
    getCertificate,
    downloadCertificate,
    renewCertificate,
    revokeCertificate,
    cancelCertificate
  };
};
