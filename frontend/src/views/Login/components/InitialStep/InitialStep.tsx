import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import { faGithub, faGitlab, faGoogle } from "@fortawesome/free-brands-svg-icons";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Error from "@app/components/basic/Error";
import { createNotification } from "@app/components/notifications";
import attemptCliLogin from "@app/components/utilities/attemptCliLogin";
import attemptLogin from "@app/components/utilities/attemptLogin";
import { Button, Input } from "@app/components/v2";
import { useServerConfig } from "@app/context";

import { navigateUserToSelectOrg } from "../../Login.utils";

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

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SAML_ORG_SLUG && process.env.NEXT_PUBLIC_SAML_ORG_SLUG !== "saml-org-slug-default") {
      const callbackPort = queryParams.get("callback_port");
      window.open(
        `/api/v1/sso/redirect/saml2/organizations/${process.env.NEXT_PUBLIC_SAML_ORG_SLUG}${
          callbackPort ? `?callback_port=${callbackPort}` : ""
        }`
      );
      window.close();
    }
  }, [])

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
          password
        });

        if (isCliLoginSuccessful && isCliLoginSuccessful.success) {
          if (isCliLoginSuccessful.mfaEnabled) {
            // case: login requires MFA step
            setStep(1);
            setIsLoading(false);
            return;
          }

          navigateUserToSelectOrg(router, callbackPort!);
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
          password
        });

        if (isLoginSuccessful && isLoginSuccessful.success) {
          // case: login was successful

          if (isLoginSuccessful.mfaEnabled) {
            // case: login requires MFA step
            setStep(1);
            setIsLoading(false);
            return;
          }

          navigateUserToSelectOrg(router);

          // case: login does not require MFA step
          createNotification({
            text: "Successfully logged in",
            type: "success"
          });
        }
      }
    } catch (err) {
      console.error(err);
      setLoginError(true);
      createNotification({
        text: "Login unsuccessful. Double-check your credentials and try again.",
        type: "error"
      });
    }

    setIsLoading(false);
  };

  return (
    <form
      onSubmit={handleLogin}
      className="mx-auto flex w-full flex-col items-center justify-center"
    >
      <h1 className="mb-8 bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
        Login to Infisical
      </h1>
      <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
          colorSchema="primary"
          variant="outline_bg"
          onClick={() => {
            const callbackPort = queryParams.get("callback_port");

            window.open(
              `/api/v1/sso/redirect/google${callbackPort ? `?callback_port=${callbackPort}` : ""}`
            );
            window.close();
          }}
          leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-2" />}
          className="mx-0 h-10 w-full"
        >
          {t("login.continue-with-google")}
        </Button>
      </div>
      <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
          colorSchema="primary"
          variant="outline_bg"
          onClick={() => {
            const callbackPort = queryParams.get("callback_port");

            window.open(
              `/api/v1/sso/redirect/github${callbackPort ? `?callback_port=${callbackPort}` : ""}`
            );

            window.close();
          }}
          leftIcon={<FontAwesomeIcon icon={faGithub} className="mr-2" />}
          className="mx-0 h-10 w-full"
        >
          Continue with GitHub
        </Button>
      </div>
      <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
          colorSchema="primary"
          variant="outline_bg"
          onClick={() => {
            const callbackPort = queryParams.get("callback_port");

            window.open(
              `/api/v1/sso/redirect/gitlab${callbackPort ? `?callback_port=${callbackPort}` : ""}`
            );

            window.close();
          }}
          leftIcon={<FontAwesomeIcon icon={faGitlab} className="mr-2" />}
          className="mx-0 h-10 w-full"
        >
          Continue with GitLab
        </Button>
      </div>
      <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
          colorSchema="primary"
          variant="outline_bg"
          onClick={() => {
            setStep(2);
          }}
          leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
          className="mx-0 h-10 w-full"
        >
          Continue with SAML
        </Button>
      </div>
      <div className="mt-2 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
          colorSchema="primary"
          variant="outline_bg"
          onClick={() => {
            setStep(3);
          }}
          leftIcon={<FontAwesomeIcon icon={faLock} className="mr-2" />}
          className="mx-0 h-10 w-full"
        >
          Continue with LDAP
        </Button>
      </div>
      <div className="my-4 flex w-1/4 min-w-[20rem] flex-row items-center py-2 lg:w-1/6">
        <div className="w-full border-t border-mineshaft-400/60" />
        <span className="mx-2 text-xs text-mineshaft-200">or</span>
        <div className="w-full border-t border-mineshaft-400/60" />
      </div>
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
      <div className="mt-3 w-1/4 min-w-[21.2rem] rounded-md text-center md:min-w-[20.1rem] lg:w-1/6">
        <Button
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
      {!isLoading && loginError && <Error text={t("login.error-login") ?? ""} />}
      {config.allowSignUp ? (
        <div className="mt-6 flex flex-row text-sm text-bunker-400">
          <Link href="/signup">
            <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
              Don&apos;t have an acount yet? {t("login.create-account")}
            </span>
          </Link>
        </div>
      ) : (
        <div className="mt-4" />
      )}
      <div className="mt-2 flex flex-row text-sm text-bunker-400">
        <Link href="/verify-email">
          <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
            Forgot password? Recover your account
          </span>
        </Link>
      </div>
    </form>
  );
};
