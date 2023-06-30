/* eslint-disable no-nested-ternary */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Head from "next/head";
import Image from "next/image";
import { useRouter } from "next/router";
import queryString from "query-string";

import DownloadBackupPDF from "@app/components/signup/DonwloadBackupPDFStep";
import EnterEmailStep from "@app/components/signup/EnterEmailStep";
import InitialSignupStep from "@app/components/signup/InitialSignupStep";
import TeamInviteStep from "@app/components/signup/TeamInviteStep";
import UserInfoStep from "@app/components/signup/UserInfoStep";
import WaitForEmailStep from "@app/components/signup/WaitForEmailStep";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { useProviderAuth } from "@app/hooks/useProviderAuth";

import confirmEmailSignUp from "./api/auth/confirmEmailSignUp";
import getWorkspaces from "./api/workspace/getWorkspaces";

/**
 * @returns the signup page
 */
export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [attributionSource, setAttributionSource] = useState("");
  const [step, setStep] = useState(1);
  const router = useRouter();
  const { data: serverDetails } = useFetchServerStatus();
  const [isSignupWithEmail, setIsSignupWithEmail] = useState(false);
  const { t } = useTranslation();

  const { email: providerEmail, providerAuthToken, isProviderUserCompleted } = useProviderAuth();

  if (providerAuthToken && isProviderUserCompleted) {
    router.push(`/login?providerAuthToken=${encodeURIComponent(providerAuthToken)}`);
  }

  if (providerAuthToken && step < 3) {
    setStep(3);
  }

  useEffect(() => {
    const tryAuth = async () => {
      try {
        const userWorkspaces = await getWorkspaces();
        router.push(`/dashboard/${userWorkspaces[0]._id}`);
      } catch (error) {
        console.log("Error - Not logged in yet");
      }
    };
    tryAuth();
  }, []);

  useEffect(() => {
    const checkEmailConfirm = async () => {
      if (step >= 3) {
        return;
      }
      const parsedUrl = queryString.parse(router.asPath.split("?")[1]);
      const tokenParam = parsedUrl.token as string;
      const emailParam = (parsedUrl.to as string)?.replace(" ", "+").trim();
      if (!tokenParam || !emailParam) {
        return;
      }
      try {
        const response = await confirmEmailSignUp({ email: emailParam, token: tokenParam });
        if (response?.status === 200) {
          const tempToken = (await response.json()).token;
          SecurityClient.setSignupToken(tempToken);
          setStep(3);
          setEmail(emailParam);
        } else {
          throw new Error("Unable to confirm email!");
        }
      } catch (error) {
        router.push("/login");
      }
    };
    checkEmailConfirm();
  }, []);

  /**
   * Goes to the following step (out of 5) of the signup process.
   * Step 1 is submitting your email
   * Step 2 is Verifying your email with the code that you received
   * Step 3 is asking the final info.
   * Step 4 is downloading a backup pdf
   * Step 5 is inviting users
   */
  const incrementStep = async () => {
    if (step < 5) {
      setStep(step + 1);
    }
  };

  // when email service is not configured, skip step 2 and 5
  useEffect(() => {
    if (!serverDetails?.emailConfigured && step === 2) {
      incrementStep();
    }

    if (!serverDetails?.emailConfigured && step === 5) {
      getWorkspaces().then((userWorkspaces) => {
        router.push(`/dashboard/${userWorkspaces[0]._id}`);
      });
    }
  }, [step]);

  const renderView = (registerStep: number) => {
    if (isSignupWithEmail && registerStep === 1) {
      return <EnterEmailStep email={email} setEmail={setEmail} incrementStep={incrementStep} />;
    }

    if (!isSignupWithEmail && registerStep === 1) {
      return <InitialSignupStep setIsSignupWithEmail={setIsSignupWithEmail} />;
    }

    if (registerStep === 2) {
      return <WaitForEmailStep email={email} />;
    }

    if (registerStep === 3) {
      return (
        <UserInfoStep
          incrementStep={incrementStep}
          email={email || providerEmail}
          password={password}
          setPassword={setPassword}
          name={name}
          setName={setName}
          organizationName={organizationName}
          setOrganizationName={setOrganizationName}
          attributionSource={attributionSource}
          setAttributionSource={setAttributionSource}
          providerAuthToken={providerAuthToken}
        />
      );
    }

    if (registerStep === 4) {
      return (
        <DownloadBackupPDF
          incrementStep={incrementStep}
          email={email || providerEmail}
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
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28 ">
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
