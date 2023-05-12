import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

import sendVerificationEmail from '@app/pages/api/auth/SendVerificationEmail';

import Button from '../basic/buttons/Button';
import InputField from '../basic/InputField';

interface DownloadBackupPDFStepProps {
  incrementStep: () => void;
  email: string;
  setEmail: (value: string) => void;
}

/**
 * This is the first step of the sign up process - users need to enter their email
 * @param {object} obj
 * @param {string} obj.email - email of a user signing up
 * @param {function} obj.setEmail - funciton that manages the state of the email variable
 * @param {function} obj.incrementStep - function to go to the next step of the signup flow
 * @returns
 */
export default function EnterEmailStep({
  email,
  setEmail,
  incrementStep
}: DownloadBackupPDFStepProps): JSX.Element {
  const [emailError, setEmailError] = useState(false);
  const [emailErrorMessage, setEmailErrorMessage] = useState('');
  const { t } = useTranslation();

  /**
   * Verifies if the entered email "looks" correct
   */
  const emailCheck = () => {
    let emailCheckBool = false;
    if (!email) {
      setEmailError(true);
      setEmailErrorMessage('Please enter your email.');
      emailCheckBool = true;
    } else if (!email.includes('@') || !email.includes('.') || !/[a-z]/.test(email)) {
      setEmailError(true);
      setEmailErrorMessage('Please enter a valid email.');
      emailCheckBool = true;
    } else {
      setEmailError(false);
    }

    // If everything is correct, go to the next step
    if (!emailCheckBool) {
      sendVerificationEmail(email);
      incrementStep();
    }
  };

  return (
    <div>
      <div className="h-7/12 mx-1 w-full max-w-md rounded-xl bg-bunker py-8 drop-shadow-xl md:px-6">
        <p className="flex justify-center text-4xl font-semibold text-primary">
          {t('signup.step1-start')}
        </p>
        <div className="m-auto mt-4 flex max-h-24 w-5/6 items-center justify-center rounded-lg md:w-full md:p-2">
          <InputField
            label={t('common.email') ?? ''}
            onChangeHandler={setEmail}
            type="email"
            value={email}
            placeholder=""
            isRequired
            error={emailError}
            errorText={emailErrorMessage}
            autoComplete="username"
          />
        </div>
        <div className="mx-auto mt-4 flex max-h-28 w-5/6 max-w-xs flex-col items-center justify-center text-center text-sm md:mt-4 md:w-full md:max-w-md md:p-2 md:text-left">
          <p className="mt-2 text-gray-400 md:mx-0.5">{t('signup.step1-privacy')}</p>
          <div className="text-l m-2 mt-6 px-8 py-1 text-lg md:m-8">
            <Button
              text={t('signup.step1-submit') ?? ''}
              type="submit"
              onButtonPressed={emailCheck}
              size="lg"
            />
          </div>
        </div>
      </div>
      <div className="mx-auto mb-48 mt-2 flex w-full max-w-md flex-col items-center justify-center pt-2 md:mb-16 md:pb-2">
        <Link href="/login">
          <button type="button" className="w-max pb-3 duration-200 hover:opacity-90">
            <u className="text-sm font-normal text-primary-500">
              {t('signup.already-have-account')}
            </u>
          </button>
        </Link>
      </div>
    </div>
  );
}
