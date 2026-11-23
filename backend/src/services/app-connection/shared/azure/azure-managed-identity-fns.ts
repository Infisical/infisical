import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { getAppConnectionOidcSubject, getOidcIssuerUrl } from "@app/services/oidc-issuer/oidc-issuer-fns";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";
import { TSignOidcIssuerTokenDTO } from "@app/services/oidc-issuer/oidc-issuer-types";

// Entra only accepts federated tokens with this audience
const AZURE_FEDERATED_TOKEN_AUDIENCE = "api://AzureADTokenExchange";

// Not stored with the credentials, so the issuer follows SITE_URL if it changes. Without SITE_URL there is no issuer,
// but reading the connection must still work.
export const getAzureConnectionFederatedCredential = ({ id, orgId }: { id: string; orgId: string }) => {
  const { SITE_URL } = getConfig();

  return {
    issuerUrl: SITE_URL ? getOidcIssuerUrl(SITE_URL, orgId) : null,
    subjectIdentifier: getAppConnectionOidcSubject(id),
    audience: AZURE_FEDERATED_TOKEN_AUDIENCE
  };
};

export const getAzureManagedIdentityAccessToken = async (
  {
    appConnection,
    tenantId,
    clientId,
    scope
  }: { appConnection: TSignOidcIssuerTokenDTO["appConnection"]; tenantId: string; clientId: string; scope: string },
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">
) => {
  const clientAssertion = await oidcIssuerService.signToken({
    appConnection,
    audience: AZURE_FEDERATED_TOKEN_AUDIENCE
  });

  const { data } = await request.post<{ access_token: string; expires_in: number }>(
    IntegrationUrls.AZURE_TOKEN_URL.replace("common", tenantId),
    new URLSearchParams({
      grant_type: "client_credentials",
      scope,
      client_id: clientId,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion
    })
  );

  return { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
};
