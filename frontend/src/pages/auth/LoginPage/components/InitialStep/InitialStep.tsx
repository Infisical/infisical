import { FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";

import Error from "@app/components/basic/Error";
import { RegionSelect } from "@app/components/navigation/RegionSelect";
import { createNotification } from "@app/components/notifications";
import attemptCliLogin from "@app/components/utilities/attemptCliLogin";
import attemptLogin from "@app/components/utilities/attemptLogin";
import { Button, IconButton, Input, Tooltip } from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useServerConfig } from "@app/context";
import { useFetchServerStatus } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";
import { AuthMethod } from "@app/hooks/api/users/types";

import { useNavigateToSelectOrganization } from "../../Login.utils";

type Props = {
  setStep: (step: number) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (email: string) => void;
  isAdmin?: boolean;
};

export const InitialStep = ({
  setStep,
  email,
  setEmail,
  password,
  setPassword,
  isAdmin
}: Props) => {
  const navigate = useNavigate();
  const queryParams = useSearch({ from: "/_restrict-login-signup" });

  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const { config } = useServerConfig();
  const [captchaToken, setCaptchaToken] = useState("");
  const [shouldShowCaptcha, setShouldShowCaptcha] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  const { data: serverDetails } = useFetchServerStatus();

  const { navigateToSelectOrganization } = useNavigateToSelectOrganization();

  const redirectToSaml = (orgSlug: string) => {
    const callbackPort = queryParams.callback_port?.toString();
    const redirectUrl = `/api/v1/sso/redirect/saml2/organizations/${orgSlug}${
      callbackPort ? `?callback_port=${callbackPort}` : ""
    }`;

    window.location.assign(redirectUrl);
  };

  const redirectToOidc = (orgSlug: string) => {
    const callbackPort = queryParams.callback_port?.toString();
    const redirectUrl = `/api/v1/sso/oidc/login?orgSlug=${orgSlug}${
      callbackPort ? `&callbackPort=${callbackPort}` : ""
    }`;

    window.location.assign(redirectUrl);
  };

  useEffect(() => {
    if (serverDetails?.samlDefaultOrgSlug && !isAdmin) {
      redirectToSaml(serverDetails.samlDefaultOrgSlug);
    }
  }, [serverDetails?.samlDefaultOrgSlug]);

  const handleSaml = () => {
    if (config.defaultAuthOrgSlug) {
      redirectToSaml(config.defaultAuthOrgSlug);
    } else {
      setStep(2);
    }
  };

  const handleOidc = () => {
    if (config.defaultAuthOrgSlug) {
      redirectToOidc(config.defaultAuthOrgSlug);
    } else {
      setStep(3);
    }
  };

  const handleOauth = (provider: string) => {
    const params = new URLSearchParams();

    if (queryParams.callback_port != null) {
      params.set("callback_port", String(queryParams.callback_port));
    }

    if (isAdmin) {
      params.append("is_admin_login", "true");
    }

    const queryString = params.toString();

    navigate({
      href: `/api/v1/sso/redirect/${provider}${queryString ? `?${queryString}` : ""}`,
      reloadDocument: true
    });
  };

  const shouldDisplayLoginMethod = (method: LoginMethod) =>
    isAdmin || !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (!email || !password) {
        return;
      }

      setIsLoading(true);
      if (queryParams.callback_port) {
        const callbackPort = queryParams.callback_port.toString();

        // attemptCliLogin
        const isCliLoginSuccessful = await attemptCliLogin({
          email: email.toLowerCase(),
          password,
          captchaToken
        });

        if (isCliLoginSuccessful && isCliLoginSuccessful.success) {
          navigateToSelectOrganization(callbackPort!);
        } else {
          setLoginError(true);
          createNotification({
            text: "CLI login unsuccessful. Double-check your credentials and try again.",
            type: "error"
          });
        }
      } else {
        const isLoginSuccessful = await attemptLogin({
          email: email.toLowerCase(),
          password,
          captchaToken
        });

        if (isLoginSuccessful && isLoginSuccessful.success) {
          // case: login was successful
          navigateToSelectOrganization(undefined, isAdmin);
          createNotification({
            text: "Successfully logged in",
            type: "success"
          });
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.response.data.error === "User Locked") {
        createNotification({
          title: err.response.data.error,
          text: err.response.data.message,
          type: "error"
        });
        setIsLoading(false);
        return;
      }

      if (err.response.data.error === "Captcha Required") {
        setShouldShowCaptcha(true);
        setIsLoading(false);
        return;
      }

      setLoginError(true);
      createNotification({
        text: "Login unsuccessful. Double-check your credentials and try again.",
        type: "error"
      });
    }

    if (captchaRef.current) {
      captchaRef.current.resetCaptcha();
    }

    setCaptchaToken("");
    setIsLoading(false);
  };

  if (config.defaultAuthOrgAuthEnforced && config.defaultAuthOrgAuthMethod && !isAdmin) {
    return (
      <form
        onSubmit={handleLogin}
        className="mx-auto flex w-full flex-col items-center justify-center"
      >
        <h1 className="mb-8 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
          Login to Infisical
        </h1>
        <RegionSelect />
        {config.defaultAuthOrgAuthMethod === AuthMethod.SAML && (
          <div className="w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
            <Button
              colorSchema="primary"
              variant="outline_bg"
              onClick={handleSaml}
              leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
              className="mx-0 h-10 w-full"
            >
              Continue with SAML
            </Button>
          </div>
        )}
        {config.defaultAuthOrgAuthMethod === AuthMethod.OIDC && (
          <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
            <Button
              colorSchema="primary"
              variant="outline_bg"
              onClick={handleOidc}
              leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
              className="mx-0 h-10 w-full"
            >
              Continue with OIDC
            </Button>
          </div>
        )}
      </form>
    );
  }

  return (
    <form
      onSubmit={handleLogin}
      className="mx-auto flex w-full flex-col items-center justify-center"
    >
      <h1 className="mb-8 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
        Login to Infisical
      </h1>
      <RegionSelect />
      {shouldDisplayLoginMethod(LoginMethod.SAML) && (
        <div className="w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
          <Button
            colorSchema="primary"
            variant="outline_bg"
            onClick={handleSaml}
            leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
            className="mx-0 h-10 w-full"
          >
            Continue with SAML
          </Button>
        </div>
      )}
      {shouldDisplayLoginMethod(LoginMethod.OIDC) && (
        <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
          <Button
            colorSchema="primary"
            variant="outline_bg"
            onClick={handleOidc}
            leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
            className="mx-0 h-10 w-full"
          >
            Continue with OIDC
          </Button>
        </div>
      )}
      {shouldDisplayLoginMethod(LoginMethod.LDAP) && (
        <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
          <Button
            colorSchema="primary"
            variant="outline_bg"
            onClick={() => {
              navigate({ to: "/login/ldap" });
            }}
            leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
            className="mx-0 h-10 w-full"
          >
            Continue with LDAP
          </Button>
        </div>
      )}
      <div className="mt-2 flex w-1/4 min-w-[21.2rem] gap-2 md:min-w-[20.1rem] lg:w-1/6">
        {shouldDisplayLoginMethod(LoginMethod.GOOGLE) && (
          <Tooltip position="bottom" content={t("login.continue-with-google")}>
            <IconButton
              ariaLabel={t("login.continue-with-google")}
              colorSchema="primary"
              variant="outline_bg"
              onClick={() => handleOauth("google")}
              className="h-10 w-full bg-mineshaft-600"
            >
              <FontAwesomeIcon icon={faGoogle} />
            </IconButton>
          </Tooltip>
        )}
        {shouldDisplayLoginMethod(LoginMethod.GITHUB) && (
          <Tooltip position="bottom" content="Continue with GitHub">
            <IconButton
              ariaLabel="Login continue with GitHub"
              colorSchema="primary"
              variant="outline_bg"
              onClick={() => handleOauth("github")}
              className="h-10 w-full bg-mineshaft-600"
            >
              <FontAwesomeIcon icon={faGithub} />
            </IconButton>
          </Tooltip>
        )}
        {shouldDisplayLoginMethod(LoginMethod.GITLAB) && (
          <Tooltip position="bottom" content="Continue with GitLab">
            <IconButton
              ariaLabel="Login continue with GitLab"
              colorSchema="primary"
              variant="outline_bg"
              onClick={() => handleOauth("gitlab")}
              className="h-10 w-full bg-mineshaft-600"
            >
              <FontAwesomeIcon icon={faGitlab} />
            </IconButton>
          </Tooltip>
        )}
      </div>
      {(!config.enabledLoginMethods ||
        (shouldDisplayLoginMethod(LoginMethod.EMAIL) && config.enabledLoginMethods.length > 1)) && (
        <div className="my-4 flex w-1/4 min-w-[20rem] flex-row items-center py-2 lg:w-1/6">
          <div className="w-full border-t border-mineshaft-400/60" />
          <span className="mx-2 text-xs text-mineshaft-200">or</span>
          <div className="w-full border-t border-mineshaft-400/60" />
        </div>
      )}
      {shouldDisplayLoginMethod(LoginMethod.EMAIL) && (
        <>
          <div className="w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="Enter your email..."
              isRequired
              autoComplete="username"
              className="h-10"
            />
          </div>
          <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Enter your password..."
              isRequired
              autoComplete="current-password"
              id="current-password"
              className="select:-webkit-autofill:focus h-10"
            />
          </div>
          {shouldShowCaptcha && envConfig.CAPTCHA_SITE_KEY && (
            <div className="mt-4">
              <HCaptcha
                theme="dark"
                sitekey={envConfig.CAPTCHA_SITE_KEY}
                onVerify={(token) => setCaptchaToken(token)}
                ref={captchaRef}
              />
            </div>
          )}
          <div className="mt-4 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
            <Button
              disabled={shouldShowCaptcha && captchaToken === ""}
              type="submit"
              size="sm"
              isFullWidth
              className="h-10"
              colorSchema="primary"
              variant="solid"
              isLoading={isLoading}
            >
              {" "}
              Continue with Email{" "}
            </Button>
          </div>
        </>
      )}
      {!isLoading && loginError && <Error text={t("login.error-login") ?? ""} />}
      {config.allowSignUp &&
      (shouldDisplayLoginMethod(LoginMethod.EMAIL) ||
        shouldDisplayLoginMethod(LoginMethod.GOOGLE) ||
        shouldDisplayLoginMethod(LoginMethod.GITHUB) ||
        shouldDisplayLoginMethod(LoginMethod.GITLAB)) ? (
        <div className="mt-6 flex flex-row text-sm text-bunker-400">
          <Link to="/signup">
            <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
              Don&apos;t have an account yet? {t("login.create-account")}
            </span>
          </Link>
        </div>
      ) : (
        <div className="mt-4" />
      )}
      {shouldDisplayLoginMethod(LoginMethod.EMAIL) && (
        <div className="mt-2 flex flex-row text-sm text-bunker-400">
          <Link to="/verify-email">
            <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
              Forgot password? Recover your account
            </span>
          </Link>
        </div>
      )}
    </form>
  );
};
