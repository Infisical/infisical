import React, { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';

import Button from '~/components/basic/buttons/Button';
import InputField from '~/components/basic/InputField';

import SendEmailOnPasswordReset from './api/auth/SendEmailOnPasswordReset';

export default function VerifyEmail() {
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(1);

  /**
   * This function sends the verification email and forwards a user to the next step.
   */
  const sendVerificationEmail = async () => {
    if (email) {
      await SendEmailOnPasswordReset({ email });
      setStep(2);
    }
  };

  return (
    <div className="bg-bunker-800 h-screen flex flex-col justify-start px-6">
      <Head>
        <title>Login</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Log In to Infisical" />
        <meta
          name="og:description"
          content="Infisical a simple end-to-end encrypted platform that enables teams to sync and manage their .env files."
        />
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
      {step == 1 && (
        <div className="bg-bunker w-full max-w-md mx-auto h-7/12 py-4 pt-8 px-6 rounded-xl drop-shadow-xl">
          <p className="text-2xl md:text-3xl w-max mx-auto flex justify-center font-semibold text-bunker-100 mb-6">
            Forgot your password?
          </p>
          <div className="flex flex-row items-center justify-center md:pb-4 mt-4 md:mx-2">
            <p className="text-sm flex justify-center text-gray-400 w-max">
              You will need your emergency kit. Enter your email to start
              account recovery.
            </p>
          </div>
          <div className="flex items-center justify-center w-full md:p-2 rounded-lg mt-4 md:mt-0 max-h-24 md:max-h-28">
            <InputField
              label="Email"
              onChangeHandler={setEmail}
              type="email"
              value={email}
              placeholder=""
              isRequired
              autoComplete="username"
            />
          </div>
          <div className="flex flex-col items-center justify-center w-full md:p-2 max-h-20 max-w-md mt-4 mx-auto text-sm">
            <div className="text-l mt-6 m-8 px-8 py-3 text-lg">
              <Button
                text="Continue"
                onButtonPressed={sendVerificationEmail}
                size="lg"
              />
            </div>
          </div>
        </div>
      )}
      {step == 2 && (
        <div className="bg-bunker w-full max-w-md mx-auto h-7/12 py-4 pt-8 px-6 rounded-xl drop-shadow-xl">
          <p className="text-xl md:text-2xl w-max mx-auto flex justify-center font-semibold text-bunker-100 mb-6">
            Look for an email in your inbox.
          </p>
          <div className="flex flex-row items-center justify-center md:pb-4 mt-4 md:mx-2">
            <p className="text-sm flex justify-center text-gray-400 w-max text-center">
              An email with instructions has been sent to {email}.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
