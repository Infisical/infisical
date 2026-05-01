import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { z } from "zod";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FieldError,
  Input
} from "@app/components/v3";
import { useSendVerificationEmail } from "@app/hooks/api";

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
      <Card className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
        <CardHeader className="mb-4 gap-4">
          <CardTitle className="ml-0.5 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-[1.65rem] font-medium text-transparent">
            {t("signup.step1-start")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="w-full">
            <Input
              placeholder="Enter your email address..."
              onChange={(e) => setEmail(e.target.value)}
              value={email}
              required
              autoComplete="username"
              className="h-10"
              isError={emailError}
            />
            {emailError && <FieldError>Please enter a valid email.</FieldError>}
          </div>
          <div className="mt-4 w-full">
            <Button
              type="submit"
              onClick={emailCheck}
              variant="project"
              size="lg"
              isFullWidth
              isDisabled={isPending}
              isPending={isPending}
            >
              {String(t("signup.step1-submit"))}
            </Button>
          </div>
          <div className="mt-6 flex w-full justify-center text-xs text-label">
            <Link to="/login">
              <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                {t("signup.already-have-account")}
              </span>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
