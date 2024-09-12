import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
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
  
  const { mutateAsync, isLoading } = useSendVerificationEmail();
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
      try {
        await mutateAsync({ email: email.toLowerCase() });
        setEmail(email.toLowerCase())
        incrementStep();
      } catch (e) {
        if (axios.isAxiosError(e)) {
          const { message = "Something went wrong" } = e.response?.data as { message: string };
          createNotification({
            type: "error",
            text: message
          });
        }
      }
    }
  };

  return (
    <div>
      <div className="mx-auto w-full md:px-6">
        <p className="flex justify-center bg-gradient-to-b from-white to-bunker-200 bg-clip-text text-xl font-medium text-transparent">
          {t("signup.step1-start")}
        </p>
        <div className="m-auto mt-8 flex w-1/4 min-w-[20rem] flex-col items-center justify-center rounded-lg lg:w-1/6">
          <Input
            placeholder="Enter your email address..."
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            isRequired
            autoComplete="username"
            className="h-12"
          />
          {emailError && (
            <p className="ml-1.5 mt-1.5 w-full text-left text-xs text-red-600">
              Please enter a valid email.
            </p>
          )}
        </div>
        <div className="mx-auto mt-2 flex w-1/4 min-w-[20rem] max-w-xs flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-1/6">
          <div className="text-l w-full py-1 text-lg">
            <Button
              type="submit"
              onClick={emailCheck}
              size="sm"
              isFullWidth
              className="h-14"
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
              isDisabled={isLoading}
            >
              {" "}
              {String(t("signup.step1-submit"))}{" "}
            </Button>
          </div>
        </div>
      </div>
      <div className="mx-auto mb-48 mt-2 flex w-full max-w-md flex-col items-center justify-center pt-2 md:mb-16 md:pb-2">
        <Link href="/login">
          <button type="button" className="w-max pb-3 duration-200 hover:opacity-90">
            <span className="cursor-pointer text-sm text-mineshaft-400 duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
              {t("signup.already-have-account")}
            </span>
          </button>
        </Link>
      </div>
    </div>
  );
}
