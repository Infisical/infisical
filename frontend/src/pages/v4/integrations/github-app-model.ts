import { type RefObject, useEffect, useState } from "react";

import {
  CSRF_TOKEN_STORAGE_KEY,
  generateCsrfToken,
  GITHUB_CONNECTION_FORM_STORAGE_KEY,
  readConnectionFormData
} from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GitHubConnectionMethod } from "@app/hooks/api/appConnections/types/github-connection";
import type { AppConnectionFormHandle } from "@app/pages/v4/components/app-connection-form";

import { failed } from "../access/toast";
import { useV4Adapter } from "../data/adapters";

/** Main's stored GitHub connection form, which the manifest callback marks to resume. */
type StoredGitHubForm = {
  method?: string;
  name?: string;
  description?: string | null;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  credentials?: { instanceType?: "cloud" | "server"; host?: string };
  resumeWithGitHubAppId?: string;
};

const readResumedGitHubForm = () => {
  const stored = readConnectionFormData<StoredGitHubForm>(GITHUB_CONNECTION_FORM_STORAGE_KEY);
  return stored.status === "ok" && stored.data.resumeWithGitHubAppId ? stored.data : undefined;
};

const resumedGitHubValues = (form: StoredGitHubForm) => ({
  app: AppConnection.GitHub,
  name: form.name ?? "",
  description: form.description ?? "",
  method: form.method ?? GitHubConnectionMethod.App,
  credentials: {
    instanceType: form.credentials?.instanceType ?? "cloud",
    host: form.credentials?.host ?? "",
    gitHubAppId: form.resumeWithGitHubAppId
  }
});

type Gateway = { gatewayId: string | null; gatewayPoolId: string | null };

/**
 * The GitHub connection form to resume when the person comes back from creating a GitHub App, with
 * the new app selected. Reads main's stored form once and clears it so a later visit starts fresh.
 */
export const useResumedGitHubForm = (app?: AppConnection) => {
  const [resumed] = useState(() => {
    const form = app === AppConnection.GitHub ? readResumedGitHubForm() : undefined;
    if (!form) return undefined;
    const gateway: Gateway = {
      gatewayId: form.gatewayId ?? null,
      gatewayPoolId: form.gatewayPoolId ?? null
    };
    return { values: resumedGitHubValues(form), gateway };
  });
  useEffect(() => {
    if (resumed) localStorage.removeItem(GITHUB_CONNECTION_FORM_STORAGE_KEY);
  }, [resumed]);
  return resumed;
};

const postManifest = (actionUrl: string, state: string, manifest: Record<string, unknown>) => {
  const form = document.createElement("form");
  form.method = "post";
  form.action = `${actionUrl}?state=${encodeURIComponent(state)}`;
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "manifest";
  input.value = JSON.stringify(manifest);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
};

/**
 * Main's Create new GitHub App: stores the in-progress connection form in main's format, then posts
 * Infisical's manifest to GitHub. GitHub returns through the manifest callback, which marks the
 * stored form to resume with the new app.
 */
export const useGitHubAppCreation = ({
  formHandle,
  gateway,
  projectId,
  returnTo
}: {
  formHandle: RefObject<AppConnectionFormHandle | null>;
  gateway?: Gateway;
  projectId?: string;
  returnTo: string;
}) => {
  const initiate = useV4Adapter("appConnections").useInitiateGitHubAppManifest();
  return async ({ name, githubOrg }: { name: string; githubOrg: string }) => {
    const values = formHandle.current?.getValues() ?? {};
    const credentials = (values.credentials ?? {}) as {
      instanceType?: "cloud" | "server";
      host?: string;
    };
    const instanceType = credentials.instanceType ?? "cloud";
    const host = instanceType === "server" ? credentials.host || undefined : undefined;
    const installState = generateCsrfToken();
    localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, installState);
    localStorage.setItem(
      GITHUB_CONNECTION_FORM_STORAGE_KEY,
      JSON.stringify({
        app: AppConnection.GitHub,
        method: values.method,
        name: values.name,
        description: values.description || null,
        ...gateway,
        credentials: { instanceType, ...(host && { host }) },
        projectId,
        returnUrl: returnTo
      })
    );
    try {
      const manifest = await initiate.mutateAsync({
        name,
        instanceType,
        githubOrg: githubOrg || undefined,
        githubHost: host,
        installState,
        projectId,
        gatewayId: gateway?.gatewayId || undefined,
        gatewayPoolId: gateway?.gatewayPoolId || undefined
      });
      postManifest(manifest.githubActionUrl, manifest.state, manifest.manifest);
    } catch (error) {
      localStorage.removeItem(GITHUB_CONNECTION_FORM_STORAGE_KEY);
      localStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
      failed("Couldn't start creating the GitHub App", error);
    }
  };
};
