import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { CheckIcon, CircleAlertIcon, CircleXIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  CopyButton,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner
} from "@app/components/v3";
import {
  ProjectPermissionAgentVaultVariableActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import {
  AgentVaultOauthClientAuthMethod,
  AgentVaultOauthStatus,
  useRefreshAgentVaultVariables
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultOauthVariableSignInStart,
  TAgentVaultVariable
} from "@app/hooks/api/agentVault/types";

import { ClientSecretInput } from "./ClientSecretInput";
import { OAuthAppSelect } from "./OAuthAppSelect";
import {
  applySignInPrefill,
  hasCommaSeparatedScope,
  isOAuthClientSecretRequired,
  isOAuthVariableSignInChanged,
  OAUTH_AUTH_METHOD_LABELS,
  OAUTH_CLIENT_SECRET_REQUIRED_MESSAGE,
  TOAuthVariableFormValues,
  TVariableFormValues
} from "./oauthVariableForm";
import { Scopes, Status } from "./service-sheet/OAuthAuthorizeCard";
import {
  defaultOAuthRedirectUri,
  hostOf,
  OAUTH_STATUS_LABELS
} from "./service-sheet/serviceSchema";
import { useOAuthAuthorize } from "./service-sheet/useOAuthAuthorize";

const ADVANCED_ITEM = "advanced";
const AUTOMATIC_AUTH_METHOD = "automatic";

type TNotice = "registration" | "manual";

type Props = {
  /** The variable as last saved, or null before the first save. */
  variable: TAgentVaultVariable | null;
  /** Validates the form at once, marking each problem on its field, and returns its values or null. */
  getValidValues: () => TVariableFormValues | null;
  /** Saves what the form holds, creating the variable the first time, and returns the saved variable. */
  persist: (values: TVariableFormValues) => Promise<TAgentVaultVariable>;
  projectId: string;
  onSignInChange: (isSigningIn: boolean) => void;
  /** A sign-in finished here, so the variable as last saved is now connected. */
  onAuthorized: () => void;
  /** Hands the sign-in action to the form's footer, which starts it: the window has to open in the same click. */
  registerAuthorize: (authorize: () => void) => void;
  /** Whether a sign-in can start here: the caller may edit variables, the server is set, and no app hosts the callback. */
  onCanAuthorizeChange: (canStart: boolean) => void;
  /** A sign-in started elsewhere that needs more settings before it can go ahead. */
  initialSignInStart?: TAgentVaultOauthVariableSignInStart | null;
};

export const OAuthVariableFields = ({
  variable,
  getValidValues,
  persist,
  projectId,
  onSignInChange,
  onAuthorized,
  registerAuthorize,
  onCanAuthorizeChange,
  initialSignInStart
}: Props) => {
  const {
    control,
    register,
    setValue,
    getValues,
    resetField,
    setError,
    formState: { errors }
  } = useFormContext<TVariableFormValues>();
  const formValues = useWatch({ control }) as TVariableFormValues;
  const { serverUrl, authorizationEndpoint, tokenEndpoint, redirectUri } = formValues;
  const { permission } = useProjectPermission();
  // Starting a sign-in writes the variable's tokens, which the API allows only to whoever can edit variables.
  const canAuthorize = permission.can(
    ProjectPermissionAgentVaultVariableActions.Edit,
    ProjectPermissionSub.AgentVaultVariables
  );
  const ids = {
    serverUrl: useId(),
    scopes: useId(),
    clientId: useId(),
    clientSecret: useId(),
    redirect: useId(),
    authorizationEndpoint: useId(),
    tokenEndpoint: useId(),
    issuer: useId(),
    authMethod: useId(),
    clientName: useId(),
    customRedirect: useId()
  };

  const [isOwnAppChosen, setIsOwnApp] = useState(() => Boolean(getValues("clientId")));
  // Endpoints set by hand need a client ID, so its field shows as soon as one is typed, and stays once it was.
  const hasManualEndpoint = Boolean(authorizationEndpoint.trim() || tokenEndpoint.trim());
  const isOwnApp = isOwnAppChosen || hasManualEndpoint;
  useEffect(() => {
    if (hasManualEndpoint) setIsOwnApp(true);
  }, [hasManualEndpoint]);
  const [openItem, setOpenItem] = useState(() => {
    const values = getValues();
    return values.authorizationEndpoint ||
      values.tokenEndpoint ||
      values.redirectUri ||
      values.tokenEndpointAuthMethod
      ? ADVANCED_ITEM
      : "";
  });
  // Its fields unmount while it is closed, so an error on one would otherwise never show.
  const {
    authorizationEndpoint: authorizationEndpointError,
    tokenEndpoint: tokenEndpointError,
    issuer: issuerError,
    tokenEndpointAuthMethod: authMethodError,
    clientName: clientNameError,
    redirectUri: redirectUriError
  } = errors;
  useEffect(() => {
    if (
      authorizationEndpointError ||
      tokenEndpointError ||
      issuerError ||
      authMethodError ||
      clientNameError ||
      redirectUriError
    ) {
      setOpenItem(ADVANCED_ITEM);
    }
  }, [
    authorizationEndpointError,
    tokenEndpointError,
    issuerError,
    authMethodError,
    clientNameError,
    redirectUriError
  ]);
  const [notice, setNotice] = useState<TNotice | null>(null);
  const [authorizedScopes, setAuthorizedScopes] = useState<string[] | null>(null);
  const sentSecretRef = useRef("");
  const refreshVariables = useRefreshAgentVaultVariables(projectId);

  const {
    state,
    redirectUri: startRedirectUri,
    authorizeVariable,
    cancel
  } = useOAuthAuthorize({
    onAuthorized: (authorization) => {
      setNotice(null);
      setAuthorizedScopes(authorization.scopes);
      // The sign-in saved the secret it was sent, so the field goes back to keeping the saved one.
      if (sentSecretRef.current && getValues("clientSecret") === sentSecretRef.current) {
        resetField("clientSecret", { defaultValue: "" });
      }
      onAuthorized();
      refreshVariables();
    }
  });
  const isWaiting = state.status === "starting" || state.status === "pending";

  useEffect(() => {
    onSignInChange(isWaiting);
  }, [isWaiting, onSignInChange]);
  useEffect(() => () => onSignInChange(false), [onSignInChange]);

  const applyNotReady = (start: TAgentVaultOauthVariableSignInStart) => {
    if (start.manualSetupRequired) {
      if (start.prefill) {
        Object.entries(applySignInPrefill(getValues(), start.prefill)).forEach(([field, value]) =>
          setValue(field as keyof TOAuthVariableFormValues, value, { shouldDirty: true })
        );
      }
      setIsOwnApp(true);
      setOpenItem(ADVANCED_ITEM);
      setNotice("manual");
      return;
    }
    if (start.registrationRequired) {
      setIsOwnApp(true);
      setNotice("registration");
    }
  };

  // Applied once, on open: the answer belongs to the sign-in that opened the dialog.
  const initialStartRef = useRef(initialSignInStart);
  useEffect(() => {
    if (initialStartRef.current) applyNotReady(initialStartRef.current);
  }, []);

  // Checked here rather than on submit: the sign-in window has to open synchronously in this click.
  const handleAuthorize = () => {
    const values = getValidValues();
    if (!values) return;
    if (variable?.oauth && isOAuthClientSecretRequired(variable.oauth, values)) {
      setError(
        "clientSecret",
        { message: OAUTH_CLIENT_SECRET_REQUIRED_MESSAGE },
        { shouldFocus: true }
      );
      return;
    }
    setAuthorizedScopes(null);
    const clientSecret = values.clientId.trim() ? values.clientSecret : "";
    sentSecretRef.current = clientSecret;
    authorizeVariable(async () => {
      const saved = await persist(values);
      return { variableId: saved.id, ...(clientSecret ? { clientSecret } : {}) };
    }, applyNotReady);
  };

  useEffect(() => {
    registerAuthorize(handleAuthorize);
  });

  const switchToOwnApp = () => setIsOwnApp(true);
  const switchToAutomaticSetup = () => {
    setIsOwnApp(false);
    setValue("clientId", "", { shouldDirty: true });
    setValue("clientSecret", "", { shouldDirty: true });
    setValue("tokenEndpointAuthMethod", "", { shouldDirty: true });
  };

  const host = hostOf(serverUrl.trim() || authorizationEndpoint.trim());
  const oauth = variable?.oauth ?? null;
  const connection = oauth?.connection ?? null;
  // A sign-in from here would return to the app that hosts the callback, not to Infisical.
  const isAppRedirect = Boolean(redirectUri.trim());
  const canStartSignIn =
    canAuthorize && !isAppRedirect && Boolean(serverUrl.trim() || authorizationEndpoint.trim());
  useEffect(() => {
    onCanAuthorizeChange(canStartSignIn);
  }, [canStartSignIn, onCanAuthorizeChange]);
  // The API takes a client secret only with a sign-in, which can't start here for an app's redirect URI.
  const typedSecret = formValues.clientSecret;
  useEffect(() => {
    if (isAppRedirect && typedSecret) setValue("clientSecret", "", { shouldDirty: true });
  }, [isAppRedirect, typedSecret, setValue]);
  const registerUri = redirectUri.trim() || startRedirectUri || defaultOAuthRedirectUri();
  const hasStoredSecret =
    Boolean(oauth?.clientId) &&
    (authorizedScopes !== null || oauth?.status !== AgentVaultOauthStatus.NotConnected) &&
    !(oauth && isOAuthVariableSignInChanged(oauth, formValues));

  const renderStatus = (): { head: ReactNode; details?: ReactNode } | null => {
    if (state.status === "failed") {
      return {
        head: (
          <Status icon={<CircleXIcon />} tone="danger" title="Couldn't Authorize">
            {state.message}
          </Status>
        )
      };
    }
    if (authorizedScopes !== null) {
      return {
        head: <Status icon={<CheckIcon />} title={connection ? "Reauthorized" : "Authorized"} />,
        details: <Scopes granted={authorizedScopes} requested={[]} />
      };
    }
    if (!oauth || !connection) return null;
    const requested = connection.requiredScopes.filter(
      (scope) => !connection.grantedScopes.includes(scope)
    );
    let head: ReactNode;
    if (oauth.status === AgentVaultOauthStatus.NeedsReauthorization) {
      head = (
        <Status
          icon={<CircleXIcon />}
          tone="danger"
          title={OAUTH_STATUS_LABELS[AgentVaultOauthStatus.NeedsReauthorization]}
        >
          {connection.lastError ?? `${host} no longer accepts this authorization.`}
        </Status>
      );
    } else if (oauth.status === AgentVaultOauthStatus.NeedsAdditionalScopes) {
      head = (
        <Status
          icon={<CircleAlertIcon />}
          tone="warning"
          title={OAUTH_STATUS_LABELS[AgentVaultOauthStatus.NeedsAdditionalScopes]}
        >
          An agent requested scopes that aren&apos;t granted yet. Reauthorize to add them.
        </Status>
      );
    } else {
      head = (
        <Status icon={<CheckIcon />} title={OAUTH_STATUS_LABELS[AgentVaultOauthStatus.Connected]} />
      );
    }
    return {
      head,
      details: <Scopes granted={connection.grantedScopes} requested={requested} />
    };
  };

  let authorizeAction: ReactNode = null;
  if (isWaiting) {
    authorizeAction = (
      <div className="flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" size="sm" isDisabled>
          <Spinner size="xs" className="m-0 shrink-0" variant="av" />
          Waiting for sign-in...
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancel}>
          Cancel
        </Button>
      </div>
    );
  } else if (isAppRedirect) {
    authorizeAction = (
      <span className="max-w-xs shrink-0 text-right text-xs text-muted">
        Sign in from your app. Its redirect URI finishes the sign-in there.
      </span>
    );
  }

  const status = renderStatus();

  return (
    <>
      <Field>
        <FieldLabel htmlFor={ids.serverUrl}>Server URL</FieldLabel>
        <FieldContent>
          <Input
            {...register("serverUrl")}
            id={ids.serverUrl}
            placeholder="https://mcp.example.com/mcp"
            autoComplete="off"
            spellCheck={false}
            isError={Boolean(errors.serverUrl)}
          />
          <FieldDescription>
            The server to sign in to. Infisical finds its sign-in endpoints from it.
          </FieldDescription>
          <FieldError>{errors.serverUrl?.message}</FieldError>
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel htmlFor={ids.scopes}>Scopes (optional)</FieldLabel>
        <FieldContent>
          <Input
            {...register("scopes")}
            id={ids.scopes}
            placeholder="read write"
            autoComplete="off"
            spellCheck={false}
            isError={Boolean(errors.scopes)}
          />
          {hasCommaSeparatedScope(formValues.scopes) ? (
            <FieldDescription className="text-warning">
              Separate scopes with spaces.
            </FieldDescription>
          ) : (
            <FieldDescription>
              Separate scopes with spaces. Leave empty to use the server&apos;s or provider&apos;s
              default scopes.
            </FieldDescription>
          )}
          <FieldError>{errors.scopes?.message}</FieldError>
        </FieldContent>
      </Field>

      {!isWaiting && (
        <OAuthAppSelect
          isOwnApp={isOwnApp}
          onChange={(own) => (own ? switchToOwnApp() : switchToAutomaticSetup())}
          isAutomaticDisabled={hasManualEndpoint}
        />
      )}

      {isOwnApp && (
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={ids.redirect}>Redirect URI</FieldLabel>
            <FieldContent>
              <InputGroup>
                <InputGroupInput id={ids.redirect} readOnly value={registerUri} />
                <InputGroupAddon align="inline-end">
                  <CopyButton value={registerUri} ariaLabel="Copy redirect URI" />
                </InputGroupAddon>
              </InputGroup>
              <FieldDescription>Add this as a redirect URI in your OAuth app.</FieldDescription>
            </FieldContent>
          </Field>
          <div className="flex flex-col gap-4 md:flex-row md:gap-3">
            <Field className="flex-1">
              <FieldLabel htmlFor={ids.clientId}>Client ID</FieldLabel>
              <FieldContent>
                <Input
                  {...register("clientId")}
                  id={ids.clientId}
                  maxLength={2048}
                  autoComplete="off"
                  spellCheck={false}
                  isError={Boolean(errors.clientId)}
                />
                <FieldError>{errors.clientId?.message}</FieldError>
              </FieldContent>
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor={ids.clientSecret}>Client Secret (optional)</FieldLabel>
              <FieldContent>
                {isAppRedirect ? (
                  <>
                    <Input id={ids.clientSecret} type="password" value="" disabled readOnly />
                    <FieldDescription>
                      Send the client secret when you start the sign-in through the API.
                    </FieldDescription>
                  </>
                ) : (
                  <Controller
                    control={control}
                    name="clientSecret"
                    render={({ field }) => (
                      <ClientSecretInput
                        {...field}
                        id={ids.clientSecret}
                        maxLength={4096}
                        placeholder={
                          hasStoredSecret ? "Leave blank to keep the saved secret" : undefined
                        }
                        isError={Boolean(errors.clientSecret)}
                      />
                    )}
                  />
                )}
                <FieldError>{errors.clientSecret?.message}</FieldError>
              </FieldContent>
            </Field>
          </div>
        </div>
      )}

      <Accordion
        type="single"
        collapsible
        variant="ghost"
        value={openItem}
        onValueChange={setOpenItem}
      >
        <AccordionItem value={ADVANCED_ITEM}>
          <AccordionTrigger>Advanced Options</AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4">
              <p className="text-xs text-muted">
                Set the authorization and token URLs only for a server Infisical can&apos;t
                discover. Both are then required, with a client ID and at least one scope.
              </p>
              <Field>
                <FieldLabel htmlFor={ids.authorizationEndpoint}>Authorization URL</FieldLabel>
                <FieldContent>
                  <Input
                    {...register("authorizationEndpoint")}
                    id={ids.authorizationEndpoint}
                    placeholder="https://auth.example.com/authorize"
                    autoComplete="off"
                    spellCheck={false}
                    isError={Boolean(errors.authorizationEndpoint)}
                  />
                  <FieldError>{errors.authorizationEndpoint?.message}</FieldError>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.tokenEndpoint}>Token URL</FieldLabel>
                <FieldContent>
                  <Input
                    {...register("tokenEndpoint")}
                    id={ids.tokenEndpoint}
                    placeholder="https://auth.example.com/token"
                    autoComplete="off"
                    spellCheck={false}
                    isError={Boolean(errors.tokenEndpoint)}
                  />
                  <FieldError>{errors.tokenEndpoint?.message}</FieldError>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.issuer}>Issuer (optional)</FieldLabel>
                <FieldContent>
                  <Input
                    {...register("issuer")}
                    id={ids.issuer}
                    placeholder="https://auth.example.com"
                    autoComplete="off"
                    spellCheck={false}
                    isError={Boolean(errors.issuer)}
                  />
                  <FieldDescription>
                    Defaults to the authorization URL&apos;s origin.
                  </FieldDescription>
                  <FieldError>{errors.issuer?.message}</FieldError>
                </FieldContent>
              </Field>
              {isOwnApp ? (
                <Controller
                  control={control}
                  name="tokenEndpointAuthMethod"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel id={ids.authMethod}>Token Auth Method</FieldLabel>
                      <FieldContent>
                        <Select
                          value={field.value || AUTOMATIC_AUTH_METHOD}
                          onValueChange={(value) =>
                            field.onChange(value === AUTOMATIC_AUTH_METHOD ? "" : value)
                          }
                        >
                          <SelectTrigger aria-labelledby={ids.authMethod} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent position="popper">
                            <SelectItem value={AUTOMATIC_AUTH_METHOD}>Automatic</SelectItem>
                            {Object.values(AgentVaultOauthClientAuthMethod).map((method) => (
                              <SelectItem key={method} value={method}>
                                {OAUTH_AUTH_METHOD_LABELS[method]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          How the client authenticates to the token URL.
                        </FieldDescription>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
              ) : (
                <Field>
                  <FieldLabel htmlFor={ids.clientName}>Client Name (optional)</FieldLabel>
                  <FieldContent>
                    <Input
                      {...register("clientName")}
                      id={ids.clientName}
                      maxLength={128}
                      autoComplete="off"
                      isError={Boolean(errors.clientName)}
                    />
                    <FieldDescription>
                      The name the server shows when it asks to approve the sign-in. Defaults to the
                      project&apos;s name.
                    </FieldDescription>
                    <FieldError>{errors.clientName?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor={ids.customRedirect}>Custom Redirect URI (optional)</FieldLabel>
                <FieldContent>
                  <Input
                    {...register("redirectUri")}
                    id={ids.customRedirect}
                    placeholder="https://app.example.com/oauth/callback"
                    autoComplete="off"
                    spellCheck={false}
                    isError={Boolean(errors.redirectUri)}
                  />
                  <FieldDescription>
                    Only for a sign-in your own app finishes. It can&apos;t then be started from
                    here.
                  </FieldDescription>
                  <FieldError>{errors.redirectUri?.message}</FieldError>
                </FieldContent>
              </Field>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Field>
        <FieldLabel>Authorization</FieldLabel>
        <FieldContent>
          <div className="flex flex-col gap-3">
            {notice === "registration" && !isWaiting && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertTitle>{host} needs your own OAuth app</AlertTitle>
                <AlertDescription>
                  It doesn&apos;t let Infisical register a client. Enter your OAuth app&apos;s
                  client ID and secret, then authorize again.
                </AlertDescription>
              </Alert>
            )}
            {notice === "manual" && !isWaiting && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertTitle>Check {host}&apos;s sign-in endpoints</AlertTitle>
                <AlertDescription>
                  Infisical couldn&apos;t confirm them, so they are filled in under Advanced Options
                  for you to check. Enter your OAuth app&apos;s client ID, then authorize again.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {status ? (
                  <>
                    {status.head}
                    {status.details && <div className="pl-5">{status.details}</div>}
                  </>
                ) : (
                  <Status title={OAUTH_STATUS_LABELS[AgentVaultOauthStatus.NotConnected]}>
                    {isWaiting
                      ? "Continue in the window that opened."
                      : "Services that use it can't connect until it is authorized."}
                  </Status>
                )}
                {connection?.lastError &&
                  oauth?.status === AgentVaultOauthStatus.NeedsAdditionalScopes &&
                  authorizedScopes === null && (
                    <span className="flex items-center gap-1.5 pl-5 text-xs text-muted">
                      <InfoIcon className="size-3 shrink-0" />
                      {connection.lastError}
                    </span>
                  )}
              </div>
              {authorizeAction}
            </div>
          </div>
        </FieldContent>
      </Field>
    </>
  );
};
