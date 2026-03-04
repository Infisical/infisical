import { useEffect, useMemo, useRef } from "react";
import { Helmet } from "react-helmet";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { addSeconds, formatISO } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Lottie } from "@app/components/v2";
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

  // Auto-access when the secret is not password protected
  useEffect(() => {
    if (secretDetails && !secretDetails.isPasswordProtected && !hasTriggeredAccess.current) {
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
  // only show password prompt if no critical error (403/404) occurred after submission
  const hasCriticalError = accessMutation.isError && (isForbidden || isNotFound);
  const showPasswordPrompt = isPasswordProtected && !secret && !hasCriticalError;
  const isLoading = isLoadingDetails || (!isPasswordProtected && accessMutation.isPending);

  const hasCustomBranding = !!brandingConfig;

  const logoUrl = brandingConfig?.hasLogo
    ? `/api/v1/shared-secrets/public/${id}/branding/brand-logo`
    : DEFAULT_LOGO_URL;
  const faviconUrl = brandingConfig?.hasFavicon
    ? `/api/v1/shared-secrets/public/${id}/branding/brand-favicon`
    : DEFAULT_FAVICON_URL;

  const brandingTheme = useMemo((): BrandingTheme | undefined => {
    if (!brandingConfig?.primaryColor) {
      return undefined;
    }

    const primary = brandingConfig.primaryColor;
    const secondary = brandingConfig.secondaryColor || primary;
    const isSecondaryLight = isLightColor(secondary);

    return {
      primaryColor: primary,
      secondaryColor: secondary,
      // Text colors based on secondary brightness (for components)
      textColor: isSecondaryLight ? "#1a1a1a" : "#f5f5f5",
      textMutedColor: isSecondaryLight ? "#1a1a1acc" : "#f5f5f5cc",
      // Panel and components based on secondary color
      panelBg: secondary,
      panelBorder: adjustColor(secondary, isSecondaryLight ? -30 : 30),
      inputBg: adjustColor(secondary, isSecondaryLight ? -15 : 15),
      buttonBg: secondary
    };
  }, [brandingConfig?.primaryColor, brandingConfig?.secondaryColor]);

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
      <div className="flex h-screen w-screen items-center justify-center bg-bunker-800">
        <Lottie isAutoPlay icon="infisical_loading" className="h-32 w-32" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Securely Share Secrets{hasCustomBranding ? "" : " | Infisical"}</title>
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
      </Helmet>
      <div
        className={twMerge(
          "relative flex h-screen flex-col justify-between overflow-auto text-gray-200 dark:scheme-dark",
          !backgroundStyle && "bg-linear-to-tr from-mineshaft-700 to-bunker-800"
        )}
        style={backgroundStyle}
      >
        {!brandingTheme && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <svg
              viewBox="0 0 800 800"
              className="h-[900px] w-[900px] opacity-[0.04]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="400" cy="400" r="380" stroke="white" strokeWidth="2" />
              <circle cx="400" cy="400" r="370" stroke="white" strokeWidth="0.5" />

              {Array.from({ length: 24 }).map((_, i) => {
                const angle = (i * 15 * Math.PI) / 180;
                const x = 400 + 375 * Math.cos(angle);
                const y = 400 + 375 * Math.sin(angle);
                return <circle key={`bolt-${i}`} cx={x} cy={y} r="4" fill="white" />;
              })}

              <circle cx="400" cy="400" r="300" stroke="white" strokeWidth="1.5" />
              <circle cx="400" cy="400" r="290" stroke="white" strokeWidth="0.5" />
              {Array.from({ length: 60 }).map((_, i) => {
                const angle = (i * 6 * Math.PI) / 180;
                const innerR = i % 5 === 0 ? 280 : 285;
                const x1 = 400 + innerR * Math.cos(angle);
                const y1 = 400 + innerR * Math.sin(angle);
                const x2 = 400 + 290 * Math.cos(angle);
                const y2 = 400 + 290 * Math.sin(angle);
                return (
                  <line
                    key={`tick-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="white"
                    strokeWidth={i % 5 === 0 ? "1.5" : "0.5"}
                  />
                );
              })}

              <circle cx="400" cy="400" r="200" stroke="white" strokeWidth="1" />
              <circle cx="400" cy="400" r="195" stroke="white" strokeWidth="0.3" />

              {Array.from({ length: 8 }).map((_, i) => {
                const angle = (i * 45 * Math.PI) / 180;
                const x1 = 400 + 200 * Math.cos(angle);
                const y1 = 400 + 200 * Math.sin(angle);
                const x2 = 400 + 300 * Math.cos(angle);
                const y2 = 400 + 300 * Math.sin(angle);
                return (
                  <line
                    key={`spoke-${i}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                );
              })}

              <circle cx="400" cy="400" r="100" stroke="white" strokeWidth="2" />
              <circle cx="400" cy="400" r="80" stroke="white" strokeWidth="0.5" />
              <circle cx="400" cy="400" r="15" fill="white" />

              <line x1="320" y1="400" x2="480" y2="400" stroke="white" strokeWidth="4" strokeLinecap="round" />
              <line x1="400" y1="320" x2="400" y2="480" stroke="white" strokeWidth="4" strokeLinecap="round" />

              <line x1="50" y1="50" x2="150" y2="50" stroke="white" strokeWidth="1" />
              <line x1="50" y1="50" x2="50" y2="150" stroke="white" strokeWidth="1" />
              <line x1="750" y1="50" x2="650" y2="50" stroke="white" strokeWidth="1" />
              <line x1="750" y1="50" x2="750" y2="150" stroke="white" strokeWidth="1" />
              <line x1="50" y1="750" x2="150" y2="750" stroke="white" strokeWidth="1" />
              <line x1="50" y1="750" x2="50" y2="650" stroke="white" strokeWidth="1" />
              <line x1="750" y1="750" x2="650" y2="750" stroke="white" strokeWidth="1" />
              <line x1="750" y1="750" x2="750" y2="650" stroke="white" strokeWidth="1" />
            </svg>
          </div>
        )}

        <div />
        <div className="relative z-10 mx-auto w-full max-w-xl px-4 py-4 md:px-0">
          <div className="mb-8 text-center">
            <div className="mb-4 flex justify-center pt-8">
              {hasCustomBranding ? (
                <img
                  src={logoUrl}
                  height={90}
                  width={120}
                  alt="Logo"
                  className="max-h-24 w-auto object-contain"
                />
              ) : (
                <a target="_blank" rel="noopener noreferrer" href="https://infisical.com">
                  <img
                    src={logoUrl}
                    height={90}
                    width={120}
                    alt="Infisical logo"
                    className="cursor-pointer"
                  />
                </a>
              )}
            </div>
            <h1
              className={twMerge(
                "mt-8 bg-linear-to-b bg-clip-text text-center text-3xl font-medium text-transparent",
                brandingTheme && isLightColor(brandingTheme.primaryColor)
                  ? "from-black to-bunker-500"
                  : "from-white to-bunker-200"
              )}
            >
              Someone shared a secret with you
            </h1>
          </div>
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
          {!brandingTheme && (
            <a
              href="https://infisical.com?utm_source=shared-secret&utm_medium=referral"
              target="_blank"
              rel="noopener noreferrer"
              className="group mt-6 block cursor-pointer rounded-lg border border-primary/40 bg-primary/5 p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-mineshaft-100 transition-colors group-hover:text-white">
                    Protect your secrets with Infisical
                  </p>
                  <p className="mt-0.5 text-xs text-mineshaft-300">
                    Centralize secrets, manage access, and automate rotation — all in one platform.
                  </p>
                </div>
                <span className="rounded-md border border-primary/60 bg-primary/10 px-3 py-1 text-xs font-medium text-white/90 transition-colors group-hover:border-primary group-hover:bg-primary/20">
                  Try free
                </span>
              </div>
            </a>
          )}
        </div>
        <footer className="relative z-10 py-6 text-center">
          <div className="mb-3 flex items-center justify-center gap-4">
            <a href="https://x.com/infisical" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
            <a href="https://www.linkedin.com/company/infisical/" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
            </a>
            <a href="https://www.youtube.com/@infisical_os" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
              <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
            </a>
          </div>
          <p className="text-xs text-mineshaft-400">&copy; 2026 Infisical Inc. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
};
