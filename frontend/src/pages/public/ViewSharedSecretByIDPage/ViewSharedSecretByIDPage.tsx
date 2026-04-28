import { useEffect, useMemo, useRef } from "react";
import { Helmet } from "react-helmet";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { addSeconds, formatISO } from "date-fns";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import { createNotification } from "@app/components/notifications";
import { Card, CardContent, CardHeader, CardTitle, PageLoader } from "@app/components/v3";
import { SessionStorageKeys } from "@app/const";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  useAccessSharedSecret,
  useGetSharedSecretBranding,
  useGetSharedSecretById
} from "@app/hooks/api/secretSharing";
import {
  PasswordContainer,
  SecretContainer,
  SecretErrorContainer
} from "@app/pages/public/ViewSharedSecretByIDPage/components";

export const DEFAULT_LOGO_URL = "/images/gradientLogo.svg";
export const DEFAULT_FAVICON_URL = "/infisical.ico";
export const DEFAULT_BRAND_PRIMARY_COLOR = "#0e1014";
export const DEFAULT_BRAND_SECONDARY_COLOR = "#1e1f22";

// Returns true if the color is considered "light"
export const isLightColor = (hexColor: string): boolean => {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
};

// Adjusts color brightness by a literal amount (negative for darker, positive for lighter)
export const adjustColor = (hexColor: string, amount: number): string => {
  const hex = hexColor.replace("#", "");
  const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
  // eslint-disable-next-line no-bitwise
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
};

export type BrandingTheme = {
  primaryColor: string;
  secondaryColor: string;
  textColor: string;
  textMutedColor: string;
  panelBg: string;
  panelBorder: string;
  inputBg: string;
  buttonBg: string;
};

export const ViewSharedSecretByIDPage = () => {
  const id = useParams({
    from: ROUTE_PATHS.Public.ViewSharedSecretByIDPage.id,
    select: (el) => el.secretId
  });

  const navigate = useNavigate();
  const hasTriggeredAccess = useRef(false);

  // Step 1: Fetch public metadata (is it password protected? what access type?)
  const {
    data: secretDetails,
    isLoading: isLoadingDetails,
    error: detailsError
  } = useGetSharedSecretById({ sharedSecretId: id });

  // Step 2: Access the secret value (mutation — triggered automatically or after password entry)
  const accessMutation = useAccessSharedSecret();

  // Fetch branding config
  const { data: brandingConfig, isLoading: isLoadingBrandingConfig } = useGetSharedSecretBranding({
    sharedSecretId: id
  });

  // Auto-access when the user is authorized and no password is needed
  useEffect(() => {
    if (
      secretDetails &&
      secretDetails.isAuthorizedUser &&
      !secretDetails.isPasswordProtected &&
      !hasTriggeredAccess.current
    ) {
      hasTriggeredAccess.current = true;
      accessMutation.mutate({ sharedSecretId: id });
    }
  }, [secretDetails]);

  // Derive error state from whichever step failed
  const activeError = (detailsError ?? accessMutation.error) as AxiosError | null;
  const errorStatusCode = (activeError?.response?.data as { statusCode: number })?.statusCode;
  const errorMessage = (activeError?.response?.data as { message: string })?.message;

  const isUnauthorized = errorStatusCode === 401;
  const isInvalidCredential = errorMessage === "Invalid credentials";
  const isForbidden = errorStatusCode === 403;
  const isNotFound = errorStatusCode === 404;

  // Redirect to login for org-restricted secrets when not authenticated
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
      return;
    }

    if (activeError && !isInvalidCredential && !isForbidden && !isNotFound) {
      createNotification({ type: "error", text: errorMessage });
    }
  }, [activeError]);

  const secret = accessMutation.data;
  const isPasswordProtected = secretDetails?.isPasswordProtected ?? false;
  const needsPassword = isPasswordProtected;
  const hasCriticalError = accessMutation.isError && (isForbidden || isNotFound);
  const showPasswordPrompt = needsPassword && !secret && !hasCriticalError;
  const isLoading = isLoadingDetails || (!needsPassword && accessMutation.isPending);

  const hasCustomBranding =
    !!brandingConfig &&
    (brandingConfig.hasLogo || brandingConfig.hasFavicon || !!brandingConfig.primaryColor);

  const logoUrl = brandingConfig?.hasLogo
    ? `/api/v1/shared-secrets/public/${id}/branding/brand-logo`
    : DEFAULT_LOGO_URL;
  const faviconUrl = brandingConfig?.hasFavicon
    ? `/api/v1/shared-secrets/public/${id}/branding/brand-favicon`
    : DEFAULT_FAVICON_URL;

  const brandingTheme = useMemo((): BrandingTheme | undefined => {
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

  if (isLoading || isLoadingBrandingConfig) {
    return (
      <div className="h-screen w-screen bg-bunker-800">
        <PageLoader lottieClassName="w-34" />
      </div>
    );
  }

  const secretContent = (
    <>
      {(showPasswordPrompt || isInvalidCredential) && (
        <PasswordContainer
          isSubmitting={accessMutation.isPending}
          onPasswordSubmit={(pwd) => {
            accessMutation.mutate({ sharedSecretId: id, password: pwd });
          }}
          isInvalidCredential={!accessMutation.isPending && isInvalidCredential}
          brandingTheme={brandingTheme}
        />
      )}
      {secret && <SecretContainer secret={secret} brandingTheme={brandingTheme} />}
      {!showPasswordPrompt && !isInvalidCredential && activeError && !isUnauthorized && (
        <SecretErrorContainer brandingTheme={brandingTheme} error={errorMessage} />
      )}
    </>
  );

  // Custom branding: minimal layout with brand colors, no Infisical elements
  if (hasCustomBranding) {
    return (
      <>
        <Helmet>
          <title>Securely Share Secrets</title>
          <meta property="og:image" content="/images/message.png" />
        </Helmet>
        <div
          className="flex min-h-screen flex-col items-center justify-center overflow-auto px-4 py-10 scheme-dark"
          style={backgroundStyle}
        >
          {brandingConfig?.hasLogo && (
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
            <h1 className="mb-5 text-lg font-semibold" style={{ color: brandingTheme?.textColor }}>
              View shared secret
            </h1>
            {secretContent}
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
        <title>Securely Share Secrets | Infisical</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <AuthPageHeader />
      <div className="relative z-10 my-auto flex flex-col items-center py-10">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>View shared secret</CardTitle>
          </CardHeader>
          <CardContent>{secretContent}</CardContent>
        </Card>
      </div>
      <AuthPageFooter />
    </div>
  );
};
