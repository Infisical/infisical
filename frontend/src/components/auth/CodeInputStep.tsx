/* eslint-disable react/jsx-props-no-spreading */
import { useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

import { useSendVerificationEmail } from "@app/hooks/api";

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
    try {
      await mutateAsync({ email });
    } finally {
      setTimeout(() => {
        setIsLoading(false);
        setIsResendingVerificationEmail(false);
      }, 1000);
    }
  };

  return (
    <div className="mx-auto h-full w-full pb-4 md:px-8">
      <p className="text-md flex justify-center text-bunker-200">{t("signup.step2-message")}</p>
      <p className="text-md my-1 flex justify-center font-medium text-bunker-200">{email} </p>
      <div className="mx-auto hidden w-max min-w-[20rem] md:block">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...props}
          className="mt-6 mb-2"
          autoComplete="one-time-code"
        />
      </div>
      <div className="mx-auto mt-4 block w-max md:hidden">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...propsPhone}
          className="mt-2 mb-2"
          autoComplete="one-time-code"
        />
      </div>
      {codeError && <Error text={t("signup.step2-code-error")} />}
      <div className="mx-auto mt-2 flex w-1/4 max-w-xs min-w-[20rem] flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-[19%]">
        <div className="text-l w-full py-1 text-lg">
          <Button
            type="submit"
            onClick={incrementStep}
            size="sm"
            isFullWidth
            className="h-14"
            colorSchema="primary"
            variant="outline_bg"
            isLoading={isCodeInputCheckLoading}
          >
            {" "}
            {String(t("signup.verify"))}{" "}
          </Button>
        </div>
      </div>
      <div className="mx-auto flex max-h-24 w-full max-w-md flex-col items-center justify-center pt-2">
        <div className="flex flex-row items-baseline gap-1 text-sm">
          <span className="text-bunker-400">{t("signup.step2-resend-alert")}</span>
          <div className="text-md mt-2 flex flex-row text-bunker-400">
            <button disabled={isLoading} onClick={resendVerificationEmail} type="button">
              <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
                {isResendingVerificationEmail
                  ? t("signup.step2-resend-progress")
                  : t("signup.step2-resend-submit")}
              </span>
            </button>
          </div>
        </div>
        <p className="pb-2 text-sm text-bunker-400">{t("signup.step2-spam-alert")}</p>
        <p className="text-sm text-bunker-400">
          <Link
            to="/login"
            className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4"
          >
            Have an account? Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
