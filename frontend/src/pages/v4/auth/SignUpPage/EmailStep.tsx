import { useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useScheme } from "@infisical/cipher/scope";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { toast } from "@infisical/cipher/ui/sonner";
import { Link } from "@tanstack/react-router";

import { envConfig } from "@app/config/env";
import { useServerConfig } from "@app/context";
import { isValidEmail } from "@app/helpers/email";
import { preserveHubSpotUtk } from "@app/helpers/utmTracking";
import { useSendVerificationEmail } from "@app/hooks/api";
import { LoginMethod } from "@app/hooks/api/admin/types";

import { v4Path } from "../../links";
import { AuthPage } from "../components/AuthPage";
import { ProviderButton, ProviderMark } from "../components/ProviderButton";
import { RegionSelect } from "../components/RegionSelect";

import styles from "../auth.module.css";

type Props = {
  email: string;
  setEmail: (value: string) => void;
  onComplete: (email: string, cooldownSeconds: number) => void;
  pendingVerificationEmail?: string;
  onResumeVerification: () => void;
  callbackPort?: number;
  isPreview?: boolean;
};

const SOCIAL_SIGNUPS = [
  { method: LoginMethod.GITHUB, label: "Continue with GitHub", isRecommended: true },
  { method: LoginMethod.GOOGLE, label: "Continue with Google" },
  { method: LoginMethod.GITLAB, label: "Continue with GitLab" }
];

export const EmailStep = ({
  email,
  setEmail,
  onComplete,
  pendingVerificationEmail,
  onResumeVerification,
  callbackPort,
  isPreview
}: Props) => {
  const scheme = useScheme();
  const { config } = useServerConfig();
  const { mutateAsync, isPending } = useSendVerificationEmail();
  const requiresCaptcha = Boolean(envConfig.CAPTCHA_SITE_KEY);
  const [emailError, setEmailError] = useState(false);
  const [isCaptchaReady, setIsCaptchaReady] = useState(!requiresCaptcha);
  const [isCaptchaPending, setIsCaptchaPending] = useState(false);
  const captchaRef = useRef<HCaptcha>(null);
  const isEmailValid = isValidEmail(email);

  const shouldDisplaySignupMethod = (method: LoginMethod) =>
    !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);
  const socialSignups = SOCIAL_SIGNUPS.filter(({ method }) => shouldDisplaySignupMethod(method));
  const canUseEmail = shouldDisplaySignupMethod(LoginMethod.EMAIL);

  const handleEmailSignup = async () => {
    if (isPreview) return;
    if (!isEmailValid) {
      setEmailError(true);
      return;
    }
    setEmailError(false);
    const normalizedEmail = email.toLowerCase();

    if (normalizedEmail === pendingVerificationEmail) {
      setEmail(normalizedEmail);
      onResumeVerification();
      return;
    }

    let captchaToken: string | undefined;
    if (requiresCaptcha) {
      setIsCaptchaPending(true);
      try {
        captchaToken = (await captchaRef.current?.execute({ async: true }))?.response;
        if (!captchaToken) throw new Error("hCaptcha did not return a token");
      } catch {
        toast.error("Captcha verification failed. Please try again.");
        captchaRef.current?.resetCaptcha();
        return;
      } finally {
        setIsCaptchaPending(false);
      }
    }

    try {
      const { cooldownSeconds } = await mutateAsync({ email: normalizedEmail, captchaToken });
      onComplete(normalizedEmail, cooldownSeconds);
    } finally {
      if (requiresCaptcha) captchaRef.current?.resetCaptcha();
    }
  };

  const handleSocialSignup = (method: LoginMethod) => {
    if (isPreview) return;
    preserveHubSpotUtk();
    const query = callbackPort ? `?callback_port=${encodeURIComponent(callbackPort)}` : "";
    const popup = window.open(`/api/v1/sso/redirect/${method}${query}`);
    if (popup) window.close();
  };

  return (
    <AuthPage
      pageTitle="Sign Up"
      title="Sign up"
      description="Create your Infisical account"
      titleAction={<RegionSelect />}
      footer={
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
      bottom={
        <>
          <span>
            By signing up, you agree to our{" "}
            <a
              href="https://infisical.com/terms/cloud"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://infisical.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              Privacy Policy
            </a>
            .
          </span>
          {requiresCaptcha && (
            <span>
              This site is protected by hCaptcha and its{" "}
              <a
                href="https://www.hcaptcha.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                Privacy Policy
              </a>{" "}
              and{" "}
              <a
                href="https://www.hcaptcha.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                Terms of Service
              </a>{" "}
              apply.
            </span>
          )}
        </>
      }
    >
      {socialSignups.length > 0 && (
        <Stack gap={8}>
          {socialSignups.map(({ method, label, isRecommended }) => (
            <ProviderButton
              key={method}
              provider={method}
              label={label}
              ariaLabel={label}
              badge={isRecommended ? "Recommended" : undefined}
              onClick={() => handleSocialSignup(method)}
            />
          ))}
        </Stack>
      )}
      {socialSignups.length > 0 && canUseEmail && <div className={styles.divider}>or</div>}
      {canUseEmail && (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleEmailSignup();
          }}
        >
          <Stack gap={16}>
            <Field label="Email" error={emailError ? "Enter a valid email" : undefined}>
              <Input
                type="email"
                size="lg"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setEmailError(false);
                }}
                placeholder="you@company.com"
                autoComplete="username"
                required
              />
            </Field>
            {envConfig.CAPTCHA_SITE_KEY && (
              <HCaptcha
                size="invisible"
                theme={scheme === "dark" ? "dark" : "light"}
                sitekey={envConfig.CAPTCHA_SITE_KEY}
                onLoad={() => setIsCaptchaReady(true)}
                ref={captchaRef}
              />
            )}
            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full"
              loading={isPending || isCaptchaPending}
              disabled={!isEmailValid || !isCaptchaReady}
            >
              <ProviderMark provider="email" />
              Continue with email
            </Button>
          </Stack>
        </form>
      )}
    </AuthPage>
  );
};
