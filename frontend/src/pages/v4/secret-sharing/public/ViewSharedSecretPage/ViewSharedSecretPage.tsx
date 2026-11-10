import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { addSeconds, format, formatISO } from "date-fns";

import { PageTitle } from "@app/components/PageTitle";
import { Alert, AlertDescription, AlertTitle } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { Loader } from "@app/components/v4/ui/loader";
import { SmallText, Text } from "@app/components/v4/ui/text";
import { SessionStorageKeys } from "@app/const";
import type { TAccessSharedSecretResponse } from "@app/hooks/api/secretSharing/types";

import { toast } from "../../../access/toast";
import { AuthPage } from "../../../auth/components/AuthPage";
import { v4Path } from "../../../links";
import { resolveV4Href } from "../../../resolveV4Href";
import { usePublicSecretSharing } from "../PublicLayout";

import styles from "./view-shared-secret.module.css";

const DEFAULT_FAVICON_URL = "/infisical.ico";
// v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
const DEFAULT_PRIMARY = "#0e1014";
// v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
const DEFAULT_SECONDARY = "#1e1f22";

const isLight = (hex: string) => {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.substring(at, at + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
};

const shift = (hex: string, amount: number) => {
  const value = hex.replace("#", "");
  return `#${[0, 2, 4]
    .map((at) =>
      Math.max(0, Math.min(255, parseInt(value.substring(at, at + 2), 16) + amount))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
};

const brandStyle = (primary: string, secondary: string) => {
  const lightPanel = isLight(secondary);
  return {
    "--brand-page": `linear-gradient(to bottom right, ${shift(primary, isLight(primary) ? -20 : 20)}, ${primary})`,
    "--brand-panel": secondary,
    "--brand-line": shift(secondary, lightPanel ? -30 : 30),
    "--brand-inset": shift(secondary, lightPanel ? -15 : 15),
    // v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
    "--brand-text": lightPanel ? "#1a1a1a" : "#f5f5f5",
    // v4-check-ignore raw-color -- customer brand colors from the org's branding config, not product chrome
    "--brand-muted": lightPanel ? "#1a1a1acc" : "#f5f5f5cc"
  } as CSSProperties;
};

const errorOf = (error: unknown) => {
  const data = (error as { response?: { data?: { statusCode?: number; message?: string } } })
    ?.response?.data;
  return { status: data?.statusCode, message: data?.message };
};

const PasswordPrompt = ({
  invalid,
  pending,
  onSubmit
}: {
  invalid: boolean;
  pending: boolean;
  onSubmit: (password: string) => void;
}) => {
  const [password, setPassword] = useState("");
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (password) onSubmit(password);
      }}
    >
      <Stack gap={16}>
        <Field label="Password" error={invalid ? "Invalid credential" : undefined}>
          <Input
            autoFocus
            type="password"
            value={password}
            placeholder="Enter password to view secret"
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            invalid={invalid}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" loading={pending} disabled={!password}>
          View secret
        </Button>
      </Stack>
    </form>
  );
};

const SecretView = ({ secret }: { secret: TAccessSharedSecretResponse }) => {
  const [visible, setVisible] = useState(false);
  const viewsLeft = secret.expiresAfterViews ? secret.expiresAfterViews - 1 : null;
  return (
    <Stack gap={16}>
      <div className={styles.value}>
        <pre className={styles.valueText}>{visible ? secret.secretValue : "••••••••••••••••"}</pre>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          iconOnly
          icon="eye"
          aria-pressed={visible}
          className={styles.reveal}
          onClick={() => setVisible(!visible)}
        >
          {visible ? "Hide value" : "Reveal value"}
        </Button>
      </div>
      <Button
        size="lg"
        icon="copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(secret.secretValue);
            toast({ tone: "ok", title: "Secret value copied to clipboard" });
          } catch {
            toast({
              tone: "bad",
              title: "Your browser blocked clipboard access. Reveal the value and copy it manually."
            });
          }
        }}
      >
        Copy value
      </Button>
      {(secret.expiresAt || viewsLeft !== null) && (
        <div className={styles.facts}>
          {secret.expiresAt && (
            <span>
              <Icon name="calendar" size={14} />
              <span>
                <SmallText className={styles.factLabel}>Expires</SmallText>
                <SmallText muted>
                  {format(new Date(secret.expiresAt), "MMM d, yyyy 'at' h:mm a")}
                </SmallText>
              </span>
            </span>
          )}
          {viewsLeft !== null && (
            <span>
              <Icon name="eye" size={14} />
              <span>
                <SmallText className={styles.factLabel}>Views remaining</SmallText>
                <SmallText muted>{viewsLeft === 0 ? "Last available view" : viewsLeft}</SmallText>
              </span>
            </span>
          )}
        </div>
      )}
    </Stack>
  );
};

export const ViewSharedSecretPage = () => {
  const { secretId } = useParams({ from: "/v4/_v4-public/shared/secret/$secretId" });
  const navigate = useNavigate();
  const adapter = usePublicSecretSharing();
  const details = adapter.useSharedSecretDetails(secretId);
  const branding = adapter.useSharedSecretBranding(secretId);
  const access = adapter.useAccessSharedSecret();
  const accessed = useRef(false);

  useEffect(() => {
    if (details.data?.isAuthorizedUser && !details.data.isPasswordProtected && !accessed.current) {
      accessed.current = true;
      access.mutate({ sharedSecretId: secretId });
    }
  }, [details.data]);

  const activeError = details.error ?? access.error;
  const { status, message } = errorOf(activeError);
  const isInvalidCredential = message === "Invalid credentials";
  const isUnauthorized = status === 401 && !isInvalidCredential;
  const isCritical = status === 403 || status === 404;

  useEffect(() => {
    if (!activeError) return;
    if (isUnauthorized) {
      sessionStorage.setItem(
        SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL,
        JSON.stringify({
          expiry: formatISO(addSeconds(new Date(), 60)),
          data: window.location.href
        })
      );
      toast({ tone: "neutral", title: "Sign in to view this shared secret" });
      navigate({ href: resolveV4Href(v4Path("/login"), "live") });
      return;
    }
    if (!isInvalidCredential && !isCritical)
      toast({ tone: "bad", title: message ?? "Could not open the shared secret" });
  }, [activeError]);

  const config = branding.data;
  const isBranded = Boolean(config && (config.hasLogo || config.hasFavicon || config.primaryColor));
  const faviconUrl = config?.hasFavicon
    ? adapter.brandingAssetUrl(secretId, "brand-favicon")
    : DEFAULT_FAVICON_URL;

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    const original = link?.href;
    if (link) link.href = faviconUrl;
    return () => {
      if (link && original) link.href = original;
    };
  }, [faviconUrl]);

  const secret = access.data;
  const showPassword =
    (details.data?.isPasswordProtected && !secret && !(access.isError && isCritical)) ||
    isInvalidCredential;
  const isLoading =
    details.isPending ||
    branding.isPending ||
    (!details.data?.isPasswordProtected && access.isPending);

  if (isLoading) return <Loader size="page" label="Loading shared secret" />;

  const content = (
    <>
      {showPassword && (
        <PasswordPrompt
          invalid={!access.isPending && isInvalidCredential}
          pending={access.isPending}
          onSubmit={(password) => access.mutate({ sharedSecretId: secretId, password })}
        />
      )}
      {secret && <SecretView secret={secret} />}
      {!showPassword && activeError && !isUnauthorized && (
        <Alert tone="bad">
          <AlertTitle>Unable to view shared secret</AlertTitle>
          <AlertDescription>
            {message || "The secret you are looking for is missing or has expired"}
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
        <PageTitle title="Securely Share Secrets" />
        {config?.hasLogo && (
          <img
            src={adapter.brandingAssetUrl(secretId, "brand-logo")}
            alt="Logo"
            className={styles.logo}
          />
        )}
        <div className={styles.panel}>
          <Text className={styles.panelTitle}>View shared secret</Text>
          {content}
        </div>
      </div>
    );

  return (
    <AuthPage
      variant="focused"
      wide
      pageTitle="Securely Share Secrets"
      title="View shared secret"
      bottom={
        <a
          className={styles.quietLink}
          href={resolveV4Href(v4Path("/shared/new"), "live")}
          target="_blank"
          rel="noopener noreferrer"
        >
          Share your own secret
        </a>
      }
    >
      {content}
    </AuthPage>
  );
};
