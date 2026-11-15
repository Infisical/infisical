import { useEffect, useRef } from "react";
import { Loader } from "@infisical/cipher/ui/loader";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  APP_CONNECTION_MAP,
  consumeCsrfToken,
  getIntegrationsListTab,
  GITHUB_CONNECTION_FORM_STORAGE_KEY,
  readConnectionFormData,
  V4_CONNECTION_REDIRECT_STORAGE_KEY
} from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import type {
  TAppConnection,
  TCreateAppConnectionDTO,
  TUpdateAppConnectionDTO
} from "@app/hooks/api/appConnections/types";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { stateWithoutAppSuffix } from "../../data/integrations/connection-redirect";
import { orgHref, v4Path } from "../../links";
import { useResolveV4Href } from "../../resolveV4Href";

const ROUTE = v4Path("/organizations/$orgId/app-connections/$appConnection/oauth/callback");

/** What main's connection forms store before they send the person to the provider. */
type StoredForm = {
  returnUrl: string;
  connectionId?: string;
  isUpdate?: boolean;
  projectId?: string;
  name: string;
  method?: string;
  description?: string | null;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  tenantId?: string;
  orgName?: string;
  credentials?: Record<string, unknown>;
};

type Callback = { code: string; installationId?: string };

type MainFlow = {
  storageKey: string;
  method: (form: StoredForm) => string;
  credentials: (form: StoredForm, callback: Callback) => Record<string, unknown>;
  /** Main sends the stored gateway with the request. */
  gateway?: boolean;
  /** Main only updates when the form marked itself as an update. */
  updateFlag?: boolean;
  /** A reason the stored form can't complete, checked before the request. */
  refuse?: (form: StoredForm, callback: Callback) => string | undefined;
};

const tenantCredentials = (form: StoredForm, { code }: Callback) => ({
  code,
  tenantId: form.tenantId
});

const gitHubInstance = (form: StoredForm) => ({
  ...(form.credentials?.instanceType ? { instanceType: form.credentials.instanceType } : {}),
  ...(form.credentials?.host ? { host: form.credentials.host } : {})
});

const MAIN_FLOWS: Partial<Record<AppConnection, MainFlow>> = {
  [AppConnection.GitHub]: {
    storageKey: GITHUB_CONNECTION_FORM_STORAGE_KEY,
    method: (form) =>
      form.method === GitHubConnectionMethod.App
        ? GitHubConnectionMethod.App
        : GitHubConnectionMethod.OAuth,
    gateway: true,
    refuse: (form, { installationId }) =>
      form.method === GitHubConnectionMethod.App && !installationId
        ? "The GitHub App was not installed. If you requested it on an organization, an owner may need to approve the installation first. Complete the installation and try again."
        : undefined,
    credentials: (form, { code, installationId }) =>
      form.method === GitHubConnectionMethod.App
        ? {
            code,
            installationId,
            ...(form.credentials?.gitHubAppId !== undefined && {
              gitHubAppId: form.credentials.gitHubAppId
            }),
            ...gitHubInstance(form)
          }
        : { code, ...gitHubInstance(form) }
  },
  [AppConnection.GitHubRadar]: {
    storageKey: "githubRadarConnectionFormData",
    method: () => GitHubConnectionMethod.App,
    credentials: (_form, { code, installationId }) => ({ code, installationId })
  },
  [AppConnection.GitLab]: {
    storageKey: "gitlabConnectionFormData",
    method: () => "oauth",
    updateFlag: true,
    credentials: (form, { code }) => ({ code, instanceUrl: form.credentials?.instanceUrl })
  },
  [AppConnection.AzureKeyVault]: {
    storageKey: "azureKeyVaultConnectionFormData",
    method: () => "oauth",
    gateway: true,
    credentials: tenantCredentials
  },
  [AppConnection.AzureAppConfiguration]: {
    storageKey: "azureAppConfigurationConnectionFormData",
    method: () => "oauth",
    credentials: tenantCredentials
  },
  [AppConnection.AzureClientSecrets]: {
    storageKey: "azureClientSecretsConnectionFormData",
    method: () => "oauth",
    credentials: tenantCredentials
  },
  [AppConnection.AzureDevOps]: {
    storageKey: "azureDevOpsConnectionFormData",
    method: () => "oauth",
    refuse: (form) =>
      form.tenantId ? undefined : "This Azure DevOps connection doesn't use OAuth.",
    credentials: (form, { code }) => ({ code, tenantId: form.tenantId, orgName: form.orgName })
  },
  [AppConnection.Heroku]: {
    storageKey: "herokuConnectionFormData",
    method: () => "oauth",
    credentials: (_form, { code }) => ({ code })
  },
  [AppConnection.Stripe]: {
    storageKey: "stripeConnectionFormData",
    method: () => "oauth",
    credentials: (_form, { code }) => ({ code })
  }
};

