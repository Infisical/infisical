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

export const getDigiCertApiBaseUrl = (input: { region: DigiCertRegion }): string => {
  switch (input.region) {
    case DigiCertRegion.EU:
      return IntegrationUrls.DIGICERT_SERVICES_API_URL_EU;
    case DigiCertRegion.US:
    default:
      return IntegrationUrls.DIGICERT_SERVICES_API_URL;
  }
};

export const validateDigiCertConnectionCredentials = async (config: TDigiCertConnectionConfig) => {
  const { credentials: inputCredentials } = config;
  const baseUrl = getDigiCertApiBaseUrl(inputCredentials);

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
  const { apiKey } = appConnection.credentials;
  const baseUrl = getDigiCertApiBaseUrl(appConnection.credentials);

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

const DIGICERT_CS_VALIDATION_TYPE_BY_PRODUCT: Record<string, string> = {
  code_signing: "cs",
  code_signing_ev: "ev_cs"
};

export const DIGICERT_CS_PRODUCT_NAME_IDS = new Set(Object.keys(DIGICERT_CS_VALIDATION_TYPE_BY_PRODUCT));

type TDigiCertOrgValidationResponse = {
  validations?: { type?: string; status?: string }[];
};

export const isDigiCertOrgValidatedForProduct = (
  validations: { type?: string; status?: string }[] | undefined,
  productNameId: string
): boolean => {
  const requiredType = DIGICERT_CS_VALIDATION_TYPE_BY_PRODUCT[productNameId] ?? "cs";
  return (validations ?? []).some(
    (validation) => validation.type === requiredType && (validation.status ?? "").toLowerCase() === "active"
  );
};

export const getDigiCertOrgValidation = async (
  appConnection: TDigiCertConnection,
  organizationId: number,
  productNameId: string
): Promise<{ isValidated: boolean }> => {
  const { apiKey } = appConnection.credentials;
  const baseUrl = getDigiCertApiBaseUrl(appConnection.credentials);

  try {
    const { data } = await request.get<TDigiCertOrgValidationResponse>(
      `${baseUrl}/organization/${organizationId}/validation`,
      {
        headers: {
          [DIGICERT_AUTH_HEADER]: apiKey,
          "Content-Type": "application/json"
        }
      }
    );

    return { isValidated: isDigiCertOrgValidatedForProduct(data.validations, productNameId) };
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to check DigiCert organization validation: ${extractDigiCertErrorMessage(error)}`
      });
    }
    throw error;
  }
};

type TDigiCertOrdersResponse = {
  orders?: {
    id: number;
    status?: string;
    certificate?: { common_name?: string; valid_till?: string };
    organization?: { name?: string };
  }[];
};

export type TDigiCertOrder = {
  orderId: number;
  commonName: string;
  organizationName: string;
  status: string;
  validTill?: string;
};

export const listDigiCertOrders = async (
  appConnection: TDigiCertConnection,
  organizationId: number,
  productNameId: string,
  status = "issued"
): Promise<TDigiCertOrder[]> => {
  const { apiKey } = appConnection.credentials;
  const baseUrl = getDigiCertApiBaseUrl(appConnection.credentials);

  try {
    const { data } = await request.get<TDigiCertOrdersResponse>(`${baseUrl}/order/certificate`, {
      headers: {
        [DIGICERT_AUTH_HEADER]: apiKey,
        "Content-Type": "application/json"
      },
      params: {
        "filters[product_name_id]": productNameId,
        "filters[organization_id]": organizationId,
        "filters[status]": status,
        limit: 1000
      }
    });

    return (data.orders ?? []).map((order) => ({
      orderId: order.id,
      commonName: order.certificate?.common_name ?? "",
      organizationName: order.organization?.name ?? "",
      status: order.status ?? "",
      validTill: order.certificate?.valid_till
    }));
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to list DigiCert orders: ${extractDigiCertErrorMessage(error)}`
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

export const listDigiCertProducts = async (appConnection: TDigiCertConnection): Promise<TDigiCertProduct[]> => {
  const { apiKey } = appConnection.credentials;
  const baseUrl = getDigiCertApiBaseUrl(appConnection.credentials);

  try {
    const { data } = await request.get<TDigiCertProductsResponse>(`${baseUrl}/product`, {
      headers: {
        [DIGICERT_AUTH_HEADER]: apiKey,
        "Content-Type": "application/json"
      }
    });

    return (data.products ?? []).map((product) => ({
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
