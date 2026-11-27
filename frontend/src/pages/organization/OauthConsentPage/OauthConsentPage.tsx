import { ReactNode, useState } from "react";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { addSeconds, formatISO } from "date-fns";
import {
  ArrowLeftRightIcon,
  CheckCircle2,
  CheckIcon,
  InfoIcon,
  Loader2,
  TriangleAlertIcon,
  XIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AnimatedCollapse,
  Badge,
  Button,
  Card,
  CardDescription,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
  OrgIcon,
  RadioGroup,
  RadioGroupItem,
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
        badge: { label: "Metadata", variant: "neutral" },
        requires: "secrets:describe",
        scopes: ["secrets:describe"],
        description:
          "See projects, environments, folders, and metadata about secrets. Secret values are never readable."
      },
      {
        level: "read",
        title: "Read Only",
        badge: { label: "Read Values", variant: "info" },
        requires: "secrets:read",
        scopes: ["secrets:read"],
        description:
          "Everything in Describe Only, plus the ability to read secrets, including their values."
      },
      {
        level: "full",
        title: "Full Access",
        badge: { label: "Read + Write", variant: "warning" },
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
      { label: "Create and change secrets", anyOf: ["secrets:write"], isSensitive: true },
      { label: "Delete secrets", anyOf: ["secrets:write"], isSensitive: true },
      { label: "Create folders and projects", anyOf: ["secrets:write"] }
    ]
  } as const
];

// Preselected when offered, least access first: reading secret values and writes are opted into.
const DEFAULT_LEVEL_ORDER = ["describe", "read", "full"];

// Long enough to pick an organization and pass its MFA or SSO before returning here.
const ORG_SWITCH_RETURN_TTL_SECONDS = 300;

const ConsentDetailRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-h-10 items-center justify-between gap-4 px-3.5 py-2">
    <dt className="shrink-0 text-xs text-accent">{label}</dt>
    <dd className="flex min-w-0 items-center justify-end gap-2 text-sm text-foreground">
      {children}
    </dd>
  </div>
);

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
  const getGrantedScopes = (productAccess: (typeof requestedProducts)[number]): string[] =>
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

  const renderHeader = () => (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="flex items-center gap-3">
        <div className="flex size-13 items-center justify-center rounded-lg border border-border bg-container text-xl text-foreground">
          {isInfoPending ? (
            <Skeleton className="size-5" />
          ) : (
            clientName.trim().charAt(0).toUpperCase()
          )}
        </div>
        <div aria-hidden className="flex items-center gap-1 text-muted">
          <span className="w-3.5 border-t border-dashed border-current" />
          <ArrowLeftRightIcon className="size-3.5" />
          <span className="w-3.5 border-t border-dashed border-current" />
        </div>
        <div className="flex size-13 items-center justify-center rounded-lg border border-border bg-container">
          <img src="/images/gradientLogo.svg" className="w-7" alt="Infisical" />
        </div>
      </div>
      {isInfoPending ? (
        <div className="flex w-full flex-col items-center gap-2">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <h1 className="font-alliance text-xl font-normal text-foreground">
            {authorizeInfo ? clientName : "Authorize Application"}
          </h1>
          <p className="max-w-84 text-sm text-label">
            {authorizeInfo
              ? "wants to access your Infisical organization and act on your behalf."
              : "An external application is requesting access to your Infisical account."}
          </p>
        </div>
      )}
    </div>
  );

  const renderDetails = () => {
    if (isInfoPending) return <Skeleton className="h-40 w-full" />;
    if (!authorizeInfo) return null;

    return (
      <div className="flex flex-col gap-2">
        <dl className="divide-y divide-border rounded-lg border border-border bg-container">
          {isPublicClient && (
            <ConsentDetailRow label="Organization">
              <OrgIcon aria-hidden className="size-3.5 shrink-0 text-org" />
              {isOrganizationPending ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <span className="min-w-0 truncate">{organization?.name}</span>
              )}
              {canSwitchOrganization && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="link" size="xs" className="text-org" isDisabled={isConsenting}>
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
            </ConsentDetailRow>
          )}
          <ConsentDetailRow label="Account">
            <span className="min-w-0 truncate">{user.email || user.username}</span>
          </ConsentDetailRow>
          <ConsentDetailRow label="Application">
            <span className="min-w-0 truncate">{clientName}</span>
            {/* The name comes from the application's own metadata document, so any site can claim any name. */}
            {isPublicClient && <Badge variant="warning">Self-reported</Badge>}
          </ConsentDetailRow>
          {isRequestValidated && (
            <ConsentDetailRow label="Redirects to">
              <code
                title={search.redirect_uri}
                className="min-w-0 truncate font-mono text-xs text-foreground"
              >
                {search.redirect_uri}
              </code>
            </ConsentDetailRow>
          )}
        </dl>
        {isPublicClient && (
          <p className="flex gap-2 text-xs text-accent">
            <InfoIcon aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>
              Infisical can&apos;t verify this app&apos;s name, which{" "}
              {authorizeInfo.publicClientHost} provides. Continue only if you started this sign-in
              from {clientName}.
            </span>
          </p>
        )}
        {!isPublicClient && authorizeInfo.clientDescription && (
          <p className="text-xs text-accent">{authorizeInfo.clientDescription}</p>
        )}
      </div>
    );
  };

  const renderAccess = () => {
    if (isInfoPending) return <Skeleton className="h-72 w-full" />;
    if (!authorizeInfo) return null;

    if (requestedProducts.length === 0) {
      return (
        <div className="flex flex-col gap-2">
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
      const productScopes = getGrantedScopes(productAccess);
      const capabilities = productAccess.capabilities.map((capability) => ({
        ...capability,
        isSensitive: "isSensitive" in capability && capability.isSensitive,
        isGranted: capability.anyOf.some((scope) => productScopes.includes(scope))
      }));
      const grantedCount = capabilities.filter(({ isGranted }) => isGranted).length;

      return (
        <div key={productAccess.key} className="flex flex-col gap-2">
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
            value={getAccessLevel(productAccess)}
            onValueChange={(level) =>
              setAccessLevels((prev) => ({
                ...prev,
                [productAccess.key]: level
              }))
            }
          >
            {productAccess.levels.map(({ level, title, badge, description }) => (
              <FieldLabel
                key={level}
                htmlFor={`oauth-access-${productAccess.key}-${level}`}
                variant="org"
                className="has-[>[data-slot=field]]:bg-container [&>*]:data-[slot=field]:px-3.5 [&>*]:data-[slot=field]:py-3"
              >
                <Field orientation="horizontal" className="gap-3">
                  <RadioGroupItem value={level} id={`oauth-access-${productAccess.key}-${level}`} />
                  <FieldContent className="gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <FieldTitle>{title}</FieldTitle>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <FieldDescription className="text-xs text-label">
                      {description}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
          <Accordion
            type="single"
            collapsible
            defaultValue="capabilities"
            variant="ghost"
            className="rounded-lg border border-border"
          >
            <AccordionItem value="capabilities">
              <AccordionTrigger className="flex-row-reverse justify-between px-3.5 text-xs data-[state=open]:border-b">
                <span>
                  Review what {clientName} can do{" "}
                  <span className="text-accent">
                    ({grantedCount} of {capabilities.length})
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-3.5 group-data-[variant=ghost]/accordion:pb-2">
                <ul>
                  {capabilities.map(({ label, isGranted, isSensitive }) => (
                    <li
                      key={label}
                      className={cn(
                        "flex min-h-7.5 items-center gap-2.5 text-sm",
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
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      );
    });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-page px-4 py-10">
      <PageTitle title="Authorize Application" />
      <link rel="icon" href="/infisical.ico" />

      <Card className="w-full max-w-md gap-5 p-6 pt-7">
        {renderHeader()}
        {renderDetails()}

        <div>
          {renderAccess()}
          <AnimatedCollapse isOpen={isGrantingSecretValues} variant="subtle">
            <div className="pt-5">
              <Alert
                variant="warning"
                className="rounded-lg px-4 [&_[data-slot=alert-description]]:text-foreground"
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

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button
              variant="outline"
              isFullWidth
              onClick={handleDeny}
              isDisabled={isConsenting || !isRequestValidated}
            >
              Deny
            </Button>
            <Button
              variant="org"
              isFullWidth
              className="min-w-0"
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
              <span className="truncate">
                {authorizeInfo ? `Authorize ${clientName}` : "Authorize"}
              </span>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
