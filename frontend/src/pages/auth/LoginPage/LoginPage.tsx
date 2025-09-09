import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

import CodeInputStep from "@app/components/auth/CodeInputStep";
import { createNotification } from "@app/components/notifications";
import attemptLogin from "@app/components/utilities/attemptLogin";
import { isLoggedIn } from "@app/hooks/api/reactQuery";
import { useVerifyEmailVerificationCode } from "@app/hooks/api/users";

import { InitialStep, SSOStep } from "./components";
import { useNavigateToSelectOrganization } from "./Login.utils";

export const LoginPage = ({ isAdmin }: { isAdmin?: boolean }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [isCodeInputCheckLoading, setIsCodeInputCheckLoading] = useState(false);
  const { navigateToSelectOrganization } = useNavigateToSelectOrganization();
  const { mutateAsync: verifyEmailVerificationCode } = useVerifyEmailVerificationCode();

  const queryParams = new URLSearchParams(window.location.search);

  const handleEmailVerification = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setCodeError(true);
      return;
    }

    setIsCodeInputCheckLoading(true);
    setCodeError(false);

    try {
      // First verify the email
      await verifyEmailVerificationCode({ username: email, code: verificationCode });

      createNotification({
        text: "Email verified successfully!",
        type: "success"
      });

      // Now attempt login since email is verified
      const callbackPort = queryParams.get("callback_port");

      if (callbackPort) {
        // CLI login flow
        const isCliLoginSuccessful = await attemptLogin({
          email: email.toLowerCase(),
          password
        });

        if (isCliLoginSuccessful && isCliLoginSuccessful.success) {
          navigateToSelectOrganization(callbackPort);
        } else {
          throw new Error("CLI login failed after email verification");
        }
      } else {
        // Regular login flow
        const isLoginSuccessful = await attemptLogin({
          email: email.toLowerCase(),
          password
        });

        if (isLoginSuccessful && isLoginSuccessful.success) {
          navigateToSelectOrganization(undefined, isAdmin);
          createNotification({
            text: "Successfully logged in",
            type: "success"
          });
        } else {
          throw new Error("Login failed after email verification");
        }
      }
    } catch (error: any) {
      console.error(error);
      if (error.message?.includes("after email verification")) {
        createNotification({
          text: "Email verified but login failed. Please try logging in again.",
          type: "error"
        });
        setStep(0); // Go back to login
      } else {
        setCodeError(true);
        createNotification({
          text: "Invalid verification code. Please try again.",
          type: "error"
        });
      }
    } finally {
      setIsCodeInputCheckLoading(false);
    }
  };

  useEffect(() => {
    // TODO(akhilmhdh): workspace will be controlled by a workspace context
    const handleRedirects = async () => {
      try {
        const callbackPort = queryParams?.get("callback_port");
        // case: a callback port is set, meaning it's a cli login request: redirect to select org with callback port
        if (callbackPort) {
          navigateToSelectOrganization(callbackPort);
        } else {
          // case: no callback port, meaning it's a regular login request: redirect to select org
          navigateToSelectOrganization();
        }
      } catch {
        console.log("Error - Not logged in yet");
      }
    };

    if (isLoggedIn()) {
      handleRedirects();
    } else {
      setStep(0);
    }
  }, []);

  const renderView = () => {
    switch (step) {
      case 0:
        return (
          <InitialStep
            isAdmin={isAdmin}
            setStep={setStep}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
          />
        );
      case 2:
        return <SSOStep setStep={setStep} type="SAML" />;
      case 3:
        return <SSOStep setStep={setStep} type="OIDC" />;
      case 4:
        return (
          <CodeInputStep
            email={email}
            incrementStep={handleEmailVerification}
            setCode={setVerificationCode}
            codeError={codeError}
            isCodeInputCheckLoading={isCodeInputCheckLoading}
          />
        );
      default:
        return <div />;
    }
  };

  return (
    <div className="flex max-h-screen min-h-screen flex-col justify-center overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6">
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <Link to="/">
        <div className="mb-4 mt-20 flex justify-center">
          <img
            src="/images/gradientLogo.svg"
            style={{
              height: "90px",
              width: "120px"
            }}
            alt="Infisical logo"
          />
        </div>
      </Link>
      <div className="pb-28">{renderView()}</div>
    </div>
  );
};
