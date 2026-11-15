import { useEffect, useRef } from "react";
import { Loader } from "@infisical/cipher/ui/loader";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { PageTitle } from "@app/components/PageTitle";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";

const ROUTE = v4Path("/organizations/$orgId/settings/oauth/callback");

const stateSchema = z.object({
  redirectUri: z.string(),
  tenantId: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  csrfToken: z.string(),
  clientId: z.string()
});

export const SettingsOauthCallbackPage = () => {
  const { orgId } = useParams({ from: ROUTE });
  const { state: rawState, code } = useSearch({ from: ROUTE });
  const createIntegration = useV4Adapter("orgSettings").useCreateMicrosoftTeamsIntegration();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const done = () =>
      navigate({
        to: v4Path("/organizations/$orgId/integrations"),
        params: { orgId },
        search: { selectedTab: "workflow-integrations" },
        replace: true
      });
    const fail = (message: string, error?: unknown) =>
      done().then(() => failed("Could not connect Microsoft Teams", error ?? new Error(message)));

    const state = stateSchema.safeParse(rawState);
    if (!state.success) {
      fail("The response from Microsoft was incomplete. Start the connection again.");
      return;
    }
    if (state.data.csrfToken !== localStorage.getItem("latestCSRFToken")) {
      fail("This connection session expired or was already completed. Start it again.");
      return;
    }
    localStorage.removeItem("latestCSRFToken");
    if (!code) {
      fail("Microsoft did not return an authorization code. Start the connection again.");
      return;
    }
    createIntegration
      .mutateAsync({
        orgId,
        tenantId: state.data.tenantId,
        code,
        slug: state.data.slug,
        description: state.data.description ?? "",
        redirectUri: state.data.redirectUri
      })
      .then(
        () => done().then(() => saved("Successfully created Microsoft Teams workflow integration")),
        (error) => fail("Failed to create the Microsoft Teams integration.", error)
      );
  }, [code, rawState, orgId, createIntegration, navigate]);

  return (
    <>
      <PageTitle title="Connecting Microsoft Teams" />
      <Loader size="page" label="Connecting Microsoft Teams" />
    </>
  );
};
