import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import axios from "axios"

// import ListBox from '@app/components/basic/Listbox';
import InitialLoginStep from "@app/components/login/InitialLoginStep";
import MFAStep from "@app/components/login/MFAStep";
import PasswordInputStep from "@app/components/login/PasswordInputStep";
import { useProviderAuth } from "@app/hooks/useProviderAuth";
import { getAuthToken, isLoggedIn } from "@app/reactQuery";

import { fetchUserDetails } from "~/hooks/api/users/queries";

import getWorkspaces from "./api/workspace/getWorkspaces";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState(1);
  const { t } = useTranslation();

  // const lang = router.locale ?? 'en';
  const {
    providerAuthToken,
    email: providerEmail,
    setProviderAuthToken,
    isProviderUserCompleted
  } = useProviderAuth();

  if (providerAuthToken && isProviderUserCompleted === false) {
    router.push(`/signup?providerAuthToken=${encodeURIComponent(providerAuthToken)}`);
  }

  // const setLanguage = async (to: string) => {
  //   router.push('/login', '/login', { locale: to });
  //   localStorage.setItem('lang', to);
  // };

  useEffect(() => {
    // TODO(akhilmhdh): workspace will be controlled by a workspace context
    const redirectToDashboard = async () => {
      let userWorkspace;
      try {
        const userWorkspaces = await getWorkspaces();
        userWorkspace = userWorkspaces[0] && userWorkspaces[0]._id;

        // user details
        const userDetails = await fetchUserDetails()
        // send details back to client

        const queryParams = new URLSearchParams(window.location.search)
        if (queryParams && queryParams.get("callback_port")) {
          const callbackPort = queryParams.get("callback_port")

          // send post request to cli with details
          const cliUrl = `http://localhost:${callbackPort}`
          const instance = axios.create()
          await instance.post(cliUrl, { email: userDetails.email, privateKey: localStorage.getItem("PRIVATE_KEY"), JTWToken: getAuthToken() })
        }
        router.push(`/dashboard/${userWorkspace}`);
      } catch (error) {
        console.log("Error - Not logged in yet");
      }
    };
    if (isLoggedIn()) {
      redirectToDashboard();
    }
  }, []);

  const renderView = (loginStep: number) => {
    if (providerAuthToken && step === 1) {
      return (
        <PasswordInputStep
          email={providerEmail}
          password={password}
          providerAuthToken={providerAuthToken}
          setPassword={setPassword}
          setProviderAuthToken={setProviderAuthToken}
          setStep={setStep}
        />
      );
    }

    if (loginStep === 1) {
      return <InitialLoginStep
        setStep={setStep}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
      />;
    }

    if (step === 2) {
      return (
        <MFAStep
          email={email || providerEmail}
          password={password}
          providerAuthToken={providerAuthToken}
        />
      );
    }

    return <div />;
  };

  return (
    <div className="flex h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28 ">
      <Head>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Head>
      <Link href="/">
        <div className="mb-4 mt-20 flex justify-center">
          <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
        </div>
      </Link>
      {renderView(step)}
      {/* <div className="absolute right-4 top-0 mt-4 flex items-center justify-center">
        <div className="mx-auto w-48">
          <ListBox
            isSelected={lang}
            onChange={setLanguage}
            data={['en', 'ko', 'fr', 'pt-BR']}
            isFull
            text={`${t('common.language')}: `}
          />
        </div>
      </div> */}
    </div>
  );
}
