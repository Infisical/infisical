import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeString } from "@app/lib/fn";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";

import { DynamicSecretIbmApiConnectSchema, TDynamicProviderFns, TIbmApiConnectLeaseData } from "./models";

export type TIbmApiConnectBaseCredentials = {
  clientId: string;
  clientSecret: string;
  instanceUrl: string;
  apiKey: string;
};

type TIbmApiConnectProviderInputs = TIbmApiConnectBaseCredentials & {
  orgId: string;
  catalogId: string;
  consumerOrgId: string;
  appId: string;
};

export type TApiConnectResource = {
  name: string;
  title: string;
  id: string;
};

export type TApiConnectApp = TApiConnectResource & {
  consumerOrgId: string;
};

type TIbmApiConnectApplicationCredential = {
  id: string;
  clientId: string;
  clientSecret: string;
};

const $getSanitizationTokens = (credentials: TIbmApiConnectBaseCredentials, accessToken?: string): string[] => {
  const tokens = [credentials.apiKey, credentials.clientSecret, credentials.clientId];
  if (accessToken) tokens.push(accessToken);
  return tokens;
};

const $getAccessToken = async (credentials: TIbmApiConnectBaseCredentials): Promise<string> => {
  try {
    await blockLocalAndPrivateIpAddresses(credentials.instanceUrl);
    const response = await request.post<{ access_token: string }>(
      `${credentials.instanceUrl}/api/token`,
      {
        api_key: credentials.apiKey,
        grant_type: "api_key",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret
      },
      {
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return response.data.access_token;
  } catch (err) {
    const sanitizedErrorMessage = sanitizeString({
      unsanitizedString: (err as Error)?.message,
      tokens: $getSanitizationTokens(credentials)
    });
    throw new BadRequestError({
      message: `Failed to authenticate with IBM API Connect: ${sanitizedErrorMessage}`
    });
  }
};

const $fetchOrganizations = async (credentials: TIbmApiConnectBaseCredentials): Promise<TApiConnectResource[]> => {
  const accessToken = await $getAccessToken(credentials);

  try {
    const url = `${credentials.instanceUrl}/api/orgs`;
    await blockLocalAndPrivateIpAddresses(url);
    const response = await request.get<{
      results: TApiConnectResource[];
    }>(url, {
      params: { limit: 100 },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    return response.data.results.map((org) => ({
      name: org.name,
      title: org.title,
      id: org.id
    }));
  } catch (err) {
    const sanitizedErrorMessage = sanitizeString({
      unsanitizedString: (err as Error)?.message,
      tokens: $getSanitizationTokens(credentials, accessToken)
    });
    throw new BadRequestError({
      message: `Failed to fetch IBM API Connect organizations: ${sanitizedErrorMessage}`
    });
  }
};

const $fetchOrganizationCatalogs = async (
  credentials: TIbmApiConnectBaseCredentials,
  orgId: string
): Promise<TApiConnectResource[]> => {
  const accessToken = await $getAccessToken(credentials);

  try {
    const url = `${credentials.instanceUrl}/api/orgs/${orgId}/catalogs`;
    await blockLocalAndPrivateIpAddresses(url);
    const response = await request.get<{
      results: TApiConnectResource[];
    }>(url, {
      params: { limit: 100 },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    return response.data.results.map((catalog) => ({
      name: catalog.name,
      title: catalog.title,
      id: catalog.id
    }));
  } catch (err) {
    const sanitizedErrorMessage = sanitizeString({
      unsanitizedString: (err as Error)?.message,
      tokens: $getSanitizationTokens(credentials, accessToken)
    });
    throw new BadRequestError({
      message: `Failed to fetch IBM API Connect catalogs: ${sanitizedErrorMessage}`
    });
  }
};

const $fetchOrganizationApps = async (
  credentials: TIbmApiConnectBaseCredentials,
  orgId: string,
  catalogId: string
): Promise<TApiConnectApp[]> => {
  const accessToken = await $getAccessToken(credentials);

  try {
    const url = `${credentials.instanceUrl}/api/catalogs/${orgId}/${catalogId}/apps`;
    await blockLocalAndPrivateIpAddresses(url);
    const response = await request.get<{
      results: (TApiConnectResource & { consumer_org_url: string })[];
    }>(url, {
      params: { limit: 100 },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });

    return response.data.results.map((app) => {
      // consumer_org_url is composed of:
      // https://endpoint/api/consumer-orgs/{orgId}/{catalog}/{consumer_org}
      const consumerOrgId = app.consumer_org_url.split("/").filter(Boolean).pop() ?? "";
      return {
        name: app.name,
        title: app.title,
        id: app.id,
        consumerOrgId
      };
    });
  } catch (err) {
    const sanitizedErrorMessage = sanitizeString({
      unsanitizedString: (err as Error)?.message,
      tokens: $getSanitizationTokens(credentials, accessToken)
    });
    throw new BadRequestError({
      message: `Failed to fetch IBM API Connect apps: ${sanitizedErrorMessage}`
    });
  }
};

const $createApplicationCredential = async (
  accessToken: string,
  credentials: TIbmApiConnectProviderInputs
): Promise<TIbmApiConnectApplicationCredential> => {
  const { instanceUrl, orgId, catalogId, consumerOrgId, appId } = credentials;
  const url = `${instanceUrl}/api/apps/${orgId}/${catalogId}/${consumerOrgId}/${appId}/credentials`;

  try {
    await blockLocalAndPrivateIpAddresses(url);
    const response = await request.post<{
      id: string;
      client_id: string;
      client_secret: string;
    }>(
      url,
      { title: `infisical-${Date.now()}` },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json"
        }
      }
    );

    return {
      id: response.data.id,
      clientId: response.data.client_id,
      clientSecret: response.data.client_secret
    };
  } catch (err) {
    const sanitizedErrorMessage = sanitizeString({
      unsanitizedString: (err as Error)?.message,
      tokens: $getSanitizationTokens(credentials, accessToken)
    });
    throw new BadRequestError({
      message: `Failed to create IBM API Connect credential: ${sanitizedErrorMessage}`
    });
  }
};

const $revokeApplicationCredential = async (
  accessToken: string,
  credentials: TIbmApiConnectProviderInputs,
  entityId: string
): Promise<void> => {
  const { instanceUrl, orgId, catalogId, consumerOrgId, appId } = credentials;
  const url = `${instanceUrl}/api/apps/${orgId}/${catalogId}/${consumerOrgId}/${appId}/credentials/${entityId}`;

  try {
    await blockLocalAndPrivateIpAddresses(url);
    await request.delete(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
  } catch (err) {
    const sanitizedErrorMessage = sanitizeString({
      unsanitizedString: (err as Error)?.message,
      tokens: $getSanitizationTokens(credentials, accessToken)
    });
    throw new BadRequestError({
      message: `Failed to revoke IBM API Connect credential: ${sanitizedErrorMessage}`
    });
  }
};

export const IbmApiConnectProvider = (): TDynamicProviderFns<TIbmApiConnectLeaseData> & {
  fetchOrganizations: (inputs: TIbmApiConnectBaseCredentials) => Promise<TApiConnectResource[]>;
  fetchOrganizationCatalogs: (inputs: TIbmApiConnectBaseCredentials, orgId: string) => Promise<TApiConnectResource[]>;
  fetchOrganizationApps: (
    inputs: TIbmApiConnectBaseCredentials,
    orgId: string,
    catalogId: string
  ) => Promise<TApiConnectApp[]>;
} => {
  const validateProviderInputs = async (inputs: unknown) => {
    const providerInputs = await DynamicSecretIbmApiConnectSchema.parseAsync(inputs);
    await blockLocalAndPrivateIpAddresses(providerInputs.instanceUrl);
    return providerInputs;
  };

  const validateConnection = async (inputs: unknown) => {
    const providerInputs = await validateProviderInputs(inputs);
    await $getAccessToken(providerInputs);
    return true;
  };

  const create = async (data: { inputs: unknown }) => {
    const providerInputs = await validateProviderInputs(data.inputs);
    const accessToken = await $getAccessToken(providerInputs);
    const credential = await $createApplicationCredential(accessToken, providerInputs);

    return {
      entityId: credential.id,
      data: {
        CLIENT_ID: credential.clientId,
        CLIENT_SECRET: credential.clientSecret
      }
    };
  };

  const revoke = async (inputs: unknown, entityId: string) => {
    const providerInputs = await validateProviderInputs(inputs);
    const accessToken = await $getAccessToken(providerInputs);
    await $revokeApplicationCredential(accessToken, providerInputs, entityId);
    return { entityId };
  };

  const renew = async (_inputs: unknown, entityId: string) => {
    // IBM API Connect application credentials don't support renewal — they remain valid until revoked.
    return { entityId };
  };

  const fetchOrganizations = async (inputs: TIbmApiConnectBaseCredentials) => {
    await blockLocalAndPrivateIpAddresses(inputs.instanceUrl);
    return $fetchOrganizations(inputs);
  };

  const fetchOrganizationCatalogs = async (inputs: TIbmApiConnectBaseCredentials, orgId: string) => {
    await blockLocalAndPrivateIpAddresses(inputs.instanceUrl);
    return $fetchOrganizationCatalogs(inputs, orgId);
  };

  const fetchOrganizationApps = async (inputs: TIbmApiConnectBaseCredentials, orgId: string, catalogId: string) => {
    await blockLocalAndPrivateIpAddresses(inputs.instanceUrl);
    return $fetchOrganizationApps(inputs, orgId, catalogId);
  };

  return {
    validateProviderInputs,
    validateConnection,
    create,
    revoke,
    renew,
    fetchOrganizations,
    fetchOrganizationCatalogs,
    fetchOrganizationApps
  };
};
