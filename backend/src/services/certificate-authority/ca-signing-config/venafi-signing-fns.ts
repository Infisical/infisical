/* eslint-disable no-await-in-loop */
import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { VenafiRegion } from "@app/services/app-connection/venafi/venafi-connection-enums";
import { getVenafiBaseUrl, getVenafiHeaders } from "@app/services/app-connection/venafi/venafi-connection-fns";

import { TVenafiDestinationConfig } from "./ca-signing-config-types";

type TVenafiApiParams = {
  apiKey: string;
  region: VenafiRegion;
};

type TSubmitCsrToVenafiParams = TVenafiApiParams & {
  csr: string;
  destinationConfig: TVenafiDestinationConfig;
};

type TVenafiCertificateRequestItem = {
  id: string;
  certificateIds?: string[];
  status?: string;
  errorInformation?: {
    type?: string;
    code?: number;
    message?: string;
    args?: string[];
  };
};

type TVenafiCertificateRequestResponse = {
  certificateRequests: TVenafiCertificateRequestItem[];
};

const VENAFI_POLL_INTERVAL_MS = 5000;
const VENAFI_POLL_MAX_ATTEMPTS = 60; // 5 minutes max

type TVenafiErrorResponse = {
  errors?: { code?: number; message?: string; args?: string[] }[];
};

const getVenafiErrorMessage = (error: AxiosError): string => {
  const data = error.response?.data as TVenafiErrorResponse | undefined;
  const errors = data?.errors;
  if (errors && errors.length > 0 && errors[0].message) {
    return errors[0].message;
  }
  return error.message || "Unknown error";
};

export const submitCsrToVenafi = async ({
  apiKey,
  region,
  csr,
  destinationConfig
}: TSubmitCsrToVenafiParams): Promise<string> => {
  const baseUrl = getVenafiBaseUrl(region);
  try {
    const { data } = await request.post<TVenafiCertificateRequestResponse>(
      `${baseUrl}/outagedetection/v1/certificaterequests`,
      {
        certificateSigningRequest: csr,
        applicationId: destinationConfig.applicationId,
        certificateIssuingTemplateId: destinationConfig.issuingTemplateId,
        ...(destinationConfig.validityPeriod && {
          validityPeriod: `P${destinationConfig.validityPeriod}D`
        })
      },
      {
        headers: getVenafiHeaders(apiKey)
      }
    );

    const certRequest = data.certificateRequests?.[0];
    if (!certRequest?.id) {
      throw new BadRequestError({ message: "Venafi did not return a certificate request ID" });
    }
    return certRequest.id;
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to submit CSR to Venafi: ${getVenafiErrorMessage(error)}`
      });
    }
    throw new BadRequestError({
      message: "Failed to submit CSR to Venafi"
    });
  }
};

export const checkVenafiRequestStatus = async ({
  apiKey,
  region,
  requestId
}: TVenafiApiParams & { requestId: string }): Promise<TVenafiCertificateRequestItem> => {
  const baseUrl = getVenafiBaseUrl(region);

  try {
    const { data } = await request.get<TVenafiCertificateRequestItem>(
      `${baseUrl}/outagedetection/v1/certificaterequests/${requestId}`,
      {
        headers: getVenafiHeaders(apiKey)
      }
    );

    return data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to check Venafi request status: ${getVenafiErrorMessage(error)}`
      });
    }
    throw new BadRequestError({
      message: "Failed to check Venafi request status"
    });
  }
};

export const downloadVenafiCertificate = async ({
  apiKey,
  region,
  certificateId
}: TVenafiApiParams & { certificateId: string }): Promise<string> => {
  const baseUrl = getVenafiBaseUrl(region);

  try {
    const { data } = await request.get<string>(`${baseUrl}/outagedetection/v1/certificates/${certificateId}/contents`, {
      params: {
        format: "PEM",
        chainOrder: "EE_FIRST"
      },
      headers: {
        "tppl-api-key": apiKey
      }
    });

    return data;
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to download certificate from Venafi: ${getVenafiErrorMessage(error)}`
      });
    }
    throw new BadRequestError({
      message: "Failed to download certificate from Venafi"
    });
  }
};

export const pollVenafiCertificateIssuance = async ({
  apiKey,
  region,
  requestId
}: TVenafiApiParams & { requestId: string }): Promise<{ certificateId: string }> => {
  for (let attempt = 0; attempt < VENAFI_POLL_MAX_ATTEMPTS; attempt += 1) {
    const status = await checkVenafiRequestStatus({ apiKey, region, requestId });

    if (status.certificateIds && status.certificateIds.length > 0) {
      return { certificateId: status.certificateIds[0] };
    }

    if (status.status === "FAILED" || status.status === "REJECTED") {
      const errorDetail = status.errorInformation?.message;
      throw new BadRequestError({
        message: errorDetail
          ? `Venafi certificate request ${status.status.toLowerCase()}: ${errorDetail}`
          : `Venafi certificate request ${status.status.toLowerCase()}`
      });
    }

    logger.info(
      `Venafi certificate request ${requestId} still pending (attempt ${attempt + 1}/${VENAFI_POLL_MAX_ATTEMPTS})`
    );

    await new Promise((resolve) => {
      setTimeout(resolve, VENAFI_POLL_INTERVAL_MS);
    });
  }

  throw new BadRequestError({
    message: "Venafi certificate issuance timed out"
  });
};

export const renewVenafiCertificate = async ({
  apiKey,
  region,
  existingCertificateId,
  csr,
  destinationConfig
}: TVenafiApiParams & {
  existingCertificateId: string;
  csr: string;
  destinationConfig: TVenafiDestinationConfig;
}): Promise<string> => {
  const baseUrl = getVenafiBaseUrl(region);

  try {
    const { data } = await request.post<TVenafiCertificateRequestResponse>(
      `${baseUrl}/outagedetection/v1/certificaterequests`,
      {
        certificateSigningRequest: csr,
        applicationId: destinationConfig.applicationId,
        certificateIssuingTemplateId: destinationConfig.issuingTemplateId,
        existingCertificateId,
        ...(destinationConfig.validityPeriod && {
          validityPeriod: `P${destinationConfig.validityPeriod}D`
        })
      },
      {
        headers: getVenafiHeaders(apiKey)
      }
    );

    const certRequest = data.certificateRequests?.[0];
    if (!certRequest?.id) {
      throw new BadRequestError({ message: "Venafi did not return a certificate request ID" });
    }
    return certRequest.id;
  } catch (error: unknown) {
    if (error instanceof BadRequestError) throw error;
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to renew certificate via Venafi: ${getVenafiErrorMessage(error)}`
      });
    }
    throw new BadRequestError({
      message: "Failed to renew certificate via Venafi"
    });
  }
};
