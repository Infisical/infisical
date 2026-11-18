import { useState } from "react";
import { Link, useRouteContext, useSearch } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Skeleton
} from "@app/components/v3";
import { useGetOauthAuthorizeInfo, useOauthConsent } from "@app/hooks/api";
import { useGetOrganizationById } from "@app/hooks/api/organization/queries";

export const OauthConsentPage = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  // The user can grant less than the application asked for; the token response tells it what it got.
  const [declinedScopes, setDeclinedScopes] = useState<string[]>([]);

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

  // A public client is granted the organization the user is signed in to, so name it.
  const { data: organization } = useGetOrganizationById(organizationId ?? "", {
    enabled: Boolean(authorizeInfo?.publicClientHost && organizationId)
  });

  const requestedScopes = authorizeInfo?.requestedScopes ?? [];
  const grantedScopes = requestedScopes
    .map(({ scope }) => scope)
    .filter((scope) => !declinedScopes.includes(scope));
  const isNothingGranted = requestedScopes.length > 0 && grantedScopes.length === 0;

  const isGrantingSecretValues = Boolean(
    authorizeInfo?.publicClientHost && grantedScopes.includes("secrets:read")
  );

  const { mutateAsync: consentOauth, isPending: isConsenting } = useOauthConsent();

  // The backend validates client + redirect URI when fetching authorize info. Until that
  // succeeds we must not trust the redirect_uri from the URL (otherwise Deny is an open redirect).
  const isRequestValidated = !isInfoPending && Boolean(authorizeInfo) && !authorizeInfoError;

  // This client requires PKCE but the request did not include a code_challenge. Surface it
  // before the user consents instead of failing the authorize call afterwards.
  const isPkceMissing = Boolean(authorizeInfo?.requirePkce) && !search.code_challenge;

  const handleAuthorize = async () => {
    try {
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
    } catch (error) {
      const axiosError = error as { response?: { data?: { message?: string } } };
      createNotification({
        text: axiosError?.response?.data?.message || "Failed to authorize application",
        type: "error"
      });
    }
  };

  const handleDeny = () => {
    // Only redirect once the backend has confirmed the redirect_uri is registered for this client
    if (!isRequestValidated) return;

    const denyUrl = new URL(search.redirect_uri);
    denyUrl.searchParams.set("error", "access_denied");
    if (search.state) denyUrl.searchParams.set("state", search.state);
    window.location.href = denyUrl.toString();
  };

  if (isRedirecting) {
    return (
      <>
        <PageTitle title="Authorize Application" />
        <div className="flex min-h-screen flex-col items-center justify-center bg-page">
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-page">
      <PageTitle title="Authorize Application" />
      <link rel="icon" href="/infisical.ico" />

      <Card className="w-full max-w-md">
        <Link to="/" className="block">
          <img src="/images/gradientLogo.svg" className="mx-auto h-16" alt="Infisical logo" />
        </Link>

        <CardHeader className="text-center">
          <CardTitle className="justify-center">Authorize Application</CardTitle>
          <CardDescription>
            An external application is requesting access to your Infisical account.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {isInfoPending && (
            <div className="flex flex-col gap-2 rounded-md border border-border bg-container p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          )}
          {!isInfoPending && authorizeInfo && (
            <div className="rounded-md border border-border bg-container p-4">
              <p className="text-xs text-accent">Application</p>
              <p className="mt-1 font-medium text-foreground">{authorizeInfo.clientName}</p>
              {authorizeInfo.publicClientHost && (
                <p className="mt-1 text-sm text-accent">{authorizeInfo.publicClientHost}</p>
              )}
              {authorizeInfo.clientDescription && (
                <p className="mt-1 text-sm text-accent">{authorizeInfo.clientDescription}</p>
              )}
              {organization && (
                <p className="mt-3 text-xs text-muted">
                  Access applies to the {organization.name} organization.
                </p>
              )}
              <p className="mt-3 text-xs text-muted">
                {requestedScopes.length
                  ? "Choose what this application can do on your behalf. It is limited to your existing Infisical permissions until you revoke its session."
                  : "This application will be able to act on your behalf with your existing Infisical permissions until you revoke its session."}
              </p>
              {requestedScopes.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2">
                  {requestedScopes.map(({ scope, description }) => (
                    <li key={scope}>
                      <label
                        htmlFor={`oauth-scope-${scope}`}
                        className="flex cursor-pointer items-start gap-2 text-sm text-foreground"
                      >
                        <Checkbox
                          id={`oauth-scope-${scope}`}
                          variant="org"
                          className="mt-0.5"
                          isChecked={!declinedScopes.includes(scope)}
                          onCheckedChange={(checked) =>
                            setDeclinedScopes((prev) =>
                              checked === true
                                ? prev.filter((declined) => declined !== scope)
                                : [...prev, scope]
                            )
                          }
                        />
                        <span>
                          {description}
                          <span className="ml-1 text-xs text-muted">({scope})</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {isGrantingSecretValues && (
            <Alert variant="warning">
              <AlertDescription>
                This allows the application to read secret values. Any value it reads is sent to the
                application, and to the AI model it uses.
              </AlertDescription>
            </Alert>
          )}
          {!isInfoPending && authorizeInfoError && (
            <Alert variant="danger">
              <AlertDescription>
                {(authorizeInfoError as { response?: { data?: { message?: string } } })?.response
                  ?.data?.message || "This authorization request is invalid."}
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

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleDeny}
              isDisabled={isConsenting || !isRequestValidated}
            >
              Deny
            </Button>
            <Button
              variant="org"
              className="flex-1"
              onClick={handleAuthorize}
              isPending={isConsenting}
              isDisabled={isConsenting || !isRequestValidated || isPkceMissing || isNothingGranted}
            >
              Authorize
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
