import axios from "axios";

import { BadRequestError, InternalServerError } from "@app/lib/errors";

export const AZURE_SCOPES = {
  arm: "https://management.azure.com/.default",
  graph: "https://graph.microsoft.com/.default",
  keyvault: "https://vault.azure.net/.default",
  storage: "https://storage.azure.com/.default"
} as const;

type TAzureAudience = keyof typeof AZURE_SCOPES;
type TServicePrincipal = { tenantId: string; clientId: string; clientSecret: string };
type TAzureTokenResponse = { access_token?: string };
type TAzureTokenErrorResponse = { error?: string; error_description?: string };

export const getAzureAccessToken = async ({
  tenantId,
  clientId,
  clientSecret,
  scope
}: TServicePrincipal & { scope: string }): Promise<string> => {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope
  });

  let response;
  try {
    response = await axios.post<TAzureTokenResponse>(
      `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
      body.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000, maxRedirects: 0 }
    );
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const data = err.response.data as TAzureTokenErrorResponse;
      throw new BadRequestError({
        message: `Azure rejected the service principal credentials: ${data.error_description || data.error || "unknown error"}`
      });
    }
    throw new InternalServerError({ message: "Failed to reach the Azure token endpoint" });
  }

  if (!response.data.access_token) {
    throw new InternalServerError({ message: "Azure token endpoint did not return an access token" });
  }

  return response.data.access_token;
};

export const getAzureAccessTokens = async (sp: TServicePrincipal): Promise<Record<string, string>> => {
  const arm = await getAzureAccessToken({ ...sp, scope: AZURE_SCOPES.arm });

  const otherAudiences = (Object.keys(AZURE_SCOPES) as TAzureAudience[]).filter((aud) => aud !== "arm");
  const results = await Promise.allSettled(
    otherAudiences.map(async (aud) => [aud, await getAzureAccessToken({ ...sp, scope: AZURE_SCOPES[aud] })] as const)
  );

  return {
    arm,
    ...Object.fromEntries(results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])))
  };
};
