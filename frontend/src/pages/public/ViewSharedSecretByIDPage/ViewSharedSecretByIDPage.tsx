import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { AxiosError } from "axios";
import { addSeconds, formatISO } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Lottie } from "@app/components/v2";
import { SessionStorageKeys } from "@app/const";
import { ROUTE_PATHS } from "@app/const/routes";
import { useGetActiveSharedSecretById } from "@app/hooks/api/secretSharing";
import {
  PasswordContainer,
  SecretContainer,
  SecretErrorContainer
} from "@app/pages/public/ViewSharedSecretByIDPage/components";

const DEFAULT_LOGO_URL = "/images/gradientLogo.svg";
const DEFAULT_FAVICON_URL = "/infisical.ico";

// Returns true if the color is considered "light"
const isLightColor = (hexColor: string): boolean => {
  const hex = hexColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
};

// Adjusts color brightness by a literal amount (negative for darker, positive for lighter)
const adjustColor = (hexColor: string, amount: number): string => {
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

const extractDetailsFromUrl = (urlEncodedKey: string) => {
  if (urlEncodedKey) {
    const [hashedHex, key] = urlEncodedKey ? urlEncodedKey.toString().split("-") : ["", ""];

    return {
      hashedHex,
      key
    };
  }

  return {
    hashedHex: null,
    key: null
  };
};

export const ViewSharedSecretByIDPage = () => {
  const id = useParams({
    from: ROUTE_PATHS.Public.ViewSharedSecretByIDPage.id,
    select: (el) => el.secretId
  });
  const urlEncodedKey = useSearch({
    from: ROUTE_PATHS.Public.ViewSharedSecretByIDPage.id,
    select: (el) => el.key
  });
  const [password, setPassword] = useState<string>();
  const { hashedHex, key } = extractDetailsFromUrl(urlEncodedKey);

  const {
    data: fetchSecret,
    error,
    isPending,
    isFetching
  } = useGetActiveSharedSecretById({
    sharedSecretId: id,
    hashedHex,
    password
  });

  const navigate = useNavigate();

  const isUnauthorized =
    ((error as AxiosError)?.response?.data as { statusCode: number })?.statusCode === 401;

  const isInvalidCredential =
    ((error as AxiosError)?.response?.data as { message: string })?.message ===
    "Invalid credentials";

  const isEmailUnauthorized =
    ((error as AxiosError)?.response?.data as { message: string })?.message ===
    "Email not authorized to view secret";

  useEffect(() => {
    if (isUnauthorized && !isInvalidCredential && !isEmailUnauthorized) {
      // persist current URL in session storage so that we can come back to this after successful login
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

      navigate({
        to: "/login"
      });

      return;
    }

    if (error) {
      createNotification({
        type: "error",
        text: ((error as AxiosError)?.response?.data as { message: string })?.message
      });
    }
  }, [error]);

  const shouldShowPasswordPrompt =
    isInvalidCredential || (fetchSecret?.isPasswordProtected && !fetchSecret.secret);
  const isValidatingPassword = Boolean(password) && isFetching;

  const brandingConfig = fetchSecret?.brandingConfig;
  const hasCustomBranding = !!brandingConfig;

  // Use proxy URLs for branding assets to avoid cross origin issues
  const logoUrl = brandingConfig?.hasLogo
    ? `/api/v1/secret-sharing/shared/public/${id}/branding/logo`
    : DEFAULT_LOGO_URL;
  const faviconUrl = brandingConfig?.hasFavicon
    ? `/api/v1/secret-sharing/shared/public/${id}/branding/favicon`
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

  if (isPending) {
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
          "flex h-screen flex-col justify-between overflow-auto text-gray-200 dark:scheme-dark",
          !backgroundStyle && "bg-linear-to-tr from-mineshaft-700 to-bunker-800"
        )}
        style={backgroundStyle}
      >
        <div />
        <div className="mx-auto w-full max-w-xl px-4 py-4 md:px-0">
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
                "bg-linear-to-b bg-clip-text text-center text-4xl font-medium text-transparent",
                brandingTheme && isLightColor(brandingTheme.primaryColor)
                  ? "from-black to-bunker-500"
                  : "from-white to-bunker-200"
              )}
            >
              View shared secret
            </h1>
            {!hasCustomBranding && (
              <p className="text-md">
                Powered by{" "}
                <a
                  href="https://github.com/infisical/infisical"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bold bg-linear-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent"
                >
                  Infisical &rarr;
                </a>
              </p>
            )}
          </div>
          {(shouldShowPasswordPrompt || isValidatingPassword) && (
            <PasswordContainer
              isSubmitting={isValidatingPassword}
              onPasswordSubmit={(el) => {
                setPassword(el);
              }}
              isInvalidCredential={!isFetching && isInvalidCredential}
              brandingTheme={brandingTheme}
            />
          )}
          {!isPending && (
            <>
              {!error && !fetchSecret?.error && fetchSecret?.secret && (
                <SecretContainer
                  secret={fetchSecret.secret}
                  secretKey={key}
                  brandingTheme={brandingTheme}
                />
              )}
              {(fetchSecret?.error || (error && !isInvalidCredential && !isUnauthorized)) && (
                <SecretErrorContainer brandingTheme={brandingTheme} />
              )}
            </>
          )}
          {!hasCustomBranding && (
            <>
              <div className="m-auto my-8 flex w-full">
                <div className="w-full border-t border-mineshaft-600" />
              </div>
              <div className="m-auto flex w-full flex-col rounded-md border border-primary-500/30 bg-primary/5 p-6 pt-5">
                <p className="w-full pb-2 text-lg font-medium text-mineshaft-100 md:pb-3 md:text-xl">
                  Open source{" "}
                  <span className="bg-linear-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent">
                    secret management
                  </span>{" "}
                  for developers
                </p>
                <div className="flex flex-col items-start sm:flex-row sm:items-center">
                  <p className="md:text-md text-md mr-4">
                    <a
                      href="https://github.com/infisical/infisical"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bold bg-linear-to-tr from-yellow-500 to-primary-500 bg-clip-text text-transparent"
                    >
                      Infisical
                    </a>{" "}
                    is the all-in-one secret management platform to securely manage secrets,
                    configs, and certificates across your team and infrastructure.
                  </p>
                  <div className="mt-4 cursor-pointer sm:mt-0">
                    <a target="_blank" rel="noopener noreferrer" href="https://infisical.com">
                      <div className="flex items-center justify-between rounded-md border border-mineshaft-400/40 bg-mineshaft-600 px-3 py-2 duration-200 hover:border-primary/60 hover:bg-primary/20 hover:text-white">
                        <p className="mr-4 whitespace-nowrap">Try Infisical</p>
                        <FontAwesomeIcon icon={faArrowRight} />
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        {hasCustomBranding ? (
          <div />
        ) : (
          <div className="w-full bg-mineshaft-600 p-2">
            <p className="text-center text-sm text-mineshaft-300">
              Made with ❤️ by{" "}
              <a className="text-primary" href="https://infisical.com">
                Infisical
              </a>
              <br />
              235 2nd st, San Francisco, California, 94105, United States. 🇺🇸
            </p>
          </div>
        )}
      </div>
    </>
  );
};
