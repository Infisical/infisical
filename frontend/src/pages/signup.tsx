/* eslint-disable no-nested-ternary */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import CodeInputStep from '@app/components/signup/CodeInputStep';
import DownloadBackupPDF from '@app/components/signup/DonwloadBackupPDFStep';
import EnterEmailStep from '@app/components/signup/EnterEmailStep';
import TeamInviteStep from '@app/components/signup/TeamInviteStep';
import UserInfoStep from '@app/components/signup/UserInfoStep';
import SecurityClient from '@app/components/utilities/SecurityClient';
import { useFetchServerStatus } from '@app/hooks/api/serverDetails';

import checkEmailVerificationCode from './api/auth/CheckEmailVerificationCode';
import getWorkspaces from './api/workspace/getWorkspaces';

/**
 * @returns the signup page
 */
export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('123456');
  const [codeError, setCodeError] = useState(false);
  const [step, setStep] = useState(1);
  const router = useRouter();
  const { data: serverDetails } = useFetchServerStatus();

  const { t } = useTranslation();

  useEffect(() => {
    const tryAuth = async () => {
      try {
        const userWorkspaces = await getWorkspaces();
        router.push(`/dashboard/${userWorkspaces[0]._id}`);
      } catch (error) {
        console.log('Error - Not logged in yet');
      }
    };
    tryAuth();
  }, []);

  /**
   * Goes to the following step (out of 5) of the signup process.
   * Step 1 is submitting your email
   * Step 2 is Verifying your email with the code that you received
   * Step 3 is asking the final info.
   * Step 4 is downloading a backup pdf
   * Step 5 is inviting users
   */
  const incrementStep = async () => {
    if (step === 1 || step === 3 || step === 4) {
      setStep(step + 1);
    } else if (step === 2) {
      // Checking if the code matches the email.
      const response = await checkEmailVerificationCode({ email, code });
      if (response.status === 200) {
        const { token } = await response.json();
        SecurityClient.setSignupToken(token);
        setStep(3);
      } else {
        setCodeError(true);
      }
    }
  };

  // when email service is not configured, skip step 2 and 5
  useEffect(() => {
    if (!serverDetails?.emailConfigured && step === 2) {
      incrementStep();
    }

    if (!serverDetails?.emailConfigured && step === 5) {
      getWorkspaces().then((userWorkspaces) => {
        router.push(`/dashboard/${userWorkspaces[0]._id}`);
      });
    }
  }, [step]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-bunker-800">
      <Head>
        <title>{t('common.head-title', { title: t('signup.title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t('signup.og-title') as string} />
        <meta name="og:description" content={t('signup.og-description') as string} />
      </Head>
      <div className="flex flex-col items-center justify-center">
        <Link href="/">
          <div className="mb-2 flex cursor-pointer justify-center md:mb-8">
            <Image src="/images/biglogo.png" height={90} width={120} alt="Infisical Wide Logo" />
          </div>
        </Link>
        <form onSubmit={(e) => e.preventDefault()}>
          {step === 1 ? (
            <EnterEmailStep email={email} setEmail={setEmail} incrementStep={incrementStep} />
          ) : step === 2 ? (
            <CodeInputStep
              email={email}
              incrementStep={incrementStep}
              setCode={setCode}
              codeError={codeError}
            />
          ) : step === 3 ? (
            <UserInfoStep
              incrementStep={incrementStep}
              email={email}
              password={password}
              setPassword={setPassword}
              firstName={firstName}
              setFirstName={setFirstName}
              lastName={lastName}
              setLastName={setLastName}
            />
          ) : step === 4 ? (
            <DownloadBackupPDF
              incrementStep={incrementStep}
              email={email}
              password={password}
              name={`${firstName} ${lastName}`}
            />
          ) : serverDetails?.emailConfigured ? (
            <TeamInviteStep />
          ) : (
            ''
          )}
        </form>
      </div>
    </div>
  );
}
