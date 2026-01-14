import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import { faCheckCircle, faExternalLink, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import {
  useFinalizeMcpEndpointOAuth,
  useGetAiMcpEndpointById,
  useGetServersRequiringAuth,
  useInitiateServerOAuth,
  useSaveUserServerCredential,
  useVerifyServerBearerToken
} from "@app/hooks/api";
import { TServerAuthStatus } from "@app/hooks/api/aiMcpEndpoints/types";
import { useGetOAuthStatus } from "@app/hooks/api/aiMcpServers/queries";
import { AiMcpServerAuthMethod } from "@app/hooks/api/aiMcpServers/types";

import { BearerTokenModal } from "./components/BearerTokenModal";

const OAUTH_POPUP_WIDTH = 600;
const OAUTH_POPUP_HEIGHT = 700;
const OAUTH_POLL_INTERVAL = 2000;

const FinalizeFormSchema = z.object({
  expireIn: z.string().min(1, "Expiration is required")
});

type FormData = z.infer<typeof FinalizeFormSchema>;

type ServerOAuthState = {
  sessionId: string | null;
  isPending: boolean;
  isAuthorized: boolean;
};

export const McpEndpointFinalizePage = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [serverStates, setServerStates] = useState<Map<string, ServerOAuthState>>(new Map());
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [bearerModalServer, setBearerModalServer] = useState<{ id: string; name: string } | null>(
    null
  );
  const [bearerTokenError, setBearerTokenError] = useState<string | undefined>(undefined);

  const search = useSearch({
    from: "/_authenticate/organization/mcp-endpoint-finalize"
  });

  const { data: endpoint, isLoading: isEndpointLoading } = useGetAiMcpEndpointById({
    endpointId: search.endpointId
  });

  const { data: serversRequiringAuth, isLoading: isServersLoading } = useGetServersRequiringAuth({
    endpointId: search.endpointId
  });

  const { mutateAsync: finalizeOAuth, isPending } = useFinalizeMcpEndpointOAuth();
  const initiateServerOAuth = useInitiateServerOAuth();
  const saveUserCredential = useSaveUserServerCredential();
  const verifyBearerToken = useVerifyServerBearerToken();

  // Get active server's state for polling
  const activeState = activeServerId ? serverStates.get(activeServerId) : null;
  const activeSessionId = activeState?.sessionId ?? null;
  const shouldPoll = Boolean(activeSessionId) && activeState?.isPending === true;

  // Poll OAuth status - continues until authorized: true
  const { data: oauthStatus } = useGetOAuthStatus(
    { sessionId: activeSessionId || "" },
    {
      enabled: shouldPoll,
      refetchInterval: OAUTH_POLL_INTERVAL
    }
  );

  const {
    handleSubmit,
    control,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(FinalizeFormSchema),
    defaultValues: {
      expireIn: "30d"
    }
  });

  // Initialize server states when data loads
  useEffect(() => {
    if (serversRequiringAuth && serversRequiringAuth.length > 0) {
      setServerStates((prev) => {
        const newStates = new Map<string, ServerOAuthState>();
        serversRequiringAuth.forEach((server) => {
          // Preserve existing state if available, otherwise initialize
          const existing = prev.get(server.id);
          newStates.set(server.id, {
            sessionId: existing?.sessionId ?? null,
            isPending: existing?.isPending ?? false,
            isAuthorized: existing?.isAuthorized ?? server.hasCredentials
          });
        });
        return newStates;
      });
    }
  }, [serversRequiringAuth]);

  // Handle OAuth success - save credentials when authorized
  useEffect(() => {
    if (
      !oauthStatus?.authorized ||
      !oauthStatus.accessToken ||
      !activeServerId ||
      !activeSessionId
    ) {
      return;
    }

    // Prevent duplicate saves
    const state = serverStates.get(activeServerId);
    if (!state?.isPending) {
      return;
    }

    // Save credentials
    saveUserCredential.mutate(
      {
        endpointId: search.endpointId,
        serverId: activeServerId,
        accessToken: oauthStatus.accessToken,
        refreshToken: oauthStatus.refreshToken,
        expiresAt: oauthStatus.expiresAt,
        tokenType: oauthStatus.tokenType
      },
      {
        onSuccess: () => {
          setServerStates((prev) => {
            const newMap = new Map(prev);
            newMap.set(activeServerId, {
              sessionId: null,
              isPending: false,
              isAuthorized: true
            });
            return newMap;
          });
          setActiveServerId(null);
          createNotification({
            text: "Server authentication successful",
            type: "success"
          });
        },
        onError: () => {
          createNotification({
            text: "Failed to save credentials",
            type: "error"
          });
        }
      }
    );
  }, [oauthStatus?.authorized, oauthStatus?.accessToken, activeServerId, activeSessionId]);

  const handleServerOAuth = useCallback(
    async (serverId: string) => {
      try {
        // Set pending state
        setServerStates((prev) => {
          const newMap = new Map(prev);
          const existing = prev.get(serverId);
          newMap.set(serverId, {
            sessionId: null,
            isPending: true,
            isAuthorized: existing?.isAuthorized ?? false
          });
          return newMap;
        });
        setActiveServerId(serverId);

        // Get OAuth URL and session
        const { authUrl, sessionId } = await initiateServerOAuth.mutateAsync({
          endpointId: search.endpointId,
          serverId
        });

        // Store session ID to start polling
        setServerStates((prev) => {
          const newMap = new Map(prev);
          const existing = prev.get(serverId);
          newMap.set(serverId, {
            sessionId,
            isPending: true,
            isAuthorized: existing?.isAuthorized ?? false
          });
          return newMap;
        });

        // Open OAuth popup
        const left = window.screenX + (window.outerWidth - OAUTH_POPUP_WIDTH) / 2;
        const top = window.screenY + (window.outerHeight - OAUTH_POPUP_HEIGHT) / 2;

        const popup = window.open(
          authUrl,
          `oauth_${serverId}`,
          `width=${OAUTH_POPUP_WIDTH},height=${OAUTH_POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );

        if (!popup) {
          createNotification({
            text: "Failed to open OAuth popup. Please allow popups for this site.",
            type: "error"
          });
          setServerStates((prev) => {
            const newMap = new Map(prev);
            newMap.set(serverId, {
              sessionId: null,
              isPending: false,
              isAuthorized: false
            });
            return newMap;
          });
          setActiveServerId(null);
        }
      } catch (error) {
        console.error("Failed to initiate OAuth:", error);
        createNotification({
          text: "Failed to initiate authentication",
          type: "error"
        });
        setServerStates((prev) => {
          const newMap = new Map(prev);
          newMap.set(serverId, {
            sessionId: null,
            isPending: false,
            isAuthorized: false
          });
          return newMap;
        });
        setActiveServerId(null);
      }
    },
    [search.endpointId, initiateServerOAuth]
  );

  const handleServerAuth = useCallback(
    (server: TServerAuthStatus) => {
      if (server.authMethod === AiMcpServerAuthMethod.BEARER) {
        setBearerTokenError(undefined);
        setBearerModalServer({ id: server.id, name: server.name });
      } else {
        // OAuth flow (default for oauth and basic auth types)
        handleServerOAuth(server.id);
      }
    },
    [handleServerOAuth]
  );

  const handleBearerTokenSubmit = useCallback(
    async (token: string) => {
      if (!bearerModalServer) return;

      setBearerTokenError(undefined);

      try {
        // First verify the token
        const { valid, message } = await verifyBearerToken.mutateAsync({
          endpointId: search.endpointId,
          serverId: bearerModalServer.id,
          accessToken: token
        });

        if (!valid) {
          setBearerTokenError(message || "Invalid token");
          return;
        }

        // Token is valid, save credentials
        await saveUserCredential.mutateAsync({
          endpointId: search.endpointId,
          serverId: bearerModalServer.id,
          accessToken: token,
          tokenType: "Bearer"
        });

        setServerStates((prev) => {
          const newMap = new Map(prev);
          newMap.set(bearerModalServer.id, {
            sessionId: null,
            isPending: false,
            isAuthorized: true
          });
          return newMap;
        });

        createNotification({
          text: "Server authentication successful",
          type: "success"
        });

        setBearerModalServer(null);
      } catch (error) {
        console.error("Failed to verify/save bearer token:", error);
        // Extract error message from axios error if available
        const axiosError = error as { response?: { data?: { message?: string } } };
        const errorMessage =
          axiosError?.response?.data?.message ||
          "Failed to verify token. Please check your token and try again.";
        setBearerTokenError(errorMessage);
      }
    },
    [bearerModalServer, search.endpointId, verifyBearerToken, saveUserCredential]
  );

  const allServersAuthenticated =
    !serversRequiringAuth ||
    serversRequiringAuth.length === 0 ||
    serversRequiringAuth.every((server) => {
      const state = serverStates.get(server.id);
      return state?.isAuthorized || server.hasCredentials;
    });

  const onSubmit = async ({ expireIn }: FormData) => {
    try {
      const { callbackUrl } = await finalizeOAuth({
        endpointId: search.endpointId,
        response_type: search.response_type,
        client_id: search.client_id,
        code_challenge: search.code_challenge,
        code_challenge_method: search.code_challenge_method,
        redirect_uri: search.redirect_uri,
        resource: search.resource,
        expireIn
      });

      setIsRedirecting(true);
      window.location.href = callbackUrl;

      setTimeout(() => {
        window.close();
      }, 3000);
    } catch (error) {
      console.error("Failed to authorize:", error);
      createNotification({
        text: "Failed to authorize MCP endpoint access",
        type: "error"
      });
    }
  };

  if (isRedirecting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bunker-800">
        <div className="w-full max-w-md rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <FontAwesomeIcon icon={faCheckCircle} className="text-3xl text-green-500" />
          </div>
          <h1 className="text-xl font-semibold text-mineshaft-100">Authorization Successful</h1>
          <p className="mt-2 text-sm text-bunker-300">
            <FontAwesomeIcon icon={faSpinner} className="mr-2 animate-spin" />
            Redirecting back to the application...
          </p>
        </div>
      </div>
    );
  }

  const hasServersRequiringAuth = serversRequiringAuth && serversRequiringAuth.length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bunker-800">
      <Helmet>
        <title>Authorize MCP Endpoint</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>

      <div className="w-full max-w-md rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-8 shadow-lg">
        <Link to="/" className="mb-6 block">
          <img src="/images/gradientLogo.svg" className="mx-auto h-16" alt="Infisical logo" />
        </Link>

        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-mineshaft-100">Authorize MCP Access</h1>
          <p className="mt-2 text-sm text-bunker-300">
            An external application is requesting access to your MCP endpoint
          </p>
        </div>

        {isEndpointLoading && (
          <div className="mb-6 animate-pulse rounded-lg border border-mineshaft-600 bg-mineshaft-700 p-4">
            <div className="h-4 w-1/3 rounded bg-mineshaft-600" />
            <div className="mt-2 h-3 w-2/3 rounded bg-mineshaft-600" />
          </div>
        )}
        {!isEndpointLoading && endpoint && (
          <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-700 p-4">
            <p className="text-xs font-medium tracking-wide text-bunker-400 uppercase">Endpoint</p>
            <p className="mt-1 font-medium text-mineshaft-100">{endpoint.name}</p>
            {endpoint.description && (
              <p className="mt-1 text-sm text-bunker-300">{endpoint.description}</p>
            )}
            <div className="mt-3 flex items-center gap-4 text-xs text-bunker-400">
              <span>{endpoint.connectedServers} server(s)</span>
              <span>{endpoint.activeTools} tool(s)</span>
            </div>
          </div>
        )}
        {!isEndpointLoading && !endpoint && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400">Endpoint not found</p>
          </div>
        )}

        {/* Servers requiring authentication */}
        {!isServersLoading && hasServersRequiringAuth && (
          <div className="mt-6 mb-6 space-y-2">
            <div className="rounded-md border border-primary-500/30 bg-primary-500/10 p-3">
              <p className="text-xs text-mineshaft-200">
                <span className="font-medium text-primary-400">Note:</span>{" "}
                {serversRequiringAuth.length === 1
                  ? "The following server uses personal credentials. Authenticate with your own account to access its tools."
                  : "The following servers use personal credentials. Authenticate with your own accounts to access their tools."}
              </p>
            </div>
            {serversRequiringAuth.map((server) => {
              const state = serverStates.get(server.id);
              const isAuthorized = state?.isAuthorized || server.hasCredentials;
              const isServerPending = state?.isPending;

              return (
                <div
                  key={server.id}
                  className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                    isAuthorized
                      ? "border-green-500/30 bg-green-500/5"
                      : "border-mineshaft-600 bg-mineshaft-700/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-mineshaft-100">{server.name}</p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    {isAuthorized && (
                      <>
                        <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />
                        <Button
                          size="xs"
                          variant="outline_bg"
                          onClick={() => handleServerAuth(server)}
                        >
                          Re-authenticate
                        </Button>
                      </>
                    )}
                    {!isAuthorized && isServerPending && (
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-yellow-500" />
                    )}
                    {!isAuthorized && !isServerPending && (
                      <Button
                        size="xs"
                        variant="outline_bg"
                        onClick={() => handleServerAuth(server)}
                        isLoading={initiateServerOAuth.isPending && activeServerId === server.id}
                        leftIcon={<FontAwesomeIcon icon={faExternalLink} />}
                      >
                        Authenticate
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Only show authorization form after all servers are authenticated */}
        {allServersAuthenticated && (
          <>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Controller
                control={control}
                name="expireIn"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Access Duration"
                    isError={Boolean(error)}
                    errorText={error?.message}
                    helperText="How long the access token should be valid (e.g., 1h, 7d, 30d)"
                  >
                    <Input {...field} placeholder="30d" />
                  </FormControl>
                )}
              />

              <div className="mt-6 flex gap-3">
                <Button
                  type="submit"
                  className="flex-1"
                  isLoading={isSubmitting || isPending}
                  isDisabled={isSubmitting || isPending || !endpoint}
                >
                  Authorize
                </Button>
                <Link to="/">
                  <Button variant="outline_bg" colorSchema="secondary">
                    Cancel
                  </Button>
                </Link>
              </div>
            </form>

            <p className="mt-6 text-center text-xs text-bunker-400">
              By authorizing, you grant the external application access to interact with the tools
              available through this MCP endpoint.
            </p>
          </>
        )}
      </div>

      <BearerTokenModal
        isOpen={bearerModalServer !== null}
        onOpenChange={(isOpen) => !isOpen && setBearerModalServer(null)}
        serverName={bearerModalServer?.name || ""}
        isLoading={verifyBearerToken.isPending || saveUserCredential.isPending}
        errorMessage={bearerTokenError}
        onSubmit={handleBearerTokenSubmit}
      />
    </div>
  );
};
