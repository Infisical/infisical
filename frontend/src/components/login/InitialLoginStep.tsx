import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useRouter } from 'next/router';

import attemptLogin from '@app/components/utilities/attemptLogin';

import Error from '../basic/Error';
// import { faGoogle } from '@fortawesome/free-brands-svg-icons';
// import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Input } from '../v2';

export default function InitialLoginStep({
    setStep,
    email,
    setEmail,
    password,
    setPassword,
}: {
    setStep: (step: number) => void;
    email: string;
    setEmail: (email: string) => void;
    password: string;
    setPassword: (password: string) => void;
}) {

    const router = useRouter();
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState(false);

    const handleLogin = async () => {
        try {
          if (!email || !password) {
            return;
          }
    
          setIsLoading(true);
          const isLoginSuccessful = await attemptLogin({
            email,
            password,
          });
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
    }

    return <div className='flex flex-col mx-auto w-full justify-center items-center'>
        <h1 className='text-xl font-medium text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 text-center mb-8' >Login to Infisical</h1>
        {/* <div className='lg:w-1/6 w-1/4 min-w-[20rem] rounded-md'>
            <Button
                colorSchema="primary" 
                variant="solid"
                onClick={() => {
                    window.open('/api/v1/auth/redirect/google')
                }} 
                leftIcon={<FontAwesomeIcon icon={faGoogle} className="mr-1" />}
                className="h-14 w-full mx-0"
            > 
                {t('login.continue-with-google')}
            </Button>
        </div> */}
        <div className="relative md:px-1.5 flex items-center justify-center lg:w-1/6 w-1/4 min-w-[20rem] md:min-w-[22rem] mx-auto w-full rounded-lg max-h-24 md:max-h-28">
            <div className="flex items-center justify-center w-full md:px-2 md:py-1 rounded-lg max-h-24 md:max-h-28">
                <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="Enter your email..."
                    isRequired
                    autoComplete="username"
                    className="h-12"
                />
            </div>
        </div>
        <div className="relative pt-2 md:pt-0 md:px-1.5 flex items-center justify-center lg:w-1/6 w-1/4 min-w-[20rem] md:min-w-[22rem] mx-auto w-full rounded-lg max-h-24 md:max-h-28">
          <div className="flex items-center justify-center w-full md:p-2 rounded-lg max-h-24 md:max-h-28">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Enter your password..."
              isRequired
              autoComplete="current-password"
              id="current-password"
              className="h-12 select:-webkit-autofill:focus"
            />
          </div>
        </div>
        {!isLoading && loginError && <Error text={t('login.error-login') ?? ''} />}
        <div className='lg:w-1/6 w-1/4 min-w-[21.2rem] md:min-w-[20.1rem] text-center rounded-md mt-4'>
            <Button
                onClick={async () => handleLogin()}
                size="sm"
                isFullWidth
                className='h-12'
                colorSchema="primary"
                variant="solid"
                isLoading={isLoading}
            > Login </Button>
        </div>
        <div className='lg:w-1/6 w-1/4 min-w-[20rem] flex flex-row items-center mt-4 py-2'>
            <div className='w-1/2 border-t border-mineshaft-500'/>
            <span className='px-4 text-sm text-bunker-400'>or</span>
            <div className='w-1/2 border-t border-mineshaft-500'/>
        </div>
        <div className='lg:w-1/6 w-1/4 min-w-[20rem] text-center rounded-md mt-4'>
            <Button
                colorSchema="primary" 
                variant="outline_bg"
                onClick={() => router.push("/saml-sso")} 
                isFullWidth
                className="h-14 w-full mx-0"
            > 
                Continue with SAML SSO
            </Button>
        </div>
        <div className="mt-6 text-bunker-400 text-sm flex flex-row">
            <span className="mr-1">Don&apos;t have an acount yet?</span>
            <Link href="/signup">
                <span className='hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>{t('login.create-account')}</span>
            </Link>
        </div>
    </div>
}
