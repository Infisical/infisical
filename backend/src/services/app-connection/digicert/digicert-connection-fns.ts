import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DIGICERT_AUTH_HEADER } from "./digicert-connection-constants";
import { DigiCertConnectionMethod, DigiCertRegion } from "./digicert-connection-enums";
import { extractDigiCertErrorMessage } from "./digicert-connection-errors";
import {
  TDigiCertConnection,
  TDigiCertConnectionConfig,
  TDigiCertOrganization,
  TDigiCertProduct
} from "./digicert-connection-types";

export const getDigiCertConnectionListItem = () => {
  return {
    name: "DigiCert" as const,
    app: AppConnection.DigiCert as const,
    methods: Object.values(DigiCertConnectionMethod) as [DigiCertConnectionMethod.ApiKey]
  };
};

export const getDigiCertApiBaseUrl = (region: DigiCertRegion): string => {
  switch (region) {
    case DigiCertRegion.EU:
      return IntegrationUrls.DIGICERT_SERVICES_API_URL_EU;
    case DigiCertRegion.US:
    default:
      return IntegrationUrls.DIGICERT_SERVICES_API_URL;
  }
};

export const validateDigiCertConnectionCredentials = async (config: TDigiCertConnectionConfig) => {
  const { credentials: inputCredentials } = config;
  const baseUrl = getDigiCertApiBaseUrl(inputCredentials.region);

  try {
    await request.get(`${baseUrl}/organization`, {
      headers: {
        [DIGICERT_AUTH_HEADER]: inputCredentials.apiKey,
        "Content-Type": "application/json"
      }
    });
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to validate credentials: ${extractDigiCertErrorMessage(error)}`
      });
    }
    throw new BadRequestError({
      message: `Unable to validate connection: ${(error as Error).message || "Verify credentials"}`
    });
  }

  return inputCredentials;
};

type TDigiCertOrganizationsResponse = {
  organizations: {
    id: number;
    name: string;
    display_name?: string;
    status?: string;
  }[];
};

export const listDigiCertOrganizations = async (
  appConnection: TDigiCertConnection
): Promise<TDigiCertOrganization[]> => {
  const { apiKey, region } = appConnection.credentials;
  const baseUrl = getDigiCertApiBaseUrl(region);

  try {
    const { data } = await request.get<TDigiCertOrganizationsResponse>(`${baseUrl}/organization`, {
      headers: {
        [DIGICERT_AUTH_HEADER]: apiKey,
        "Content-Type": "application/json"
      }
    });

    return (data.organizations ?? []).map((org) => ({
      id: org.id,
      name: org.name,
      displayName: org.display_name,
      status: org.status
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list DigiCert organizations: ${extractDigiCertErrorMessage(error)}`
      });
    }
    throw error;
  }
};

type TDigiCertProductsResponse = {
  products: {
    name_id: string;
    name: string;
    type?: string;
    validation_type?: string;
    signature_hash_types?: { allowed_hash_types?: { id?: string }[] };
  }[];
};

const DIGICERT_SSL_PRODUCT_TYPE = "ssl_certificate";

export const listDigiCertProducts = async (appConnection: TDigiCertConnection): Promise<TDigiCertProduct[]> => {
  const { apiKey, region } = appConnection.credentials;
  const baseUrl = getDigiCertApiBaseUrl(region);

  try {
    const { data } = await request.get<TDigiCertProductsResponse>(`${baseUrl}/product`, {
      headers: {
        [DIGICERT_AUTH_HEADER]: apiKey,
        "Content-Type": "application/json"
      }
    });

    return (data.products ?? [])
      .filter((product) => product.type === DIGICERT_SSL_PRODUCT_TYPE)
      .map((product) => ({
        nameId: product.name_id,
        name: product.name,
        type: product.type,
        validationType: product.validation_type
      }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list DigiCert products: ${extractDigiCertErrorMessage(error)}`
      });
    }
    throw error;
  }
};
