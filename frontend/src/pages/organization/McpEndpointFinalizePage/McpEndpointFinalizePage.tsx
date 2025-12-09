import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet";
import { Controller, useForm } from "react-hook-form";
import {
  faCheckCircle,
  faExternalLink,
  faPlug,
  faSpinner,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
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
  useSaveUserServerCredential
} from "@app/hooks/api";
import { useGetOAuthStatus } from "@app/hooks/api/aiMcpServers/queries";

const OAUTH_POPUP_WIDTH = 600;
const OAUTH_POPUP_HEIGHT = 700;
const OAUTH_POLL_INTERVAL = 2000;

const FinalizeFormSchema = z.object({
  expireIn: z.string().min(1, "Expiration is required")
});

type FormData = z.infer<typeof FinalizeFormSchema>;

type ServerOAuthState = {
  serverId: string;
  sessionId: string | null;
  isPending: boolean;
  isAuthorized: boolean;
};

export const McpEndpointFinalizePage = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [serverOAuthStates, setServerOAuthStates] = useState<Map<string, ServerOAuthState>>(
    new Map()
  );
  const [activeOAuthServerId, setActiveOAuthServerId] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

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

  // Get the active session ID for OAuth polling
  const activeServerState = activeOAuthServerId ? serverOAuthStates.get(activeOAuthServerId) : null;

  const { data: oauthStatus } = useGetOAuthStatus(
    { sessionId: activeServerState?.sessionId || "" },
    {
      enabled: Boolean(activeServerState?.sessionId) && activeServerState?.isPending === true,
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

  // Initialize server OAuth states when data loads
  useEffect(() => {
    if (serversRequiringAuth && serversRequiringAuth.length > 0) {
      const initialStates = new Map<string, ServerOAuthState>();
      serversRequiringAuth.forEach((server) => {
        initialStates.set(server.id, {
          serverId: server.id,
          sessionId: null,
          isPending: false,
          isAuthorized: server.hasCredentials
        });
      });
      setServerOAuthStates(initialStates);
    }
  }, [serversRequiringAuth]);

  // Handle OAuth status updates
  useEffect(() => {
    if (oauthStatus?.authorized && oauthStatus.accessToken && activeOAuthServerId) {
      // Save the credentials
      saveUserCredential.mutate(
        {
          endpointId: search.endpointId,
          serverId: activeOAuthServerId,
          accessToken: oauthStatus.accessToken,
          refreshToken: oauthStatus.refreshToken,
          expiresAt: oauthStatus.expiresAt,
          tokenType: oauthStatus.tokenType
        },
        {
          onSuccess: () => {
            // Update the state to mark as authorized
            setServerOAuthStates((prev) => {
              const newMap = new Map(prev);
              const state = newMap.get(activeOAuthServerId);
              if (state) {
                newMap.set(activeOAuthServerId, {
                  ...state,
                  isPending: false,
                  isAuthorized: true,
                  sessionId: null
                });
              }
              return newMap;
            });

            setActiveOAuthServerId(null);

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
    }
  }, [oauthStatus, activeOAuthServerId, search.endpointId, saveUserCredential]);

  // Check if popup was closed manually
  useEffect(() => {
    let checkPopupClosed: NodeJS.Timeout | null = null;

    if (activeOAuthServerId && activeServerState?.isPending) {
      checkPopupClosed = setInterval(() => {
        if (popupRef.current?.closed) {
          if (checkPopupClosed) {
            clearInterval(checkPopupClosed);
          }
          // Give some time for the callback to process
          setTimeout(() => {
            const currentState = serverOAuthStates.get(activeOAuthServerId);
            if (currentState && !currentState.isAuthorized) {
              setServerOAuthStates((prev) => {
                const newMap = new Map(prev);
                newMap.set(activeOAuthServerId, {
                  ...currentState,
                  isPending: false,
                  sessionId: null
                });
                return newMap;
              });
              setActiveOAuthServerId(null);
            }
          }, 3000);
        }
      }, 500);
    }

    return () => {
      if (checkPopupClosed) {
        clearInterval(checkPopupClosed);
      }
    };
  }, [activeOAuthServerId, activeServerState?.isPending, serverOAuthStates]);

  const handleServerOAuth = useCallback(
    async (serverId: string) => {
      try {
        // Update state to pending
        setServerOAuthStates((prev) => {
          const newMap = new Map(prev);
          const state = newMap.get(serverId);
          if (state) {
            newMap.set(serverId, { ...state, isPending: true });
          }
          return newMap;
        });
        setActiveOAuthServerId(serverId);

        const { authUrl, sessionId } = await initiateServerOAuth.mutateAsync({
          endpointId: search.endpointId,
          serverId
        });

        // Update state with session ID
        setServerOAuthStates((prev) => {
          const newMap = new Map(prev);
          const state = newMap.get(serverId);
          if (state) {
            newMap.set(serverId, { ...state, sessionId });
          }
          return newMap;
        });

        // Open popup
        const left = window.screenX + (window.outerWidth - OAUTH_POPUP_WIDTH) / 2;
        const top = window.screenY + (window.outerHeight - OAUTH_POPUP_HEIGHT) / 2;

        popupRef.current = window.open(
          authUrl,
          "MCP Server OAuth",
          `width=${OAUTH_POPUP_WIDTH},height=${OAUTH_POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );

        if (!popupRef.current) {
          createNotification({
            text: "Failed to open OAuth popup. Please allow popups for this site.",
            type: "error"
          });
          setServerOAuthStates((prev) => {
            const newMap = new Map(prev);
            const state = newMap.get(serverId);
            if (state) {
              newMap.set(serverId, { ...state, isPending: false, sessionId: null });
            }
            return newMap;
          });
          setActiveOAuthServerId(null);
        }
      } catch (error) {
        console.error("Failed to initiate OAuth:", error);
        createNotification({
          text: "Failed to initiate authentication",
          type: "error"
        });
        setServerOAuthStates((prev) => {
          const newMap = new Map(prev);
          const state = newMap.get(serverId);
          if (state) {
            newMap.set(serverId, { ...state, isPending: false, sessionId: null });
          }
          return newMap;
        });
        setActiveOAuthServerId(null);
      }
    },
    [search.endpointId, initiateServerOAuth]
  );

  // Check if all servers requiring auth have been authenticated
  const allServersAuthenticated =
    !serversRequiringAuth ||
    serversRequiringAuth.length === 0 ||
    serversRequiringAuth.every((server) => {
      const state = serverOAuthStates.get(server.id);
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
  const pendingServers = serversRequiringAuth?.filter((server) => {
    const state = serverOAuthStates.get(server.id);
    return !state?.isAuthorized && !server.hasCredentials;
  });

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
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <FontAwesomeIcon icon={faPlug} className="text-2xl text-primary" />
          </div>
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
          <div className="mb-6 space-y-2">
            {pendingServers && pendingServers.length > 0 && (
              <p className="flex items-center gap-2 text-xs text-yellow-500">
                <FontAwesomeIcon icon={faWarning} />
                <span>Authenticate with personal credential servers to continue</span>
              </p>
            )}
            {serversRequiringAuth.map((server) => {
              const state = serverOAuthStates.get(server.id);
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
                  <div className="ml-3 flex-shrink-0">
                    {isAuthorized && (
                      <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />
                    )}
                    {!isAuthorized && isServerPending && (
                      <FontAwesomeIcon icon={faSpinner} className="animate-spin text-yellow-500" />
                    )}
                    {!isAuthorized && !isServerPending && (
                      <Button
                        size="xs"
                        variant="outline_bg"
                        onClick={() => handleServerOAuth(server.id)}
                        isLoading={initiateServerOAuth.isPending}
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
              isDisabled={isSubmitting || isPending || !endpoint || !allServersAuthenticated}
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
      </div>
    </div>
  );
};
