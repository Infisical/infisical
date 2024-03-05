/* eslint-disable react/jsx-props-no-spreading */
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useSendVerificationEmail } from "@app/hooks/api";

interface EmailSendStepProps {
  email: string;
}

/**
 * This is the second step of sign up where users need to verify their email
 * @param {object} obj
 * @param {string} obj.email - user's email to which we just sent a verification email
 * @returns
 */
export default function EmailSendStep({ email }: EmailSendStepProps): JSX.Element {
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
      <p className="text-md my-1 flex justify-center font-semibold text-bunker-200">{email} </p>
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
      </div>
    </div>
  );
}
