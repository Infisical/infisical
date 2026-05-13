import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { useExchangeGitHubManifestCode } from "@app/hooks/api/gitHubApps";

const GITHUB_MANIFEST_STATE_KEY = "githubManifestState";
const GITHUB_MANIFEST_FORM_KEY = "githubManifestFormData";

export const GitHubAppCallbackPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const search = useSearch({ from: ROUTE_PATHS.Organization.GitHubAppCallbackPage.id });
  const { mutateAsync: exchangeManifestCode } = useExchangeGitHubManifestCode();

  useEffect(() => {
    if (!currentOrg) return;

    const { code, state } = search;

    const redirect = () =>
      navigate({
        to: ROUTE_PATHS.Organization.SettingsPage.path,
        params: { orgId: currentOrg.id },
        search: { selectedTab: "integrations" }
      });

    if (!code || !state) {
      redirect();
      return;
    }

    const storedState = localStorage.getItem(GITHUB_MANIFEST_STATE_KEY);
    const storedFormDataRaw = localStorage.getItem(GITHUB_MANIFEST_FORM_KEY);

    localStorage.removeItem(GITHUB_MANIFEST_STATE_KEY);
    localStorage.removeItem(GITHUB_MANIFEST_FORM_KEY);

    if (!storedState || storedState !== state || !storedFormDataRaw) {
      redirect();
      return;
    }

    let parsedFormData: { name?: string; orgId?: string } = {};
    try {
      parsedFormData = JSON.parse(storedFormDataRaw) as { name?: string; orgId?: string };
    } catch {
      redirect();
      return;
    }

    if (!parsedFormData.name || parsedFormData.orgId !== currentOrg.id) {
      redirect();
      return;
    }

    exchangeManifestCode({ name: parsedFormData.name, code })
      .then(() => {
        createNotification({
          text: `GitHub App "${parsedFormData.name}" registered successfully.`,
          type: "success"
        });
      })
      .catch((err: { response?: { data?: { message?: string } }; message?: string }) => {
        createNotification({
          text:
            err?.response?.data?.message ||
            err?.message ||
            "Failed to register GitHub App. Please try again.",
          type: "error"
        });
      })
      .finally(() => {
        redirect();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Registering GitHub App, please wait..." />
    </div>
  );
};
