import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { motion } from "framer-motion";

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
  const { mutateAsync, isPending } = useSendVerificationEmail();
  const [emailError, setEmailError] = useState(false);
  const { t } = useTranslation();

  /**
   * Verifies if the entered email "looks" correct
   */
  const emailCheck = async () => {
    const isValid = z.string().email().safeParse(email);

    let emailCheckBool = false;
    if (!isValid.success) {
      setEmailError(true);
      emailCheckBool = true;
    } else {
      setEmailError(false);
    }

    // If everything is correct, go to the next step
    if (!emailCheckBool) {
      await mutateAsync({ email: email.toLowerCase() });
      setEmail(email.toLowerCase());
      incrementStep();
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <motion.div
        layoutId="signup-card"
        className="mx-auto flex w-full max-w-sm flex-col items-center rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6"
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        <h1 className="mb-4 w-full text-center bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.65rem] font-medium text-transparent">
          {t("signup.step1-start")}
        </h1>
        <div className="w-full">
          <Input
            placeholder="Enter your email address..."
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            isRequired
            autoComplete="username"
            className="h-10 placeholder:text-mineshaft-400"
          />
          {emailError && (
            <p className="mt-1.5 w-full text-center text-xs text-red-600">
              Please enter a valid email.
            </p>
          )}
        </div>
        <div className="mt-4 w-full">
          <Button
            type="submit"
            onClick={emailCheck}
            size="sm"
            isFullWidth
            className="h-11"
            colorSchema="primary"
            variant="outline_bg"
            isLoading={isPending}
            isDisabled={isPending}
          >
            {String(t("signup.step1-submit"))}
          </Button>
        </div>
        <div className="mt-6 flex w-full justify-center text-sm text-bunker-400">
          <Link to="/login">
            <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
              {t("signup.already-have-account")}
            </span>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
