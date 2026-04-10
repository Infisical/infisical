/* eslint-disable no-nested-ternary */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import CodeInputStep from "@app/components/auth/CodeInputStep";
import InitialSignupStep from "@app/components/auth/InitialSignupStep";
import TeamInviteStep from "@app/components/auth/TeamInviteStep";
import UserInfoStep from "@app/components/auth/UserInfoStep";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button } from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useVerifySignupEmailVerificationCode } from "@app/hooks/api";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

export const SignUpPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [attributionSource, setAttributionSource] = useState("");
  const [code, setCode] = useState("123456");
  const [codeError, setCodeError] = useState(false);
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const { data: serverDetails } = useFetchServerStatus();
  const [isCodeInputCheckLoading, setIsCodeInputCheckLoading] = useState(false);
  const { t } = useTranslation();
  const { mutateAsync } = useVerifySignupEmailVerificationCode();
  const { config } = useServerConfig();

  useEffect(() => {
    if (!config.allowSignUp) {
      navigate({ to: "/login" });
    }
  }, [config.allowSignUp]);

  /**
   * Goes to the following step (out of 5) of the signup process.
   * Step 1 is submitting your email
   * Step 2 is Verifying your email with the code that you received
   * Step 3 is asking the final info.
   * Step 4 is downloading a backup pdf
   * Step 5 is inviting users
   */
  const incrementStep = async () => {
    if (step === 1 || step === 3 || step === 4) {
      setStep(step + 1);
    } else if (step === 2) {
      setIsCodeInputCheckLoading(true);
      // Checking if the code matches the email.
      try {
        const { token } = await mutateAsync({ email, code });
        SecurityClient.setSignupToken(token);
        setStep(3);
      } catch (err) {
        console.error(err);
        setCodeError(true);
      }
      setIsCodeInputCheckLoading(false);
    }
  };

  // when email service is not configured, skip step 2 and 5
  useEffect(() => {
    (async () => {
      if (!serverDetails?.emailConfigured && step === 2) {
        incrementStep();
      }

      if (!serverDetails?.emailConfigured && step === 4) {
        navigate({
          to: "/"
        });
      }
    })();
  }, [step]);

  const renderView = (registerStep: number) => {
    if (registerStep === 1) {
      return <InitialSignupStep email={email} setEmail={setEmail} incrementStep={incrementStep} />;
    }

    if (registerStep === 2) {
      return (
        <CodeInputStep
          email={email}
          incrementStep={incrementStep}
          setCode={setCode}
          codeError={codeError}
          isCodeInputCheckLoading={isCodeInputCheckLoading}
        />
      );
    }

    if (registerStep === 3) {
      return (
        <UserInfoStep
          incrementStep={incrementStep}
          email={email}
          password={password}
          setPassword={setPassword}
          name={name}
          setName={setName}
          organizationName={organizationName}
          setOrganizationName={setOrganizationName}
          attributionSource={attributionSource}
          setAttributionSource={setAttributionSource}
          providerAuthToken={undefined}
        />
      );
    }

    if (serverDetails?.emailConfigured) {
      return <TeamInviteStep />;
    }

    return "";
  };

  return (
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-4">
      <AuthPageBackground />
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      <AuthPageHeader>
        <Button asChild>
          <Link to="/login">Log In</Link>
        </Button>
      </AuthPageHeader>
      <div className="relative z-10 my-auto flex flex-col items-center py-10">
        <form className="w-full" onSubmit={(e) => e.preventDefault()} noValidate>
          {renderView(step)}
        </form>
      </div>
      <AuthPageFooter />
    </div>
  );
};
