/* eslint-disable react/jsx-props-no-spreading */
import { useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

import {
  Button,
  FieldError,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useSendVerificationEmail } from "@app/hooks/api";

// Matches v3 input theme: transparent bg, border (#2b2c30), foreground text (#ebebeb), ring on focus (#2d2f33)
const codeInputStyle = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "55px",
    borderRadius: "6px",
    fontSize: "24px",
    height: "55px",
    paddingLeft: "7",
    backgroundColor: "transparent",
    color: "#ebebeb",
    border: "1px solid #2b2c30",
    textAlign: "center",
    outlineColor: "#2d2f33",
    borderColor: "#2b2c30"
  }
} as const;
const codeInputStylePhone = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "40px",
    borderRadius: "6px",
    fontSize: "24px",
    height: "40px",
    paddingLeft: "7",
    backgroundColor: "transparent",
    color: "#ebebeb",
    border: "1px solid #2b2c30",
    textAlign: "center",
    outlineColor: "#2d2f33",
    borderColor: "#2b2c30"
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
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <UnstableCard className="mx-auto w-full max-w-md items-stretch gap-0 p-6">
        <UnstableCardHeader className="mb-2 gap-2">
          <UnstableCardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-[1.55rem] font-medium text-transparent">
            {t("signup.step2-message")}
          </UnstableCardTitle>
        </UnstableCardHeader>
        <UnstableCardContent>
          <p className="text-md my-1 flex justify-center font-medium text-foreground">{email}</p>
          <div className="mx-auto hidden w-max min-w-[20rem] md:block">
            <ReactCodeInput
              name=""
              inputMode="tel"
              type="text"
              fields={6}
              onChange={setCode}
              {...codeInputStyle}
              className="code-input-v3 mt-6 mb-2"
            />
          </div>
          <div className="mx-auto mt-4 block w-max md:hidden">
            <ReactCodeInput
              name=""
              inputMode="tel"
              type="text"
              fields={6}
              onChange={setCode}
              {...codeInputStylePhone}
              className="code-input-v3 mt-2 mb-2"
            />
          </div>
          {codeError && <FieldError>{t("signup.step2-code-error")}</FieldError>}
          <div className="mt-4 w-full">
            <Button
              type="submit"
              onClick={incrementStep}
              variant="project"
              size="lg"
              isFullWidth
              isPending={isCodeInputCheckLoading}
              isDisabled={isCodeInputCheckLoading}
            >
              {String(t("signup.verify"))}
            </Button>
          </div>
          <div className="mt-6 flex flex-col items-center gap-2 text-xs text-label">
            <div className="flex flex-row items-baseline gap-1">
              <button disabled={isLoading} onClick={resendVerificationEmail} type="button">
                <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                  {t("signup.step2-resend-alert")}{" "}
                  {isResendingVerificationEmail
                    ? t("signup.step2-resend-progress")
                    : t("signup.step2-resend-submit")}
                </span>
              </button>
            </div>
            <Link
              to="/login"
              className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2"
            >
              Have an account? Log in
            </Link>
          </div>
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
}
