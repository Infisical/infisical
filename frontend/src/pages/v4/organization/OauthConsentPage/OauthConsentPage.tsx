import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inset } from "@infisical/cipher/ui/inset";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Toaster } from "@infisical/cipher/ui/sonner";
import { Heading, Meta, StatusText, Text } from "@infisical/cipher/ui/text";
import { QueryClientProvider } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";

import type { TOauthAuthorizeInfo } from "@app/hooks/api/oauthClients/types";

import { errorMessage, failed } from "../../access/toast";
import { AuthPage } from "../../auth/components/AuthPage";
import { useV4Adapter, useV4Mode } from "../../data/adapters";
import { liveQueryClient } from "../../data/live-query-client";

const PAGE_TITLE = "Authorize Application";

const ClientDetails = ({ info }: { info: TOauthAuthorizeInfo }) => {
  const scopes = info.requestedScopes ?? [];
  return (
    <Inset>
      <Stack gap={12}>
        <Stack gap={4}>
          <Heading level={2} size="subsection" className="break-words">
            {info.clientName}
          </Heading>
          {info.clientDescription && (
            <Text muted className="break-words">
              {info.clientDescription}
            </Text>
          )}
        </Stack>
        <Text muted>
          {scopes.length
            ? "It will get this access on your behalf, limited to your Infisical permissions, until you revoke its session."
            : "It will be able to act on your behalf with your Infisical permissions until you revoke its session."}
        </Text>
        {scopes.length > 0 && (
          <ul aria-label="Requested access">
            <Stack gap={12}>
              {scopes.map(({ scope, description }) => (
                <li key={scope}>
                  <Inline gap={8} align="start" wrap={false}>
                    <Icon name="check-c" className="mt-0.5 shrink-0" />
                    <Stack gap={2} className="min-w-0">
                      <Text className="break-words">{description}</Text>
                      <Meta mono className="break-all">
                        {scope}
                      </Meta>
                    </Stack>
                  </Inline>
                </li>
              ))}
            </Stack>
          </ul>
        )}
      </Stack>
    </Inset>
  );
};

const OauthConsent = () => {
  const mode = useV4Mode();
  const sso = useV4Adapter("sso");
  const search = useSearch({ from: "/v4/organization/oauth-consent" });
  const [isRedirecting, setIsRedirecting] = useState(false);
  const info = sso.useOauthAuthorizeInfo(search.client_id, search.redirect_uri, search.scope);
  const consent = sso.useOauthConsent();

  // The backend validates the client and redirect URI when it returns authorize info. Until then
  // the redirect_uri in the URL is untrusted, so Deny must not follow it (open redirect).
  const isRequestValidated = !info.isPending && Boolean(info.data) && !info.error;
  const isPkceMissing = Boolean(info.data?.requirePkce) && !search.code_challenge;

  const handleAuthorize = async () => {
    try {
      const { callbackUrl } = await consent.mutateAsync({
        clientId: search.client_id,
        redirectUri: search.redirect_uri,
        state: search.state,
        codeChallenge: search.code_challenge,
        codeChallengeMethod: search.code_challenge_method,
        scope: search.scope
      });
      setIsRedirecting(true);
      if (mode === "live") window.location.href = callbackUrl;
    } catch (error) {
      failed("Failed to authorize application", error);
    }
  };

  const handleDeny = () => {
    if (!isRequestValidated || mode !== "live") return;
    const denyUrl = new URL(search.redirect_uri);
    denyUrl.searchParams.set("error", "access_denied");
    if (search.state) denyUrl.searchParams.set("state", search.state);
    window.location.href = denyUrl.toString();
  };

  if (isRedirecting) {
    return (
      <AuthPage variant="focused" pageTitle={PAGE_TITLE} title="Authorization successful">
        <StatusText size="md" loading>
          Redirecting back to the application
        </StatusText>
      </AuthPage>
    );
  }

  return (
    <AuthPage variant="focused" pageTitle={PAGE_TITLE} title="Authorize application">
      <Stack gap={24}>
        {info.isPending && (
          <Inset>
            <Skeleton lines={2} />
          </Inset>
        )}
        {info.data && <ClientDetails info={info.data} />}
        {!info.isPending && Boolean(info.error) && (
          <Alert
            tone="bad"
            title={errorMessage(info.error) ?? "This authorization request is invalid."}
          />
        )}
        {isRequestValidated && isPkceMissing && (
          <Alert tone="bad" title="This application requires PKCE">
            The authorization request has no code challenge. The application must start the request
            with PKCE enabled.
          </Alert>
        )}
        <Inline gap={8} wrap={false}>
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={handleDeny}
            disabled={consent.isPending || !isRequestValidated}
          >
            Deny
          </Button>
          <Button
            variant="accent"
            size="lg"
            className="flex-1"
            onClick={handleAuthorize}
            loading={consent.isPending}
            disabled={!isRequestValidated || isPkceMissing}
          >
            Authorize
          </Button>
        </Inline>
      </Stack>
    </AuthPage>
  );
};

export const OauthConsentPage = () => (
  <QueryClientProvider client={liveQueryClient}>
    <OauthConsent />
    <Toaster />
  </QueryClientProvider>
);
