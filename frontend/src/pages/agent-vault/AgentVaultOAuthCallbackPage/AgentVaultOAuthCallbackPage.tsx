import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { useSearch } from "@tanstack/react-router";
import axios from "axios";
import { CircleAlertIcon } from "lucide-react";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import {
  Alert,
  AlertDescription,
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import {
  AgentVaultOAuthAuthorizationStatus,
  useCompleteAgentVaultOAuthAuthorization
} from "@app/hooks/api/agentVault";

const CLOSE_AFTER_SUCCESS_MS = 1000;
const CLOSE_AFTER_FAILURE_MS = 4000;

type TOutcome =
  | { status: "working" }
  | { status: "authorized" }
  | { status: "failed"; message: string };

const failureMessage = (error: unknown) => {
  if (axios.isAxiosError<{ message?: unknown }>(error)) {
    if (error.response?.status === 404) {
      return "This authorization expired or was started by another user. Close this window and select Authorize again.";
    }
    const message = error.response?.data?.message;
    if (typeof message === "string") return message;
  }
  return "Couldn't finish the authorization. Close this window and select Authorize again.";
};

export const AgentVaultOAuthCallbackPage = () => {
  const search = useSearch({ from: "/_authenticate/agent-vault/oauth/callback" });
  const completeAuthorization = useCompleteAgentVaultOAuthAuthorization();
  const [outcome, setOutcome] = useState<TOutcome>({ status: "working" });
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    const { state, code, iss, error, error_description: errorDescription } = search;
    const authorizationId = state?.split(".")[0];
    if (!state || !authorizationId) {
      setOutcome({
        status: "failed",
        message:
          "This page is missing the authorization details. Close this window and select Authorize again."
      });
      return;
    }

    completeAuthorization
      .mutateAsync({ authorizationId, state, code, iss, error, errorDescription })
      .then((authorization) => {
        if (authorization.status === AgentVaultOAuthAuthorizationStatus.Authorized) {
          setOutcome({ status: "authorized" });
          return;
        }
        setOutcome({
          status: "failed",
          message: authorization.error ?? "The server refused the authorization."
        });
      })
      .catch((err: unknown) => setOutcome({ status: "failed", message: failureMessage(err) }));
    // Runs once: completing twice would exchange the same code twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (outcome.status === "working") return undefined;
    const id = window.setTimeout(
      () => window.close(),
      outcome.status === "authorized" ? CLOSE_AFTER_SUCCESS_MS : CLOSE_AFTER_FAILURE_MS
    );
    return () => window.clearTimeout(id);
  }, [outcome.status]);

  let title = "Finishing Authorization";
  let description = "Confirming the authorization with Infisical.";
  if (outcome.status === "authorized") {
    title = "Authorization Complete";
    description =
      "This window closes on its own. Return to Infisical to finish adding the service.";
  } else if (outcome.status === "failed") {
    title = "Authorization Failed";
    description = "This window closes on its own. Return to Infisical and select Authorize again.";
  }

  return (
    <AuthPageLayout variant="focused" showFooter={false}>
      <Helmet>
        <title>Agent Vault Authorization</title>
      </Helmet>
      <AuthPagePanel>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {outcome.status !== "working" && (
          <CardContent className="flex flex-col gap-4">
            {outcome.status === "failed" && (
              <Alert variant="danger">
                <CircleAlertIcon />
                <AlertDescription>{outcome.message}</AlertDescription>
              </Alert>
            )}
            <div>
              <Button type="button" variant="outline" onClick={() => window.close()}>
                Close Window
              </Button>
            </div>
          </CardContent>
        )}
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
