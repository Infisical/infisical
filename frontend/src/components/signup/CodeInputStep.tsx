/* eslint-disable react/jsx-props-no-spreading */
import React, { useState } from 'react';
import ReactCodeInput from 'react-code-input';
import { useTranslation } from 'react-i18next';

import sendVerificationEmail from '@app/pages/api/auth/SendVerificationEmail';

import Button from '../basic/buttons/Button';
import Error from '../basic/Error';

// The style for the verification code input
const props = {
  inputStyle: {
    fontFamily: 'monospace',
    margin: '4px',
    MozAppearance: 'textfield',
    width: '55px',
    borderRadius: '5px',
    fontSize: '24px',
    height: '55px',
    paddingLeft: '7',
    backgroundColor: '#0d1117',
    color: 'white',
    border: '1px solid #2d2f33',
    textAlign: 'center',
    outlineColor: '#8ca542',
    borderColor: '#2d2f33'
  }
} as const;
const propsPhone = {
  inputStyle: {
    fontFamily: 'monospace',
    margin: '4px',
    MozAppearance: 'textfield',
    width: '40px',
    borderRadius: '5px',
    fontSize: '24px',
    height: '40px',
    paddingLeft: '7',
    backgroundColor: '#0d1117',
    color: 'white',
    border: '1px solid #2d2f33',
    textAlign: 'center',
    outlineColor: '#8ca542',
    borderColor: '#2d2f33'
  }
} as const;

interface CodeInputStepProps {
  email: string;
  incrementStep: () => void;
  setCode: (value: string) => void;
  codeError: boolean;
}

/**
 * This is the second step of sign up where users need to verify their email
 * @param {object} obj
 * @param {string} obj.email - user's email to which we just sent a verification email
 * @param {function} obj.incrementStep - goes to the next step of signup
 * @param {function} obj.setCode - state updating function that set the current value of the emai verification code
 * @param {boolean} obj.codeError - whether the code was inputted wrong or now
 * @returns
 */
export default function CodeInputStep({
  email,
  incrementStep,
  setCode,
  codeError
}: CodeInputStepProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [isResendingVerificationEmail, setIsResendingVerificationEmail] = useState(false);
  const { t } = useTranslation();

  const resendVerificationEmail = async () => {
    setIsResendingVerificationEmail(true);
    setIsLoading(true);
    sendVerificationEmail(email);
    setTimeout(() => {
      setIsLoading(false);
      setIsResendingVerificationEmail(false);
    }, 2000);
  };

  return (
    <div className="h-7/12 mx-auto mb-64 w-max rounded-xl bg-bunker px-8 pt-10 pb-4 drop-shadow-xl md:mb-16">
      <p className="text-l flex justify-center text-bunker-300">{t('signup.step2-message')}</p>
      <p className="text-l my-2 flex justify-center font-semibold text-bunker-300">{email} </p>
      <div className="hidden md:block">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...props}
          className="mt-6 mb-2"
        />
      </div>
      <div className="block md:hidden">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setCode}
          {...propsPhone}
          className="mt-2 mb-6"
        />
      </div>
      {codeError && <Error text={t('signup.step2-code-error')} />}
      <div className="min-w-28 mx-auto mt-4 mb-2 flex max-h-24 max-w-max flex-col items-center justify-center px-4 text-lg md:p-2">
        <Button text={t('signup.verify') ?? ''} onButtonPressed={incrementStep} size="lg" />
      </div>
      <div className="mx-auto flex max-h-24 w-full max-w-md flex-col items-center justify-center pt-2">
        <div className="flex flex-row items-baseline gap-1 text-sm">
          <span className="text-bunker-400">{t('signup.step2-resend-alert')}</span>
          <u
            className={`font-normal ${
              isResendingVerificationEmail
                ? 'text-bunker-400'
                : 'text-primary-700 duration-200 hover:text-primary'
            }`}
          >
            <button disabled={isLoading} onClick={resendVerificationEmail} type="button">
              {isResendingVerificationEmail
                ? t('signup.step2-resend-progress')
                : t('signup.step2-resend-submit')}
            </button>
          </u>
        </div>
        <p className="pb-2 text-sm text-bunker-400">{t('signup.step2-spam-alert')}</p>
      </div>
    </div>
  );
}
