import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { addSeconds, formatISO } from "date-fns";

import { PageTitle } from "@app/components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { SmallText, Text } from "@app/components/v4/ui/text";
import { Textarea } from "@app/components/v4/ui/textarea";
import { SessionStorageKeys } from "@app/const";
import type { TBrandingConfig } from "@app/hooks/api/secretSharing/types";

import { toast } from "../../../access/toast";
import { AuthPage } from "../../../auth/components/AuthPage";
import { v4Path } from "../../../links";
import { resolveV4Href } from "../../../resolveV4Href";
import { usePublicSecretSharing } from "../PublicLayout";
import {
  brandStyle,
  DEFAULT_FAVICON_URL,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  errorOf
} from "../shared";

import styles from "../public.module.css";

const ValueForm = ({
  secretRequestId,
  onShared
}: {
  secretRequestId: string;
  onShared: () => void;
}) => {
  const adapter = usePublicSecretSharing();
  const setValue = adapter.useSetSecretRequestValue();
  const [value, setValueText] = useState("");
  return (
    <form
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value) return;
        try {
          await setValue.mutateAsync({ id: secretRequestId, secretValue: value });
          onShared();
        } catch (error) {
          toast({ tone: "bad", title: errorOf(error).message ?? "Could not share the secret" });
        }
      }}
    >
      <Stack gap={16}>
        <Field label="Secret value" wide>
          <Textarea
            className={styles.requestValue}
            rows={10}
            value={value}
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            onChange={(event) => setValueText(event.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" loading={setValue.isPending} disabled={!value}>
          Share secret
        </Button>
      </Stack>
    </form>
  );
};

export const ViewSecretRequestPage = () => {
  const { secretRequestId } = useParams({
    from: "/v4/_v4-public/secret-request/secret/$secretRequestId"
  });
  const navigate = useNavigate();
  const adapter = usePublicSecretSharing();
  const request = adapter.useSecretRequest(secretRequestId);
  const [shared, setShared] = useState(false);
  const [savedBranding, setSavedBranding] = useState<TBrandingConfig>();

  const { status, message } = errorOf(request.error);
  const isInvalidCredential = message === "Invalid credentials";
  const isUnauthorized = status === 401 && !isInvalidCredential;

  useEffect(() => {
    if (request.data?.brandingConfig) setSavedBranding(request.data.brandingConfig);
  }, [request.data?.brandingConfig]);

  useEffect(() => {
    if (isUnauthorized) {
      sessionStorage.setItem(
        SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL,
        JSON.stringify({
          expiry: formatISO(addSeconds(new Date(), 60)),
          data: window.location.href
        })
      );
      toast({ tone: "neutral", title: "Sign in to respond to this secret request" });
      navigate({ href: resolveV4Href(v4Path("/login"), "live") });
      return;
    }
    if (status === 403)
      toast({ tone: "bad", title: "You do not have access to this secret request" });
  }, [request.error]);

  const config = request.data?.brandingConfig ?? savedBranding;
  const isBranded = Boolean(config && (config.hasLogo || config.hasFavicon || config.primaryColor));
  const faviconUrl = config?.hasFavicon
    ? adapter.requestBrandingAssetUrl(secretRequestId, "brand-favicon")
    : DEFAULT_FAVICON_URL;

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    const original = link?.href;
    if (link) link.href = faviconUrl;
    return () => {
      if (link && original) link.href = original;
    };
  }, [faviconUrl]);

  if (request.isPending) return <Loader size="page" label="Loading secret request" />;

  const { data } = request;
  const requester = data?.request?.requester;
  const failed = data?.error || (request.error && !isInvalidCredential && !isUnauthorized);
  const title = shared ? "Secret shared" : "Respond to secret request";

  const content = (
    <>
      {!failed && data?.request && !data.isSecretValueSet && !shared && (
        <ValueForm secretRequestId={secretRequestId} onShared={() => setShared(true)} />
      )}
      {data?.isSecretValueSet && (
        <Alert tone="info">
          <AlertTitle>Secret already shared</AlertTitle>
          <AlertDescription>A value has already been shared for this request.</AlertDescription>
        </Alert>
      )}
      {failed && (
        <Alert tone="bad">
          <AlertTitle>Unable to open secret request</AlertTitle>
          <AlertDescription>
            {data?.error || "The secret request you are looking for is missing or has expired."}
          </AlertDescription>
        </Alert>
      )}
      {shared && requester && (
        <Alert tone="ok">
          <AlertDescription>
            {requester.username} has been notified and can view the secret shortly.
          </AlertDescription>
        </Alert>
      )}
    </>
  );

  if (isBranded)
    return (
      <div
        className={styles.branded}
        style={brandStyle(
          config?.primaryColor || DEFAULT_PRIMARY,
          config?.secondaryColor || config?.primaryColor || DEFAULT_SECONDARY
        )}
      >
        <PageTitle title="Secret Request" />
        {config?.hasLogo && (
          <img
            src={adapter.requestBrandingAssetUrl(secretRequestId, "brand-logo")}
            alt="Logo"
            className={styles.logo}
          />
        )}
        <div className={styles.panel}>
          <Stack gap={4}>
            <Text className={styles.panelTitle}>{title}</Text>
            {requester && <SmallText muted>Requested by {requester.username}</SmallText>}
          </Stack>
          {content}
        </div>
      </div>
    );

  return (
    <AuthPage
      variant="focused"
      wide
      pageTitle="Secret Request"
      title={title}
      description={
        requester
          ? `Requested by ${requester.username} from ${requester.organizationName}`
          : undefined
      }
    >
      {content}
    </AuthPage>
  );
};
