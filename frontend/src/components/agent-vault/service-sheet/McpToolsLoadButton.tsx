import { ReactNode, useEffect, useId, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { RefreshCwIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Item,
  ItemActions,
  ItemContent,
  Spinner
} from "@app/components/v3";
import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";
import {
  TAgentVaultService,
  TCreateAgentVaultOauthAuthorizationDTO
} from "@app/hooks/api/agentVault/types";

import { TMcpToolsOwnCredential } from "./serviceRequest";
import { hostOf, isMemberProvidedOAuthService, TServiceForm } from "./serviceSchema";
import { useOAuthAuthorize } from "./useOAuthAuthorize";

const NOT_SAVED = "Used once to read the tool list. Infisical doesn't save it.";

type Props = {
  accessBundleId: string;
  service?: TAgentVaultService | null;
  label: string;
  isLoading: boolean;
  // Resolves to why the load failed, or null once the list is loaded.
  onLoad: (own: TMcpToolsOwnCredential) => Promise<string | null>;
  onGoToDetails: () => void;
  onGoToOwnApp: (message?: string) => void;
  onSignInChange?: (isSigningIn: boolean) => void;
};

/**
 * Loads the tool list of a service whose members each provide their own credential, with a token or sign-in of the
 * admin's own, entered in a dialog. It goes only to the list call and is never saved.
 */
export const McpToolsLoadButton = ({
  accessBundleId,
  service,
  label,
  isLoading,
  onLoad,
  onGoToDetails,
  onGoToOwnApp,
  onSignInChange
}: Props) => {
  const { control } = useFormContext<TServiceForm>();
  const [credentialType, serverUrl, clientId = "", clientSecret = ""] = useWatch({
    control,
    name: ["credentialType", "serverUrl", "oauthClientId", "oauthClientSecret"]
  });
  const trimmedUrl = serverUrl.trim();
  const host = hostOf(trimmedUrl);
  const isOAuth = credentialType === AgentVaultCredentialType.OAuth;

  const tokenInputId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async (own: TMcpToolsOwnCredential) => {
    setLoadError(null);
    const error = await onLoad(own);
    if (error) {
      setLoadError(error);
      return;
    }
    setToken("");
    setIsOpen(false);
  };

  const { state, isClientRequired, isOAuthAdvertised, authorize, cancel } = useOAuthAuthorize({
    onAuthorized: (authorization) => {
      load({ authorizationId: authorization.id }).catch(() => undefined);
    }
  });
  const isWaiting = state.status === "starting" || state.status === "pending";

  useEffect(() => {
    onSignInChange?.(isWaiting);
  }, [isWaiting, onSignInChange]);
  useEffect(() => () => onSignInChange?.(false), [onSignInChange]);

  const typedClientId = clientId.trim();
  const savedClientId =
    service &&
    isMemberProvidedOAuthService(service) &&
    service.credential.type === AgentVaultCredentialType.OAuth
      ? service.credential.clientId
      : null;
  const isSavedClientKept =
    Boolean(savedClientId) && typedClientId === savedClientId && !clientSecret;
  // The saved secret is sent only for the server the service was saved with, so a new URL needs it typed again.
  const isSecretNeededAgain = isSavedClientKept && service?.serverUrl !== trimmedUrl;

  // A saved admin-entered client signs the admin in the way it signs in a member, since only the server holds its
  // secret. Otherwise the client on the Credential step is the one the save stores, and a refused registration
  // comes back as registrationRequired, which a member's sign-in can't offer.
  const signInParams = (): TCreateAgentVaultOauthAuthorizationDTO => {
    if (service && isSavedClientKept && !isSecretNeededAgain) {
      return { accessBundleId, serverUrl: trimmedUrl, serviceId: service.id, personal: true };
    }
    return {
      accessBundleId,
      serverUrl: trimmedUrl,
      ...(typedClientId ? { clientId: typedClientId, clientSecret: clientSecret || undefined } : {})
    };
  };

  const signIn = () => {
    setLoadError(null);
    authorize(signInParams());
  };

  const loadWithToken = () => {
    if (token && !isLoading) load({ token }).catch(() => undefined);
  };

  const changeOpen = (nextOpen: boolean) => {
    if (!nextOpen) cancel();
    setIsOpen(nextOpen);
    setToken("");
    setLoadError(null);
  };

  const isBusy = isLoading || isWaiting;

  let signInAction: ReactNode;
  if (isLoading) {
    signInAction = (
      <Button type="button" variant="outline" size="sm" isDisabled>
        <Spinner size="xs" variant="av" />
        Loading tools...
      </Button>
    );
  } else if (isWaiting) {
    signInAction = (
      <Button type="button" variant="outline" size="sm" className="shrink-0" isDisabled>
        <Spinner size="xs" variant="av" />
        Waiting for sign-in...
      </Button>
    );
  } else {
    signInAction = (
      <Button type="button" variant="av" size="sm" className="shrink-0" onClick={signIn}>
        {state.status === "failed" || loadError ? "Try Again" : "Sign In"}
      </Button>
    );
  }

  const signInProblem = state.status === "failed" ? state.message : loadError;
  const signInDetail = isWaiting ? "Continue in the window that opened." : NOT_SAVED;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="xs"
        isDisabled={!trimmedUrl}
        onClick={() => changeOpen(true)}
      >
        <RefreshCwIcon />
        {label}
      </Button>

      <Dialog open={isOpen} onOpenChange={changeOpen}>
        <DialogContent isPending={isLoading}>
          <DialogHeader>
            <DialogTitle className="truncate" title={`Load Tools From ${host}`}>
              Load Tools From {host}
            </DialogTitle>
            <DialogDescription>
              {isOAuth
                ? `Sign in with your ${host} account to load the tools you can pick from.`
                : `Enter a token for ${host} to load the tools you can pick from.`}
            </DialogDescription>
          </DialogHeader>

          {isOAuth ? (
            <div className="flex flex-col gap-3">
              <Item variant="outline">
                <ItemContent className="min-w-0">
                  <span className="truncate text-sm text-foreground" title={host}>
                    {host}
                  </span>
                  {signInProblem ? (
                    <span className="text-xs text-danger">{signInProblem}</span>
                  ) : (
                    <span className="text-xs text-muted">{signInDetail}</span>
                  )}
                </ItemContent>
                <ItemActions>{signInAction}</ItemActions>
              </Item>
              {isSecretNeededAgain && !isClientRequired && !isWaiting && (
                <div className="flex flex-col items-start gap-2 text-xs text-muted">
                  The server URL changed, so the saved client secret won&apos;t be sent to it. If
                  your OAuth app has a client secret, enter it again on the Credential step, then
                  load the tools again.
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      changeOpen(false);
                      onGoToOwnApp(
                        "The server URL changed, so the saved client secret won't be sent to it. If your OAuth app has a client secret, enter it again. Then go back to the Tools step and load the tools again."
                      );
                    }}
                  >
                    Go to Credential Step
                  </Button>
                </div>
              )}
              {isClientRequired && !isWaiting && (
                <div className="flex flex-col items-start gap-2 text-xs text-muted">
                  {isOAuthAdvertised ? (
                    <>
                      {host} doesn&apos;t let Infisical register a client for the sign-in. Enter
                      your OAuth app&apos;s client ID on the Credential step, then load the tools
                      again.
                    </>
                  ) : (
                    <>
                      {host} doesn&apos;t look like it uses OAuth. Check the server URL on the
                      Details step. If the server does use OAuth, enter your OAuth app&apos;s client
                      ID on the Credential step, then load the tools again.
                    </>
                  )}
                  <div className="flex gap-2">
                    {!isOAuthAdvertised && (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          changeOpen(false);
                          onGoToDetails();
                        }}
                      >
                        Go to Details Step
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        changeOpen(false);
                        onGoToOwnApp(
                          isOAuthAdvertised
                            ? undefined
                            : `${host} doesn't look like it uses OAuth. If the server does use OAuth, enter your OAuth app's client ID and secret above, then go back to the Tools step and load the tools again.`
                        );
                      }}
                    >
                      Go to Credential Step
                    </Button>
                  </div>
                </div>
              )}
              <DialogFooter>
                {isWaiting ? (
                  <Button type="button" variant="outline" onClick={cancel}>
                    Cancel Sign-In
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    isDisabled={isLoading}
                    onClick={() => changeOpen(false)}
                  >
                    Close
                  </Button>
                )}
              </DialogFooter>
            </div>
          ) : (
            <>
              <Field data-invalid={Boolean(loadError)}>
                <FieldLabel htmlFor={tokenInputId}>Your Token</FieldLabel>
                <FieldContent>
                  <Input
                    id={tokenInputId}
                    type="password"
                    value={token}
                    isError={Boolean(loadError)}
                    onChange={(event) => {
                      setToken(event.target.value);
                      setLoadError(null);
                    }}
                    // A form here would submit the service sheet's form too, since React events cross the portal.
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      loadWithToken();
                    }}
                    maxLength={8192}
                    autoComplete="new-password"
                    spellCheck={false}
                  />
                  <FieldDescription>{NOT_SAVED}</FieldDescription>
                  <FieldError>{loadError}</FieldError>
                </FieldContent>
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  isDisabled={isBusy}
                  onClick={() => changeOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="av"
                  isDisabled={!token || isBusy}
                  isPending={isLoading}
                  onClick={loadWithToken}
                >
                  Load Tools
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
