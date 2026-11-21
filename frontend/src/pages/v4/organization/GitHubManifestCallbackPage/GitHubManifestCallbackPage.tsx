import { useEffect, useRef } from "react";
import { Loader } from "@infisical/cipher/ui/loader";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  consumeCsrfToken,
  GITHUB_CONNECTION_FORM_STORAGE_KEY,
  readConnectionFormData
} from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { failed, saved } from "../../access/toast";
import { orgHref, v4Path } from "../../links";
import { useResolveV4Href } from "../../resolveV4Href";

const ROUTE = v4Path("/organizations/$orgId/app-connections/github/manifest/callback");

type StoredGitHubForm = {
  credentials?: Record<string, unknown>;
  resumeWithGitHubAppId?: string;
  returnUrl?: string;
};

/**
 * GitHub returns here once it has created the GitHub App from Infisical's manifest. The app exists
 * at this point, so this only marks the stored connection form to resume with it selected.
 */
export const GitHubManifestCallbackPage = () => {
  const { orgId } = useParams({ from: ROUTE });
  const { gitHubAppId, slug, installState } = useSearch({ from: ROUTE });
  const navigate = useNavigate();
  const resolve = useResolveV4Href();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const stored = readConnectionFormData<StoredGitHubForm>(GITHUB_CONNECTION_FORM_STORAGE_KEY);
    let form: StoredGitHubForm | null = null;
    if (stored.status === "ok") form = stored.data;
    else if (stored.status === "missing") form = {};

    const back = (reopen: boolean) => {
      const url = new URL(
        form?.returnUrl ?? orgHref(orgId, "/app-connections"),
        window.location.origin
      );
      if (reopen) url.searchParams.set("addConnectionApp", AppConnection.GitHub);
      if (url.pathname.includes("integrations"))
        url.searchParams.set("selectedTab", IntegrationsListPageTabs.AppConnections);
      return navigate({ href: resolve(`${url.pathname}${url.search}`), replace: true });
    };

    if (!gitHubAppId || !slug || !installState) {
      back(false).then(() =>
        failed("Couldn't create the GitHub App", new Error("GitHub sent an incomplete response."))
      );
      return;
    }
    if (!consumeCsrfToken(installState)) {
      back(false).then(() =>
        failed(
          "Couldn't create the GitHub App",
          new Error("The response did not match the request you started. Start again.")
        )
      );
      return;
    }
    if (form) {
      localStorage.setItem(
        GITHUB_CONNECTION_FORM_STORAGE_KEY,
        JSON.stringify({
          ...form,
          credentials: { ...form.credentials, gitHubAppId },
          resumeWithGitHubAppId: gitHubAppId
        })
      );
    }
    back(true).then(() => saved("GitHub App created. Select it to finish the connection."));
  }, [gitHubAppId, installState, navigate, orgId, resolve, slug]);

  return (
    <>
      <PageTitle title="Creating GitHub App" />
      <Loader size="page" label="Creating your GitHub App" />
    </>
  );
};
