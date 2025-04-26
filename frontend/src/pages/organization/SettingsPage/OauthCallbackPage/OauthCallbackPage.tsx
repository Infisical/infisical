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
  csrfToken: z.string()
});

export const OAuthCallbackPage = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const [isReady, setIsReady] = useState(false);

  const search = useSearch({
    from: ROUTE_PATHS.Organization.Settings.OauthCallbackPage.id
  });

  const createMicrosoftTeamsWorkflowIntegration = useCreateMicrosoftTeamsIntegration();

  const { state: rawState, tenant: stateTenant, admin_consent: adminConsent } = search;

  const state = stateSchema.parse(rawState);

  const clearState = () => {
    if (state.csrfToken !== localStorage.getItem("latestCSRFToken")) {
      throw new Error("Invalid CSRF token");
    }

    localStorage.removeItem("latestCSRFToken");
  };

  const handleMicrosoftTeams = useCallback(async () => {
    clearState();

    if (Boolean(adminConsent.toLowerCase()) !== true) {
      throw new Error("Failed to grant admin consent");
    }

    if (stateTenant !== state.tenantId) {
      throw new Error(`Invalid tenant ID. Expected ${stateTenant}, got ${state.tenantId}`);
    }

    await createMicrosoftTeamsWorkflowIntegration.mutateAsync({
      orgId: currentOrg.id,
      tenantId: state.tenantId,
      slug: state.slug,
      description: state.description ?? "",
      redirectUri: state.redirectUri
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
      try {
        await handleMicrosoftTeams();

        createNotification({
          text: "Successfully granted Microsoft Teams admin consent",
          type: "success"
        });
      } catch (err) {
        console.error(err);
        createNotification({
          text: "Failed to grant Microsoft Teams admin consent",
          type: "error"
        });
      }

      navigate({
        to: ROUTE_PATHS.Organization.SettingsPage.path
      });
    })();
  }, [isReady]);

  return (
    <div className="flex h-full w-full items-center justify-center">
      <ContentLoader text="Please wait! Authentication in process." />
    </div>
  );
};
