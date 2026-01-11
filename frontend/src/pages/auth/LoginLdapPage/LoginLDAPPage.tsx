import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { Button, Input } from "@app/components/v2";
import { useServerConfig } from "@app/context";
import { loginLDAPRedirect } from "@app/hooks/api/auth/queries";

export const LoginLdapPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { config } = useServerConfig();
  const queryParams = new URLSearchParams(window.location.search);
  const passedOrgSlug = queryParams.get("organizationSlug");
  const passedUsername = queryParams.get("username");

  const [organizationSlug, setOrganizationSlug] = useState(
    config.defaultAuthOrgSlug || passedOrgSlug || ""
  );
  const [username, setUsername] = useState(passedUsername || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { nextUrl } = await loginLDAPRedirect({
        organizationSlug,
        username,
        password
      });

      if (!nextUrl) {
        createNotification({
          text: "Login unsuccessful. Double-check your credentials and try again.",
          type: "error"
        });

        return;
      }

      createNotification({
        text: "Successfully logged in",
        type: "success"
      });

      window.open(nextUrl);
      window.close();
    } catch {
      createNotification({
        text: "Login unsuccessful. Double-check your credentials and try again.",
        type: "error"
      });
    }

    // TODO: add callback port support

    // const callbackPort = queryParams.get("callback_port");
    // window.open(`/api/v1/ldap/redirect/saml2/${ssoIdentifier}${callbackPort ? `?callback_port=${callbackPort}` : ""}`);
    // window.close();
  };

  return (
    <div className="flex h-screen flex-col justify-center bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28">
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <Link to="/">
        <div className="mt-20 mb-4 flex justify-center">
          <img
            src="/images/gradientLogo.svg"
            style={{
              height: "90px",
              width: "120px"
            }}
            alt="Infisical logo"
          />
        </div>
      </Link>
      <div className="mx-auto w-full max-w-md md:px-6">
        <p className="mx-auto mb-8 flex w-max justify-center bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
          What&apos;s your LDAP Login?
        </p>
        <form onSubmit={handleSubmission}>
          {!config.defaultAuthOrgSlug && !passedOrgSlug && (
            <div className="relative mx-auto flex max-h-24 w-full min-w-[20rem] items-center justify-center rounded-lg md:max-h-28 md:min-w-88 lg:w-1/6">
              <div className="flex max-h-24 w-full items-center justify-center rounded-lg md:max-h-28">
                <Input
                  value={organizationSlug}
                  onChange={(e) => setOrganizationSlug(e.target.value)}
                  type="text"
                  placeholder="Enter your organization slug..."
                  isRequired
                  autoComplete="email"
                  id="email"
                  className="h-12"
                />
              </div>
            </div>
          )}
          <div className="relative mx-auto mt-2 flex max-h-24 w-full min-w-[20rem] items-center justify-center rounded-lg md:max-h-28 md:min-w-88 lg:w-1/6">
            <div className="flex max-h-24 w-full items-center justify-center rounded-lg md:max-h-28">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                type="text"
                placeholder="Enter your LDAP username..."
                isRequired
                autoComplete="email"
                id="email"
                className="h-12"
                isDisabled={passedUsername !== null}
              />
            </div>
          </div>
          <div className="relative mx-auto mt-2 flex max-h-24 w-full min-w-[20rem] items-center justify-center rounded-lg md:max-h-28 md:min-w-88 lg:w-1/6">
            <div className="flex max-h-24 w-full items-center justify-center rounded-lg md:max-h-28">
              <Input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Enter your LDAP password..."
                isRequired
                autoComplete="current-password"
                id="current-password"
                className="select:-webkit-autofill:focus h-10"
                rightIcon={
                  <button
                    type="button"
                    onClick={() => {
                      setShowPassword((prev) => !prev);
                    }}
                    className="cursor-pointer self-end text-gray-400"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <FontAwesomeIcon size="sm" icon={faEyeSlash} />
                    ) : (
                      <FontAwesomeIcon size="sm" icon={faEye} />
                    )}
                  </button>
                }
              />
            </div>
          </div>
          <div className="mx-auto mt-4 flex w-full min-w-[20rem] items-center justify-center rounded-md text-center md:min-w-88 lg:w-1/6">
            <Button
              type="submit"
              colorSchema="primary"
              variant="outline_bg"
              isFullWidth
              className="h-14"
            >
              {t("login.login")}
            </Button>
          </div>
        </form>
        <div className="mt-4 flex flex-row items-center justify-center">
          <button
            onClick={() => {
              navigate({ to: "/login" });
            }}
            type="button"
            className="mt-2 cursor-pointer text-sm text-bunker-300 duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4"
          >
            {t("login.other-option")}
          </button>
        </div>
      </div>
    </div>
  );
};
