import { useCallback, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TDetailsDynamicSecretDTO,
  TDynamicSecret,
  TGetDynamicSecretsByEnvsDTO,
  TGetEntraIdUsersDTO,
  TGetIbmApiConnectOrgAppsDTO,
  TGetIbmApiConnectOrgCatalogsDTO,
  TGetIbmApiConnectOrgsDTO,
  TListDynamicSecretDTO
} from "./types";

export const dynamicSecretKeys = {
  list: ({
    projectSlug,
    environmentSlug,
    path
  }: Pick<TListDynamicSecretDTO, "path" | "environmentSlug" | "projectSlug">) =>
    [{ projectSlug, environmentSlug, path }, "dynamic-secrets"] as const,
  details: ({ path, environmentSlug, projectSlug, name }: TDetailsDynamicSecretDTO) =>
    [{ projectSlug, path, environmentSlug, name }, "dynamic-secret-details"] as const,
  sshCaPublicKey: (dynamicSecretId: string) =>
    [{ dynamicSecretId }, "dynamic-secret-ssh-ca-public-key"] as const,
  entraIdUsers: ({ projectSlug, tenantId, applicationId, clientSecret }: TGetEntraIdUsersDTO) =>
    [
      { projectSlug, tenantId, applicationId, clientSecret },
      "dynamic-secret-entra-id-users"
    ] as const,
  ibmApiConnectOrgs: ({
    projectSlug,
    instanceUrl,
    apiKey,
    clientId,
    clientSecret
  }: TGetIbmApiConnectOrgsDTO) =>
    [
      { projectSlug, instanceUrl, apiKey, clientId, clientSecret },
      "dynamic-secret-ibm-api-connect-orgs"
    ] as const,
  ibmApiConnectOrgCatalogs: ({
    projectSlug,
    instanceUrl,
    apiKey,
    clientId,
    clientSecret,
    orgId
  }: TGetIbmApiConnectOrgCatalogsDTO) =>
    [
      { projectSlug, instanceUrl, apiKey, clientId, clientSecret, orgId },
      "dynamic-secret-ibm-api-connect-org-catalogs"
    ] as const,
  ibmApiConnectOrgApps: ({
    projectSlug,
    instanceUrl,
    apiKey,
    clientId,
    clientSecret,
    orgId,
    catalogId
  }: TGetIbmApiConnectOrgAppsDTO) =>
    [
      { projectSlug, instanceUrl, apiKey, clientId, clientSecret, orgId, catalogId },
      "dynamic-secret-ibm-api-connect-org-apps"
    ] as const
};

export const useGetDynamicSecrets = ({
  projectSlug,
  environmentSlug,
  path
}: TListDynamicSecretDTO) => {
  return useQuery({
    queryKey: dynamicSecretKeys.list({ path, environmentSlug, projectSlug }),
    enabled: Boolean(projectSlug && environmentSlug && path),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ dynamicSecrets: TDynamicSecret[] }>(
        "/api/v1/dynamic-secrets",
        {
          params: {
            projectSlug,
            environmentSlug,
            path
          }
        }
      );

      return data.dynamicSecrets;
    }
  });
};

export const useGetDynamicSecretDetails = ({
  projectSlug,
  environmentSlug,
  path,
  name
}: TDetailsDynamicSecretDTO) => {
  return useQuery({
    queryKey: dynamicSecretKeys.details({ path, environmentSlug, projectSlug, name }),
    enabled: Boolean(projectSlug && environmentSlug && path && name),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        dynamicSecret: TDynamicSecret & { inputs: unknown };
      }>(`/api/v1/dynamic-secrets/${name}`, {
        params: {
          projectSlug,
          environmentSlug,
          path
        }
      });

      return data.dynamicSecret;
    }
  });
};

export const useGetDynamicSecretProviderData = ({
  tenantId,
  applicationId,
  clientSecret,
  projectSlug,
  enabled
}: TGetEntraIdUsersDTO & { enabled: boolean }) => {
  return useQuery({
    queryKey: dynamicSecretKeys.entraIdUsers({
      projectSlug,
      tenantId,
      applicationId,
      clientSecret
    }),
    queryFn: async () => {
      const { data } = await apiRequest.post<{ id: string; email: string; name: string }[]>(
        "/api/v1/dynamic-secrets/entra-id/users",
        {
          tenantId,
          applicationId,
          clientSecret,
          projectSlug
        }
      );
      return data;
    },
    enabled
  });
};