const isV4Flow = (state: string) => {
  const stored = readConnectionFormData<{ state?: string }>(V4_CONNECTION_REDIRECT_STORAGE_KEY);
  return Boolean(state) && stored.status === "ok" && stored.data.state === state;
};

/**
 * Main's OAuth callback. Providers return here because their redirect URIs are registered against
 * main's path: a flow v4 started moves on to v4's own callback, and one main started completes
 * here from the form main stored.
 */
export const AppConnectionOauthCallbackPage = () => {
  const { orgId, appConnection: param } = useParams({ from: ROUTE });
  const search = useSearch({ from: ROUTE });
  const integrations = useV4Adapter("integrations");
  const createConnection = integrations.useCreateConnection();
  const updateConnection = integrations.useUpdateConnection();
  const navigate = useNavigate();
  const resolve = useResolveV4Href();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const [, suffixApp] = search.state.split("<:>");
    const app = (suffixApp ?? param) as AppConnection;
    const state = stateWithoutAppSuffix(search.state);

    if (isV4Flow(state)) {
      navigate({
        to: v4Path("/organizations/$orgId/app-connections/$appConnection/callback"),
        params: { orgId, appConnection: app },
        search,
        replace: true
      });
      return;
    }

    const appName = APP_CONNECTION_MAP[app]?.name ?? "app";
    const go = (path: string, query?: Record<string, string>) => {
      const url = new URL(path, window.location.origin);
      Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
      return navigate({ href: resolve(`${url.pathname}${url.search}`), replace: true });
    };
    const home = () => go(orgHref(orgId, "/integrations"));
    const flow = MAIN_FLOWS[app];
    if (!flow) {
      home().then(() =>
        failed(`Could not connect ${appName}`, new Error("This app doesn't connect through OAuth."))
      );
      return;
    }

    const stored = readConnectionFormData<StoredForm>(flow.storageKey);
    if (stored.status !== "ok") {
      home().then(() =>
        failed(
          `Could not connect ${appName}`,
          new Error(
            stored.status === "missing"
              ? "This connection session expired or was already completed. Start the connection again."
              : "This connection session is invalid. Start the connection again."
          )
        )
      );
      return;
    }
    if (!consumeCsrfToken(state)) {
      home().then(() =>
        failed(
          `Could not connect ${appName}`,
          new Error("This connection session is invalid or expired. Start the connection again.")
        )
      );
      return;
    }
    localStorage.removeItem(flow.storageKey);

    const form = stored.data;
    const callback: Callback = { code: search.code, installationId: search.installation_id };
    const back = () => go(form.returnUrl);
    const refusal = flow.refuse?.(form, callback);
    if (refusal) {
      back().then(() => failed(`Could not connect ${appName}`, new Error(refusal)));
      return;
    }

    const credentials = flow.credentials(form, callback) as TAppConnection["credentials"];
    const gateway = flow.gateway
      ? { gatewayId: form.gatewayId ?? null, gatewayPoolId: form.gatewayPoolId ?? null }
      : {};
    const isUpdate = Boolean(form.connectionId && (!flow.updateFlag || form.isUpdate));
    const request = isUpdate
      ? updateConnection.mutateAsync({
          app,
          connectionId: form.connectionId as string,
          credentials,
          ...gateway
        } as TUpdateAppConnectionDTO)
      : createConnection.mutateAsync({
          app,
          name: form.name,
          description: form.description,
          method: flow.method(form),
          projectId: form.projectId,
          credentials,
          ...gateway
        } as TCreateAppConnectionDTO);

    request
      .then((connection) => {
        const query: Record<string, string> = form.returnUrl.includes("app-connections")
          ? {}
          : { connectionId: connection.id, connectionName: connection.name };
        if (form.returnUrl.includes("integrations")) query.selectedTab = getIntegrationsListTab();
        if (
          form.returnUrl.includes("/cert-manager/applications/") &&
          localStorage.getItem("pkiSyncFormData")
        )
          query.selectedTab = "syncs";
        return go(form.returnUrl, query).then(() =>
          saved(`${appName} connection ${isUpdate ? "updated" : "added"}`)
        );
      })
      .catch((error: unknown) =>
        back().then(() =>
          failed(`Couldn't ${isUpdate ? "update" : "create"} this ${appName} connection`, error)
        )
      );
  }, [createConnection, navigate, orgId, param, resolve, search, updateConnection]);

  return (
    <>
      <PageTitle title="Connecting app" />
      <Loader size="page" label="Connecting" />
    </>
  );
};
