import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";

const GITHUB_CONNECTION_FORM_KEY = "githubConnectionFormData";

export const GitHubManifestCallbackPage = () => {
  const navigate = useNavigate();
  const { orgId } = useParams({ strict: false }) as { orgId: string };
  const search = useSearch({
    from: ROUTE_PATHS.Organization.AppConnections.GitHubManifestCallbackPage.id
  });
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    const { gitHubAppId, slug, installState, instanceType, host } = search;

    const fallback = () =>
      navigate({
        to: "/organizations/$orgId/app-connections",
        params: { orgId }
      });

    if (!gitHubAppId || !slug || !installState) {
      createNotification({ type: "error", text: "Invalid GitHub manifest callback parameters." });
      fallback();
      return;
    }

    const connectionFormRaw = localStorage.getItem(GITHUB_CONNECTION_FORM_KEY);
    if (!connectionFormRaw) {
      createNotification({ type: "error", text: "Missing GitHub connection form state." });
      fallback();
      return;
    }

    try {
      const connectionForm = JSON.parse(connectionFormRaw) as {
        credentials?: Record<string, unknown>;
      };
      connectionForm.credentials = {
        ...(connectionForm.credentials ?? {}),
        gitHubAppId
      };
      localStorage.setItem(GITHUB_CONNECTION_FORM_KEY, JSON.stringify(connectionForm));
    } catch {
      createNotification({ type: "error", text: "Corrupt GitHub connection form state." });
      fallback();
      return;
    }

    const githubHost = host && host.length > 0 ? `https://${host}` : "https://github.com";
    const appPathSegment = instanceType === "server" ? "github-apps" : "apps";

    window.location.assign(`${githubHost}/${appPathSegment}/${slug}/installations/new?state=${installState}`);
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Creating your GitHub App, please wait..." />
    </div>
  );
};
