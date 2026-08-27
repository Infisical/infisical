import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import axios from "axios";

import {
  Button,
  CardContent,
  VerificationCodeForm,
  VerificationCodeHeader,
  VerificationCodeResend
} from "@app/components/v3";
import { envConfig } from "@app/config/env";
import { useSendVerificationEmail, useVerifySignupEmailVerificationCode } from "@app/hooks/api";

import SecurityClient from "../utilities/SecurityClient";
import { AuthPagePanel } from "./AuthPagePanel";
import { waitForMinimumAuthVerificationLoading } from "./authTiming";

const MAX_SIGNUP_VERIFICATION_ATTEMPTS = 3;

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
    reset: resetVerificationCode
  } = useVerifySignupEmailVerificationCode();

  const { t } = useTranslation();

  const [code, setCode] = useState("");
  const [isCompletingVerification, setIsCompletingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState<unknown>();
  const [triesLeft, setTriesLeft] = useState(MAX_SIGNUP_VERIFICATION_ATTEMPTS);
  const [isCaptchaVisible, setIsCaptchaVisible] = useState(false);

  const captchaRef = useRef<HCaptcha>(null);
  const requiresCaptcha = Boolean(envConfig.CAPTCHA_SITE_KEY);

  const [, forceRender] = useState(0);

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => {
      forceRender((x) => x + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const remainingCooldown = Math.max(0, Math.ceil((resendCooldownEndTime - Date.now()) / 1000));
  const isInvalidTokenError =
    axios.isAxiosError(verificationError) &&
    verificationError.response?.data?.error === "InvalidToken";
  let verificationErrorMessage = t("signup.step2-code-error");
  if (isInvalidTokenError && triesLeft === 0) {
    verificationErrorMessage = t("signup.step2-code-error-exhausted");
  } else if (isInvalidTokenError) {
    verificationErrorMessage = t(
      triesLeft === 1 ? "signup.step2-code-error-tries-singular" : "signup.step2-code-error-tries",
      { triesLeft }
    );
  }

  const handleVerify = async () => {
    const verificationStartedAt = Date.now();
    setIsCompletingVerification(true);

    try {
      const { token } = await verifyCode({ email, code });
      await waitForMinimumAuthVerificationLoading(verificationStartedAt);
      SecurityClient.setSignupToken(token);
      onComplete();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error === "InvalidToken") {
        setTriesLeft((current) => Math.max(0, current - 1));
      }
      setVerificationError(error);
    } finally {
      setIsCompletingVerification(false);
    }
  };

  const sendCode = async (captchaToken?: string) => {
    try {
      const { cooldownSeconds } = await resendEmail({ email, captchaToken });
      onResendCooldownChange(Date.now() + cooldownSeconds * 1000);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const remaining = err.response?.data?.details?.cooldownSeconds;
        if (typeof remaining === "number") {
          onResendCooldownChange(Date.now() + remaining * 1000);
        }
      }
    } finally {
      if (requiresCaptcha) {
        captchaRef.current?.resetCaptcha();
        setIsCaptchaVisible(false);
      }
    }
  };

  const handleResend = async () => {
    setVerificationError(undefined);
    setTriesLeft(MAX_SIGNUP_VERIFICATION_ATTEMPTS);
    resetVerificationCode();

    // The send only fires once hCaptcha hands back a token, so the widget is revealed here
    // rather than occupying the code screen for everyone who never resends.
    if (requiresCaptcha) {
      setIsCaptchaVisible(true);
      return;
    }

    await sendCode();
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
            isPending={isVerifying || isCompletingVerification}
            error={verificationError ? verificationErrorMessage : undefined}
          >
            {isCaptchaVisible && envConfig.CAPTCHA_SITE_KEY && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-label">Complete the captcha to resend your code.</p>
                <div className="flex justify-center [&>div]:!w-full">
                  <HCaptcha
                    theme="dark"
                    sitekey={envConfig.CAPTCHA_SITE_KEY}
                    onVerify={(token) => sendCode(token)}
                    ref={captchaRef}
                  />
                </div>
              </div>
            )}
            <VerificationCodeResend
              isDisabled={isCaptchaVisible}
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
