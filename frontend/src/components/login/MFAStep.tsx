/* eslint-disable react/jsx-props-no-spreading */
import React, { useState } from 'react';
import ReactCodeInput from 'react-code-input';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/router';

import attemptLoginMfa from '@app/components/utilities/attemptLoginMfa';
import { useSendMfaToken } from '@app/hooks/api/auth';

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

interface VerifyMfaTokenError {
  response: {
    data: {
      context: {
        code: string;
        triesLeft: number;
      };
    };
    status: number;
  };
}

/**
 * 2nd step of login - users enter their MFA code
 * @param {Object} obj
 * @param {String} obj.email - email of user
 * @param {String} obj.password - password of user
 * @param {Function} obj.setStep - function to set the login flow step
 * @returns
 */
export default function MFAStep({
  email,
  password
}: {
  email: string;
  password: string;
}): JSX.Element {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);

  const { t } = useTranslation();

  const sendMfaToken = useSendMfaToken();

  const handleLoginMfa = async () => {
    try {
      if (mfaCode.length !== 6) {
        return;
      }

      setIsLoading(true);
      const isLoginSuccessful = await attemptLoginMfa({
        email,
        password,
        mfaToken: mfaCode
      });

      if (isLoginSuccessful) {
        setIsLoading(false);
        router.push(`/dashboard/${localStorage.getItem('projectData.id')}`);
      }
    } catch (err) {
      const error = err as VerifyMfaTokenError;

      if (error?.response?.status === 500) {
        window.location.reload();
      } else if (error?.response?.data?.context?.triesLeft) {
        setTriesLeft(error?.response?.data?.context?.triesLeft);
        if (error.response.data.context.triesLeft === 0) {
          window.location.reload();
        }
      }

      setIsLoading(false);
    }
  };

  const handleResendMfaCode = async () => {
    try {
      setIsLoadingResend(true);
      await sendMfaToken.mutateAsync({ email });
      setIsLoadingResend(false);
    } catch (err) {
      console.error(err);
      setIsLoadingResend(false);
    }
  };

  return (
    <form className="h-7/12 mx-auto mb-64 w-max rounded-xl bg-bunker px-8 pt-10 pb-4 drop-shadow-xl md:mb-16">
      <p className="text-l flex justify-center text-bunker-300">{t('mfa.step2-message')}</p>
      <p className="text-l my-2 flex justify-center font-semibold text-bunker-300">{email} </p>
      <div className="hidden md:block">
        <ReactCodeInput
          name=""
          inputMode="tel"
          type="text"
          fields={6}
          onChange={setMfaCode}
          {...props}
          className="mt-6 mb-2"
        />
      </div>
      {typeof triesLeft === 'number' && (
        <Error text={`${t('mfa.step2-code-error')} ${triesLeft}`} />
      )}
      <div className="min-w-28 mx-auto mt-4 mb-2 flex max-h-24 max-w-max flex-col items-center justify-center px-4 text-lg md:p-2">
        <Button text={t('mfa.verify') ?? ''} onButtonPressed={() => handleLoginMfa()} size="lg" />
      </div>
      <div className="mx-auto flex max-h-24 w-full max-w-md flex-col items-center justify-center pt-2">
        <div className="flex flex-row items-baseline gap-1 text-sm">
          <span className="text-bunker-400">{t('mfa.step2-resend-alert')}</span>
          <u
            className={`font-normal ${
              isLoadingResend
                ? 'text-bunker-400'
                : 'text-primary-700 duration-200 hover:text-primary'
            }`}
          >
            <button disabled={isLoading} onClick={() => handleResendMfaCode()} type="button">
              {isLoadingResend ? t('mfa.step2-resend-progress') : t('mfa.step2-resend-submit')}
            </button>
          </u>
        </div>
        <p className="pb-2 text-sm text-bunker-400">{t('mfa.step2-spam-alert')}</p>
      </div>
    </form>
  );
}
