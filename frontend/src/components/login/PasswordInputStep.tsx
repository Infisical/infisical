import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useRouter } from "next/router";

import Error from "@app/components/basic/Error";
import attemptLogin from "@app/components/utilities/attemptLogin";
import getOrganizations from "@app/pages/api/organization/getOrgs";

import SecurityClient from "../utilities/SecurityClient";
import { Button, Input } from "../v2";

export default function PasswordInputStep({
  email,
  password,
  providerAuthToken,
  setPassword,
  setProviderAuthToken,
  setStep
}: {
  email: string;
  password: string;
  providerAuthToken: string;
  setPassword: (password: string) => void;
  setProviderAuthToken: (value: string) => void;
  setStep: (step: number) => void;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);

  const { t } = useTranslation();

  const handleLogin = async () => {
    try {
      setIsLoading(true);
      const loginAttempt = await attemptLogin({
        email,
        password,
        providerAuthToken,
      });

      if (loginAttempt && loginAttempt.success) {
        // case: login was successful

        if (loginAttempt.mfaEnabled) {
          // case: login requires MFA step
          setStep(2);
          setIsLoading(false);
          return;
        }

        // case: login does not require MFA step
        const userOrgs = await getOrganizations();
        const userOrg = userOrgs[0]._id;
        router.push(`/org/${userOrg?._id}/overview`);
      }
    } catch (err) {
      setLoginError(true);
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="h-full mx-auto w-full max-w-md px-6 pt-8">
        <p className="mx-auto mb-6 flex w-max justify-center text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8">
          What’s your Infisical Password?
        </p>
        <div className="relative flex items-center justify-center lg:w-1/6 w-1/4 min-w-[22rem] mx-auto w-full rounded-lg max-h-24 md:max-h-28">
          <div className="flex items-center justify-center w-full rounded-lg max-h-24 md:max-h-28">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Enter your password..."
              isRequired
              autoComplete="current-password"
              id="current-password"
              className="h-12"
            />
          </div>
        </div>
        {!isLoading && loginError && <Error text={t("login.error-login") ?? ""} />}
        <div className='lg:w-1/6 w-1/4 w-full mx-auto flex items-center justify-center min-w-[22rem] text-center rounded-md mt-4'>
          <Button
              colorSchema="primary" 
              variant="outline_bg"
              onClick={async () => handleLogin()} 
              isFullWidth
              isLoading={isLoading}
              className="h-14"
          > 
              {t("login.login")} 
          </Button>
        </div>
        <div className="text-bunker-400 text-xs flex flex-col items-center w-max mx-auto mt-4">
          <span className='duration-200 max-w-sm text-center px-4'>
            Infisical Master Password serves as a decryption mechanism so that even Google is not able to access your secrets.
          </span>
          <Link href="/verify-email">
            <span className='hover:underline mt-2 hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>{t("login.forgot-password")}</span>
          </Link>
        </div>
        <div className="flex flex-row items-center justify-center">
          <button
            onClick={(e) => {
              e.preventDefault();
              SecurityClient.setProviderAuthToken("");
              setProviderAuthToken("");
            }}
            type="button"
            className="text-bunker-400 text-xs hover:underline mt-2 hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer"
          >
            {t("login.other-option")}
          </button>
        </div>
      </div>
    </form>
  );
}
