import React, { useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import axios from "axios";
import { addSeconds, formatISO } from "date-fns";
import jwt_decode from "jwt-decode";

import Error from "@app/components/basic/Error";
import { createNotification } from "@app/components/notifications";
import attemptCliLoginMfa from "@app/components/utilities/attemptCliLoginMfa";
import attemptLoginMfa from "@app/components/utilities/attemptLoginMfa";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button } from "@app/components/v2";
import { SessionStorageKeys } from "@app/const";
import { useSendMfaToken } from "@app/hooks/api/auth";
import { useSelectOrganization, verifyMfaToken } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { fetchMyPrivateKey } from "@app/hooks/api/users/queries";

import { navigateUserToOrg, useNavigateToSelectOrganization } from "../../Login.utils";

// The style for the verification code input
const props = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "48px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "48px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;

type Props = {
  email: string;
  password: string;
  providerAuthToken?: string;
  callbackPort?: string | null;
};

export const MFAStep = ({ email, password, providerAuthToken }: Props) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const { navigateToSelectOrganization } = useNavigateToSelectOrganization();
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);

  const { t } = useTranslation();

  const sendMfaToken = useSendMfaToken();
  const { mutateAsync: selectOrganization } = useSelectOrganization();

  // They don't have password
  const handleLoginMfaOauth = async (callbackPort: string, organizationId?: string) => {
    setIsLoading(true);
    const { token } = await verifyMfaToken({
      email,
      mfaCode
    });
    //
    // unset temporary (MFA) JWT token and set JWT token
    SecurityClient.setMfaToken("");
    SecurityClient.setToken(token);
    SecurityClient.setProviderAuthToken("");
    const privateKey = await fetchMyPrivateKey();
    localStorage.setItem("PRIVATE_KEY", privateKey);

    // case: organization ID is present from the provider auth token -- select the org and use the new jwt token in the CLI, then navigate to the org
    if (organizationId) {
      const { token: newJwtToken } = await selectOrganization({ organizationId });
      if (callbackPort) {
        const cliUrl = `http://127.0.0.1:${callbackPort}/`;
        const instance = axios.create();
        const payload = {
          email,
          privateKey,
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
      // cli login will fail in this case
      else {
        await navigateUserToOrg(router);
      }
    }
  };

  const handleLoginMfa = async () => {
    try {
      let callbackPort: undefined | string;
      let organizationId: undefined | string;
      let hasExchangedPrivateKey: undefined | boolean;

      const queryParams = new URLSearchParams(window.location.search);

      callbackPort = queryParams.get("callback_port") || undefined;

      if (providerAuthToken) {
        const decodedToken = jwt_decode(providerAuthToken) as any;

        callbackPort = decodedToken.callbackPort;
        organizationId = decodedToken?.organizationId;
        hasExchangedPrivateKey = decodedToken?.hasExchangedPrivateKey;
      }

      if (mfaCode.length !== 6) {
        createNotification({
          text: "Please enter a 6-digit MFA code and try again",
          type: "error"
        });
        return;
      }

      if (hasExchangedPrivateKey) {
        await handleLoginMfaOauth(callbackPort as string, organizationId);
        return;
      }

      setIsLoading(true);
      if (callbackPort) {
        // attemptCliLogin
        const isCliLoginSuccessful = await attemptCliLoginMfa({
          email,
          password,
          providerAuthToken,
          mfaToken: mfaCode
        });

        if (isCliLoginSuccessful && isCliLoginSuccessful.success) {
          const cliUrl = `http://127.0.0.1:${callbackPort}/`;

          // case: organization ID is present from the provider auth token -- select the org and use the new jwt token in the CLI, then navigate to the org
          if (organizationId) {
            const { token: newJwtToken } = await selectOrganization({ organizationId });

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
            // cli login will fail in this case
            else {
              await navigateUserToOrg(router);
            }
          
        }
      } else {
        const isLoginSuccessful = await attemptLoginMfa({
          email,
          password,
          providerAuthToken,
          mfaToken: mfaCode
        });

        if (isLoginSuccessful) {
          setIsLoading(false);

          // case: login does not require MFA step
          createNotification({
            text: "Successfully logged in",
            type: "success"
          });

          if (organizationId) {
            await navigateUserToOrg(router, organizationId);
          } else {
            navigateToSelectOrganization();
          }
        } else {
          createNotification({
            text: "Failed to log in",
            type: "error"
          });
        }
      }
    } catch (err: any) {
      if (err.response.data.error === "User Locked") {
        createNotification({
          title: err.response.data.error,
          text: err.response.data.message,
          type: "error"
        });
        setIsLoading(false);
        return;
      }

      createNotification({
        text: "Failed to log in",
        type: "error"
      });

      if (triesLeft) {
        setTriesLeft((left) => {
          if (triesLeft === 1) {
            router.push("/");
          }
          return (left as number) - 1;
        });
      } else {
        setTriesLeft(2);
      }

      setIsLoading(false);
    }
  };

  const handleResendMfaCode = async () => {
    try {
      setIsLoadingResend(true);
      await sendMfaToken.mutateAsync({ email });
      setIsLoadingResend(false);
    } catch (err) {
      console.error(err);
      setIsLoadingResend(false);
    }
  };

  return (
    <form className="mx-auto w-max pb-4 pt-4 md:mb-16 md:px-8">
      <p className="text-l flex justify-center text-bunker-300">{t("mfa.step2-message")}</p>
      <p className="text-l my-1 flex justify-center font-semibold text-bunker-300">{email} </p>
      <div className="mx-auto hidden w-max min-w-[20rem] md:block">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setMfaCode}
          {...props}
          className="mt-6 mb-2"
        />
      </div>
      <div className="mx-auto mt-4 block w-max md:hidden">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setMfaCode}
          {...props}
          className="mt-2 mb-2"
        />
      </div>
      {typeof triesLeft === "number" && (
        <Error text={`Invalid code. You have ${triesLeft} attempt(s) remaining.`} />
      )}
      <div className="mx-auto mt-2 flex w-1/4 min-w-[20rem] max-w-xs flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-[19%]">
        <div className="text-l w-full py-1 text-lg">
          <Button
            onClick={() => handleLoginMfa()}
            size="sm"
            isFullWidth
            className="h-14"
            colorSchema="primary"
            variant="outline_bg"
            isLoading={isLoading}
          >
            {" "}
            {String(t("mfa.verify"))}{" "}
          </Button>
        </div>
      </div>
      <div className="mx-auto flex max-h-24 w-full max-w-md flex-col items-center justify-center pt-2">
        <div className="flex flex-row items-baseline gap-1 text-sm">
          <span className="text-bunker-400">{t("signup.step2-resend-alert")}</span>
          <div className="text-md mt-2 flex flex-row text-bunker-400">
            <button disabled={isLoadingResend} onClick={handleResendMfaCode} type="button">
              <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
                {isLoadingResend
                  ? t("signup.step2-resend-progress")
                  : t("signup.step2-resend-submit")}
              </span>
            </button>
          </div>
        </div>
        <p className="pb-2 text-sm text-bunker-400">{t("signup.step2-spam-alert")}</p>
      </div>
    </form>
  );
};
