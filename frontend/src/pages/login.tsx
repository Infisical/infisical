import { useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import ListBox from '@app/components/basic/Listbox';
import InitialLoginStep from '@app/components/login/InitialLoginStep';
import LoginStep from '@app/components/login/LoginStep';
import MFAStep from '@app/components/login/MFAStep';
import PasswordInputStep from '@app/components/login/PasswordInputStep';
import { getTranslatedStaticProps } from '@app/components/utilities/withTranslateProps';
import { useProviderAuth } from '@app/hooks/useProviderAuth';
import { isLoggedIn } from '@app/reactQuery';

import getWorkspaces from './api/workspace/getWorkspaces';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(1);
  const { t } = useTranslation();
  const lang = router.locale ?? 'en';
  const [isLoginWithEmail, setIsLoginWithEmail] = useState(false);
  const {
    providerAuthToken,
    email: providerEmail,
    setProviderAuthToken,
    isProviderUserCompleted,
  } = useProviderAuth();

  if (providerAuthToken && isProviderUserCompleted === false) {
    router.push('/signup');
  }

  const setLanguage = async (to: string) => {
    router.push('/login', '/login', { locale: to });
    localStorage.setItem('lang', to);
  };

  useEffect(() => {
    // TODO(akhilmhdh): workspace will be controlled by a workspace context
    const redirectToDashboard = async () => {
      let userWorkspace;
      try {
        const userWorkspaces = await getWorkspaces();
        userWorkspace = userWorkspaces[0] && userWorkspaces[0]._id;
        router.push(`/dashboard/${userWorkspace}`);
      } catch (error) {
        console.log('Error - Not logged in yet');
      }
    };
    if (isLoggedIn()) {
      redirectToDashboard();
    }
  }, []);

  const renderView = (loginStep: number) => {

    if (providerAuthToken && step === 1) {
      return (
        <PasswordInputStep
          email={providerEmail}
          password={password}
          setPassword={setPassword}
          setProviderAuthToken={setProviderAuthToken}
          setStep={setStep}
        />
      )
    }

    if (isLoginWithEmail && loginStep === 1) {
      return (
        <LoginStep
          email={email}
          setEmail={setEmail}
          password={password}
          setPassword={setPassword}
          setStep={setStep}
        />
      )
    }

    if (!isLoginWithEmail && loginStep === 1) {
      return <InitialLoginStep setIsLoginWithEmail={setIsLoginWithEmail} />
    }

    if (step === 2) {
      <MFAStep
        email={email || providerEmail}
        password={password}
      />
    }

    return <div />
  }

  return (
    <div className="bg-gradient-to-tr from-bunker-600 to-bunker-800 h-screen flex flex-col justify-center pb-28 px-6 ">
      <Head>
        <title>{t('common:head-title', { title: t('login:title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t('login:og-title') ?? ''} />
        <meta name="og:description" content={t('login:og-description') ?? ''} />
      </Head>
      <div className="flex justify-center mb-4 mt-20">
        <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
      </div>
      {renderView(step)}
      <div className="absolute right-4 top-0 mt-4 flex items-center justify-center">
        <div className="w-48 mx-auto">
          <ListBox
            isSelected={lang}
            onChange={setLanguage}
            data={['en', 'ko', 'fr', 'pt-BR']}
            isFull
            text={`${t('common:language')}: `}
          />
        </div>
      </div>
    </div>
  );
}

export const getStaticProps = getTranslatedStaticProps(['auth', 'login', 'mfa']);
