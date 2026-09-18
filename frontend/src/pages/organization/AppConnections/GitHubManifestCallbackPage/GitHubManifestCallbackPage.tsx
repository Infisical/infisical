import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  consumeCsrfToken,
  getConnectionFlowReturnNavigateOptions,
  GITHUB_CONNECTION_FORM_STORAGE_KEY,
  readConnectionFormData
} from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

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

    type TStoredGitHubConnectionForm = {
      credentials?: Record<string, unknown>;
      resumeWithGitHubAppId?: string;
      returnUrl?: string;
    };

    const storedForm = readConnectionFormData<TStoredGitHubConnectionForm>(
      GITHUB_CONNECTION_FORM_STORAGE_KEY
    );

    let connectionForm: TStoredGitHubConnectionForm | null;
    if (storedForm.status === "ok") {
      connectionForm = storedForm.data;
    } else if (storedForm.status === "missing") {
      connectionForm = {};
    } else {
      connectionForm = null;
    }

    const returnUrl = connectionForm?.returnUrl;

    const navigateBack = (reopenForm: boolean) => {
      if (returnUrl) {
        return navigate(
          getConnectionFlowReturnNavigateOptions({
            returnUrl,
            reopenFormApp: reopenForm ? AppConnection.GitHub : undefined
          })
        );
      }
      return navigate({
        to: "/organizations/$orgId/app-connections",
        params: { orgId },
        search: reopenForm ? { addConnectionApp: AppConnection.GitHub } : undefined
      });
    };

    if (!gitHubAppId || !slug || !installState) {
      createNotification({ type: "error", text: "Invalid GitHub manifest callback parameters." });
      navigateBack(false);
      return;
    }

    // Confirm this callback corresponds to a flow this browser initiated. The install state is
    // round-tripped through the signed manifest token and echoed back here; it must match the CSRF
    // token stored when the user kicked off app creation. This blocks a crafted callback URL from
    // pre-seeding the connection form with an attacker-chosen app id.
    if (!consumeCsrfToken(installState)) {
      createNotification({ type: "error", text: "Invalid GitHub manifest callback state." });
      navigateBack(false);
      return;
    }

    // The GitHub App is already created at this point. Mark the in-progress connection form so it
    // resumes with the new app selected, then send the user back to it to finish the connection.
    if (connectionForm) {
      connectionForm.credentials = {
        ...(connectionForm.credentials ?? {}),
        gitHubAppId
      };
      connectionForm.resumeWithGitHubAppId = gitHubAppId;
      localStorage.setItem(GITHUB_CONNECTION_FORM_STORAGE_KEY, JSON.stringify(connectionForm));
    }

    createNotification({
      type: "success",
      text: "GitHub App created. Select it and finish setting up your connection."
    });
    navigateBack(true);
  }, []);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Creating your GitHub App, please wait..." />
    </div>
  );
};
