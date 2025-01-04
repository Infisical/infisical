import { FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import HCaptcha from "@hcaptcha/react-hcaptcha";

import Error from "@app/components/basic/Error";
import { RegionSelect } from "@app/components/navigation/RegionSelect";
import { createNotification } from "@app/components/notifications";
import attemptCliLogin from "@app/components/utilities/attemptCliLogin";
import attemptLogin from "@app/components/utilities/attemptLogin";
import { CAPTCHA_SITE_KEY } from "@app/components/utilities/config";
import { Button, IconButton, Input, Tooltip } from "@app/components/v2";
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
};

export const InitialStep = ({ setStep, email, setEmail, password, setPassword }: Props) => {
  const router = useRouter();

  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const { config } = useServerConfig();
  const queryParams = new URLSearchParams(window.location.search);
  const [captchaToken, setCaptchaToken] = useState("");
  const [shouldShowCaptcha, setShouldShowCaptcha] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  const { data: serverDetails } = useFetchServerStatus();

  const { navigateToSelectOrganization } = useNavigateToSelectOrganization();

  const redirectToSaml = (orgSlug: string) => {
    const callbackPort = queryParams.get("callback_port");
    const redirectUrl = `/api/v1/sso/redirect/saml2/organizations/${orgSlug}${
      callbackPort ? `?callback_port=${callbackPort}` : ""
    }`;
    router.push(redirectUrl);
  };

  const redirectToOidc = (orgSlug: string) => {
    const callbackPort = queryParams.get("callback_port");
    const redirectUrl = `/api/v1/sso/oidc/login?orgSlug=${orgSlug}${
      callbackPort ? `&callbackPort=${callbackPort}` : ""
    }`;
    router.push(redirectUrl);
  };

  useEffect(() => {
    if (serverDetails?.samlDefaultOrgSlug) redirectToSaml(serverDetails.samlDefaultOrgSlug);
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

  const shouldDisplayLoginMethod = (method: LoginMethod) =>
    !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      if (!email || !password) {
        return;
      }

      setIsLoading(true);
      if (queryParams && queryParams.get("callback_port")) {
        const callbackPort = queryParams.get("callback_port");

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
          navigateToSelectOrganization();
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

  if (config.defaultAuthOrgAuthEnforced && config.defaultAuthOrgAuthMethod) {
    return (
      <form
        onSubmit={handleLogin}
        className="mx-auto flex w-full flex-col items-center justify-center"
      >
        <h1 className="mb-8 bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
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
      <h1 className="mb-8 bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
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
              router.push("/login/ldap");
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
              onClick={() => {
                const callbackPort = queryParams.get("callback_port");

                window.open(
                  `/api/v1/sso/redirect/google${
                    callbackPort ? `?callback_port=${callbackPort}` : ""
                  }`
                );
                window.close();
              }}
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
              onClick={() => {
                const callbackPort = queryParams.get("callback_port");

                window.open(
                  `/api/v1/sso/redirect/github${
                    callbackPort ? `?callback_port=${callbackPort}` : ""
                  }`
                );

                window.close();
              }}
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
              onClick={() => {
                const callbackPort = queryParams.get("callback_port");

                window.open(
                  `/api/v1/sso/redirect/gitlab${
                    callbackPort ? `?callback_port=${callbackPort}` : ""
                  }`
                );

                window.close();
              }}
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
          {shouldShowCaptcha && (
            <div className="mt-4">
              <HCaptcha
                theme="dark"
                sitekey={CAPTCHA_SITE_KEY}
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
          <Link href="/signup">
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
          <Link href="/verify-email">
            <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
              Forgot password? Recover your account
            </span>
          </Link>
        </div>
      )}
    </form>
  );
};
