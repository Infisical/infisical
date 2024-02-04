import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";

import { useSendVerificationEmail } from "@app/hooks/api";

import { Button, Input } from "../v2";

interface DownloadBackupPDFStepProps {
  incrementStep: () => void;
  email: string;
  setEmail: (value: string) => void;
}

/**
 * This is the first step of the sign up process - users need to enter their email
 * @param {object} obj
 * @param {string} obj.email - email of a user signing up
 * @param {function} obj.setEmail - funciton that manages the state of the email variable
 * @param {function} obj.incrementStep - function to go to the next step of the signup flow
 * @returns
 */
export default function EnterEmailStep({
  email,
  setEmail,
  incrementStep
}: DownloadBackupPDFStepProps): JSX.Element {
  const { mutateAsync } = useSendVerificationEmail();
  const [emailError, setEmailError] = useState(false);
  const { t } = useTranslation();

  /**
   * Verifies if the entered email "looks" correct
   */
  const emailCheck = async () => {
    let emailCheckBool = false;
    if (!email) {
      setEmailError(true);
      emailCheckBool = true;
    } else if (!email.includes("@") || !email.includes(".") || !/[a-z]/.test(email)) {
      setEmailError(true);
      emailCheckBool = true;
    } else {
      setEmailError(false);
    }

    // If everything is correct, go to the next step
    if (!emailCheckBool) {
      await mutateAsync({ email });
      incrementStep();
    }
  };

  return (
    <div>
      <div className="w-full md:px-6 mx-auto">
        <p className="text-xl font-medium flex justify-center text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200">
          {t("signup.step1-start")}
        </p>
        <div className="flex flex-col items-center justify-center lg:w-1/6 w-1/4 min-w-[20rem] m-auto rounded-lg mt-8">
          <Input
            placeholder="Enter your email address..."
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            isRequired
            autoComplete="username"
            className="h-12"
          />
          {emailError && <p className="text-red-600 text-xs text-left w-full ml-1.5 mt-1.5">Please enter a valid email.</p>}
        </div>
        <div className="flex flex-col items-center justify-center lg:w-1/6 w-1/4 min-w-[20rem] mt-2 max-w-xs md:max-w-md mx-auto text-sm text-center md:text-left">
          <div className="text-l py-1 text-lg w-full">
            <Button
              type="submit"
              onClick={emailCheck}
              size="sm"
              isFullWidth
              className='h-14'
              colorSchema="primary"
              variant="outline_bg"
            > {String(t("signup.step1-submit"))} </Button>
          </div>
        </div>
      </div>
      <div className="mx-auto mb-48 mt-2 flex w-full max-w-md flex-col items-center justify-center pt-2 md:mb-16 md:pb-2">
        <Link href="/login">
          <button type="button" className="w-max pb-3 duration-200 hover:opacity-90">
            <span className="text-sm text-mineshaft-400 hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer">
              {t("signup.already-have-account")}
            </span>
          </button>
        </Link>
      </div>
    </div>
  );
}
