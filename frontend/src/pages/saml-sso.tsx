import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { Button, Input } from '@app/components/v2';
import { isLoggedIn } from '@app/reactQuery';

import getWorkspaces from './api/workspace/getWorkspaces';

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const { t } = useTranslation();

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

  return (
    <div className="flex h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28 ">
      <Head>
        <title>{t('common.head-title', { title: t('login.title') })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t('login.og-title') ?? ''} />
        <meta name="og:description" content={t('login.og-description') ?? ''} />
      </Head>
      <Link href="/">
        <div className="mb-4 mt-20 flex justify-center">
          <Image src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
        </div>
      </Link>
      <div className="mx-auto w-full max-w-md px-6">
        <p className="mx-auto mb-6 flex w-max justify-center text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8">
          What’s your email?
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
        <div className='lg:w-1/6 w-1/4 w-full mx-auto flex items-center justify-center min-w-[22rem] text-center rounded-md mt-4'>
          <Button
              colorSchema="primary" 
              variant="outline_bg"
              onClick={() => {}} 
              isFullWidth
              className="h-14"
          > 
              {t('login.login')} 
          </Button>
        </div>
        <div className="flex flex-row items-center justify-center mt-4">
          <button
            onClick={() => {router.push('/login')}}
            type="button"
            className="text-bunker-300 text-sm hover:underline mt-2 hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer"
          >
            {t('login.other-option')}
          </button>
        </div>
      </div>
    </div>
  );
}
