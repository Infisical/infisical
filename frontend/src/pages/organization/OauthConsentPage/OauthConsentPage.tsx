import { useState } from "react";
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { addSeconds, formatISO } from "date-fns";
import {
  ArrowLeftRightIcon,
  CheckCircle2,
  CheckIcon,
  Loader2,
  TriangleAlertIcon,
  XIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertDescription,
  AnimatedCollapse,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  OrgIcon,
  RadioGroup,
  Skeleton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { SessionStorageKeys } from "@app/const";
import { useUser } from "@app/context";
import { useGetOauthAuthorizeInfo, useOauthConsent } from "@app/hooks/api";
import {
  TOrgWithSubOrgs,
  useGetOrganizationById,
  useGetOrganizationsWithSubOrgs
} from "@app/hooks/api/organization/queries";
import { getSsoEnforcementError } from "@app/pages/auth/SelectOrgPage/SelectOrg.utils";

// The user picks one access level per product rather than individual scopes. A level is offered when the application
// asked for the scope it is named by (`requires`), and only scopes the application asked for are ever granted.
const PRODUCT_ACCESS = [
  {
    key: "secrets-management",
    product: "Secrets Management",
    levels: [
      {
        level: "describe",
        title: "Describe Only",
        dotClassName: "bg-neutral",
        requires: "secrets:describe",
        scopes: ["secrets:describe"],
        description:
          "See projects, environments, folders, and metadata about secrets. Secret values are never readable."
      },
      {
        level: "read",
        title: "Read Only",
        dotClassName: "bg-info",
        requires: "secrets:read",
        scopes: ["secrets:read"],
        description:
          "Everything in Describe Only, plus the ability to read secrets, including their values."
      },
      {
        level: "full",
        title: "Full Access",
        dotClassName: "bg-warning",
        requires: "secrets:write",
        scopes: ["secrets:describe", "secrets:read", "secrets:write"],
        description:
          "Everything in Read Only, plus create, change and delete secrets, create folders, and create projects."
      }
    ],
    // A capability is granted when any one of its scopes is. The MCP tools accept read in place of describe.
    capabilities: [
      {
        label: "List projects, environments and folders",
        anyOf: ["secrets:describe", "secrets:read"]
      },
      { label: "See secret keys and metadata", anyOf: ["secrets:describe", "secrets:read"] },
      { label: "Read secret values", anyOf: ["secrets:read"], isSensitive: true },
      { label: "Create and change secrets", anyOf: ["secrets:write"] },
      { label: "Delete secrets", anyOf: ["secrets:write"] },
      { label: "Create folders and projects", anyOf: ["secrets:write"] }
    ]
  }
];

// Preselected when offered, least access first: reading secret values and writes are opted into.
const DEFAULT_LEVEL_ORDER = ["describe", "read", "full"];

// Long enough to pick an organization and pass its MFA or SSO before returning here.
const ORG_SWITCH_RETURN_TTL_SECONDS = 300;

export const OauthConsentPage = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [accessLevels, setAccessLevels] = useState<Record<string, string>>({});

  const navigate = useNavigate();
  const { user } = useUser();

  const search = useSearch({
    from: "/_authenticate/organization/oauth-consent"
  });

  const organizationId = useRouteContext({
    from: "/_authenticate",
    select: (el) => el.organizationId
  });

  const {
    data: authorizeInfo,
    isPending: isInfoPending,
    error: authorizeInfoError
  } = useGetOauthAuthorizeInfo(
    search.client_id,
    search.redirect_uri,
    search.scope,
    search.resource
  );

  // A public client is granted the organization the user is signed in to, so name it. A registered client is granted
  // the organization it belongs to, which this page does not know.
  const isPublicClient = Boolean(authorizeInfo?.publicClientHost);
  const { data: organization, isPending: isOrganizationPending } = useGetOrganizationById(
    organizationId ?? "",
    { enabled: isPublicClient && Boolean(organizationId) }
  );
  // The backend refuses consent for a public client from a sub-organization session, so the switcher offers only
  // parent organizations, and a request opened from a sub-organization must switch before it can be authorized.
  const isSubOrganizationSession =
    isPublicClient &&
    Boolean(organization?.rootOrgId) &&
    organization?.id !== organization?.rootOrgId;
  const { data: userOrganizations } = useGetOrganizationsWithSubOrgs();
  const switchableOrganizations = (userOrganizations ?? []).filter(
    ({ id }) => id !== organizationId
  );
  const canSwitchOrganization = isPublicClient && switchableOrganizations.length > 0;
  const requestedScopes = (authorizeInfo?.requestedScopes ?? []).map(({ scope }) => scope);
  const requestedProducts = PRODUCT_ACCESS.map((productAccess) => ({
    ...productAccess,
    levels: productAccess.levels.filter(({ requires }) => requestedScopes.includes(requires))
  })).filter(({ levels }) => levels.length > 0);
  const getAccessLevel = ({ key, levels }: (typeof requestedProducts)[number]) =>
    accessLevels[key] ??
    DEFAULT_LEVEL_ORDER.find((level) => levels.some((offered) => offered.level === level)) ??
    levels[0].level;
  const getGrantedScopes = (productAccess: (typeof requestedProducts)[number]) =>
    (
      productAccess.levels.find(({ level }) => level === getAccessLevel(productAccess))?.scopes ??
      []
    ).filter((scope) => requestedScopes.includes(scope));
  const grantedScopes = requestedProducts.flatMap(getGrantedScopes);
  const isNothingGranted = requestedScopes.length > 0 && grantedScopes.length === 0;

  const isGrantingSecretValues = isPublicClient && grantedScopes.includes("secrets:read");

  const { mutateAsync: consentOauth, isPending: isConsenting } = useOauthConsent();

  // The backend validates client + redirect URI when fetching authorize info. Until that
  // succeeds we must not trust the redirect_uri from the URL (otherwise Deny is an open redirect).
  const isRequestValidated = !isInfoPending && Boolean(authorizeInfo) && !authorizeInfoError;

  // This client requires PKCE but the request did not include a code_challenge. Surface it
  // before the user consents instead of failing the authorize call afterwards.
  const isPkceMissing = Boolean(authorizeInfo?.requirePkce) && !search.code_challenge;

  const clientName = authorizeInfo?.clientName ?? "Application";

  const handleAuthorize = async () => {
    const { callbackUrl } = await consentOauth({
      clientId: search.client_id,
      redirectUri: search.redirect_uri,
      state: search.state,
      codeChallenge: search.code_challenge,
      codeChallengeMethod: search.code_challenge_method,
      scope: grantedScopes.join(" "),
      resource: search.resource
    });

    setIsRedirecting(true);
    window.location.href = callbackUrl;
  };

  const handleDeny = () => {
    // Only redirect once the backend has confirmed the redirect_uri is registered for this client
    if (!isRequestValidated) return;

    const denyUrl = new URL(search.redirect_uri);
    denyUrl.searchParams.set("error", "access_denied");
    if (search.state) denyUrl.searchParams.set("state", search.state);
    window.location.href = denyUrl.toString();
  };

  // The organization picker selects `org_id` as it loads, which issues a session token for that organization (after
  // MFA when required) and then returns to the stored URL. Naming the organization keeps the picker's list, which
  // includes sub-organizations, out of the way. SSO enforcement is checked first because it would open that list.
  const handleSwitchOrganization = (targetOrganization: TOrgWithSubOrgs) => {
    const ssoEnforcementError = getSsoEnforcementError(targetOrganization);
    if (ssoEnforcementError) {
      createNotification({ text: ssoEnforcementError, type: "error" });
      return;
    }

    sessionStorage.setItem(
      SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL,
      JSON.stringify({
        expiry: formatISO(addSeconds(new Date(), ORG_SWITCH_RETURN_TTL_SECONDS)),
        data: window.location.href
      })
    );
    navigate({ to: "/login/select-organization", search: { org_id: targetOrganization.id } });
  };

  if (isRedirecting) {
    return (
      <>
        <PageTitle title="Authorize Application" />
        <div className="flex min-h-dvh flex-col items-center justify-center bg-page">
          <Card className="w-full max-w-md items-center text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="size-8 text-success" />
            </div>
            <CardTitle className="justify-center">Authorization Successful</CardTitle>
            <CardDescription className="flex items-center justify-center gap-2">
              <Loader2 className="size-3.5 animate-spin" />
              Redirecting back to the application
            </CardDescription>
          </Card>
        </div>
      </>
    );
  }

  const renderApplicationSummary = () => {
    if (isInfoPending) {
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      );
    }

    let description = "An external application is requesting access to your Infisical account.";
    if (authorizeInfo && organization && isPublicClient) {
      description = `${clientName} wants to access the ${organization.name} organization and act on your behalf.`;
    } else if (authorizeInfo) {
      description = `${clientName} wants to access your Infisical account and act on your behalf.`;
    }

    return (
      <div className="flex flex-col gap-1.5">
        <h1 className="font-alliance text-2xl font-normal text-foreground">
          {authorizeInfo ? `Authorize ${clientName}` : "Authorize Application"}
        </h1>
        <p className="text-sm leading-5.5 text-label">{description}</p>
      </div>
    );
  };

  const renderAccess = () => {
    if (isInfoPending) {
      return (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      );
    }

    if (!authorizeInfo) return null;

    if (requestedProducts.length === 0) {
      return (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-medium text-foreground">Account access</p>
            <p className="text-xs text-accent">Within your existing permissions</p>
          </div>
          <p className="text-sm text-label">
            {clientName} will be able to act on your behalf with your existing Infisical permissions
            until you revoke its session.
          </p>
        </div>
      );
    }

    return requestedProducts.map((productAccess) => {
      const selectedLevel = productAccess.levels.find(
        ({ level }) => level === getAccessLevel(productAccess)
      );
      const productScopes = getGrantedScopes(productAccess);
      const capabilities = productAccess.capabilities.map((capability) => ({
        ...capability,
        isGranted: capability.anyOf.some((scope) => productScopes.includes(scope))
      }));
      const grantedCount = capabilities.filter(({ isGranted }) => isGranted).length;

      return (
        <div key={productAccess.key} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <p
                id={`oauth-access-${productAccess.key}`}
                className="text-sm font-medium text-foreground"
              >
                {productAccess.product} access
              </p>
              <p className="text-xs text-accent">Within your existing permissions</p>
            </div>
            <RadioGroup
              aria-labelledby={`oauth-access-${productAccess.key}`}
              orientation="horizontal"
              className="flex gap-1 rounded-lg border border-border bg-container p-1"
              value={getAccessLevel(productAccess)}
              onValueChange={(level) =>
                setAccessLevels((prev) => ({
                  ...prev,
                  [productAccess.key]: level
                }))
              }
            >
              {productAccess.levels.map(({ level, title, dotClassName }) => (
                <RadioGroupPrimitive.Item
                  key={level}
                  value={level}
                  className={cn(
                    "flex h-8.5 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-transparent px-3",
                    "text-sm whitespace-nowrap text-label transition-colors outline-none hover:text-foreground",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    "data-[state=checked]:border-foreground/10 data-[state=checked]:bg-foreground/5 data-[state=checked]:text-foreground"
                  )}
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", dotClassName)} />
                  {title}
                </RadioGroupPrimitive.Item>
              ))}
            </RadioGroup>
            {/* Every description shares one grid cell, so the block keeps the height of the longest one and the
                card does not resize when the level changes. */}
            <div className="grid">
              {productAccess.levels.map(({ level, description }) => (
                <p
                  key={level}
                  aria-hidden={level !== selectedLevel?.level}
                  className={cn(
                    "col-start-1 row-start-1 text-sm text-label transition-opacity duration-200 motion-reduce:transition-none",
                    level === selectedLevel?.level ? "opacity-100" : "opacity-0"
                  )}
                >
                  {description}
                </p>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-container">
            <div className="flex h-9.5 items-center justify-between gap-4 border-b border-border/50 px-4 text-xs text-accent">
              <span>{clientName} will be able to</span>
              <span>
                {grantedCount} of {capabilities.length}
              </span>
            </div>
            <ul className="divide-y divide-border/50">
              {capabilities.map(({ label, isGranted, isSensitive }) => (
                <li
                  key={label}
                  className={cn(
                    "flex min-h-9.5 items-center gap-2.5 px-4 text-sm",
                    isGranted ? "text-foreground" : "text-muted"
                  )}
                >
                  {isGranted ? (
                    <CheckIcon aria-hidden className="size-3.5 shrink-0 text-success" />
                  ) : (
                    <XIcon aria-hidden className="size-3.5 shrink-0 text-muted" />
                  )}
                  <span className="sr-only">{isGranted ? "Allowed:" : "Not allowed:"}</span>
                  <span className="min-w-0 flex-1">{label}</span>
                  {isGranted && isSensitive && <Badge variant="warning">Sensitive</Badge>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-4 py-10">
      <PageTitle title="Authorize Application" />
      <link rel="icon" href="/infisical.ico" />

      <Card className="w-full max-w-210 gap-0 overflow-hidden p-0 md:grid md:grid-cols-[340px_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 border-b border-border bg-popover px-7 py-8 md:border-r md:border-b-0">
          <div className="flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-container text-xl text-foreground">
              {isInfoPending ? (
                <Skeleton className="size-5" />
              ) : (
                clientName.trim().charAt(0).toUpperCase()
              )}
            </div>
            <ArrowLeftRightIcon aria-hidden className="size-4 text-muted" />
            <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-container">
              <img src="/images/gradientLogo.svg" className="w-7" alt="Infisical" />
            </div>
          </div>

          {renderApplicationSummary()}

          <DetailGroup className="mt-1">
            {isPublicClient && (
              <Detail className="gap-y-1.5">
                <DetailLabel className="text-accent">Organization</DetailLabel>
                <DetailValue className="flex items-center gap-2">
                  <OrgIcon aria-hidden className="size-3.5 shrink-0 text-org" />
                  {isOrganizationPending ? (
                    <Skeleton className="h-4 w-24" />
                  ) : (
                    <span className="min-w-0 truncate">{organization?.name}</span>
                  )}
                  {canSwitchOrganization && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="link"
                          size="xs"
                          className="ml-auto text-org"
                          isDisabled={isConsenting}
                        >
                          Switch
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="max-w-72 min-w-48">
                        {switchableOrganizations.map((switchableOrganization) => (
                          <DropdownMenuItem
                            key={switchableOrganization.id}
                            onClick={() => handleSwitchOrganization(switchableOrganization)}
                          >
                            <OrgIcon className="text-org" />
                            <span className="min-w-0 truncate">{switchableOrganization.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </DetailValue>
              </Detail>
            )}

            <Detail className="gap-y-1.5">
              <DetailLabel className="text-accent">Signed in as</DetailLabel>
              <DetailValue>{user.email || user.username}</DetailValue>
            </Detail>

            {authorizeInfo && (
              <Detail className="gap-y-1.5">
                <DetailLabel className="text-accent">Application</DetailLabel>
                <DetailValue className="flex flex-wrap items-center gap-2">
                  {clientName}
                  {/* The name comes from the application's own metadata document, so any site can claim any name. */}
                  {isPublicClient && <Badge variant="warning">Self-reported</Badge>}
                </DetailValue>
                {isPublicClient ? (
                  <p className="text-xs text-muted">
                    {authorizeInfo.publicClientHost} provides this name, and Infisical can&apos;t
                    verify it. Continue only if you started this sign-in from {clientName}.
                  </p>
                ) : (
                  authorizeInfo.clientDescription && (
                    <p className="text-xs text-muted">{authorizeInfo.clientDescription}</p>
                  )
                )}
              </Detail>
            )}

            {isRequestValidated && (
              <Detail className="gap-y-1.5">
                <DetailLabel className="text-accent">Redirects to</DetailLabel>
                <code className="flex min-h-8 items-center rounded-md border border-border bg-container px-2.5 py-1.5 font-mono text-xs break-all text-foreground">
                  {search.redirect_uri}
                </code>
              </Detail>
            )}
          </DetailGroup>
        </div>

        <div className="flex flex-col gap-5 px-7 py-8">
          <div>
            {renderAccess()}
            <AnimatedCollapse isOpen={isGrantingSecretValues} variant="subtle">
              <div className="pt-5">
                <Alert
                  variant="warning"
                  className="[&_[data-slot=alert-description]]:text-foreground"
                >
                  <TriangleAlertIcon />
                  <AlertDescription>
                    {clientName} will have access to read secret values. Use Describe Only access to
                    avoid secret values leaving Infisical.
                  </AlertDescription>
                </Alert>
              </div>
            </AnimatedCollapse>
          </div>
          {!isInfoPending && authorizeInfoError && (
            <Alert variant="danger">
              <AlertDescription>
                {(authorizeInfoError as { response?: { data?: { message?: string } } })?.response
                  ?.data?.message || "This authorization request is invalid."}
              </AlertDescription>
            </Alert>
          )}
          {isRequestValidated && isSubOrganizationSession && (
            <Alert variant="danger">
              <AlertDescription>
                You can authorize {clientName} only from a parent organization. Switch to a parent
                organization to continue.
              </AlertDescription>
            </Alert>
          )}
          {isRequestValidated && isPkceMissing && (
            <Alert variant="danger">
              <AlertDescription>
                This application requires PKCE, but the authorization request is missing a code
                challenge. The application must initiate the request with PKCE enabled.
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-auto flex flex-wrap items-center justify-end gap-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                className="px-5"
                onClick={handleDeny}
                isDisabled={isConsenting || !isRequestValidated}
              >
                Deny
              </Button>
              <Button
                variant="org"
                size="lg"
                className="px-5"
                onClick={handleAuthorize}
                isPending={isConsenting}
                isDisabled={
                  isConsenting ||
                  !isRequestValidated ||
                  isPkceMissing ||
                  isNothingGranted ||
                  isSubOrganizationSession
                }
              >
                Authorize
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};
