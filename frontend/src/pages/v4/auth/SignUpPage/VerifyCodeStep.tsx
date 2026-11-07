import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { Link } from "@tanstack/react-router";
import axios from "axios";

import { waitForMinimumAuthVerificationLoading } from "@app/components/auth/authTiming";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { useV4Scheme } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";
import { Text } from "@app/components/v4/ui/text";
import { envConfig } from "@app/config/env";
import { useSendVerificationEmail, useVerifySignupEmailVerificationCode } from "@app/hooks/api";

import { v4Path } from "../../links";
import { AuthPage } from "../components/AuthPage";
import { CodeForm } from "../components/CodeForm";

import styles from "../auth.module.css";

const MAX_SIGNUP_VERIFICATION_ATTEMPTS = 3;

type Props = {
  email: string;
  onComplete: () => void;
  onChangeEmail: () => void;
  resendCooldownEndTime: number;
  onResendCooldownChange: (endTime: number) => void;
  callbackPort?: number;
  previewError?: string;
};

export const VerifyCodeStep = ({
  email,
  onComplete,
  onChangeEmail,
  resendCooldownEndTime,
  onResendCooldownChange,
  callbackPort,
  previewError
}: Props) => {
  const { t } = useTranslation();
  const scheme = useV4Scheme();
  const { mutateAsync: resendEmail, isPending: isResending } = useSendVerificationEmail();
  const {
    mutateAsync: verifyCode,
    isPending: isVerifying,
    reset: resetVerificationCode
  } = useVerifySignupEmailVerificationCode();

  const [code, setCode] = useState("");
  const [isCompletingVerification, setIsCompletingVerification] = useState(false);
  const [verificationError, setVerificationError] = useState<unknown>();
  const [triesLeft, setTriesLeft] = useState(MAX_SIGNUP_VERIFICATION_ATTEMPTS);
  const [isCaptchaVisible, setIsCaptchaVisible] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  const requiresCaptcha = Boolean(envConfig.CAPTCHA_SITE_KEY);
  const [, forceRender] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => forceRender((x) => x + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingCooldown = Math.max(0, Math.ceil((resendCooldownEndTime - Date.now()) / 1000));
  const isInvalidTokenError =
    axios.isAxiosError(verificationError) &&
    verificationError.response?.data?.error === "InvalidToken";
  let verificationErrorMessage = String(t("signup.step2-code-error"));
  if (isInvalidTokenError && triesLeft === 0) {
    verificationErrorMessage = String(t("signup.step2-code-error-exhausted"));
  } else if (isInvalidTokenError) {
    verificationErrorMessage = String(
      t(
        triesLeft === 1
          ? "signup.step2-code-error-tries-singular"
          : "signup.step2-code-error-tries",
        { triesLeft }
      )
    );
  }

  const handleVerify = async () => {
    if (previewError !== undefined) return;
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
      setIsCaptchaVisible(false);
    } catch (err) {
      const remaining = axios.isAxiosError(err)
        ? err.response?.data?.details?.cooldownSeconds
        : undefined;
      if (typeof remaining === "number") {
        onResendCooldownChange(Date.now() + remaining * 1000);
        setIsCaptchaVisible(false);
        return;
      }
      captchaRef.current?.resetCaptcha();
    }
  };

  const handleResend = async () => {
    if (previewError !== undefined) return;
    setVerificationError(undefined);
    setTriesLeft(MAX_SIGNUP_VERIFICATION_ATTEMPTS);
    resetVerificationCode();
    if (requiresCaptcha) {
      captchaRef.current?.resetCaptcha();
      setIsCaptchaVisible(true);
      return;
    }
    await sendCode();
  };

  let resendLabel = "Resend code";
  if (isResending) resendLabel = "Resending";
  else if (remainingCooldown > 0) resendLabel = `Resend code in ${remainingCooldown}s`;

  return (
    <AuthPage
      pageTitle="Sign Up"
      title="Check your email"
      description={
        <>
          Enter the code we sent to <span className={styles.recipient}>{email}</span>
        </>
      }
      titleAction={
        <Button
          type="button"
          variant="link"
          aria-label={`Change email address from ${email}`}
          onClick={onChangeEmail}
        >
          Change
        </Button>
      }
      bottom={
        <span>
          Already have an account?{" "}
          <Link
            to={v4Path("/login")}
            search={{ callback_port: callbackPort }}
            className={styles.link}
          >
            Log in
          </Link>
        </span>
      }
    >
      <CodeForm
        label="Verification code"
        value={code}
        onChange={setCode}
        onSubmit={handleVerify}
        isPending={isVerifying || isCompletingVerification}
        error={previewError || (verificationError ? verificationErrorMessage : undefined)}
      >
        {isCaptchaVisible && envConfig.CAPTCHA_SITE_KEY && (
          <Stack gap={8}>
            <Text muted>Complete the captcha to resend your code.</Text>
            <div className={styles.captcha}>
              <HCaptcha
                theme={scheme === "dark" ? "dark" : "light"}
                sitekey={envConfig.CAPTCHA_SITE_KEY}
                onVerify={(token) => sendCode(token)}
                onError={() => setIsCaptchaVisible(false)}
                onChalExpired={() => setIsCaptchaVisible(false)}
                onExpire={() => captchaRef.current?.resetCaptcha()}
                ref={captchaRef}
              />
            </div>
          </Stack>
        )}
        <div>
          <Button
            type="button"
            variant="link"
            onClick={handleResend}
            disabled={isResending || remainingCooldown > 0}
          >
            {resendLabel}
          </Button>
        </div>
      </CodeForm>
    </AuthPage>
  );
};
