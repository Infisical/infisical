/* eslint-disable no-nested-ternary */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Head from "next/head";
import Image from "next/image";
import { NextRouter, useRouter } from "next/router";
import { z } from "zod";

import DownloadBackupPDF from "@app/components/signup/DonwloadBackupPDFStep";
import EmailSendStep from "@app/components/signup/EmailSendStep";
import EmailValidateStep from "@app/components/signup/EmailValidateStep";
import EnterEmailStep from "@app/components/signup/EnterEmailStep";
import InitialSignupStep from "@app/components/signup/InitialSignupStep";
import TeamInviteStep from "@app/components/signup/TeamInviteStep";
import UserInfoStep from "@app/components/signup/UserInfoStep";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { useServerConfig } from "@app/context";
import { useVerifyEmailVerificationCode } from "@app/hooks/api";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";

const userTokenSchema = z.object({
  token: z.string().min(32).max(32),
  email: z.string().email()
});

const removeTokenQueryParam = (router: NextRouter) => {
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.delete("token");
  router.push(currentUrl.href, undefined, { shallow: true });
};

/**
 * @returns the signup page
 */
export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [attributionSource, setAttributionSource] = useState("");
  const [tokenError, setTokenError] = useState(false);
  const [step, setStep] = useState(1);
  const router = useRouter();
  const { data: serverDetails } = useFetchServerStatus();
  const [isSignupWithEmail, setIsSignupWithEmail] = useState(false);
  const [isValidatingEmailAndToken, setIsValidatingEmailAndToken] = useState(false);
  const { t } = useTranslation();
  const { mutateAsync } = useVerifyEmailVerificationCode();
  const { config } = useServerConfig();

  useEffect(() => {
    if (!config.allowSignUp) {
      router.push("/login");
    }
  }, [config.allowSignUp]);

  useEffect(() => {
    const tryAuth = async () => {
      try {
        const userOrgs = await fetchOrganizations();
        router.push(`/org/${userOrgs[0].id}/overview`);
      } catch (error) {
        console.log("Error - Not logged in yet");
      }
    };
    tryAuth();
  }, []);

  const verifyToken = async (userEmail: string, userToken: string) => {
    setIsValidatingEmailAndToken(true);
    // Checking if the code matches the email.
    try {
      const { token } = await mutateAsync({ email: userEmail, token: userToken });
      SecurityClient.setSignupToken(token);
      setStep(3);
    } catch (err) {
      console.error(err);
      setTokenError(true);
    }
    setIsValidatingEmailAndToken(false);
  };

  /**
   * Goes to the following step (out of 5) of the signup process.
   * Step 1 is submitting your email
   * Step 2 is sending email with verification link, then validating when user get's back using the token parameter
   * Step 3 is asking the final info.
   * Step 4 is downloading a backup pdf
   * Step 5 is inviting users
   */
  const incrementStep = async () => {
    if (step === 1 || (serverDetails?.emailConfigured && step === 2) || step === 3 || step === 4) {
      setStep(step + 1);
    } else if (step === 2 && !serverDetails?.emailConfigured) {
      // if emailConfigured is false, then send random token to the api
      await verifyToken(email, "always-validated-token");
    }
  };

  const resetProcess = () => {
    setStep(1);
    setTokenError(false);
    setIsValidatingEmailAndToken(false);
  };

  // when email service is not configured, skip step 2 and 5
  useEffect(() => {
    (async () => {
      if (!serverDetails?.emailConfigured && step === 2) {
        incrementStep();
      }

      if (!serverDetails?.emailConfigured && step === 5) {
        const userOrgs = await fetchOrganizations();
        router.push(`/org/${userOrgs[0].id}/overview`);
      }
    })();
  }, [step]);

  useEffect(() => {
    const checkVerificationToken = async () => {
      const { token: queryToken } = router.query;
      if (queryToken && typeof queryToken === "string") {
        try {
          // Decode and parse the token
          const userToken = JSON.parse(Buffer.from(queryToken, "base64").toString("utf-8"));
          const { token: decodedToken, email: decodedEmail } = userTokenSchema.parse(userToken);
          setEmail(decodedEmail);

          // Remove the token from url
          removeTokenQueryParam(router);

          // Verify the token
          await verifyToken(decodedEmail, decodedToken);
        } catch (error) {
          // Remove the token from url
          removeTokenQueryParam(router);
          console.error("Invalid Token Provided");
        }
      }
    };

    checkVerificationToken();
  }, []);

  const renderView = (registerStep: number) => {
    if (isValidatingEmailAndToken || tokenError) {
      return (
        <EmailValidateStep
          isValidatingEmailAndToken={isValidatingEmailAndToken}
          isValidationFailed={tokenError}
          resetProcess={resetProcess}
        />
      );
    }

    if (isSignupWithEmail && registerStep === 1) {
      return <EnterEmailStep email={email} setEmail={setEmail} incrementStep={incrementStep} />;
    }

    if (!isSignupWithEmail && registerStep === 1) {
      return <InitialSignupStep setIsSignupWithEmail={setIsSignupWithEmail} />;
    }

    if (registerStep === 2) {
      return <EmailSendStep email={email} />;
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

    if (registerStep === 4) {
      return (
        <DownloadBackupPDF
          incrementStep={incrementStep}
          email={email}
          password={password}
          name={name}
        />
      );
    }

    if (serverDetails?.emailConfigured) {
      return <TeamInviteStep />;
    }

    return "";
  };

  return (
    <div className="flex max-h-screen min-h-screen flex-col justify-center overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28 ">
      <Head>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Head>
      <div className="mb-4 mt-20 flex justify-center">
        <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical Logo" />
      </div>
      <form onSubmit={(e) => e.preventDefault()}>{renderView(step)}</form>
    </div>
  );
}
