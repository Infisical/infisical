import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { faWarning } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Button from '@app/components/basic/buttons/Button';
import Error from '@app/components/basic/Error';
import InputField from '@app/components/basic/InputField';
import attemptLogin from '@app/components/utilities/attemptLogin';

/**
 * 1st step of login - user enters their username and password
 * @param {Object} obj
 * @param {String} obj.email - email of user
 * @param {Function} obj.setEmail - function to set the email of user
 * @param {String} obj.password - password of user
 * @param {String} obj.setPassword - function to set the password of user
 * @param {Function} obj.setStep - function to set the login flow step
 * @returns
 */
export default function LoginStep({
  email,
  setEmail,
  password,
  setPassword,
  setStep
}: {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  setStep: (step: number) => void;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(false);

  const { t } = useTranslation();

  const handleLogin = async () => {
    try {
      if (!email || !password) {
        return;
      }

      setIsLoading(true);
      const isLoginSuccessful = await attemptLogin(email, password);
      if (isLoginSuccessful && isLoginSuccessful.success) {
        // case: login was successful

        if (isLoginSuccessful.mfaEnabled) {
          // case: login requires MFA step
          setStep(2);
          setIsLoading(false);
          return;
        }

        // case: login does not require MFA step
        router.push(`/dashboard/${localStorage.getItem('projectData.id')}`);
      }
    } catch (err) {
      setLoginError(true);
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <div className="h-7/12 mx-auto w-full max-w-md rounded-xl bg-bunker py-4 px-6 pt-8 drop-shadow-xl">
        <p className="mx-auto mb-6 flex w-max justify-center text-3xl font-semibold text-bunker-100">
          {t('login.login')}
        </p>
        <div className="mt-4 flex max-h-24 w-full items-center justify-center rounded-lg md:mt-0 md:max-h-28 md:p-2">
          <InputField
            label={t('common.email')}
            onChangeHandler={setEmail}
            type="email"
            value={email}
            placeholder=""
            isRequired
            autoComplete="username"
          />
        </div>
        <div className="relative mt-6 flex max-h-24 w-full items-center justify-center rounded-lg md:mt-2 md:max-h-28 md:p-2">
          <InputField
            label={t('common.password')}
            onChangeHandler={setPassword}
            type="password"
            value={password}
            placeholder=""
            isRequired
            autoComplete="current-password"
            id="current-password"
          />
          <div className="absolute top-2 right-3 cursor-pointer text-sm text-primary-700 duration-200 hover:text-primary">
            <Link href="/verify-email">
              <button
                type="button"
                className="ml-1.5 text-sm font-normal text-primary-700 underline-offset-4 duration-200 hover:text-primary"
              >
                {t('login.forgot-password')}
              </button>
            </Link>
          </div>
        </div>
        {!isLoading && loginError && <Error text={t('login.error-login') ?? ''} />}
        <div className="mx-auto mt-4 flex max-h-20 w-full max-w-md flex-col items-center justify-center text-sm md:p-2">
          <div className="text-l m-8 mt-6 px-8 py-3 text-lg">
            <Button
              type="submit"
              text={t('login.login') ?? ''}
              onButtonPressed={async () => handleLogin()}
              loading={isLoading}
              size="lg"
            />
          </div>
        </div>
      </div>
      {false && (
        <div className="mx-auto mt-4 flex w-full max-w-md flex-row items-center rounded-md bg-white/10 p-2 text-gray-300">
          <FontAwesomeIcon icon={faWarning} className="ml-2 mr-6 text-6xl" />
          {t('common.maintenance-alert')}
        </div>
      )}
      <div className="mt-4 flex flex-row items-center justify-center md:pb-4">
        <p className="flex w-max justify-center text-sm text-gray-400">{t('login.need-account')}</p>
        <Link href="/signup">
          <button
            type="button"
            className="ml-1.5 text-sm font-normal text-primary-700 underline-offset-4 duration-200 hover:text-primary"
          >
            {t('login.create-account')}
          </button>
        </Link>
      </div>
    </form>
  );
}
