import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { faCheck, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { useProject } from "@app/context";
import { useGetOAuthStatus, useInitiateOAuth } from "@app/hooks/api";

import {
  MCPServerAuthMethod,
  MCPServerCredentialMode,
  TAddMCPServerForm
} from "./AddMCPServerForm.schema";

// Only OAuth is supported for now - other methods are defined in schema for future use
const AUTH_METHOD_OPTIONS = [{ value: MCPServerAuthMethod.OAUTH, label: "OAuth" }];

const OAUTH_POPUP_WIDTH = 600;
const OAUTH_POPUP_HEIGHT = 700;
const OAUTH_POLL_INTERVAL = 2000; // Poll every 2 seconds

type Props = {
  onOAuthSuccess?: () => void;
};

export const AuthenticationStep = ({ onOAuthSuccess }: Props) => {
  const { currentProject } = useProject();
  const { control, watch, setValue, getValues } = useFormContext<TAddMCPServerForm>();
  const authMethod = watch("authMethod");
  const credentialMode = watch("credentialMode");
  const isPersonalMode = credentialMode === MCPServerCredentialMode.PERSONAL;

  // OAuth state
  const [oauthSessionId, setOauthSessionId] = useState<string | null>(null);
  const [isOAuthPending, setIsOAuthPending] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const oauthSucceededRef = useRef(false);

  // Check if OAuth is already authorized (has access token)
  const oauthCredentials = authMethod === MCPServerAuthMethod.OAUTH ? watch("credentials") : null;
  const isOAuthAuthorized =
    oauthCredentials && "accessToken" in oauthCredentials && Boolean(oauthCredentials.accessToken);

  // Hooks
  const initiateOAuth = useInitiateOAuth();
  const { data: oauthStatus } = useGetOAuthStatus(
    { sessionId: oauthSessionId || "" },
    {
      enabled: Boolean(oauthSessionId) && isOAuthPending,
      refetchInterval: isOAuthPending ? OAUTH_POLL_INTERVAL : false
    }
  );

  // Handle OAuth status updates
  useEffect(() => {
    if (oauthStatus?.authorized && oauthStatus.accessToken) {
      // Mark OAuth as succeeded (for popup close detection)
      oauthSucceededRef.current = true;

      // OAuth completed successfully - use shouldDirty and shouldTouch to trigger re-renders
      setValue(
        "credentials",
        {
          accessToken: oauthStatus.accessToken,
          refreshToken: oauthStatus.refreshToken,
          expiresAt: oauthStatus.expiresAt,
          tokenType: oauthStatus.tokenType || "Bearer"
        },
        { shouldDirty: true, shouldTouch: true, shouldValidate: true }
      );

      setIsOAuthPending(false);
      setOauthSessionId(null);

      // Clear polling interval
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      createNotification({
        text: "OAuth authorization successful",
        type: "success"
      });

      // Auto-submit the form after OAuth succeeds
      if (onOAuthSuccess) {
        // Small delay to ensure form state is updated
        setTimeout(() => {
          onOAuthSuccess();
        }, 100);
      }
    }
  }, [oauthStatus, setValue, onOAuthSuccess]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
    };
  }, []);

  // Check if popup was closed manually
  useEffect(() => {
    let checkPopupClosed: NodeJS.Timeout | null = null;

    if (isOAuthPending) {
      // Reset the success ref when starting a new OAuth flow
      oauthSucceededRef.current = false;

      checkPopupClosed = setInterval(() => {
        if (popupRef.current?.closed) {
          if (checkPopupClosed) {
            clearInterval(checkPopupClosed);
          }
          // Don't immediately cancel - give a few more seconds for callback to process
          setTimeout(() => {
            // Use ref to check if OAuth succeeded (avoids stale closure)
            if (!oauthSucceededRef.current) {
              setIsOAuthPending(false);
              createNotification({
                text: "OAuth authorization was cancelled",
                type: "info"
              });
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
  }, [isOAuthPending]);

  const handleAuthMethodChange = useCallback(
    (value: MCPServerAuthMethod) => {
      setValue("authMethod", value);
      // Reset credentials when auth method changes
      if (value === MCPServerAuthMethod.BASIC) {
        setValue("credentials", { username: "", password: "" });
      } else if (value === MCPServerAuthMethod.BEARER) {
        setValue("credentials", { token: "" });
      } else if (value === MCPServerAuthMethod.OAUTH) {
        setValue("credentials", { accessToken: "", refreshToken: "", tokenType: "Bearer" });
      }

      // Reset OAuth state
      setOauthSessionId(null);
      setIsOAuthPending(false);
      oauthSucceededRef.current = false;
    },
    [setValue]
  );

  const handleOAuthAuthorize = async () => {
    const serverUrl = getValues("url");
    if (!serverUrl) {
      createNotification({
        text: "Please enter the server URL first",
        type: "error"
      });
      return;
    }

    if (!currentProject?.id) {
      createNotification({
        text: "No project selected",
        type: "error"
      });
      return;
    }

    try {
      setIsOAuthPending(true);

      // Get optional client credentials
      const clientId = getValues("oauthClientId");
      const clientSecret = getValues("oauthClientSecret");

      // 1. Call backend to initiate OAuth and get auth URL
      const { authUrl, sessionId } = await initiateOAuth.mutateAsync({
        url: serverUrl,
        projectId: currentProject.id,
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined
      });

      setOauthSessionId(sessionId);

      // 2. Calculate popup position (centered)
      const left = window.screenX + (window.outerWidth - OAUTH_POPUP_WIDTH) / 2;
      const top = window.screenY + (window.outerHeight - OAUTH_POPUP_HEIGHT) / 2;

      // 3. Open popup for OAuth
      popupRef.current = window.open(
        authUrl,
        "MCP OAuth Authorization",
        `width=${OAUTH_POPUP_WIDTH},height=${OAUTH_POPUP_HEIGHT},left=${left},top=${top},scrollbars=yes,resizable=yes`
      );

      if (!popupRef.current) {
        createNotification({
          text: "Failed to open OAuth popup. Please allow popups for this site.",
          type: "error"
        });
        setIsOAuthPending(false);
        setOauthSessionId(null);
      }
    } catch (error) {
      console.error("Failed to initiate OAuth:", error);
      createNotification({
        text: "Failed to initiate OAuth authorization",
        type: "error"
      });
      setIsOAuthPending(false);
      setOauthSessionId(null);
    }
  };

  const handleCancelOAuth = () => {
    setIsOAuthPending(false);
    setOauthSessionId(null);

    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  return (
    <>
      {isPersonalMode ? (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-bunker-300">
            Authorize once to discover available tools from the MCP server.
          </p>
          <div className="rounded-md border border-primary-500/30 bg-primary-500/10 p-3">
            <p className="text-xs text-mineshaft-200">
              <span className="font-medium text-primary-400">Note:</span> Since you selected
              Personal Credentials, each user will authenticate with their own credentials when
              accessing this server. This authorization is only used to fetch the list of available
              tools.
            </p>
          </div>
        </div>
      ) : (
        <p className="mb-4 text-sm text-bunker-300">
          Configure shared authentication credentials for the MCP server.
        </p>
      )}

      <Controller
        control={control}
        name="authMethod"
        render={({ field: { value }, fieldState: { error } }) => (
          <FormControl
            label="Authentication Type"
            isRequired
            isError={Boolean(error)}
            errorText={error?.message}
          >
            <Select
              value={value}
              onValueChange={(val) => handleAuthMethodChange(val as MCPServerAuthMethod)}
              className="w-full"
              placeholder="Select authentication type..."
              isDisabled={isOAuthPending}
              position="popper"
              dropdownContainerClassName="max-w-none"
            >
              {AUTH_METHOD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />

      {authMethod === MCPServerAuthMethod.BEARER && (
        <Controller
          control={control}
          name="credentials.token"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              label="Bearer Token"
              isRequired
              isError={Boolean(error)}
              errorText={error?.message}
              helperText="This credential will be securely stored in Infisical"
            >
              <Input {...field} type="password" placeholder="Enter bearer token" />
            </FormControl>
          )}
        />
      )}

      {authMethod === MCPServerAuthMethod.BASIC && (
        <>
          <Controller
            control={control}
            name="credentials.username"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Username"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} placeholder="Enter username" />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="credentials.password"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Password"
                isRequired
                isError={Boolean(error)}
                errorText={error?.message}
                helperText="This credential will be securely stored in Infisical"
              >
                <Input {...field} type="password" placeholder="Enter password" />
              </FormControl>
            )}
          />
        </>
      )}

      {authMethod === MCPServerAuthMethod.OAUTH && (
        <div className="mt-2 space-y-4">
          {/* Optional client credentials for servers without DCR support (like GitHub) */}
          <div className="space-y-4 rounded-md border border-mineshaft-600 bg-mineshaft-700/50 p-4">
            <p className="text-xs text-bunker-300">
              Optional: For MCP servers that don&apos;t support Dynamic Client Registration, enter
              your OAuth app credentials below.
              {isPersonalMode &&
                " These will be saved so users don't need to provide them when authenticating."}
            </p>
            <Controller
              control={control}
              name="oauthClientId"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Client ID"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="mb-2"
                >
                  <Input
                    {...field}
                    value={field.value || ""}
                    placeholder="Optional client ID"
                    isDisabled={isOAuthPending || !!isOAuthAuthorized}
                  />
                </FormControl>
              )}
            />
            <Controller
              control={control}
              name="oauthClientSecret"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="Client Secret"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  className="mb-0"
                >
                  <Input
                    {...field}
                    value={field.value || ""}
                    type="password"
                    placeholder="Optional client secret"
                    isDisabled={isOAuthPending || !!isOAuthAuthorized}
                  />
                </FormControl>
              )}
            />
          </div>

          {isOAuthAuthorized && (
            <div className="flex items-center gap-2 rounded-md border border-green/30 bg-green/10 p-3">
              <FontAwesomeIcon icon={faCheck} className="text-green" />
              <span className="text-sm text-green">
                {isPersonalMode
                  ? "Authorization successful — tools can now be discovered"
                  : "OAuth authorization successful"}
              </span>
            </div>
          )}
          {!isOAuthAuthorized && isOAuthPending && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-primary-500/30 bg-primary-500/10 p-3">
                <FontAwesomeIcon icon={faSpinner} className="animate-spin text-primary-400" />
                <span className="text-sm text-mineshaft-200">
                  Waiting for OAuth authorization...
                </span>
              </div>
              <Button
                onClick={handleCancelOAuth}
                colorSchema="secondary"
                variant="outline"
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          )}
          {!isOAuthAuthorized && !isOAuthPending && (
            <Button
              onClick={handleOAuthAuthorize}
              colorSchema="secondary"
              className="w-full"
              isLoading={initiateOAuth.isPending}
              isDisabled={initiateOAuth.isPending}
            >
              {isPersonalMode ? "Authorize to Discover Tools" : "Authorize with OAuth"}
            </Button>
          )}
        </div>
      )}
    </>
  );
};
