import { type FormEvent, useRef, useState } from "react";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { Link } from "@tanstack/react-router";

import { useV4Scheme } from "@app/components/v4/scope";
import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack } from "@app/components/v4/ui/layout";
import { envConfig } from "@app/config/env";
import { useSendAccountRecoveryEmail } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

import { AuthPage } from "../components/AuthPage";
import { EmailServiceDialog } from "../components/EmailServiceDialog";
import { useAuthPreview } from "../preview";

import styles from "../auth.module.css";

export const AccountRecoveryEmailPage = () => {
  const preview = useAuthPreview();
  const scheme = useV4Scheme();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(preview === "sent" ? "ada@acme.dev" : "");
  const [step, setStep] = useState(preview === "sent" ? 2 : 1);
  const [isEmailSetupOpen, setIsEmailSetupOpen] = useState(false);
  const { data: serverDetails } = useFetchServerStatus();
  const { mutateAsync } = useSendAccountRecoveryEmail();
  const [captchaToken, setCaptchaToken] = useState("");
  const captchaRef = useRef<HCaptcha>(null);
  const requiresCaptcha = Boolean(envConfig.CAPTCHA_SITE_KEY);

  const sendRecoveryEmail = async () => {
    if (!email) return;
    try {
      await mutateAsync({ email, captchaToken: requiresCaptcha ? captchaToken : undefined });
      setStep(2);
    } catch {
      setLoading(false);
    } finally {
      if (requiresCaptcha) {
        captchaRef.current?.resetCaptcha();
        setCaptchaToken("");
      }
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (preview) return;
    setLoading(true);
    if (serverDetails?.emailConfigured) {
      sendRecoveryEmail();
    } else {
      setIsEmailSetupOpen(true);
      setLoading(false);
    }
  };

  const backToLogin = (
    <Link to="/v4/login" className={styles.link}>
      Back to login
    </Link>
  );

  if (step === 2) {
    return (
      <AuthPage
        variant="focused"
        pageTitle="Account Recovery"
        title="Check your inbox"
        description={
          <>
            If an account exists for <span className={styles.recipient}>{email}</span>, you&apos;ll
            receive recovery instructions shortly.
          </>
        }
        footer={backToLogin}
      >
        {null}
      </AuthPage>
    );
  }

  return (
    <AuthPage
      variant="focused"
      pageTitle="Account Recovery"
      title="Recover your account"
      description="Enter your email to receive recovery instructions."
      footer={backToLogin}
    >
      <form onSubmit={onSubmit}>
        <Stack gap={16}>
          <Field label="Email">
            <Input
              type="email"
              size="lg"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              required
            />
          </Field>
          {envConfig.CAPTCHA_SITE_KEY && (
            <div className={styles.captcha}>
              <HCaptcha
                theme={scheme === "dark" ? "dark" : "light"}
                sitekey={envConfig.CAPTCHA_SITE_KEY}
                onVerify={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken("")}
                ref={captchaRef}
              />
            </div>
          )}
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="w-full"
            loading={loading}
            disabled={requiresCaptcha && !captchaToken}
          >
            Continue
          </Button>
        </Stack>
      </form>
      <EmailServiceDialog open={isEmailSetupOpen} onOpenChange={setIsEmailSetupOpen} />
    </AuthPage>
  );
};
