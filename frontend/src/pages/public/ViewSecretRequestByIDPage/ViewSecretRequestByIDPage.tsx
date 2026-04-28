import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { addSeconds, formatISO } from "date-fns";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import { createNotification } from "@app/components/notifications";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  PageLoader
} from "@app/components/v3";
import { SessionStorageKeys } from "@app/const";
import { ROUTE_PATHS } from "@app/const/routes";
import { TBrandingConfig, useGetSecretRequestById } from "@app/hooks/api/secretSharing";

import {
  adjustColor,
  DEFAULT_BRAND_PRIMARY_COLOR,
  DEFAULT_BRAND_SECONDARY_COLOR,
  DEFAULT_FAVICON_URL,
  isLightColor
} from "../ViewSharedSecretByIDPage/ViewSharedSecretByIDPage";
import { SecretRequestErrorContainer } from "./components/SecretErrorContainer";
import { SecretRequestContainer } from "./components/SecretRequestContainer";
import { SecretRequestSuccessContainer } from "./components/SecretRequestSuccessContainer";
import { SecretValueAlreadySharedContainer } from "./components/SecretValueAlreadySharedContainer";

export const ViewSecretRequestByIDPage = () => {
  const id = useParams({
    from: ROUTE_PATHS.Public.ViewSecretRequestByIDPage.id,
    select: (el) => el.secretRequestId
  });

  const [step, setStep] = useState<"set-value" | "success">("set-value");

  // Store branding config separately so it persists across errors
  const [savedBrandingConfig, setSavedBrandingConfig] = useState<TBrandingConfig | undefined>();

  const {
    data: secretRequest,
    error,
    isPending
  } = useGetSecretRequestById({
    secretRequestId: id
  });

  const navigate = useNavigate();

  const statusCode = ((error as AxiosError)?.response?.data as { statusCode: number })?.statusCode;
  const message = ((error as AxiosError)?.response?.data as { message: string })?.message;

  const isUnauthorized = statusCode === 401;
  const isForbidden = statusCode === 403;
  const isInvalidCredential = message === "Invalid credentials";

  // Save branding config separately so it persists across errors
  useEffect(() => {
    if (secretRequest?.brandingConfig) {
      setSavedBrandingConfig(secretRequest.brandingConfig);
    }
  }, [secretRequest?.brandingConfig]);

  useEffect(() => {
    if (isUnauthorized && !isInvalidCredential) {
      sessionStorage.setItem(
        SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL,
        JSON.stringify({
          expiry: formatISO(addSeconds(new Date(), 60)),
          data: window.location.href
        })
      );

      createNotification({
        type: "info",
        text: "Login is required in order to access the shared secret."
      });

      navigate({ to: "/login" });
    }

    if (isForbidden) {
      createNotification({
        type: "error",
        text: "You do not have access to this shared secret."
      });
    }
  }, [error]);

  const brandingConfig = secretRequest?.brandingConfig || savedBrandingConfig;
  const hasCustomBranding =
    !!brandingConfig &&
    (brandingConfig.hasLogo || brandingConfig.hasFavicon || !!brandingConfig.primaryColor);

  const logoUrl = brandingConfig?.hasLogo
    ? `/api/v1/shared-secrets/requests/${id}/branding/brand-logo`
    : undefined;
  const faviconUrl = brandingConfig?.hasFavicon
    ? `/api/v1/shared-secrets/requests/${id}/branding/brand-favicon`
    : DEFAULT_FAVICON_URL;

  const brandingTheme = useMemo(() => {
    if (!hasCustomBranding) {
      return undefined;
    }

    const primary = brandingConfig?.primaryColor || DEFAULT_BRAND_PRIMARY_COLOR;
    const secondary =
      brandingConfig?.secondaryColor ||
      brandingConfig?.primaryColor ||
      DEFAULT_BRAND_SECONDARY_COLOR;
    const isSecondaryLight = isLightColor(secondary);

    return {
      primaryColor: primary,
      secondaryColor: secondary,
      textColor: isSecondaryLight ? "#1a1a1a" : "#f5f5f5",
      textMutedColor: isSecondaryLight ? "#1a1a1acc" : "#f5f5f5cc",
      panelBg: secondary,
      panelBorder: adjustColor(secondary, isSecondaryLight ? -30 : 30),
      inputBg: adjustColor(secondary, isSecondaryLight ? -15 : 15),
      buttonBg: secondary
    };
  }, [hasCustomBranding, brandingConfig?.primaryColor, brandingConfig?.secondaryColor]);

  const backgroundStyle = useMemo(() => {
    if (!brandingTheme) {
      return undefined;
    }

    const isPrimaryLight = isLightColor(brandingTheme.primaryColor);
    const gradientStart = adjustColor(brandingTheme.primaryColor, isPrimaryLight ? -20 : 20);

    return {
      backgroundImage: `linear-gradient(to bottom right, ${gradientStart}, ${brandingTheme.primaryColor})`,
      backgroundAttachment: "fixed"
    } as React.CSSProperties;
  }, [brandingTheme]);

  useEffect(() => {
    if (!faviconUrl) return undefined;

    const existingLink = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    const originalHref = existingLink?.href;

    if (existingLink) {
      existingLink.href = faviconUrl;
    } else {
      const link = document.createElement("link");
      link.rel = "icon";
      link.href = faviconUrl;
      document.head.appendChild(link);
    }

    return () => {
      if (existingLink && originalHref) {
        existingLink.href = originalHref;
      }
    };
  }, [faviconUrl]);

  if (isPending) {
    return (
      <div className="h-screen w-screen bg-bunker-800">
        <PageLoader lottieClassName="w-34" />
      </div>
    );
  }

  const requestContent = (
    <>
      {!error &&
        !secretRequest?.error &&
        secretRequest?.request &&
        step === "set-value" &&
        !secretRequest.isSecretValueSet && (
          <SecretRequestContainer
            onSuccess={() => setStep("success")}
            secretRequestId={id}
            brandingTheme={brandingTheme}
          />
        )}
      {secretRequest?.isSecretValueSet && (
        <SecretValueAlreadySharedContainer brandingTheme={brandingTheme} />
      )}
      {(secretRequest?.error || (error && !isInvalidCredential && !isUnauthorized)) && (
        <SecretRequestErrorContainer brandingTheme={brandingTheme} error={secretRequest?.error} />
      )}
      {step === "success" && (
        <SecretRequestSuccessContainer
          requesterUsername={secretRequest!.request.requester.username}
          brandingTheme={brandingTheme}
        />
      )}
    </>
  );

  const requesterInfo = secretRequest?.request ? (
    <CardDescription>
      Secret requested by {secretRequest.request.requester.username}
      {!hasCustomBranding && (
        <> from the {secretRequest.request.requester.organizationName} organization</>
      )}
    </CardDescription>
  ) : null;

  // Custom branding: minimal layout with brand colors, no Infisical elements
  if (hasCustomBranding) {
    return (
      <>
        <Helmet>
          <title>Secret Request</title>
          <meta property="og:image" content="/images/message.png" />
        </Helmet>
        <div
          className="flex min-h-screen flex-col items-center justify-center overflow-auto px-4 py-10 scheme-dark"
          style={backgroundStyle}
        >
          {logoUrl && (
            <img src={logoUrl} alt="Logo" className="mb-8 max-h-16 w-auto object-contain" />
          )}
          <div
            className="w-full max-w-xl rounded-lg border p-5"
            style={{
              backgroundColor: brandingTheme?.panelBg,
              borderColor: brandingTheme?.panelBorder,
              color: brandingTheme?.textColor
            }}
          >
            <h1 className="mb-1 text-lg font-semibold" style={{ color: brandingTheme?.textColor }}>
              {step === "set-value" ? "Secret Request" : "Secret request shared"}
            </h1>
            {secretRequest?.request && (
              <p className="mb-5 text-sm" style={{ color: brandingTheme?.textMutedColor }}>
                Secret requested by {secretRequest.request.requester.username}
              </p>
            )}
            {requestContent}
          </div>
        </div>
      </>
    );
  }

  // Default: Infisical auth page layout
  return (
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-bunker-800 px-4 text-foreground scheme-dark">
      <AuthPageBackground />
      <Helmet>
        <title>Secret Request | Infisical</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <AuthPageHeader />
      <div className="relative z-10 my-auto flex flex-col items-center py-10">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>
              {step === "set-value" ? "Secret Request" : "Secret request shared"}
            </CardTitle>
            {requesterInfo}
          </CardHeader>
          <CardContent>{requestContent}</CardContent>
        </Card>
      </div>
      <AuthPageFooter />
    </div>
  );
};
