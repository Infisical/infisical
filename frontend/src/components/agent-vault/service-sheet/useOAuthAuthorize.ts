import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import {
  AgentVaultOAuthAuthorizationStatus,
  useCreateAgentVaultOAuthAuthorization,
  useGetAgentVaultOAuthAuthorization
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultOAuthAuthorization,
  TCreateAgentVaultOAuthAuthorizationDTO
} from "@app/hooks/api/agentVault/types";

const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const POPUP_NAME = "infisical-agent-vault-oauth";
const POPUP_FEATURES = "popup,width=600,height=720";

export type TOAuthAuthorizeState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "pending"; popupClosed: boolean }
  | { status: "authorized"; authorization: TAgentVaultOAuthAuthorization }
  | { status: "failed"; message: string };

const serverMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: unknown }>(error)) return null;
  const message = error.response?.data?.message;
  return typeof message === "string" ? message : null;
};

export const useOAuthAuthorize = ({
  onAuthorized
}: {
  onAuthorized: (authorization: TAgentVaultOAuthAuthorization) => void;
}) => {
  const createAuthorization = useCreateAgentVaultOAuthAuthorization();
  const [state, setState] = useState<TOAuthAuthorizeState>({ status: "idle" });
  const [isClientRequired, setIsClientRequired] = useState(false);
  const [redirectUri, setRedirectUri] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [pendingAuthorization, setPendingAuthorization] = useState<{
    id: string;
    attempt: number;
  } | null>(null);
  const {
    data: authorization,
    error: authorizationError,
    dataUpdatedAt
  } = useGetAgentVaultOAuthAuthorization(pendingAuthorization?.id ?? "");

  const popupRef = useRef<Window | null>(null);
  // Bumped by every new attempt and by cancel, so a response for an older attempt is dropped.
  const attemptRef = useRef(0);
  const onAuthorizedRef = useRef(onAuthorized);
  onAuthorizedRef.current = onAuthorized;

  const stop = useCallback(() => {
    attemptRef.current += 1;
    setPendingAuthorization(null);
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const fail = useCallback(
    (message: string) => {
      stop();
      setState({ status: "failed", message });
    },
    [stop]
  );

  useEffect(() => {
    if (!pendingAuthorization || attemptRef.current !== pendingAuthorization.attempt) return;
    if (authorizationError) {
      fail(
        serverMessage(authorizationError) ??
          "Couldn't check the authorization status. Select Authorize to try again."
      );
      return;
    }
    if (!authorization) return;
    if (authorization.status === AgentVaultOAuthAuthorizationStatus.Authorized) {
      stop();
      setState({ status: "authorized", authorization });
      onAuthorizedRef.current(authorization);
      return;
    }
    if (authorization.status === AgentVaultOAuthAuthorizationStatus.Failed) {
      fail(authorization.error ?? "The server refused the authorization. Try again.");
      return;
    }

    // Cross-Origin-Opener-Policy can report an open popup as closed, so this changes only the hint.
    const popupClosed = !popupRef.current || popupRef.current.closed;
    setState((previous) =>
      previous.status === "pending" && previous.popupClosed !== popupClosed
        ? { status: "pending", popupClosed }
        : previous
    );
  }, [pendingAuthorization, authorization, authorizationError, dataUpdatedAt, fail, stop]);

  useEffect(() => {
    if (!pendingAuthorization) return undefined;
    const timeout = window.setTimeout(() => {
      if (attemptRef.current === pendingAuthorization.attempt) {
        fail("The authorization timed out after 5 minutes. Select Authorize to try again.");
      }
    }, POLL_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [pendingAuthorization, fail]);

  // Call straight from the click handler: browsers only allow a popup opened during a user gesture,
  // so it is opened blank first and pointed at the authorize URL once the server returns it.
  const authorize = useCallback(
    (params: TCreateAgentVaultOAuthAuthorizationDTO) => {
      stop();
      const attempt = attemptRef.current;

      const popup = window.open("", POPUP_NAME, POPUP_FEATURES);
      if (!popup) {
        setState({
          status: "failed",
          message:
            "Your browser blocked the authorization window. Allow pop-ups for this site, then select Authorize again."
        });
        return;
      }
      // The authorization server, possibly an admin-entered one, gets no handle on this tab.
      popup.opener = null;
      popupRef.current = popup;
      setState({ status: "starting" });

      createAuthorization
        .mutateAsync(params)
        .then(
          ({
            registrationRequired,
            redirectUri: uri,
            registrationError: reason,
            authorization: createdAuthorization
          }) => {
            if (attemptRef.current !== attempt) return;
            if (registrationRequired || !createdAuthorization) {
              stop();
              setIsClientRequired(true);
              setRedirectUri(uri);
              setRegistrationError(reason);
              setState({ status: "idle" });
              return;
            }
            popup.location.href = createdAuthorization.authorizeUrl;
            setState({ status: "pending", popupClosed: false });
            setPendingAuthorization({ id: createdAuthorization.id, attempt });
          }
        )
        .catch((error: unknown) => {
          if (attemptRef.current !== attempt) return;
          fail(
            serverMessage(error) ??
              "Couldn't start the authorization. Check the server URL and try again."
          );
        });
    },
    [createAuthorization, fail, stop]
  );

  const cancel = useCallback(() => {
    stop();
    setState({ status: "idle" });
  }, [stop]);

  return { state, isClientRequired, redirectUri, registrationError, authorize, cancel };
};
