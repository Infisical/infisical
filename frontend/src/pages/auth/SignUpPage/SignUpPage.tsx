/* eslint-disable no-nested-ternary */
import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";

import CodeInputStep from "@app/components/auth/CodeInputStep";
import EnterEmailStep from "@app/components/auth/EnterEmailStep";
import InitialSignupStep from "@app/components/auth/InitialSignupStep";
import TeamInviteStep from "@app/components/auth/TeamInviteStep";
import UserInfoStep from "@app/components/auth/UserInfoStep";
import SecurityClient from "@app/components/utilities/SecurityClient";
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
  const [isSignupWithEmail, setIsSignupWithEmail] = useState(false);
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
    if (isSignupWithEmail && registerStep === 1) {
      return <EnterEmailStep email={email} setEmail={setEmail} incrementStep={incrementStep} />;
    }

    if (!isSignupWithEmail && registerStep === 1) {
      return <InitialSignupStep setIsSignupWithEmail={setIsSignupWithEmail} />;
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
    <div className="relative flex min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <svg
          viewBox="0 0 800 800"
          className="h-[900px] w-[900px] opacity-[0.04]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="400" cy="400" r="380" stroke="white" strokeWidth="2" />
          <circle cx="400" cy="400" r="370" stroke="white" strokeWidth="0.5" />
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 15 * Math.PI) / 180;
            const x = 400 + 375 * Math.cos(angle);
            const y = 400 + 375 * Math.sin(angle);
            return <circle key={`bolt-${i}`} cx={x} cy={y} r="4" fill="white" />;
          })}
          <circle cx="400" cy="400" r="300" stroke="white" strokeWidth="1.5" />
          <circle cx="400" cy="400" r="290" stroke="white" strokeWidth="0.5" />
          {Array.from({ length: 60 }).map((_, i) => {
            const angle = (i * 6 * Math.PI) / 180;
            const innerR = i % 5 === 0 ? 280 : 285;
            const x1 = 400 + innerR * Math.cos(angle);
            const y1 = 400 + innerR * Math.sin(angle);
            const x2 = 400 + 290 * Math.cos(angle);
            const y2 = 400 + 290 * Math.sin(angle);
            return (
              <line
                key={`tick-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="white"
                strokeWidth={i % 5 === 0 ? "1.5" : "0.5"}
              />
            );
          })}
          <circle cx="400" cy="400" r="200" stroke="white" strokeWidth="1" />
          <circle cx="400" cy="400" r="195" stroke="white" strokeWidth="0.3" />
          {Array.from({ length: 8 }).map((_, i) => {
            const angle = (i * 45 * Math.PI) / 180;
            const x1 = 400 + 200 * Math.cos(angle);
            const y1 = 400 + 200 * Math.sin(angle);
            const x2 = 400 + 300 * Math.cos(angle);
            const y2 = 400 + 300 * Math.sin(angle);
            return (
              <line
                key={`spoke-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
              />
            );
          })}
          <circle cx="400" cy="400" r="100" stroke="white" strokeWidth="2" />
          <circle cx="400" cy="400" r="80" stroke="white" strokeWidth="0.5" />
          <circle cx="400" cy="400" r="15" fill="white" />
          <line x1="320" y1="400" x2="480" y2="400" stroke="white" strokeWidth="4" strokeLinecap="round" />
          <line x1="400" y1="320" x2="400" y2="480" stroke="white" strokeWidth="4" strokeLinecap="round" />
          <line x1="50" y1="50" x2="150" y2="50" stroke="white" strokeWidth="1" />
          <line x1="50" y1="50" x2="50" y2="150" stroke="white" strokeWidth="1" />
          <line x1="750" y1="50" x2="650" y2="50" stroke="white" strokeWidth="1" />
          <line x1="750" y1="50" x2="750" y2="150" stroke="white" strokeWidth="1" />
          <line x1="50" y1="750" x2="150" y2="750" stroke="white" strokeWidth="1" />
          <line x1="50" y1="750" x2="50" y2="650" stroke="white" strokeWidth="1" />
          <line x1="750" y1="750" x2="650" y2="750" stroke="white" strokeWidth="1" />
          <line x1="750" y1="750" x2="750" y2="650" stroke="white" strokeWidth="1" />
        </svg>
      </div>
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      <div className="relative z-10 flex flex-1 flex-col justify-center pt-20">
        <Link to="/">
          <div className="mb-4 flex justify-center">
            <img
              src="/images/gradientLogo.svg"
              style={{ height: "90px", width: "120px" }}
              alt="Infisical logo"
            />
          </div>
        </Link>
        <div className="pb-6">
          <form onSubmit={(e) => e.preventDefault()}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step === 1 ? (isSignupWithEmail ? "step1-email" : "step1-initial") : `step-${step}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {renderView(step)}
              </motion.div>
            </AnimatePresence>
          </form>
        </div>
      </div>
      <footer className="relative z-10 mt-auto py-6 text-center">
        <div className="mb-3 flex items-center justify-center gap-4">
          <a href="https://x.com/infisical" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
            <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
          </a>
          <a href="https://www.linkedin.com/company/infisical/" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
            <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
          </a>
          <a href="https://www.youtube.com/@infisical_os" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
            <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
          </a>
        </div>
        <p className="text-xs text-mineshaft-400">&copy; 2026 Infisical Inc. All rights reserved.</p>
      </footer>
    </div>
  );
};
