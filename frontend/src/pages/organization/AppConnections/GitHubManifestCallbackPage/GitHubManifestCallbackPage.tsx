import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

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

    const { gitHubAppId, slug, installState } = search;

    const returnToForm = () =>
      navigate({
        to: "/organizations/$orgId/app-connections",
        params: { orgId },
        search: { addConnectionApp: AppConnection.GitHub }
      });

    if (!gitHubAppId || !slug || !installState) {
      createNotification({ type: "error", text: "Invalid GitHub manifest callback parameters." });
      navigate({ to: "/organizations/$orgId/app-connections", params: { orgId } });
      return;
    }

    // The GitHub App is already created at this point. Mark the in-progress connection form so it
    // resumes with the new app selected, then send the user back to it to finish the connection.
    try {
      const connectionFormRaw = localStorage.getItem(GITHUB_CONNECTION_FORM_KEY);
      const connectionForm = connectionFormRaw
        ? (JSON.parse(connectionFormRaw) as {
            credentials?: Record<string, unknown>;
            resumeWithGitHubAppId?: string;
          })
        : {};
      connectionForm.credentials = {
        ...(connectionForm.credentials ?? {}),
        gitHubAppId
      };
      connectionForm.resumeWithGitHubAppId = gitHubAppId;
      localStorage.setItem(GITHUB_CONNECTION_FORM_KEY, JSON.stringify(connectionForm));
    } catch {
      // A corrupt form just means we can't restore the other fields; the app was still created.
      localStorage.removeItem(GITHUB_CONNECTION_FORM_KEY);
    }

    createNotification({
      type: "success",
      text: "GitHub App created. Select it and finish setting up your connection."
    });
    returnToForm();
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Creating your GitHub App, please wait..." />
    </div>
  );
};
