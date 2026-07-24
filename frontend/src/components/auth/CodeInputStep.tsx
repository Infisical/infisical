import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import axios from "axios";

import {
  Button,
  CardContent,
  VerificationCodeForm,
  VerificationCodeHeader,
  VerificationCodeResend
} from "@app/components/v3";
import { useSendVerificationEmail, useVerifySignupEmailVerificationCode } from "@app/hooks/api";

import SecurityClient from "../utilities/SecurityClient";
import { AuthPagePanel } from "./AuthPagePanel";

interface CodeInputStepProps {
  email: string;
  onComplete: () => void;
  onChangeEmail: () => void;
  resendCooldownEndTime: number;
  onResendCooldownChange: (endTime: number) => void;
}

export default function CodeInputStep({
  email,
  onComplete,
  onChangeEmail,
  resendCooldownEndTime,
  onResendCooldownChange
}: CodeInputStepProps): JSX.Element {
  const { mutateAsync: resendEmail, isPending: isResending } = useSendVerificationEmail();
  const {
    mutateAsync: verifyCode,
    isPending: isVerifying,
    isError: isCodeError
  } = useVerifySignupEmailVerificationCode();

  const { t } = useTranslation();

  const [code, setCode] = useState("");

  const [, forceRender] = useState(0);

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => {
      forceRender((x) => x + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const remainingCooldown = Math.max(0, Math.ceil((resendCooldownEndTime - Date.now()) / 1000));

  const handleVerify = async () => {
    const { token } = await verifyCode({ email, code });
    SecurityClient.setSignupToken(token);
    onComplete();
  };

  const handleResend = async () => {
    try {
      const { cooldownSeconds } = await resendEmail({ email });
      onResendCooldownChange(Date.now() + cooldownSeconds * 1000);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const remaining = err.response?.data?.details?.cooldownSeconds;
        if (typeof remaining === "number") {
          onResendCooldownChange(Date.now() + remaining * 1000);
        }
      }
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <VerificationCodeHeader
          title={t("signup.step2-message")}
          recipient={email}
          action={
            <button
              aria-label={`Change email address from ${email}`}
              className="shrink-0 cursor-pointer text-sm text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
              onClick={onChangeEmail}
              type="button"
            >
              Change
            </button>
          }
        />
        <CardContent>
          <VerificationCodeForm
            name="verification-code"
            value={code}
            onChange={setCode}
            onSubmit={handleVerify}
            submitLabel={String(t("signup.verify"))}
            isPending={isVerifying}
            error={isCodeError ? t("signup.step2-code-error") : undefined}
          >
            <VerificationCodeResend
              isResending={isResending}
              remainingSeconds={remainingCooldown}
              onResend={handleResend}
            />
            {import.meta.env.DEV && (
              <Button variant="ghost" size="sm" isFullWidth onClick={onComplete}>
                Preview next step (development only)
              </Button>
            )}
          </VerificationCodeForm>
        </CardContent>
      </AuthPagePanel>
    </div>
  );
}
