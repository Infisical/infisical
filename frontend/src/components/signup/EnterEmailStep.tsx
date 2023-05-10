import React, { useState } from 'react';
import { useTranslation } from 'next-i18next';

import sendVerificationEmail from '@app/pages/api/auth/SendVerificationEmail';

import { Button, Input } from '../v2';

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
  const { t } = useTranslation();

  /**
   * Verifies if the entered email "looks" correct
   */
  const emailCheck = () => {
    let emailCheckBool = false;
    if (!email) {
      setEmailError(true);
      emailCheckBool = true;
    } else if (!email.includes('@') || !email.includes('.') || !/[a-z]/.test(email)) {
      setEmailError(true);
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
      <div className="w-full md:px-6 mx-auto">
        <p className="text-xl font-medium flex justify-center text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200">
          {t('signup:initial-title')}
        </p>
        <div className="flex flex-col items-center justify-center lg:w-1/6 w-1/4 min-w-[20rem] m-auto rounded-lg mt-8">
          <Input
            placeholder="Enter your email address..."
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            isRequired
            // error={emailError}
            // errorText={emailErrorMessage}
            autoComplete="username"
            className="h-12"
          />
          {emailError && <p className="text-red-600 text-xs text-left w-full ml-1.5 mt-1.5">Please enter a valid email.</p>}
        </div>
        <div className="flex flex-col items-center justify-center lg:w-1/6 w-1/4 min-w-[20rem] mt-2 max-w-xs md:max-w-md mx-auto text-sm text-center md:text-left">
          <div className="text-l py-1 text-lg w-full">
            <Button
              onClick={emailCheck}
              size="sm"
              isFullWidth
              className='h-14'
              colorSchema="primary" 
              variant="outline_bg"
            > {String(t('signup:step1-submit'))} </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
