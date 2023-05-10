import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { faWarning } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import Error from '@app/components/basic/Error';
import attemptLogin from '@app/components/utilities/attemptLogin';
import { getTranslatedStaticProps } from '@app/components/utilities/withTranslateProps';

import { Button, Input } from '../v2';

/**
 * 1st step of login - user enters their username and password
 * @param {Object} obj
 * @param {String} obj.email - email of user
 * @param {Function} obj.setEmail - function to set the email of user
 * @param {String} obj.password - password of user
 * @param {String} obj.setPassword - function to set the password of user
 * @param {Function} obj.setStep - function to set the login flow step
 * @returns
 */
export default function LoginStep ({
    email,
    setEmail,
    password,
    setPassword,
    setStep
}: {
    email: string;
    setEmail: (email: string) => void;
    password: string;
    setPassword: (password: string) => void;
    setStep: (step: number) => void;
}) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [loginError, setLoginError] = useState(false);

    const { t } = useTranslation();

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

    return (
        <form onSubmit={(e) => e.preventDefault()}>
            <div className="w-full mx-auto h-full px-6">
                <p className="text-xl w-max mx-auto flex justify-center text-transparent bg-clip-text bg-gradient-to-b from-white to-bunker-200 mb-6">
                    Enter your email and password
                </p>
                <div className="flex items-center justify-center lg:w-1/6 w-1/4 min-w-[22rem] mx-auto w-full md:p-2 rounded-lg mt-4 md:mt-0 max-h-24 md:max-h-28">
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
                <div className="relative flex items-center justify-center lg:w-1/6 w-1/4 min-w-[22rem] mx-auto w-full rounded-lg max-h-24 md:max-h-28">
                    <div className="flex items-center justify-center w-full md:p-2 rounded-lg max-h-24 md:max-h-28">
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
                {!isLoading && loginError && <Error text={t('login:error-login') ?? ''} />}
                <div className="flex flex-col items-center justify-center lg:w-1/6 w-1/4 min-w-[22rem] px-2 mt-4 max-w-xs md:max-w-md mx-auto text-sm text-center md:text-left">
                    <div className="text-l py-1 text-lg w-full">
                        <Button
                            onClick={async () => handleLogin()}
                            size="sm"
                            isFullWidth
                            className='h-14'
                            colorSchema="primary" 
                            variant="outline_bg"
                            isLoading={isLoading}
                        > {String(t('login:login'))} </Button>
                    </div>
                </div>
            </div>
            <div className="text-bunker-400 text-sm flex flex-row w-max mx-auto">
                <Link href="/verify-email">
                    <span className='hover:underline hover:underline-offset-4 hover:decoration-primary-700 hover:text-bunker-200 duration-200 cursor-pointer'>{t('login:forgot-password')}</span>
                </Link>
            </div>
            {false && (
            <div className="w-full p-2 flex flex-row items-center bg-white/10 text-gray-300 rounded-md max-w-md mx-auto mt-4">
                <FontAwesomeIcon icon={faWarning} className="ml-2 mr-6 text-6xl" />
                {t('common:maintenance-alert')}
            </div>
            )}
        </form>
    );
}

export const getStaticProps = getTranslatedStaticProps(['auth', 'login']);