export const useGetIbmApiConnectOrgs = ({
  instanceUrl,
  apiKey,
  clientId,
  clientSecret,
  projectSlug,
  enabled
}: TGetIbmApiConnectOrgsDTO & { enabled: boolean }) => {
  return useQuery({
    queryKey: dynamicSecretKeys.ibmApiConnectOrgs({
      projectSlug,
      instanceUrl,
      apiKey,
      clientId,
      clientSecret
    }),
    queryFn: async () => {
      const { data } = await apiRequest.post<{ name: string; title: string; id: string }[]>(
        "/api/v1/dynamic-secrets/ibm-api-connect/orgs",
        { instanceUrl, apiKey, clientId, clientSecret, projectSlug }
      );
      return data;
    },
    enabled
  });
};

export const useGetIbmApiConnectOrgCatalogs = ({
  instanceUrl,
  apiKey,
  clientId,
  clientSecret,
  orgId,
  projectSlug,
  enabled
}: TGetIbmApiConnectOrgCatalogsDTO & { enabled: boolean }) => {
  return useQuery({
    queryKey: dynamicSecretKeys.ibmApiConnectOrgCatalogs({
      projectSlug,
      instanceUrl,
      apiKey,
      clientId,
      clientSecret,
      orgId
    }),
    queryFn: async () => {
      const { data } = await apiRequest.post<{ name: string; title: string; id: string }[]>(
        `/api/v1/dynamic-secrets/ibm-api-connect/orgs/${orgId}/catalogs`,
        { instanceUrl, apiKey, clientId, clientSecret, projectSlug }
      );
      return data;
    },
    enabled
  });
};

export const useGetIbmApiConnectOrgApps = ({
  instanceUrl,
  apiKey,
  clientId,
  clientSecret,
  orgId,
  catalogId,
  projectSlug,
  enabled
}: TGetIbmApiConnectOrgAppsDTO & { enabled: boolean }) => {
  return useQuery({
    queryKey: dynamicSecretKeys.ibmApiConnectOrgApps({
      projectSlug,
      instanceUrl,
      apiKey,
      clientId,
      clientSecret,
      orgId,
      catalogId
    }),
    queryFn: async () => {
      const { data } = await apiRequest.post<
        { name: string; title: string; id: string; consumerOrgId: string }[]
      >(`/api/v1/dynamic-secrets/ibm-api-connect/orgs/${orgId}/catalogs/${catalogId}/apps`, {
        instanceUrl,
        apiKey,
        clientId,
        clientSecret,
        projectSlug
      });
      return data;
    },
    enabled
  });
};

export const useGetDynamicSecretsOfAllEnv = ({
  path,
  projectSlug,
  environmentSlugs
}: TGetDynamicSecretsByEnvsDTO) => {
  const dynamicSecrets = useQueries({
    queries: environmentSlugs.map((environment) => ({
      queryKey: dynamicSecretKeys.list({ path, environmentSlug: environment, projectSlug }),
      enabled: Boolean(projectSlug && environment && path),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ dynamicSecrets: TDynamicSecret[] }>(
          "/api/v1/dynamic-secrets",
          {
            params: {
              projectSlug,
              environmentSlug: environment,
              path
            }
          }
        );

        return data.dynamicSecrets;
      }
    }))
  });

  const dynamicSecretNames = useMemo(() => {
    const names = new Set<string>();
    dynamicSecrets?.forEach(({ data }) => {
      data?.forEach(({ name }) => {
        names.add(name);
      });
    });
    return [...names];
  }, [(dynamicSecrets || []).map((dynamicSecret) => dynamicSecret.data)]);

  const isDynamicSecretPresentInEnv = useCallback(
    (name: string, env: string) => {
      const selectedEnvIndex = environmentSlugs.indexOf(env);
      if (selectedEnvIndex !== -1) {
        return Boolean(
          dynamicSecrets?.[selectedEnvIndex]?.data?.find(
            ({ name: dynamicSecretName }) => dynamicSecretName === name
          )
        );
      }
      return false;
    },
    [(dynamicSecrets || []).map((el) => el.data)]
  );

  return { dynamicSecrets, isDynamicSecretPresentInEnv, dynamicSecretNames };
};

export const useGetSshCaPublicKey = ({
  dynamicSecretId,
  enabled = true
}: {
  dynamicSecretId: string;
  enabled?: boolean;
}) => {
  return useQuery({
    queryKey: dynamicSecretKeys.sshCaPublicKey(dynamicSecretId),
    enabled: Boolean(dynamicSecretId) && enabled,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ caPublicKey: string }>(
        `/api/v1/dynamic-secrets/ssh-ca-public-key/${dynamicSecretId}`
      );
      return data.caPublicKey;
    }
  });
};
