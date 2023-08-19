/* eslint-disable react/jsx-props-no-spreading */
import React, { useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "react-i18next";

import {
  useSendVerificationEmail
} from "@app/hooks/api";

import Error from "../basic/Error";
import { Button } from "../v2";

// The style for the verification code input
const props = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "55px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "55px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;
const propsPhone = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "40px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "40px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;

interface CodeInputStepProps {
  email: string;
  incrementStep: () => void;
  setCode: (value: string) => void;
  codeError: boolean;
  isCodeInputCheckLoading: boolean;
}

/**
 * This is the second step of sign up where users need to verify their email
 * @param {object} obj
 * @param {string} obj.email - user's email to which we just sent a verification email
 * @param {function} obj.incrementStep - goes to the next step of signup
 * @param {function} obj.setCode - state updating function that set the current value of the emai verification code
 * @param {boolean} obj.codeError - whether the code was inputted wrong or now
 * @returns
 */
export default function CodeInputStep({
  email,
  incrementStep,
  setCode,
  codeError,
  isCodeInputCheckLoading
}: CodeInputStepProps): JSX.Element {
  const { mutateAsync } = useSendVerificationEmail();
  const [isLoading, setIsLoading] = useState(false);
  const [isResendingVerificationEmail, setIsResendingVerificationEmail] = useState(false);
  const { t } = useTranslation();

  const resendVerificationEmail = async () => {
    setIsResendingVerificationEmail(true);
    setIsLoading(true);
    await mutateAsync({ email });
    setTimeout(() => {
      setIsLoading(false);
      setIsResendingVerificationEmail(false);
    }, 2000);
  };

  return (
    <div className="mx-auto h-full w-full pb-4 md:px-8">
      <p className="text-md flex justify-center text-bunker-200">{t("signup.step2-message")}</p>
      <p className="text-md flex justify-center font-semibold my-1 text-bunker-200">{email} </p>
      <div className="hidden md:block w-max min-w-[20rem] mx-auto">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
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
          onChange={setCode}
          {...propsPhone}
          className="mt-2 mb-2"
        />
      </div>
      {codeError && <Error text={t("signup.step2-code-error")} />}
      <div className="flex flex-col items-center justify-center lg:w-[19%] w-1/4 min-w-[20rem] mt-2 max-w-xs md:max-w-md mx-auto text-sm text-center md:text-left">
        <div className="text-l py-1 text-lg w-full">
          <Button
            type="submit"
            onClick={incrementStep}
            size="sm"
            isFullWidth
            className='h-14'
            colorSchema="primary"
            variant="outline_bg"
            isLoading={isCodeInputCheckLoading}
          > {String(t("signup.verify"))} </Button>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center w-full max-h-24 max-w-md mx-auto pt-2">
        <div className="flex flex-row items-baseline gap-1 text-sm">
          <span className="text-bunker-400">{t("signup.step2-resend-alert")}</span>
          <div className="mt-2 text-bunker-400 text-md flex flex-row">
            <button disabled={isLoading} onClick={resendVerificationEmail} type="button">
              <span className='hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>
                {isResendingVerificationEmail
                  ? t("signup.step2-resend-progress")
                  : t("signup.step2-resend-submit")}
              </span>
            </button>
          </div>
        </div>
        <p className="text-sm text-bunker-400 pb-2">{t("signup.step2-spam-alert")}</p>
      </div>
    </div>
  );
}
