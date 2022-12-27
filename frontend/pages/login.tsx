import React, { useEffect, useState } from "react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import Button from "~/components/basic/buttons/Button";
import Error from "~/components/basic/Error";
import InputField from "~/components/basic/InputField";
import { getTranslatedStaticProps } from "~/components/utilities/withTranslateProps";
import attemptLogin from "~/utilities/attemptLogin";

import getWorkspaces from "./api/workspace/getWorkspaces";
import ListBox from "~/components/basic/Listbox";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorLogin, setErrorLogin] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  const lang = router.locale ?? "en";

  const setLanguage = async (to: string) => {
    router.push("/login", "/login", { locale: to });
    localStorage.setItem("lang", to);
  };

  useEffect(() => {
    const redirectToDashboard = async () => {
      let userWorkspace;
      try {
        const userWorkspaces = await getWorkspaces();
        userWorkspace = userWorkspaces[0]._id;
        router.push("/dashboard/" + userWorkspace);
      } catch (error) {
        console.log("Error - Not logged in yet");
      }
    };
    redirectToDashboard();
  }, []);

  /**
   * This function check if the user entered the correct credentials and should be allowed to log in.
   */
  const loginCheck = async () => {
    if (!email || !password) {
      return;
    }

    setIsLoading(true);
    await attemptLogin(
      email,
      password,
      setErrorLogin,
      router,
      false,
      true
    ).then(() => {
      setTimeout(function () {
        setIsLoading(false);
      }, 2000);
    });
  };

  return (
    <div className="bg-bunker-800 h-screen flex flex-col justify-start px-6">
      <Head>
        <title>{t("common:head-title", { title: t("login:title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login:og-title") ?? ""} />
        <meta name="og:description" content={t("login:og-description") ?? ""} />
      </Head>
      <Link href="/">
        <div className="flex justify-center mb-8 mt-20 cursor-pointer">
          <Image
            src="/images/biglogo.png"
            height={90}
            width={120}
            alt="long logo"
          />
        </div>
      </Link>
      <form
        onChange={() => setErrorLogin(false)}
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="bg-bunker w-full max-w-md mx-auto h-7/12 py-4 pt-8 px-6 rounded-xl drop-shadow-xl">
          <p className="text-3xl w-max mx-auto flex justify-center font-semibold text-bunker-100 mb-6">
            {t("login:login")}
          </p>
          <div className="flex items-center justify-center w-full md:p-2 rounded-lg mt-4 md:mt-0 max-h-24 md:max-h-28">
            <InputField
              label={t("common:email")}
              onChangeHandler={setEmail}
              type="email"
              value={email}
              placeholder=""
              isRequired
              autoComplete="username"
            />
          </div>
          <div className="relative flex items-center justify-center w-full md:p-2 rounded-lg md:mt-2 mt-6 max-h-24 md:max-h-28">
            <InputField
              label={t("common:password")}
              onChangeHandler={setPassword}
              type="password"
              value={password}
              placeholder=""
              isRequired
              autoComplete="current-password"
              id="current-password"
            />
            <div className="absolute top-2 right-3 text-primary-700 hover:text-primary duration-200 cursor-pointer text-sm">
              <Link href="/verify-email">Forgot password?</Link>
            </div>
          </div>
          {!isLoading && errorLogin && (
            <Error text="Your email and/or password are wrong." />
          )}
          <div className="flex flex-col items-center justify-center w-full md:p-2 max-h-20 max-w-md mt-4 mx-auto text-sm">
            <div className="text-l mt-6 m-8 px-8 py-3 text-lg">
              <Button
                type="submit"
                text={t("login:login") ?? ""}
                onButtonPressed={loginCheck}
                loading={isLoading}
                size="lg"
              />
            </div>
          </div>
          {/* <div className="flex items-center justify-center w-full md:p-2 rounded-lg max-h-24 md:max-h-28">
          <p className="text-gray-400">I may have <Link href="/login"><u className="text-sky-500 cursor-pointer">forgotten my password.</u></Link></p>
        </div> */}
        </div>
        {false && (
          <div className="w-full p-2 flex flex-row items-center bg-white/10 text-gray-300 rounded-md max-w-md mx-auto mt-4">
            <FontAwesomeIcon icon={faWarning} className="ml-2 mr-6 text-6xl" />
            {t("common:maintenance-alert")}
          </div>
        )}
        <div className="flex flex-row items-center justify-center md:pb-4 mt-4">
          <p className="text-sm flex justify-center text-gray-400 w-max">
            {t("login:need-account")}
          </p>
          <Link href="/signup">
            <button className="text-primary-700 hover:text-primary duration-200 font-normal text-sm underline-offset-4 ml-1.5">
              {t("login:create-account")}
            </button>
          </Link>
        </div>
      </form>
      <div className="mt-4 flex items-center justify-center w-full">
        <div className="w-48 mx-auto">
          <ListBox
            selected={lang}
            onChange={setLanguage}
            data={["en", "ko"]}
            isFull
            text={`${t("common:language")}: `}
          />
        </div>
      </div>
    </div>
  );
}

export const getStaticProps = getTranslatedStaticProps(["auth", "login"]);
