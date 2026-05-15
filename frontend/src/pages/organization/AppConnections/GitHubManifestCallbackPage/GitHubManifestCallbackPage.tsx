import { useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { apiRequest } from "@app/config/request";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";

const GITHUB_MANIFEST_CSRF_KEY = "githubManifestCSRFToken";
const GITHUB_MANIFEST_FORM_KEY = "githubManifestFormData";
const GITHUB_CONNECTION_FORM_KEY = "githubConnectionFormData";

type ManifestFormStorage = {
  connectionFormDataKey: string;
  instanceType: "cloud" | "server";
  host: string;
  name: string;
};

type ExchangeResponse = {
  gitHubApp: {
    id: string;
    orgId: string;
    name: string;
    appId: string;
    slug: string;
    createdAt: string;
    updatedAt: string;
  };
};

export const GitHubManifestCallbackPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const search = useSearch({
    from: ROUTE_PATHS.Organization.AppConnections.GitHubManifestCallbackPage.id
  });
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!currentOrg || hasRunRef.current) return;
    hasRunRef.current = true;

    const { code, state } = search;

    const fallback = () =>
      navigate({
        to: "/organizations/$orgId/app-connections",
        params: { orgId: currentOrg.id }
      });

    if (!code || !state) {
      fallback();
      return;
    }

    const storedState = localStorage.getItem(GITHUB_MANIFEST_CSRF_KEY);
    const storedFormDataRaw = localStorage.getItem(GITHUB_MANIFEST_FORM_KEY);

    localStorage.removeItem(GITHUB_MANIFEST_CSRF_KEY);
    localStorage.removeItem(GITHUB_MANIFEST_FORM_KEY);

    if (!storedState || storedState !== state || !storedFormDataRaw) {
      createNotification({ type: "error", text: "Invalid GitHub manifest callback state." });
      fallback();
      return;
    }

    let manifestData: ManifestFormStorage;
    try {
      manifestData = JSON.parse(storedFormDataRaw) as ManifestFormStorage;
    } catch {
      createNotification({ type: "error", text: "Corrupt GitHub manifest callback state." });
      fallback();
      return;
    }

    const installToken = localStorage.getItem("latestCSRFToken");
    const connectionFormRaw = localStorage.getItem(
      manifestData.connectionFormDataKey || GITHUB_CONNECTION_FORM_KEY
    );

    if (!installToken || !connectionFormRaw) {
      createNotification({ type: "error", text: "Missing GitHub connection form state." });
      fallback();
      return;
    }

    (async () => {
      try {
        const { data } = await apiRequest.post<ExchangeResponse>(
          "/api/v1/github-apps/manifest/exchange",
          { name: manifestData.name, code }
        );

        const connectionForm = JSON.parse(connectionFormRaw) as {
          credentials?: Record<string, unknown>;
        };
        connectionForm.credentials = {
          ...(connectionForm.credentials ?? {}),
          gitHubAppId: data.gitHubApp.id
        };
        localStorage.setItem(
          manifestData.connectionFormDataKey || GITHUB_CONNECTION_FORM_KEY,
          JSON.stringify(connectionForm)
        );

        const githubHost =
          manifestData.host && manifestData.host.length > 0
            ? `https://${manifestData.host}`
            : "https://github.com";

        const appPathSegment = manifestData.instanceType === "server" ? "github-apps" : "apps";

        window.location.assign(
          `${githubHost}/${appPathSegment}/${data.gitHubApp.slug}/installations/new?state=${installToken}`
        );
      } catch (err) {
        const message =
          (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
            ?.message ||
          (err as { message?: string })?.message ||
          "Failed to register GitHub App. Please try again.";
        createNotification({ type: "error", text: message });
        fallback();
      }
    })();
  }, [currentOrg?.id]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Creating your GitHub App, please wait..." />
    </div>
  );
};
