/* eslint-disable react/jsx-props-no-spreading */
import { useEffect, useRef, useState } from "react";
import ReactCodeInput from "react-code-input";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import axios from "axios";

import { Button, Card, CardContent, CardHeader, CardTitle, FieldError } from "@app/components/v3";
import { useSendVerificationEmail, useVerifySignupEmailVerificationCode } from "@app/hooks/api";

import SecurityClient from "../utilities/SecurityClient";

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
  onComplete: () => void;
  initialCooldown: number;
}

export default function CodeInputStep({
  email,
  onComplete,
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

  let resendLabel = t("signup.step2-resend-submit");
  if (isResending) {
    resendLabel = t("signup.step2-resend-progress");
  } else if (remainingCooldown > 0) {
    resendLabel = `${t("signup.step2-resend-submit")} (${remainingCooldown}s)`;
  }

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <Card className="mx-auto w-full max-w-md items-stretch gap-0 p-6">
        <CardHeader className="mb-2 gap-2">
          <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-[1.55rem] font-medium text-transparent">
            {t("signup.step2-message")}
          </CardTitle>
        </CardHeader>
        <CardContent>
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
          {isCodeError && <FieldError>{t("signup.step2-code-error")}</FieldError>}
          <div className="mt-4 w-full">
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
          </div>
          <div className="mt-6 flex flex-col items-center gap-2 text-xs text-label">
            <div className="flex flex-row items-baseline gap-1">
              <button
                disabled={isResending || isCooldownActive}
                onClick={handleResend}
                type="button"
              >
                <span
                  className={
                    remainingCooldown > 0
                      ? "text-label/60"
                      : "cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2"
                  }
                >
                  {t("signup.step2-resend-alert")} {resendLabel}
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
        </CardContent>
      </Card>
    </div>
  );
}
