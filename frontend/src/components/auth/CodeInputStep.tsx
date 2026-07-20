/* eslint-disable react/jsx-props-no-spreading */
import { useEffect, useRef, useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "react-i18next";
import axios from "axios";

import {
  AnimatedCollapse,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  FieldError
} from "@app/components/v3";
import { useSendVerificationEmail, useVerifySignupEmailVerificationCode } from "@app/hooks/api";

import SecurityClient from "../utilities/SecurityClient";

const codeInputStyle = {
  inputStyle: {
    fontFamily: "var(--font-mono)",
    margin: "0",
    MozAppearance: "textfield",
    width: "100%",
    borderRadius: "6px",
    fontSize: "20px",
    height: "68px",
    padding: "0",
    backgroundColor: "var(--color-container)",
    color: "var(--color-foreground)",
    border: "1px solid var(--color-border)",
    textAlign: "center",
    outlineColor: "transparent",
    borderColor: "var(--color-border)"
  }
} as const;

interface CodeInputStepProps {
  email: string;
  onComplete: () => void;
  onChangeEmail: () => void;
  initialCooldown: number;
}

export default function CodeInputStep({
  email,
  onComplete,
  onChangeEmail,
  initialCooldown
}: CodeInputStepProps): JSX.Element {
  const { mutateAsync: resendEmail, isPending: isResending } = useSendVerificationEmail();
  const {
    mutateAsync: verifyCode,
    isPending: isVerifying,
    isError: isCodeError
  } = useVerifySignupEmailVerificationCode();

  const { t } = useTranslation();

  const [code, setCode] = useState("");

  const endTimeRef = useRef<number>(initialCooldown > 0 ? Date.now() + initialCooldown * 1000 : 0);
  const [, forceRender] = useState(0);

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => {
      forceRender((x) => x + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const remainingCooldown = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));

  const isCooldownActive = endTimeRef.current > Date.now();
  const emailSeparatorIndex = email.lastIndexOf("@");
  const emailLocalPart = emailSeparatorIndex >= 0 ? email.slice(0, emailSeparatorIndex) : email;
  const emailDomainPart = emailSeparatorIndex >= 0 ? email.slice(emailSeparatorIndex) : "";

  const handleVerify = async () => {
    const { token } = await verifyCode({ email, code });
    SecurityClient.setSignupToken(token);
    onComplete();
  };

  const handleResend = async () => {
    try {
      const { cooldownSeconds } = await resendEmail({ email });
      endTimeRef.current = Date.now() + cooldownSeconds * 1000;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const remaining = err.response?.data?.details?.cooldownSeconds;
        if (typeof remaining === "number") {
          endTimeRef.current = Date.now() + remaining * 1000;
        }
      }
    }
  };

  let resendLabel = String(t("signup.step2-resend-submit"));
  if (isResending) {
    resendLabel = String(t("signup.step2-resend-progress"));
  } else if (remainingCooldown > 0) {
    resendLabel = `${t("signup.step2-resend-submit")} (${remainingCooldown}s)`;
  }

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <Card className="mx-auto w-full max-w-sm items-stretch gap-0 p-6">
        <CardHeader className="mb-6 gap-2">
          <CardDescription className="ml-0.5 text-base">
            {t("signup.step2-message")}
          </CardDescription>
          <div className="flex min-w-0 items-baseline justify-between gap-3">
            <div
              aria-label={email}
              className="ml-0.5 flex min-w-0 flex-1 items-baseline font-alliance text-2xl font-normal text-foreground"
              title={email}
            >
              <span className="min-w-0 truncate">{emailLocalPart}</span>
              <span className="max-w-[60%] shrink-0 truncate">{emailDomainPart}</span>
            </div>
            <button
              aria-label={`Change email address from ${email}`}
              className="shrink-0 text-sm text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project"
              onClick={onChangeEmail}
              type="button"
            >
              Change
            </button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <ReactCodeInput
              name="verification-code"
              inputMode="tel"
              type="text"
              fields={6}
              onChange={setCode}
              {...codeInputStyle}
              className={isCodeError ? "code-input-v3 code-input-v3-error" : "code-input-v3"}
            />
            {isCodeError && <FieldError>{t("signup.step2-code-error")}</FieldError>}
          </div>
          <div className="flex flex-col gap-3">
            <AnimatedCollapse isOpen={code.length === 6 || isVerifying} contentClassName="px-1">
              <Button
                type="submit"
                onClick={handleVerify}
                variant="project"
                size="lg"
                isFullWidth
                isPending={isVerifying}
                isDisabled={isVerifying}
              >
                {String(t("signup.verify"))}
              </Button>
            </AnimatedCollapse>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-label">{t("signup.step2-resend-alert")}</span>
              <button
                className="text-foreground/95 underline decoration-project/60 underline-offset-2 transition-colors duration-200 hover:decoration-project disabled:cursor-not-allowed disabled:text-label/60 disabled:no-underline"
                disabled={isResending || isCooldownActive}
                onClick={handleResend}
                type="button"
              >
                {resendLabel}
              </button>
            </div>
            {import.meta.env.DEV && (
              <Button variant="ghost" size="sm" isFullWidth onClick={onComplete}>
                Preview next step (development only)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
