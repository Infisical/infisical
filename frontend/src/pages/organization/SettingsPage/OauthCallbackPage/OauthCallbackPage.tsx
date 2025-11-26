import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ContentLoader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization } from "@app/context";
import { useCreateMicrosoftTeamsIntegration } from "@app/hooks/api";

const stateSchema = z.object({
  redirectUri: z.string(),
  tenantId: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  csrfToken: z.string(),
  clientId: z.string()
});

export const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [isReady, setIsReady] = useState(false);

  const search = useSearch({
    from: ROUTE_PATHS.Organization.Settings.OauthCallbackPage.id
  });

  const createMicrosoftTeamsWorkflowIntegration = useCreateMicrosoftTeamsIntegration();

  const { state: rawState, code } = search;

  const state = stateSchema.parse(rawState);

  const clearState = () => {
    if (state.csrfToken !== localStorage.getItem("latestCSRFToken")) {
      throw new Error("Invalid CSRF token");
    }

    localStorage.removeItem("latestCSRFToken");
  };

  const handleMicrosoftTeams = useCallback(async () => {
    clearState();

    if (!code) {
      throw new Error("No code provided");
    }

    await createMicrosoftTeamsWorkflowIntegration.mutateAsync({
      orgId: currentOrg.id,
      tenantId: state.tenantId,
      code,
      slug: state.slug,
      description: state.description ?? "",
      redirectUri: state.redirectUri
    });

    navigate({
      to: ROUTE_PATHS.Organization.SettingsPage.path,
      params: { orgId: currentOrg.id }
    });
  }, []);

  // Ensure that the localstorage is ready for use, to avoid the form data being malformed
  useEffect(() => {
    if (!isReady) {
      setIsReady(!!localStorage.length);
    }
  }, [localStorage.length]);

  useEffect(() => {
    if (!isReady) return;

    (async () => {
      await handleMicrosoftTeams();

      createNotification({
        text: "Successfully created Microsoft Teams workflow integration",
        type: "success"
      });
    })();
  }, [isReady]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Please wait! Authentication in process." />
    </div>
  );
};
