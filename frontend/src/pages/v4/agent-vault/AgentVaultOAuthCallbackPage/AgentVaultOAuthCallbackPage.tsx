import { useEffect, useRef, useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Stack } from "@infisical/cipher/ui/layout";
import { StatusText } from "@infisical/cipher/ui/text";
import { QueryClientProvider } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { isAxiosError } from "axios";

import { AgentVaultOauthAuthorizationStatus } from "@app/hooks/api/agentVault/enums";

import { AuthPage } from "../../auth/components/AuthPage";
import { useV4Adapter } from "../../data/adapters";
import { liveQueryClient } from "../../data/live-query-client";

const PAGE_TITLE = "Agent Vault Authorization";
const CLOSE_AFTER_SUCCESS_MS = 1000;

type Outcome =
  | { status: "working" }
  | { status: "authorized" }
  | { status: "failed"; message: string };

const failureMessage = (error: unknown) => {
  if (!isAxiosError<{ message?: unknown }>(error))
    return "Couldn't finish the authorization. Close this window and try again.";
  if (error.response?.status === 404)
    return "This authorization expired or was started by another user. Close this window and try again.";
  const message = error.response?.data?.message;
  return typeof message === "string"
    ? message
    : "Couldn't finish the authorization. Close this window and try again.";
};

const Callback = () => {
  const search = useSearch({ from: "/v4/agent-vault/oauth/callback" });
  const complete = useV4Adapter("agentVault").useCompleteOauthAuthorization();
  const [outcome, setOutcome] = useState<Outcome>({ status: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { state, code, iss, error, error_description: errorDescription } = search;
    const authorizationId = state?.split(".")[0];
    if (!state || !authorizationId) {
      setOutcome({
        status: "failed",
        message: "This page is missing the authorization details. Close this window and try again."
      });
      return;
    }
    complete
      .mutateAsync({ authorizationId, state, code, iss, error, errorDescription })
      .then((authorization) =>
        setOutcome(
          authorization.status === AgentVaultOauthAuthorizationStatus.Authorized
            ? { status: "authorized" }
            : {
                status: "failed",
                message: authorization.error ?? "The server refused the authorization."
              }
        )
      )
      .catch((err: unknown) => setOutcome({ status: "failed", message: failureMessage(err) }));
  }, [complete, search]);

  useEffect(() => {
    if (outcome.status !== "authorized") return undefined;
    const id = window.setTimeout(() => window.close(), CLOSE_AFTER_SUCCESS_MS);
    return () => window.clearTimeout(id);
  }, [outcome.status]);

  if (outcome.status === "working")
    return (
      <AuthPage variant="focused" pageTitle={PAGE_TITLE} title="Finishing authorization">
        <StatusText size="md" loading>
          Confirming the authorization with Infisical
        </StatusText>
      </AuthPage>
    );

  const authorized = outcome.status === "authorized";
  return (
    <AuthPage
      variant="focused"
      pageTitle={PAGE_TITLE}
      title={authorized ? "Authorization complete" : "Authorization failed"}
      description={
        authorized
          ? "This window closes on its own. Return to Infisical to finish."
          : "Return to Infisical and try again."
      }
    >
      <Stack gap={16}>
        {outcome.status === "failed" && <Alert tone="bad" title={outcome.message} />}
        <Button variant="outline" size="lg" className="w-full" onClick={() => window.close()}>
          Close window
        </Button>
      </Stack>
    </AuthPage>
  );
};

export const AgentVaultOAuthCallbackPage = () => (
  <QueryClientProvider client={liveQueryClient}>
    <Callback />
  </QueryClientProvider>
);
