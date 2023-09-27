import React, { useEffect, useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import axios from "axios"
import jwt_decode from "jwt-decode";

import Error from "@app/components/basic/Error";
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { attemptCliLoginMfaAuthAppTotp, attemptLoginMfaAuthAppTotp } from "@app/components/utilities/login";
import { Button } from "@app/components/v2";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";

// The style for the TOTP code input
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
  setStep: (step: number) => void;
}

interface VerifyAuthAppError {
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

export const MfaAuthAppTotpStep = ({
  email,
  password,
  providerAuthToken,
  setStep
}: Props) => {
  const { createNotification } = useNotificationContext();
  const [mfaRecoveryCodesAvailable, setMfaRecoveryCodesAvailable] = useState<boolean>(false);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [userTotp, setUserTotp] = useState<string>("");
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);
  const { t } = useTranslation();

  useEffect(() => {
    const storedMfaMethods = localStorage.getItem("mfaMethods");

    if (storedMfaMethods) {
      const mfaMethodsArray = JSON.parse(storedMfaMethods);
      const mfaRecoveryCodesExist = mfaMethodsArray.includes("mfa-recovery-codes");

      if (mfaRecoveryCodesExist) {
        setMfaRecoveryCodesAvailable(true);
      } else {
        setMfaRecoveryCodesAvailable(false);
      }
    }
  }, []);

  const handleLoginMfaAuthAppTotp = async () => {
    try {
      let callbackPort: undefined | string;
      
      if (providerAuthToken) {
        const decodedToken = jwt_decode(providerAuthToken) as any;
        callbackPort = decodedToken.callbackPort;
      }
     
      setIsLoading(true);
      
      if (callbackPort) {

        const isCliLoginSuccessful = await attemptCliLoginMfaAuthAppTotp({
          email,
          password,
          providerAuthToken,
          userTotp,
        })

        if (isCliLoginSuccessful && isCliLoginSuccessful.success){
          // case: login was successful
          const cliUrl = `http://localhost:${callbackPort}`

          // send request to server endpoint 
          const instance = axios.create()
          await instance.post(cliUrl,{...isCliLoginSuccessful.loginResponse, email})

          // cli page
          router.push("/cli-redirect");
        }
      } else {
        const isLoginSuccessful = await attemptLoginMfaAuthAppTotp({
          email,
          password,
          providerAuthToken,
          userTotp,
        });
  
        if (isLoginSuccessful) {
          setIsLoading(false);
          const userOrgs = await fetchOrganizations();
          const userOrg = userOrgs[0] && userOrgs[0]._id;

          createNotification({
              text: "Successfully logged in",
              type: "success"
          });
        
          router.push(`/org/${userOrg}/overview`);
        } else {
          createNotification({
            text: "Failed to log in",
            type: "error"
          });
        }
      }
      
      localStorage.removeItem("mfaMethods");

    } catch (err) {
      const error = err as VerifyAuthAppError;
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

  return (
    <>
      <h1 className='text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8' >Authenticator app (TOTP)</h1>
      <form className="mx-auto w-max md:px-8 pb-4 pt-4 md:mb-16">
        <div className="hidden md:block w-max min-w-[20rem] mx-auto">
          <ReactCodeInput
            name=""
            inputMode="tel"
            type="text"
            fields={6}
            onChange={setUserTotp}
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
            onChange={setUserTotp}
            {...props}
            className="mt-2 mb-2"
          />
        </div>
        {typeof triesLeft === "number" && (
          <Error text={`${t("mfa-authenticator-app.error-wrong-code")} ${triesLeft}`} />
        )}
        <div className="flex flex-col mt-6 items-center justify-center lg:w-[19%] w-1/4 min-w-[20rem] mt-2 max-w-xs md:max-w-md mx-auto text-sm text-center md:text-left">
          <div className="text-l py-1 text-lg w-full">
            <Button
              onClick={() => handleLoginMfaAuthAppTotp()}
              size="sm"
              isFullWidth
              className='h-14'
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
              isDisabled={isLoading || !/^[0-9]{6}$/.test(userTotp)}
            > {String(t("mfa.verify"))} </Button>
          </div>
        </div>
        <div className="text-bunker-400 text-sm flex flex-col items-center justify-center">
          <div>
            <button
              type="button"
              onClick={() => {
                setStep(2);
              }}
              className="text-bunker-300 text-sm hover:underline mt-2 hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer"
            >
              Back to MFA selection
            </button>
          </div>
          <div>
            <button
              type="button"
              onClick={() => {
                setStep(5);
              }}
              className="text-bunker-300 text-sm hover:underline mt-2 hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer"
            >
              Use the two-factor secret key instead
            </button>
          </div>
          {mfaRecoveryCodesAvailable && (
          <div>
            <button
              type="button"
              onClick={() => {
                setStep(6);
              }}
              className="text-bunker-300 text-sm hover:underline mt-2 hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer"
            >
              Use an MFA recovery code
            </button>
          </div>
          )}
        </div>
      </form>
    </>
  );
}
