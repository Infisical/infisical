import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

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
      <div className="bg-bunker w-full max-w-md h-7/12 py-8 md:px-6 mx-auto rounded-xl drop-shadow-xl">
        <p className="text-4xl font-semibold flex justify-center text-primary">
          {t('signup:step1-start')}
        </p>
        <div className="flex items-center justify-center w-5/6 md:w-full m-auto md:p-2 rounded-lg max-h-24 mt-4">
          <InputField
            label={t('common:email') ?? ''}
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
        <div className="flex flex-col items-center justify-center w-5/6 md:w-full md:p-2 max-h-28 max-w-xs md:max-w-md mx-auto mt-4 md:mt-4 text-sm text-center md:text-left">
          <p className="text-gray-400 mt-2 md:mx-0.5">{t('signup:step1-privacy')}</p>
          <div className="text-l mt-6 m-2 md:m-8 px-8 py-1 text-lg">
            <Button
              text={t('signup:step1-submit') ?? ''}
              type="submit"
              onButtonPressed={emailCheck}
              size="lg"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center w-full md:pb-2 max-w-md mx-auto pt-2 mb-48 md:mb-16 mt-2">
        <Link href="/login">
          <button type="button" className="w-max pb-3 hover:opacity-90 duration-200">
            <u className="font-normal text-sm text-primary-500">
              {t('signup:already-have-account')}
            </u>
          </button>
        </Link>
      </div>
    </div>
  );
}
