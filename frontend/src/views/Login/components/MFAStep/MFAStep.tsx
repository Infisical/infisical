import React, { useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import axios from "axios"
import jwt_decode from "jwt-decode";

import Error from "@app/components/basic/Error"; // which to notification
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import attemptCliLoginMfa from "@app/components/utilities/attemptCliLoginMfa"
import attemptLoginMfa from "@app/components/utilities/attemptLoginMfa";
import { Button } from "@app/components/v2";    
import { useUpdateUserAuthMethods } from "@app/hooks/api";
import { useSendMfaToken } from "@app/hooks/api/auth";
import { fetchUserDetails } from "@app/hooks/api/users/queries";
import { AuthMethod } from "@app/hooks/api/users/types";

import { navigateUserToOrg } from "../../Login.utils";

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
}

interface VerifyMfaTokenError {
  response: {
    data: {
      context: {
        code: string;
        triesLeft: number;
      };
    };
    status: number;
  };
}

export const MFAStep = ({
  email,
  password,
  providerAuthToken
}: Props) => {
  const { createNotification } = useNotificationContext();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);

  const { t } = useTranslation();

  const sendMfaToken = useSendMfaToken();
    const { mutateAsync: updateUserAuthMethodsMutateAsync } = useUpdateUserAuthMethods();

  const handleLoginMfa = async () => {
    try {
      let isLinkingRequired: undefined | boolean;
      let callbackPort: undefined | string;
      let authMethod: undefined | AuthMethod;
      
      if (providerAuthToken) {
        const decodedToken = jwt_decode(providerAuthToken) as any;
        
        isLinkingRequired = decodedToken.isLinkingRequired;
        callbackPort = decodedToken.callbackPort;
        authMethod = decodedToken.authMethod;
      }
      
      if (mfaCode.length !== 6) {
        createNotification({
          text: "Please enter a 6-digit MFA code and try again",
          type: "error"
        });
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
        })

        if (isCliLoginSuccessful && isCliLoginSuccessful.success){
          // case: login was successful
          const cliUrl = `http://127.0.0.1:${callbackPort}/`

          // send request to server endpoint 
          const instance = axios.create()
          await instance.post(cliUrl,{...isCliLoginSuccessful.loginResponse,email})

          // cli page
          router.push("/cli-redirect");
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

          if (isLinkingRequired && authMethod) {
            const user = await fetchUserDetails();
            const newAuthMethods = [...user.authMethods, authMethod] 
            await updateUserAuthMethodsMutateAsync({
                authMethods: newAuthMethods
            });
          }
          
          await navigateUserToOrg(router);
        } else {
          createNotification({
            text: "Failed to log in",
            type: "error"
          });
        }
      }
      
    } catch (err) {
      const error = err as VerifyMfaTokenError;
      createNotification({
        text: "Failed to log in",
        type: "error"
      });

      if (error?.response?.status === 500) {
        window.location.reload();
      } else if (error?.response?.data?.context?.triesLeft) {
        setTriesLeft(error?.response?.data?.context?.triesLeft);
        if (error.response.data.context.triesLeft === 0) {
          window.location.reload();
        }
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
       <form className="mx-auto w-max md:px-8 pb-4 pt-4 md:mb-16">
      <p className="text-l flex justify-center text-bunker-300">{t("mfa.step2-message")}</p>
      <p className="text-l my-1 flex justify-center font-semibold text-bunker-300">{email} </p>
      <div className="hidden md:block w-max min-w-[20rem] mx-auto">
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
      <div className="block md:hidden w-max mt-4 mx-auto">
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
        <Error text={`${t("mfa.step2-code-error")} ${triesLeft}`} />
      )}
      <div className="flex flex-col mt-6 items-center justify-center lg:w-[19%] w-1/4 min-w-[20rem] mt-2 max-w-xs md:max-w-md mx-auto text-sm text-center md:text-left">
        <div className="text-l py-1 text-lg w-full">
          <Button
            onClick={() => handleLoginMfa()}
            size="sm"
            isFullWidth
            className='h-14'
            colorSchema="primary"
            variant="outline_bg"
            isLoading={isLoading}
          > {String(t("mfa.verify"))} </Button>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center w-full max-h-24 max-w-md mx-auto pt-2">
        <div className="flex flex-row items-baseline gap-1 text-sm">
          <span className="text-bunker-400">{t("signup.step2-resend-alert")}</span>
          <div className="mt-2 text-bunker-400 text-md flex flex-row">
            <button disabled={isLoadingResend} onClick={handleResendMfaCode} type="button">
              <span className='hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>
                {isLoadingResend
                  ? t("signup.step2-resend-progress")
                  : t("signup.step2-resend-submit")}
              </span>
            </button>
          </div>
        </div>
        <p className="text-sm text-bunker-400 pb-2">{t("signup.step2-spam-alert")}</p>
      </div>
    </form> 
    );
}