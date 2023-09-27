import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/router";
import axios from "axios"
import jwt_decode from "jwt-decode";

import Error from "@app/components/basic/Error";
import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { attemptCliLoginMfaRecoveryCode, attemptLoginMfaRecoveryCode } from "@app/components/utilities/login";
import { Button, Input } from "@app/components/v2";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";

type Props = {
  email: string;
  password: string;
  providerAuthToken?: string;
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

 // TODO: fix call back port
export const MfaRecoveryCodeStep = ({
  email,
  password,
  providerAuthToken,
  setStep,
}: Props) => {
  const { createNotification } = useNotificationContext();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [mfaRecoveryCode, setMfaRecoveryCode] = useState<string>("");
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);
  const { t } = useTranslation();

  const handleLoginMfaRecoveryCode = async () => {
    try {
      let callbackPort: undefined | string;
      
      if (providerAuthToken) {
        const decodedToken = jwt_decode(providerAuthToken) as any;
        callbackPort = decodedToken.callbackPort;
      }
     
      setIsLoading(true);
      
      if (callbackPort) {

        const isCliLoginSuccessful = await attemptCliLoginMfaRecoveryCode({
          email,
          password,
          providerAuthToken,
          mfaRecoveryCode,
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
        const isLoginSuccessful = await attemptLoginMfaRecoveryCode({
          email,
          password,
          providerAuthToken,
          mfaRecoveryCode,
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
      <h1 className='text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8' >MFA recovery code</h1>
      <form className="mx-auto w-max md:px-8 pb-4 pt-4 md:mb-16">
        <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
            <Input
                value={mfaRecoveryCode}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setMfaRecoveryCode(e.target.value)}
                type="text"
                placeholder="Enter your MFA recovery code..."
                isRequired
                className="h-11 select:-webkit-autofill:focus"
            />
        </div>
        <div className="block md:hidden w-max mt-4 mx-auto">
            <Input
                value={mfaRecoveryCode}
                onChange={(e: { target: { value: React.SetStateAction<string>; }; }) => setMfaRecoveryCode(e.target.value)}
                type="text"
                placeholder="Enter your MFA recovery code..."
                isRequired
                className="h-11 select:-webkit-autofill:focus"
            />
        </div>
        {typeof triesLeft === "number" && (
          <Error text={`${t("mfa-authenticator-app.error-wrong-code")} ${triesLeft}`} />
        )}
        <div className="flex flex-col mt-6 items-center justify-center lg:w-[19%] w-1/4 min-w-[20rem] mt-2 max-w-xs md:max-w-md mx-auto text-sm text-center md:text-left">
          <div className="text-l py-1 text-lg w-full">
            <Button
              onClick={() => handleLoginMfaRecoveryCode()}
              size="sm"
              isFullWidth
              className='h-14'
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
              isDisabled={isLoading || mfaRecoveryCode.length >= 12 || mfaRecoveryCode.length < 11}
            > {String(t("mfa.verify"))} </Button>
          </div>
        </div>
        <div className="text-bunker-400 text-sm flex flex-row items-center justify-center">
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
      </form> 
    </>

  );
}