import React, { useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "next-i18next";

import sendVerificationEmail from "~/pages/api/auth/SendVerificationEmail";

import Button from "../basic/buttons/Button";
import Error from "../basic/Error";


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
  },
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
  },
} as const;

interface CodeInputStepProps {
  email: string;
  incrementStep: () => void;
  setCode: (value: string) => void;
  codeError: boolean;
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
export default function CodeInputStep({ email, incrementStep, setCode, codeError }: CodeInputStepProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [isResendingVerificationEmail, setIsResendingVerificationEmail] =
    useState(false);
  const { t } = useTranslation();

  const resendVerificationEmail = async () => {
    setIsResendingVerificationEmail(true);
    setIsLoading(true);
    sendVerificationEmail(email);
    setTimeout(() => {
      setIsLoading(false);
      setIsResendingVerificationEmail(false);
    }, 2000);
  };

  return (
    <div className="bg-bunker w-max mx-auto h-7/12 pt-10 pb-4 px-8 rounded-xl drop-shadow-xl mb-64 md:mb-16">
      <p className="text-l flex justify-center text-bunker-300">
        {"We've"} sent a verification email to{" "}
      </p>
      <p className="text-l flex justify-center font-semibold my-2 text-bunker-300">
        {email}{" "}
      </p>
      <div className="hidden md:block">
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
      <div className="block md:hidden">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...propsPhone}
          className="mt-2 mb-6"
        />
      </div>
      {codeError && <Error text={t("signup:step2-code-error")} />}
      <div className="flex max-w-max min-w-28 flex-col items-center justify-center md:p-2 max-h-24 mx-auto text-lg px-4 mt-4 mb-2">
        <Button
          text={t("signup:verify") ?? ""}
          onButtonPressed={incrementStep}
          size="lg"
        />
      </div>
      <div className="flex flex-col items-center justify-center w-full max-h-24 max-w-md mx-auto pt-2">
        <div className="flex flex-row items-baseline gap-1 text-sm">
          <span className="text-bunker-400">
            Not seeing an email?
          </span>
          <u className={`font-normal ${isResendingVerificationEmail ? 'text-bunker-400' : 'text-primary-700 hover:text-primary duration-200'}`}>
            <button disabled={isLoading} onClick={resendVerificationEmail}>
              {isResendingVerificationEmail ? "Resending..." : "Resend"}
            </button>
          </u>
        </div>
        <p className="text-sm text-bunker-400 pb-2">
          {t("signup:step2-spam-alert")}
        </p>
      </div>
    </div>
  );
}
