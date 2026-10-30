import { Fragment, ReactNode, useEffect, useId, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { CheckIcon, CircleAlertIcon, CircleXIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
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
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { AgentVaultOauthStatus } from "@app/hooks/api/agentVault";
import { TAgentVaultService } from "@app/hooks/api/agentVault/types";

import {
  newOAuthAuthorizationId,
  OAUTH_STATUS_LABELS,
  oauthClientIdSchema,
  oauthClientSecretSchema,
  storedOAuthCredential,
  TServiceForm
} from "./serviceSchema";
import { useOAuthAuthorize } from "./useOAuthAuthorize";

const CALLBACK_PATH = "/agent-vault/oauth/callback";

const hostOf = (serverUrl: string) => {
  try {
    return new URL(serverUrl).host;
  } catch {
    return "the server";
  }
};

const OAUTH_STATUS_VARIANTS = {
  [AgentVaultOauthStatus.Connected]: "success",
  [AgentVaultOauthStatus.NeedsReauthorization]: "danger",
  [AgentVaultOauthStatus.NeedsAdditionalScopes]: "warning"
} as const;

export const OAuthStatusBadge = ({ status }: { status: AgentVaultOauthStatus }) => (
  <Badge variant={OAUTH_STATUS_VARIANTS[status]}>
    {status === AgentVaultOauthStatus.Connected ? <CheckIcon /> : <CircleAlertIcon />}
    {OAUTH_STATUS_LABELS[status]}
  </Badge>
);

const TONE_CLASS = { danger: "[&>svg]:text-danger", warning: "[&>svg]:text-warning" } as const;

const Status = ({
  icon,
  tone,
  title,
  children
}: {
  icon?: ReactNode;
  tone?: "warning" | "danger";
  title: ReactNode;
  children?: ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-0.5">
    <span
      className={twMerge(
        "flex items-center gap-1.5 text-sm text-foreground [&>svg]:size-3.5 [&>svg]:shrink-0",
        tone && TONE_CLASS[tone]
      )}
    >
      {icon}
      {title}
    </span>
    {children && <span className="text-xs text-muted">{children}</span>}
  </div>
);

const SCOPE_PREVIEW = 10;

const ScopeValues = ({ scopes, className }: { scopes: string[]; className?: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const shown = isExpanded ? scopes : scopes.slice(0, SCOPE_PREVIEW);
  const hidden = scopes.length - shown.length;
  return (
    <span className={twMerge("min-w-0", className)}>
      {shown.map((scope, index) => (
        <Fragment key={scope}>
          <span className="whitespace-nowrap">{scope}</span>
          {index < shown.length - 1 ? ", " : ""}
        </Fragment>
      ))}
      {hidden > 0 && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="ml-1.5 align-baseline text-xs"
          onClick={() => setIsExpanded(true)}
        >
          +{hidden} more
        </Button>
      )}
    </span>
  );
};

const Scopes = ({ granted, requested }: { granted: string[]; requested: string[] }) => (
  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
    <span className="text-muted">Scopes</span>
    {granted.length ? <ScopeValues scopes={granted} /> : <span className="text-muted">None</span>}
    {requested.length > 0 && (
      <>
        <span className="text-muted">Requested</span>
        <ScopeValues scopes={requested} className="text-warning" />
      </>
    )}
  </div>
);

type Props = {
  accessBundleId: string;
  service?: TAgentVaultService | null;
  onSignInChange?: (isSigningIn: boolean) => void;
};

export const OAuthAuthorizeCard = ({ accessBundleId, service, onSignInChange }: Props) => {
  const {
    control,
    register,
    setValue,
    setError,
    clearErrors,
    getValues,
    formState: { errors }
  } = useFormContext<TServiceForm>();
  const [
    serverUrl,
    authorizationId,
    authorizedUrl,
    scopes,
    clientId = "",
    clientSecret = "",
    rejection = "",
    isAutomaticSetupChosen = false
  ] = useWatch({
    control,
    name: [
      "serverUrl",
      "oauthAuthorizationId",
      "oauthAuthorizedUrl",
      "oauthScopes",
      "oauthClientId",
      "oauthClientSecret",
      "oauthAuthorizationRejection",
      "oauthAutomaticSetup"
    ]
  });
  const clientIdInputId = useId();
  const clientSecretInputId = useId();
  const redirectUriInputId = useId();
  // The client fields keep their values across remounts (Back, or Bearer then OAuth), and the schema checks them.
  const [isUsingOwnApp, setIsUsingOwnApp] = useState(() =>
    Boolean(getValues("oauthClientId") || getValues("oauthClientSecret"))
  );

  const trimmedUrl = serverUrl.trim();
  const host = hostOf(trimmedUrl);
  const isNewlyAuthorized = Boolean(
    newOAuthAuthorizationId({
      serverUrl,
      oauthAuthorizationId: authorizationId,
      oauthAuthorizedUrl: authorizedUrl
    })
  );
  const stored = storedOAuthCredential(service, serverUrl);

  const { state, isClientRequired, isOAuthAdvertised, redirectUri, authorize, cancel } =
    useOAuthAuthorize({
      onAuthorized: (authorization) => {
        setValue("oauthAuthorizationRejection", "");
        setValue("oauthAuthorizedUrl", trimmedUrl, { shouldDirty: true });
        setValue("oauthScopes", authorization.scopes, { shouldDirty: true });
        setValue("oauthAuthorizationId", authorization.id, {
          shouldDirty: true,
          shouldValidate: true
        });
      }
    });

  const isWaiting = state.status === "starting" || state.status === "pending";

  // Leaving the step unmounts this card, which stops the poll and drops a sign-in still in progress, so the sheet
  // holds navigation until it finishes or is cancelled.
  useEffect(() => {
    onSignInChange?.(isWaiting);
  }, [isWaiting, onSignInChange]);
  useEffect(() => () => onSignInChange?.(false), [onSignInChange]);
  const wantsOwnApp = isClientRequired || isUsingOwnApp;
  const isOwnApp = wantsOwnApp && !isNewlyAuthorized;
  const hasAuthorization = isNewlyAuthorized || Boolean(stored);

  const switchToOwnApp = () => {
    setIsUsingOwnApp(true);
    setValue("oauthAutomaticSetup", false);
  };

  const switchToAutomaticSetup = () => {
    setIsUsingOwnApp(false);
    setValue("oauthAutomaticSetup", true);
    setValue("oauthClientId", "");
    setValue("oauthClientSecret", "");
  };

  // Checked here rather than left to the form: the form validates on save, and the popup has to open
  // synchronously in this click.
  const handleAuthorize = () => {
    if (wantsOwnApp) {
      const problems = (
        [
          ["oauthClientId", oauthClientIdSchema.safeParse(clientId)],
          ["oauthClientSecret", oauthClientSecretSchema.safeParse(clientSecret)]
        ] as const
      ).flatMap(([name, result]) =>
        result.success ? [] : [[name, result.error.issues[0].message] as const]
      );
      clearErrors(["oauthClientId", "oauthClientSecret"]);
      if (problems.length) {
        problems.forEach(([name, message]) => setError(name, { message }));
        return;
      }
    }
    // A failed or cancelled replacement must not leave the previous sign-in in the form to be saved.
    setValue("oauthAuthorizationId", "");
    authorize({
      accessBundleId,
      serverUrl: trimmedUrl,
      ...(service ? { serviceId: service.id } : {}),
      ...(wantsOwnApp
        ? { clientId: clientId.trim(), clientSecret: clientSecret || undefined }
        : {}),
      // Without it, reauthorizing a service that uses its own OAuth app signs in with that app again.
      ...(!wantsOwnApp && isAutomaticSetupChosen ? { registration: "dynamic" as const } : {})
    });
  };

  const requested = stored
    ? stored.requiredScopes.filter((scope) => !stored.grantedScopes.includes(scope))
    : [];

  const isProblem =
    state.status === "failed" ||
    (stored && stored.status !== AgentVaultOauthStatus.Connected && !isNewlyAuthorized);

  let authorizeLabel = "Authorize";
  if (state.status === "failed") authorizeLabel = "Try Again";
  else if (hasAuthorization) authorizeLabel = "Reauthorize";

  const authorizeButton = isWaiting ? (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" isDisabled>
        <Spinner size="xs" className="m-0 shrink-0 fill-product-av" />
        Waiting for sign-in...
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={cancel}>
        Cancel
      </Button>
    </div>
  ) : (
    <Button
      type="button"
      variant={hasAuthorization && !isProblem ? "outline" : "av"}
      size="sm"
      className="shrink-0"
      onClick={handleAuthorize}
      isDisabled={!trimmedUrl || (wantsOwnApp && !clientId.trim())}
    >
      {authorizeLabel}
    </Button>
  );

  const renderStatus = (): { head: ReactNode; details?: ReactNode } | null => {
    if (state.status === "failed") {
      return {
        head: (
          <Status icon={<CircleXIcon />} tone="danger" title="Couldn't Authorize">
            {state.message}
          </Status>
        ),
        details: stored ? (
          <Scopes granted={stored.grantedScopes} requested={requested} />
        ) : undefined
      };
    }

    if (isNewlyAuthorized) {
      return {
        head: <Status icon={<CheckIcon />} title={stored ? "Reauthorized" : "Authorized"} />,
        details: <Scopes granted={scopes} requested={[]} />
      };
    }

    if (!stored) return null;

    let head: ReactNode;
    if (stored.status === AgentVaultOauthStatus.NeedsReauthorization) {
      head = (
        <Status
          icon={<CircleXIcon />}
          tone="danger"
          title={OAUTH_STATUS_LABELS[AgentVaultOauthStatus.NeedsReauthorization]}
        >
          {host} no longer accepts this authorization.
        </Status>
      );
    } else if (stored.status === AgentVaultOauthStatus.NeedsAdditionalScopes) {
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
      details: (
        <div className="flex flex-col gap-2">
          {stored.lastError && stored.status !== AgentVaultOauthStatus.NeedsReauthorization && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                  tabIndex={0}
                  className={twMerge(
                    "flex w-fit items-center gap-1.5 text-xs",
                    // Under a yellow status, Reauthorize already fixes this, so it shouldn't compete with it.
                    stored.status === AgentVaultOauthStatus.NeedsAdditionalScopes
                      ? "text-muted"
                      : "text-danger"
                  )}
                >
                  <InfoIcon className="size-3 shrink-0" />
                  The last token refresh failed.
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">{stored.lastError}</TooltipContent>
            </Tooltip>
          )}
          <Scopes granted={stored.grantedScopes} requested={requested} />
        </div>
      )
    };
  };

  const status = renderStatus();

  return (
    <Field>
      <FieldLabel>Authorization</FieldLabel>
      <FieldContent>
        <div className="flex flex-col gap-3">
          {status ? (
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {status.head}
                {/* Indented to the status text, past its icon, so the details read as part of it. */}
                {status.details && <div className="pl-5">{status.details}</div>}
              </div>
              {!isOwnApp && authorizeButton}
            </div>
          ) : (
            !isOwnApp && <div>{authorizeButton}</div>
          )}

          {isOwnApp && (
            <div className="flex flex-col gap-4">
              {isClientRequired && !isOAuthAdvertised && (
                <Alert variant="warning">
                  <TriangleAlertIcon />
                  <AlertTitle>{host} doesn&apos;t look like it uses OAuth</AlertTitle>
                  <AlertDescription>
                    It answered, but sent no OAuth challenge and serves no OAuth metadata. Check the
                    server URL. If the server does use OAuth, enter your OAuth app&apos;s client ID
                    and secret below.
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor={redirectUriInputId}>Redirect URI</FieldLabel>
                <FieldContent>
                  <InputGroup>
                    <InputGroupInput
                      id={redirectUriInputId}
                      readOnly
                      value={redirectUri ?? `${window.location.origin}${CALLBACK_PATH}`}
                    />
                    <InputGroupAddon align="inline-end">
                      <CopyButton
                        value={redirectUri ?? `${window.location.origin}${CALLBACK_PATH}`}
                        ariaLabel="Copy redirect URI"
                      />
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>Add this as a redirect URI in your OAuth app.</FieldDescription>
                </FieldContent>
              </Field>
              <div className="flex flex-col gap-4 md:flex-row md:gap-3">
                <Field className="flex-1">
                  <FieldLabel htmlFor={clientIdInputId}>Client ID</FieldLabel>
                  <FieldContent>
                    <Input
                      {...register("oauthClientId")}
                      id={clientIdInputId}
                      maxLength={2048}
                      autoComplete="off"
                      spellCheck={false}
                      isError={Boolean(errors.oauthClientId)}
                    />
                    <FieldError>{errors.oauthClientId?.message}</FieldError>
                  </FieldContent>
                </Field>
                <Field className="flex-1">
                  <FieldLabel htmlFor={clientSecretInputId}>Client Secret (optional)</FieldLabel>
                  <FieldContent>
                    <Input
                      type="password"
                      {...register("oauthClientSecret")}
                      id={clientSecretInputId}
                      maxLength={4096}
                      autoComplete="new-password"
                      isError={Boolean(errors.oauthClientSecret)}
                    />
                    <FieldError>{errors.oauthClientSecret?.message}</FieldError>
                  </FieldContent>
                </Field>
              </div>
              <div>{authorizeButton}</div>
            </div>
          )}

          {!isClientRequired && !isNewlyAuthorized && !isWaiting && (
            <div>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={isUsingOwnApp ? switchToAutomaticSetup : switchToOwnApp}
              >
                {isUsingOwnApp ? "Use automatic setup" : "Use your own OAuth app"}
              </Button>
            </div>
          )}
        </div>
        <FieldError>{errors.oauthAuthorizationId?.message}</FieldError>
        {rejection && stored && !isWaiting && (
          <div>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => {
                setValue("oauthAuthorizationRejection", "");
                clearErrors("oauthAuthorizationId");
              }}
            >
              Keep Current Login
            </Button>
          </div>
        )}
      </FieldContent>
    </Field>
  );
};
