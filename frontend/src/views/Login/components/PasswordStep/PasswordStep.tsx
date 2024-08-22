import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import axios from "axios";
import { addSeconds, formatISO } from "date-fns";
import jwt_decode from "jwt-decode";

import { createNotification } from "@app/components/notifications";
import attemptCliLogin from "@app/components/utilities/attemptCliLogin";
import attemptLogin from "@app/components/utilities/attemptLogin";
import { CAPTCHA_SITE_KEY } from "@app/components/utilities/config";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, Input, Spinner } from "@app/components/v2";
import { SessionStorageKeys } from "@app/const";
import { useOauthTokenExchange, useSelectOrganization } from "@app/hooks/api";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { fetchMyPrivateKey } from "@app/hooks/api/users/queries";

import { navigateUserToOrg, useNavigateToSelectOrganization } from "../../Login.utils";

type Props = {
  providerAuthToken: string;
  email: string;
  password: string;
  setPassword: (password: string) => void;
  setStep: (step: number) => void;
};

export const PasswordStep = ({
  providerAuthToken,
  email,
  password,
  setPassword,
  setStep
}: Props) => {
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation();
  const router = useRouter();
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const { mutateAsync: oauthTokenExchange } = useOauthTokenExchange();

  const { navigateToSelectOrganization } = useNavigateToSelectOrganization();

  const { callbackPort, organizationId, hasExchangedPrivateKey } = jwt_decode(
    providerAuthToken
  ) as any;

  const handleExchange = async () => {
    try {
      setIsLoading(true);
      const oauthLogin = await oauthTokenExchange({
        email,
        providerAuthToken
      });

      // attemptCliLogin
      if (oauthLogin.mfaEnabled) {
        SecurityClient.setMfaToken(oauthLogin.token);
        // case: login requires MFA step
        setStep(2);
        setIsLoading(false);
        return;
      }
      const cliUrl = `http://127.0.0.1:${callbackPort}/`;

      // case: MFA is not enabled

      // unset provider auth token in case it was used
      SecurityClient.setProviderAuthToken("");
      // set JWT token
      SecurityClient.setToken(oauthLogin.token);

      const privateKey = await fetchMyPrivateKey();
      localStorage.setItem("PRIVATE_KEY", privateKey);

      // case: organization ID is present from the provider auth token -- select the org and use the new jwt token in the CLI, then navigate to the org
      if (organizationId) {
        const { token: newJwtToken } = await selectOrganization({ organizationId });
        if (callbackPort) {
          console.log("organization id was present. new JWT token to be used in CLI:", newJwtToken);
          const instance = axios.create();
          const payload = {
            privateKey,
            email,
            JTWToken: newJwtToken
          };
          await instance.post(cliUrl, payload).catch(() => {
            // if error happens to communicate we set the token with an expiry in sessino storage
            // the cli-redirect page has logic to show this to user and ask them to paste it in terminal
            sessionStorage.setItem(
              SessionStorageKeys.CLI_TERMINAL_TOKEN,
              JSON.stringify({
                expiry: formatISO(addSeconds(new Date(), 30)),
                data: window.btoa(JSON.stringify(payload))
              })
            );
          });
          router.push("/cli-redirect");
          return;
        }

        await navigateUserToOrg(router, organizationId);
      }
      // case: no organization ID is present -- navigate to the select org page IF the user has any orgs
      // if the user has no orgs, navigate to the create org page
      else {
        const userOrgs = await fetchOrganizations();

        // case: user has orgs, so we navigate the user to select an org
        if (userOrgs.length > 0) {
          navigateToSelectOrganization(callbackPort);
        }
        // case: no orgs found, so we navigate the user to create an org
        else {
          await navigateUserToOrg(router);
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      console.error(err);

      if (err.response.data.error === "User Locked") {
        createNotification({
          title: err.response.data.error,
          text: err.response.data.message,
          type: "error"
        });
        return;
      }

      createNotification({
        text: "Login unsuccessful. Double-check your master password and try again.",
        type: "error"
      });
    }
  };

  useEffect(() => {
    if (hasExchangedPrivateKey) {
      handleExchange();
    }
  }, []);

  const [captchaToken, setCaptchaToken] = useState("");
  const [shouldShowCaptcha, setShouldShowCaptcha] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsLoading(true);

      if (callbackPort) {
        // attemptCliLogin
        const isCliLoginSuccessful = await attemptCliLogin({
          email,
          password,
          providerAuthToken,
          captchaToken
        });

        if (isCliLoginSuccessful && isCliLoginSuccessful.success) {
          if (isCliLoginSuccessful.mfaEnabled) {
            // case: login requires MFA step
            setStep(2);
            setIsLoading(false);
            return;
          }
          const cliUrl = `http://127.0.0.1:${callbackPort}/`;

          // case: organization ID is present from the provider auth token -- select the org and use the new jwt token in the CLI, then navigate to the org
          if (organizationId) {
            const { token: newJwtToken } = await selectOrganization({ organizationId });

            console.log(
              "organization id was present. new JWT token to be used in CLI:",
              newJwtToken
            );

            const instance = axios.create();
            const payload = {
              ...isCliLoginSuccessful.loginResponse,
              JTWToken: newJwtToken
            };
            await instance.post(cliUrl, payload).catch(() => {
              // if error happens to communicate we set the token with an expiry in sessino storage
              // the cli-redirect page has logic to show this to user and ask them to paste it in terminal
              sessionStorage.setItem(
                SessionStorageKeys.CLI_TERMINAL_TOKEN,
                JSON.stringify({
                  expiry: formatISO(addSeconds(new Date(), 30)),
                  data: window.btoa(JSON.stringify(payload))
                })
              );
            });
            router.push("/cli-redirect");
            return;
          }
          // case: no organization ID is present -- navigate to the select org page IF the user has any orgs
          // if the user has no orgs, navigate to the create org page
          const userOrgs = await fetchOrganizations();

          // case: user has orgs, so we navigate the user to select an org
          if (userOrgs.length > 0) {
            navigateToSelectOrganization(callbackPort);
          }
          // case: no orgs found, so we navigate the user to create an org
          else {
            await navigateUserToOrg(router);
          }
        }
      } else {
        const loginAttempt = await attemptLogin({
          email,
          password,
          providerAuthToken,
          captchaToken
        });

        if (loginAttempt && loginAttempt.success) {
          // case: login was successful

          if (loginAttempt.mfaEnabled) {
            // TODO: deal with MFA
            // case: login requires MFA step
            setIsLoading(false);
            setStep(2);
            return;
          }

          // case: login does not require MFA step
          setIsLoading(false);
          createNotification({
            text: "Successfully logged in",
            type: "success"
          });

          // case: organization ID is present from the provider auth token -- navigate directly to the org
          if (organizationId) {
            await navigateUserToOrg(router, organizationId);
          }
          // case: no organization ID is present -- navigate to the select org page IF the user has any orgs
          // if the user has no orgs, navigate to the create org page
          else {
            const userOrgs = await fetchOrganizations();

            if (userOrgs.length > 0) {
              navigateToSelectOrganization();
            } else {
              await navigateUserToOrg(router);
            }
          }
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      console.error(err);

      if (err.response.data.error === "User Locked") {
        createNotification({
          title: err.response.data.error,
          text: err.response.data.message,
          type: "error"
        });
        return;
      }

      if (err.response.data.error === "Captcha Required") {
        setShouldShowCaptcha(true);
        return;
      }

      createNotification({
        text: "Login unsuccessful. Double-check your master password and try again.",
        type: "error"
      });
    }

    if (captchaRef.current) {
      captchaRef.current.resetCaptcha();
    }
    setCaptchaToken("");
  };

  if (hasExchangedPrivateKey) {
    return (
      <div className="flex max-h-screen min-h-screen flex-col items-center justify-center gap-2 overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700">
        <Spinner />
        <p className="text-white opacity-80">Loading, please wait</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleLogin} className="mx-auto h-full w-full max-w-md px-6 pt-8">
      <div className="mb-8">
        <p className="mx-auto mb-4 flex w-max justify-center bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-center text-xl font-medium text-transparent">
          What&apos;s your Infisical password?
        </p>
      </div>
      <div className="relative mx-auto flex max-h-24 w-1/4 w-full min-w-[22rem] items-center justify-center rounded-lg md:max-h-28 lg:w-1/6">
        <div className="flex max-h-24 w-full items-center justify-center rounded-lg md:max-h-28">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Enter your password..."
            isRequired
            autoComplete="current-password"
            id="current-password"
            className="h-12"
          />
        </div>
      </div>
      {shouldShowCaptcha && (
        <div className="mx-auto mt-4 flex w-full min-w-[22rem] items-center justify-center lg:w-1/6">
          <HCaptcha
            theme="dark"
            sitekey={CAPTCHA_SITE_KEY}
            onVerify={(token) => setCaptchaToken(token)}
            ref={captchaRef}
          />
        </div>
      )}
      <div className="mx-auto mt-4 flex w-1/4 w-full min-w-[22rem] items-center justify-center rounded-md text-center lg:w-1/6">
        <Button
          disabled={shouldShowCaptcha && captchaToken === ""}
          type="submit"
          colorSchema="primary"
          variant="outline_bg"
          isFullWidth
          isLoading={isLoading}
          className="h-14"
        >
          {t("login.login")}
        </Button>
      </div>
      <div className="mx-auto mt-4 flex w-max flex-col items-center text-xs text-bunker-400">
        <span className="max-w-sm px-4 text-center duration-200">
          Infisical Master Password serves as a decryption mechanism so that even Google is not able
          to access your secrets.
        </span>
        <Link href="/verify-email">
          <span className="mt-2 cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
            {t("login.forgot-password")}
          </span>
        </Link>
      </div>
      <div className="flex flex-row items-center justify-center">
        <button
          onClick={() => {
            router.push("/login");
          }}
          type="button"
          className="mt-2 cursor-pointer text-xs text-bunker-400 duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4"
        >
          {t("login.other-option")}
        </button>
      </div>
    </form>
  );
};
