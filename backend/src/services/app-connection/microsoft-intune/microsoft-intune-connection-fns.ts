import { AxiosError } from "axios";
import { randomUUID } from "crypto";

import { request } from "@app/lib/config/request";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { AppConnection } from "../app-connection-enums";
import { MicrosoftIntuneConnectionMethod } from "./microsoft-intune-connection-enums";
import {
  TIntuneScepValidationResponse,
  TMicrosoftEntraTokenResponse,
  TMicrosoftGraphServicePrincipalEndpointsResponse,
  TMicrosoftIntuneConnectionConfig,
  TMicrosoftIntuneConnectionCredentials
} from "./microsoft-intune-connection-types";

// Intune's well-known first-party app id; its service principal exposes the SCEP validation endpoint.
const INTUNE_WELL_KNOWN_APP_ID = "0000000a-0000-0000-c000-000000000000";
const SCEP_VALIDATION_SERVICE_NAME = "ScepRequestValidationFEService";
const INTUNE_API_VERSION = "2018-02-20";
// Intune returns this (case-insensitively) in the `code` field when a SCEP request passes validation.
const INTUNE_SUCCESS_CODE = "success";

export const MicrosoftEntraTokenResource = {
  Graph: "https://graph.microsoft.com/.default",
  Intune: "https://api.manage.microsoft.com/.default"
} as const;

// Sent to Intune on every call to attribute the request.
export const INTUNE_CALLER_INFO = "Infisical";

export const getMicrosoftIntuneConnectionListItem = () => {
  return {
    name: "Microsoft Intune" as const,
    app: AppConnection.MicrosoftIntune as const,
    methods: Object.values(MicrosoftIntuneConnectionMethod) as [MicrosoftIntuneConnectionMethod.ClientSecret]
  };
};

export const getMicrosoftEntraToken = async (
  credentials: Pick<TMicrosoftIntuneConnectionCredentials, "tenantId" | "clientId" | "clientSecret">,
  scope: string
) => {
  const { tenantId, clientId, clientSecret } = credentials;

  try {
    const { data } = await request.post<TMicrosoftEntraTokenResponse>(
      IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId || "common"),
      new URLSearchParams({
        grant_type: "client_credentials",
        scope,
        client_id: clientId,
        client_secret: clientSecret
      })
    );

    return data.access_token;
  } catch (err) {
    if (err instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to obtain Microsoft Entra access token: ${
          (err.response?.data as { error_description?: string })?.error_description || err.message
        }`
      });
    }
    throw new InternalServerError({ message: "Failed to obtain Microsoft Entra access token" });
  }
};

export const discoverScepValidationServiceUri = async (graphAccessToken: string) => {
  try {
    const { data } = await request.get<TMicrosoftGraphServicePrincipalEndpointsResponse>(
      `https://graph.microsoft.com/v1.0/servicePrincipals/appId=${INTUNE_WELL_KNOWN_APP_ID}/endpoints`,
      {
        headers: {
          Authorization: `Bearer ${graphAccessToken}`,
          Accept: "application/json"
        }
      }
    );

    const endpoint = data.value?.find((e) => e.providerName === SCEP_VALIDATION_SERVICE_NAME);
    if (!endpoint?.uri) {
      throw new BadRequestError({
        message:
          "Could not locate the Intune SCEP validation service. Ensure the Entra application has the Intune 'scep_challenge_provider' permission with admin consent granted."
      });
    }

    return endpoint.uri.replace(/\/+$/, "");
  } catch (err) {
    if (err instanceof BadRequestError) throw err;
    if (err instanceof AxiosError) {
      throw new BadRequestError({
        message: `Failed to discover the Intune SCEP validation service: ${
          (err.response?.data as { error?: { message?: string } })?.error?.message || err.message
        }`
      });
    }
    throw new InternalServerError({ message: "Failed to discover the Intune SCEP validation service" });
  }
};

const intuneScepActionHeaders = (intuneAccessToken: string) => ({
  Authorization: `Bearer ${intuneAccessToken}`,
  "Content-Type": "application/json",
  Accept: "application/json",
  "api-version": INTUNE_API_VERSION,
  "client-request-id": randomUUID()
});

export const intuneValidateScepRequest = async ({
  intuneAccessToken,
  serviceUri,
  transactionId,
  certificateRequest
}: {
  intuneAccessToken: string;
  serviceUri: string;
  transactionId: string;
  certificateRequest: string;
}): Promise<{ allowed: boolean; errorDescription?: string }> => {
  try {
    const { data } = await request.post<TIntuneScepValidationResponse>(
      `${serviceUri}/ScepActions/validateRequest`,
      {
        request: {
          transactionId,
          certificateRequest,
          callerInfo: INTUNE_CALLER_INFO
        }
      },
      { headers: intuneScepActionHeaders(intuneAccessToken) }
    );

    if (data?.code && data.code.toLowerCase() === INTUNE_SUCCESS_CODE) {
      return { allowed: true };
    }

    return { allowed: false, errorDescription: data?.errorDescription || data?.code || "Intune rejected the request" };
  } catch (err) {
    if (err instanceof AxiosError) {
      const body = err.response?.data as TIntuneScepValidationResponse | undefined;
      return {
        allowed: false,
        errorDescription: body?.errorDescription || body?.code || err.message
      };
    }
    return { allowed: false, errorDescription: "Failed to reach the Intune SCEP validation service" };
  }
};

export const intuneSendSuccessNotification = async ({
  intuneAccessToken,
  serviceUri,
  notification
}: {
  intuneAccessToken: string;
  serviceUri: string;
  notification: {
    transactionId: string;
    certificateRequest: string;
    certificateThumbprint: string;
    certificateSerialNumber: string;
    certificateExpirationDateUtc: string;
    issuingCertificateAuthority: string;
  };
}) => {
  await request.post(
    `${serviceUri}/ScepActions/successNotification`,
    { notification: { ...notification, callerInfo: INTUNE_CALLER_INFO } },
    { headers: intuneScepActionHeaders(intuneAccessToken) }
  );
};

export const intuneSendFailureNotification = async ({
  intuneAccessToken,
  serviceUri,
  notification
}: {
  intuneAccessToken: string;
  serviceUri: string;
  notification: {
    transactionId: string;
    certificateRequest: string;
    hResult: number;
    errorDescription: string;
  };
}) => {
  await request.post(
    `${serviceUri}/ScepActions/failureNotification`,
    { notification: { ...notification, callerInfo: INTUNE_CALLER_INFO } },
    { headers: intuneScepActionHeaders(intuneAccessToken) }
  );
};

export const validateMicrosoftIntuneConnectionCredentials = async (config: TMicrosoftIntuneConnectionConfig) => {
  const { credentials, method } = config;

  switch (method) {
    case MicrosoftIntuneConnectionMethod.ClientSecret: {
      const graphToken = await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Graph);
      await discoverScepValidationServiceUri(graphToken);
      await getMicrosoftEntraToken(credentials, MicrosoftEntraTokenResource.Intune);

      return {
        tenantId: credentials.tenantId,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret
      };
    }
    default:
      throw new InternalServerError({
        message: `Unhandled Microsoft Intune connection method: ${method as MicrosoftIntuneConnectionMethod}`
      });
  }
};
